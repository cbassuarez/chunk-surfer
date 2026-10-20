# The Hanging Shore

The first nothingness begins at the remembered get-in room's FOH door and ends
after the first lift's exterior receiving ledge. Source proper opens through the
Exposed Strata's shallow geological turn. The player first suspects that the places visited so
far may be local constructions within a much larger surrounding absence.

## Crossing

The direct route takes about 35 seconds at an ordinary walk (170 m; it was
374 m and 78 s until 18 October 2026, see "What the building leaves"). This is
real spatial distance. Walking sideways, circling, stopping, returning to the
room and leaving again do not advance a hidden completion quota. There is no
relocation at the bank and no correction of the player's view.

The open door admits actual white, and that is the reveal. Stepping through
it starts no second exposure: the field outside is simply what the doorway
showed. (Until 18 October 2026 the crossing replayed the white as a sustained
full-frame exposure; Seb called that cheap, and it is gone.) Body movement and
its close sounds continue throughout.

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

- Verify the full threshold-to-bank route using actual continuous movement input.
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
4.8 m/s pace. Exposure rose for 1.3 seconds, stayed fully white for five seconds,
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
The continuous approach measured 4.79 m/s in both runs. Diagnostic warps for viewing the
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

## Printed, taken back, followed — 18 October 2026

The walk is printed by the game's own acquisition and post pass, like the
Scene Dock behind it. The shore composite used to repaint smooth material colour
over the encoded frame and skip post, which made this the one undithered stretch
of the game. The empty field prints as paper because its air is above the shore's
white point; giving the void itself grain is a tone decision left open.

Walk 16 metres out of the open door and the Scene Dock is taken back over nine
seconds: its things flatten into the floor first, then its roof, walls, floor,
and the door last, each part thinning out through fixed cells of its own surface.
HUSH comes through as it goes and is left standing where the door was. The room,
its hall, lights, furniture and leak are gone for good, and saves keep it so.

From there HUSH follows (`src/game/source-hush-follow.js`). He walks the
player's footsteps, is late to every change, keeps his own pace and stops now and
then, so his movement never answers the player's one for one. He never closes
the distance on his own. Before the lift he gives ground when walked at, keeping
about nine metres. In Source proper, walking at him makes him come to meet you;
the distance closed stays closed, and contact opens within reach. After a talk he
steps back and gives room.

## What the building leaves (option B) — 18 October 2026

Seb chose option B of `docs/plans/nothingness-walk-options.md`. The Scene Dock
moved in along the walk (`SOURCE_HANGING_SHORE.dockZ`, −204 m), so the FOH door
is 170 m from the deck, 35.4 s at the walk. Source proper did not move: the dock
frame in `source-landing.js` carries the offset, the landscape origin is still
placed from the dock's rear wall, and the God presets' origin moved by the same
amount so their dock stays against the hall. A save made inside the dock before
the move has its origin adjusted once (`dockMoved`); a save already out on the
shore, or past the lift, keeps its origin.

Four pieces of the building stand on the void floor at their real size, off the
line and irregularly spaced (`SOURCE_HANGING_SHORE.pieces`): a practice-floor
music stand at 40 m, a corridor radiator at 82 m, a chair at 118 m, a speaker
cabinet at 150 m. They block the body. Each carries its room's tone in
`audio/source-shore.js`, full inside 1.2 m and gone by 9 m: the practice floor's
440 against 444, a radiator's hiss and pipe, the hall's air, a speaker's 50 Hz.
A piece you are 6 m past is gone the next time it is out of view, and stays
gone (`sourceShore.gone`). Nothing is inspected or picked up. Under all of it
runs one constant, very low keynote: the shore's own air.
