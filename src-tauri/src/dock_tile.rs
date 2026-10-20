// The Dock tile while the game runs.
//
// macOS 26 boxes any bundle icon that is not the squircle, so icon.icns is the
// squircle tile and the cut-out ear lives only in the Dock tile: the plug-in
// in macos/DockTile draws it while the game is closed, and this draws the
// same image while it is open. AppKit shows the bundle icon for the first
// frames of launch before this lands; that cannot be avoided from here.

#[cfg(target_os = "macos")]
static DOCK_TILE: &[u8] = include_bytes!("../macos/DockTile/DockTile.icns");

#[cfg(target_os = "macos")]
pub fn install() {
    use std::ffi::{c_char, c_void};
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Size {
        width: f64,
        height: f64,
    }
    #[repr(C)]
    struct Rect {
        x: f64,
        y: f64,
        size: Size,
    }
    unsafe {
        let object: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let with_object: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let with_bytes: unsafe extern "C" fn(*mut c_void, *mut c_void, *const c_void, usize) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let with_rect: unsafe extern "C" fn(*mut c_void, *mut c_void, Rect) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let with_integer: unsafe extern "C" fn(*mut c_void, *mut c_void, usize) =
            std::mem::transmute(objc_msgSend as *const ());
        let size_of: unsafe extern "C" fn(*mut c_void, *mut c_void) -> Size =
            std::mem::transmute(objc_msgSend as *const ());
        let class = |name: &[u8]| objc_getClass(name.as_ptr().cast());
        let selector = |name: &[u8]| sel_registerName(name.as_ptr().cast());

        let data = object(class(b"NSData\0"), selector(b"alloc\0"));
        let data = with_bytes(data, selector(b"initWithBytes:length:\0"), DOCK_TILE.as_ptr().cast(), DOCK_TILE.len());
        if data.is_null() {
            return;
        }
        let image = object(class(b"NSImage\0"), selector(b"alloc\0"));
        let image = with_object(image, selector(b"initWithData:\0"), data);
        object(data, selector(b"release\0"));
        if image.is_null() {
            return;
        }
        let application = object(class(b"NSApplication\0"), selector(b"sharedApplication\0"));
        let tile = object(application, selector(b"dockTile\0"));
        if tile.is_null() {
            object(image, selector(b"release\0"));
            return;
        }
        let size = size_of(tile, selector(b"size\0"));
        let view = object(class(b"NSImageView\0"), selector(b"alloc\0"));
        let view = with_rect(view, selector(b"initWithFrame:\0"), Rect { x: 0.0, y: 0.0, size });
        with_object(view, selector(b"setImage:\0"), image);
        // NSImageScaleProportionallyUpOrDown
        with_integer(view, selector(b"setImageScaling:\0"), 3);
        with_object(tile, selector(b"setContentView:\0"), view);
        object(tile, selector(b"display\0"));
        object(view, selector(b"release\0"));
        object(image, selector(b"release\0"));
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install() {}
