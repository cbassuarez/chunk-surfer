# Music-box keepsake — integration plan

The keepsake (Lyle's broken Clair de Lune box) is becoming an interactive, in-hand
object built entirely from Seb's real recording. This records what exists, the
contracts between layers, and the one remaining step (the visual/scene wiring).

## Built and tested (35 tests, `node --test`)

| Layer | Module |
|---|---|
| Winding mechanism (hold/crank/slam/skip/wear, governor, ratchet clicks) | `src/game/coastal-memory/winding.js` |
| Hands input glue (pinHeld / crankDelta / shake → winding) | `src/game/coastal-memory/hands.js` |
| Interaction controller (pick up / rotate / shake / crank / put down → frame) | `src/game/coastal-memory/hands-scene.js` |
| Full phrase bank (5 whole playthroughs) | `src/data/coastal-music-box-phrases.js` |
| One-shot bank + "repitch only missing notes" rule | `src/data/coastal-music-box-notes.js` |
| Lo-fi crush (8–12 bit, 20–32 kHz) | `src/audio/lo-fi.js` |
| Interactive audio owner (varispeed phrase + broken bits) | `src/audio/coastal-memory-winding.js` |
| Hands interaction (pick up / rotate / shake / crank / put down) | `src/game/coastal-memory/hands-scene.js` |
| Renderer input (mechanism from winding + in-hand box placement) | `winding.js` (`coastalHandsMechanism`) + `scene.js` (`hands`) |
| Overture renderer (offline: music box + Bach Chaconne + Couperin clavecin) | `tools/chunk_surfer/build-music-box-overture.mjs` |

Assets: `assets/music-box/phrases/`, `assets/music-box/samples/`,
`assets/music-box/overture.wav` / `.m4a`, with `phrase-bank.json` and `note-bank.json`.

## Data flow (the contracts)

```
pointer/wheel/controller
   └─► stepHandsInteraction(state, {pickUp,putDown,pinHeld,crankDelta,shake,lookDelta}, dt)
          └─► stepHands  →  stepWinding  →  { state, events }
                ├─► createCoastalWindingAudio.update({state: winding, events, turn, held})
                │      phrase BufferSource.playbackRate = phraseRate(crank)   (slow/fast)
                │      slam ⇒ stop phrase + rake one-shots + whoosh
                └─► renderer draws from handsInteractionFrame(state):
                       boxPose.yaw/pitch (orbit), cylinderAngle, keyAngle, shakeLevel, ui
```

`handsInteractionFrame` already exposes every renderer input; the audio owner
already voices every event. The visual layer is the only unwired seam.

## Remaining: live scene + audio wiring

The renderer input is built and tested (`coastalHandsMechanism` turns the winding
state into the cylinder/gear/key/fan/tine mechanism; `makeCoastalMemoryScene({hands})`
draws the box in hand instead of on its plinth; `coastalHandsHeldLocal` places the
held box in front of the camera). The live scene controller exists too
(`src/game/coastal-hands-scene.js`), routing E/F/W/S/A/D/Q input through
`stepHandsInteraction` into `createCoastalWindingAudio`, and `coastalMemoryRenderFrame`
carries `frame.hands` into the scene. The plinth scene exposes `frame.canPickUp` +
`frame.ui.pickup` ('F · PICK UP THE BOX'), and `F` in range calls `onPickUp`.
`main.js` wires `onPickUp` to `beginCoastalHands()` (pauses the plinth scene, pushes
the hands scene sharing the coastal renderer, and resumes on `releaseCoastalHands`).

The build is code-complete; what remains is in-game QA, which needs `pnpm dev`:

1. **Double render.** Both the paused plinth scene and the hands scene call the
   shared renderer each frame (scenes.js renders bottom-up). The hands scene is
   later and wins, but the coast is drawn twice — gate the plinth scene's
   `renderer.render` on `!paused`, or fold hands into the plinth scene as a mode.
2. **UI overlay.** The plinth scene's `paintOverlay` still draws its note/recorder
   hints during hands mode; the hands scene's `ui` needs a `paintOverlay`.
3. **Feel.** Render pose, crank rate, slam and the lo-fi voice need an ear/eye pass.

The winding, input, audio and lo-fi layers are complete and deterministic; the
remaining work is presentation and needs the game running to verify.
