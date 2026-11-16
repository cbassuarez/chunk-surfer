# Theatre display

Settings → Display offers exactly two modes:

- **Staged window** (default): the game keeps its normal movable, decorated frame over the dithered dark house.
- **Fill screen**: the same game window becomes borderless and covers its current monitor between authored window scenes. It stays on the current desktop.

Both modes use the theatre presentation. There is no desktop-visible ordinary-window mode. The existing saved IDs `windowed` and `game-mode` remain valid; old preferences survive the label change.

**Staged window size**, **Scene windows**, **External fight targets**, **Preview scene windows**, and **Restore game window** are grouped beside Display mode. Staged size changes are remembered during Fill screen and applied next time the game is staged. Resizing preserves a safe window corner; monitor removal restores a visible frame.

## Window ownership

The native display policy is the sole owner of mode geometry. Entering Fill screen remembers physical position, inner size and decorations once. Leaving it restores that frame. No code enables Tauri native or simple fullscreen; the old `simple_fullscreen` metric identifies the managed borderless frame for existing choreography clients.

Window choreography temporarily stages Fill screen before measuring its cast. Display changes during opening, active composition or restoration are deferred. Closing the composition applies the newest staged size and selected mode. A failed opening rolls back the prior presentation. Source desktop allocation retains its existing rule: a display or type-scale change releases the fixed allocation and continues the fight in the game window.

F11 and View → Toggle Fill Screen use one mode owner with duplicate-key debouncing. On macOS the menu also binds Control–Command–F. The green button is configured for Zoom instead of native fullscreen; unexpected OS fullscreen/maximize events are exited and redirected to Fill screen. These controls never create a dedicated fullscreen Space.

## House and authored backgrounds

The passive `theatre-backdrop` webview covers the monitor, directly below the main frame. It covers desktop icons and background applications without becoming always-on-top. Existing Source and Chapel authored surfaces retain their presentation ordering above the house. A native composition may supply a `backdrop` object; otherwise it receives a restrained wash, and ordinary play returns to house dark on restoration.

The house shares the existing loose-window colour ramps. It paints an opaque, still Bayer dither in Canvas 2D, without WebGL, desktop capture or an idle animation loop. Scene and geometry changes repaint at at most 10 Hz, with raster size capped at 1280 pixels on the long edge. An authored wash follows the measured game frame where the platform exposes position. The scene channel accepts bounded objects and replays only the newest state after late connection or reload. Backdrop startup never gates game readiness.

The house hides on minimize, close, or when every game window loses focus. Focus handoffs among companion windows keep it visible. A short blur grace period prevents a flash during those handoffs. On macOS presentation temporarily auto-hides the Dock and menu bar while the app is focused, restoring the prior application presentation options afterwards. App switching remains available.

## Platform limits and acceptance

X11, Windows and macOS expose the placement/stacking used for whole-monitor presentation. Native Wayland clients cannot dictate absolute position, sibling stacking or coverage of reserved shell surfaces. On that backend Fill screen remains an ordinary maximized borderless window in the compositor's available area; the house requests maximize and uses a centred wash. XWayland (`GDK_BACKEND=x11`) uses the X11 path. No real-fullscreen fallback is used to conceal these restrictions.

Automated coverage checks the two-mode contract, saved preference compatibility, deterministic opaque house paint, late/failed connection, scene restoration, listener disposal, fullscreen redirects, display geometry and choreography contracts. Browser verification can establish settings layout and absence of DOM fullscreen; it cannot establish native stacking.

Before release, native acceptance on each target OS must exercise: staged launch; Fill screen and back with the same staged frame; a companion scene entered from either mode; a mode/size change during that scene; Alt-Tab from a companion; minimize/restore; monitor/DPI changes; quit; and macOS green-button/Control–Command–F behavior. In particular, actual macOS and Windows compositor behavior is not established by Linux compilation or browser screenshots.
