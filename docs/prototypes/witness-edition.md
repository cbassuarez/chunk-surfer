# WITNESS EDITION

An optional clear champagne-polymer replacement faceplate for the AUDIOCORP recorder. This is a permanent cosmetic reward, not a new recorder or difficulty modifier.

## Earning and fitting

- Hidden before any ending; an inspectable, locked preview appears after one distinct valid ending.
- Two different committed endings unlock it, on any difficulty. Repeating an ending or dying does not count. Existing qualifying profiles are recognized.
- The van displays a separate replacement plate in a protective sleeve. Inspect it, rotate it, compare plate/rig, and explicitly choose FIT PLATE after collecting the case. Inspection alone does not change the kit.
- Fitting preserves hardware, button palette, and phosphor. The selected finish persists into new runs; new-run hardware and other colors retain their existing reset behavior.
- The equipped recorder can be inspected from the case without exposing a fitting action. Cancelled/replaced inspections cannot later fit through an old callback.

## Physical construction

`src/data/witness-assembly.js` is the authored parts manifest for both the Canvas recorder and the independent GLB. It describes two green circuit boards, copper paths, labeled connectors, silver capacitors, amber film components, cream/oxblood harnesses, switch mechanisms, brass seats, and earned service marks. This is plausible fictional instrument construction, not an electrical engineering schematic.

The optical well and inner tray stay opaque. The polymer is a separate shell with a display cutout and three control apertures. The GLB carries transmission, volume, and IOR extensions. Canvas uses layered material shading and bounded raster caches. Neither presentation invents signal readings or changes the established VFD/control layout.

Service marks use canonical earned ending identities. The live Canvas stems use the same sampled control travel as their caps. In the physical inspector, TEST KEYS is explicitly a mechanism test, never a recording command.

## Assets and ownership

- `public/assets/items/field-recorder-witness.glb`: complete recorder with open chassis and visible electronics.
- `public/assets/items/witness-faceplate.glb`: separate sleeved replacement plate.
- Rebuild only these assets: `node scripts/build-van-kit-models.mjs --only=field-recorder-witness,witness-faceplate`.
- Inspection uses one scene-local WebGL renderer, no private animation loop, and disposes resources on exit. The workbench suspends while inspection is open. Material adapters restore original resources before disposal.

## Checks

Focused tests cover valid/distinct endings, return commits, retroactive ownership, save/import/new-run persistence, unchanged gameplay effects, stale callback rejection, responsive layout, Canvas opacity/text/control geometry, independent asset construction, and inspection lifecycle.

Browser verification scripts are `verify-witness-canvas.mjs`, `verify-witness-inspector.mjs`, and `verify-witness-live.mjs` in `tools/chunk_surfer/`. Their artifacts go under `artifacts/witness-edition/`. Live verification uses a disposable browser profile with seeded ending history; it is not a claim of playing two complete runs or of native-app validation.

Verified on 2026-09-12: 61 final focused tests pass. The repository runner passed its first 307 test files before the sandbox blocked a local socket; its final three files (`system-map`, `audits`, `narrative-studio`) all passed when rerun with local-server permission. Canvas has five passing browser fixtures; physical inspection has seven. The final production-game browser run reports zero page errors and exercises hidden/locked/owned states, the case prerequisite, explicit fitting, retained color/hardware choices, fitted GLB replacement, read-only carried inspection, and the live recorder. Inspecting the sleeved plate cannot fit it through a held Enter repeat.

The production build passes. Existing bundle-size and ineffective-dynamic-import warnings remain. Native application/controller testing and complete ending playthroughs were not performed in this pass.
