# ALBION maneuver and packaged playback

Open `/tools/app-icon/maneuver-study/` for motion inspection and `/tools/app-icon/playback-check/` for the shipping atlas player. The maneuver was approved in the conversation before production implementation.

`../vehicle-maneuver.mjs` is the shared authored motion. It integrates a bicycle-model rear axle at 480 Hz, resolves independent Ackermann steering and signed wheel travel at the original four pivots, and separates grounded wheel transforms from the damped sprung body. Canonical dimensions: 2.835 m wheelbase, 1.66 m track, 0.33 m tyre radius. The 1.1 m reverse and spring response are authored choices, not calibrated measurements of a Mk3 suspension. Primary references and their limits are linked in the review.

`../renderer.mjs` exports the shared performance at each final size through the original game acquisition, materials, lights and rain. Its original rear three-quarter orthographic framing is fixed at the approved zoom. `renderer.mjs` is a review adapter with pose injection and contact diagnostics. `appearance-baseline.png` preserves the original neutral 128 px image from before implementation. Matched neutral comparison on the inspecting GPU gave 3 / 16,384 pixels differing by more than one channel level (mean channel difference 0.0007 / 255). This is an appearance control, not a comparison of the authored lamp/body changes.

The 3.4-second maneuver is not a seamless loop. The loader arrives once, holds at 1.94 s while loading continues and retires immediately on early readiness. After settling, readiness releases input immediately while an optional 1.46 s forward departure runs on the non-interactive decoration layer. The Dock retains its settled icon. Focus/visibility stops web painting, not the launch clock. Reduced Motion uses the still and never starts a catch-up animation. Missing/failed atlas decoding also uses a stationary still; there is no translated-poster or translated-video substitute.

`public/startup-van.js` is dependency-free 2D canvas playback. The primary transparent PNG contains 84 × 128 px frames, matching the native frame count and stage timings. Encoded budget: 300 KiB atlas plus 16 KiB poster. The decoded cap is 6 MiB (raised from the previous 42-frame/3 MiB layout to preserve approximately 24 fps). The current atlas is about 116 KiB and the atlas plus poster decode to 5,832,704 bytes. Neither video codecs, a new WebGL context, nor FFmpeg are needed by the player or its export/package path.

`src-tauri/src/dock_tile.rs` owns a process-local `Instant` epoch. AppKit reads it through `chunk_surfer_launch_elapsed_seconds`; the webview uses `chunk_launch_animation_state` with a motion version, elapsed time and one idempotent ready timestamp. The player estimates round-trip uncertainty, refuses poorer samples, joins the current stage without restarting, and resamples on focus. `chunk_launch_animation_ready` is fire-and-forget from the readiness path. Browser painting and AppKit/compositor scheduling are not frame-accurate display synchronization; pre-setup OS launch bounce remains outside this contract.

Native Dock uses the same 84-frame performance at 256 px, stops at settling, releases its atlas and installs the matching resident still. The closed-app plug-in remains static and the persistent ear alternate is preserved. The offscreen native test harness provides a standalone uptime-backed clock for the production FFI contract. Linux tests do not establish actual macOS Dock acceptance; that requires a macOS host.

Export and package:

```
CHROME_PATH=/path/to/chrome node scripts/export-van-icon.mjs --startup
CHROME_PATH=/path/to/chrome node scripts/export-van-icon.mjs
node scripts/build-app-icons.mjs
```

Relevant tests cover independent tyre path/rolling checks, body settling, atlas budgets and provenance, transparent icon coverage and still handoff, native-clock late joining, version mismatch, readiness, timeout, visibility/focus, Reduced Motion, audio cancellation and the KDE portal-shader startup regression. The browser also samples actual GLTF wheel-pivot contact heights; these are geometric/numerical checks, not evidence of calibrated real-world suspension accuracy.
