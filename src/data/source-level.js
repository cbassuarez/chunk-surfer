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
//   LADDER  the only way UP. Slow and committing, which is exactly where the
//           pressure bites: climbing is the one thing you cannot hurry.
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
  Object.freeze({ id: 'arrival',  from: 16,   to: -40,  height: 0.0 }),
  Object.freeze({ id: 'fork',     from: -40,  to: -120, height: 4.2 }),
  Object.freeze({ id: 'trace',    from: -120, to: -220, height: 9.0 }),
  Object.freeze({ id: 'return',   from: -220, to: -400, height: 15.2 }),
]);

export const SOURCE_TIER_BY_ID = Object.freeze(
  Object.fromEntries(SOURCE_TIERS.map((t) => [t.id, t])),
);

// Ladders sit ON the critical spine, so the way up is never a hunt. The first is
// deliberately unmissable: it is the tutorial, and the tutorial is on the
// critical path where nobody can skip it.
export const SOURCE_LADDERS = Object.freeze([
  Object.freeze({ id: 'ladder-fork', x: 0, y: -40, from: 'arrival', to: 'fork', halfWidth: 3.5, depth: 4 }),
  Object.freeze({ id: 'ladder-trace', x: 0, y: -120, from: 'fork', to: 'trace', halfWidth: 3.5, depth: 4 }),
  Object.freeze({ id: 'ladder-return', x: 0, y: -220, from: 'trace', to: 'return', halfWidth: 3.5, depth: 4 }),
  // A second way up onto the trace tier, out at the far side of each spoke, so
  // a player who took a detour is not walked back to the spine to climb.
  Object.freeze({ id: 'ladder-student', x: -62, y: -120, from: 'fork', to: 'trace', halfWidth: 3, depth: 3.5 }),
  Object.freeze({ id: 'ladder-work-order', x: 62, y: -120, from: 'fork', to: 'trace', halfWidth: 3, depth: 3.5 }),
]);

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
  for (const l of SOURCE_LADDERS) {
    if (near(lx, l.x, l.halfWidth) && near(ly, l.y, l.depth)) {
      return { kind: 'ladder', id: l.id, from: l.from, to: l.to };
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
//   a ladder is climbable in both directions, because a ladder is;
//   a chute is passable DOWNWARD only, because that is what makes it a chute
//   and not a ramp.
export function sourceTraversal(fromX, fromY, toX, toY, fromFloor, toFloor) {
  const a = sourceFeatureAt(fromX, fromY);
  const b = sourceFeatureAt(toX, toY);
  if (a?.kind === 'ladder' && b?.kind === 'ladder' && a.id === b.id) return { ok: true, via: 'ladder', id: a.id };
  if (b?.kind === 'ladder' && Number(toFloor) >= Number(fromFloor)) return { ok: true, via: 'ladder', id: b.id };
  if (a?.kind === 'ladder' && Number(toFloor) <= Number(fromFloor)) return { ok: true, via: 'ladder', id: a.id };
  const chute = a?.kind === 'chute' ? a : b?.kind === 'chute' ? b : null;
  if (chute && Number(toFloor) <= Number(fromFloor)) return { ok: true, via: 'chute', id: chute.id, dir: chute.dir };
  return { ok: false };
}
