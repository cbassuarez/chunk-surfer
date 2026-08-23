import assert from 'node:assert/strict';

import {
  SOURCE_CHUTES, SOURCE_FIELD_TIERS, SOURCE_HORIZON, SOURCE_LADDERS, SOURCE_LIFTS,
  SOURCE_TIERS, SOURCE_LANDMARK_TIER,
  sourceFeatureAt, sourceHorizonDepth, sourceHorizonSeconds, sourceHorizonSlice,
  sourceTierAt, sourceTierHeightAt, sourceTraversal,
} from '../src/data/source-level.js';
import { HORIZON_EXIT } from '../src/game/chunk-surf-state.js';
import { sourceLandscapeFloorAt } from '../src/game/source-space-runtime.js';

// AN AUTHORED LEVEL THAT CANNOT BE FINISHED IS THE ONLY FATAL BUG HERE, and it
// is machine-checkable. Everything below is either "the grammar behaves" or
// "the level is solvable and the gates gate".

// ── the grammar ─────────────────────────────────────────────────────────────
{
  // FIELD tiers are actually separated. If a boundary is under a step then the
  // level is a lawn again and none of the gating means anything. The horizon is
  // excluded by construction, not by name: it lies past the perimeter and is
  // deliberately level with the tier it adjoins, because walking out onto the
  // tape is neither a climb nor a fall.
  for (let i = 1; i < SOURCE_FIELD_TIERS.length; i += 1) {
    const rise = SOURCE_FIELD_TIERS[i].height - SOURCE_FIELD_TIERS[i - 1].height;
    assert.ok(rise > 0.45 * 3, `${SOURCE_FIELD_TIERS[i].id} is only ${rise}m above the tier below — walkable`);
  }
  assert.ok(SOURCE_FIELD_TIERS.length === SOURCE_TIERS.length - 1, 'the horizon is the only non-field tier');
  assert.equal(sourceTierAt(0).id, 'arrival');
  assert.equal(sourceTierAt(-100).id, 'fork');
  assert.equal(sourceTierAt(-300).id, 'return');
  assert.equal(sourceTierAt(-500).id, 'horizon');
  assert.ok(sourceTierHeightAt(-300) > sourceTierHeightAt(0), 'the field does not rise into the page');
  // Stepping over the perimeter must not be a drop, or arriving on the tape
  // reads as falling out of the level rather than walking out of it.
  assert.equal(sourceTierHeightAt(-500), sourceTierHeightAt(-300), 'the seam is a step, not a cliff');
}

{
  // DEPTH IS TIME. The whole horizon contract is that position is the playhead,
  // so these three have to agree at both ends and never run off the tape.
  assert.equal(sourceHorizonDepth(SOURCE_HORIZON.from), 0);
  assert.equal(sourceHorizonDepth(SOURCE_HORIZON.to), SOURCE_HORIZON.length);
  assert.equal(sourceHorizonDepth(0), 0, 'standing short of the seam is the head of the tape, not negative time');
  assert.equal(sourceHorizonDepth(-9999), SOURCE_HORIZON.length, 'the tape does not run past its own end');
  assert.equal(sourceHorizonSeconds(SOURCE_HORIZON.from), 0);
  assert.ok(Math.abs(sourceHorizonSeconds(SOURCE_HORIZON.to) - SOURCE_HORIZON.tapeSeconds) < 1e-6);
  assert.equal(SOURCE_HORIZON.length / SOURCE_HORIZON.sliceMetres, SOURCE_HORIZON.slices,
    'the baked slice count has to match the metres it is spread over');
  assert.equal(sourceHorizonSlice(SOURCE_HORIZON.from).index, 0);
  assert.equal(sourceHorizonSlice(SOURCE_HORIZON.to).index, SOURCE_HORIZON.slices - 1);
  // Monotone, so walking forward never rewinds the picture or the score.
  let previous = -1;
  for (let y = SOURCE_HORIZON.from; y >= SOURCE_HORIZON.to; y -= 3) {
    const slice = sourceHorizonSlice(y).index;
    assert.ok(slice >= previous, `slice went backwards walking forward at ${y}`);
    previous = slice;
  }
}

{
  // The mounds must never accidentally bridge a tier: sample the open field and
  // assert no neighbouring pair is a walkable ramp across a boundary.
  let bridged = 0;
  for (let y = -10; y > -330; y -= 1) {
    for (const x of [-120, -40, 0, 40, 120]) {
      if (sourceFeatureAt(x, y) || sourceFeatureAt(x, y - 1)) continue;
      const a = sourceLandscapeFloorAt(x, y), b = sourceLandscapeFloorAt(x, y - 1);
      const sameTier = sourceTierAt(y).id === sourceTierAt(y - 1).id;
      if (!sameTier && Math.abs(b - a) <= 0.45) bridged += 1;
      if (sameTier && Math.abs(b - a) > 0.45) bridged += 1;   // a mound became a cliff
    }
  }
  assert.equal(bridged, 0, 'the terrain noise is bridging tiers or cutting them');
}

{
  // A field lift goes both ways. A chute goes one.
  assert.equal(SOURCE_LADDERS, SOURCE_LIFTS, 'legacy saves retain the old connector export');
  for (const l of SOURCE_LIFTS) {
    assert.equal(sourceFeatureAt(l.x,l.y).kind,'lift');
    for (const offset of [-l.halfWidth + .5, 0, l.halfWidth - .5]) {
      const x=l.x+offset;
      const up=sourceTraversal(x,l.y+l.depth+1,x,l.y+l.depth,4.23,4.2);
      assert.deepEqual(
        {via:up.via,travel:up.travel,fromTier:up.fromTier,toTier:up.toTier},
        {via:'lift',travel:'up',fromTier:l.from,toTier:l.to},
        `${l.id} cannot rise when the noisy approach is slightly above its lower deck`,
      );
      const down=sourceTraversal(x,l.y-l.depth-1,x,l.y-l.depth,8.97,9.0);
      assert.deepEqual(
        {via:down.via,travel:down.travel,fromTier:down.fromTier,toTier:down.toTier},
        {via:'lift',travel:'down',fromTier:l.to,toTier:l.from},
        `${l.id} cannot descend when the noisy approach is slightly below its upper deck`,
      );
    }
  }

  const c = SOURCE_CHUTES[0];
  const down = sourceTraversal(c.x, c.y, c.x, c.y + 4, 4.2, 0);
  const up = sourceTraversal(c.x, c.y + 4, c.x, c.y, 0, 4.2);
  assert.ok(down.ok && down.via === 'chute', 'a chute cannot be ridden down');
  assert.equal(up.ok, false, 'a chute can be climbed back up, so it is a ramp');

  // And neither leaks into open field.
  assert.equal(sourceTraversal(-150, -100, -150, -101, 0, 8).ok, false,
    'open field is passing a cliff without a feature');
  assert.equal(sourceFeatureAt(-150, -100), null);
}

// ── the level is solvable, and the gates gate ───────────────────────────────
//
// A flood fill over the landscape using ONLY legal steps, the same shape of
// route proof test/tower-on-foot-route.spec.mjs runs for the conservatory.
function reachable(start, { withFork = true } = {}) {
  const STEP = 1;
  const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const seen = new Set([key(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y }];
  const legal = (ax, ay, bx, by) => {
    if (Math.abs(bx) > 170 || by > 14 || by < -338) return false;
    const a = sourceLandscapeFloorAt(ax, ay), b = sourceLandscapeFloorAt(bx, by);
    if (Math.abs(b - a) <= 0.45) return true;
    const via = sourceTraversal(ax, ay, bx, by, a, b);
    if (!via.ok) return false;
    // The fork gates everything above the fork tier: without it, the ladders out
    // of the fork tier do not answer. This is the capability gate, not a wall.
    if (!withFork && via.via === 'lift' && b > a && sourceTierAt(by).id !== 'fork') return false;
    return true;
  };
  while (queue.length) {
    const at = queue.pop();
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = at.x + dx, ny = at.y + dy;
      if (seen.has(key(nx, ny))) continue;
      if (!legal(at.x, at.y, nx, ny)) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return (point) => {
    for (let ox = -3; ox <= 3; ox += 1) for (let oy = -3; oy <= 3; oy += 1) {
      if (seen.has(key(point.x + ox, point.y + oy))) return true;
    }
    return false;
  };
}

{
  const from = { x: 0, y: 0 };
  const can = reachable(from);
  const LANDMARKS = {
    'fork-room': { x: 0, y: -42 },
    'surfer-origin': { x: -92, y: -104 },
    'work-order-loop': { x: 92, y: -104 },
    'recordist-loop': { x: 0, y: -142 },
    'body-room': { x: 0, y: -232 },
    'final-page': { x: 80, y: -312 },
  };
  for (const [id, point] of Object.entries(LANDMARKS)) {
    assert.ok(can(point), `${id} is unreachable from the arrival point — the level cannot be finished`);
  }

  // Every landmark is on the tier the level says it is, or the gating is a lie.
  for (const [id, point] of Object.entries(LANDMARKS)) {
    assert.equal(sourceTierAt(point.y).id, SOURCE_LANDMARK_TIER[id],
      `${id} is not standing on the tier the level assigns it`);
  }
}

// NO SOFT LOCK. From every tier there is a way back down to the spine, so no
// route can strand a player above the level.
{
  for (const tier of SOURCE_FIELD_TIERS.slice(1)) {
    const out = SOURCE_CHUTES.some((c) => c.from === tier.id)
      || SOURCE_LIFTS.some((l) => l.to === tier.id);
    assert.ok(out, `${tier.id} has no way off it`);
  }
  // And the spokes return: both optional traces have a chute back to the spine.
  for (const id of ['chute-student', 'chute-work-order']) {
    assert.ok(SOURCE_CHUTES.some((c) => c.id === id), `${id} is missing — an optional trace is a dead end`);
  }

  // The horizon gets off itself differently, and the invariant still has to
  // hold. It has no chute and no lift by design — altitude is not the currency
  // out there — so the thing that must be true instead is that it has declared
  // exits, and that the DEFAULT one is reachable by doing nothing but walking
  // the direction the tape already runs. Everything else out there is optional;
  // this is the one that cannot be missed.
  assert.ok(Object.values(HORIZON_EXIT).length >= 2, 'the horizon has fewer than two ways off it');
  assert.ok(Object.values(HORIZON_EXIT).includes('chapel'), 'the horizon has lost its default exit');
  const horizon = SOURCE_TIERS.find((t) => t.id === 'horizon');
  assert.ok(horizon.from - horizon.to === SOURCE_HORIZON.length,
    'the tier and the tape disagree about how long the walk is');
  assert.equal(sourceTierAt(horizon.to + 1).id, 'horizon',
    'the far end of the tape is not on the tape — the chapel exit would be unreachable');
}

console.log('source level specs passed');
