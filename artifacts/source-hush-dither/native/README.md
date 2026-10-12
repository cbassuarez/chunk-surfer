# Native WebKit shared-dither acceptance

The existing isolated macOS debug probe passed **22/22 checks** with the shared Hush dither on 2026-10-12. No Rust or native production code changed for this run. The reused executable SHA-256 is recorded in `source-sha256.txt`; the prior lifecycle evidence under `source-uncontained-implementation/native` remains intact.

The opt-in harness rendered the actual production `createSourceDesktopView` and `createSourceDesktopDither` in a second, small WebKit canvas inside its own main window. Probe-only WebGL wrappers recorded actual compile/link status and GL errors:

- 14 shaders compiled, 7 programs linked, including the shared pixel-mesh fragment; no compile, link, or GL errors.
- Native WebKit reports WebGL 2.0, `EXT_color_buffer_float` available, and `MAX_SAMPLES = 4`.
- The production dither debug state reports `shader: pixel-mesh`, `profile: hush`, `screen: crosshatch`, and prewarmed blue noise.
- Actual 480 × 360 pixel readback contains 48,433 visible pixels, 124,367 fully transparent pixels, and 245 visible RGB colors.

The real passive native overlay separately acknowledged rendered revisions 1 and 2 and emitted no surface errors. Its actual native alpha, click-through and non-key-window flags passed. Main remained the focused fixed 1040 × 480 logical command host. Pause/resume passed; end restored both content and outer dimensions to the original 2560 × 1600 physical pixels and original position, restored decorations/resize/focus, hid the overlay, retired its owner and closed the game-owned backdrop.

The shader compile/link/GL-error instrumentation and pixel readback belong to the sibling WebKit canvas; the full work-area overlay is covered by its ready/presented/error protocol and actual lifecycle checks. This is native WebKit acceptance on this machine, not cross-GPU, Windows/Linux, multi-monitor, physical click-through or composited screenshot acceptance. `physicalPointerVerified` remains false. The generic renderer string is `WebKit WebGL`; an unmasked GPU identity was not requested.

Cleanup completed: only temporary probe PID 75458 was terminated, its own Vite session on 5173 stopped, the exact probe process query returned no match, and localhost:5173 refused connections. The parent task's separate 5307 server was left untouched.
