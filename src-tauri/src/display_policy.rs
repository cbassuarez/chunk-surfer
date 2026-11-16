use serde::{Deserialize, Serialize};
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{AppHandle, Manager, WebviewWindow};

const DESIGN_WIDTH: f64 = 1280.0;
const DESIGN_HEIGHT: f64 = 800.0;
const CONFIG_MIN_WIDTH: f64 = 960.0;
const CONFIG_MIN_HEIGHT: f64 = 600.0;
// Predictable logical margins for the menu bar, Dock/taskbar, title bar, and
// resize affordances. Percentage clamps behave badly on ultrawide displays.
const MONITOR_MARGIN_X: f64 = 48.0;
const MONITOR_MARGIN_Y: f64 = 112.0;

// Native fullscreen is reported for recovery only. The legacy simple_fullscreen
// field now identifies our ordinary borderless Fill screen frame; callers using
// the existing choreography protocol can still stage and restore it.
#[derive(Debug, Clone, Serialize)]
pub struct WindowLogicalRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowMetrics {
    pub logical_width: f64,
    pub logical_height: f64,
    pub scale_factor: f64,
    pub fullscreen: bool,
    pub native_fullscreen: bool,
    pub simple_fullscreen: bool,
    // Measured, not remembered: the frame covers the monitor it is on. This is
    // the backstop for a fullscreen the app never asked for — the green
    // traffic-light button, or Cmd+Ctrl+F — which no amount of internal
    // bookkeeping would know about.
    pub fills_screen: bool,
    // Both rectangles use this monitor's logical coordinate scale. Keeping the
    // content origin (rather than the outer titlebar) makes a projected Source
    // string agree on either side of a neighbouring native pane.
    pub content_rect: WindowLogicalRect,
    pub work_area: Option<WindowLogicalRect>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct WindowSizeRequest {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub center: bool,
}

// Kept under its existing protocol name for authored choreography clients.
static SIMPLE_FULLSCREEN: AtomicBool = AtomicBool::new(false);
static FILL_REQUESTED: AtomicBool = AtomicBool::new(false);
pub fn fill_screen_requested() -> bool { FILL_REQUESTED.load(Ordering::SeqCst) }
static DEFERRED_DISPLAY: AtomicBool = AtomicBool::new(false);
static PENDING_STAGE_SIZE: Mutex<Option<WindowSizeRequest>> = Mutex::new(None);

pub fn restore_display_preference(app: &AppHandle) -> Result<(), String> {
    DEFERRED_DISPLAY.store(false, Ordering::SeqCst);
    set_game_mode(app, fill_screen_requested())
}
pub fn finish_deferred_display(app: &AppHandle) {
    if DEFERRED_DISPLAY.swap(false, Ordering::SeqCst) {
        if let Err(error) = set_game_mode(app, fill_screen_requested()) {
            tauri_plugin_log::log::warn!("deferred display change failed: {error}");
        }
    }
}
#[derive(Clone, Copy)]
struct StagedFrame {
    position: tauri::PhysicalPosition<i32>,
    inner: tauri::PhysicalSize<u32>,
    decorated: bool,
}
static STAGED_FRAME: Mutex<Option<StagedFrame>> = Mutex::new(None);

pub fn simple_fullscreen_active() -> bool {
    SIMPLE_FULLSCREEN.load(Ordering::Relaxed)
}
pub fn note_simple_fullscreen(active: bool) {
    SIMPLE_FULLSCREEN.store(active, Ordering::Relaxed);
}

// Does the frame cover the monitor it is on? Deliberately measured rather than
// remembered, with a small tolerance for the shadow/rounding a frame picks up.
fn window_fills_monitor(window: &WebviewWindow) -> bool {
    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };
    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return false;
    };
    let m_pos = monitor.position();
    let m_size = monitor.size();
    let slack = 8i32;
    (position.x - m_pos.x).abs() <= slack
        && (position.y - m_pos.y).abs() <= slack
        && (size.width as i64 - m_size.width as i64).abs() <= slack as i64
        && (size.height as i64 - m_size.height as i64).abs() <= slack as i64
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

fn monitor_safe_logical_size(window: &WebviewWindow) -> Option<(f64, f64)> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let size = monitor.size();
    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return None;
    }
    Some((
        (size.width as f64 / scale - MONITOR_MARGIN_X).max(320.0),
        (size.height as f64 / scale - MONITOR_MARGIN_Y).max(240.0),
    ))
}

fn fit_size_preserving_aspect(
    width: f64,
    height: f64,
    min_w: f64,
    min_h: f64,
    max_w: f64,
    max_h: f64,
) -> (f64, f64) {
    let requested_w = if width.is_finite() && width > 0.0 {
        width
    } else {
        DESIGN_WIDTH
    };
    let requested_h = if height.is_finite() && height > 0.0 {
        height
    } else {
        DESIGN_HEIGHT
    };
    let down = 1.0_f64.min(max_w / requested_w).min(max_h / requested_h);
    let mut fitted_w = requested_w * down;
    let mut fitted_h = requested_h * down;
    let up = 1.0_f64.max(min_w / fitted_w).max(min_h / fitted_h);
    if fitted_w * up <= max_w + 0.5 && fitted_h * up <= max_h + 0.5 {
        fitted_w *= up;
        fitted_h *= up;
    }
    (fitted_w.round(), fitted_h.round())
}

fn effective_default_size(window: &WebviewWindow) -> (f64, f64) {
    if let Some((safe_w, safe_h)) = monitor_safe_logical_size(window) {
        fit_size_preserving_aspect(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            CONFIG_MIN_WIDTH.min(safe_w),
            CONFIG_MIN_HEIGHT.min(safe_h),
            safe_w,
            safe_h,
        )
    } else {
        (DESIGN_WIDTH, DESIGN_HEIGHT)
    }
}

pub(crate) fn effective_min_size(window: &WebviewWindow) -> (f64, f64) {
    if let Some((safe_w, safe_h)) = monitor_safe_logical_size(window) {
        (CONFIG_MIN_WIDTH.min(safe_w), CONFIG_MIN_HEIGHT.min(safe_h))
    } else {
        (CONFIG_MIN_WIDTH, CONFIG_MIN_HEIGHT)
    }
}

fn clamp_window_size(window: &WebviewWindow, width: f64, height: f64) -> (f64, f64) {
    let (min_w, min_h) = effective_min_size(window);
    let (max_w, max_h) =
        monitor_safe_logical_size(window).unwrap_or((width.max(min_w), height.max(min_h)));
    fit_size_preserving_aspect(
        width,
        height,
        min_w,
        min_h,
        max_w.max(min_w),
        max_h.max(min_h),
    )
}

pub fn enforce_window_floor(app: &AppHandle) {
    let Ok(window) = main_window(app) else {
        return;
    };

    // BOOT WITH A TITLE BAR. The frontend re-enters game mode a moment later if
    // that is the saved display mode, so starting decorated costs a windowed
    // launch nothing and is the only thing that recovers a window left
    // undecorated by a previous run.
    let _ = window.set_decorations(true);

    let (min_w, min_h) = effective_min_size(&window);
    let min = tauri::Size::Logical(tauri::LogicalSize {
        width: min_w,
        height: min_h,
    });

    let _ = window.set_min_size(Some(min));

    let Ok(size) = window.inner_size() else {
        return;
    };

    let scale = window.scale_factor().unwrap_or(1.0);
    let logical_width = size.width as f64 / scale;
    let logical_height = size.height as f64 / scale;

    if logical_width < min_w || logical_height < min_h {
        let _ = reset_main_window(app);
    }
}

pub fn reset_main_window(app: &AppHandle) -> Result<(), String> {
    FILL_REQUESTED.store(false, Ordering::SeqCst);
    if crate::window_choreography::owns_main_frame() {
        *PENDING_STAGE_SIZE.lock().map_err(|_| "staged size poisoned")? = Some(WindowSizeRequest {
            width: DESIGN_WIDTH, height: DESIGN_HEIGHT, center: true,
        });
        DEFERRED_DISPLAY.store(true, Ordering::SeqCst);
        return Ok(());
    }
    *PENDING_STAGE_SIZE.lock().map_err(|_| "staged size poisoned")? = None;
    let window = main_window(app)?;
    let _ = window.set_simple_fullscreen(false);
    let _ = window.set_fullscreen(false);
    let _ = window.set_decorations(true);
    note_simple_fullscreen(false);
    *STAGED_FRAME.lock().map_err(|_| "staged frame poisoned")? = None;
    FILL_REQUESTED.store(false, Ordering::SeqCst);
    let (width, height) = effective_default_size(&window);
    let (min_w, min_h) = effective_min_size(&window);

    let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
        width: min_w,
        height: min_h,
    })));

    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|err| err.to_string())?;
    let _ = window.center();
    Ok(())
}

// Fill screen is geometry in the current desktop, never an OS fullscreen
// state. Keep the player's staged frame once, so repeated requests, temporary
// authored compositions and toggling back do not replace it with monitor bounds.
pub fn set_game_mode(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let window = main_window(app)?;
    if enabled {
        if simple_fullscreen_active() { return Ok(()); }
        apply_pending_stage_size(app)?;
        let monitor = window.current_monitor().map_err(|e| e.to_string())?
            .or_else(|| window.primary_monitor().ok().flatten()).ok_or("monitor missing")?;
        let frame = StagedFrame {
            position: window.outer_position().unwrap_or(monitor.work_area().position),
            inner: window.inner_size().map_err(|e| e.to_string())?,
            decorated: window.is_decorated().unwrap_or(true),
        };
        *STAGED_FRAME.lock().map_err(|_| "staged frame poisoned")? = Some(frame);
        // These are recovery exits for sessions restored by an older build.
        let _ = window.set_fullscreen(false);
        let _ = window.set_simple_fullscreen(false);
        let _ = window.unmaximize();
        note_simple_fullscreen(true);
        let result = (|| {
            window.set_decorations(false).map_err(|e| e.to_string())?;
            fit_fill_frame(&window)
        })();
        if result.is_err() {
            note_simple_fullscreen(false);
            let _ = window.set_decorations(frame.decorated);
            let _ = window.set_position(frame.position);
            let _ = window.set_size(frame.inner);
            *STAGED_FRAME.lock().map_err(|_| "staged frame poisoned")? = None;
        }
        crate::theatre::block_os_fullscreen(&window);
        crate::theatre::sync(app);
        result
    } else {
        note_simple_fullscreen(false);
        let _ = window.set_fullscreen(false);
        let _ = window.set_simple_fullscreen(false);
        let frame = STAGED_FRAME.lock().map_err(|_| "staged frame poisoned")?.take();
        let _ = window.set_decorations(frame.map(|f| f.decorated).unwrap_or(true));
        if let Some(frame) = frame {
            let _ = window.unmaximize();
            let _ = window.set_position(frame.position);
            window.set_size(frame.inner).map_err(|e| e.to_string())?;
            // A disconnected monitor must not strand the restored stage.
            if let Ok(monitors) = window.available_monitors() {
                let visible = monitors.iter().any(|m| {
                    let r = m.work_area();
                    frame.position.x >= r.position.x && frame.position.y >= r.position.y
                    && frame.position.x as i64 + frame.inner.width as i64 <= r.position.x as i64 + r.size.width as i64
                    && frame.position.y as i64 + frame.inner.height as i64 <= r.position.y as i64 + r.size.height as i64
                });
                if !visible {
                    let (width, height) = effective_default_size(&window);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let _ = window.center();
                }
            }
        } else if window_fills_monitor(&window) {
            // A manually screen-sized frame has no saved Fill screen snapshot.
            // It still needs exposed room for an authored composition.
            let (width, height) = effective_default_size(&window);
            let _ = window.set_size(tauri::LogicalSize::new(width, height));
            let _ = window.center();
        }
        apply_pending_stage_size(app)?;
        crate::theatre::block_os_fullscreen(&window);
        crate::theatre::sync(app);
        Ok(())
    }
}

fn fit_fill_frame(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window.current_monitor().map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten()).ok_or("monitor missing")?;
    if cfg!(target_os = "linux") && std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var("GDK_BACKEND").as_deref() != Ok("x11") {
        // Wayland reserves shell surfaces and controls placement. Remain an
        // ordinary maximized window within the area the compositor allows.
        if !window.is_maximized().unwrap_or(false) { window.maximize().map_err(|e| e.to_string())?; }
    } else {
        if window.outer_position().ok().as_ref() != Some(monitor.position()) {
            window.set_position(*monitor.position()).map_err(|e| e.to_string())?;
        }
        if window.inner_size().ok().as_ref() != Some(monitor.size()) {
            window.set_size(*monitor.size()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn refresh_fill_frame(app: &AppHandle) {
    if simple_fullscreen_active() {
        if let Ok(window) = main_window(app) { let _ = fit_fill_frame(&window); }
    }
}

fn apply_pending_stage_size(app: &AppHandle) -> Result<(), String> {
    let request = PENDING_STAGE_SIZE.lock().map_err(|_| "staged size poisoned")?.take();
    if let Some(request) = request { resize_stage(app, request)?; }
    Ok(())
}

#[tauri::command]
pub fn chunk_window_metrics(app: AppHandle) -> Result<WindowMetrics, String> {
    let window = main_window(&app)?;
    let size = window.inner_size().map_err(|err| err.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let position = window.inner_position().map_err(|err| err.to_string())?;
    let work_area = window.current_monitor().ok().flatten().map(|monitor| {
        let work = monitor.work_area();
        WindowLogicalRect { x: work.position.x as f64 / scale, y: work.position.y as f64 / scale,
            width: work.size.width as f64 / scale, height: work.size.height as f64 / scale }
    });

    let native_fullscreen = window.is_fullscreen().unwrap_or(false);
    let simple_fullscreen = simple_fullscreen_active();
    let fills_screen = window_fills_monitor(&window);

    Ok(WindowMetrics {
        logical_width: size.width as f64 / scale,
        logical_height: size.height as f64 / scale,
        scale_factor: scale,
        fullscreen: native_fullscreen || simple_fullscreen,
        native_fullscreen,
        simple_fullscreen,
        fills_screen,
        content_rect: WindowLogicalRect { x: position.x as f64 / scale, y: position.y as f64 / scale,
            width: size.width as f64 / scale, height: size.height as f64 / scale },
        work_area,
    })
}

// Keep the chosen corner unless the new frame would leave this work area.
fn staged_position(x: i32, y: i32, width: u32, height: u32, mx: i32, my: i32, mw: u32, mh: u32) -> (i32, i32) {
    let max_x = (mx as i64 + mw as i64 - width as i64).max(mx as i64).min(i32::MAX as i64) as i32;
    let max_y = (my as i64 + mh as i64 - height as i64).max(my as i64).min(i32::MAX as i64) as i32;
    (x.clamp(mx, max_x), y.clamp(my, max_y))
}

#[tauri::command]
pub fn chunk_set_window_size(app: AppHandle, request: WindowSizeRequest) -> Result<(), String> {
    let owned = crate::window_choreography::owns_main_frame();
    if simple_fullscreen_active() || owned {
        *PENDING_STAGE_SIZE.lock().map_err(|_| "staged size poisoned")? = Some(request);
        if owned { DEFERRED_DISPLAY.store(true, Ordering::SeqCst); }
        return Ok(());
    }
    resize_stage(&app, request)
}

fn resize_stage(app: &AppHandle, request: WindowSizeRequest) -> Result<(), String> {
    let window = main_window(app)?;
    let (width, height) = clamp_window_size(&window, request.width, request.height);
    let (min_w, min_h) = effective_min_size(&window);

    let _ = window.set_simple_fullscreen(false);
    let _ = window.set_fullscreen(false);
    note_simple_fullscreen(false);
    *STAGED_FRAME.lock().map_err(|_| "staged frame poisoned")? = None;
    let _ = window.set_decorations(true);
    crate::theatre::block_os_fullscreen(&window);
    let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
        width: min_w,
        height: min_h,
    })));
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|err| err.to_string())?;

    if request.center {
        let _ = window.center();
    } else if let (Ok(Some(monitor)), Ok(position), Ok(size)) = (window.current_monitor(), window.outer_position(), window.outer_size()) {
        let work = monitor.work_area();
        let (x, y) = staged_position(position.x, position.y, size.width, size.height,
            work.position.x, work.position.y, work.size.width, work.size.height);
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
    crate::theatre::sync(app);
    Ok(())
}

#[tauri::command]
pub fn chunk_reset_window(app: AppHandle) -> Result<(), String> {
    reset_main_window(&app)
}

#[tauri::command]
pub fn chunk_set_game_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    FILL_REQUESTED.store(enabled, Ordering::SeqCst);
    if crate::window_choreography::owns_main_frame() {
        DEFERRED_DISPLAY.store(true, Ordering::SeqCst);
        return Ok(());
    }
    set_game_mode(&app, enabled)
}

#[tauri::command]
pub fn chunk_minimize(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    window.minimize().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn chunk_restore(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    window.show().map_err(|err| err.to_string())?;
    window.unminimize().map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn chunk_window_is_focused(app: AppHandle) -> Result<bool, String> {
    Ok(app.webview_windows().values().any(|window| window.label() != crate::theatre::LABEL && window.is_focused().unwrap_or(false)))
}

#[tauri::command]
pub fn chunk_quit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{fit_size_preserving_aspect, staged_position};
    #[test]
    fn resized_stage_stays_on_its_monitor_without_recentering_a_safe_frame() {
        assert_eq!(staged_position(-1600, 100, 1280, 800, -1920, 0, 1920, 1080), (-1600, 100));
        assert_eq!(staged_position(-500, 900, 1280, 800, -1920, 0, 1920, 1080), (-1280, 280));
        assert_eq!(staged_position(4000, 3000, 2560, 1600, 0, 0, 1920, 1080), (0, 0));
    }

    #[test]
    fn clamps_with_one_uniform_scale() {
        let size = fit_size_preserving_aspect(1920.0, 1080.0, 960.0, 600.0, 1440.0, 900.0);
        assert_eq!(size, (1440.0, 810.0));
    }

    #[test]
    fn preserves_a_valid_requested_size() {
        let size = fit_size_preserving_aspect(1280.0, 800.0, 960.0, 600.0, 1600.0, 1000.0);
        assert_eq!(size, (1280.0, 800.0));
    }
}
