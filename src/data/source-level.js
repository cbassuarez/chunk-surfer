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
  Object.freeze({ id: 'arrival',  from: 16,   to: -40,  height: 0.0, field: true }),
  Object.freeze({ id: 'fork',     from: -40,  to: -120, height: 4.2, field: true }),
  Object.freeze({ id: 'trace',    from: -120, to: -220, height: 9.0, field: true }),
  // The field's own perimeter is at -340 and the return tier ends there, because
  // that is where the ground has always actually stopped.
  Object.freeze({ id: 'return',   from: -220, to: -340, height: 15.2, field: true }),
  // THE HORIZON. Same height as the return tier on purpose: there is no cliff
  // and no lift between them, because arriving here is not a climb and not a
  // fall. You walk out through the perimeter — the one wall the field has — and
  // the ground simply keeps going, and some way out there it stops being ground.
  Object.freeze({ id: 'horizon',  from: -340, to: -852, height: 15.2, field: false }),
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
export const SOURCE_HORIZON = Object.freeze({
  from: -340,
  to: -852,
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

export const SOURCE_TIER_BY_ID = Object.freeze(
  Object.fromEntries(SOURCE_TIERS.map((t) => [t.id, t])),
);

// Field lifts sit ON the critical spine, so the way up is never a hunt. The first is
// deliberately unmissable: it is the tutorial, and the tutorial is on the
// critical path where nobody can skip it.
export const SOURCE_LIFTS = Object.freeze([
  Object.freeze({ id: 'lift-fork', legacyId: 'ladder-fork', x: 0, y: -40, from: 'arrival', to: 'fork', halfWidth: 3.5, depth: 4 }),
  Object.freeze({ id: 'lift-trace', legacyId: 'ladder-trace', x: 0, y: -120, from: 'fork', to: 'trace', halfWidth: 3.5, depth: 4 }),
  Object.freeze({ id: 'lift-return', legacyId: 'ladder-return', x: 0, y: -220, from: 'trace', to: 'return', halfWidth: 3.5, depth: 4 }),
  // A second way up onto the trace tier, out at the far side of each spoke, so
  // a player who took a detour is not walked back to the spine to climb.
  Object.freeze({ id: 'lift-student', legacyId: 'ladder-student', x: -62, y: -120, from: 'fork', to: 'trace', halfWidth: 3, depth: 3.5 }),
  Object.freeze({ id: 'lift-work-order', legacyId: 'ladder-work-order', x: 62, y: -120, from: 'fork', to: 'trace', halfWidth: 3, depth: 3.5 }),
]);

// Data consumers from schema-3 saves may still name these connectors ladders.
// Keep the export as a read-only alias; all new runtime semantics use lifts.
export const SOURCE_LADDERS = SOURCE_LIFTS;

// Chutes run DOWN and only down. Each spoke has one back to the spine, and each
// tier has one beside its ladder — so the fast way back is always visible from
// the slow way up, and a fall is never a dead loss.
export const SOURCE_CHUTES = Object.freeze([
  Object.freeze({ id: 'chute-fork', x: 12, y: -40, from: 'fork', to: 'arrival', halfWidth: 3, run: 16, dir: { x: 0, y: 1 } }),
  Object.freeze({ id: 'chute-trace', x: 12, y: -120, from: 'trace', to: 'fork', halfWidth: 3, run: 16, dir: { x: 0, y: 1 } }),
  Object.freeze({ id: 'chute-return', x: 12, y: -220, from: 'return', to: 'trace', halfWidth: 3, run: 16, dir: { x: 0, y: 1 } }),
  // The spoke returns, dropping onto the fork tier beside each trace so a detour
  // ends by falling forward rather than by walking back.
  Object.freeze({ id: 'chute-student', x: -78, y: -118, from: 'trace', to: 'fork', halfWidth: 3.5, run: 20, dir: { x: 0, y: 1 } }),
  Object.freeze({ id: 'chute-work-order', x: 78, y: -118, from: 'trace', to: 'fork', halfWidth: 3.5, run: 20, dir: { x: 0, y: 1 } }),
]);

// Which landmark stands on which tier. The narrative's required/optional split
// (CHUNK_SURF_ROOMS) becomes elevation: the fork gates everything above it, and
// body-room is the last thing before the page.
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

// A ladder occupies a small footprint straddling the tier boundary; a chute is a
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
//   a field lift carries in both directions;
//   a chute is passable DOWNWARD only, because that is what makes it a chute
//   and not a ramp.
export function sourceTraversal(fromX, fromY, toX, toY, fromFloor, toFloor) {
  const a = sourceFeatureAt(fromX, fromY);
  const b = sourceFeatureAt(toX, toY);
  // A lift answers from its authored lower/upper side, not from the sampled
  // terrain immediately outside it. Those samples carry a few centimetres of
  // mound noise, which could make the first step into a perfectly flat lift look
  // microscopically downhill and suppress the committed rise.
  const liftFeature = b?.kind === 'lift' ? b : a?.kind === 'lift' ? a : null;
  if (liftFeature) {
    const lift = sourceLiftById(liftFeature.id);
    if (lift) {
      const travel = Number(fromY) > lift.y ? 'up' : 'down';
      return {
        ok: true,
        via: 'lift',
        id: lift.id,
        travel,
        fromTier: travel === 'up' ? lift.from : lift.to,
        toTier: travel === 'up' ? lift.to : lift.from,
      };
    }
  }
  const chute = a?.kind === 'chute' ? a : b?.kind === 'chute' ? b : null;
  const chuteDirection = chute ? (Number(toX) - Number(fromX)) * chute.dir.x
    + (Number(toY) - Number(fromY)) * chute.dir.y : 0;
  if (chute && chuteDirection > 0.001 && Number(toFloor) <= Number(fromFloor)) {
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
