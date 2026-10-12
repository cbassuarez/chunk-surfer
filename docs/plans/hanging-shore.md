# The Hanging Shore

The first nothingness begins at the remembered get-in room's FOH door and ends
after the first lift's exterior receiving ledge. Source proper opens through the
Exposed Strata's shallow geological turn. The player first suspects that the places visited so
far may be local constructions within a much larger surrounding absence.

## Crossing

The direct route takes approximately 75–80 seconds at an ordinary walk. This is
real spatial distance. Walking sideways, circling, stopping, returning to the
room and leaving again do not advance a hidden completion quota. There is no
relocation at the bank and no correction of the player's view.

The open door admits actual white. Crossing it causes a sustained exposure that
gradually recovers into a pale blue-grey field. Turning back does not cancel
adaptation. Body movement and its close sounds continue throughout. Reduced
flash settings receive a gentler exposure, with the same physical journey.

There is no visible walking surface, horizon, weather, drifting debris or
threatening score. Footing remains dependable. The room and bank stay fixed in
world space. Both have finite ends, finished thickness and closed undersides;
neither has an apparent foundation. Nothingness remains visible around them and
at arrival. The room can be approached again and regains its normal detail.

## Light and sound

The carried flashlight remains a finite, soft material light. Nearby grating,
rails, worn fittings and room surfaces respond. Empty space does not. There is
no screen-space beam disc, inversion, special battery penalty or punishment for
looking. A small maintained light makes the boarding edge discoverable with the
torch off.

Room leakage falls away with distance. Dry close footsteps and carried-body
sounds establish continuity. The bank returns a restrained local reflection;
the lift contributes quiet ordinary mechanical sound. Carried recordings retain
their own room tone and normal controls.

## Lift and arrival

The bank is a large, finite cut through accumulated source material. Its broad
deck lowers on approach and waits without a timer. Walking onto it initiates the
rise. The player keeps control of heading and position. Looking back during the
rise lowers the remembered room in the view through physical elevation alone.

The lift rises 4.2 metres to an exterior receiving ledge. Nothingness is still
beside and behind the body; an oblique course conceals Source proper. No activation
puzzle is required. Stepping off costs elevation, with a safe recovery and an
available lift. It does not cause injury, death or a reset.

## Acceptance

- Verify the full threshold-to-bank route using actual held movement input.
- Check arbitrary lateral and backward movement and real bank-end views.
- Verify that circling cannot complete the crossing and that arrival never
  relocates the body or changes the view.
- Verify waiting, boarding, elevation, stepping off and recall of the lift.
- Check the room in backward views before and during the rise.
- Check the flashlight on real nearby surfaces and against the empty field.
- Inspect normal and reduced effects through the actual WebGL renderer.
- Preserve the accepted long hall and remembered-room movement and door work.
- Keep the later Source route and its progression contracts intact.

## Implementation and verification — 11 October 2026

The direct threshold-to-deck span is 374 metres, or 77.9 seconds at the normal
4.8 m/s pace. Exposure rises for 1.3 seconds, holds fully white for five seconds,
then recovers through second fourteen. Reduced flash bounds the exposure to
0.18 without shortening the walk or changing adaptation progress.

The receiving bank is 84 metres wide and 16 metres deep. Its underside is 3.55
metres above the dependable lower plane, its ledge is 4.2 metres up and its crown
is 20 metres up. Finished ends and underside are real triangles. Existing tower
hardware supplies the grating, railwork, louvres, bulkhead and winch. The bank and
remembered room never follow the player or change scale.

The deck begins lowering within 34 metres, waits at the lower plane, and rises
after 0.8 seconds of boarding. Its complete footprint detects an obstructing
body, including the edge outside the smaller boarding margin. A partially
lowered slab also blocks horizontal entry through its thickness. The player can
step off, fall safely, recall it and board again. Save/load retains adaptation,
deck height, body height and view direction, including a mid-ride save.

Production Chromium keyboard traversal passed in normal and reduced effects:
19 assertions per route, including continuous walking, circling, actual camera
elevation, look-back, step-off recovery, recall, the opaque turn and finite ends.
The held approach measured 4.79 m/s in both runs. Diagnostic warps for viewing the
bank end and room exterior were excluded from the continuous-route proof.
Repeated production WebGL presentation cycles also passed independent GL checks.
The final room-side aperture removes old distant terrain while retaining the
foreground leaf, frame and threshold by depth. Fresh threshold runs verify the
presented normal frame is entirely white (mean RGB 255), while reduced flashing
keeps the scene visible. Both retain full movement and the same recovery clock.

Focused Source tests passed 69/69, and the production build passed. Broader
inspection found two pre-existing failures, reproduced against pre-change code:
the outskirts test expects no lamps at its terminal fixture but receives the
same three remnant lamps; the Cathedral review-hook test expects an abort call
absent from both versions. Neither was repaired as part of this section.

Evidence is saved in the current Codex chat's `hanging-shore-implementation`
directory. This establishes browser rendering and keyboard/runtime behavior;
native Tauri play and perceptual listening remain unverified.

## Exposed Strata facade replacement

The bank's former service shell, roofed turn and louvres have been replaced by
27 finite geological prisms. Unequal compressed courses and broken crowns reach
18.35 metres at the highest point. The 84 by 16 metre underbelly, receiving
ledge, lift hardware and full lift motion contract retain their original shape.

The eight metre mouth opens to the sky and widens into the first forecourt.
Source appears when the body rounds the actual projecting course; the release
uses its real eye-height sightline and capsule clearance. Reversing the walk
restores the shore using the same geometric condition. Details and current
validation belong to `docs/plans/exposed-strata.md`.
