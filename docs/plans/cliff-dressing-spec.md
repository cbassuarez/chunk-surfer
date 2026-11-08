# The Cliff as a Place — dressing spec

Ruled: the break where the opening drive ends is a place, not a prop. It has
growth against its boundaries, repair history in its rail, and its own stone.
Everything below is already built and shipped in the drive predicament pack
(`public/assets/source-drive/predicaments/drive-predicaments.glb`, revision
`car-nage-whiteout-3`); this document is the contract for keeping it, and for
upgrading the models later without touching placement.

## The three rules

1. **The fall corridor stays open.** The teaser's contract test
   (`test/source-drive-teaser-scene.test.mjs` — "the fallback road helper
   retains real nearby terrain without support beneath the reference airborne
   path") pins that no geometry with a mesh in `buildPredicamentGeometry()`
   sits beneath the van's airborne path between release (d≈304) and the water.
   Dressing therefore keeps to the **lane side** (negative lateral) below the
   road edge, and behind the release point. Any new dressing mesh must be
   placed by hand and re-checked against that test.
2. **Nothing here is solid.** Dressing props are `structural:false,
   decorative:true, noReflection:true` — growth and stone the van drives past,
   never support, never colliders.
3. **Hand-placed, one at a time.** Same doctrine as `src/data/ellery-flora.js`:
   nothing random, nothing even, growth belongs against a boundary.

## The meshes

| mesh | local contract | triangles | material |
|---|---|---|---|
| `cd_gritstone_boulder` | rests on Y≈0 with a chamfered face; strata step along Y; the joint crack faces +Z; ~1.6 m tall at scale 1 | 336 | `cliff` (gritstone stone finish) |
| `cd_broken_rail` | runs along Z (−3…+3.3); the break tears +Z: beam bends outward and down to a jagged end over its snapped post; mount with the break end toward the void | 114 | `steel` + `rust` |
| `cd_scree` | a hand-placed cluster of four worn stones around the origin, resting on Y≈0 | 320 | `cliff` |

Bounds are generated into `src/game/source-drive/predicaments/bounds.js` by
the pack build; the same matrix is submitted to P3.

## Placement

`src/game/source-drive/predicaments/scene.js` → `CLIFF_DRESSING`
(road coordinates: `d` along the road, `lateral` from the centre line;
the lane is ≈ −1.35; the verge starts at 3.25):

| id | mesh | d | lateral | lift | yaw | scale | note |
|---|---|---|---|---|---|---|---|
| cliff-dressing-daisies | vegetation_daisy_drift | 258 | −4.1 | 0 | .3 | .9 | last intact verge |
| cliff-dressing-grass | vegetation_grass_edge | 268 | 4.1 | 0 | −.2 | .8 | |
| cliff-dressing-weeds | vegetation_weed_cluster | 283 | −4.15 | 0 | .4 | .75 | under the climbing queue |
| cliff-dressing-daisies-edge | vegetation_daisy_drift | 290 | −3.9 | 0 | .1 | 1 | the last daisies before the edge |
| cliff-dressing-repaired-rail | cut_guardrail | 285 | 4.62 | 0 | .05 | 1 | slightly askew: the repair that ends |
| cliff-dressing-repair-post | drive_reflector | 286 | 4.45 | 0 | .3 | 1 | the fresh post |
| cliff-dressing-boulder-lip | cd_gritstone_boulder | 296 | −5.4 | −.4 | .6 | .42/.38/.42 | lane-side lip |
| cliff-dressing-boulder-face | cd_gritstone_boulder | 300 | −5.1 | −3 | 1.1 | .5/.45/.5 | on the face |
| cliff-dressing-boulder-face-far | cd_gritstone_boulder | 308 | −5.4 | −5 | −.7 | .38/.34/.38 | low on the face |
| cliff-dressing-broken-rail | cd_broken_rail | 295.5 | 4.6 | 0 | .06 | 1 | torn end toward the void, behind the release |
| cliff-dressing-scree | cd_scree | 302 | −5.5 | −4.6 | .4 | 1.1/1/1.1 | scattered stone below the face |

## Upgrading the models (Blender path)

The pack is procedurally authored; when hand-sculpted models exist they slot
in without touching this spec:

1. Export a `.glb` whose **mesh names are exactly the `cd_*` names above**,
   metre-scaled, honouring each mesh's local contract (pivot at the resting
   plane, break end toward +Z for the rail).
2. Give every primitive the finish conventions: `materialFactors:'gltf'`,
   `studyLocalFinish:true`; use the pack's own material keys (`cliff`,
   `steel`, `rust`) or add new keys in `PREDICAMENT_MATERIALS` (each key adds
   three generated maps — see `build-drive-predicaments.mjs`).
3. Replace the three functions (`gritstoneBoulder`, `brokenRail`, `scree`) in
   `src/game/source-drive/predicaments/geometry.js` with loaders, keeping
   `buildPredicamentGeometry()`'s order, or swap the pack build to read the
   Blender export.
4. Rebuild and re-verify: `node tools/chunk_surfer/source-drive-study/build-drive-predicaments.mjs`
   regenerates `drive-predicaments.glb`, `metrics.json` and `bounds.js`. The
   gates are the tests:
   - `test/source-drive-predicaments.test.mjs` — mesh count, budgets
     (<50 000 triangles, <8 MB), finite complete P3 channels, deterministic
     dressing matrices.
   - `test/source-drive-teaser-scene.test.mjs` — the fall corridor stays open.
   - The drive contract suites (`source-drive-door-teaser`, `cliff-fall`,
     `crash-debris`, `source-drive-preload`) — the crash motion, debris and
     pack loading are unaffected.
5. Budget: the pack's total budget is 50 000 triangles / 8 MB; the dressing
   meshes currently use 770. A sculpted boulder should stay under ~1 500
   triangles; photogrammetry-grade flora belongs in the existing vegetation
   packs, not here.

## Related

- The crash itself: `src/game/source-drive/cliff-fall.js` (physics),
  `crash-debris.js` (dust/gravel/spray/foam), `scripts/cliff-crash-timeline.mjs`
  (the numbers), `output/cliff-crash-review/` (CSV + summary).
- The corridor contract lives in `test/source-drive-teaser-scene.test.mjs`
  and is the reason every dressing row above is where it is.
