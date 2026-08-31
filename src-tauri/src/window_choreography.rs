use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, WebviewWindow,
    WindowEvent,
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
    decorated: bool,
    was_focused: bool,
    scale_factor: f64,
    monitor_work_area: Option<PhysicalRect<i32, u32>>,
    restore_game_mode: bool,
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

fn valid_token(value: &str) -> bool {
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

#[tauri::command]
pub fn chunk_window_choreography_begin(
    app: AppHandle,
    request: ChoreographyBeginRequest,
) -> Result<bool, String> {
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
    let main = main_window(&app)?;
    if request.restore_game_mode {
        let _ = main.set_simple_fullscreen(false);
        let _ = main.set_fullscreen(false);
    }
    let stable = current_bounds(&main)?;
    let decorated = main.is_decorated().unwrap_or(true);
    let was_focused = main.is_focused().unwrap_or(true);
    let monitor = main.current_monitor().ok().flatten();
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
        decorated,
        was_focused,
        scale_factor,
        monitor_work_area,
        restore_game_mode: request.restore_game_mode,
        cancelled: false,
        generation: 0,
        applying_until: None,
        expected_position: None,
        expected_size: None,
    });
    Ok(true)
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

fn restore_transaction(app: &AppHandle, required: Option<&str>) -> Result<bool, String> {
    let active = {
        let mut slot = transaction()
            .lock()
            .map_err(|_| "transaction lock poisoned".to_string())?;
        if required.is_some_and(|token| slot.as_ref().is_none_or(|value| value.token != token)) {
            return Ok(false);
        }
        slot.take()
    };
    let Some(active) = active else {
        return Ok(false);
    };
    let main = main_window(app)?;
    let _ = main.set_simple_fullscreen(false);
    let _ = main.set_fullscreen(false);
    let _ = main.set_decorations(active.decorated);
    main.set_position(active.stable.position)
        .map_err(|error| error.to_string())?;
    main.set_size(active.stable.size)
        .map_err(|error| error.to_string())?;
    if active.restore_game_mode {
        let _ = main.set_simple_fullscreen(true);
    }
    if active.was_focused {
        let _ = main.set_focus();
    }
    Ok(true)
}

#[tauri::command]
pub fn chunk_window_choreography_restore(app: AppHandle, token: String) -> Result<bool, String> {
    restore_transaction(&app, Some(&token))
}

// Called from the app-wide window event hook. Programmatic geometry events
// match the expected frame. Anything else is a player intervention: cancel the
// tween and make the new geometry the exact restore target.
pub fn note_main_window_event(app: &AppHandle, event: &WindowEvent) {
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
    let _ = surface.set_ignore_cursor_events(!request.interactive);
    let _ = surface.show();
    Ok(true)
}

fn valid_media_label(label: &str, index: u8) -> bool {
    MEDIA_LABELS.get(index as usize) == Some(&label)
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
    let _ = surface.set_ignore_cursor_events(false);
    let _ = surface.show();
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
            let _ = window.hide();
        }
    }
    true
}

#[tauri::command]
pub fn chunk_window_media_hide_if_unfocused(app: AppHandle) -> bool {
    let focused = std::iter::once("main")
        .chain(FIREBALL_LABELS)
        .chain(MEDIA_LABELS)
        .any(|label| {
            app.get_webview_window(label)
                .is_some_and(|window| window.is_focused().unwrap_or(false))
        });
    if !focused {
        hide_media(&app);
    }
    !focused
}

fn allowed(label: &str, index: u8, count: u8) -> bool {
    count > 0 && count <= 4 && index < count && FIREBALL_LABELS.get(index as usize) == Some(&label)
}

fn logical_size(_index: u8) -> f64 {
    128.0
}

// How much closer it gets, and the hard ceiling on that. A comet ends its
// flight a little over twice the size it left at -- enough to read as bearing
// down, nowhere near enough to be furniture.
const APPROACH_GROWTH: f64 = 1.25;
const APPROACH_MAX_LOGICAL: f64 = 160.0;

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
pub struct CastStep {
    label: String,
    index: u8,
    count: u8,
    ray: FireballRay,
    #[serde(default)]
    progress: f64,
}

// WHAT THE SHOAL IS DOING THIS FRAME.
//
// Every number is decided on the game side -- see fireball-choreography.js --
// because the escalation belongs to the fight, not to the compositor. What
// happens in here is only the geometry the game cannot do: where the cursor
// actually is on the desk, and where four windows have to be to not be there.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct Choreography {
    // Break strength this frame, already eased and already zero during a
    // settle. One number, so a settled shoal costs nothing to draw.
    #[serde(default)]
    dodge: f64,
    // How far they will go, as a multiple of a surface's own width.
    #[serde(default)]
    reach: f64,
    // How far ahead of the pointer they aim, in milliseconds of its own travel.
    #[serde(default)]
    sense_ms: f64,
    // 1 is one body moving; 0 is four windows each looking after itself.
    #[serde(default)]
    cohesion: f64,
    #[serde(default)]
    gesture: String,
    #[serde(default)]
    formation_progress: f64,
}

#[derive(Clone, Copy)]
struct CursorSample {
    x: f64,
    y: f64,
    at: std::time::Instant,
}

static CURSOR: std::sync::OnceLock<std::sync::Mutex<Option<CursorSample>>> =
    std::sync::OnceLock::new();

// NOTHING IS CAPTURED. `AppHandle::cursor_position` is `NSEvent.mouseLocation`
// on macOS and the equivalent plain query elsewhere: two coordinates, read on
// demand, in the same process. It is not a screen recording, not a screenshot,
// not an event tap, and it asks for no permission -- there is no capture crate
// in this binary and this feature must never introduce one. The shoal needs to
// know where a pointer is; it has no business knowing what is under it.
//
// WHERE THE POINTER IS GOING, NOT WHERE IT IS.
//
// A shoal that runs from the cursor's current position cannot be caught by
// moving quickly and cannot be missed by moving slowly -- neither of which is a
// decision. Running from its PREDICTED position can be beaten by aiming at
// where the windows will be, which is the same read the rest of the fight asks
// for. Velocity is measured between frames and heavily damped, so a flick does
// not throw the prediction across the desk.
fn predicted_cursor(app: &AppHandle, sense_ms: f64) -> Option<(f64, f64)> {
    let now = app.cursor_position().ok()?;
    let at = std::time::Instant::now();
    let cell = CURSOR.get_or_init(|| std::sync::Mutex::new(None));
    let mut slot = cell.lock().ok()?;
    let previous = *slot;
    *slot = Some(CursorSample {
        x: now.x,
        y: now.y,
        at,
    });
    let Some(last) = previous else {
        return Some((now.x, now.y));
    };
    let dt = at.duration_since(last.at).as_secs_f64();
    if !(dt > 0.001 && dt < 0.25) {
        return Some((now.x, now.y));
    }
    let lead = (sense_ms.max(0.0) / 1000.0).min(0.5);
    // Capped: a fast flick predicts a long way, and a shoal that reacts to a
    // metre of imagined travel is reacting to nothing.
    let vx = ((now.x - last.x) / dt).clamp(-4000.0, 4000.0);
    let vy = ((now.y - last.y) / dt).clamp(-4000.0, 4000.0);
    Some((now.x + vx * lead, now.y + vy * lead))
}

// ONE CALL PER FRAME FOR THE WHOLE CAST, NOT ONE PER SURFACE.
//
// The comet is meant to cross the desktop, and a window only crosses anything
// if something moves it. The frame clock lives on the game side -- it is the
// same clock the player can pause, and the same one that decides the comet has
// landed -- so the movement is driven from there rather than by a timer in here
// that would keep flying through authored dialogue. Batched because four
// surfaces at sixty frames a second is otherwise four times the IPC for one
// event that is always about all of them at once.
#[tauri::command]
pub fn chunk_fireball_cast_step(
    app: AppHandle,
    casts: Vec<CastStep>,
    #[allow(unused_mut)] mut choreography: Option<Choreography>,
) -> Result<u8, String> {
    if casts.len() > 4 {
        return Ok(0);
    }
    let dance = choreography.take().unwrap_or_default();
    // Where every surface would be if nothing were chasing it.
    let mut bases = Vec::with_capacity(casts.len());
    for cast in &casts {
        match base_center(
            &app,
            &cast.label,
            cast.index,
            cast.count,
            &cast.ray,
            cast.progress,
        ) {
            Ok(Some(base)) => bases.push(Some(base)),
            _ => bases.push(None),
        }
    }
    let live: Vec<&BaseCenter> = bases.iter().flatten().collect();
    if live.is_empty() {
        return Ok(0);
    }

    // ONE BODY. The offset is computed from the formation's centre and applied
    // to all of it, so they break together instead of each solving its own
    // little problem -- which is the whole difference between a shoal and four
    // windows being annoying in parallel.
    let centre = (
        live.iter().map(|base| base.center.0).sum::<f64>() / live.len() as f64,
        live.iter().map(|base| base.center.1).sum::<f64>() / live.len() as f64,
    );
    let span = live
        .iter()
        .map(|base| base.side)
        .fold(0.0_f64, f64::max)
        .max(1.0);
    let dodge = dance.dodge.clamp(0.0, 1.0);
    let mut shared = (0.0_f64, 0.0_f64);
    let mut fan = (0.0_f64, 0.0_f64);
    if dodge > 0.001 {
        if let Some(aim) = predicted_cursor(&app, dance.sense_ms) {
            let (dx, dy) = (centre.0 - aim.0, centre.1 - aim.1);
            let distance = dx.hypot(dy);
            // They only run from something that is actually coming for them.
            // Beyond about three surface-widths the pointer is not a threat and
            // the formation holds, which is what makes the break legible.
            let threat = (1.0 - (distance / (span * 3.2)).min(1.0)).powf(1.4);
            if threat > 0.001 && distance > 0.5 {
                let reach = dance.reach.max(0.0) * span * dodge * threat;
                shared = (dx / distance * reach, dy / distance * reach);
                // Perpendicular, so the ones on the outside of the turn swing
                // wider. Scaled by the INVERSE of cohesion: late in the night
                // they hold formation and move as one.
                let loose = 1.0 - dance.cohesion.clamp(0.0, 1.0);
                fan = (
                    -dy / distance * reach * loose * 0.9,
                    dx / distance * reach * loose * 0.9,
                );
            }
        }
    }

    let mut moved = 0u8;
    let middle = (live.len() as f64 - 1.0) * 0.5;
    let mut rank = 0.0_f64;
    for (cast, base) in casts.iter().zip(bases.iter()) {
        let Some(base) = base else { continue };
        let offset = (rank - middle) * 1.0;
        let p = dance.formation_progress.clamp(0.0, 1.0);
        let formation = match dance.gesture.as_str() {
            // Bodies reaching the surface: one legible upward drift which
            // remains in place for the stationary catch.
            "rise-drift" => (offset * span * 0.12 * p, -span * 0.52 * p),
            // A row taking its seats. They finish level and evenly spaced.
            "seat-align" => (
                centre.0 + offset * span * 0.72 - base.center.0,
                centre.1 - base.center.1,
            ),
            // One obsessive rewind loop, back on its mark at the count.
            "retake-loop" => {
                let looped = (p * std::f64::consts::PI).sin();
                (-span * 0.44 * looped, offset * span * 0.14 * looped)
            }
            // One complete orbit before commitment; no motion during catch.
            "orbit" => {
                let angle = (offset / (live.len().max(1) as f64)) * std::f64::consts::TAU
                    + p * std::f64::consts::TAU;
                (angle.cos() * span * 0.42, angle.sin() * span * 0.42)
            }
            // Expand, exchange places, then recombine before commitment.
            "swarm-recombine" => {
                let spread = (p * std::f64::consts::PI).sin();
                (
                    offset * span * 0.58 * spread,
                    (offset * 2.1).sin() * span * 0.34 * spread,
                )
            }
            _ => (0.0, 0.0),
        };
        rank += 1.0;
        let center = (
            base.center.0 + formation.0 + shared.0 + fan.0 * offset,
            base.center.1 + formation.1 + shared.1 + fan.1 * offset,
        );
        if apply_placement(&app, &cast.label, base, center).unwrap_or(false) {
            moved = moved.saturating_add(1);
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

// Where a surface would be with nothing chasing it, kept separate from the act
// of putting it there so the shoal can be moved as a group afterwards.
struct BaseCenter {
    center: (f64, f64),
    side: f64,
    work: PhysicalRect<i32, u32>,
    scale: f64,
}

fn base_center(
    app: &AppHandle,
    label: &str,
    index: u8,
    count: u8,
    ray: &FireballRay,
    progress: f64,
) -> Result<Option<BaseCenter>, String> {
    let progress = if progress.is_finite() {
        progress.clamp(0.0, 1.0)
    } else {
        0.0
    };
    if !allowed(label, index, count)
        || ![ray.direction.x, ray.direction.y, ray.exit.x, ray.exit.y]
            .iter()
            .all(|v| v.is_finite())
    {
        return Ok(None);
    }
    let main = main_window(app)?;
    if main.is_fullscreen().unwrap_or(false) {
        return Ok(None);
    }
    if app.get_webview_window(label).is_none() {
        return Ok(None);
    }
    let position = main.outer_position().map_err(|e| e.to_string())?;
    let size = main.outer_size().map_err(|e| e.to_string())?;
    let logical = logical_size(index);
    // ONE LINE, FROM THE STAGE TO THE DESKTOP, AND THEN BACK AT YOU.
    //
    // The stage the comet crosses is a band inside the combat panel, so leaving
    // it is not yet leaving the window. Follow the same line from the stage exit
    // out to the window's own edge -- and from there it is coming at the player:
    // in toward the middle of the game window, growing the whole way until it
    // covers it. Squared, because an object approaching at a constant speed does
    // not grow at a constant rate; it hangs small and far off, and then it is on
    // you.
    let (w, h) = (size.width as f64, size.height as f64);
    let anchor = (ray.exit.x * w, ray.exit.y * h);
    let (mut dx, mut dy) = (ray.direction.x * w, ray.direction.y * h);
    let length = dx.hypot(dy);
    if length > f64::EPSILON {
        dx /= length;
        dy /= length;
    } else {
        dx = 1.0;
        dy = 0.0;
    }
    let mut edge = f64::MAX;
    if dx > 1e-6 {
        edge = edge.min((w - anchor.0) / dx);
    } else if dx < -1e-6 {
        edge = edge.min(-anchor.0 / dx);
    }
    if dy > 1e-6 {
        edge = edge.min((h - anchor.1) / dy);
    } else if dy < -1e-6 {
        edge = edge.min(-anchor.1 / dy);
    }
    if !edge.is_finite() || edge < 0.0 {
        edge = 0.0;
    }

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let origin = (position.x as f64 + anchor.0, position.y as f64 + anchor.1);
    let near = (
        origin.0 + dx * (edge + logical),
        origin.1 + dy * (edge + logical),
    );
    let monitor = monitors
        .iter()
        .find(|monitor| contains(monitor.work_area(), near.0, near.1))
        .or_else(|| {
            monitors.iter().find(|monitor| {
                contains(
                    monitor.work_area(),
                    position.x as f64 + w * 0.5,
                    position.y as f64 + h * 0.5,
                )
            })
        })
        .ok_or_else(|| "monitor not found".to_string())?;
    let scale = monitor.scale_factor().max(0.1);
    let clearance = logical * scale * 0.85;
    let near = (
        origin.0 + dx * (edge + clearance),
        origin.1 + dy * (edge + clearance),
    );
    let looming = progress * progress;
    let target = (position.x as f64 + w * 0.5, position.y as f64 + h * 0.5);
    let center = (
        near.0 + (target.0 - near.0) * looming,
        near.1 + (target.1 - near.1) * looming,
    );
    // IT GETS BIGGER BECAUSE IT IS GETTING CLOSER. IT DOES NOT BECOME THE
    // SCREEN.
    //
    // Growing this to the size of the game window took "engulf" literally and
    // put a screen-sized always-on-top surface over everything, which is not a
    // fireball arriving -- it is the desktop being replaced by one. Worse, it
    // is an opaque click target the size of the display sitting between the
    // player and their own game. The engulfing happens INSIDE the window, drawn
    // by the renderer that owns that frame; what belongs out here is a comet
    // that reads as close, and a comet is fist-sized.
    let engulfed = (logical * APPROACH_GROWTH).min(APPROACH_MAX_LOGICAL);
    let side = logical + (engulfed - logical).max(0.0) * looming;
    Ok(Some(BaseCenter {
        center,
        side,
        work: *monitor.work_area(),
        scale,
    }))
}

fn apply_placement(
    app: &AppHandle,
    label: &str,
    base: &BaseCenter,
    center: (f64, f64),
) -> Result<bool, String> {
    let surface = app
        .get_webview_window(label)
        .ok_or_else(|| "fireball surface not found".to_string())?;
    let placed = clamped_square(center, base.side, &base.work, base.scale);
    surface
        .set_size(LogicalSize::new(base.side, base.side))
        .map_err(|e| e.to_string())?;
    surface.set_position(placed).map_err(|e| e.to_string())?;
    let _ = surface.set_always_on_top(true);
    // Click-through was why a fireball outside the frame could not be returned
    // and why clicking one landed on the desktop behind it -- the game's own
    // projectile handing the player's click to the Finder.
    let _ = surface.set_ignore_cursor_events(false);
    let _ = surface.show();
    Ok(true)
}

fn place_one(
    app: &AppHandle,
    label: &str,
    index: u8,
    count: u8,
    ray: &FireballRay,
    progress: f64,
) -> Result<bool, String> {
    match base_center(app, label, index, count, ray, progress)? {
        Some(base) => apply_placement(app, label, &base, base.center),
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
    use super::{allowed, clamped_square, eased, logical_size, valid_media_label};
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

    // The comet leaves the STAGE inside the window and the WINDOW after that,
    // and only then turns and comes back at the player. A surface placed at the
    // stage exit would sit on top of the game it just left.
    #[test]
    fn the_approach_starts_outside_the_bezel_and_ends_as_a_clickable_target() {
        let (w, h) = (1000.0_f64, 800.0_f64);
        let (pos_x, pos_y) = (120.0_f64, 60.0_f64);
        let anchor = (0.95 * w, 0.5 * h);
        let (mut dx, mut dy) = (0.94_f64, -0.34_f64);
        let length = dx.hypot(dy);
        dx /= length;
        dy /= length;
        let mut edge = f64::MAX;
        if dx > 1e-6 {
            edge = edge.min((w - anchor.0) / dx);
        }
        if dy < -1e-6 {
            edge = edge.min(-anchor.1 / dy);
        }
        let logical = 128.0_f64;
        let near = (
            pos_x + anchor.0 + dx * (edge + logical * 0.85),
            pos_y + anchor.1 + dy * (edge + logical * 0.85),
        );
        assert!(near.0 > pos_x + w, "it starts outside the window it left");

        let target = (pos_x + w * 0.5, pos_y + h * 0.5);
        let at = |p: f64| {
            let l = p * p;
            (
                (
                    near.0 + (target.0 - near.0) * l,
                    near.1 + (target.1 - near.1) * l,
                ),
                logical + ((160.0) - logical) * l,
            )
        };
        let (early, small) = at(0.25);
        let (late, large) = at(1.0);
        assert!(small < large, "and grows the whole way in");
        assert!(
            (late.0 - target.0).abs() < 0.5 && (late.1 - target.1).abs() < 0.5,
            "ending on the window's centre"
        );
        assert_eq!(
            large, 160.0,
            "approach growth is capped at the authored click target"
        );
        // Squared easing: a quarter of the way through the flight it has not yet
        // covered a quarter of the distance.
        let span = (target.0 - near.0).abs();
        assert!(
            (early.0 - near.0).abs() < span * 0.25,
            "hanging small and far off before it looms"
        );
    }

    #[test]
    fn the_ray_is_carried_to_the_window_edge_before_it_steps_outside() {
        // A stage band exiting right at the middle of a 1000x800 window, on a
        // line 20 degrees above horizontal.
        let (w, h) = (1000.0_f64, 800.0_f64);
        let anchor = (0.95 * w, 0.5 * h);
        let (mut dx, mut dy) = (0.94_f64, -0.34_f64);
        let length = dx.hypot(dy);
        dx /= length;
        dy /= length;
        let mut edge = f64::MAX;
        if dx > 1e-6 {
            edge = edge.min((w - anchor.0) / dx);
        }
        if dy < -1e-6 {
            edge = edge.min(-anchor.1 / dy);
        }
        assert!(edge > 0.0 && edge.is_finite());
        let at = (anchor.0 + dx * edge, anchor.1 + dy * edge);
        assert!(
            (at.0 - w).abs() < 0.5 || (at.1).abs() < 0.5,
            "the line must land on a window edge"
        );
        let step = edge + 160.0 * 0.85;
        let outside = (anchor.0 + dx * step, anchor.1 + dy * step);
        assert!(
            outside.0 > w,
            "and one surface further puts it past the bezel"
        );
    }

    // THEY MOVE AS ONE BODY, AND ONLY FROM SOMETHING ACTUALLY COMING FOR THEM.
    //
    // The offset is computed once from the formation's centre and applied to
    // all of it; the per-surface fan is scaled by the INVERSE of cohesion, so
    // late in the night they hold formation instead of scattering. And beyond
    // about three surface-widths the pointer is not a threat, which is what
    // makes the break legible rather than constant twitching.
    #[test]
    fn the_shoal_breaks_together_away_from_the_pointer() {
        let span = 200.0_f64;
        let centre = (900.0_f64, 500.0_f64);
        let shove = |aim: (f64, f64), dodge: f64, reach: f64| {
            let (dx, dy) = (centre.0 - aim.0, centre.1 - aim.1);
            let distance = dx.hypot(dy);
            let threat = (1.0 - (distance / (span * 3.2)).min(1.0)).powf(1.4);
            if !(threat > 0.001 && distance > 0.5) {
                return (0.0, 0.0);
            }
            let out = reach * span * dodge * threat;
            (dx / distance * out, dy / distance * out)
        };

        // A pointer bearing down from the left pushes the whole shoal right.
        let near = shove((700.0, 500.0), 1.0, 2.4);
        assert!(
            near.0 > 0.0 && near.1.abs() < 1e-6,
            "straight away from it, not sideways"
        );

        // The same pointer far off does nothing at all.
        let far = shove((-400.0, 500.0), 1.0, 2.4);
        assert_eq!(
            far,
            (0.0, 0.0),
            "a pointer that is not coming for them is not a threat"
        );

        // And a settled shoal does not move however close the pointer gets.
        assert_eq!(
            shove((880.0, 500.0), 0.0, 2.4),
            (0.0, 0.0),
            "a settle is perfectly still"
        );

        // Cohesion decides how much of the movement is the formation and how
        // much is each surface fanning off it.
        let loose_fan = 1.0 - 0.0_f64;
        let tight_fan = 1.0 - 1.0_f64;
        assert!(loose_fan > tight_fan, "the last fight holds formation");
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
