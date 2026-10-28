// The native ear builds in place once at startup, then retains the same
// transparent, size-selected artwork as the closed-app Dock plug-in. AppKit
// owns rendering and Reduce Motion; macOS still owns its launch bounce.

#[cfg(target_os = "macos")]
static DOCK_TILE: &[u8] = include_bytes!("../macos/DockTile/DockTile.icns");

#[cfg(target_os = "macos")]
pub fn install() {
    extern "C" {
        fn chunk_surfer_install_dock_assembly(bytes: *const u8, length: usize);
    }
    // Tauri invokes setup on the main thread. The AppKit helper also guards
    // against an accidental later call from another thread or duplicate setup.
    unsafe { chunk_surfer_install_dock_assembly(DOCK_TILE.as_ptr(), DOCK_TILE.len()) }
}

#[cfg(not(target_os = "macos"))]
pub fn install() {}
