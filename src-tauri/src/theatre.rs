//! THEATRE. The dark house behind the game window.
//!
//! The game never takes OS fullscreen. A single passive surface covers the
//! monitor behind the main window while the game has focus, so the window reads
//! as a lit stage in a dark room and every authored window composition lands on
//! the house instead of on the player's desktop. The main window stays an
//! ordinary window: choreography, the Source underlay and the Chapel surfaces
//! keep working exactly as they do in windowed play.
//!
//! Fill screen is an ordinary borderless frame. No surface enters OS fullscreen.
//! The house is hidden while that frame covers it and returns during staging.
//!
//! The surface owns no gameplay or keyboard input, holds no game state, and
//! it is hidden whenever no window of this app has focus, so switching apps
//! returns to the player’s desktop.
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex, OnceLock,
};
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

pub const LABEL: &str = "theatre-backdrop";
const MAX_STATE_BYTES: usize = 16_384;

static WANTED: AtomicBool = AtomicBool::new(false);
static READY: AtomicBool = AtomicBool::new(false);
static SHOWN: AtomicBool = AtomicBool::new(false);
static LISTENERS: OnceLock<()> = OnceLock::new();
static BLUR_GENERATION: AtomicU64 = AtomicU64::new(0);
// The last authored scene, replayed when the surface reloads or is shown.
static SCENE: OnceLock<Mutex<Option<Value>>> = OnceLock::new();

fn scene() -> &'static Mutex<Option<Value>> {
    SCENE.get_or_init(|| Mutex::new(None))
}

pub fn wanted() -> bool {
    WANTED.load(Ordering::SeqCst)
}

// Wayland never tells a client where its window is, and ignores requests to
// move it. The house then lights from its centre instead of from a guess.
fn position_known() -> bool {
    !(cfg!(target_os = "linux") && std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var("GDK_BACKEND").as_deref() != Ok("x11"))
}

/// The whole decision, kept pure so it can be tested without a window system.
pub(crate) fn should_show(wanted: bool, app_focused: bool, main_fills: bool, minimized: bool) -> bool {
    wanted && app_focused && !main_fills && !minimized
}

fn should_redirect_fullscreen(native: bool, managed_fill: bool, composition: bool, maximized: bool) -> bool {
    native || (!managed_fill && !composition && maximized)
}

fn main_fills(main: &WebviewWindow) -> bool {
    crate::display_policy::simple_fullscreen_active() || main.is_fullscreen().unwrap_or(false)
}

fn app_focused(app: &AppHandle) -> bool {
    app.webview_windows()
        .values()
        .any(|window| window.label() != LABEL && window.is_focused().unwrap_or(false))
}

fn install_listeners(app: &AppHandle) {
    LISTENERS.get_or_init(|| {
        let handle = app.clone();
        app.listen("theatre-backdrop:ready", move |_| {
            READY.store(true, Ordering::SeqCst);
            resend(&handle);
        });
        // A click on the house is a click on nothing: give the game its focus back.
        let handle = app.clone();
        app.listen("theatre-backdrop:pointer", move |_| {
            if let Some(main) = handle.get_webview_window("main") {
                let _ = main.set_focus();
            }
        });
    });
}

fn ensure_surface(app: &AppHandle) -> Result<WebviewWindow, String> {
    install_listeners(app);
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    READY.store(false, Ordering::SeqCst);
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("theatre-backdrop.html".into()))
        .title("Chunk Surfer · House")
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .visible(false)
        .focused(false)
        .focusable(false)
        .skip_taskbar(true)
        .inner_size(64.0, 64.0)
        .background_color(tauri::window::Color(4, 4, 6, 255))
        .build()
        .map_err(|error| error.to_string())
}

fn frame_payload(main: &WebviewWindow, surface: &WebviewWindow) -> Value {
    let scale = surface.scale_factor().unwrap_or(1.0).max(0.1);
    let origin = surface.outer_position().ok();
    let size = surface.inner_size().ok();
    let position = main.inner_position().ok();
    let inner = main.inner_size().ok();
    let known = position_known() && origin.is_some() && position.is_some();
    let (ox, oy) = origin.map(|value| (value.x, value.y)).unwrap_or((0, 0));
    let (px, py) = position.map(|value| (value.x, value.y)).unwrap_or((0, 0));
    json!({
        "known": known,
        "x": (px - ox) as f64 / scale,
        "y": (py - oy) as f64 / scale,
        "width": inner.map(|value| value.width as f64 / scale).unwrap_or(0.0),
        "height": inner.map(|value| value.height as f64 / scale).unwrap_or(0.0),
        "houseWidth": size.map(|value| value.width as f64 / scale).unwrap_or(0.0),
        "houseHeight": size.map(|value| value.height as f64 / scale).unwrap_or(0.0),
    })
}

fn emit_frame(app: &AppHandle) {
    if !SHOWN.load(Ordering::SeqCst) {
        return;
    }
    if let (Some(main), Some(surface)) =
        (app.get_webview_window("main"), app.get_webview_window(LABEL))
    {
        let _ = app.emit_to(LABEL, "theatre-backdrop:frame", frame_payload(&main, &surface));
    }
}

fn resend(app: &AppHandle) {
    if let Ok(slot) = scene().lock() {
        if let Some(value) = slot.as_ref() {
            let _ = app.emit_to(LABEL, "theatre-backdrop:scene", value.clone());
        }
    }
    emit_frame(app);
}

fn hide(app: &AppHandle) {
    if let Some(surface) = app.get_webview_window(LABEL) {
        let _ = surface.hide();
    }
    if SHOWN.swap(false, Ordering::SeqCst) {
        let _ = app.emit_to("main", "chunk-theatre:visibility", json!({"visible": false}));
    }
}

fn show(app: &AppHandle, main: &WebviewWindow) -> Result<(), String> {
    let surface = ensure_surface(app)?;
    let monitor = main
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| main.primary_monitor().ok().flatten())
        .ok_or("monitor missing")?;
    let first = !SHOWN.load(Ordering::SeqCst);
    // Update on monitor/DPI changes, including negative monitor origins.
    if surface.outer_position().ok().as_ref() != Some(monitor.position()) {
        let _ = surface.set_position(*monitor.position());
    }
    if surface.inner_size().ok().as_ref() != Some(monitor.size()) {
        let _ = surface.set_size(*monitor.size());
    }
    if !position_known() { let _ = surface.maximize(); }
    if first {
        // The house stays behind ordinary and authored game windows.
        order_house(&surface, main)?;
        SHOWN.store(true, Ordering::SeqCst);
        let _ = app.emit_to("main", "chunk-theatre:visibility", json!({"visible": true}));
    }
    if READY.load(Ordering::SeqCst) {
        if first {
            resend(app);
        } else {
            emit_frame(app);
        }
    }
    Ok(())
}

/// Re-evaluate from measured window state. Safe to call from any event.
pub fn sync(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        hide(app);
        presentation_chrome(app, false);
        return;
    };
    let focused = app_focused(app);
    let minimized = main.is_minimized().unwrap_or(false);
    let visible = should_show(wanted(), focused, main_fills(&main), minimized);
    if visible {
        if let Err(error) = show(app, &main) {
            tauri_plugin_log::log::warn!("theatre house could not open: {error}");
            hide(app);
        }
    } else {
        hide(app);
    }
    presentation_chrome(app, wanted() && focused && !minimized);
}

// Focus moves between this app's own windows in two events (blur, then focus).
// Deciding on the blur alone would drop the house every time a composition
// surface or the house itself was clicked.
fn sync_after_blur(app: &AppHandle) {
    let generation = BLUR_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(140));
        if BLUR_GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || sync(&app));
    });
}

// An OS fullscreen the game did not ask for: the green traffic light, a
// compositor shortcut, a window rule. It is undone and offered to the frontend
// as a request for the game's own large modes.
fn redirect_os_fullscreen(app: &AppHandle, main: &WebviewWindow) -> bool {
    if !should_redirect_fullscreen(main.is_fullscreen().unwrap_or(false),
        crate::display_policy::simple_fullscreen_active(),
        crate::window_choreography::owns_main_frame(), main.is_maximized().unwrap_or(false)) {
        return false;
    }
    let _ = main.set_fullscreen(false);
    let _ = main.unmaximize();
    crate::display_policy::refresh_fill_frame(app);
    let _ = app.emit_to("main", "chunk-display:fullscreen-redirect", json!({"source": "os"}));
    true
}

pub fn note_main_event(app: &AppHandle, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(true) => {
            BLUR_GENERATION.fetch_add(1, Ordering::SeqCst);
            sync(app);
        }
        WindowEvent::Focused(false) => sync_after_blur(app),
        WindowEvent::Resized(_) => {
            if let Some(main) = app.get_webview_window("main") {
                if redirect_os_fullscreen(app, &main) {
                    return;
                }
            }
            if wanted() {
                sync(app);
            }
        }
        WindowEvent::Moved(_) | WindowEvent::ScaleFactorChanged { .. } => {
            crate::display_policy::refresh_fill_frame(app);
            if wanted() {
                sync(app);
            }
        }
        WindowEvent::Destroyed | WindowEvent::CloseRequested { .. } => close(app),
        _ => {}
    }
}

// Companion panes can retain focus long after main blurred. Their eventual
// blur must also retire the house, and focus transfers keep it in place.
pub fn note_companion_event(app: &AppHandle, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(true) => {
            BLUR_GENERATION.fetch_add(1, Ordering::SeqCst);
            sync(app);
        }
        WindowEvent::Focused(false) | WindowEvent::Destroyed => sync_after_blur(app),
        _ => {}
    }
}

pub fn note_surface_event(app: &AppHandle, event: &WindowEvent) {
    match event {
        // Where a platform lets the house take focus anyway, hand it straight back.
        WindowEvent::Focused(true) => {
            BLUR_GENERATION.fetch_add(1, Ordering::SeqCst);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_focus();
            }
        }
        WindowEvent::Focused(false) => sync_after_blur(app),
        WindowEvent::Resized(_) => emit_frame(app),
        WindowEvent::Destroyed => {
            READY.store(false, Ordering::SeqCst);
            SHOWN.store(false, Ordering::SeqCst);
        }
        _ => {}
    }
}

/// Every exit route. The house must never outlive the game window.
pub fn close(app: &AppHandle) {
    WANTED.store(false, Ordering::SeqCst);
    hide(app);
    presentation_chrome(app, false);
    if let Some(surface) = app.get_webview_window(LABEL) {
        let _ = surface.close();
    }
    READY.store(false, Ordering::SeqCst);
}

fn bounded(value: &Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("theatre state must be an object".into());
    }
    if serde_json::to_vec(value).map_err(|error| error.to_string())?.len() > MAX_STATE_BYTES {
        return Err("theatre state too large".into());
    }
    Ok(())
}

#[tauri::command]
pub fn chunk_theatre_set(window: WebviewWindow, enabled: bool) -> Result<bool, String> {
    if window.label() != "main" {
        return Err("only the game window owns the theatre".into());
    }
    let app = window.app_handle();
    WANTED.store(enabled, Ordering::SeqCst);
    block_os_fullscreen(&window);
    if enabled {
        // Built ahead of need, hidden, so the first reveal is not a page load.
        ensure_surface(app)?;
    }
    sync(app);
    Ok(SHOWN.load(Ordering::SeqCst))
}

/// What a scene has authored for the house. Kept and replayed until replaced.
#[tauri::command]
pub fn chunk_theatre_scene(window: WebviewWindow, scene_state: Value) -> Result<bool, String> {
    if window.label() != "main" {
        return Err("only the game window dresses the house".into());
    }
    bounded(&scene_state)?;
    *scene().lock().map_err(|_| "theatre scene poisoned")? = Some(scene_state.clone());
    if !READY.load(Ordering::SeqCst) {
        return Ok(false);
    }
    window
        .app_handle()
        .emit_to(LABEL, "theatre-backdrop:scene", scene_state)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{should_show, should_redirect_fullscreen};

    #[test]
    fn os_fullscreen_is_redirected_even_during_fill_or_a_composition() {
        assert!(should_redirect_fullscreen(true, true, false, false));
        assert!(should_redirect_fullscreen(true, false, true, false));
        assert!(should_redirect_fullscreen(false, false, false, true), "ordinary Zoom requests Fill screen");
        assert!(!should_redirect_fullscreen(false, true, false, true), "Wayland maximized Fill screen is intentional");
        assert!(!should_redirect_fullscreen(false, false, true, true), "authored geometry owns the frame");
        assert!(!should_redirect_fullscreen(false, false, false, false));
    }

    #[test]
    fn the_house_is_up_only_behind_a_focused_staged_window() {
        assert!(should_show(true, true, false, false));
        assert!(!should_show(false, true, false, false), "the house has not been enabled");
        assert!(!should_show(true, false, false, false), "another app has focus");
        assert!(!should_show(true, true, true, false), "the window already fills the screen");
        assert!(!should_show(true, true, false, true), "minimised");
    }
}

// On AppKit, turn the green button back into Zoom, and translate its maximize
// event above into Fill screen. Do this again after decoration changes, which
// can overwrite the collection behavior. Other platforms use the resize guard.
#[cfg(target_os = "macos")]
pub fn block_os_fullscreen(window: &WebviewWindow) {
    let window = window.clone();
    let dispatcher = window.clone();
    let _ = dispatcher.run_on_main_thread(move || unsafe {
        if let Ok(ns) = window.ns_window() {
            let get: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void) -> usize = std::mem::transmute(objc_msgSend as *const ());
            let set: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, usize) = std::mem::transmute(objc_msgSend as *const ());
            let behavior = get(ns, sel_registerName(b"collectionBehavior\0".as_ptr().cast()));
            set(ns, sel_registerName(b"setCollectionBehavior:\0".as_ptr().cast()),
                (behavior & !((1 << 7) | (1 << 8) | (1 << 11))) | (1 << 9) | (1 << 12));
        }
    });
}
#[cfg(not(target_os = "macos"))]
pub fn block_os_fullscreen(_: &WebviewWindow) {}

#[cfg(target_os = "macos")]
#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const std::ffi::c_char) -> *mut std::ffi::c_void;
    fn sel_registerName(name: *const std::ffi::c_char) -> *mut std::ffi::c_void;
    fn objc_msgSend();
}

#[cfg(target_os = "macos")]
fn order_house(surface: &WebviewWindow, main: &WebviewWindow) -> Result<(), String> {
    let window = surface.clone();
    let main = main.clone();
    surface.run_on_main_thread(move || unsafe {
        if let (Ok(ns), Ok(stage)) = (window.ns_window(), main.ns_window()) {
            let get: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void) -> isize = std::mem::transmute(objc_msgSend as *const ());
            let set: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, isize) = std::mem::transmute(objc_msgSend as *const ());
            set(ns, sel_registerName(b"setLevel:\0".as_ptr().cast()), 0);
            // Directly behind the game, covering the desktop and background
            // application windows. A desktop-level plate would leave icons and
            // other apps visible above it and break the staged presentation.
            let order: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, isize, isize) = std::mem::transmute(objc_msgSend as *const ());
            order(ns, sel_registerName(b"orderWindow:relativeTo:\0".as_ptr().cast()), -1,
                get(stage, sel_registerName(b"windowNumber\0".as_ptr().cast())));
        }
    }).map_err(|e| e.to_string())
}
#[cfg(target_os = "windows")]
fn order_house(surface: &WebviewWindow, main: &WebviewWindow) -> Result<(), String> {
    #[link(name = "user32")]
    extern "system" { fn SetWindowPos(window: *mut std::ffi::c_void, after: *mut std::ffi::c_void, x: i32, y: i32, width: i32, height: i32, flags: u32) -> i32; }
    surface.show().map_err(|e| e.to_string())?;
    let window = surface.hwnd().map_err(|e| e.to_string())?;
    let stage = main.hwnd().map_err(|e| e.to_string())?;
    // NOSIZE | NOMOVE | NOACTIVATE: change only the stack, immediately below main.
    let result = unsafe { SetWindowPos(window.0 as _, stage.0 as _, 0, 0, 0, 0, 0x13) };
    if result == 0 { Err(std::io::Error::last_os_error().to_string()) } else { Ok(()) }
}
#[cfg(target_os = "linux")]
fn order_house(surface: &WebviewWindow, main: &WebviewWindow) -> Result<(), String> {
    surface.show().map_err(|e| e.to_string())?;
    let window = surface.clone(); let main = main.clone();
    surface.run_on_main_thread(move || {
        use webkit2gtk::glib::object::ObjectType;
        #[link(name = "gtk-3")]
        extern "C" { fn gtk_widget_get_window(widget: *mut std::ffi::c_void) -> *mut std::ffi::c_void; }
        #[link(name = "gdk-3")]
        extern "C" { fn gdk_window_restack(window: *mut std::ffi::c_void, sibling: *mut std::ffi::c_void, above: i32); }
        if let (Ok(house), Ok(stage)) = (window.gtk_window(), main.gtk_window()) { unsafe {
            let house = gtk_widget_get_window(house.as_ptr().cast());
            let stage = gtk_widget_get_window(stage.as_ptr().cast());
            if !house.is_null() && !stage.is_null() { gdk_window_restack(house, stage, 0); }
        }}
    }).map_err(|e| e.to_string())
}

// Auto-hide chrome only while our app owns presentation. Never disable app
// switching, Force Quit, menu access, or the user's desktop. Restore the exact
// previous options on blur/close instead of writing a global preference.
#[cfg(target_os = "macos")]
fn presentation_chrome(app: &AppHandle, active: bool) {
    static PREVIOUS: Mutex<Option<usize>> = Mutex::new(None);
    let _ = app.run_on_main_thread(move || unsafe {
        let call: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void) -> *mut std::ffi::c_void = std::mem::transmute(objc_msgSend as *const ());
        let application = call(objc_getClass(b"NSApplication\0".as_ptr().cast()), sel_registerName(b"sharedApplication\0".as_ptr().cast()));
        let get: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void) -> usize = std::mem::transmute(objc_msgSend as *const ());
        let set: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, usize) = std::mem::transmute(objc_msgSend as *const ());
        if let Ok(mut previous) = PREVIOUS.lock() {
            if active && previous.is_none() {
                let options = get(application, sel_registerName(b"presentationOptions\0".as_ptr().cast()));
                *previous = Some(options);
                set(application, sel_registerName(b"setPresentationOptions:\0".as_ptr().cast()), (options & !((1 << 1) | (1 << 3))) | 1 | (1 << 2));
            } else if !active {
                if let Some(options) = previous.take() { set(application, sel_registerName(b"setPresentationOptions:\0".as_ptr().cast()), options); }
            }
        }
    });
}
#[cfg(not(target_os = "macos"))]
fn presentation_chrome(_: &AppHandle, _: bool) {}
