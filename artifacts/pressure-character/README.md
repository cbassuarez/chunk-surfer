# Pressure: production volume review

Open the [stable review mirror](http://localhost:5312/artifacts/pressure-character/review.html). The [Vite review](http://localhost:5291/artifacts/pressure-character/review.html) also works while that server is running.

The review loads the actual `pressure_body` from `public/assets/pressure-character.glb`, alongside the conservatory prop pack. Front, side and rear views, all nine clips, body cues, world lighting, strength, reduced motion and a real foreground wall are ordinary UI controls. Geometry view displays the actual surface relief; Final runs the production Source world, VFD, Pressure finish and shared POST.

## Arrested Thing

**Arrested Thing · actual hunt** plays a saved 24-second clear-floor run of the real Presence controller. The observer stays stationary; two fixed acoustic sources supply its remembered destinations. Camera orbit and capture scrubbing remain independent of the body.

Ordinary sound hunting uses deterministic, unequal held intervals, a visible 0.4–0.6-second loading motion, and a constrained 0.42-metre advance. The sternum compresses, one shoulder rises and the head retreats before the lead foot scrapes forward; the trailing foot releases late. The resulting strained posture holds completely still. Nearness lengthens the holds, without supplying a bearing or destination. Average closing speed is deliberately lower than the previous continuous hunt; step speed remains within the existing movement limit.

The scheduler moves the actual navigation/collision root. Clip progress follows real travel; a blocked root holds the sampled pose. Phase, step origin, heading and travel are captured with the performance, and borrowed tableaux restore the suspended scheduler. Ordinary saves continue to omit a live hunting body. Source bracketing, Source Contact's authored speed and moving plant/dock tableaux retain their existing coordinate authority and legacy clips.

Near a remembered destination, a shorter committed stride completes the whole gesture without overshooting. A route blocked for 0.65 seconds holds its exact pose, withdraws and reforms over 0.8 seconds at the same collider position, then replans; stance changes only while absent and new catches are suppressed during recovery. Expiring clues wait for the already telegraphed gesture to finish.

A bearing more than 45 degrees away gets a planted pivot, followed by another arrest/load cycle. Each pivot turns at most 45 degrees with zero root travel. Its dedicated foot-lift clip and captured progress make a sound behind the body require several restrained turns. A committed step keeps its destination until it finishes; later sounds influence the next load.

## Architecture

- `src/game/pressure-gait.js` owns the ordinary hunter's arrest/load/advance scheduler. Presence supplies remembered targets, permitted speed and navigation resolution; proximity only lengthens held intervals.
- `src/game/pressure-performance.js` owns bounded presentation state. Simulation supplies position, world heading, captured gait, clip time, manifestation and cue elapsed. Presence, acoustics, Source brackets, contact and progression retain gameplay authority.
- `src/render/pressure-volume.js` converts physical half-metre cells to metre-space mesh instances once. Cues articulate the rig and move actual roots; double/mirror cues submit additional volumes. At most two actors produce four mesh instances.
- `props3d.js` freezes each actor's skin/morph pose before submission. Pressure has its own geometry/depth target and stays outside ordinary material lighting, torch shadows and wet reflections. Its silhouette comes from geometry, with authored normal/roughness relief, rather than a bitmap or camera-facing card.
- `pressure-composite.js` depth-tests the negative material after VFD; shared POST preserves its visible core through Source's colour washes. The physical Source review uses actual prop depth: SourceVoid alpha is coverage, not encoded distance.
- `production-shaders.json` contains the exact evaluated production POST and SourceVoid expressions, with the renderer SHA-256 and shared-dependency hashes. The exporter avoids unrelated world imports; it does not replace or rewrite GLSL. Regenerate it after renderer changes.

## Capture and replay

Use **Record performance**, then **Stop recording** and **Export JSON**. **Import JSON** and **Replay capture** restore the bounded descriptors through the game's actual causal frame codec. Camera orbit remains independent. Playback and recording stop when the page becomes hidden or loses focus. Captures are bounded to 90 seconds / 900 frames; current comfort settings may damp cues without changing recorded routes or clip clocks.

`captured-performance.json` was exported through this UI: **30.1493 seconds, 301 frames, 283,238 bytes**. Reload, import and side-view replay were checked with actual rendered pixels. Missing tracks in older recordings remain absent; replay never synthesizes a live Pressure actor.

`arrested-performance.json` is generated by `node tools/chunk_surfer/capture-arrested-performance.mjs` from the actual Presence simulation and performance driver through the same causal codec: **24 seconds, 492 frames, 34 phase changes**. It includes a change of acoustic source to exercise a planted pivot, without moving the observer.

## Final asset and checks

| Item | Measured production asset |
| --- | --- |
| GLB | 8,728,844 bytes / 8.32 MiB |
| Geometry | 28,762 vertices / 46,996 triangles / one primitive |
| Rig | 34 joints; four corrective morphs |
| Material | One opaque continuous surface; no alpha-card dependency |
| Maps | Two 1024² PNGs and one 512² PNG; estimated 12 MiB RGBA with mipmaps |
| Clips | Original five retained; load 0.50 s, advance 0.72 s, arrest 1 s, pivot 0.72 s |
| Travel contract | Arrested advance 0.42 m; pivot 0 m; authored approach 0.50 m/cycle, limp 0.375 m/cycle |
| Sampled deformation | Maximum edge extension 6.49×; arrested straight sole slide 0.062 mm; turn support drift ≤0.16 mm |
| Loading and seams | Torso/collar compression 55.5 mm; static arrest and phase seams <0.1 mm |

Asset SHA-256: `29f4321a45f48cff08f243591153adbc0de5b25e31a3adb2f26ce2c6d78368b9`. Geometry, skinning, UVs, correctives, textures and the five legacy animation streams remain byte-identical to the accepted asset.

The focused checks cover the actual surfaces, static stops, phase seams, sound-belief movement, behind-sound pivots, navigation, weighted foot contact, saved replay and main physical remapping. `model-preview/arrested/` contains neutral studio views of the same asset; those images are anatomy/material evidence, not the game's final negative finish.

Final verification: focused Pressure, contact, navigation, capture and integration checks pass, including six real-surface support checks. Short strides from 1 mm to 0.42 m retain ≤0.07 mm sole drift across both body heights, transformed floors and legacy captures. Sixteen Fold/character checks also pass. Production authoring/media validators and the production build pass; both emitted character GLBs match the source assets byte-for-byte.

The final-shader browser review checked the actual hunt replay, front/side poses, planted turns, physical-wall occlusion and reduced motion without console or WebGL errors. [Held-strain proof](arrested-final-shader.png) and [captured hunt proof](arrested-captured-hunt.png) are actual browser pixels. Use **Arrested Thing · actual hunt** to inspect the motion.

```sh
node tools/chunk_surfer/export-pressure-review-shaders.mjs
node tools/chunk_surfer/capture-arrested-performance.mjs
node --test test/pressure-character-*.spec.mjs test/pressure-main-integration.spec.mjs test/pressure-volume.spec.mjs test/pressure-gait.spec.mjs test/pressure-turn-support.spec.mjs artifacts/pressure-character/review.spec.mjs
npm run build
cmp public/assets/pressure-character.glb dist/assets/pressure-character.glb
```

Full-game visual acceptance is still pending. The isolated review and build do not establish every in-game encounter, device/GPU performance, or cross-platform presentation. Existing ordinary saves retain their prior behavior: no active hunting body is added to them.
