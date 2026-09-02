use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, WebviewWindow};

const DESIGN_WIDTH: f64 = 1280.0;
const DESIGN_HEIGHT: f64 = 800.0;
const CONFIG_MIN_WIDTH: f64 = 960.0;
const CONFIG_MIN_HEIGHT: f64 = 600.0;
// Predictable logical margins for the menu bar, Dock/taskbar, title bar, and
// resize affordances. Percentage clamps behave badly on ultrawide displays.
const MONITOR_MARGIN_X: f64 = 48.0;
const MONITOR_MARGIN_Y: f64 = 112.0;

// WHAT THE WINDOW IS ACTUALLY DOING.
//
// `fullscreen` used to be the only field, and it was a lie: it reports
// `Window::is_fullscreen()`, which on macOS reflects NATIVE fullscreen only.
// Simple fullscreen — the mode this game actually uses for game mode, see
// set_game_mode below — lives in a separate tao field and does not show up
// there at all. So the one API that could have told the frontend the truth
// returned `false` during game mode, and nothing called it anyway.
//
// The three states are genuinely different and the caller needs to tell them
// apart: a native Space cannot be composited over (window choreography is
// impossible in it and must leave first), simple fullscreen can, and a windowed
// frame needs nothing done to it.
//
// `fullscreen` is retained as native-or-simple so an older caller reading it
// gets a more useful answer than it used to, not a different-shaped one.
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
}

#[derive(Debug, Clone, Deserialize)]
pub struct WindowSizeRequest {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub center: bool,
}

// SIMPLE FULLSCREEN IS NOT READABLE BACK OUT OF THE WINDOW, SO WE KEEP IT.
//
// tao stores it in `shared_state.is_simple_fullscreen` and exposes no getter;
// `Window::fullscreen()` only ever reflects the native kind. set_game_mode is
// the sole entry point, so tracking it here is exact for everything the app
// does deliberately. Anything the OS does behind our back is caught by the
// measured `fills_screen` instead — the two together cover both cases.
static SIMPLE_FULLSCREEN: AtomicBool = AtomicBool::new(false);

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

fn effective_min_size(window: &WebviewWindow) -> (f64, f64) {
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
    let window = main_window(app)?;
    let _ = window.set_simple_fullscreen(false);
    let _ = window.set_fullscreen(false);
    note_simple_fullscreen(false);
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

// SIMPLE FULLSCREEN, NOT NATIVE FULLSCREEN.
//
// macOS native fullscreen moves the window into its own Space, and nothing can
// be composited over a Space -- not an always-on-top window, not a click-through
// one, nothing. Game mode was therefore the one display mode in which the
// fireball surfaces could not exist, which is why choreography quietly demoted
// itself to "in frame only" there and looked, from the outside, exactly like a
// broken feature.
//
// Simple fullscreen is how fullscreen worked before Lion: the whole screen, the
// current Space, overlays intact. Other platforms fall back to set_fullscreen,
// where an always-on-top window is not excluded in the first place.
pub fn set_game_mode(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let window = main_window(app)?;
    if enabled {
        // set_simple_fullscreen refuses outright while native fullscreen is
        // active, so leaving it is part of entering game mode -- including for
        // anyone already parked in a Space from a previous build.
        let _ = window.set_fullscreen(false);
        let result = window
            .set_simple_fullscreen(true)
            .map_err(|err| err.to_string());
        note_simple_fullscreen(result.is_ok());
        result
    } else {
        let _ = window.set_simple_fullscreen(false);
        note_simple_fullscreen(false);
        window.set_fullscreen(false).map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub fn chunk_window_metrics(app: AppHandle) -> Result<WindowMetrics, String> {
    let window = main_window(&app)?;
    let size = window.inner_size().map_err(|err| err.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);

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
    })
}

#[tauri::command]
pub fn chunk_set_window_size(app: AppHandle, request: WindowSizeRequest) -> Result<(), String> {
    let window = main_window(&app)?;
    let (width, height) = clamp_window_size(&window, request.width, request.height);
    let (min_w, min_h) = effective_min_size(&window);

    let _ = window.set_simple_fullscreen(false);
    let _ = window.set_fullscreen(false);
    note_simple_fullscreen(false);
    let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
        width: min_w,
        height: min_h,
    })));
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|err| err.to_string())?;

    if request.center {
        let _ = window.center();
    }

    Ok(())
}

#[tauri::command]
pub fn chunk_reset_window(app: AppHandle) -> Result<(), String> {
    reset_main_window(&app)
}

#[tauri::command]
pub fn chunk_set_game_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
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
    let window = main_window(&app)?;
    Ok(window.is_focused().unwrap_or(false))
}

#[tauri::command]
pub fn chunk_quit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::fit_size_preserving_aspect;

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
