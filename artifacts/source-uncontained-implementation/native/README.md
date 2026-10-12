# Source native lifecycle acceptance

The isolated macOS Tauri probe passed all 16 checks in `report.json` on 2026-10-12. The probe navigated only its own main window to `test/source-desktop-native-harness.html` and covered the work area with an opaque game-owned backdrop. It did not inspect another application's content.

Observed native behavior:

- Actual Cocoa overlay flags: nonopaque, background alpha 0, ignores mouse events, cannot become the key window.
- The real overlay initialized its GLB renderer, acknowledged the first snapshot, and became visible.
- The main window retained input focus at 1040 × 480 logical pixels and was not resizable. Current monitor work area was 1800 × 1125 logical pixels at scale 2, origin (0, 44).
- Pause hid the overlay while preserving ownership; resume revealed the same owner.
- End hid the overlay, retired ownership, and exactly restored content size, outer size, position, decorations, resize policy, topmost policy, and focus. Both original and restored dimensions were 2560 × 1600 physical pixels, at (520, 252).
- The harness closed its own backdrop. Afterwards the test app was terminated and its temporary Vite server stopped. The exact probe-process query returned no matches and localhost:5173 refused connections.

No physical pointer click through the overlay or composited native screenshot was verified. `physicalPointerVerified` is false. Native application selection through CUA timed out; no other applications were used as a substitute. Windows, Linux, real monitor removal, mixed-DPI monitor travel, and native-fullscreen Space restoration were not exercised by this probe. Mixed-DPI placement and small-work-area fallback have pure Rust coverage.

Validation:

- `cargo build --manifest-path src-tauri/Cargo.toml --offline`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml --all-targets --offline`: passed on macOS.
- `cargo test --manifest-path src-tauri/Cargo.toml --offline --lib -- --nocapture`: 29/29 passed with localhost fixture access. The sandbox-only run had blocked existing Lens sidecar fixture ports; rerunning with loopback access passed all tests.
- `node --test test/source-desktop-platform.spec.mjs`: 9/9 passed.
- Combined choreography suites: 36/37 passed. The remaining preexisting source-text assertion in `window-choreography-director.spec.mjs:427` uses a fixed substring too short to reach the current `sourceFrame(...)` call after unrelated main.js additions.
- `git diff --check`: passed.

The original failing restoration report is retained as `initial-restoration-failure.json`. The production fix saves inner size separately, restores Wry's configured macOS title-bar style, and fences Cocoa's queued style/size operations before the dependent restore operation. It also sets the shared resize policy before removing decorations, so Tao's queued decoration mask cannot re-enable resizing.

The native harness is opt-in: it is inert unless both a debug build and `CHUNK_SOURCE_DESKTOP_PROBE=1` are present. Its command writes only the fixed task-local report path, and the only added debug backdrop label has event permissions. No OS window geometry enters saves.
