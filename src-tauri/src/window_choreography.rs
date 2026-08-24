use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const ECHO_LABELS: [&str; 3] = [
    "interference-echo-1",
    "interference-echo-2",
    "interference-echo-3",
];
const CHANNEL_LABELS: [&str; 4] = [
    "interference-monitor",
    "interference-echo-1",
    "interference-echo-2",
    "interference-echo-3",
];
const WATCHDOG_MS: u64 = 8_000;

#[derive(Debug, Clone)]
struct WindowSnapshot {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    fullscreen: bool,
    minimized: bool,
    always_on_top: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct RecoverySnapshot {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    fullscreen: bool,
    minimized: bool,
    always_on_top: bool,
}

impl From<&WindowSnapshot> for RecoverySnapshot {
    fn from(value: &WindowSnapshot) -> Self {
        Self {
            x: value.position.x,
            y: value.position.y,
            width: value.size.width,
            height: value.size.height,
            fullscreen: value.fullscreen,
            minimized: value.minimized,
            always_on_top: value.always_on_top,
        }
    }
}

impl From<RecoverySnapshot> for WindowSnapshot {
    fn from(value: RecoverySnapshot) -> Self {
        Self {
            position: PhysicalPosition::new(value.x, value.y),
            size: PhysicalSize::new(value.width, value.height),
            fullscreen: value.fullscreen,
            minimized: value.minimized,
            always_on_top: value.always_on_top,
        }
    }
}

#[derive(Debug)]
struct ActiveSession {
    token: String,
    snapshot: WindowSnapshot,
    executing_since: Option<Instant>,
}

#[derive(Default)]
pub struct WindowChoreographyState(Mutex<Option<ActiveSession>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChoreographyCapabilities {
    native_positioning: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowKeyframe {
    at_ms: u64,
    geometry: NormalizedGeometry,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChoreographyPlan {
    schema: u8,
    token: String,
    cue_id: String,
    display_mode: String,
    input_locked: bool,
    #[serde(default)]
    hold: bool,
    main: Vec<WindowKeyframe>,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

fn safe_token(token: &str) -> bool {
    (8..=96).contains(&token.len())
        && token
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
}

fn safe_plan(plan: &WindowChoreographyPlan) -> bool {
    const CUES: [&str; 6] = [
        "broadcast",
        "overload",
        "conceal",
        "loop",
        "silence",
        "reject",
    ];
    plan.schema == 1
        && safe_token(&plan.token)
        && CUES.contains(&plan.cue_id.as_str())
        && plan.display_mode == "native"
        && (!matches!(
            plan.cue_id.as_str(),
            "overload" | "conceal" | "loop" | "silence"
        ) || plan.input_locked)
        && (2..=8).contains(&plan.main.len())
        && plan.main.iter().all(|keyframe| {
            let geometry = &keyframe.geometry;
            [geometry.x, geometry.y, geometry.width, geometry.height]
                .iter()
                .all(|value| value.is_finite() && (0.0..=1.0).contains(value))
        })
}

fn capture(window: &WebviewWindow) -> Result<WindowSnapshot, String> {
    Ok(WindowSnapshot {
        position: window.outer_position().map_err(|err| err.to_string())?,
        size: window.outer_size().map_err(|err| err.to_string())?,
        fullscreen: window.is_fullscreen().unwrap_or(false),
        minimized: window.is_minimized().unwrap_or(false),
        always_on_top: window.is_always_on_top().unwrap_or(false),
    })
}

fn close_echoes(app: &AppHandle) {
    for label in ECHO_LABELS {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.close();
        }
    }
}

fn native_positioning_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        return std::env::var_os("WAYLAND_DISPLAY").is_none();
    }
    #[cfg(not(target_os = "linux"))]
    true
}

fn should_use_native(fullscreen: bool, positioning_supported: bool) -> bool {
    !fullscreen && positioning_supported
}

fn session_matches(active_token: Option<&str>, expected: Option<&str>) -> bool {
    expected
        .map(|token| active_token == Some(token))
        .unwrap_or(true)
}

fn watchdog_should_restore(
    active_token: Option<&str>,
    expected: &str,
    executing_for: Option<Duration>,
) -> bool {
    active_token == Some(expected)
        && executing_for
            .map(|elapsed| elapsed >= Duration::from_millis(WATCHDOG_MS))
            .unwrap_or(false)
}

fn restore_snapshot(window: &WebviewWindow, snapshot: &WindowSnapshot) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(snapshot.always_on_top);
    let _ = window.set_fullscreen(snapshot.fullscreen);
    // Fullscreen bounds are controlled by the compositor. Never attempt to
    // resize a fullscreen window; doing so is the original cross-platform bug.
    if !snapshot.fullscreen {
        let _ = window.set_size(snapshot.size);
        let _ = window.set_position(snapshot.position);
    }
    if snapshot.minimized {
        let _ = window.minimize();
    }
}

fn recovery_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("window-choreography-recovery.json"))
}

fn persist_recovery(app: &AppHandle, snapshot: &WindowSnapshot) -> Result<(), String> {
    let path = recovery_path(app).ok_or_else(|| "window recovery path unavailable".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let payload =
        serde_json::to_vec(&RecoverySnapshot::from(snapshot)).map_err(|err| err.to_string())?;
    fs::write(path, payload).map_err(|err| err.to_string())
}

fn clear_recovery(app: &AppHandle) {
    if let Some(path) = recovery_path(app) {
        let _ = fs::remove_file(path);
    }
}

// A hard process exit cannot run the ordinary session cleanup. The snapshot is
// intentionally the only choreography data that crosses a launch boundary; it
// contains desktop geometry, no battle, identity, or player-history fields.
pub fn recover_stale_snapshot(app: &AppHandle) -> bool {
    let Some(path) = recovery_path(app) else {
        return false;
    };
    let snapshot = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<RecoverySnapshot>(&bytes).ok())
        .map(WindowSnapshot::from);
    let restored = if let (Some(snapshot), Ok(window)) = (snapshot, main_window(app)) {
        restore_snapshot(&window, &snapshot);
        true
    } else {
        false
    };
    close_echoes(app);
    let _ = fs::remove_file(path);
    restored
}

pub fn restore_on_exit(app: &AppHandle) -> bool {
    restore_if_current(app, None)
}

fn monitor_rect(window: &WebviewWindow) -> Result<(i32, i32, u32, u32, f64), String> {
    let monitor = window
        .current_monitor()
        .map_err(|err| err.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "monitor not found".to_string())?;
    let work = monitor.work_area();
    Ok((
        work.position.x,
        work.position.y,
        work.size.width,
        work.size.height,
        monitor.scale_factor(),
    ))
}

fn physical_rect(
    geometry: &NormalizedGeometry,
    monitor: (i32, i32, u32, u32, f64),
) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let (origin_x, origin_y, monitor_w, monitor_h, scale) = monitor;
    let min_w = (960.0 * scale).round().min(monitor_w as f64) as u32;
    let min_h = (600.0 * scale).round().min(monitor_h as f64) as u32;
    let width = ((monitor_w as f64 * geometry.width).round() as u32).clamp(min_w, monitor_w);
    let height = ((monitor_h as f64 * geometry.height).round() as u32).clamp(min_h, monitor_h);
    let desired_x = origin_x as f64 + monitor_w as f64 * geometry.x;
    let desired_y = origin_y as f64 + monitor_h as f64 * geometry.y;
    let max_x = origin_x.saturating_add(monitor_w.saturating_sub(width) as i32);
    let max_y = origin_y.saturating_add(monitor_h.saturating_sub(height) as i32);
    let x = (desired_x.round() as i32).clamp(origin_x, max_x);
    let y = (desired_y.round() as i32).clamp(origin_y, max_y);
    (
        PhysicalPosition::new(x, y),
        PhysicalSize::new(width, height),
    )
}

fn token_is_current(app: &AppHandle, token: &str) -> bool {
    app.state::<WindowChoreographyState>()
        .0
        .lock()
        .ok()
        .and_then(|active| active.as_ref().map(|session| session.token == token))
        .unwrap_or(false)
}

fn animate_to(
    app: &AppHandle,
    window: &WebviewWindow,
    token: &str,
    target: (PhysicalPosition<i32>, PhysicalSize<u32>),
    duration_ms: u64,
) -> Result<(), String> {
    let start_position = window.outer_position().map_err(|err| err.to_string())?;
    let start_size = window.outer_size().map_err(|err| err.to_string())?;
    let steps = (duration_ms / 16).clamp(1, 60);
    for step in 1..=steps {
        if !token_is_current(app, token) {
            return Err("stale choreography session".to_string());
        }
        let raw = step as f64 / steps as f64;
        let t = 1.0 - (1.0 - raw).powi(3);
        let x = start_position.x as f64 + (target.0.x - start_position.x) as f64 * t;
        let y = start_position.y as f64 + (target.0.y - start_position.y) as f64 * t;
        let width = start_size.width as f64 + (target.1.width as f64 - start_size.width as f64) * t;
        let height =
            start_size.height as f64 + (target.1.height as f64 - start_size.height as f64) * t;
        window
            .set_size(PhysicalSize::new(
                width.round() as u32,
                height.round() as u32,
            ))
            .map_err(|err| err.to_string())?;
        window
            .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
            .map_err(|err| err.to_string())?;
        thread::sleep(Duration::from_millis((duration_ms / steps).max(1)));
    }
    Ok(())
}

fn restore_if_current(app: &AppHandle, token: Option<&str>) -> bool {
    let state = app.state::<WindowChoreographyState>();
    let snapshot = {
        let Ok(mut active) = state.0.lock() else {
            return false;
        };
        if !session_matches(active.as_ref().map(|session| session.token.as_str()), token) {
            return false;
        }
        active.take().map(|session| session.snapshot)
    };
    if let (Some(snapshot), Ok(window)) = (snapshot, main_window(app)) {
        restore_snapshot(&window, &snapshot);
    }
    clear_recovery(app);
    close_echoes(app);
    true
}

#[tauri::command]
pub fn chunk_window_choreography_begin(app: AppHandle, token: String) -> Result<bool, String> {
    if !safe_token(&token) {
        return Err("invalid choreography token".to_string());
    }
    let window = main_window(&app)?;
    if !should_use_native(
        window.is_fullscreen().unwrap_or(false),
        native_positioning_supported(),
    ) {
        return Ok(false);
    }
    let state = app.state::<WindowChoreographyState>();
    let mut active = state
        .0
        .lock()
        .map_err(|_| "choreography state poisoned".to_string())?;
    if let Some(previous) = active.take() {
        restore_snapshot(&window, &previous.snapshot);
        close_echoes(&app);
    }
    let snapshot = capture(&window)?;
    persist_recovery(&app, &snapshot)?;
    *active = Some(ActiveSession {
        token,
        snapshot,
        executing_since: None,
    });
    Ok(true)
}

#[tauri::command]
pub fn chunk_window_choreography_capabilities() -> WindowChoreographyCapabilities {
    WindowChoreographyCapabilities {
        native_positioning: native_positioning_supported(),
    }
}

#[tauri::command]
pub fn chunk_window_choreography_place_echo(
    app: AppHandle,
    label: String,
    index: u8,
    count: u8,
) -> Result<bool, String> {
    if !native_positioning_supported()
        || !CHANNEL_LABELS.contains(&label.as_str())
        || index >= 3
        || count == 0
        || count > 3
    {
        return Ok(false);
    }
    let main = main_window(&app)?;
    let echo = app
        .get_webview_window(&label)
        .ok_or_else(|| "echo window not found".to_string())?;
    let (origin_x, origin_y, monitor_w, monitor_h, scale) = monitor_rect(&main)?;
    let width = ((monitor_w as f64 * if count == 1 { 0.28 } else { 0.20 }).round() as u32)
        .clamp((300.0 * scale) as u32, (520.0 * scale) as u32);
    let height = ((monitor_h as f64 * 0.54).round() as u32)
        .clamp((360.0 * scale) as u32, (720.0 * scale) as u32);
    let gap = (24.0 * scale).round() as i32;
    let total = width as i32 * count as i32 + gap * (count.saturating_sub(1)) as i32;
    let start_x = origin_x + ((monitor_w as i32 - total) / 2);
    let x = start_x + index as i32 * (width as i32 + gap);
    let y = origin_y + ((monitor_h as i32 - height as i32) / 2);
    echo.set_size(PhysicalSize::new(width, height))
        .map_err(|err| err.to_string())?;
    echo.set_position(PhysicalPosition::new(x, y))
        .map_err(|err| err.to_string())?;
    let _ = echo.set_always_on_top(false);
    let _ = echo.show();
    Ok(true)
}

#[tauri::command]
pub fn chunk_window_choreography_execute(
    app: AppHandle,
    plan: WindowChoreographyPlan,
) -> Result<bool, String> {
    if !safe_plan(&plan) {
        return Err("invalid choreography plan".to_string());
    }
    let window = main_window(&app)?;
    if window.is_fullscreen().unwrap_or(false) {
        return Ok(false);
    }
    {
        let state = app.state::<WindowChoreographyState>();
        let mut active = state
            .0
            .lock()
            .map_err(|_| "choreography state poisoned".to_string())?;
        let session = active
            .as_mut()
            .ok_or_else(|| "no choreography session".to_string())?;
        if session.token != plan.token {
            return Err("stale choreography session".to_string());
        }
        session.executing_since = Some(Instant::now());
    }

    let watchdog_app = app.clone();
    let watchdog_token = plan.token.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(WATCHDOG_MS));
        let stalled = watchdog_app
            .state::<WindowChoreographyState>()
            .0
            .lock()
            .ok()
            .and_then(|active| {
                active.as_ref().map(|session| {
                    watchdog_should_restore(
                        Some(&session.token),
                        &watchdog_token,
                        session.executing_since.map(|at| at.elapsed()),
                    )
                })
            })
            .unwrap_or(false);
        if stalled {
            let _ = restore_if_current(&watchdog_app, Some(&watchdog_token));
        }
    });

    let monitor = monitor_rect(&window)?;
    let mut previous_at = 0;
    let result = (|| {
        for keyframe in plan.main.iter().skip(1) {
            let duration = keyframe.at_ms.saturating_sub(previous_at).clamp(48, 1_500);
            previous_at = keyframe.at_ms;
            animate_to(
                &app,
                &window,
                &plan.token,
                physical_rect(&keyframe.geometry, monitor),
                duration,
            )?;
        }
        Ok::<(), String>(())
    })();

    if token_is_current(&app, &plan.token) {
        let state = app.state::<WindowChoreographyState>();
        if let Ok(mut active) = state.0.lock() {
            if let Some(session) = active.as_mut() {
                session.executing_since = None;
                if !plan.hold {
                    restore_snapshot(&window, &session.snapshot);
                }
            }
        };
    }
    result.map(|_| true)
}

#[tauri::command]
pub fn chunk_window_choreography_restore(
    app: AppHandle,
    token: Option<String>,
) -> Result<bool, String> {
    Ok(restore_if_current(&app, token.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::{
        physical_rect, safe_plan, safe_token, session_matches, should_use_native,
        watchdog_should_restore, NormalizedGeometry, WindowChoreographyPlan, WindowKeyframe,
    };
    use std::time::Duration;

    #[test]
    fn logical_dpi_and_negative_origin_are_clamped() {
        let (position, size) = physical_rect(
            &NormalizedGeometry {
                x: 0.95,
                y: 0.95,
                width: 0.7,
                height: 0.7,
            },
            (-3840, -120, 3840, 2160, 2.0),
        );
        assert_eq!(size.width, 2688);
        assert_eq!(size.height, 1512);
        assert!(position.x >= -3840 && position.x + size.width as i32 <= 0);
        assert!(position.y >= -120 && position.y + size.height as i32 <= 2040);
    }

    #[test]
    fn rejects_unlocked_disruptive_or_non_allowlisted_plans() {
        let make = |cue: &str, locked: bool| WindowChoreographyPlan {
            schema: 1,
            token: "session-12345678".into(),
            cue_id: cue.into(),
            display_mode: "native".into(),
            input_locked: locked,
            hold: false,
            main: vec![
                WindowKeyframe {
                    at_ms: 0,
                    geometry: NormalizedGeometry {
                        x: 0.0,
                        y: 0.0,
                        width: 1.0,
                        height: 1.0,
                    },
                },
                WindowKeyframe {
                    at_ms: 100,
                    geometry: NormalizedGeometry {
                        x: 0.1,
                        y: 0.1,
                        width: 0.8,
                        height: 0.8,
                    },
                },
            ],
        };
        assert!(!safe_plan(&make("overload", false)));
        assert!(!safe_plan(&make("minimize", true)));
        assert!(safe_plan(&make("overload", true)));
        assert!(safe_token("session-12345678"));
    }

    #[test]
    fn fullscreen_and_positioning_fallback_never_use_native_geometry() {
        assert!(!should_use_native(true, true));
        assert!(!should_use_native(false, false));
        assert!(should_use_native(false, true));
    }

    #[test]
    fn stale_restore_cannot_cancel_a_newer_session() {
        assert!(!session_matches(Some("session-new"), Some("session-old")));
        assert!(session_matches(Some("session-new"), Some("session-new")));
        assert!(session_matches(Some("session-new"), None));
        assert!(
            session_matches(None, None),
            "emergency cleanup still closes orphaned echo panes"
        );
    }

    #[test]
    fn watchdog_only_restores_the_matching_stalled_session() {
        assert!(!watchdog_should_restore(
            Some("session-new"),
            "session-old",
            Some(Duration::from_secs(20))
        ));
        assert!(!watchdog_should_restore(
            Some("session-new"),
            "session-new",
            Some(Duration::from_secs(2))
        ));
        assert!(watchdog_should_restore(
            Some("session-new"),
            "session-new",
            Some(Duration::from_secs(9))
        ));
    }
}
