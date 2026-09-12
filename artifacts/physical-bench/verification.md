# Physical workbench verification — 2026-09-12

Implemented closed-until-taken field case, essential-item glows, simultaneous
physical variant trays, explicit packing and replacement, optional bench-only
spanner choice, three independent amps, and three independent flashlights with
cosmetic housings and real beam/battery trade-offs.

## Passed

- `npm test`: all **316 test files** passed.
- `npm run build`: production build passed. Large-chunk and ineffective
  dynamic-import warnings remain; they are not a build failure.
- `git diff --check`: passed.
- `verify-physical-bench-live.mjs`: production main.js input flow; closed case,
  all essential glows, actual model picking, replacement back to bench, No/Yes
  spanner choices, fitting, compact control bounds, close/reopen, full browser
  reload, final shift commit, selected amp and flashlight in the Bag, and
  carried flashlight inspection. No page errors. See `live/report.json`.
- `verify-workbench-catalog.mjs`: isolated production stage, actual case bays,
  visible stowed spanner, variant swaps, normal/compact/Retina layouts, reduced
  motion, settled-frame caching and disposal. Captures: `../van-catalog/`.
- `verify-bench-models.mjs`: front/back/edge renders of the nine new models and
  revised case. No page errors. Captures/report: `../bench-models/`.
- `verify-kit-inspection.mjs`: selected black/olive/aluminum recorder cosmetics,
  alternate key sets and phosphor, ivory long-throw flashlight, closed-case
  framing, shared renderer reuse and keyboard orbit/reset/close. Five cases,
  no page errors. Captures/report: `../kit-inspection/`.

## Evidence boundaries

The live proof uses a disposable browser profile and explicitly seeds boot and
tutorial prerequisites; it does not claim a complete opening or ending
playthrough. Real mouse/keyboard input exercises the van and Bag. No native-app,
physical-controller-device, subjective audio, or end-to-end night playthrough
was performed here. Beam geometry and all nine amp/light battery combinations
are also covered by deterministic runtime tests.

An older recorder-appearance test expected three cosmetic fields; it was
updated for the fourth, cosmetic-only flashlight housing field before the
successful complete-suite run.
