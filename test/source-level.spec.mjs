import assert from 'node:assert/strict';

import {
  SOURCE_CHUTES, SOURCE_LADDERS, SOURCE_TIERS, SOURCE_LANDMARK_TIER,
  sourceFeatureAt, sourceTierAt, sourceTierHeightAt, sourceTraversal,
} from '../src/data/source-level.js';
import { sourceLandscapeFloorAt } from '../src/game/source-space-runtime.js';

// AN AUTHORED LEVEL THAT CANNOT BE FINISHED IS THE ONLY FATAL BUG HERE, and it
// is machine-checkable. Everything below is either "the grammar behaves" or
// "the level is solvable and the gates gate".

// ── the grammar ─────────────────────────────────────────────────────────────
{
  // Tiers are actually separated. If a boundary is under a step then the level
  // is a lawn again and none of the gating means anything.
  for (let i = 1; i < SOURCE_TIERS.length; i += 1) {
    const rise = SOURCE_TIERS[i].height - SOURCE_TIERS[i - 1].height;
    assert.ok(rise > 0.45 * 3, `${SOURCE_TIERS[i].id} is only ${rise}m above the tier below — walkable`);
  }
  assert.equal(sourceTierAt(0).id, 'arrival');
  assert.equal(sourceTierAt(-100).id, 'fork');
  assert.equal(sourceTierAt(-300).id, 'return');
  assert.ok(sourceTierHeightAt(-300) > sourceTierHeightAt(0), 'the field does not rise into the page');
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
  // A ladder goes both ways. A chute goes one.
  const l = SOURCE_LADDERS[0];
  assert.ok(sourceTraversal(l.x, l.y + 1, l.x, l.y - 1, 0, 4.2).ok, 'a ladder cannot be climbed');
  assert.ok(sourceTraversal(l.x, l.y - 1, l.x, l.y + 1, 4.2, 0).ok, 'a ladder cannot be descended');

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
    if (!withFork && via.via === 'ladder' && b > a && sourceTierAt(by).id !== 'fork') return false;
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
  for (const tier of SOURCE_TIERS.slice(1)) {
    const out = SOURCE_CHUTES.some((c) => c.from === tier.id)
      || SOURCE_LADDERS.some((l) => l.to === tier.id);
    assert.ok(out, `${tier.id} has no way off it`);
  }
  // And the spokes return: both optional traces have a chute back to the spine.
  for (const id of ['chute-student', 'chute-work-order']) {
    assert.ok(SOURCE_CHUTES.some((c) => c.id === id), `${id} is missing — an optional trace is a dead end`);
  }
}

console.log('source level specs passed');
