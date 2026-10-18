use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalRect, PhysicalSize,
    WebviewWindow, WindowEvent,
};

const FIREBALL_LABELS: [&str; 4] = [
    "fireball-cast-1",
    "fireball-cast-2",
    "fireball-cast-3",
    "fireball-cast-4",
];
const MEDIA_LABELS: [&str; 8] = [
    "window-media-1",
    "window-media-2",
    "window-media-3",
    "window-media-4",
    "window-media-5",
    "window-media-6",
    "window-media-7",
    "window-media-8",
];

#[derive(Debug, Clone, Deserialize)]
pub struct RayPoint {
    x: f64,
    y: f64,
}

// WINDOW-NORMALISED, NOT STAGE-NORMALISED.
//
// The ray is authored inside the battle's stage rect -- a band in the middle of
// the combat panel, not the window -- and this used to read `beyond` as though
// it were a fraction of the whole window. Every rightward cast therefore aimed
// at a point far off the side of the screen and got clamped flat against the
// monitor edge, which is why the surfaces appeared in the same wrong place
// every time. The sender now remaps the ray into window space first, and this
// only has to walk it out past the bezel.
#[derive(Debug, Clone, Deserialize)]
pub struct FireballRay {
    direction: RayPoint,
    exit: RayPoint,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoreographyBeginRequest {
    token: String,
    scene_id: String,
    #[serde(default)]
    restore_game_mode: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MainFrameKeyframe {
    #[serde(default)]
    dx: f64,
    #[serde(default)]
    dy: f64,
    #[serde(default = "one")]
    scale_x: f64,
    #[serde(default = "one")]
    scale_y: f64,
    #[serde(default)]
    duration_ms: u64,
    #[serde(default)]
    easing: String,
    #[serde(default)]
    dock: String,
}
fn one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoreographyExecuteRequest {
    token: String,
    cue_id: String,
    keyframes: Vec<MainFrameKeyframe>,
    #[serde(default)]
    interruptible: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SurfacePlaceRequest {
    label: String,
    index: u8,
    x: f64,
    y: f64,
    size: f64,
    #[serde(default)]
    interactive: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlaceRequest {
    label: String,
    index: u8,
    x: f64,
    y: f64,
    #[serde(default)]
    offset_x: f64,
    #[serde(default)]
    offset_y: f64,
    width: f64,
    height: f64,
    #[serde(default = "default_recoverable")]
    recoverable: f64,
    #[serde(default)]
    duration_ms: u64,
    #[serde(default)]
    interactive: bool,
}

fn default_recoverable() -> f64 {
    24.0
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlacement {
    shown: bool,
    label: String,
    monitor: String,
    scale: f64,
    origin: MediaPoint,
    center: MediaPoint,
    normalized: MediaPoint,
    width: f64,
    height: f64,
    work_width: f64,
    work_height: f64,
}

#[derive(Clone)]
struct MainBounds {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

struct MainTransaction {
    token: String,
    #[allow(dead_code)]
    scene_id: String,
    stable: MainBounds,
    // set_size takes content size; restoring an outer frame as content adds
    // the titlebar to the saved height on macOS.
    restore_inner: PhysicalSize<u32>,
    decorated: bool,
    was_focused: bool,
    scale_factor: f64,
    monitor_work_area: Option<PhysicalRect<i32, u32>>,
    // Superseded by the two below, which say WHICH mode was left. Retained so a
    // reader can see the request that produced them.
    #[allow(dead_code)]
    restore_game_mode: bool,
    // WHICH fullscreen was left, not merely that one was. restore_transaction
    // used to put every case back as SIMPLE fullscreen, so a native Space came
    // back as the wrong mode and a merely screen-filling WINDOW came back
    // fullscreen with no title bar at all — which is what happened the moment a
    // run started, because starting one runs a transaction.
    left_native_fullscreen: bool,
    left_simple_fullscreen: bool,
    cancelled: bool,
    generation: u64,
    applying_until: Option<Instant>,
    expected_position: Option<PhysicalPosition<i32>>,
    expected_size: Option<PhysicalSize<u32>>,
}

static MAIN_TRANSACTION: OnceLock<Mutex<Option<MainTransaction>>> = OnceLock::new();
fn transaction() -> &'static Mutex<Option<MainTransaction>> {
    MAIN_TRANSACTION.get_or_init(|| Mutex::new(None))
}

pub(crate) fn valid_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ':'))
}

fn current_bounds(window: &WebviewWindow) -> Result<MainBounds, String> {
    Ok(MainBounds {
        position: window.outer_position().map_err(|error| error.to_string())?,
        size: window.outer_size().map_err(|error| error.to_string())?,
    })
}

fn bounds_match(a: &MainBounds, b: &MainBounds, tolerance: u32) -> bool {
    (a.position.x - b.position.x).unsigned_abs() <= tolerance
        && (a.position.y - b.position.y).unsigned_abs() <= tolerance
        && a.size.width.abs_diff(b.size.width) <= tolerance
        && a.size.height.abs_diff(b.size.height) <= tolerance
}

fn bounds_fill_rect(bounds: &MainBounds, rect: &PhysicalRect<i32, u32>) -> bool {
    let expected = MainBounds {
        position: rect.position,
        size: rect.size,
    };
    bounds_match(bounds, &expected, 8)
}

// Leaving simple fullscreen is dispatched onto the native event loop. Sampling
// the frame in the same command used to capture the fullscreen rectangle as the
// transaction's "stable" bounds. The later OS resize then looked like a player
// move to note_main_window_event and cancelled the authored cue before its first
// keyframe. Wait off the event loop until the restored window frame has arrived
// and remained still for two samples.
fn wait_for_windowed_bounds(
    window: &WebviewWindow,
    before: MainBounds,
    monitor_rect: Option<PhysicalRect<i32, u32>>,
) -> Result<MainBounds, String> {
    let looked_fullscreen = window.is_fullscreen().unwrap_or(false)
        || monitor_rect
            .as_ref()
            .is_some_and(|rect| bounds_fill_rect(&before, rect));
    if !looked_fullscreen {
        return Ok(before);
    }

    let deadline = Instant::now() + Duration::from_millis(1500);
    let mut previous: Option<MainBounds> = None;
    let mut stable_samples = 0_u8;
    loop {
        let current = current_bounds(window)?;
        let left_fullscreen =
            !window.is_fullscreen().unwrap_or(false) && !bounds_match(&current, &before, 3);
        if left_fullscreen {
            if previous
                .as_ref()
                .is_some_and(|value| bounds_match(value, &current, 2))
            {
                stable_samples = stable_samples.saturating_add(1);
                if stable_samples >= 2 {
                    return Ok(current);
                }
            } else {
                stable_samples = 0;
            }
            previous = Some(current);
        } else {
            previous = None;
            stable_samples = 0;
        }
        if Instant::now() >= deadline {
            return Err("fullscreen exit did not settle".to_string());
        }
        std::thread::sleep(Duration::from_millis(16));
    }
}

fn eased(t: f64, easing: &str) -> f64 {
    let t = t.clamp(0.0, 1.0);
    match easing {
        "out-cubic" => 1.0 - (1.0 - t).powi(3),
        "in-cubic" => t.powi(3),
        "in-out-cubic" => {
            if t < 0.5 {
                4.0 * t.powi(3)
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            }
        }
        _ => t,
    }
}

fn lerp_i32(a: i32, b: i32, t: f64) -> i32 {
    (a as f64 + (b - a) as f64 * t).round() as i32
}
fn lerp_u32(a: u32, b: u32, t: f64) -> u32 {
    (a as f64 + (b as f64 - a as f64) * t).round().max(1.0) as u32
}

fn begin_transaction(app: &AppHandle, request: ChoreographyBeginRequest) -> Result<bool, String> {
    if crate::source_desktop::active() { return Ok(false); }
    if !valid_token(&request.token) || request.scene_id.is_empty() {
        return Ok(false);
    }
    // A stale sequence is recoverable: restore it before a new token can own
    // the main frame. This also makes god-menu jumps and scene replacement safe.
    if transaction()
        .lock()
        .map_err(|_| "transaction lock poisoned".to_string())?
        .is_some()
    {
        let _ = restore_transaction(&app, None);
    }
    let main = main_window(app)?;
    let before = current_bounds(&main)?;
    let monitor = main.current_monitor().ok().flatten();
    let monitor_rect = monitor.as_ref().map(|value| PhysicalRect {
        position: *value.position(),
        size: *value.size(),
    });
    // Read the two real modes BEFORE leaving them; afterwards both report false.
    // `restore_game_mode` can also be true for a window that merely fills the
    // monitor, in which case neither of these is set and there is nothing to
    // re-enter — restoring its position and size is the whole job.
    let left_native_fullscreen = request.restore_game_mode && main.is_fullscreen().unwrap_or(false);
    let left_simple_fullscreen =
        request.restore_game_mode && crate::display_policy::simple_fullscreen_active();
    if request.restore_game_mode {
        let _ = main.set_simple_fullscreen(false);
        let _ = main.set_fullscreen(false);
        crate::display_policy::note_simple_fullscreen(false);
    }
    let stable = if request.restore_game_mode {
        // A FAILED EXIT MUST NOT BE LEFT HALF-APPLIED.
        //
        // The window has already been taken out of fullscreen above, but the
        // transaction slot is not populated until after this `?`. So a timeout
        // here used to leave the game windowed with no record that it had ever
        // been fullscreen, and nothing later would put it back — the player got
        // dropped out of game mode by a cue that then did not play. Restore it
        // on the way out and report the failure honestly.
        match wait_for_windowed_bounds(&main, before, monitor_rect) {
            Ok(bounds) => bounds,
            Err(error) => {
                // Roll back into the mode we actually left, for the same reason
                // restore_transaction does: this used to hand a windowed player
                // a fullscreen window after a cue that never played.
                if left_simple_fullscreen {
                    let _ = main.set_simple_fullscreen(true);
                    crate::display_policy::note_simple_fullscreen(true);
                } else if left_native_fullscreen {
                    let _ = main.set_fullscreen(true);
                }
                return Err(error);
            }
        }
    } else {
        before
    };
    let decorated = main.is_decorated().unwrap_or(true);
    let was_focused = main.is_focused().unwrap_or(true);
    let monitor = main.current_monitor().ok().flatten().or(monitor);
    let scale_factor = monitor
        .as_ref()
        .map(|value| value.scale_factor())
        .unwrap_or_else(|| main.scale_factor().unwrap_or(1.0))
        .max(0.1);
    let monitor_work_area = monitor.as_ref().map(|value| *value.work_area());
    *transaction()
        .lock()
        .map_err(|_| "transaction lock poisoned".to_string())? = Some(MainTransaction {
        token: request.token,
        scene_id: request.scene_id,
        stable,
        restore_inner: main.inner_size().map_err(|error| error.to_string())?,
        decorated,
        was_focused,
        scale_factor,
        monitor_work_area,
        restore_game_mode: request.restore_game_mode,
        left_native_fullscreen,
        left_simple_fullscreen,
        cancelled: false,
        generation: 0,
        applying_until: None,
        expected_position: None,
        expected_size: None,
    });
    Ok(true)
}

#[tauri::command]
pub async fn chunk_window_choreography_begin(
    app: AppHandle,
    request: ChoreographyBeginRequest,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || begin_transaction(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

fn apply_frame(
    app: &AppHandle,
    token: &str,
    generation: u64,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> Result<bool, String> {
    {
        let mut slot = transaction()
            .lock()
            .map_err(|_| "transaction lock poisoned".to_string())?;
        let Some(active) = slot.as_mut() else {
            return Ok(false);
        };
        if active.token != token || active.cancelled || active.generation != generation {
            return Ok(false);
        }
        active.applying_until = Some(Instant::now() + Duration::from_millis(120));
        active.expected_position = Some(position);
        active.expected_size = Some(size);
    }
    let main = main_window(app)?;
    main.set_position(position)
        .map_err(|error| error.to_string())?;
    main.set_size(size).map_err(|error| error.to_string())?;
    Ok(true)
}

fn execute_transaction(
    app: &AppHandle,
    request: ChoreographyExecuteRequest,
) -> Result<bool, String> {
    if crate::source_desktop::active() { return Ok(false); }
    if request.keyframes.len() > 8 || request.cue_id.is_empty() {
        return Ok(false);
    }
    let (stable, generation, scale, work_area) = {
        let slot = transaction()
            .lock()
            .map_err(|_| "transaction lock poisoned".to_string())?;
        let Some(active) = slot.as_ref() else {
            return Ok(false);
        };
        if active.token != request.token || active.cancelled {
            return Ok(false);
        }
        (
            active.stable.clone(),
            active.generation,
            active.scale_factor,
            active.monitor_work_area,
        )
    };
    let main = main_window(app)?;
    let mut from = current_bounds(&main)?;
    for keyframe in request.keyframes {
        if ![keyframe.dx, keyframe.dy, keyframe.scale_x, keyframe.scale_y]
            .iter()
            .all(|value| value.is_finite())
        {
            continue;
        }
        let mut target_size = PhysicalSize::new(
            (stable.size.width as f64 * keyframe.scale_x.clamp(0.55, 1.35))
                .round()
                .max(320.0) as u32,
            (stable.size.height as f64 * keyframe.scale_y.clamp(0.55, 1.35))
                .round()
                .max(240.0) as u32,
        );
        if let Some(work) = work_area {
            target_size.width = target_size.width.min(work.size.width);
            target_size.height = target_size.height.min(work.size.height);
        }
        let mut target_position = PhysicalPosition::new(
            stable.position.x + (keyframe.dx * scale).round() as i32,
            stable.position.y + (keyframe.dy * scale).round() as i32,
        );
        // Cinch and bloom are centred unless the plan explicitly docks them.
        if keyframe.dock.is_empty() || keyframe.dock == "center" {
            target_position.x +=
                (stable.size.width as i64 - target_size.width as i64).div_euclid(2) as i32;
            target_position.y +=
                (stable.size.height as i64 - target_size.height as i64).div_euclid(2) as i32;
        }
        if let Some(work) = work_area {
            let max_x = work
                .position
                .x
                .saturating_add(work.size.width.saturating_sub(target_size.width) as i32);
            let max_y = work
                .position
                .y
                .saturating_add(work.size.height.saturating_sub(target_size.height) as i32);
            target_position.x = target_position
                .x
                .clamp(work.position.x, max_x.max(work.position.x));
            target_position.y = target_position
                .y
                .clamp(work.position.y, max_y.max(work.position.y));
        }
        let duration = keyframe.duration_ms.min(2200);
        let steps = if duration == 0 {
            1
        } else {
            (duration / 33).clamp(1, 67)
        };
        for step in 1..=steps {
            let t = eased(step as f64 / steps as f64, &keyframe.easing);
            let position = PhysicalPosition::new(
                lerp_i32(from.position.x, target_position.x, t),
                lerp_i32(from.position.y, target_position.y, t),
            );
            let size = PhysicalSize::new(
                lerp_u32(from.size.width, target_size.width, t),
                lerp_u32(from.size.height, target_size.height, t),
            );
            if !apply_frame(app, &request.token, generation, position, size)? {
                return Ok(false);
            }
            if duration > 0 && step < steps {
                std::thread::sleep(Duration::from_millis(33));
            }
        }
        from = MainBounds {
            position: target_position,
            size: target_size,
        };
    }
    // If a player move/resize cancelled an interruptible cue, false tells JS to
    // keep the complete beat in Simulate. Noninterruptible is reserved for
    // restoration and is never authored as player-facing motion.
    let slot = transaction()
        .lock()
        .map_err(|_| "transaction lock poisoned".to_string())?;
    Ok(slot.as_ref().is_some_and(|active| {
        active.token == request.token && (!request.interruptible || !active.cancelled)
    }))
}

#[tauri::command]
pub async fn chunk_window_choreography_execute(
    app: AppHandle,
    request: ChoreographyExecuteRequest,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || execute_transaction(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(target_os = "macos")]
fn settle_cocoa_window_changes() {
    // Tao dispatches style and content-size changes asynchronously to GCD.
    // End/restore IPC runs off the main thread; this fence drains those changes
    // before we measure chrome or apply the next dependent operation.
    if unsafe { libc::pthread_main_np() } == 0 {
        dispatch2::DispatchQueue::main().exec_sync(|| {});
    }
}

fn restore_transaction(app: &AppHandle, required: Option<&str>) -> Result<bool, String> {
    let desktop_owned = crate::source_desktop::active();
    let active = {
        let mut slot = transaction()
            .lock()
            .map_err(|_| "transaction lock poisoned".to_string())?;
        if required.is_some_and(|token| slot.as_ref().is_some_and(|value| value.token != token)) {
            return Ok(false);
        }
        slot.take()
    };
    // Retire the frame owner before restoring minimum size: the OS may resize
    // the island immediately, and that event must not replace the saved frame.
    let had_input_focus = main_window(app).ok().is_some_and(|main| main.is_focused().unwrap_or(false));
    let presentation_result = crate::source_desktop::release_presentation(app, required);
    let Some(active) = active else {
        return presentation_result;
    };
    let main = main_window(app)?;
    let mut errors = Vec::new();
    if let Err(error) = presentation_result { errors.push(error); }
    let _ = main.set_simple_fullscreen(false);
    let _ = main.set_fullscreen(false);
    crate::display_policy::note_simple_fullscreen(false);
    if let Err(error) = main.set_decorations(active.decorated) { errors.push(error.to_string()); }
    #[cfg(target_os = "macos")]
    if active.decorated {
        settle_cocoa_window_changes();
        // Tao's decoration setter replaces the style mask and drops Wry's
        // FullSizeContentView flag. Reapply the configured title-bar style so
        // the restored content and outer frame match the window we measured.
        let style = app.config().app.windows.iter().find(|window| window.label == "main")
            .map(|window| window.title_bar_style.clone()).unwrap_or_default();
        if let Err(error) = main.set_title_bar_style(style) { errors.push(error.to_string()); }
        settle_cocoa_window_changes();
    }
    // A monitor may have disappeared while the desktop presentation was
    // suspended. Keep the restore frame wholly on an available work area.
    let mut bounds = active.stable;
    let mut restore_inner = active.restore_inner;
    if let Some(monitors) = desktop_owned.then(|| main.available_monitors().ok()).flatten() {
        let visible = monitors.iter().any(|monitor| {
            let r = monitor.work_area();
            bounds.position.x >= r.position.x && bounds.position.y >= r.position.y
                && bounds.position.x as i64 + bounds.size.width as i64 <= r.position.x as i64 + r.size.width as i64
                && bounds.position.y as i64 + bounds.size.height as i64 <= r.position.y as i64 + r.size.height as i64
        });
        if !visible {
            if let Some(monitor) = main.current_monitor().ok().flatten().or_else(|| main.primary_monitor().ok().flatten()) {
                let r = monitor.work_area();
                bounds.size.width = bounds.size.width.min(r.size.width);
                bounds.size.height = bounds.size.height.min(r.size.height);
                let chrome_w = bounds.size.width.saturating_sub(restore_inner.width);
                let chrome_h = bounds.size.height.saturating_sub(restore_inner.height);
                restore_inner.width = restore_inner.width.min(r.size.width.saturating_sub(chrome_w));
                restore_inner.height = restore_inner.height.min(r.size.height.saturating_sub(chrome_h));
                bounds.position = PhysicalPosition::new(r.position.x + ((r.size.width-bounds.size.width)/2) as i32,
                    r.position.y + ((r.size.height-bounds.size.height)/2) as i32);
            }
        }
    }
    if let Err(error) = main.set_position(bounds.position) { errors.push(error.to_string()); }
    if let Err(error) = main.set_size(restore_inner) { errors.push(error.to_string()); }
    #[cfg(target_os = "macos")]
    settle_cocoa_window_changes();
    // Put back the mode that was actually left. A window that only happened to
    // fill the monitor gets its geometry back and nothing else — imposing simple
    // fullscreen on it is what stripped the title bar from ordinary windowed
    // play, every time a scene transition ran a transaction.
    if active.left_simple_fullscreen {
        match main.set_simple_fullscreen(true) {
            Ok(()) => crate::display_policy::note_simple_fullscreen(true),
            Err(error) => errors.push(error.to_string()),
        }
    } else if active.left_native_fullscreen {
        if let Err(error) = main.set_fullscreen(true) { errors.push(error.to_string()); }
    }
    if active.was_focused {
        // Cleanup after Alt-Tab must not steal focus from another application.
        if !desktop_owned || had_input_focus { let _ = main.set_focus(); }
    }
    if errors.is_empty() { Ok(true) } else { Err(errors.join("; ")) }
}

pub(crate) fn desktop_generation(token: &str) -> Result<u64, String> {
    transaction().lock().map_err(|_| "transaction lock poisoned".to_owned())?
        .as_ref().filter(|active| active.token == token && !active.cancelled)
        .map(|active| active.generation).ok_or_else(|| "desktop transaction is not owned".into())
}
pub(crate) fn desktop_apply_frame(app: &AppHandle, token: &str, generation: u64,
    position: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> Result<bool, String> {
    apply_frame(app, token, generation, position, size)
}
pub(crate) fn desktop_restore(app: &AppHandle, token: &str) -> Result<bool, String> {
    restore_transaction(app, Some(token))
}

#[tauri::command]
pub async fn chunk_window_choreography_restore(app: AppHandle, token: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || restore_transaction(&app, Some(&token)))
        .await.map_err(|error| error.to_string())?
}

// Called from the app-wide window event hook. Programmatic geometry events
// match the expected frame. Anything else is a player intervention: cancel the
// tween and make the new geometry the exact restore target.
pub fn note_main_window_event(app: &AppHandle, event: &WindowEvent) {
    if crate::source_desktop::note_main_event(app, event) { return; }
    let Ok(mut slot) = transaction().lock() else {
        return;
    };
    let Some(active) = slot.as_mut() else { return };
    let within = active
        .applying_until
        .is_some_and(|until| Instant::now() <= until);
    let expected = match event {
        WindowEvent::Moved(position) => active.expected_position.is_some_and(|value| {
            (value.x - position.x).abs() <= 2 && (value.y - position.y).abs() <= 2
        }),
        WindowEvent::Resized(size) => active.expected_size.is_some_and(|value| {
            value.width.abs_diff(size.width) <= 2 && value.height.abs_diff(size.height) <= 2
        }),
        _ => return,
    };
    if within && expected {
        return;
    }
    if let Ok(window) = main_window(app) {
        if let Ok(bounds) = current_bounds(&window) {
            active.stable = bounds;
            if let Ok(size) = window.inner_size() { active.restore_inner = size; }
        }
        if let Ok(Some(monitor)) = window.current_monitor() {
            active.scale_factor = monitor.scale_factor().max(0.1);
            active.monitor_work_area = Some(*monitor.work_area());
        }
    }
    active.cancelled = true;
    active.generation = active.generation.saturating_add(1);
}

#[tauri::command]
pub fn chunk_window_surface_place(
    app: AppHandle,
    request: SurfacePlaceRequest,
) -> Result<bool, String> {
    if crate::source_desktop::active() { return Ok(false); }
    if request.index >= 4
        || FIREBALL_LABELS.get(request.index as usize) != Some(&request.label.as_str())
        || ![request.x, request.y, request.size]
            .iter()
            .all(|value| value.is_finite())
    {
        return Ok(false);
    }
    let surface = app
        .get_webview_window(&request.label)
        .ok_or_else(|| "choreography surface not found".to_string())?;
    let main = main_window(&app)?;
    let main_was_focused = main.is_focused().unwrap_or(false);
    let monitor = main
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| main.primary_monitor().ok().flatten())
        .ok_or_else(|| "monitor not found".to_string())?;
    let work = monitor.work_area();
    let scale = monitor.scale_factor().max(0.1);
    let size = request.size.clamp(64.0, 320.0);
    let centre = (
        work.position.x as f64 + work.size.width as f64 * request.x.clamp(0.02, 0.98),
        work.position.y as f64 + work.size.height as f64 * request.y.clamp(0.02, 0.98),
    );
    surface
        .set_size(LogicalSize::new(size, size))
        .map_err(|error| error.to_string())?;
    surface
        .set_position(clamped_square(centre, size, work, scale))
        .map_err(|error| error.to_string())?;
    let _ = surface.set_always_on_top(true);
    let _ = surface.set_focusable(request.interactive);
    let _ = surface.set_ignore_cursor_events(!request.interactive);
    let _ = surface.show();
    if !request.interactive {
        restore_main_after_passive_surface(&main, &surface, main_was_focused);
    }
    Ok(true)
}

fn valid_media_label(label: &str, index: u8) -> bool {
    MEDIA_LABELS.get(index as usize) == Some(&label)
}

fn restore_main_after_passive_surface(
    main: &tauri::WebviewWindow,
    surface: &tauri::WebviewWindow,
    main_was_focused: bool,
) {
    // macOS cannot unfocus a window after set_focusable(false) if it became
    // key during creation/show. In that narrow race the passive pane already
    // stole focus, so hand it straight back. If the user switched to another
    // app, neither game window is focused and we leave them alone.
    if main_was_focused || surface.is_focused().unwrap_or(false) {
        let _ = main.set_focus();
    }
}

fn media_placement(app: &AppHandle, label: &str) -> Result<Option<MediaPlacement>, String> {
    let Some(surface) = app.get_webview_window(label) else {
        return Ok(None);
    };
    let monitor = surface
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| surface.primary_monitor().ok().flatten())
        .ok_or_else(|| "monitor not found".to_string())?;
    let work = monitor.work_area();
    let scale = monitor.scale_factor().max(0.1);
    let position = surface
        .outer_position()
        .map_err(|error| error.to_string())?;
    let size = surface.outer_size().map_err(|error| error.to_string())?;
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    let origin = MediaPoint {
        // WebGL's gl_FragCoord is physical framebuffer space. Keeping the
        // desktop origin physical makes the sector grid continuous across
        // windows on both Retina and mixed-DPI monitor layouts.
        x: position.x as f64,
        y: position.y as f64,
    };
    let center = MediaPoint {
        x: (position.x - work.position.x) as f64 / scale + width * 0.5,
        y: (position.y - work.position.y) as f64 / scale + height * 0.5,
    };
    let work_width = work.size.width as f64 / scale;
    let work_height = work.size.height as f64 / scale;
    Ok(Some(MediaPlacement {
        shown: surface.is_visible().unwrap_or(false),
        label: label.to_string(),
        monitor: monitor
            .name()
            .cloned()
            .unwrap_or_else(|| "monitor".to_string()),
        scale,
        origin,
        normalized: MediaPoint {
            x: (center.x / work_width.max(1.0)).clamp(0.0, 1.0),
            y: (center.y / work_height.max(1.0)).clamp(0.0, 1.0),
        },
        center,
        width,
        height,
        work_width,
        work_height,
    }))
}

fn place_media(
    app: &AppHandle,
    request: MediaPlaceRequest,
) -> Result<Option<MediaPlacement>, String> {
    if crate::source_desktop::active() { return Ok(None); }
    if !valid_media_label(&request.label, request.index)
        || ![
            request.x,
            request.y,
            request.width,
            request.height,
            request.recoverable,
            request.offset_x,
            request.offset_y,
        ]
        .iter()
        .all(|value| value.is_finite())
    {
        return Ok(None);
    }
    let surface = app
        .get_webview_window(&request.label)
        .ok_or_else(|| "media surface not found".to_string())?;
    let main = main_window(app)?;
    let main_was_focused = main.is_focused().unwrap_or(false);
    let monitor = main
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| main.primary_monitor().ok().flatten())
        .ok_or_else(|| "monitor not found".to_string())?;
    let work = monitor.work_area();
    let scale = monitor.scale_factor().max(0.1);
    let width = request.width.clamp(160.0, 320.0);
    let height = request.height.clamp(96.0, 320.0);
    let physical_width = width * scale;
    let physical_height = height * scale;
    let center_x = work.position.x as f64
        + work.size.width as f64 * request.x.clamp(0.0, 1.0)
        + request.offset_x * scale;
    let center_y = work.position.y as f64
        + work.size.height as f64 * request.y.clamp(0.0, 1.0)
        + request.offset_y * scale;
    let recoverable = request.recoverable.clamp(24.0, width.min(height)) * scale;
    let min_x = work.position.x as f64 - physical_width + recoverable;
    let max_x = work.position.x as f64 + work.size.width as f64 - recoverable;
    let min_y = work.position.y as f64 - physical_height + recoverable;
    let max_y = work.position.y as f64 + work.size.height as f64 - recoverable;
    let position = PhysicalPosition::new(
        (center_x - physical_width * 0.5)
            .clamp(min_x, max_x)
            .round() as i32,
        (center_y - physical_height * 0.5)
            .clamp(min_y, max_y)
            .round() as i32,
    );
    let from = surface.outer_position().unwrap_or(position);
    surface
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    let duration = request.duration_ms.min(600);
    let steps = if duration == 0 {
        1
    } else {
        (duration / 30).clamp(1, 12)
    };
    for step in 1..=steps {
        let t = eased(step as f64 / steps as f64, "out-cubic");
        surface
            .set_position(PhysicalPosition::new(
                lerp_i32(from.x, position.x, t),
                lerp_i32(from.y, position.y, t),
            ))
            .map_err(|error| error.to_string())?;
        if duration > 0 && step < steps {
            std::thread::sleep(Duration::from_millis(30));
        }
    }
    let _ = surface.set_always_on_top(true);
    let _ = surface.set_focusable(request.interactive);
    let _ = surface.set_ignore_cursor_events(!request.interactive);
    let _ = surface.show();
    if !request.interactive {
        restore_main_after_passive_surface(&main, &surface, main_was_focused);
    }
    let mut placement = media_placement(app, &request.label)?;
    if let Some(value) = placement.as_mut() {
        value.shown = true;
    }
    Ok(placement)
}

#[tauri::command]
pub async fn chunk_window_media_place(
    app: AppHandle,
    request: MediaPlaceRequest,
) -> Result<Option<MediaPlacement>, String> {
    tauri::async_runtime::spawn_blocking(move || place_media(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn chunk_window_media_position(
    app: AppHandle,
    label: String,
) -> Result<Option<MediaPlacement>, String> {
    if !MEDIA_LABELS.contains(&label.as_str()) {
        return Ok(None);
    }
    media_placement(&app, &label)
}

#[tauri::command]
pub fn chunk_window_media_hide_all(app: AppHandle) -> bool {
    hide_media(&app)
}

fn hide_media(app: &AppHandle) -> bool {
    for label in MEDIA_LABELS {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.set_focusable(false);
            let _ = window.hide();
        }
    }
    true
}

// Keep every auxiliary surface owned by the live composition across an app
// switch. Hiding them here destroys the only native record of which panes were
// visible, and a later DOM focus event is not a reliable reconstruction signal
// on macOS. Lowering their stacking level while Chunk Surfer is inactive keeps
// them out of the user's next application without changing visibility.
#[tauri::command]
pub fn chunk_window_surfaces_sync_app_activation(app: AppHandle) -> bool {
    let focused = game_owns_keyboard(&app);
    for label in FIREBALL_LABELS.iter().chain(MEDIA_LABELS.iter()) {
        if let Some(window) = app.get_webview_window(label) {
            if window.is_visible().unwrap_or(false) {
                let _ = window.set_always_on_top(focused);
            }
        }
    }
    focused
}

fn game_owns_keyboard(app: &AppHandle) -> bool {
    std::iter::once("main")
        .chain(FIREBALL_LABELS)
        .chain(MEDIA_LABELS)
        .any(|label| {
            app.get_webview_window(label)
                .is_some_and(|window| window.is_focused().unwrap_or(false))
        })
}

fn allowed(label: &str, index: u8, count: u8) -> bool {
    count > 0 && count <= 4 && index < count && FIREBALL_LABELS.get(index as usize) == Some(&label)
}

fn logical_size(_index: u8) -> f64 {
    240.0
}

fn contains(rect: &PhysicalRect<i32, u32>, x: f64, y: f64) -> bool {
    x >= rect.position.x as f64
        && y >= rect.position.y as f64
        && x < (rect.position.x as f64 + rect.size.width as f64)
        && y < (rect.position.y as f64 + rect.size.height as f64)
}

fn clamped_square(
    center: (f64, f64),
    logical: f64,
    work: &PhysicalRect<i32, u32>,
    scale: f64,
) -> PhysicalPosition<i32> {
    let physical = (logical * scale).round().max(1.0) as i32;
    let min_x = work.position.x;
    let min_y = work.position.y;
    let max_x = min_x.saturating_add(work.size.width.saturating_sub(physical.max(0) as u32) as i32);
    let max_y =
        min_y.saturating_add(work.size.height.saturating_sub(physical.max(0) as u32) as i32);
    PhysicalPosition::new(
        ((center.0 - physical as f64 * 0.5).round() as i32).clamp(min_x, max_x.max(min_x)),
        ((center.1 - physical as f64 * 0.5).round() as i32).clamp(min_y, max_y.max(min_y)),
    )
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Legacy pose fields remain accepted; only the webview animates them.
pub struct CastStep {
    label: String,
    index: u8,
    count: u8,
    ray: FireballRay,
    #[serde(default)]
    seed: u32,
    #[serde(default)]
    progress: f64,
    #[serde(default)]
    dodge: Option<f64>,
    #[serde(default, alias = "formation_progress")]
    formation_progress: Option<f64>,
}

// Retain the older command envelope while pose animation moves entirely into
// the fixed input carrier's webview. Native geometry does not consume it.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct Choreography {
    #[serde(default)]
    dodge: f64,
    #[serde(default)]
    reach: f64,
    #[serde(default)]
    cohesion: f64,
    #[serde(default)]
    gesture: String,
    #[serde(default, alias = "formation_progress")]
    formation_progress: f64,
}

fn carrier_height(count:u8, work:&PhysicalRect<i32,u32>, scale:f64)->f64 {
    let desired:f64=if count<=2 {560.0}else{240.0};
    desired.min(work.size.height as f64/scale.max(0.1))
}

const CARRIER_GAP_LOGICAL: f64 = 16.0;

// The visible tile moves inside this fixed transparent input carrier. Previous
// target positions remain game-owned, so a near miss cannot reach the desktop
// while the visible fireball still has room to feint and commit elsewhere.
fn peripheral_carrier_slot(
    client: &PhysicalRect<i32, u32>,
    work: &PhysicalRect<i32, u32>,
    scale: f64,
    index: u8,
    count: u8,
    seed: u32,
) -> Option<PhysicalPosition<i32>> {
    if count == 0 || count > 4 || index >= count || !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    let side = (logical_size(index) * scale).round();
    let tile_height=(carrier_height(count,work,scale)*scale).round();
    let gap = (CARRIER_GAP_LOGICAL * scale).round();
    let left = work.position.x as f64;
    let top = work.position.y as f64;
    let right = left + work.size.width as f64;
    let bottom = top + work.size.height as f64;
    if side > work.size.width as f64 || side > work.size.height as f64 {
        return None;
    }
    let client_left = client.position.x as f64;
    let client_right = client_left + client.size.width as f64;
    let outside_left = client_left - gap - side;
    let outside_right = client_right + gap;
    let mut left_column = if outside_left >= left && outside_left + side <= right {
        outside_left
    } else {
        client_left + gap
    }
    .clamp(left, right - side);
    let mut right_column = if outside_right >= left && outside_right + side <= right {
        outside_right
    } else {
        client_right - gap - side
    }
    .clamp(left, right - side);
    let variation = if seed == 0 {
        0.0
    } else {
        let mixed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        ((mixed >> 8) % 121) as f64 - 60.0
    } * scale;
    let anchor_y = client.position.y as f64 + client.size.height as f64 * 0.5 + variation;
    let max_side_count = count.div_ceil(2) as f64;
    let column_height = max_side_count * tile_height + (max_side_count - 1.0) * gap;
    if count > 1
        && right_column - left_column < side + gap
        && side * 2.0 + gap <= work.size.width as f64
    {
        // A mostly offscreen main window can collapse both preferred columns
        // onto one edge. Recover the reserved pair as one formation.
        let width = side * 2.0 + gap;
        let pair_left =
            (client_left + client.size.width as f64 * 0.5 - width * 0.5).clamp(left, right - width);
        left_column = pair_left;
        right_column = pair_left + side + gap;
    }
    if (count == 1 || right_column - left_column >= side + gap)
        && column_height <= work.size.height as f64
    {
        // Original right/left membership and rank are immutable for this cast;
        // arriving, caught, and absent siblings all keep their reserved slot.
        let right_side = index % 2 == 0;
        let side_count = if right_side {
            count.div_ceil(2)
        } else {
            count / 2
        } as f64;
        let height = side_count * tile_height + (side_count - 1.0) * gap;
        let column_top = (anchor_y - height * 0.5).clamp(top, bottom - height);
        return Some(PhysicalPosition::new(
            if right_side {
                right_column
            } else {
                left_column
            }
            .round() as i32,
            (column_top + (index / 2) as f64 * (tile_height + gap)).round() as i32,
        ));
    }
    // A shallow or obstructed desktop uses a complete reserved row. If that
    // cannot fit either, decline the native cast rather than overlap carriers.
    let width = count as f64 * side + count.saturating_sub(1) as f64 * gap;
    if width > work.size.width as f64 {
        return None;
    }
    let anchor_x = client_left + client.size.width as f64 * 0.5;
    let row_left = (anchor_x - width * 0.5).clamp(left, right - width);
    let rank = if index % 2 == 0 {
        count - 1 - index / 2
    } else {
        index / 2
    };
    Some(PhysicalPosition::new(
        (row_left + rank as f64 * (tile_height + gap)).round() as i32,
        (anchor_y - tile_height * 0.5).clamp(top, bottom - tile_height).round() as i32,
    ))
}

fn carrier_slot_for_cast(
    client: &PhysicalRect<i32, u32>,
    work: &PhysicalRect<i32, u32>,
    scale: f64,
    cast: &CastStep,
) -> Option<PhysicalPosition<i32>> {
    peripheral_carrier_slot(client, work, scale, cast.index, cast.count, cast.seed)
}

struct CarrierPlacement {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct CarrierPointer {
    seed: u32,
    index: u8,
    x: f64,
    y: f64,
    active: bool,
    width:f64,
    height:f64,
}

fn carrier_pointer_sample(
    placement: &CarrierPlacement,
    cursor: PhysicalPosition<f64>,
    seed: u32,
    index: u8,
    active: bool,
) -> Option<CarrierPointer> {
    let scale = placement.size.width as f64 / logical_size(index);
    if scale <= 0.0 || !cursor.x.is_finite() || !cursor.y.is_finite() {
        return None;
    }
    let x = (cursor.x - placement.position.x as f64) / scale;
    let y = (cursor.y - placement.position.y as f64) / scale;
    if !x.is_finite() || !y.is_finite() {
        return None;
    }
    Some(CarrierPointer {
        seed,
        index,
        x,
        y,
        active,
        width:placement.size.width as f64/scale,
        height:placement.size.height as f64/scale,
    })
}

// One fixed native input carrier per original ray. All visible movement and
// offer variation happen inside it; phase, pointer and live membership cannot
// move the native window out from under a click.
#[tauri::command]
pub fn chunk_fireball_cast_step(
    app: AppHandle,
    casts: Vec<CastStep>,
    #[allow(unused_variables)] choreography: Option<Choreography>,
) -> Result<u8, String> {
    if casts.len() > 4 {
        return Ok(0);
    }
    // One desktop sample serves the batch. The child also uses local pointer
    // events to acquire immediately when the hand reaches its painted tile.
    let cursor = app.cursor_position().ok();
    let active = game_owns_keyboard(&app);
    let mut moved = 0u8;
    for cast in &casts {
        let Ok(Some(placement)) = base_center(&app, cast) else {
            continue;
        };
        if apply_placement(&app, &cast.label, &placement).unwrap_or(false) {
            moved = moved.saturating_add(1);
            if let Some(pointer) = cursor.and_then(|cursor| {
                carrier_pointer_sample(&placement, cursor, cast.seed, cast.index, active)
            }) {
                let _ = app.emit_to(&cast.label, "fireball-cast-pointer", pointer);
            }
        }
    }
    Ok(moved)
}

#[tauri::command]
pub fn chunk_fireball_cast_place(
    app: AppHandle,
    label: String,
    index: u8,
    count: u8,
    ray: FireballRay,
) -> Result<bool, String> {
    place_one(&app, &label, index, count, &ray, 0.0)
}

fn base_center(app: &AppHandle, cast: &CastStep) -> Result<Option<CarrierPlacement>, String> {
    if !allowed(&cast.label, cast.index, cast.count)
        || ![
            cast.ray.direction.x,
            cast.ray.direction.y,
            cast.ray.exit.x,
            cast.ray.exit.y,
        ]
        .iter()
        .all(|value| value.is_finite())
    {
        return Ok(None);
    }
    let main = main_window(app)?;
    if main.is_fullscreen().unwrap_or(false) {
        return Ok(None);
    }
    if app.get_webview_window(&cast.label).is_none() {
        return Ok(None);
    }
    let client = PhysicalRect {
        position: main.inner_position().map_err(|error| error.to_string())?,
        size: main.inner_size().map_err(|error| error.to_string())?,
    };
    let anchor = (
        client.position.x as f64 + client.size.width as f64 * 0.5,
        client.position.y as f64 + client.size.height as f64 * 0.5,
    );
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let Some(monitor) = monitors
        .iter()
        .find(|monitor| contains(monitor.work_area(), anchor.0, anchor.1))
    else {
        return Ok(None);
    };
    let scale = monitor.scale_factor().max(0.1);
    Ok(
        carrier_slot_for_cast(&client, monitor.work_area(), scale, cast).map(|position| {
            CarrierPlacement {
                position,
                size: PhysicalSize::new(
                    (logical_size(cast.index) * scale).round() as u32,
                    (carrier_height(cast.count, monitor.work_area(), scale) * scale).round() as u32,
                ),
            }
        }),
    )
}

fn apply_placement(
    app: &AppHandle,
    label: &str,
    placement: &CarrierPlacement,
) -> Result<bool, String> {
    let surface = app
        .get_webview_window(label)
        .ok_or_else(|| "fireball surface not found".to_string())?;
    let main = main_window(app)?;
    let owned_keyboard = game_owns_keyboard(app);
    if surface.inner_size().ok() != Some(placement.size) {
        surface
            .set_size(placement.size)
            .map_err(|error| error.to_string())?;
    }
    if surface.outer_position().ok() != Some(placement.position) {
        surface
            .set_position(placement.position)
            .map_err(|error| error.to_string())?;
    }
    let _ = surface.set_always_on_top(owned_keyboard);
    // The target receives clicks, but revealing or repositioning it must never
    // make it key. Tauri's ordinary macOS show calls makeKeyAndOrderFront.
    let _ = surface.set_focusable(true);
    let _ = surface.set_ignore_cursor_events(false);
    if !surface.is_visible().unwrap_or(false) {
        show_cast_without_focus(&surface)?;
        // Platforms using the generic reveal may focus the shown surface.
        // Restore only focus that the game owned before this reveal.
        if owned_keyboard && surface.is_focused().unwrap_or(false) {
            let _ = main.set_focus();
        }
    }
    Ok(true)
}

#[cfg(target_os = "macos")]
fn show_cast_without_focus(surface: &WebviewWindow) -> Result<(), String> {
    let window = surface.clone();
    surface
        .run_on_main_thread(move || {
            use std::ffi::{c_char, c_void};
            #[link(name = "objc")]
            extern "C" {
                fn sel_registerName(name: *const c_char) -> *mut c_void;
                fn objc_msgSend();
            }
            let Ok(handle) = window.ns_window() else {
                return;
            };
            unsafe {
                let order_front: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) =
                    std::mem::transmute(objc_msgSend as *const ());
                order_front(
                    handle,
                    sel_registerName(b"orderFront:\0".as_ptr().cast()),
                    std::ptr::null_mut(),
                );
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
fn show_cast_without_focus(surface: &WebviewWindow) -> Result<(), String> {
    surface
        .set_focusable(false)
        .map_err(|error| error.to_string())?;
    let shown = surface.show().map_err(|error| error.to_string());
    let focusable = surface
        .set_focusable(true)
        .map_err(|error| error.to_string());
    shown.and(focusable)
}

fn place_one(
    app: &AppHandle,
    label: &str,
    index: u8,
    count: u8,
    ray: &FireballRay,
    progress: f64,
) -> Result<bool, String> {
    if crate::source_desktop::active() {
        return Ok(false);
    }
    let cast = CastStep {
        label: label.into(),
        index,
        count,
        ray: ray.clone(),
        seed: 0,
        progress,
        dodge: None,
        formation_progress: None,
    };
    match base_center(app, &cast)? {
        Some(placement) => apply_placement(app, label, &placement),
        None => Ok(false),
    }
}

// A cast surface is a projectile, not a window. Whatever the compositor does
// about activation when one is clicked, the keyboard belongs to the game.
#[tauri::command]
pub fn chunk_fireball_cast_focus_main(app: AppHandle) -> bool {
    match main_window(&app) {
        Ok(main) => main.set_focus().is_ok(),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn chunk_fireball_cast_hide_all(app: AppHandle) -> bool {
    hide_all(&app)
}

fn hide_all(app: &AppHandle) -> bool {
    for label in FIREBALL_LABELS {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.hide();
        }
    }
    true
}

pub fn recover_stale_snapshot(app: &AppHandle) -> bool {
    let _ = restore_transaction(app, None);
    hide_all(app) && hide_media(app)
}
pub fn restore_on_exit(app: &AppHandle) -> bool {
    let _ = restore_transaction(app, None);
    hide_all(app) && hide_media(app)
}

#[cfg(test)]
mod tests {
    use super::{
        allowed, carrier_height, carrier_pointer_sample, carrier_slot_for_cast, clamped_square, eased, logical_size,
        peripheral_carrier_slot, valid_media_label, CarrierPlacement, CastStep, Choreography,
        FireballRay, RayPoint,
    };
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize};

    #[test]
    fn fixed_labels_only_and_four_surface_maximum() {
        assert!(allowed("fireball-cast-1", 0, 4));
        assert!(allowed("fireball-cast-4", 3, 4));
        assert!(!allowed("main", 0, 1));
        assert!(!allowed("fireball-cast-1", 0, 5));
        assert!(!allowed("fireball-cast-2", 0, 2));
    }

    #[test]
    fn media_pool_is_separate_and_allows_eight_authored_surfaces() {
        assert!(valid_media_label("window-media-1", 0));
        assert!(valid_media_label("window-media-8", 7));
        assert!(!valid_media_label("fireball-cast-1", 0));
        assert!(!valid_media_label("window-media-8", 6));
    }

    #[test]
    fn native_pointer_samples_convert_desktop_coordinates_to_carrier_css_pixels() {
        for scale in [1.0, 2.0] {
            let placement = CarrierPlacement {
                position: PhysicalPosition::new(-3000, -160),
                size: PhysicalSize::new((240.0 * scale) as u32, (240.0 * scale) as u32),
            };
            let cursor = PhysicalPosition::new(-3000.0 + 123.5 * scale, -160.0 + 72.25 * scale);
            let sample = carrier_pointer_sample(&placement, cursor, 0x12345678, 2, true).unwrap();
            assert_eq!(sample.x, 123.5);
            assert_eq!(sample.y, 72.25);
            assert_eq!(sample.seed, 0x12345678);
            assert_eq!(sample.index, 2);
            assert!(sample.active);
        }
    }

    #[test]
    fn native_pointer_samples_keep_approach_distance_and_reject_invalid_coordinates() {
        let placement = CarrierPlacement {
            position: PhysicalPosition::new(-3000, -160),
            size: PhysicalSize::new(480, 480),
        };
        let outside = carrier_pointer_sample(
            &placement,
            PhysicalPosition::new(-3050.0, 360.0),
            77,
            1,
            false,
        )
        .unwrap();
        assert_eq!((outside.x, outside.y), (-25.0, 260.0));
        assert!(
            !outside.active,
            "a different application owning focus disables reaction"
        );
        for cursor in [
            PhysicalPosition::new(f64::NAN, 0.0),
            PhysicalPosition::new(0.0, f64::INFINITY),
        ] {
            assert!(carrier_pointer_sample(&placement, cursor, 77, 1, true).is_none());
        }
        let invalid = CarrierPlacement {
            position: placement.position,
            size: PhysicalSize::new(0, 0),
        };
        assert!(
            carrier_pointer_sample(&invalid, PhysicalPosition::new(0.0, 0.0), 77, 1, true)
                .is_none()
        );
    }

    fn cast_step(index: u8, count: u8) -> CastStep {
        CastStep {
            label: format!("fireball-cast-{}", index + 1),
            index,
            count,
            seed: 0x12345678,
            ray: FireballRay {
                direction: RayPoint {
                    x: if index % 2 == 0 { 1.0 } else { -1.0 },
                    y: 0.0,
                },
                exit: RayPoint {
                    x: if index % 2 == 0 { 1.0 } else { 0.0 },
                    y: 0.5,
                },
            },
            progress: 0.0,
            dodge: Some(0.0),
            formation_progress: Some(0.0),
        }
    }

    fn rect(x: f64, y: f64, width: f64, height: f64, scale: f64) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new((x * scale).round() as i32, (y * scale).round() as i32),
            size: PhysicalSize::new(
                (width * scale).round() as u32,
                (height * scale).round() as u32,
            ),
        }
    }

    fn assert_carriers_fit(
        client: &PhysicalRect<i32, u32>,
        work: &PhysicalRect<i32, u32>,
        scale: f64,
        count: u8,
    ) {
        let side = (logical_size(0) * scale).round() as i32;
        let height=(carrier_height(count,work,scale)*scale).round() as i32;
        let positions: Vec<_> = (0..count)
            .map(|index| peripheral_carrier_slot(client, work, scale, index, count, 1543).unwrap())
            .collect();
        for (index, position) in positions.iter().enumerate() {
            assert!(position.x >= work.position.x && position.y >= work.position.y);
            assert!(position.x + side <= work.position.x + work.size.width as i32);
            assert!(position.y + height <= work.position.y + work.size.height as i32);
            for other in positions.iter().skip(index + 1) {
                assert!(
                    position.x + side <= other.x
                        || other.x + side <= position.x
                        || position.y + height <= other.y
                        || other.y + height <= position.y
                );
            }
        }
    }

    #[test]
    fn native_cast_accepts_seed_and_legacy_pose_without_using_it_for_placement() {
        let cast: CastStep = serde_json::from_value(serde_json::json!({
            "label": "fireball-cast-2", "index": 1, "count": 4, "seed": 4294967295u32,
            "ray": { "direction": { "x": -1, "y": 0 }, "exit": { "x": 0, "y": 0.5 } },
            "progress": 0.72, "formationProgress": 1, "dodge": 0
        }))
        .unwrap();
        assert_eq!(cast.seed, u32::MAX);
        assert_eq!(cast.formation_progress, Some(1.0));
        let no_seed: CastStep = serde_json::from_value(serde_json::json!({
            "label": "fireball-cast-1", "index": 0, "count": 1,
            "ray": { "direction": { "x": 1, "y": 0 }, "exit": { "x": 1, "y": 0.5 } }
        }))
        .unwrap();
        assert_eq!(no_seed.seed, 0);
        let dance: Choreography =
            serde_json::from_value(serde_json::json!({ "formationProgress": 0.65 })).unwrap();
        assert_eq!(dance.formation_progress, 0.65);
    }

    #[test]
    fn carriers_are_separate_and_onscreen_at_all_counts_scales_and_negative_origins() {
        for scale in [1.0, 1.25, 2.0] {
            for origin in [0.0, -1920.0] {
                let work = rect(origin, -120.0, 1920.0, 1080.0, scale);
                for client_x in [origin - 400.0, origin + 320.0, origin + 1400.0] {
                    let client = rect(client_x, 100.0, 960.0, 600.0, scale);
                    for count in 1..=4 {
                        assert_carriers_fit(&client, &work, scale, count);
                    }
                }
            }
        }
    }

    #[test]
    fn carriers_prefer_the_original_launch_side_outside_the_main_frame() {
        let client = rect(320.0, 100.0, 960.0, 600.0, 1.0);
        let work = rect(0.0, 24.0, 1920.0, 1080.0, 1.0);
        for count in 1..=4 {
            for index in 0..count {
                let position =
                    peripheral_carrier_slot(&client, &work, 1.0, index, count, 0).unwrap();
                if index % 2 == 0 {
                    assert_eq!(position.x, 1296);
                } else {
                    assert_eq!(position.x + 240, 304);
                }
            }
        }
    }

    #[test]
    fn unavailable_outer_space_uses_edge_hugging_carriers_away_from_the_command_deck() {
        let client = rect(0.0, 24.0, 1280.0, 760.0, 1.0);
        let work = rect(0.0, 24.0, 1280.0, 800.0, 1.0);
        assert_carriers_fit(&client, &work, 1.0, 4);
        for index in 0..4 {
            let position = peripheral_carrier_slot(&client, &work, 1.0, index, 4, 0).unwrap();
            if index % 2 == 0 {
                assert_eq!(position.x + 240, 1264);
                assert!(position.x > 800);
            } else {
                assert_eq!(position.x, 16);
                assert!(position.x + 240 < 480);
            }
        }
    }

    #[test]
    fn shallow_desktops_use_a_complete_reserved_row_and_impossible_layouts_are_declined() {
        let client = rect(320.0, 0.0, 960.0, 300.0, 1.0);
        let work = rect(0.0, 0.0, 1920.0, 320.0, 1.0);
        assert_carriers_fit(&client, &work, 1.0, 4);
        let positions: Vec<_> = (0..4)
            .map(|index| peripheral_carrier_slot(&client, &work, 1.0, index, 4, 0).unwrap())
            .collect();
        assert!(positions
            .iter()
            .all(|position| position.y == positions[0].y));
        let narrow = rect(0.0, 0.0, 500.0, 800.0, 1.0);
        assert_carriers_fit(&client, &narrow, 1.0, 4);
        let impossible = rect(0.0, 0.0, 500.0, 300.0, 1.0);
        assert!(peripheral_carrier_slot(&client, &impossible, 1.0, 0, 4, 0).is_none());
    }

    #[test]
    fn one_cast_keeps_its_carriers_while_visible_pose_and_sibling_membership_change() {
        let client = rect(320.0, 100.0, 960.0, 600.0, 1.0);
        let work = rect(0.0, 24.0, 1920.0, 1080.0, 1.0);
        let casts: Vec<_> = (0..4).map(|index| cast_step(index, 4)).collect();
        let original: Vec<_> = casts
            .iter()
            .map(|cast| carrier_slot_for_cast(&client, &work, 1.0, cast))
            .collect();
        for removed in 0..4 {
            for cast in casts.iter().filter(|cast| cast.index != removed) {
                for phase in [0.0, 0.4, 1.0, 0.4, 0.0] {
                    let mut animated = cast.clone();
                    animated.progress = phase;
                    animated.dodge = Some(1.0 - phase);
                    animated.formation_progress = Some(phase);
                    assert_eq!(
                        carrier_slot_for_cast(&client, &work, 1.0, &animated),
                        original[cast.index as usize]
                    );
                }
            }
        }
    }

    #[test]
    fn cast_seed_varies_peripheral_height_within_sixty_logical_pixels_and_is_repeatable() {
        let client = rect(320.0, 100.0, 960.0, 600.0, 1.0);
        let work = rect(0.0, 24.0, 1920.0, 1080.0, 1.0);
        let baseline = peripheral_carrier_slot(&client, &work, 1.0, 0, 1, 0).unwrap();
        let mut positions = std::collections::HashSet::new();
        for seed in 1..=32 {
            let position = peripheral_carrier_slot(&client, &work, 1.0, 0, 1, seed).unwrap();
            assert_eq!(position.x, baseline.x);
            assert!((position.y - baseline.y).abs() <= 60);
            assert_eq!(
                Some(position),
                peripheral_carrier_slot(&client, &work, 1.0, 0, 1, seed)
            );
            positions.insert(position.y);
        }
        assert!(positions.len() > 8);
    }

    #[test]
    fn logical_dpi_and_negative_monitor_positions_are_clamped() {
        let work = PhysicalRect {
            position: PhysicalPosition::new(-3840, -120),
            size: PhysicalSize::new(3840, 2160),
        };
        let at = clamped_square((-20.0, 2100.0), logical_size(3), &work, 2.0);
        let physical = (logical_size(3) * 2.0) as i32;
        assert!(at.x >= -3840 && at.x + physical <= 0);
        assert!(at.y >= -120 && at.y + physical <= 2040);
    }

    #[test]
    fn native_main_frame_easing_has_exact_endpoints() {
        for curve in ["linear", "out-cubic", "in-cubic", "in-out-cubic"] {
            assert!((eased(0.0, curve) - 0.0).abs() < 1e-9);
            assert!((eased(1.0, curve) - 1.0).abs() < 1e-9);
        }
        assert!(eased(0.5, "out-cubic") > 0.5);
    }
}
