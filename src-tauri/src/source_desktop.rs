//! One passive game-owned surface. Combat and input continue to belong to main.
//! A presentation lease is transient: saves contain combat state, never OS bounds.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use std::time::{Duration, Instant};
use tauri::{
    AppHandle, Emitter, Listener, LogicalSize, Manager, PhysicalPosition, PhysicalRect,
    PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const LABEL: &str = "source-desktop";
const PROTOCOL: u64 = 1;
const MAX_SNAPSHOT_BYTES: usize = 262_144;

#[derive(Clone, Debug, Serialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPlacement {
    pub width: f64,
    pub height: f64,
    pub scale: f64,
    pub origin: Point,
    pub command: Rect,
    pub monitor: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRequest {
    pub token: String,
    pub revision: u64,
    pub snapshot: Value,
}

struct DesktopLease {
    token: String,
    revision: u64,
    placement: DesktopPlacement,
    work_area: PhysicalRect<i32, u32>,
    expected_position: PhysicalPosition<i32>,
    expected_size: PhysicalSize<u32>,
    restoring_min: (f64, f64),
    resizable: bool,
    always_on_top: bool,
    suspended: bool,
    paused: bool,
    committed: bool,
    applying_until: Instant,
}
static LEASE: OnceLock<Mutex<Option<DesktopLease>>> = OnceLock::new();
static LISTENERS: OnceLock<()> = OnceLock::new();
static READY: AtomicBool = AtomicBool::new(false);
static PRESENTED: OnceLock<Mutex<Option<(String, u64)>>> = OnceLock::new();
fn lease() -> &'static Mutex<Option<DesktopLease>> {
    LEASE.get_or_init(|| Mutex::new(None))
}
fn presented() -> &'static Mutex<Option<(String, u64)>> {
    PRESENTED.get_or_init(|| Mutex::new(None))
}
pub(crate) fn active() -> bool {
    lease().lock().map(|value| value.is_some()).unwrap_or(true)
}

fn probe_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var("CHUNK_SOURCE_DESKTOP_PROBE").as_deref() == Ok("1")
}
pub(crate) fn open_native_probe(app: &AppHandle) {
    if !probe_enabled() {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_title("Source native lifecycle probe");
        if let Ok(url) = "http://localhost:5173/test/source-desktop-native-harness.html".parse() {
            let _ = main.navigate(url);
        }
    }
}

#[cfg(target_os = "macos")]
fn native_surface_flags(window: &WebviewWindow) -> Value {
    use std::ffi::{c_char, c_void};
    #[link(name = "objc")]
    extern "C" {
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }
    let Ok(handle) = window.ns_window() else {
        return Value::Null;
    };
    unsafe {
        let boolean: unsafe extern "C" fn(*mut c_void, *mut c_void) -> i8 =
            std::mem::transmute(objc_msgSend as *const ());
        let object: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let number: unsafe extern "C" fn(*mut c_void, *mut c_void) -> f64 =
            std::mem::transmute(objc_msgSend as *const ());
        let selector = |name: &[u8]| sel_registerName(name.as_ptr().cast());
        let color = object(handle, selector(b"backgroundColor\0"));
        json!({ "opaque": boolean(handle, selector(b"isOpaque\0")) != 0,
            "ignoresMouseEvents": boolean(handle, selector(b"ignoresMouseEvents\0")) != 0,
            "canBecomeKey": boolean(handle, selector(b"canBecomeKeyWindow\0")) != 0,
            "backgroundAlpha": if color.is_null() { 1.0 } else { number(color, selector(b"alphaComponent\0")) } })
    }
}
#[cfg(not(target_os = "macos"))]
fn native_surface_flags(_window: &WebviewWindow) -> Value {
    Value::Null
}

// A fixed debug harness observes only game-owned windows and writes only its
// task-local report. It is unavailable in releases and ordinary debug runs.
#[tauri::command]
pub fn chunk_source_desktop_probe(
    app: AppHandle,
    action: String,
    report: Option<Value>,
) -> Result<Value, String> {
    if !probe_enabled() {
        return Err("native probe disabled".into());
    }
    if action == "report" {
        let report = report.ok_or("probe report missing")?;
        let bytes = serde_json::to_vec_pretty(&report).map_err(|error| error.to_string())?;
        if bytes.len() > 131_072 {
            return Err("probe report too large".into());
        }
        std::fs::create_dir_all("/private/tmp/source-desktop-native")
            .map_err(|error| error.to_string())?;
        std::fs::write("/private/tmp/source-desktop-native/report.json", bytes)
            .map_err(|error| error.to_string())?;
        return Ok(json!(true));
    }
    if action == "backdrop" {
        let main = app
            .get_webview_window("main")
            .ok_or("main window missing")?;
        let monitor = main
            .current_monitor()
            .map_err(|error| error.to_string())?
            .ok_or("monitor missing")?;
        let work = monitor.work_area();
        let surface = WebviewWindowBuilder::new(
            &app,
            "source-desktop-probe-backdrop",
            WebviewUrl::App("test/source-desktop-native-backdrop.html".into()),
        )
        .title("Source native probe backdrop")
        .visible(false)
        .focused(false)
        .focusable(false)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .build()
        .map_err(|error| error.to_string())?;
        surface
            .set_position(work.position)
            .map_err(|error| error.to_string())?;
        surface
            .set_size(work.size)
            .map_err(|error| error.to_string())?;
        surface.show().map_err(|error| error.to_string())?;
        return Ok(json!(true));
    }
    if action == "cleanup" {
        if let Some(window) = app.get_webview_window("source-desktop-probe-backdrop") {
            let _ = window.close();
        }
        return Ok(json!(true));
    }
    if action != "metrics" {
        return Err("unknown probe action".into());
    }
    let windows: Vec<Value> = ["main",LABEL,"source-desktop-probe-backdrop"].iter().filter_map(|label| {
        let window = app.get_webview_window(label)?;
        let position = window.outer_position().ok(); let outer = window.outer_size().ok(); let inner = window.inner_size().ok();
        Some(json!({"label":label,"visible":window.is_visible().unwrap_or(false),"focused":window.is_focused().unwrap_or(false),
            "decorated":window.is_decorated().unwrap_or(true),"resizable":window.is_resizable().unwrap_or(true),
            "topmost":window.is_always_on_top().unwrap_or(false),"scale":window.scale_factor().unwrap_or(1.0),
            "position":position.map(|value|json!({"x":value.x,"y":value.y})),
            "outer":outer.map(|value|json!({"width":value.width,"height":value.height})),
            "inner":inner.map(|value|json!({"width":value.width,"height":value.height})),
            "native":native_surface_flags(&window)}))
    }).collect();
    Ok(json!({"windows":windows,"ready":READY.load(Ordering::SeqCst),"active":active()}))
}

// Coordinates are logical points relative to this monitor's work area. We do
// not mix physical desktop origins with CSS pixels on mixed-DPI displays.
fn placement(
    work: PhysicalRect<i32, u32>,
    scale: f64,
    monitor: String,
    command_min_width: f64,
    command_min_height: f64,
) -> Result<DesktopPlacement, String> {
    if !scale.is_finite() || scale <= 0.0 {
        return Err("invalid monitor scale".into());
    }
    let (width, height) = (
        work.size.width as f64 / scale,
        work.size.height as f64 / scale,
    );
    if width < 640.0 || height < 480.0 {
        return Err("work area cannot fit the command island".into());
    }
    if !command_min_width.is_finite()
        || command_min_width < 200.0
        || command_min_width > width - 48.0
        || !command_min_height.is_finite()
        || command_min_height < 180.0
        || command_min_height > height - 48.0
    {
        return Err("work area cannot fit readable command controls".into());
    }
    let command_width = (width * 0.88)
        .min(1040.0)
        .max(command_min_width)
        .min(width - 48.0)
        .round();
    let command_height = (height * 0.38)
        .max(400.0)
        .max(command_min_height)
        .min(height - 48.0)
        .round();
    Ok(DesktopPlacement {
        width,
        height,
        scale,
        origin: Point {
            x: work.position.x as f64 / scale,
            y: work.position.y as f64 / scale,
        },
        command: Rect {
            x: ((width - command_width) * 0.5).round(),
            y: (height - command_height - 16.0).round(),
            width: command_width,
            height: command_height,
        },
        monitor,
    })
}

fn install_listeners(app: &AppHandle) {
    LISTENERS.get_or_init(|| {
        app.listen("source-desktop:ready", |event| {
            if let Ok(value) = serde_json::from_str::<Value>(event.payload()) {
                if value["label"] == LABEL && value["protocol"].as_u64() == Some(PROTOCOL) {
                    READY.store(true, Ordering::SeqCst);
                }
            }
        });
        app.listen("source-desktop:presented", |event| {
            if let Ok(value) = serde_json::from_str::<Value>(event.payload()) {
                if let (Some(token), Some(revision)) =
                    (value["token"].as_str(), value["revision"].as_u64())
                {
                    if let Ok(mut slot) = presented().lock() {
                        *slot = Some((token.to_owned(), revision));
                    }
                }
            }
        });
    });
}

fn owner_exists(token: &str) -> bool {
    lease()
        .lock()
        .ok()
        .is_some_and(|slot| slot.as_ref().is_some_and(|value| value.token == token))
}
fn wait_until(token: &str, timeout: Duration, predicate: impl Fn() -> bool) -> Result<(), String> {
    let until = Instant::now() + timeout;
    while Instant::now() < until {
        if !owner_exists(token) {
            return Err("desktop stage cancelled while opening".into());
        }
        if predicate() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(16));
    }
    Err("desktop surface did not become ready".into())
}

fn ensure_surface(app: &AppHandle) -> Result<WebviewWindow, String> {
    install_listeners(app);
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    READY.store(false, Ordering::SeqCst);
    WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::App("source-desktop-surface.html".into()),
    )
    .title("Chunk Surfer · Source")
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .resizable(false)
    .visible(false)
    .focused(false)
    .focusable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .inner_size(64.0, 64.0)
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
    .build()
    .map_err(|error| error.to_string())
}

fn validate(request: &DesktopRequest) -> Result<(), String> {
    if !crate::window_choreography::valid_token(&request.token)
        || request.revision == 0
        || !request.snapshot.is_object()
    {
        return Err("invalid desktop snapshot".into());
    }
    if serde_json::to_vec(&request.snapshot)
        .map_err(|error| error.to_string())?
        .len()
        > MAX_SNAPSHOT_BYTES
    {
        return Err("desktop snapshot too large".into());
    }
    Ok(())
}
fn emit_snapshot(
    app: &AppHandle,
    request: &DesktopRequest,
    placement: &DesktopPlacement,
) -> Result<(), String> {
    let mut snapshot = request.snapshot.clone();
    snapshot["desktop"] = serde_json::to_value(placement).map_err(|error| error.to_string())?;
    app.emit_to(
        LABEL,
        "source-desktop:state",
        json!({
            "token": request.token, "revision": request.revision, "snapshot": snapshot,
        }),
    )
    .map_err(|error| error.to_string())
}

fn begin(app: &AppHandle, request: DesktopRequest) -> Result<DesktopPlacement, String> {
    validate(&request)?;
    if active() {
        return Err("desktop stage already owned".into());
    }
    // The director has already passed the readable fullscreen-release gate.
    let generation = crate::window_choreography::desktop_generation(&request.token)?;
    let main = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    if main.is_fullscreen().unwrap_or(true)
        || crate::display_policy::simple_fullscreen_active()
        || !main.is_focused().unwrap_or(false)
    {
        return Err("main is not a focused windowed input host".into());
    }
    let monitor = main
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| main.primary_monitor().ok().flatten())
        .ok_or("monitor missing")?;
    let work = *monitor.work_area();
    let p = placement(
        work,
        monitor.scale_factor(),
        monitor.name().cloned().unwrap_or_default(),
        request.snapshot["commandMinWidth"]
            .as_f64()
            .unwrap_or(960.0),
        request.snapshot["commandMinHeight"]
            .as_f64()
            .unwrap_or(400.0),
    )?;
    let position = PhysicalPosition::new(
        work.position.x + (p.command.x * p.scale).round() as i32,
        work.position.y + (p.command.y * p.scale).round() as i32,
    );
    let size = PhysicalSize::new(
        (p.command.width * p.scale).round() as u32,
        (p.command.height * p.scale).round() as u32,
    );
    *lease().lock().map_err(|_| "desktop lease poisoned")? = Some(DesktopLease {
        token: request.token.clone(),
        revision: request.revision,
        placement: p.clone(),
        work_area: work,
        expected_position: position,
        expected_size: size,
        restoring_min: crate::display_policy::effective_min_size(&main),
        resizable: main.is_resizable().unwrap_or(true),
        always_on_top: main.is_always_on_top().unwrap_or(false),
        suspended: false,
        paused: false,
        committed: false,
        applying_until: Instant::now() + Duration::from_secs(12),
    });
    let outcome = (|| {
        let surface = ensure_surface(app)?;
        surface
            .set_ignore_cursor_events(true)
            .map_err(|error| error.to_string())?;
        surface
            .set_focusable(false)
            .map_err(|error| error.to_string())?;
        surface
            .set_position(work.position)
            .map_err(|error| error.to_string())?;
        surface
            .set_size(work.size)
            .map_err(|error| error.to_string())?;
        wait_until(&request.token, Duration::from_secs(8), || {
            READY.load(Ordering::SeqCst)
        })?;
        emit_snapshot(app, &request, &p)?;
        wait_until(&request.token, Duration::from_secs(2), || {
            presented().lock().ok().is_some_and(|value| {
                value.as_ref().is_some_and(|(token, revision)| {
                    token == &request.token && *revision == request.revision
                })
            })
        })?;
        if !main.is_focused().unwrap_or(false) {
            return Err("desktop opening lost input focus".into());
        }
        main.set_cursor_grab(false)
            .map_err(|error| error.to_string())?;
        main.set_cursor_visible(true)
            .map_err(|error| error.to_string())?;
        main.set_min_size(Some(LogicalSize::new(200.0, 180.0)))
            .map_err(|error| error.to_string())?;
        main.set_resizable(false)
            .map_err(|error| error.to_string())?;
        // Cocoa queues decoration changes. Set the shared resize policy first
        // so the queued style mask cannot re-enable resizing afterwards.
        main.set_decorations(false)
            .map_err(|error| error.to_string())?;
        if !crate::window_choreography::desktop_apply_frame(
            app,
            &request.token,
            generation,
            position,
            size,
        )? {
            return Err("desktop transaction no longer owns the main frame".into());
        }
        // Check the compositor's result, rather than treating a no-op Wayland
        // position request as a successful desktop breach.
        wait_until(&request.token, Duration::from_millis(800), || {
            let actual_p = main.outer_position().ok();
            let actual_s = main.inner_size().ok();
            actual_p.is_some_and(|value| {
                (value.x - position.x).abs() <= 4 && (value.y - position.y).abs() <= 4
            }) && actual_s.is_some_and(|value| {
                value.width.abs_diff(size.width) <= 4 && value.height.abs_diff(size.height) <= 4
            })
        })?;
        if let Some(active) = lease()
            .lock()
            .map_err(|_| "desktop lease poisoned")?
            .as_mut()
        {
            if active.token != request.token {
                return Err("desktop stage replaced".into());
            }
            active.committed = true;
            active.applying_until = Instant::now() + Duration::from_millis(500);
        }
        surface
            .set_always_on_top(true)
            .map_err(|error| error.to_string())?;
        surface.show().map_err(|error| error.to_string())?;
        main.set_always_on_top(true)
            .map_err(|error| error.to_string())?;
        main.set_focus().map_err(|error| error.to_string())?;
        Ok(p)
    })();
    if let Err(error) = outcome {
        // Roll back both surfaces and the main frame even if one cleanup fails.
        return match crate::window_choreography::desktop_restore(app, &request.token) {
            Ok(_) => Err(error),
            Err(restore_error) => Err(format!("{error}; restore: {restore_error}")),
        };
    }
    outcome
}

#[tauri::command]
pub async fn chunk_source_desktop_begin(
    app: AppHandle,
    request: DesktopRequest,
) -> Result<DesktopPlacement, String> {
    tauri::async_runtime::spawn_blocking(move || begin(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn chunk_source_desktop_update(
    app: AppHandle,
    request: DesktopRequest,
) -> Result<bool, String> {
    validate(&request)?;
    let p = {
        let mut slot = lease().lock().map_err(|_| "desktop lease poisoned")?;
        let Some(active) = slot.as_mut() else {
            return Ok(false);
        };
        if active.token != request.token || request.revision <= active.revision {
            return Ok(false);
        }
        active.revision = request.revision;
        active.placement.clone()
    };
    emit_snapshot(&app, &request, &p)?;
    let paused = request.snapshot["paused"].as_bool().unwrap_or(false);
    set_suspended(&app, &request.token, paused)?;
    Ok(true)
}

fn set_suspended(app: &AppHandle, token: &str, suspended: bool) -> Result<bool, String> {
    let focused = app
        .get_webview_window("main")
        .is_some_and(|main| main.is_focused().unwrap_or(false));
    let visible = !suspended && focused;
    let (committed, changed) = {
        let mut slot = lease().lock().map_err(|_| "desktop lease poisoned")?;
        let Some(active) = slot.as_mut().filter(|value| value.token == token) else {
            return Ok(false);
        };
        let changed = active.suspended == visible;
        active.suspended = !visible;
        active.paused = suspended;
        (active.committed, changed)
    };
    if let Some(surface) = app.get_webview_window(LABEL).filter(|_| changed) {
        if visible && committed {
            surface.show().map_err(|error| error.to_string())?;
        } else {
            surface.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn chunk_source_desktop_suspend(
    app: AppHandle,
    token: String,
    suspended: bool,
) -> Result<bool, String> {
    set_suspended(&app, &token, suspended)
}

// Called by every restore route, including stale startup and process exit. The
// surface is hidden first; geometry errors must never leave a phantom overlay.
pub(crate) fn release_presentation(
    app: &AppHandle,
    required: Option<&str>,
) -> Result<bool, String> {
    let active = {
        let mut slot = lease().lock().map_err(|_| "desktop lease poisoned")?;
        if required.is_some_and(|token| slot.as_ref().is_some_and(|value| value.token != token)) {
            return Ok(false);
        }
        slot.take()
    };
    let mut errors = Vec::new();
    if let Some(surface) = app.get_webview_window(LABEL) {
        if let Err(error) = surface.set_ignore_cursor_events(true) {
            errors.push(error.to_string());
        }
        if let Err(error) = surface.hide() {
            errors.push(error.to_string());
            // A failed hide must not strand a transparent top-level surface.
            if let Err(error) = surface.close() {
                errors.push(error.to_string());
            }
            READY.store(false, Ordering::SeqCst);
        }
        let _ = surface.set_always_on_top(false);
    }
    if let (Some(active), Some(main)) = (active.as_ref(), app.get_webview_window("main")) {
        let current_min = crate::display_policy::effective_min_size(&main);
        for result in [
            main.set_min_size(Some(LogicalSize::new(
                active.restoring_min.0.min(current_min.0),
                active.restoring_min.1.min(current_min.1),
            ))),
            main.set_resizable(active.resizable),
            main.set_always_on_top(active.always_on_top),
            main.set_cursor_grab(false),
            main.set_cursor_visible(true),
        ] {
            if let Err(error) = result {
                errors.push(error.to_string());
            }
        }
    }
    if errors.is_empty() {
        Ok(active.is_some())
    } else {
        Err(errors.join("; "))
    }
}

#[tauri::command]
pub async fn chunk_source_desktop_end(app: AppHandle, token: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || crate::window_choreography::desktop_restore(&app, &token))
        .await.map_err(|error| error.to_string())?
}

pub(crate) fn note_main_event(app: &AppHandle, event: &WindowEvent) -> bool {
    let Ok(mut slot) = lease().lock() else {
        return false;
    };
    let Some(active) = slot.as_mut() else {
        return false;
    };
    let mut cancel = None;
    match event {
        WindowEvent::Focused(focused) => {
            let visible = *focused && !active.paused;
            active.suspended = !visible;
            if let Some(surface) = app.get_webview_window(LABEL) {
                if visible && active.committed {
                    let _ = surface.set_always_on_top(true);
                    let _ = surface.show();
                } else if !visible {
                    let _ = surface.hide();
                }
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_always_on_top(if *focused { true } else { active.always_on_top });
            }
            let _ = app.emit_to(
                "main",
                "source-desktop:visibility",
                json!({"token":active.token,"visible":visible,"focused":focused}),
            );
        }
        WindowEvent::Moved(position)
            if active.committed && Instant::now() > active.applying_until =>
        {
            if (position.x - active.expected_position.x).abs() > 4
                || (position.y - active.expected_position.y).abs() > 4
            {
                cancel = Some("command island moved");
            }
        }
        WindowEvent::Resized(size)
            if active.committed && Instant::now() > active.applying_until =>
        {
            if size.width.abs_diff(active.expected_size.width) > 4
                || size.height.abs_diff(active.expected_size.height) > 4
            {
                cancel = Some("command island resized");
            }
        }
        WindowEvent::ScaleFactorChanged { .. } => cancel = Some("display scale changed"),
        WindowEvent::Destroyed => cancel = Some("main window destroyed"),
        _ => {}
    }
    // Focus-return also validates the monitor topology; a disconnected display
    // cannot resurrect an invisible overlay at its stale coordinates.
    if matches!(event, WindowEvent::Focused(true)) && active.committed {
        let same_work = app
            .get_webview_window("main")
            .and_then(|main| main.current_monitor().ok().flatten())
            .is_some_and(|monitor| {
                monitor.work_area().position == active.work_area.position
                    && monitor.work_area().size == active.work_area.size
            });
        if !same_work {
            cancel = Some("display work area changed");
        }
    }
    if let Some(reason) = cancel {
        let token = active.token.clone();
        if let Some(surface) = app.get_webview_window(LABEL) {
            let _ = surface.hide();
        }
        drop(slot);
        let _ = app.emit_to(
            "main",
            "source-desktop:cancelled",
            json!({"token":token,"reason":reason}),
        );
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _ = crate::window_choreography::desktop_restore(&handle, &token);
        });
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    fn work(x: i32, y: i32, w: u32, h: u32) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(w, h),
        }
    }
    #[test]
    fn command_island_stays_in_current_work_area_at_mixed_dpi_and_negative_origins() {
        for (area, scale) in [
            (work(0, 24, 1920, 1016), 1.0),
            (work(-2880, -80, 2880, 1720), 2.0),
            (work(1920, 0, 2560, 1360), 1.5),
        ] {
            let p = placement(area, scale, "test".into(), 960.0, 400.0).unwrap();
            assert!(p.command.x >= 0.0 && p.command.y >= 0.0);
            assert!(p.command.x + p.command.width <= p.width);
            assert!(p.command.y + p.command.height <= p.height - 15.0);
            assert!((p.origin.x * scale - area.position.x as f64).abs() < 0.01);
            assert!(p.command.width <= 1040.0);
        }
    }
    #[test]
    fn small_work_areas_refuse_instead_of_clipping_controls() {
        assert!(placement(work(0, 0, 1024, 600), 1.0, "".into(), 960.0, 480.0).is_ok());
        assert!(placement(work(0, 0, 640, 480), 1.0, "".into(), 960.0, 400.0).is_err());
        assert!(placement(work(0, 0, 600, 400), 1.0, "".into(), 960.0, 400.0).is_err());
        assert!(placement(work(0, 0, 1920, 1080), f64::NAN, "".into(), 960.0, 400.0).is_err());
        assert!(placement(work(0, 0, 1280, 720), 1.0, "".into(), 960.0, 700.0).is_err());
        assert!(placement(work(0, 0, 1280, 900), 1.0, "".into(), 1240.0, 480.0).is_err());
        let scaled = placement(work(0, 0, 1440, 900), 1.0, "".into(), 1200.0, 660.0).unwrap();
        assert_eq!(scaled.command.height, 660.0);
        assert_eq!(scaled.command.width, 1200.0);
    }
    #[test]
    fn snapshots_are_bounded_objects_with_owned_monotonic_revision() {
        assert!(validate(&DesktopRequest {
            token: "source:test".into(),
            revision: 1,
            snapshot: json!({"clock":1})
        })
        .is_ok());
        assert!(validate(&DesktopRequest {
            token: "source:test".into(),
            revision: 0,
            snapshot: json!({})
        })
        .is_err());
        assert!(validate(&DesktopRequest {
            token: "source:test".into(),
            revision: 1,
            snapshot: json!([])
        })
        .is_err());
        assert!(validate(&DesktopRequest {
            token: "source:test".into(),
            revision: 1,
            snapshot: json!({"large":"x".repeat(MAX_SNAPSHOT_BYTES)})
        })
        .is_err());
    }
}
