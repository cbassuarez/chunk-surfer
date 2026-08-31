import assert from 'node:assert/strict';

import {
  SOURCE_CHUTES, SOURCE_FIELD_TIERS, SOURCE_HORIZON, SOURCE_LADDERS, SOURCE_LIFTS,
  SOURCE_TIERS, SOURCE_LANDMARK_TIER, SOURCE_TIER_BY_ID,
  sourceFeatureAt, sourceHorizonDepth, sourceHorizonSeconds, sourceHorizonSlice,
  sourceTierAt, sourceTierHeightAt, sourceTraversal,
} from '../src/data/source-level.js';
import { HORIZON_EXIT } from '../src/game/chunk-surf-state.js';
import { SOURCE_LANDMARK_OFFSETS, sourceLandscapeFloorAt } from '../src/game/source-space-runtime.js';

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
  // FOUR non-field tiers now, and all of them for the same reason: past the
  // perimeter there is no altitude economy left. The outskirts and the nothing
  // are the walk OUT of the field, the horizon is the recording, and the bell
  // passage is what the tower road is instead of a datamosh cut. None of them
  // may be a climb or a fall from what it adjoins.
  assert.deepEqual(
    SOURCE_TIERS.filter((tier) => !tier.field).map((tier) => tier.id),
    ['outskirts', 'nothing', 'horizon', 'bells'],
    'the field ends at the perimeter and everything past it is walked, not climbed',
  );
  // AND THEY ARE IN THAT ORDER, ADJOINING, WITH NO GAP AND NO STEP. A gap is
  // undrawn ground and a step out here would be a cliff nothing can climb.
  const beyond = SOURCE_TIERS.filter((tier) => !tier.field);
  for (let i = 1; i < beyond.length; i += 1) {
    assert.equal(beyond[i].from, beyond[i - 1].to,
      `${beyond[i].id} does not start where ${beyond[i - 1].id} stops`);
    assert.equal(beyond[i].height, beyond[i - 1].height,
      `${beyond[i].id} stands at a different height from ${beyond[i - 1].id}`);
  }
  assert.equal(beyond[0].from, SOURCE_TIERS.filter((tier) => tier.field).at(-1).to,
    'the walk out does not begin where the field ends');
  // Probe each tier at its own midpoint rather than at hard-coded depths. The
  // approach extension (SOURCE_APPROACH_CELLS) moved every boundary below the
  // arrival by 120 cells, and literals here silently pointed at the wrong tier.
  for (const tier of SOURCE_TIERS) {
    const middle = (tier.from + tier.to) / 2;
    assert.equal(sourceTierAt(middle).id, tier.id, `${tier.id} does not own its own middle`);
  }
  assert.equal(sourceTierAt(0).id, 'arrival', 'the field still begins on the arrival');
  const horizon = SOURCE_TIERS.find((tier) => tier.id === 'horizon');
  const bells = SOURCE_TIERS.find((tier) => tier.id === 'bells');
  assert.equal(sourceTierHeightAt((bells.from + bells.to) / 2), sourceTierHeightAt((horizon.from + horizon.to) / 2),
    'the bells are not a climb off the tape');
  const deepest = SOURCE_TIERS.filter((tier) => tier.field).at(-1);
  assert.ok(sourceTierHeightAt((deepest.from + deepest.to) / 2) > sourceTierHeightAt(0),
    'the field does not rise into the page');
  // Stepping over the perimeter must not be a drop, or arriving on the tape
  // reads as falling out of the level rather than walking out of it.
  // Sampled either side of the perimeter itself rather than at fixed depths.
  assert.equal(sourceTierHeightAt(horizon.from - 1), sourceTierHeightAt(horizon.from + 1),
    'the seam is a step, not a cliff');
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
  // A field lift goes up. A chute goes down. Neither reverses.
  assert.equal(SOURCE_LADDERS, SOURCE_LIFTS, 'legacy saves retain the old connector export');
  for (const l of SOURCE_LIFTS) {
    assert.equal(sourceFeatureAt(l.x,l.y).kind,'lift');
    for (const offset of [-l.halfWidth + .5, 0, l.halfWidth - .5]) {
      const x=l.x+offset;
      const fromY=l.y+l.depth+1,toY=l.y+l.depth;
      const up=sourceTraversal(x,fromY,x,toY,sourceLandscapeFloorAt(x,fromY),sourceLandscapeFloorAt(x,toY));
      assert.deepEqual(
        {via:up.via,travel:up.travel,fromTier:up.fromTier,toTier:up.toTier},
        {via:'lift',travel:'up',fromTier:l.from,toTier:l.to},
        `${l.id} cannot rise when the noisy approach is slightly above its lower deck`,
      );
      const downFromY=l.y-l.depth-1,downToY=l.y-l.depth;
      const down=sourceTraversal(x,downFromY,x,downToY,sourceLandscapeFloorAt(x,downFromY),sourceLandscapeFloorAt(x,downToY));
      assert.equal(down.ok,false,`${l.id} can be ridden downward`);
    }
  }

  // NO LIFTS, AND EVERY CONNECTOR IS A STAIRCASE.
  //
  // The field used to be climbed by five vertical lift volumes that rendered as
  // flat plates at floor level — so the way up read as floor while the one-way
  // chute beside it was the only object that looked like a route. Lifts are
  // gone; every chute is `ascendable` and is walked in both directions.
  assert.equal(SOURCE_LIFTS.length, 0, 'the field has no lifts');
  assert.ok(SOURCE_CHUTES.length > 0 && SOURCE_CHUTES.every((chute) => chute.ascendable),
    'every connector left in the field is a staircase');

  // Nothing is ever ridden now, in either direction, on any of them.
  for (const stair of SOURCE_CHUTES) {
    const top = SOURCE_TIER_BY_ID[stair.from].height;
    const bottom = SOURCE_TIER_BY_ID[stair.to].height;
    assert.equal(sourceTraversal(stair.x, stair.y, stair.x, stair.y + 4, top, bottom).ok, false,
      `${stair.id} is walked, not ridden, downhill`);
    assert.equal(sourceTraversal(stair.x, stair.y + 4, stair.x, stair.y, bottom, top).ok, false,
      `${stair.id} is walked, not ridden, uphill`);

    // And the rise stays inside the ordinary step limit for its whole run,
    // which is the entire reason it is walkable at all.
    let previous = null;
    for (let step = 0; step <= stair.run; step += 1) {
      const ly = stair.y + step;
      const floor = sourceLandscapeFloorAt(stair.x, ly);
      if (previous !== null) {
        assert.ok(Math.abs(floor - previous) <= 0.45,
          `${stair.id} rises ${Math.abs(floor - previous).toFixed(2)}m at ${ly} — past the step limit it is unclimbable`);
      }
      previous = floor;
    }
  }

  // THE SPINE IS WALKABLE END TO END. The lifts held the centre line; if the
  // stairs had stayed off to one side, walking straight down the middle would
  // meet a four-metre cliff with no way over it.
  for (let y = -10; y >= -330; y -= 1) {
    const rise = Math.abs(sourceLandscapeFloorAt(0, y) - sourceLandscapeFloorAt(0, y - 1));
    assert.ok(rise <= 0.45, `the spine has an uncrossable cliff at ${y}: ${rise.toFixed(2)}m`);
  }

  // And neither leaks into open field.
  assert.equal(sourceTraversal(-150, -100, -150, -101, 0, 8).ok, false,
    'open field is passing a cliff without a feature');
  assert.equal(sourceFeatureAt(-150, -100), null);
}

// ── the level is solvable, and the gates gate ───────────────────────────────
//
// A flood fill over the landscape using ONLY legal steps, the same shape of
// route proof test/tower-on-foot-route.spec.mjs runs for the conservatory.
// Two cells inside the field's own perimeter (the return tier's far edge).
const FIELD_FLOOR = SOURCE_TIERS.filter((tier) => tier.field).at(-1).to + 2;

function reachable(start) {
  const STEP = 1;
  const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const seen = new Set([key(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y }];
  const legal = (ax, ay, bx, by) => {
    // The flood's own bounds, derived from the field rather than typed. -338 was
    // the old perimeter; after the approach extension it stopped the search a
    // hundred and twenty cells short of the deepest landmarks and reported them
    // unreachable when they are not.
    if (Math.abs(bx) > 170 || by > 14 || by < FIELD_FLOOR) return false;
    const a = sourceLandscapeFloorAt(ax, ay), b = sourceLandscapeFloorAt(bx, by);
    if (Math.abs(b - a) <= 0.45) return true;
    const via = sourceTraversal(ax, ay, bx, by, a, b);
    if (!via.ok) return false;
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
  // The real table, not a copy of it. This used to be hand-duplicated here and
  // went stale the moment the field was retuned — it kept asserting that
  // landmarks stood on tiers they had been moved off.
  const LANDMARKS = SOURCE_LANDMARK_OFFSETS;
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
    assert.ok(SOURCE_CHUTES.some((c) => c.from === tier.id), `${tier.id} has no downward chute`);
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
