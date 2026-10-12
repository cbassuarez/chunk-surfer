# Source route verification

`live/report.json` records the final route harness result; its screenshots are
captured from the running game, not mockups. The separate arrival proof is in
`../source-arrival/final/`.

## Reproduce

Start Vite on `127.0.0.1:5296`, then run:

```sh
node tools/chunk_surfer/verify-source-route-live.mjs
node tools/chunk_surfer/verify-source-arrival-live.mjs
node tools/chunk_surfer/verify-source-terminal-live.mjs
```

The route harness uses disposable authored checkpoints, real keyboard dialogue,
held movement, and an independent captured-mouse look check. Route-following
bearings are set with the existing camera probe. The arrival harness starts at
the still-sheet checkpoint and uses real interaction to lower the page, enter
the dock without relocation, open the physical FOH leaf, and cross into the
white approach.

The terminal harness exercises the production window-media WebGL2 module in
Chromium at a narrow desktop-pane size, including snapshot changes and erasure.
It uses a synthetic name, never the user's identity.

These are not full playthroughs. Real Tauri window placement/focus, perceptual
audio, and every complete ending still require hands-on native QA. The horizon
effect distorts the shipped video splats procedurally; it does not generate new
neural DeepDream imagery. The field renders existing project bell GLBs.
