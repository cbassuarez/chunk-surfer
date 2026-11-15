//! Native, finite van arrival and a persistent ear alternate. The native
//! preference is shared with the closed-app Dock plug-in, outside run saves.
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

static LAUNCH_EPOCH: OnceLock<Instant> = OnceLock::new();
static READY_AT: Mutex<Option<f64>> = Mutex::new(None);
const MOTION_VERSION: &str = "albion-maneuver-1";

fn launch_elapsed() -> f64 {
    LAUNCH_EPOCH.get_or_init(Instant::now).elapsed().as_secs_f64()
}

// AppKit and the webview sample the same process-local monotonic epoch.
#[cfg(target_os = "macos")]
#[no_mangle]
pub extern "C" fn chunk_surfer_launch_elapsed_seconds() -> f64 {
    launch_elapsed()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAnimationState {
    motion_version: &'static str,
    elapsed: f64,
    ready_at: Option<f64>,
}

#[tauri::command]
pub fn chunk_launch_animation_state() -> LaunchAnimationState {
    let ready_at = *READY_AT.lock().unwrap_or_else(|e| e.into_inner());
    LaunchAnimationState {
        motion_version: MOTION_VERSION,
        elapsed: launch_elapsed(),
        ready_at,
    }
}

#[tauri::command]
pub fn chunk_launch_animation_ready() -> LaunchAnimationState {
    READY_AT.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(launch_elapsed);
    chunk_launch_animation_state()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppIconChoice {
    Van,
    Ear,
}

impl AppIconChoice {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "van" => Ok(Self::Van),
            "ear" => Ok(Self::Ear),
            _ => Err("Unknown app icon. Choose van or ear.".into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppIconStatus {
    pub supported: bool,
    pub choice: AppIconChoice,
}

#[cfg(target_os = "macos")]
extern "C" {
    fn chunk_surfer_install_dock_assembly(
        van: *const u8,
        van_length: usize,
        ear: *const u8,
        ear_length: usize,
        atlas: *const u8,
        atlas_length: usize,
    );
    fn chunk_surfer_app_icon_choice() -> i32;
    fn chunk_surfer_set_app_icon(choice: i32) -> i32;
}

#[cfg(target_os = "macos")]
pub fn install() {
    LAUNCH_EPOCH.get_or_init(Instant::now);
    static VAN: &[u8] = include_bytes!("../macos/DockTile/DockTile.icns");
    static EAR: &[u8] = include_bytes!("../macos/DockTile/Ear.icns");
    static ATLAS: &[u8] = include_bytes!("../macos/DockTile/VanLaunch.png");
    // Setup runs on the AppKit main thread. The helper safely dispatches if a
    // caller later invokes it elsewhere, and repeated setup never replays.
    unsafe {
        chunk_surfer_install_dock_assembly(
            VAN.as_ptr(),
            VAN.len(),
            EAR.as_ptr(),
            EAR.len(),
            ATLAS.as_ptr(),
            ATLAS.len(),
        )
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install() { LAUNCH_EPOCH.get_or_init(Instant::now); }

#[tauri::command]
pub fn chunk_app_icon_status() -> AppIconStatus {
    #[cfg(target_os = "macos")]
    let choice = if unsafe { chunk_surfer_app_icon_choice() } == 1 {
        AppIconChoice::Ear
    } else {
        AppIconChoice::Van
    };
    #[cfg(not(target_os = "macos"))]
    let choice = AppIconChoice::Van;
    AppIconStatus {
        supported: cfg!(target_os = "macos"),
        choice,
    }
}

#[tauri::command]
pub fn chunk_set_app_icon(choice: String) -> Result<AppIconStatus, String> {
    let choice = AppIconChoice::parse(&choice)?;
    #[cfg(target_os = "macos")]
    {
        let selected =
            unsafe { chunk_surfer_set_app_icon(if choice == AppIconChoice::Ear { 1 } else { 0 }) };
        if selected == 0 {
            return Err("The app icon is not ready. Try again after startup.".into());
        }
        Ok(chunk_app_icon_status())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = choice;
        Err("Alternate app icons are available in the macOS Dock.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::AppIconChoice;
    #[test]
    fn launch_clock_is_monotonic_and_readiness_is_idempotent() {
        let before = super::chunk_launch_animation_state();
        let ready = super::chunk_launch_animation_ready();
        let again = super::chunk_launch_animation_ready();
        assert_eq!(before.motion_version, "albion-maneuver-1");
        assert!(ready.elapsed >= before.elapsed);
        assert!(again.elapsed >= ready.elapsed);
        assert_eq!(ready.ready_at, again.ready_at);
        assert!(ready.ready_at.unwrap() <= ready.elapsed);
    }
    #[test]
    fn only_the_two_bundled_choices_can_be_selected() {
        assert_eq!(AppIconChoice::parse("van"), Ok(AppIconChoice::Van));
        assert_eq!(AppIconChoice::parse("ear"), Ok(AppIconChoice::Ear));
        for value in ["", "Ear", "VAN", "../ear", "van\0ear", " ear", "other"] {
            assert!(AppIconChoice::parse(value).is_err(), "{value:?}");
        }
    }
}
