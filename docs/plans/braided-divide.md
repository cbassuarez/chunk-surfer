# Braided Divide

Source proper begins after the Hanging Shore's existing lift and Exposed Strata cleft
and ends at the grey doors. Its footprint remains 180 by 150 metres. The lift,
the preceding nothingness, and the routes beyond the grey doors have separate
ownership.

The facade is now the finite geological cut documented in
`docs/plans/exposed-strata.md`. Its broad open-sky release meets the unchanged
first forecourt at 4.2 metres; the first review point is local (4, -399).

The lower street remains continuous at 4.2 metres until a broad final rise meets
the grey-door edge at 15.2 metres. Offset banks, reversible broad ramps and two
optional model crossings provide the structure for exploring the field. There
is no activation puzzle, required tour, conversation quota or mandatory battle.

## Construction

`src/data/source-braided-divide.js` owns the metre-based construction manifest,
25 finite masonry pieces and 19 transformed original game models. Strings,
pianos, percussion, broken busts and the cathedral fragments retain their
recognisable regions. The instrument case and piano crossings use the original
model surfaces at 9 and 15.2 metres, with visible connecting masonry. Their
undersides remain separately walkable on the lower street.

Collision uses compact contact triangles extracted from the checked-in GLBs,
with their original transforms and a spatial index. Source solids have finite
vertical extents. A player underneath a crossing cannot acquire its upper floor.
The independent vertical clock owns a fall; it loses elevation, then settles
onto reachable ground. Body height and falling state survive save/load.

`src/render/source-divide-meshes.js` registers the masonry in the ordinary prop
material pass. Its surface grain uses actual source-atlas text. Native model
materials, the carried flashlight, shadows, acquisition and pressure share the
existing renderer. Geometry stays fixed when looking back. Extent-aware culling
keeps large transformed models and masonry from disappearing at their origins.
The old floating code frames, interactive source landmarks and uncollidable
random architecture scatter no longer populate Source proper.

The proper field uses a soft physical torch profile with a broader penumbra and
compressed received highlights. Battery, fitted optics and HUSH attenuation
remain upstream of it. Ambient keeps the ordinary neutral colour and white
point, with a 0.05 minimum for the open field. The five remembered fixtures
retain their original scale, circuit behaviour and finite reach on the curated
models. All nineteen models resolve real authored provenance.

The surviving disk-warning intrusion begins within 26 metres of the listening
court and withdraws outside that area. It no longer covers the arrival reveal.

## The open floor — 18 October 2026

Most of the 4.2 metre floor is now open drop (`SOURCE_DIVIDE_GROUND` keeps the
rest). Ground survives as the forecourt out of the strata, a lane stub that ends
ten metres short of the case crossing, the lane again from beneath the crossing
to the court and a narrowed final rise, the far strip joining both upper banks
to the grey doors, and pads under the floor-standing models. Banks, ramps and
both crossings hang over the drop. Nothing runs straight from the strata to the
doors on the floor alone: the lane is reached by going up and over, or by
dropping off the case crossing or the west projection. A fall a few storeys
below the lane is cut, and the player is standing at the strata mouth facing in
(`SOURCE_DIVIDE_ARRIVAL`).

## Listening court and commitment

The partial court occupies the lower street's west service edge. Contact is no
longer fixed there: the outline that followed the player from the taken Scene
Dock door is the one met, wherever in Source proper the player closes on it.
It does not pursue the player or open dialogue remotely or through an upper
floor. HUSH remains the nonverbal pressure of the surrounding field. The contact
conversation's slates and some lines still name the service court.

Conversation is available on the first meeting. Questions and radio calls can
change response history. A warning followed by a separate explicit confirmation
is required to commit combat; the reducer rejects an isolated commitment event.
Walking through the grey doors is available without talking or fighting.

## Validation

- Pure geometry checks cover reversible ramps, outer approaches, both model
  crossings above and below the same x/z, real model collisions, the open court,
  closed mesh winding, and contact hashes against the original GLB assets.
- Runtime checks walk every segment while updating actual body support. They
  cover both layers, lateral exploration, retreat, a fall and mid-fall reload,
  complete model transforms, and the real grey-door route.
- The Hanging Shore regression checks retain lift motion, boarding, recovery,
  concealment and reload. Contact checks retain warned commitment and withdrawal.
- `tools/chunk_surfer/verify-source-braided-live.mjs` reviews the production game
  with ordinary continuous keyboard movement and actual E/F interactions. Review
  presets only establish the initial lift and separate court test positions.

### Verified production result

- Final `npm run build -- --outDir /private/tmp/source-braided-final-build`
  passed, including story, document, media and source-atlas validation.
- The combined focused/regression run passed 103 of 104 checks. The remaining
  failure is outside this change in `test/source-finale-routes.spec.mjs:275`: it
  requires a literal `godAbortBattle()` call inside `godCathedralFinalePreset`,
  while the current concurrent God-warp refactor delegates checkpoint cleanup.
  Its Source route and commitment assertions passed before that static check.
- After the final proper-torch refinement, all twenty relevant optics,
  room-memory, renderer and hall-runtime checks passed.
- Production Chrome keyboard walks in normal and reduced motion reached all
  36 authored waypoints and the actual grey-door crossing, including both
  instrument crossings above and below, lateral exploration and retreat. The
  door opened with zero conversations.
- Normal interaction smoke passed 21 checks, including safe withdrawal and
  actual `battle:source-final` entry through warning then explicit confirmation.
  The final visual reload passed seventeen checks, including the real nineteen
  models and five fixture submissions. Both had zero JS/shader/context errors.
- The reduced walk recorded 57 completed checks and reached Horizon. An ENOSPC
  screenshot write interrupted its later sampler/contact block; those
  interactions have separate normal-mode proof. The verifier now records
  capture failures without discarding functional checks and closes its browser
  before writing a compact report. Redundant task-owned production previews
  were removed after verification to recover disk space.

The existing one-bit acquisition still produces a substantial white torch core
on the nearby bank, despite the softened material beam. The spatial studies
show geometry and material relationships, not a replacement recording aesthetic.

Durable reports and selected production captures are in the thread's
`braided-divide-implementation` visualization directory.

The Source entry-edge facade is a separate pending design choice. The lift stays
fixed. The three facade studies alter only the bank facing the first nothingness
and its short, open continuation into this field.
