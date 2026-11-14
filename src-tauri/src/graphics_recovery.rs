//! Bounded graphics recovery. Nothing here clears game data or guesses that a
//! slow startup has failed; the opening guard reports explicit failures.
use crate::graphics_recovery_policy::{
    next_mode, parse_attempts, recovery_modes, GraphicsMode, Platform,
};
use serde::{Deserialize, Serialize};
use std::{env, ffi::OsString, fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_log::log;

const MODE_ENV: &str = "CHUNK_SURFER_GRAPHICS_MODE";
const ATTEMPTS_ENV: &str = "CHUNK_SURFER_GRAPHICS_ATTEMPTS";
const IDENTIFIER: &str = "com.cbassuarez.chunksurfer";
const WEBVIEW_ARGS: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
const ANGLE_BACKEND: &str = "CHUNK_SURFER_ANGLE_BACKEND";
const DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
const GDK: &str = "GDK_BACKEND";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicsRecoveryInfo {
    platform: String,
    mode: String,
    can_recover: bool,
    restarting: bool,
    explicit_override: bool,
}

#[derive(Deserialize, Serialize)]
struct Cache {
    version: String,
    platform: String,
    mode: String,
}

struct Recovery {
    platform: Platform,
    mode: GraphicsMode,
    candidates: Vec<GraphicsMode>,
    attempted: Vec<GraphicsMode>,
    original: Vec<(&'static str, Option<OsString>)>,
    cache_path: Option<PathBuf>,
    explicit_override: bool,
    blocked: bool,
    ready: bool,
    restarting: bool,
}

pub struct GraphicsRecoveryState(Mutex<Recovery>);

fn platform_name(platform: Platform) -> &'static str {
    match platform {
        Platform::Windows => "windows",
        Platform::Linux => "linux",
        Platform::Other => "other",
    }
}

fn explicit_angle(arguments: &str) -> bool {
    arguments.split_whitespace().any(|token| {
        let token = token.trim_matches('"');
        token == "--use-angle" || token.starts_with("--use-angle=")
    })
}

fn windows_override(arguments: &str, requested: &str) -> bool {
    explicit_angle(arguments)
        || (!requested.trim().is_empty() && !requested.trim().eq_ignore_ascii_case("default"))
}

fn eligible_modes(
    platform: Platform,
    display: bool,
    dmabuf_explicit: bool,
    gdk_explicit: bool,
) -> Vec<GraphicsMode> {
    let mut modes = recovery_modes(platform, display, !gdk_explicit);
    if platform == Platform::Linux && dmabuf_explicit {
        modes.retain(|mode| *mode != GraphicsMode::NoDmabuf);
    }
    modes
}

fn cache_mode(
    cache: &Cache,
    platform: Platform,
    candidates: &[GraphicsMode],
) -> Option<GraphicsMode> {
    if cache.version != env!("CARGO_PKG_VERSION") || cache.platform != platform_name(platform) {
        return None;
    }
    GraphicsMode::parse(&cache.mode).filter(|mode| candidates.contains(mode))
}

fn selected_mode(
    blocked: bool,
    requested: &str,
    internal: Option<GraphicsMode>,
    cached: Option<GraphicsMode>,
    manual: bool,
    candidates: &[GraphicsMode],
) -> GraphicsMode {
    if blocked {
        return GraphicsMode::parse(requested).unwrap_or(GraphicsMode::Default);
    }
    internal
        .or_else(|| {
            if manual {
                candidates
                    .iter()
                    .copied()
                    .find(|mode| *mode != GraphicsMode::Default)
            } else {
                cached
            }
        })
        .unwrap_or(GraphicsMode::Default)
}

fn cache_path(platform: Platform) -> Option<PathBuf> {
    let absolute = |key| {
        env::var_os(key)
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
    };
    let base = match platform {
        Platform::Windows => absolute("LOCALAPPDATA"),
        Platform::Linux => {
            absolute("XDG_CACHE_HOME").or_else(|| absolute("HOME").map(|path| path.join(".cache")))
        }
        Platform::Other => None,
    }?;
    Some(base.join(IDENTIFIER).join("graphics-backend.json"))
}

impl Recovery {
    fn info(&self) -> GraphicsRecoveryInfo {
        GraphicsRecoveryInfo {
            platform: platform_name(self.platform).into(),
            mode: if self.blocked && self.mode == GraphicsMode::Default {
                "external"
            } else {
                self.mode.as_str()
            }
            .into(),
            can_recover: !self.blocked
                && !self.restarting
                && next_mode(self.mode, &self.attempted, &self.candidates).is_some(),
            restarting: self.restarting,
            explicit_override: self.explicit_override,
        }
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    fn original_value(&self, name: &str) -> Option<&OsString> {
        self.original
            .iter()
            .find(|(key, _)| *key == name)
            .and_then(|(_, value)| value.as_ref())
    }

    fn restore_environment(&self) {
        for (name, value) in &self.original {
            match value {
                Some(value) => env::set_var(name, value),
                None => env::remove_var(name),
            }
        }
    }

    fn apply_mode(&self) {
        if self.blocked {
            return;
        }
        #[cfg(target_os = "windows")]
        if matches!(self.mode, GraphicsMode::Vulkan | GraphicsMode::D3d11) {
            let existing = self
                .original_value(WEBVIEW_ARGS)
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if let Ok(Some(arguments)) =
                crate::graphics_backend::configured_browser_arguments(existing, self.mode.as_str())
            {
                env::set_var(WEBVIEW_ARGS, arguments);
            }
        }
        #[cfg(target_os = "linux")]
        {
            if matches!(self.mode, GraphicsMode::NoDmabuf | GraphicsMode::X11)
                && self.original_value(DMABUF).is_none()
            {
                env::set_var(DMABUF, "1");
            }
            if self.mode == GraphicsMode::X11 && self.original_value(GDK).is_none() {
                env::set_var(GDK, "x11");
            }
        }
    }

    fn invalidate_cache(&self) {
        if let Some(path) = &self.cache_path {
            if let Err(error) = fs::remove_file(path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    log::warn!("Could not retire graphics cache: {error}");
                }
            }
        }
    }

    fn save_cache(&self) {
        if self.explicit_override {
            return;
        }
        let Some(path) = &self.cache_path else {
            return;
        };
        let cache = Cache {
            version: env!("CARGO_PKG_VERSION").into(),
            platform: platform_name(self.platform).into(),
            mode: self.mode.as_str().into(),
        };
        let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
        let write = || -> Result<(), Box<dyn std::error::Error>> {
            fs::create_dir_all(path.parent().ok_or("graphics cache has no parent")?)?;
            fs::write(&temporary, serde_json::to_vec(&cache)?)?;
            fs::rename(&temporary, path)?;
            Ok(())
        };
        if let Err(error) = write() {
            let _ = fs::remove_file(temporary);
            log::warn!("Could not remember graphics backend: {error}");
        }
    }
}

impl GraphicsRecoveryState {
    pub fn begin_document(&self) {
        if let Ok(mut recovery) = self.0.lock() {
            if !recovery.restarting {
                recovery.ready = false;
            }
        }
    }

    /// Must run before creating Tauri/GTK/WebView2, so all game windows inherit
    /// the selected environment. Restart children receive restored originals.
    pub fn prepare() -> Self {
        let platform = if cfg!(target_os = "windows") {
            Platform::Windows
        } else if cfg!(target_os = "linux") {
            Platform::Linux
        } else {
            Platform::Other
        };
        let keys: &[&str] = match platform {
            Platform::Windows => &[WEBVIEW_ARGS, ANGLE_BACKEND],
            Platform::Linux => &[DMABUF, GDK],
            Platform::Other => &[],
        };
        let original = keys.iter().map(|name| (*name, env::var_os(name))).collect();
        let arguments = env::var(WEBVIEW_ARGS).unwrap_or_default();
        let requested = env::var(ANGLE_BACKEND).unwrap_or_default();
        // Invalid Unicode is also an explicit external choice, never something
        // to silently overwrite with our own arguments.
        let blocked = platform == Platform::Windows
            && (windows_override(&arguments, &requested)
                || env::var_os(WEBVIEW_ARGS).is_some_and(|value| value.to_str().is_none())
                || env::var_os(ANGLE_BACKEND).is_some_and(|value| value.to_str().is_none()));
        let explicit_override = blocked
            || (platform == Platform::Linux
                && (env::var_os(DMABUF).is_some() || env::var_os(GDK).is_some()));
        let candidates = eligible_modes(
            platform,
            env::var_os("DISPLAY").is_some_and(|value| !value.is_empty()),
            env::var_os(DMABUF).is_some(),
            env::var_os(GDK).is_some(),
        );
        let cache_path = cache_path(platform);
        let internal_mode = env::var(MODE_ENV)
            .ok()
            .and_then(|value| GraphicsMode::parse(&value))
            .filter(|mode| candidates.contains(mode));
        let cached_mode = if explicit_override {
            None
        } else {
            cache_path
                .as_ref()
                .and_then(|path| fs::read(path).ok())
                .and_then(|bytes| serde_json::from_slice::<Cache>(&bytes).ok())
                .and_then(|cache| cache_mode(&cache, platform, &candidates))
        };
        let manual = env::args_os().any(|argument| argument == "--graphics-recovery");
        let mode = selected_mode(
            blocked,
            &requested,
            internal_mode,
            cached_mode,
            manual,
            &candidates,
        );
        let mut attempted = if !blocked && internal_mode.is_some() {
            parse_attempts(&env::var(ATTEMPTS_ENV).unwrap_or_default())
        } else {
            vec![]
        };
        attempted.retain(|mode| candidates.contains(mode));
        if !attempted.contains(&mode) {
            attempted.push(mode);
        }
        let recovery = Recovery {
            platform,
            mode,
            candidates,
            attempted,
            original,
            cache_path,
            explicit_override,
            blocked,
            ready: false,
            restarting: false,
        };
        recovery.apply_mode();
        Self(Mutex::new(recovery))
    }
}

fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Graphics recovery is available only in the main game window".into())
    }
}

#[tauri::command]
pub fn chunk_graphics_info(
    window: WebviewWindow,
    state: State<'_, GraphicsRecoveryState>,
) -> Result<GraphicsRecoveryInfo, String> {
    require_main(&window)?;
    Ok(state
        .inner()
        .0
        .lock()
        .map_err(|_| "Graphics recovery state is unavailable")?
        .info())
}

#[tauri::command]
pub async fn chunk_graphics_recover(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, GraphicsRecoveryState>,
    reason: String,
    manual: bool,
) -> Result<GraphicsRecoveryInfo, String> {
    require_main(&window)?;
    let info = {
        let mut recovery = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Graphics recovery state is unavailable")?;
        log::error!(
            "Graphics startup failed: {} / {}: {}",
            platform_name(recovery.platform),
            recovery.mode.as_str(),
            reason.chars().take(1000).collect::<String>()
        );
        if recovery.restarting || recovery.blocked || (recovery.ready && !manual) {
            return Ok(recovery.info());
        }
        recovery.invalidate_cache();
        let Some(next) = next_mode(recovery.mode, &recovery.attempted, &recovery.candidates) else {
            return Ok(recovery.info());
        };
        log::warn!(
            "Graphics recovery {} -> {}: {}",
            recovery.mode.as_str(),
            next.as_str(),
            reason.chars().take(1000).collect::<String>()
        );
        recovery.attempted.push(next);
        recovery.restarting = true;
        // Do not let the next process misread our injected switches as a user
        // override. Preserve the attempt chain separately across this restart.
        recovery.restore_environment();
        env::set_var(MODE_ENV, next.as_str());
        env::set_var(
            ATTEMPTS_ENV,
            recovery
                .attempted
                .iter()
                .map(|mode| mode.as_str())
                .collect::<Vec<_>>()
                .join(","),
        );
        recovery.info()
    };
    app.request_restart();
    Ok(info)
}

#[tauri::command]
pub fn chunk_graphics_ready(
    window: WebviewWindow,
    state: State<'_, GraphicsRecoveryState>,
) -> Result<(), String> {
    require_main(&window)?;
    let mut recovery = state
        .inner()
        .0
        .lock()
        .map_err(|_| "Graphics recovery state is unavailable")?;
    if recovery.restarting || recovery.ready {
        return Ok(());
    }
    recovery.ready = true;
    env::remove_var(MODE_ENV);
    env::remove_var(ATTEMPTS_ENV);
    recovery.save_cache();
    log::info!(
        "Graphics startup ready: {} / {}",
        platform_name(recovery.platform),
        recovery.mode.as_str()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_windows_choices_are_not_overwritten() {
        for arguments in [
            "--use-angle=vulkan",
            "--use-angle d3d11",
            "\"--use-angle=gl\"",
        ] {
            assert!(windows_override(arguments, ""));
        }
        for requested in ["vulkan", " D3D11 ", "invalid-user-choice"] {
            assert!(windows_override("", requested));
        }
        for requested in ["", " default ", "DEFAULT"] {
            assert!(!windows_override("--enable-logging", requested));
        }
    }

    #[test]
    fn linux_explicit_environment_suppresses_only_affected_recovery_steps() {
        use GraphicsMode::*;
        assert_eq!(
            eligible_modes(Platform::Linux, true, true, false),
            [Default, X11]
        );
        assert_eq!(
            eligible_modes(Platform::Linux, true, false, true),
            [Default, NoDmabuf]
        );
        assert_eq!(eligible_modes(Platform::Linux, true, true, true), [Default]);
        assert_eq!(
            eligible_modes(Platform::Linux, false, false, false),
            [Default, NoDmabuf]
        );
    }

    #[test]
    fn cache_is_scoped_to_build_platform_and_current_display_options() {
        let mut cache = Cache {
            version: env!("CARGO_PKG_VERSION").into(),
            platform: "linux".into(),
            mode: "x11".into(),
        };
        let candidates = eligible_modes(Platform::Linux, true, false, false);
        assert_eq!(
            cache_mode(&cache, Platform::Linux, &candidates),
            Some(GraphicsMode::X11)
        );
        assert_eq!(cache_mode(&cache, Platform::Windows, &candidates), None);
        assert_eq!(
            cache_mode(&cache, Platform::Linux, &[GraphicsMode::Default]),
            None
        );
        cache.version = "older-release".into();
        assert_eq!(cache_mode(&cache, Platform::Linux, &candidates), None);
        cache.version = env!("CARGO_PKG_VERSION").into();
        cache.mode = "obsolete".into();
        assert_eq!(cache_mode(&cache, Platform::Linux, &candidates), None);
    }

    #[test]
    fn manual_cli_bypasses_cache_but_retry_markers_and_user_choices_win() {
        use GraphicsMode::*;
        let candidates = eligible_modes(Platform::Windows, false, false, false);
        assert_eq!(
            selected_mode(false, "", None, Some(D3d11), false, &candidates),
            D3d11
        );
        assert_eq!(
            selected_mode(false, "", None, Some(D3d11), true, &candidates),
            Vulkan
        );
        assert_eq!(
            selected_mode(false, "", Some(D3d11), Some(Vulkan), true, &candidates),
            D3d11
        );
        assert_eq!(
            selected_mode(true, "d3d11", Some(Vulkan), Some(Vulkan), true, &candidates),
            D3d11
        );
        assert_eq!(
            selected_mode(false, "", None, None, true, &[Default]),
            Default
        );
        let linux = eligible_modes(Platform::Linux, true, false, false);
        assert_eq!(
            selected_mode(false, "", None, Some(X11), true, &linux),
            NoDmabuf
        );
    }

    #[test]
    fn navigation_rechecks_readiness_without_resetting_the_retry_budget() {
        let state = GraphicsRecoveryState(Mutex::new(Recovery {
            platform: Platform::Windows,
            mode: GraphicsMode::Vulkan,
            candidates: recovery_modes(Platform::Windows, false, false),
            attempted: vec![GraphicsMode::Default, GraphicsMode::Vulkan],
            original: vec![],
            cache_path: None,
            explicit_override: false,
            blocked: false,
            ready: true,
            restarting: false,
        }));
        state.begin_document();
        {
            let mut recovery = state.0.lock().unwrap();
            assert!(!recovery.ready);
            assert_eq!(
                recovery.attempted,
                [GraphicsMode::Default, GraphicsMode::Vulkan]
            );
            assert_eq!(
                next_mode(recovery.mode, &recovery.attempted, &recovery.candidates),
                Some(GraphicsMode::D3d11)
            );
            recovery.ready = true;
            recovery.restarting = true;
        }
        state.begin_document();
        assert!(state.0.lock().unwrap().ready);
    }
}
