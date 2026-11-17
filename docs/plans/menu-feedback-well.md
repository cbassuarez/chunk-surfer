# Selected menu treatment: Feedback well

The title menu now uses the selected Feedback well preset from the signal study.
The renderer consumes the finished positive world frame, integrates world-only
history at 30 Hz, applies the shared exposure/vignette finish, and presents it
beneath the existing field-case UI canvas. Credits retain their existing print
treatment. A fresh profile retains the intentional no-run/no-camera black field.

The selected values are unchanged: damage `0.96`, registration `22`, feedback
`0.95`, exposure `0.20`, vignette `0.40`, cyan `#679ead`, orange `#ed784a`.
Both preview and production import the same signal and finishing shader strings.

The existing title lift controls the effect's crossfade into gameplay. History
does not advance during pause, hidden/unfocused presentation, or reduced motion;
resuming does not repay elapsed time. Camera cuts invalidate history. Three
RGBA8 targets are allocated lazily and released after leaving the menu (12 bytes
per output pixel, approximately 11.1 MiB at 1280 × 760). Offscreen tower captures
do not receive this treatment. Allocation/compilation failure falls back to the
ordinary positive world presentation and exposes an error in diagnostics.

## Verification performed, 2026-11-16

- Eight focused tests in `test/menu-feedback-pass.spec.mjs` pass: exact selected
  settings and shared finish; equivalent fixed-step history at 30/60/120 fps;
  pause/reduced-motion/absence timing; prepared-camera ownership and title lift;
  preset-cache invalidation after session overrides;
  history ping-pong, resize, invalidation and release; failed-target cleanup;
  world-POST integration order and offscreen-capture exclusion.
- The front-end grade/session/review, window-surface and cinematic-lens suites
  pass. Additional front-end continuity/static, critical title-paint, God-menu,
  look-profile and pixel-mesh contract suites pass.
- The broader `god-menu-repair.test.mjs` suite has eight failures. Running its
  unchanged fixture with the HEAD renderer produces the same eight failures:
  four location-anchor checks, three missing `godSnowValley` fixture bindings,
  and one missing `combatBuild` fixture binding. They were left outside this
  change. The failed test names are preserved in the evidence directory.
- A production Vite code build succeeds (1545 modules). Public asset copying and
  release packaging were not part of this build check.
- Mesa OpenGL ES 3.2 compiled and executed both production shaders at 1280 × 760,
  including 42 history samples for each input path. DOM-image and production
  framebuffer source orientations differ by at most one 8-bit channel level;
  `glGetError()` reports zero. The same captured world plate and actual case UI
  were used for the offscreen composite.
- `git diff --check` passes.

Evidence is in `artifacts/menu-feedback-live/2026-11-16/`: the JSON shader
receipt, exported shader strings, the offscreen composite, a reproducible EGL
script, and baseline failure names. The composite uses a recorded world plate;
it is **not a screenshot of the live game**.

## Remaining live check

The browser automation connection reported no enabled browsers; opening the
review also returned “Browser is not available: iab.” No live menu recording,
interactive Continue handoff, indoor-scene inspection, or GPU performance result
is claimed. The tests establish timing and resource behavior in isolation; the
offscreen comparison establishes shader compilation and orientation agreement.
Neither establishes live usability or perceived motion quality.

The developer review harness can be started with:

```sh
node tools/chunk_surfer/menu-feedback-review-server.mjs
```

Open `http://127.0.0.1:5456/?nodisplaynotice=1&skipwarn=1&nomic=1` and use its
explicit developer controls to prepare an outdoor/indoor title camera, compare
the positive reference, toggle reduced motion, capture a frame, or record eight
seconds. “Continue with Enter” sends ordinary title-menu input. Recordings and
frame receipts are saved locally in the evidence directory. No review controls
are imported by the production entry point.
