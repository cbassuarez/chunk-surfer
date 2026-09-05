// The corridor dressing rules, proved against a hand-built grid and against the
// real building. The module claims to be pure and to take the same small plan
// reader wall-contact.js does; the first half of this file is what makes that
// claim true, and it runs with no browser, no GPU and no floorplan singleton.

import assert from 'node:assert/strict';
import { CONSERVATORY_FLIGHTS, CONSERVATORY_LANDINGS, conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {
  CORRIDOR, FLIGHT_DRESSING, LANDING_FITTINGS, corridorCells, corridorDressing,
  corridorThroatCells, corridorWallRuns, doorPlates, flightDressing, landingFittings,
  wallFixtures,
} from '../src/world/corridor-dressing.js';

// A 40x9 room with a 3-cell corridor cut down the middle of it, which is the
// section the rules are written for: narrow on one axis, long on the other.
function grid({ w = 40, h = 9, top = 3, bottom = 6, group = 'ground' } = {}) {
  const solid = (x, y) => x < 0 || y < 0 || x >= w || y >= h || y < top || y >= bottom;
  return {
    planSize: () => ({ w, h }),
    isSolid: (x, y) => solid(Math.floor(x), Math.floor(y)),
    floorAt: () => 0,
    zoneAt: () => ZONE.none,
    materialAt: () => 0,
    doorAt: () => null,
    logicalToPhysical: (x, y) => ({ x, z: y, renderGroup: group }),
  };
}

{
  const plan = grid();
  const cells = corridorCells(plan);
  assert.ok(cells.size > 0, 'a long narrow slot reads as a corridor');
  assert.ok([...cells.values()].every((c) => c.axis === 'x'), 'the run is along its long axis');
  assert.ok([...cells.values()].every((c) => c.width === 3), 'the section is the narrow span');

  // The throat is the clear middle: the two edge rows touch a wall and drop out,
  // which is what lets a desk stand against a corridor wall without failing.
  const throat = corridorThroatCells(plan, cells);
  assert.ok(throat.size < cells.size, 'the throat is narrower than the corridor');
  assert.ok([...throat.values()].every((c) => c.y === 4), 'only the middle row is throat');
}

{
  // Too short to be a run, however narrow.
  const cells = corridorCells(grid({ w: CORRIDOR.MIN_LENGTH_CELLS - 2 }));
  assert.equal(cells.size, 0, 'a short slot is a threshold, not a corridor');
}

{
  // Too wide to be a corridor, however long: this is the hall-aisle case. The
  // bound is generous because the compiler widens corridors before anything
  // sees them, so the section tested here is a genuinely room-sized one.
  const cells = corridorCells(grid({ h: 20, top: 1, bottom: 19 }));
  assert.equal(cells.size, 0, 'an eighteen-cell section is a room, not a corridor');
}

{
  // A stair is not a corridor, however corridor-shaped: the basement service run
  // lies alongside one for ninety cells and used to take ten boards down it.
  const plan = grid();
  const stairs = { ...plan, hasFlag: () => true };
  assert.equal(corridorCells(stairs).size, 0, 'stair cells are never dressed');
}

{
  // A wing that is not dressed keeps its own authored kit.
  assert.equal(corridorCells(grid({ group: 'cathedral' })).size, 0,
    'St Brendan\'s ambulatory is not dressed as a school corridor');
}

{
  const plan = grid();
  const runs = corridorWallRuns(plan);
  assert.ok(runs.length >= 2, 'both long walls of the slot are found');
  assert.ok(runs.every((r) => r.axis === 'x'), 'runs travel along the corridor');
  // Merged on gaps alone. wallRuns() would break these on material; this module
  // must not, or the 48m basement service run comes back as six-cell fragments.
  assert.ok(runs.some((r) => (r.to - r.from) > CORRIDOR.MIN_LENGTH_CELLS),
    'a wall with no gap in it stays one run');

  const fixtures = wallFixtures(plan);
  assert.ok(fixtures.length > 0, 'a dressed corridor gets fixtures');
  assert.ok(fixtures.every((f) => f.mount === 'wall'), 'every fixture is wall-mounted');
  assert.ok(fixtures.every((f) => f.blocks === false), 'no fixture blocks the route');
  assert.ok(fixtures.every((f) => f.mountNormal), 'every fixture names the wall it came from');
  assert.ok(fixtures.every((f) => f.elevation >= 1.15), 'nothing sits in the walking envelope');
  // Deterministic: the same plan gives the same dressing, ids included.
  assert.deepEqual(wallFixtures(plan).map((f) => f.id), fixtures.map((f) => f.id),
    'the rules are stable for a given plan');
}

{
  // No doors, no plates — and no throw.
  assert.deepEqual(doorPlates(grid(), []), []);
}

// ── AND AGAINST THE REAL BUILDING ───────────────────────────────────────────

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);
PROPS.loadPropState({});
const placed = PROPS.propsInit(FP);

const dressing = corridorDressing(FP, {
  doors: FP.doorState(), landings: CONSERVATORY_LANDINGS, flights: CONSERVATORY_FLIGHTS,
});
assert.ok(dressing.length >= 40, `the building's circulation is dressed (${dressing.length})`);

const byId = new Map(placed.map((p) => [p.id, p]));
for (const spec of dressing) {
  const prop = byId.get(spec.id);
  // propsInit drops any placement whose centre is solid, so surviving IS the
  // proof that the rule put it in open floor.
  assert.ok(prop, `${spec.id} is placed in open floor`);
  assert.ok(!prop.blocks, `${spec.id} does not block`);
  // mount:'wall' is only honoured if a real wall was found; without this the
  // dressing can float in the middle of the corridor and nothing complains.
  // A flight's handrails are not wall-mounted — they stand on the stair — so the
  // check follows the declaration rather than assuming every placement is a board.
  if (spec.mount === 'wall') assert.ok(prop.wallContact, `${spec.id} resolved against a real wall`);
}

// The whole point: nothing generated stands in a route.
const throat = corridorThroatCells(FP);
for (const spec of dressing) {
  const prop = byId.get(spec.id);
  assert.ok(!throat.has(`${prop.rx},${prop.ry}`) || prop.wallContact || prop.structural,
    `${spec.id} is on the wall, not in the throat`);
}

// Every wing with corridors gets dressed, so no part of the building is missed.
const wings = new Set(dressing.filter((d) => d.id.startsWith('corridor-fixture-'))
  .map((d) => d.id.split('-')[2]));
assert.ok(wings.has('basement') && wings.has('ground') && wings.has('upper') && wings.has('academic'),
  `all four wings are dressed (${[...wings].join(', ')})`);

// The practice suite reads as a music school: every practice room door names
// itself on the corridor side, from FACILITY_SPACES rather than a new table.
for (const n of [1, 2, 3, 4]) {
  for (const side of ['west', 'east']) {
    assert.ok(byId.get(`plate-practice-${side}-${n}`), `practice-${side}-${n} is named in the corridor`);
  }
}

// ── LANDINGS ────────────────────────────────────────────────────────────────
//
// The landing records are read from `at`, the LOGICAL frame. physicalAt is the
// render frame: resolving landings through it puts most of the building's
// twenty-four inside solid rock, which is what happened the first time.
const fittings = landingFittings(FP, CONSERVATORY_LANDINGS);
assert.equal(fittings.length, Object.keys(LANDING_FITTINGS).length,
  `every named landing got its fitting (${fittings.map((f) => f.id).join(', ')})`);
for (const f of fittings) {
  const prop = byId.get(f.id);
  assert.ok(prop, `${f.id} is placed`);
  assert.ok(prop.wallContact, `${f.id} is against the landing wall`);
  assert.ok(!prop.blocks, `${f.id} does not block the stair`);
  assert.ok(prop.landingLabel, `${f.id} carries the floor name on its plate`);
}

// Sparingly: the tower's twelve landings already have plaques, bulkheads and
// anchored lights, and the cathedral's spiral points are one cell wide. Neither
// is dressed again here.
assert.ok(!fittings.some((f) => f.id.includes('turn') || f.id.includes('belfry')
  || f.id.includes('ringing') || f.id.includes('foot') || f.id.includes('head')),
  'tower and cathedral landings keep their own authored kit');

// ── FLIGHTS ─────────────────────────────────────────────────────────────────
//
// A handrail assembly has a baked rise and run, so it fits one flight and no
// other. Exactly one pair in the building still matches: the basement stair.
// upper_stair_dressing (5.75 over 11.05) and academic_stair_dressing (6.15 over
// 10.05) are sized for the straight main stair that the spiral of winders
// replaced, and there is now no flight within a metre of either. If this count
// ever changes, either a stair moved or a mesh was rebuilt — check which before
// updating the number.
const flights = flightDressing(FP, CONSERVATORY_FLIGHTS);
assert.equal(flights.length, 1, `one flight still fits its handrails (${flights.map((f) => f.id).join(', ')})`);
const rail = byId.get('flight-main-basement-stair');
assert.ok(rail, 'the basement flight is dressed');
assert.ok(!rail.blocks, 'handrails do not block the stair');
// Down the flight, not across it: local +Z maps to (-sin yaw, cos yaw), and the
// flight runs toward -x.
assert.ok(Math.abs(Math.sin(rail.yaw) - 1) < 1e-6 && Math.abs(Math.cos(rail.yaw)) < 1e-6,
  `the assembly points down the flight (yaw ${rail.yaw})`);
// The mesh spans the flight's full width, so being half a width off puts one
// rail inside the wall. Measured centre of the stair cells is y=23.25 authored.
assert.ok(Math.abs(rail.y - 23.25) < 0.01, `centred on the flight (y ${rail.y})`);

// The refusal is the point of the tolerance check: a flight whose geometry has
// moved gets no handrails rather than floating ones.
const moved = CONSERVATORY_FLIGHTS.map((f) => (FLIGHT_DRESSING[f.key]
  ? { ...f, to: { x: f.to.x + 4, y: f.to.y } } : f));
assert.equal(flightDressing(FP, moved).length, 0,
  'a re-cut flight is refused rather than dressed with a mesh that no longer fits');

console.log(`corridor dressing contracts passed (${dressing.length} placements, ${wings.size} wings, ${fittings.length} landings, ${flights.length} flight)`);
