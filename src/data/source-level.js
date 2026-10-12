import { SOURCE_HANGING_SHORE } from './source-hanging-shore.js';
import { ELLERY_BELLS, PLACE_MS } from './bell-tower.js';
import { createBellFrameLayout } from './bell-tower-layout.js';
import { CELL } from './floorplan/legend.js';
import { fullCircleBellCurve } from '../game/bell-tower-runtime.js';

// THE SOURCE FIELD, AS AN AUTHORED LEVEL.
//
// It used to be a lawn. sourceLandscapeFloorAt was slope-bounded on purpose "so
// the whole field stays walkable", and landscapeCell said the quiet part: free
// roam, no causeway walls, routes surviving only as brighter paint. Nothing was
// gated, no route cost anything, and the only verb was walk-there-and-press-F.
//
// THE GRAMMAR IS THREE PIECES.
//
//   TIER    a plateau at a fixed height, separated from its neighbours by more
//           than a step. Elevation you cannot simply walk up is the first
//           constraint this space has ever had, and every other decision here is
//           downstream of it.
//   LIFT    the only way UP. A column of rising field commits the body without
//           asking for a jump or an interaction prompt.
//   CHUTE   a one-way ride DOWN. Fast, carrying, and the surf the game is named
//           for. It is also the cost — a fall is simply a chute you did not
//           choose. You never die and you are never reset here; you lose
//           ALTITUDE, and altitude is the currency.
//
// The tiers follow the depth the narrative already uses, and the ladders and
// chutes sit on the route spine that ROUTE_SEGMENTS already describes — both
// spokes already rejoin the spine at recordist-loop, so "loops, not dead ends"
// was authored long before there was any geometry to make it true.
//
// Coordinates are landscape-local, the same space as LANDMARK_OFFSETS: x is
// across, y is NEGATIVE into the field.

// A cliff has to be taller than the 0.45m the ordinary step allows, or it is not
// a constraint. These are comfortably past it and read as a storey.
// THE FIRST NOTHINGNESS. The remembered room opens onto a 374m physical walk
// to the Hanging Shore. Its receiving deck replaces the first stair and puzzle.
// Later Source geometry shifts together, preserving every internal length.
export const SOURCE_APPROACH_CELLS = SOURCE_HANGING_SHORE.approachCells;
export const SOURCE_APPROACH_BASE_CELLS = 120;
export const SOURCE_APPROACH_SHIFT = SOURCE_APPROACH_CELLS - SOURCE_APPROACH_BASE_CELLS;
const shiftedApproachY = (value) => Number(value) - SOURCE_APPROACH_SHIFT;

// ── OUT PAST THE FIELD, BEFORE THE TAPE ─────────────────────────────────────
//
// The field used to end and the recording used to start, in the same step. That
// made the horizon somewhere you were PUT rather than somewhere you walked to,
// and it gave the tape nothing to arrive out of.
//
// Two stretches now stand between them, in this order:
//
//   NOTHING     past the grey doors, first: still, dark, dry ground with nothing
//               on it. The doors shut behind him and for a while there is only
//               the picture on the horizon.
//   OUTSKIRTS   then the road he arrived on, and it does not end. About a
//               kilometre of the same night, drifting a little further wrong
//               every stretch (src/data/source-outskirts-arrival.js), until it
//               runs out a short walk from the head of the tape.
//
// THE ORDER USED TO BE THE OTHER WAY ROUND — the road first, then two hundred
// cells of nothing between its end and the tape — which put the stillness where
// it only delayed the picture, and made the road a hundred metres long.
//
// THE AUDIO CONTRACT ALREADY COVERS THIS AND NEEDED NO CHANGE. The horizon's
// playhead is `sourceHorizonDepth`, which clamps to zero for anybody standing
// short of the seam — so both stretches play at second zero, which is silence,
// and the piece begins on the step that crosses into the tape.
export const SOURCE_NOTHING_LENGTH = 70;
// About 1 km of the repeating scene, then 60 m of black to one faulty streetlight
// and the recorder under it, and a little more before the head of the tape.
export const SOURCE_OUTSKIRTS_LENGTH = 2180;
export const SOURCE_PRE_TAPE_LENGTH = SOURCE_NOTHING_LENGTH + SOURCE_OUTSKIRTS_LENGTH;
// Everything from the horizon outward moves out by the two new stretches. Same
// device as shiftedApproachY, which is how the red approach was inserted.
const preTapeY = (value) => shiftedApproachY(value) - SOURCE_PRE_TAPE_LENGTH;

export const SOURCE_TIERS = Object.freeze([
  // id        from    to      height   what is on it
  // Boundaries follow where the landmarks actually stand, not the other way
  // round: fork-room (-42) and BOTH optional traces (-104) share the fork tier,
  // which makes it the wide exploring tier; recordist-loop (-142) is one climb
  // up; body-room (-232) and the final page (-312) are the last tier.
  //
  // `field` marks a tier as part of the tiered landscape, where the whole point
  // is that a boundary costs you a lift or a chute. The horizon is not one of
  // those and must not be checked as one — see the grammar assertion in
  // test/source-level.spec.mjs.
  Object.freeze({ id: 'arrival',  from: 16,   to: shiftedApproachY(-160), height: 0.0, field: true }),
  Object.freeze({ id: 'fork',     from: shiftedApproachY(-160), to: shiftedApproachY(-240), height: 4.2, field: true }),
  Object.freeze({ id: 'trace',    from: shiftedApproachY(-240), to: shiftedApproachY(-340), height: 9.0, field: true }),
  // The field's own perimeter is at -340 and the return tier ends there, because
  // that is where the ground has always actually stopped.
  Object.freeze({ id: 'return',   from: shiftedApproachY(-340), to: shiftedApproachY(-460), height: 15.2, field: true }),
  // THE HORIZON. Same height as the return tier on purpose: there is no cliff
  // and no lift between them, because arriving here is not a climb and not a
  // fall. You walk out through the perimeter — the one wall the field has — and
  // the ground simply keeps going, and some way out there it stops being ground.
  // The two stretches between the field and the tape. Not field tiers: there is
  // no climb out here and no boundary that costs you a lift. Same height as the
  // return tier and as the horizon, because none of this is a step — the ground
  // simply keeps going after the field has stopped having anything on it.
  // Still first, then the road.
  Object.freeze({ id: 'nothing',   from: shiftedApproachY(-460), to: shiftedApproachY(-460) - SOURCE_NOTHING_LENGTH, height: 15.2, field: false }),
  Object.freeze({ id: 'outskirts', from: shiftedApproachY(-460) - SOURCE_NOTHING_LENGTH, to: preTapeY(-460), height: 15.2, field: false }),
  Object.freeze({ id: 'horizon',  from: preTapeY(-460), to: preTapeY(-972), height: 15.2, field: false }),
  // THE BELLS. Where the tower road goes, and it is not a cut.
  //
  // Taking the bust's detour used to hand the player eight and a half seconds of
  // datamosh with hand-rolled wireframe machinery drawn over it, and then put
  // them in the belfry. This is the same journey walked: four hundred metres of
  // the same flat ground the tape stands on, with the real bell meshes standing
  // in it at every wrong size, and a room resolving out of the far end.
  //
  // Same height as the horizon for the same reason the horizon shares the return
  // tier's: nothing between them is a climb. You walk out of the recording and
  // the ground keeps going.
  Object.freeze({ id: 'bells',    from: preTapeY(-972), to: preTapeY(-1524), height: 15.2, field: false }),
]);

// The tiered landscape proper. Altitude is the currency here and every boundary
// has to cost something; the horizon is past the perimeter and outside that
// economy entirely.
export const SOURCE_FIELD_TIERS = Object.freeze(SOURCE_TIERS.filter((t) => t.field));

// THE TAPE, AS A DISTANCE.
//
// Depth is time out here: every metre further in is a frame further into the
// recording, and the frames behind you stay standing, which is the only honest
// way to render a codec that survives by keeping the last picture it had.
//
// 512 metres against 259 seconds puts the whole piece at a walk. Two metres a
// slice is the spacing that keeps a wall reading as a wall at eye height
// without paying for frames nobody can resolve.
// THE WALK OUT, as one span with two halves. The tiers carry the extents; this
// carries how wide it is and where he is put when the field lets him go.
export const SOURCE_PRE_TAPE = Object.freeze({
  // Same arithmetic the tiers are built from — SOURCE_TIER_BY_ID is not
  // assembled until further down the file, and a lookup that runs before its
  // table exists is a worse dependency than repeating two additions.
  from: shiftedApproachY(-460),
  // The still stretch, then the road, which runs on to the head of the tape.
  stillTo: shiftedApproachY(-460) - SOURCE_NOTHING_LENGTH,
  roadFrom: shiftedApproachY(-460) - SOURCE_NOTHING_LENGTH,
  stillLength: SOURCE_NOTHING_LENGTH,
  roadLength: SOURCE_OUTSKIRTS_LENGTH,
  to: preTapeY(-460),
  length: SOURCE_PRE_TAPE_LENGTH,
  // Wider than the tape's walking band and wider than the field. Out here there
  // is no route: the only reason to go one way rather than another is that the
  // ground is going that way too.
  halfWidth: 72,
  // Put over the seam rather than walked across it, on the same rule the horizon
  // and the bell passage use — what is behind him has finished with him.
  entryStandoff: 6,
});

// 0 at the field's edge, 1 at the head of the tape. The structures thin on this
// and the last of them is gone before the nothing starts.
export function sourcePreTapeProgress(y) {
  const span = SOURCE_PRE_TAPE.from - SOURCE_PRE_TAPE.to;
  if (!(span > 0)) return 0;
  return Math.max(0, Math.min(1, (SOURCE_PRE_TAPE.from - (Number(y) || 0)) / span));
}

// HOW MUCH IS STANDING OUT HERE, 0 or 1. The still ground past the doors is
// exactly empty; the road, from its first metre to the head of the tape, is
// furnished all the way. Nothing out here thins any more — it goes on.
export function sourcePreTapeDensityAt(y) {
  const ly = Number(y) || 0;
  return ly <= SOURCE_PRE_TAPE.roadFrom && ly > SOURCE_PRE_TAPE.to ? 1 : 0;
}

export const SOURCE_HORIZON = Object.freeze({
  from: preTapeY(-460),
  to: preTapeY(-972),
  length: 512,
  tapeSeconds: 259.375,
  sliceMetres: 2,
  slices: 256,
  // Lateral half-width. Soft — a wash, not a wall. See inHorizon().
  halfWidth: 96,
  // How far past the seam he is put when he arrives, so he is not stood with his
  // back clipping the perimeter. It costs the first few seconds of the tape,
  // which is the sun coming up, and he is meant to arrive with it already going.
  entryStandoff: 6,
});

// Metres into the tape, from the seam where the field ends. Clamped, so a body
// standing short of the boundary reads as the head of the recording rather than
// as a negative time.
export function sourceHorizonDepth(y) {
  const ly = Number(y) || 0;
  return Math.max(0, Math.min(SOURCE_HORIZON.length, SOURCE_HORIZON.from - ly));
}

// The playhead, in seconds. This is the whole audio contract: position IS time,
// so stopping stops the piece and walking back runs it backwards.
export function sourceHorizonSeconds(y) {
  return (sourceHorizonDepth(y) / SOURCE_HORIZON.length) * SOURCE_HORIZON.tapeSeconds;
}

// Which baked slice a depth lands on, and how far between it and the next.
export function sourceHorizonSlice(y) {
  const exact = sourceHorizonDepth(y) / SOURCE_HORIZON.sliceMetres;
  const index = Math.max(0, Math.min(SOURCE_HORIZON.slices - 1, Math.floor(exact)));
  return { index, fraction: exact - index };
}

// ── THE BELL PASSAGE ────────────────────────────────────────────────────────
//
// A place where time is null. Six bells were cast for one tower and hung in one
// frame at one size; out here they are the same six objects at every size they
// could have been, standing in a ground that does not end. Almost all are mute.
//
// It is a physical walk, not a timed corridor. Contact pushes the body clear;
// only the occasional sounding bell contributes to the field's noise limit.
// The room at the end is still the same tower arrival, reached on foot.
export const SOURCE_BELLS = Object.freeze({
  // Moved out with its tier when the red approach was inserted. This manifest and
  // the `bells` entry in SOURCE_TIERS have to agree exactly — a gap between them
  // is undrawn ground.
  from: preTapeY(-972),
  to: preTapeY(-1524),
  length: 552,
  // Quiet reset position after too many sounding contacts. First arrival is
  // walked through the seam and must not use this recovery standoff.
  entryStandoff: 8,
  // Runtime coordinates are half-metre cells. Checkpoints are deliberately in
  // empty clearings, not at an arbitrary percentage inside an obstacle.
  checkpoints: Object.freeze([
    Object.freeze({ depth: 148, x: 0 }),
    Object.freeze({ depth: 282, x: 0 }),
    Object.freeze({ depth: 424, x: 0 }),
  ]),
  // Lateral half-width. Wider than the tape's walking band — this is an open
  // ground, and the only thing keeping anybody on course is the room.
  halfWidth: 58,
  // THE ROOM: where the road's door stands. Crossing its threshold is the commit
  // (see the door fields in source-space-runtime.js).
  room: Object.freeze({
    // AT THE END OF THE 432, NOT TWO THIRDS OF THE WAY DOWN IT.
    //
    // It used to stand at depth 274 of a passage declared 432 long, and since
    // crossing the threshold is what completes the chapter, everything authored
    // past it was unreachable — the whole of act three, the six bells at true
    // scale, the thing the walk exists to arrive at. Nobody had ever seen it.
    // The comment below still says "the last hundred and forty metres is the
    // passage remembering what a ring is": 432 - 140 = 292, which is where the
    // ring starts. The ring was always meant to lead INTO this room.
    at: preTapeY(-1516),
    // Authored in metres about the room's own centre; the belfry chamber is
    // thirteen by nine inside its frame.
    halfX: 6.5,
    halfZ: 4.5,
    height: 11.0,
    // Where the passage hands over. The player is standing at the threshold and
    // walking forward; this is the last metre of source space.
    threshold: preTapeY(-1510),
  }),
  // THE TOWER'S DOOR FIELD, between the ring and the belfry — whose missing wall
  // now holds the tower door. See DOOR FIELDS in source-space-runtime.js.
  doors: Object.freeze({ from: preTapeY(-1400), to: preTapeY(-1496) }),
  // How far out the room begins to resolve, and where it is unmistakable. The
  // whole third act of the walk is a shape getting closer.
  resolveFrom: preTapeY(-1272),
  resolveTo: preTapeY(-1488),
});

// ── THE CHAPEL'S OUTSKIRTS ──────────────────────────────────────────────────
//
// Straight on used to end at the last frame of the tape. Now the recording runs
// out into nothing, past the nothing stands a field of doors, and past those the
// chapel's own pair. Walking through that one is what ends Source space on the
// chapel road. Same flat ground and height as the tape. The y-range is the bell
// passage's too, which is fine: the two roads are never open at once.
export const SOURCE_CHAPEL_OUTSKIRTS = Object.freeze({
  // Two cells of overlap with the tape's tail, so the body is on ground the
  // moment the phase changes under it.
  from: SOURCE_HORIZON.to + 2,
  doorsFrom: SOURCE_HORIZON.to - 200,
  doorsTo: SOURCE_HORIZON.to - 296,
  doorAt: SOURCE_HORIZON.to - 312,
  to: SOURCE_HORIZON.to - 324,
  halfWidth: 72,
  entryStandoff: 4,
});

export function sourceBellsDepth(y) {
  const ly = Number(y) || 0;
  return Math.max(0, Math.min(SOURCE_BELLS.length, SOURCE_BELLS.from - ly));
}

// 0 out on the open ground, 1 standing at the door. The renderer fades the room
// up on this and the audio opens the tower bed on it.
export function sourceBellsRoomResolve(y) {
  const ly = Number(y) || 0;
  const span = SOURCE_BELLS.resolveFrom - SOURCE_BELLS.resolveTo;
  if (!(span > 0)) return 0;
  const t = (SOURCE_BELLS.resolveFrom - ly) / span;
  return Math.max(0, Math.min(1, t));
}

// ── WHAT IS STANDING IN IT ──────────────────────────────────────────────────
//
// The six bells of St Brendan's, the frame they hang in, their wheels and their
// clappers — the same meshes the real belfry is built from (build-props.mjs,
// tower_*) — at every size except the one they are.
//
// The bell mesh hangs from its headstock: the crown is at y +0.14 and the mouth
// at -1.02, about 1.28 across. So `elevation` is where the headstock is, and a
// bell whose mouth sits on the ground is at elevation 1.02 * scale.
//
// Three acts over four hundred and thirty metres, and the whole shape of it is
// scale losing its mind and then getting it back:
//
//   ARCHITECTURE   bells the size of buildings, half sunk, dead still. You walk
//                  between them the way you walk between blocks of flats.
//   NULL           the place where time is not. Bells at coin scale scattered
//                  across the ground; one you pass underneath; a frame with
//                  nothing hung in it; a wheel with no bell; one inverted and
//                  filling with nothing. Sizes stop meaning anything.
//   RESOLUTION     six bells, in order, at true scale, in a real frame — which
//                  is the ring you are about to be standing under.
//
// `contact` marks bells handled by the soft-contact field runtime. They must
// not also be hard grid blockers: that prevented the body ever touching them.
// `sounds` is authored sparsely; scale and motion never imply an audible strike.
// ── AND WHAT IS MOVING ──────────────────────────────────────────────────────
//
// Motion follows the same three acts scale does, because it is the same idea:
// it loses its mind in the middle and gets it back at the end.
//
//   ARCHITECTURE  nothing moves. They are too big and half sunk and they do not
//                 care that you are here.
//   NULL          movement that is wrong. A wheel turning with nothing hung in
//                 it, one inverted and rocking, the coins shivering underfoot.
//                 Rates are deliberately unrelated to size, so nothing out
//                 there has the weight it should.
//   RESOLUTION    six bells swinging full circle, in order, which is a ring.
//
// THE PIVOT IS FREE. The mesh hangs from its headstock — crown at +0.14, mouth
// at -1.02 — and `elevation` is authored as where the headstock is, so a bell
// rotated about its own origin swings on the correct axis with no new geometry.
//
// Large decorative swing remains overhead. Grounded bells use their rendered
// roll and imported mesh bounds for body contact, never a second grid wall.
export const BELL_SWING = Object.freeze({
  // A full-circle bell goes up past the balance on one side, down through the
  // bottom and up the other: a bit under half a turn either way from the mouth.
  FULL: Math.PI * 0.94,
});

export function bellSwingAt(entry, timeSec = 0) {
  return bellAssemblyPoseAt(entry, timeSec).angle;
}

// THE CHAPEL'S OWN STROKE. Every bell out here is a bell of the ring, so when it
// moves it moves the way bell-tower-runtime moves it in the tower:
// fullCircleBellCurve, up past the balance with that bell's own dwell and strike
// phase, handstroke and backstroke alternating direction, and the clapper
// lagging by the chapel's curve. There is no other kind of motion.
export function bellAssemblyPoseAt(entry, timeSec = 0) {
  const swing = entry?.swing;
  if (swing?.kind !== 'full-circle') return { angle: 0, clapperAngle: 0, sliderOffset: 0 };
  const period = Math.max(0.05, Number(swing.period) || 1);
  const strokes = Math.max(0, Number(timeSec) || 0) / period + Math.max(0, Number(swing.phase) || 0) / (Math.PI * 2);
  const stroke = Math.floor(strokes), p = strokes - stroke;
  const direction = stroke % 2 ? -1 : 1;
  const bell = ELLERY_BELLS[(Number(entry.ring) || 1) - 1] || ELLERY_BELLS[0];
  const angle = fullCircleBellCurve({ phase: p, direction, balanceHold: bell.balanceHold, strikePhase: bell.strikePhase });
  const lag = p <= bell.strikePhase
    ? Math.sin(Math.PI * p / Math.max(.001, bell.strikePhase)) * .18
    : -Math.sin(Math.PI * (p - bell.strikePhase) / Math.max(.001, 1 - bell.strikePhase)) * .10;
  return { angle, clapperAngle: angle - direction * lag, sliderOffset: .42 * Math.sin(angle) };
}

// ── ST BRENDAN'S RING, AS THE CHAPEL HANGS IT ───────────────────────────────
//
// bell-tower-layout.js about the ring's own centre, in metres: two four-bell
// pits, each bell's gudgeon pivot, frame yaw and visual scale. The passage takes
// its bells from here and nowhere else — inventing a second set of bells out
// here breaks the one thing the walk is for, which is arriving at this ring.
export const SOURCE_RING = Object.freeze(createBellFrameLayout(ELLERY_BELLS, {
  centerX: 0, centerZ: 0, chamberFloorY: 0, ringingFloorY: 0,
}).map((bell) => Object.freeze(bell)));

// One stroke of the ring: eight places at the tower's place interval.
const RING_STROKE_SECONDS = ELLERY_BELLS.length * PLACE_MS / 1000;

export const SOURCE_BELL_SIZE = Object.freeze({
  MINIATURE: 'miniature', REGULAR: 'regular', ARCHITECTURAL: 'architectural',
});
const { MINIATURE, REGULAR, ARCHITECTURAL } = SOURCE_BELL_SIZE;

// A BELL LIFTED OUT OF THE RING. `ring` is which of the eight, and the entry
// draws that bell's whole assembly — bell, wheel, clapper, stay, slider. Only
// the size and the place belong to the passage. `elevation` is the gudgeon
// height: at 1.02 x scale the mouth of a rung-down bell rests on the ground.
const ringBell = (id, ring, x, y, size, scale, extra = {}) => Object.freeze({
  id, mesh: `tower_bell_0${ring}`, ring, assembly: true, size,
  x, y, scale, yaw: 0, elevation: 1.02 * scale, ...extra,
});
const trueScale = (ring) => SOURCE_RING[ring - 1].visualScale;

export const SOURCE_BELL_PASSAGE = Object.freeze([
  // ── act one: architecture ────────────────────────────────────────────────
  // Ring bells the size of buildings, rung down and half sunk. They do not move.
  ringBell('bells-arch-west', 4, -44, preTapeY(-1000), ARCHITECTURAL, 26, { yaw: 0.22, sink: 9.5, blocks: false, contact: true }),
  ringBell('bells-arch-east', 1, 44, preTapeY(-1018), ARCHITECTURAL, 22, { yaw: -0.34, sink: 7.0, blocks: false, contact: true }),
  ringBell('bells-arch-far', 6, -42, preTapeY(-1066), ARCHITECTURAL, 28, { yaw: 0.08, sink: 13.0, blocks: false, contact: true, sounds: true }),
  ringBell('bells-arch-lean', 1, -44, preTapeY(-1122), ARCHITECTURAL, 18, { yaw: 1.1, roll: 0.42, sink: 3.2, blocks: false, contact: true }),

  // Grounded bells interrupt a straight run but leave generous routes around
  // either side: the larger ones architectural, the rest at the ring's own size.
  // Every fourth has a clapper that can speak; the rest throw without ringing.
  ...[
    [-4, 38, 3.0], [15, 61, 5.2], [11, 82, 2.0], [5, 105, 6.4],
    [23, 124, 3.4], [-12, 174, 4.6], [13, 195, 2.6], [-3, 216, 7.0],
    [25, 240, 4.0], [-17, 258, 2.4], [6, 312, 5.5], [-13, 334, 3.0],
    [17, 352, 4.4], [-5, 374, 2.2], [20, 395, 3.2],
  ].map(([x, depth, large], index) => {
    // The large ones keep the castings this field was laid out around; the
    // regular ones walk through all eight.
    const architectural = large >= 4.4, ring = architectural ? index % 6 + 1 : index % 8 + 1;
    return ringBell(`bells-field-${index + 1}`, ring, x, SOURCE_BELLS.from - depth,
      architectural ? ARCHITECTURAL : REGULAR, architectural ? large : trueScale(ring),
      { yaw: index * 0.61, blocks: false, contact: true, sounds: index % 4 === 2 });
  }),

  // ── act two: the place where time is null ────────────────────────────────
  // One you walk under: the tenor at the size of a house, its mouth clearing a
  // standing body by more than a metre.
  ringBell('bells-null-canopy', 8, 2, preTapeY(-1156), ARCHITECTURAL, 30, { yaw: 0.15, elevation: 1.02 * 30 + 3.3, blocks: false }),
  // Miniatures of the ring, scattered where you have to walk over them, ringing
  // full circle on the chapel's stroke and much too fast for their size.
  ...[
    [-6.4, preTapeY(-1198), 0.34], [-2.1, preTapeY(-1202), 0.28], [1.8, preTapeY(-1200), 0.41], [4.6, preTapeY(-1206), 0.31],
    [-4.9, preTapeY(-1210), 0.36], [0.7, preTapeY(-1214), 0.26], [3.2, preTapeY(-1218), 0.44], [-2.8, preTapeY(-1222), 0.30],
    [6.1, preTapeY(-1212), 0.35], [-7.7, preTapeY(-1216), 0.24],
  ].map(([x, y, fraction], index) => {
    const ring = index % 8 + 1;
    return ringBell(`bells-null-miniature-${index + 1}`, ring, x, y, MINIATURE, trueScale(ring) * fraction / 0.8, {
      yaw: index * 0.9, blocks: false,
      swing: { kind: 'full-circle', period: RING_STROKE_SECONDS * (0.18 + (index % 3) * 0.05), phase: index * 1.3 },
    });
  }),
  // And one sunk to its shoulder.
  ringBell('bells-null-sunk', 2, -44, preTapeY(-1228), ARCHITECTURAL, 20, { yaw: 0.9, sink: 18.4, blocks: false, contact: true }),

  // ── act three: resolution ────────────────────────────────────────────────
  // All eight, in order, at the chapel's own size, ringing rounds on the tower's
  // stroke. The last hundred and forty metres is the passage remembering what a
  // ring is.
  ...SOURCE_RING.map((bell, index) => ringBell(
    `bells-ring-${bell.id}`, bell.id,
    (index - 3.5) * 3.4, preTapeY(-1264 - index * 17.5), REGULAR, bell.visualScale,
    {
      yaw: index * 0.14 - 0.35, elevation: 3.6, blocks: false,
      // Rounds: each bell a place behind the one before it.
      swing: { kind: 'full-circle', period: RING_STROKE_SECONDS, phase: index * Math.PI * 2 / ELLERY_BELLS.length },
    },
  )),
]);

// ── THE ROOM AT THE END ─────────────────────────────────────────────────────
//
// There is no replica of the belfry standing in the field any more. The road
// ends at St Brendan's own tower door in a hedge, and once it is unlocked the
// door shows the belfry itself — the building's real render, taken ahead of
// time (main.js captureBrendanTowerView) — and walking through it is walking in.
// Past the threshold is the belfry.
export function inSourceBellsRoom(x, y) {
  const room = SOURCE_BELLS.room;
  return Math.abs(Number(x) || 0) <= room.halfX && (Number(y) || 0) <= room.threshold;
}

export const SOURCE_TIER_BY_ID = Object.freeze(
  Object.fromEntries(SOURCE_TIERS.map((t) => [t.id, t])),
);

// Field lifts sit ON the critical spine, so the way up is never a hunt. The first is
// deliberately unmissable: it is the tutorial, and the tutorial is on the
// critical path where nobody can skip it.
// NO LIFTS. The field is climbed.
//
// There were five: three on the spine and two out at the spokes, each a vertical
// capture volume that rendered as a flat catwalk plate at floor level. A plate
// on the ground reads as ground, so the way UP was invisible while the chute
// beside it — one-way DOWN — was the only object that looked like a route. The
// player's report was "I cannot climb this, it is the only thing in front of
// me", and they were right about the object they were looking at.
//
// Every boundary a lift served is served by a staircase at the same tier pair
// (SOURCE_CHUTES above, all `ascendable`), so nothing is stranded. The export
// stays as an empty list because a good deal of runtime and save-schema code
// reads it; `firstLiftCompleted` also survives as narrative state and is now
// raised by reaching the fork tier rather than by riding anything.
export const SOURCE_LIFTS = Object.freeze([]);

// Data consumers from schema-3 saves may still name these connectors ladders.
// Keep the export as a read-only alias; all new runtime semantics use lifts.
export const SOURCE_LADDERS = SOURCE_LIFTS;

// Chutes run DOWN and only down. Each spoke has one back to the spine, and each
// tier has one beside its ladder — so the fast way back is always visible from
// the slow way up, and a fall is never a dead loss.
// THE FIELD IS CLIMBED, NOT RIDDEN.
//
// These were one-way slides with lifts standing beside them as the only way up.
// The lifts were vertical volumes that rendered as a flat plate and read as
// floor, so the only thing in the field that LOOKED like a route was the thing
// you were forbidden to take — and the arrival dead-ended on it. Every chute is
// a staircase now and the lifts are gone (SOURCE_LIFTS, below).
//
// Every run already spans its tier gap well inside the 0.45m step limit the
// rest of Source walks by — 0.24m to 0.39m per cell, measured — so the geometry
// has always supported the climb in both directions. `ascendable` lifts the
// one-way rule; nothing about the shape of the field changes.
export const SOURCE_CHUTES = Object.freeze([
  // ON THE SPINE, WHERE THE LIFTS WERE.
  //
  // These sat at x=12 while the lifts held the centre line at x=0, because a
  // chute was a shortcut down and the lift was the route up. With the lifts gone
  // the staircase IS the route, so it stands on the route: walking straight down
  // the middle of the field now meets a stair at every tier boundary instead of
  // a four-metre cliff with the only way up six metres off to one side.
  Object.freeze({ id: 'chute-fork', x: 0, y: shiftedApproachY(-160), from: 'fork', to: 'arrival', halfWidth: 3.5, run: 16, dir: { x: 0, y: 1 }, ascendable: true }),
  Object.freeze({ id: 'chute-trace', x: 0, y: shiftedApproachY(-240), from: 'trace', to: 'fork', halfWidth: 3.5, run: 16, dir: { x: 0, y: 1 }, ascendable: true }),
  Object.freeze({ id: 'chute-return', x: 0, y: shiftedApproachY(-340), from: 'return', to: 'trace', halfWidth: 3.5, run: 16, dir: { x: 0, y: 1 }, ascendable: true }),
  // The spoke returns, beside each trace so a detour ends where it started.
  Object.freeze({ id: 'chute-student', x: -78, y: shiftedApproachY(-238), from: 'trace', to: 'fork', halfWidth: 3.5, run: 20, dir: { x: 0, y: 1 }, ascendable: true }),
  Object.freeze({ id: 'chute-work-order', x: 78, y: shiftedApproachY(-238), from: 'trace', to: 'fork', halfWidth: 3.5, run: 20, dir: { x: 0, y: 1 }, ascendable: true }),
]);

// Which landmark stands on which tier. Elevation paces the authored field, but
// no carried tool or landmark interaction gates its connectors or final page.
export const SOURCE_LANDMARK_TIER = Object.freeze({
  'fork-room': 'fork',
  'surfer-origin': 'fork',
  'work-order-loop': 'fork',
  'recordist-loop': 'trace',
  'body-room': 'return',
  'final-page': 'return',
});

const near = (v, c, half) => Math.abs(v - c) <= half;

export function sourceTierAt(y) {
  const ly = Number(y) || 0;
  for (const tier of SOURCE_TIERS) if (ly <= tier.from && ly > tier.to) return tier;
  return ly > SOURCE_TIERS[0].from ? SOURCE_TIERS[0] : SOURCE_TIERS[SOURCE_TIERS.length - 1];
}

export function sourceTierHeightAt(y) {
  return sourceTierAt(y).height;
}

// A lift occupies a small footprint straddling the tier boundary; a chute is a
// run leading away from one. Both are looked up by position, so the runtime does
// not have to know the level's shape — only that features exist.
export function sourceFeatureAt(x, y) {
  const lx = Number(x) || 0, ly = Number(y) || 0;
  for (const l of SOURCE_LIFTS) {
    if (near(lx, l.x, l.halfWidth) && near(ly, l.y, l.depth)) {
      return { kind: 'lift', id: l.id, legacyId: l.legacyId, from: l.from, to: l.to };
    }
  }
  for (const c of SOURCE_CHUTES) {
    // The run extends from the mouth along dir, into the tier below.
    const alongX = c.dir.x !== 0;
    const along = alongX ? (lx - c.x) * Math.sign(c.dir.x) : (ly - c.y) * Math.sign(c.dir.y);
    const across = alongX ? Math.abs(ly - c.y) : Math.abs(lx - c.x);
    if (along >= -1 && along <= c.run && across <= c.halfWidth) {
      return { kind: 'chute', id: c.id, from: c.from, to: c.to, dir: c.dir, progress: along / c.run };
    }
  }
  return null;
}

// THE ONE RULE THE RUNTIME ASKS FOR.
//
// Source space has its own six-line canStep with the same 0.45m limit as the
// building. Ladders and chutes are the authored exceptions to that single line
// and nothing else in the engine changes.
//
//   a field lift carries upward only;
//   a chute is passable DOWNWARD only, because that is what makes it a chute
//   and not a ramp.
export function sourceTraversal(fromX, fromY, toX, toY, fromFloor, toFloor) {
  const a = sourceFeatureAt(fromX, fromY);
  const b = sourceFeatureAt(toX, toY);
  // Test the whole attempted segment, not only its two samples. Keyboard steps
  // are short, but controller cadence and diagonal degradation can cross a thin
  // edge without either endpoint landing squarely inside it.
  const segmentHitsLift = (lift) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(Number(toX) - Number(fromX), Number(toY) - Number(fromY)) * 2));
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const x = Number(fromX) + (Number(toX) - Number(fromX)) * t;
      const y = Number(fromY) + (Number(toY) - Number(fromY)) * t;
      if (near(x, lift.x, lift.halfWidth) && near(y, lift.y, lift.depth)) return true;
    }
    return false;
  };
  const lift = SOURCE_LIFTS.find(segmentHitsLift) || null;
  if (lift) {
    const upper = SOURCE_TIER_BY_ID[lift.to]?.height ?? Number(toFloor);
    const movingIntoField = Number(toY) < Number(fromY) - 0.001;
    const standingBelow = Number(fromY) > lift.y && Number(fromFloor) < upper - 0.45;
    if (movingIntoField && standingBelow) return {
      ok: true,
      via: 'lift',
      id: lift.id,
      travel: 'up',
      fromTier: lift.from,
      toTier: lift.to,
    };
  }
  const chute = a?.kind === 'chute' ? a : b?.kind === 'chute' ? b : null;
  const chuteDirection = chute ? (Number(toX) - Number(fromX)) * chute.dir.x
    + (Number(toY) - Number(fromY)) * chute.dir.y : 0;
  const chuteDefinition = chute ? sourceChuteById(chute.id) : null;
  const chuteBottom = chuteDefinition ? SOURCE_TIER_BY_ID[chuteDefinition.to]?.height ?? Number(toFloor) : Number(toFloor);
  // An ascendable run is walked, not ridden, in BOTH directions: committing the
  // body to a slide the moment it steps on a staircase is the same dead end
  // wearing the opposite costume.
  if (chuteDefinition?.ascendable) return { ok: false };
  if (chute && chuteDirection > 0.001
      && Number(toFloor) < Number(fromFloor) - 0.001
      && Number(fromFloor) > chuteBottom + 0.45) {
    return { ok: true, via: 'chute', id: chute.id, dir: chute.dir };
  }
  return { ok: false };
}

export function sourceLiftById(id) {
  return SOURCE_LIFTS.find((lift) => lift.id === id || lift.legacyId === id) || null;
}

export function sourceChuteById(id) {
  return SOURCE_CHUTES.find((chute) => chute.id === id) || null;
}
