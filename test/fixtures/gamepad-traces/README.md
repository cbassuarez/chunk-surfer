# Gamepad trace fixtures

Real device sessions, recorded by the game itself, replayed in tests.

## Capturing a new fixture

1. Run the game in dev with `?gamepadTrace` — the live pad is recorded one
   frame per poll from boot.
2. Perform the session you want to pin: hold a trigger at its threshold and
   wobble it, walk a drifting stick, press each face button once.
3. Disconnect the pad (or unplug it). The game downloads
   `gamepad-trace-<timestamp>.json` automatically.
4. Rename it (`<device>-<what-it-does>.json`), drop it in this folder, and
   check the file's `frames` array: axes are raw pad values, buttons are
   keyed by semantic id (`south`, `leftTrigger`, …) or physical index.
5. Every file here replays in `test/gamepad-trace.test.mjs` on every test run:
   it must be well-formed and must produce at least one action. Trim the
   trace to the interesting seconds — the whole session is usually noise.

## Shape

```json
{ "schema": 1, "frames": [ { "axes": [lx, ly, rx, ry, …], "buttons": { "south": 1, "leftTrigger": 0.56 } } ] }
```

Semantic button ids are placed on the physical index where THAT device's row
in the SDL GameControllerDB says they live, so the same trace replays
truthfully on any device shape.
