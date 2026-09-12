# Electronic readout typography

Text inside an instrument display is formed by the display. A native browser
font with a glow is not a VFD or LCD rendering path.

## Rendering contract

- VFD prose and legends use the authored character ROM in `vfd-font.js`:
  phosphor dots with controlled emission. The recorder's existing numeric
  segment display remains a segment display.
- LCD map annotations and compact status values use the same ROM with crisp
  rectangular pixels, faint dormant cells, and no phosphor bloom.
- Faceplate etching, printed button legends, paper, world signs, and ordinary
  non-instrument overlays remain physical ink or their own authored medium.
- Values, room names, dialogue, and interaction state come from their existing
  models. Typography does not invent labels, change progression, or own input.

## Shared entry points

`uiText` and `uiGlyph` already use the VFD atlas. `uiItalicText` retains its
legacy transcript API but now draws electronic characters, not native italic
type. Dialogue roles, wrapping, and pacing remain unchanged. Active narration
uses lit counter phosphor on its centered rail; history still fades. Readouts
respect the player's phosphor and brightness settings.

For raw Canvas readouts, use `drawElectronicText` and
`measureElectronicText` from `src/render/electronic-text.js`. Coordinates,
font size, cell advance, and measurements are in device pixels. Pass `mode`
explicitly, and use the matching measurement function for wrapping, label
collision, and truncation. Do not use `fillText` or `measureText` under glass.
The helper has a bounded glyph cache and a visible ROM fallback character.

DOM-backed readouts retain semantic text and live status announcements; only
their visual text is replaced with an aria-hidden, non-interactive Canvas.
Repaint on value, size, UI-scale, or DPR changes. If Canvas is unavailable,
show readable service-label text on a non-glass background rather than
silently presenting a native font as an electronic display.

## Verification

- `test/electronic-text.spec.mjs`: actual LCD pixels/VFD dots, fixed metrics,
  alpha, fitting, Unicode fallback, cache bounds, and shared UI boundaries.
- Recorder, map, battle-preparation, and viewport-guard tests reject native
  text inside their display paths while retaining physical printing.
- `tools/chunk_surfer/verify-electronic-readouts.mjs`: production recorder
  state fixtures and dialogue, plus live recorder/dialogue scenes in a
  disposable browser profile. Captures require visual inspection in addition
  to geometry and native-font exclusion assertions.
- Survey-console browser checks cover architectural labels at compact,
  desktop, and high-DPI sizes alongside real map controls.

These checks are not a native-gamepad, audio-perception, or GPU frame-rate
claim. The architectural view remains derived from compiled map data.
