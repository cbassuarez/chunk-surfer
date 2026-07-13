use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};

const DESIGN_WIDTH: f64 = 1280.0;
const DESIGN_HEIGHT: f64 = 800.0;
const CONFIG_MIN_WIDTH: f64 = 960.0;
const CONFIG_MIN_HEIGHT: f64 = 600.0;
const MONITOR_SAFE_WIDTH: f64 = 0.92;
const MONITOR_SAFE_HEIGHT: f64 = 0.90;

#[derive(Debug, Clone, Serialize)]
pub struct WindowMetrics {
    pub logical_width: f64,
    pub logical_height: f64,
    pub scale_factor: f64,
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WindowSizeRequest {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub center: bool,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())
}

fn monitor_safe_logical_size(window: &WebviewWindow) -> Option<(f64, f64)> {
    let monitor = window.current_monitor().ok().flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let size = monitor.size();
    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return None;
    }
    Some((
        size.width as f64 / scale * MONITOR_SAFE_WIDTH,
        size.height as f64 / scale * MONITOR_SAFE_HEIGHT,
    ))
}

fn effective_default_size(window: &WebviewWindow) -> (f64, f64) {
    if let Some((safe_w, safe_h)) = monitor_safe_logical_size(window) {
        (DESIGN_WIDTH.min(safe_w), DESIGN_HEIGHT.min(safe_h))
    } else {
        (DESIGN_WIDTH, DESIGN_HEIGHT)
    }
}

fn effective_min_size(window: &WebviewWindow) -> (f64, f64) {
    if let Some((safe_w, safe_h)) = monitor_safe_logical_size(window) {
        // On normal displays this is the authored 1280x800 floor. On constrained
        // displays it becomes screen-relative, and the frontend stage scales the
        // authored output down cleanly instead of cropping.
        (
            DESIGN_WIDTH.min(safe_w).max(CONFIG_MIN_WIDTH.min(safe_w)),
            DESIGN_HEIGHT.min(safe_h).max(CONFIG_MIN_HEIGHT.min(safe_h)),
        )
    } else {
        (DESIGN_WIDTH, DESIGN_HEIGHT)
    }
}

fn clamp_window_size(window: &WebviewWindow, width: f64, height: f64) -> (f64, f64) {
    let (min_w, min_h) = effective_min_size(window);
    let (max_w, max_h) = monitor_safe_logical_size(window).unwrap_or((width.max(min_w), height.max(min_h)));
    (
        width.max(min_w).min(max_w.max(min_w)),
        height.max(min_h).min(max_h.max(min_h)),
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
    let _ = window.set_fullscreen(false);
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

pub fn set_game_mode(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let window = main_window(app)?;
    window.set_fullscreen(enabled).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn chunk_window_metrics(app: AppHandle) -> Result<WindowMetrics, String> {
    let window = main_window(&app)?;
    let size = window.inner_size().map_err(|err| err.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);

    Ok(WindowMetrics {
        logical_width: size.width as f64 / scale,
        logical_height: size.height as f64 / scale,
        scale_factor: scale,
        fullscreen: window.is_fullscreen().unwrap_or(false),
    })
}

#[tauri::command]
pub fn chunk_set_window_size(app: AppHandle, request: WindowSizeRequest) -> Result<(), String> {
    let window = main_window(&app)?;
    let (width, height) = clamp_window_size(&window, request.width, request.height);
    let (min_w, min_h) = effective_min_size(&window);

    let _ = window.set_fullscreen(false);
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
pub fn chunk_window_is_focused(app: AppHandle) -> Result<bool, String> {
    let window = main_window(&app)?;
    Ok(window.is_focused().unwrap_or(false))
}

#[tauri::command]
pub fn chunk_quit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
