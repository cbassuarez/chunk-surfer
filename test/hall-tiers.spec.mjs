// THE CONCERT HALL HAS FOUR FLOORS AND ONE ZONE.
//
// Orchestra, stage, lower balcony and upper balcony are all ZONE.hall and all
// `amplifications`. That is deliberate — you can record from any of them — but
// it means the room id alone cannot say where a take was rolled, and it means
// anything that reasons about distance in the hall is reasoning about a footprint
// three decks deep.
//
// Everything here is an authored constant that will rot silently if the balconies
// move: an unusable seat spawns nothing, and a take place that stops resolving
// simply reports the stalls.

import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  doors: conservatory.doors || [],
});
for (const door of FP.doorState()) FP.setDoorOpen(door.id, true);

const rt = (x, y) => FP.toRuntimePoint({ x, y });

// Mirrors takePlaceAt in main.js. Keyed on the compiled LAYER rather than on
// height, because heights move whenever the rake is retuned and the layer does
// not.
const HALL_DECK_PLACE = { hall_lower: 'lower', hall_upper: 'upper', hall_stair: 'stair', hall_stage: 'stage' };
function placeAt(ax, ay) {
  const r = rt(ax, ay);
  if (FP.zoneAt(r.x, r.y) !== ZONE.hall) return null;
  return HALL_DECK_PLACE[FP.logicalToPhysical(r.x, r.y)?.layer || ''] || 'orchestra';
}

assert.equal(placeAt(110, 20), 'orchestra', 'the stalls are the orchestra');
assert.equal(placeAt(1, 67), 'lower', 'the lower balcony reports itself');
assert.equal(placeAt(28, 114), 'upper', 'the upper balcony reports itself');
// Outside the hall there is only one floor, so there is nothing to report. A
// place of "orchestra" for the natatorium would be a lie with a room name on it.
assert.equal(placeAt(85, 30), null, 'the natatorium has no place');
assert.equal(placeAt(15, 12), null, 'studio B3 has no place');

// The three decks are one Euclidean footprint. This is what makes a place term
// necessary at all, and it is what defeats distance-ranked spawning.
{
  const stalls = FP.logicalToPhysical(...Object.values(rt(102, 15)));
  const lower = FP.logicalToPhysical(...Object.values(rt(1, 67)));
  const upper = FP.logicalToPhysical(...Object.values(rt(28, 114)));
  for (const deck of [stalls, lower, upper]) assert.equal(deck.renderGroup, 'hall');
  assert.equal(lower.y, 4, 'the lower balcony deck is four metres up');
  assert.equal(upper.y, 7.5, 'the upper balcony deck is seven and a half');
}

// HALL_UPPER_SEATS in main.js. The presence takes the upper tier in the hall
// because sampleSpawn ranks by distance and would otherwise seat it directly
// overhead and call that far away.
{
  const SEATS = [{ x: 4, y: 99 }, { x: 14, y: 114 }, { x: 28, y: 99 }, { x: 28, y: 114 }];
  for (const seat of SEATS) {
    const r = rt(seat.x, seat.y);
    assert.ok(FP.cellAt(r.x, r.y) && !FP.isSolid(r.x, r.y), `upper seat ${seat.x},${seat.y} is standable`);
    assert.equal(FP.logicalToPhysical(r.x, r.y)?.layer, 'hall_upper', `upper seat ${seat.x},${seat.y} is on the upper deck`);
  }
  // At least one seat must be a real distance from the stalls, or the tier is
  // not a vantage — it is a shelf above the player's head.
  const me = FP.logicalToPhysical(...Object.values(rt(110, 20)));
  const far = SEATS.map((seat) => {
    const p = FP.logicalToPhysical(...Object.values(rt(seat.x, seat.y)));
    return Math.hypot(p.x - me.x, p.z - me.z);
  }).sort((a, b) => b - a)[0];
  assert.ok(far >= 20, `the far upper seat is across the room, not overhead (${far.toFixed(1)} half-cells)`);
}

// Both balconies remain reachable by ordinary walking. They always were — the
// defect was that the galleria flights were not DRAWN — but a route that only
// the compiler can find is the same as no route.
{
  const KEYS = new Set(['master', 'chapel']);
  const start = rt(102, 15);
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [[start.x, start.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const move = FP.canStep(x, y, x + dx, y + dy, { keys: KEYS });
      if (!move.ok) continue;
      const to = move.redirect || { x: x + dx, y: y + dy };
      const key = `${to.x},${to.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([to.x, to.y]);
    }
  }
  for (const [name, cell] of [['lower balcony', rt(1, 67)], ['upper balcony', rt(28, 114)]]) {
    assert.ok(seen.has(`${cell.x},${cell.y}`), `${name} is reachable on foot from the stalls`);
  }
}


// ── THE STALLS AND THEIR GANGWAYS ───────────────────────────────────────────
//
// The seating collision used to be a second analytic guess authored in metres in
// game/props.js, and it disagreed with the rake: hallGroundProfile flags a four
// metre centre aisle and the mask opened 1.7m of it. It is derived from F.STAIR
// now, so this asserts the two agree and that each gangway is a route rather
// than a pocket.
{
  const PROPS = await import('../src/game/props.js');
  PROPS.loadPropState({});
  PROPS.propsInit(FP);
  const walkable = (ax, ay) => {
    const r = rt(ax, ay);
    return !FP.isSolid(r.x, r.y) && !!FP.cellAt(r.x, r.y) && PROPS.propCanOccupy(r.x, r.y);
  };

  for (const [name, ax] of [['west', 100.5], ['centre', 112.5], ['east', 124.5]]) {
    for (let ay = 14; ay <= 32; ay += .5) {
      assert.ok(walkable(ax, ay), `the ${name} gangway is clear at y=${ay}`);
    }
  }
  // And the seats are still seats. If the derivation ever inverts, the stalls
  // become an empty floor and every gangway check above still passes.
  // Sampled clear of the transverse cross-over at y 23.15-24.85, which is a
  // gangway and is supposed to be open.
  for (const ay of [16, 18, 20, 22, 26, 28, 30]) {
    for (const ax of [106, 108, 118, 120]) {
      assert.ok(!walkable(ax, ay), `the rows are solid seating at ${ax},${ay}`);
    }
  }
  // The transverse cross-over. hallGroundProfile's aisle test is x-only and
  // cannot flag a gangway running across the bowl, so props.js authors this one
  // and deleting it silently strands the west chandelier's inspection proxy.
  for (const ax of [106, 108, 118, 120]) {
    assert.ok(walkable(ax, 24), `the cross-over is open at ${ax},24`);
  }

  // Both galleria feet stand in a gangway, which is the entire point of them.
  assert.ok(walkable(100.5, 21), 'the west flight is approachable from the stalls');
  assert.ok(walkable(126, 21), 'the east flight is approachable from the upper tier');
}
console.log('hall stalls and gangways ok');


// ── ONE RAMP, HORSESHOE-SHAPED ──────────────────────────────────────────────
//
// The risers ARE the stairs. galleria_lower_stair used to climb -0.74 -> 4.00
// through the same rows the west aisle ramps through, two floors in one volume,
// so the player walked the ramp to their seats and passed through the flight. It
// is gone and nothing replaced it: the bowl rakes up, the rear cross aisle keeps
// rising the last metre and a half, and it arrives at the circle.
{
  const spans = FP.physicalSpanData();
  const at = (x, z) => spans.cells.get(`${x},${z}`) || [];
  const floorAt = (ax, ay) => { const r = rt(ax, ay); return FP.cellAt(r.x, r.y)?.floor; };

  // No flight anywhere in the west gangway.
  const aisle = at(200, 46);
  assert.ok(aisle.some((s) => s.layer === 'ground'), 'the west gangway is present in its own column');
  assert.ok(!aisle.some((s) => s.layer === 'hall_stair'), 'and no flight stands in it');

  // The climb is continuous and every riser is one a body takes without thinking.
  let worst = 0, prev = null;
  for (let ay = 12; ay <= 40; ay += .5) {
    const f = floorAt(113, ay);
    if (f == null) continue;
    if (prev !== null) worst = Math.max(worst, Math.abs(f - prev));
    prev = f;
  }
  assert.ok(worst <= 0.45 + 1e-6, `every riser from stalls to circle is climbable (worst ${worst.toFixed(3)}m)`);
  assert.equal(floorAt(113, 40), 4.0, 'and the rake arrives exactly at the circle deck');

  // Both ways. A ramp you can only climb is a trap.
  const KEYS = new Set(['master', 'chapel']);
  for (let ay = 30; ay < 40; ay += 1) {
    const a = rt(113, ay), b = rt(113, ay + 1);
    assert.ok(FP.canStep(a.x, a.y, b.x, b.y, { keys: KEYS }).ok, `you can walk up past y${ay}`);
    assert.ok(FP.canStep(b.x, b.y, a.x, a.y, { keys: KEYS }).ok, `and back down past y${ay}`);
  }

  // The arms come back over their own ground. Drawing the ramp beneath them too
  // would recreate the original fault one deck higher.
  for (const x of [201, 249]) {
    const under = at(x, 79);
    assert.ok(under.some((s) => s.layer === 'hall_lower'), 'the arm deck is in its column');
    assert.ok(!under.some((s) => s.layer === 'ground'), 'and nothing else is under it at that height');
  }

  // The east flight was never faulty: it crosses its gangway seven metres up.
  const east = at(252, 46);
  const eastGround = east.find((s) => s.layer === 'ground');
  const eastStair = east.find((s) => s.layer === 'hall_stair');
  assert.ok(eastGround && eastStair, 'the east column carries both the gangway and its flight');
  assert.ok(eastStair.floor > eastGround.floor + 5, 'which clears it');
}
console.log('one ramp, horseshoe ok');


// ── THE STAGE IS A PLATFORM ─────────────────────────────────────────────────
//
// It was authored flat at -2.5, the same height as the front of the house, so
// there was no stage — only the part of the room the seats point at, with a
// hall_structure deck drawn at -2.2 that the player walked through.
{
  const floorAt = (ax, ay) => { const r = rt(ax, ay); return FP.cellAt(r.x, r.y)?.floor; };
  assert.equal(placeAt(113, 8), 'stage', 'the platform reports itself as the stage');
  assert.equal(floorAt(113, 8), -1.5, 'and stands a metre above the front stalls');
  assert.equal(floorAt(113, 12), -2.5, 'the house floor in front of it is unchanged');

  // The edge is sheer on purpose: a metre is more than STEP_UP, so you cannot
  // wander onto the platform and cannot step off the front of it either.
  const edge = FP.canStep(...Object.values(rt(113, 12)), ...Object.values(rt(113, 11)), { keys: new Set(['master']) });
  assert.equal(edge.ok, false, 'the stage front is not climbable');

  // Two step bays are the way up, and every riser is one a body takes without
  // thinking. Authored x106-108 and x117-119.
  for (const bay of [107, 118]) {
    const run = [12, 11, 10, 9].map((ay) => floorAt(bay, ay));
    for (let i = 1; i < run.length; i += 1) {
      const riser = Math.abs(run[i] - run[i - 1]);
      assert.ok(riser <= 0.45 + 1e-9, `bay at x${bay} riser ${i} is climbable (${riser.toFixed(2)}m)`);
    }
    assert.equal(run.at(-1), -1.5, `the bay at x${bay} arrives on the platform`);
  }

  // And it is genuinely reachable on foot, props and all.
  const PROPS2 = await import('../src/game/props.js');
  const KEYS = new Set(['master', 'chapel']);
  const start = rt(113, 20);
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [[start.x, start.y]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const move = FP.canStep(x, y, x + dx, y + dy, { keys: KEYS });
      if (!move.ok) continue;
      const to = move.redirect || { x: x + dx, y: y + dy };
      const key = `${to.x},${to.y}`;
      if (seen.has(key) || !PROPS2.propCanOccupy(to.x, to.y)) continue;
      seen.add(key);
      queue.push([to.x, to.y]);
    }
  }
  let reached = 0, total = 0;
  for (let ay = 5; ay <= 11; ay += 1) for (let ax = 100; ax <= 125; ax += 1) {
    total += 1;
    const r = rt(ax, ay);
    if (seen.has(`${r.x},${r.y}`)) reached += 1;
  }
  // Not 100%: the grand, the marimba and the timpani stand on it.
  assert.ok(reached / total > 0.8, `the platform is walkable from the stalls (${reached}/${total})`);
}
console.log('hall stage ok');

console.log('hall tier contracts ok');
