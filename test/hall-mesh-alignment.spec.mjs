// THE HALL'S MESHES STAND ON THE FLOOR THE PLAYER WALKS.
//
// The seating carried its own rake and both hall meshes were raised by the
// raked floor under their anchor, so the front rows sank .74m into the stalls,
// the back rows hung .68m above them, and the stage was drawn 30cm below the
// deck you stand on. Every check here compares a mesh surface against the
// compiled collision plan, through the game's own prop placement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CELL, F, ZONE } from '../src/data/floorplan/legend.js';
import { HALL_SEATING, HALL_BALCONY_SEATING } from '../src/data/hall-seating-layout.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], doors: conservatory.doors || [],
});
for (const door of FP.doorState()) FP.setDoorOpen(door.id, true);
PROPS.propsInit(FP);

// Every hall span, by physical column, so a world point resolves to the deck
// nearest an expected height (orchestra, stage and balconies share columns).
const columns = new Map();
const { w, h } = FP.planSize();
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (FP.zoneAt(x, y) !== ZONE.hall || FP.isSolid(x, y)) continue;
  const p = FP.logicalToPhysical(x, y); if (!p) continue;
  const key = `${Math.floor(p.x)},${Math.floor(p.z)}`;
  if (!columns.has(key)) columns.set(key, []);
  columns.get(key).push({ x, y, floor: FP.floorAt(x, y), layer: p.layer || '' });
}
function deckAt(wx, wz, expected) {
  let best = null;
  for (const s of columns.get(`${Math.floor(wx / CELL)},${Math.floor(wz / CELL)}`) || [])
    if (!best || Math.abs(s.floor - expected) < Math.abs(best.floor - expected)) best = s;
  return best;
}
const pose = (id) => PROPS.renderInstances({ inscriptions: false }).find((p) => p.id === id);
const seating = pose('hall-seating'), structure = pose('hall-structure');
const near = (a, b, tol = .011) => Math.abs(a - b) <= tol;

test('both hall meshes are placed at the heights they were authored for', () => {
  assert.ok(near(seating.y, HALL_SEATING.house, 1e-6), `seating base ${seating.y} is the front of the house`);
  assert.ok(near(structure.y, 0, 1e-6), `structure origin ${structure.y} is world zero`);
});

test('every terrace the seating draws is the terrace the player walks', () => {
  const [x0, x1] = HALL_SEATING.width;
  for (const { terrace, front, depth, top } of HALL_SEATING.terraces) {
    if (top <= 0) continue; // the flat strip before the first row draws no mass
    const world = seating.y + top;
    for (let lz = front + .1; lz < front + depth; lz += .45) for (let lx = x0 + .25; lx < x1; lx += .5) {
      const deck = deckAt(seating.x + lx, seating.z + lz, world);
      assert.ok(deck, `terrace ${terrace} has collision under local ${lx},${lz.toFixed(2)}`);
      assert.ok(near(deck.floor, world), `terrace ${terrace} at ${lx},${lz.toFixed(2)}: mesh ${world.toFixed(2)} vs floor ${deck.floor.toFixed(2)}`);
    }
  }
});

test('every drawn seat stands on its terrace, off the aisles, and blocks the player', () => {
  let seats = 0;
  for (const { terrace, top, seatZs } of HALL_SEATING.terraces) for (const seatZ of seatZs) {
    for (const lx of HALL_SEATING.seatXs) {
      seats++;
      const wx = seating.x + lx, wz = seating.z + seatZ, deck = deckAt(wx, wz, seating.y + top);
      assert.ok(deck && near(deck.floor, seating.y + top), `seat ${lx} row ${terrace} sits on its terrace`);
      assert.equal(FP.flagsAt(deck.x, deck.y) & F.STAIR, 0, `seat ${lx} row ${terrace} is not in an aisle`);
      assert.equal(PROPS.propCanOccupy(deck.x, deck.y), false, `seat ${lx} row ${terrace} blocks the player`);
    }
  }
  assert.equal(seats, HALL_SEATING.seatCount);
});

test('the stage deck and its step treads are drawn where they are climbed', () => {
  for (let lz = -17.75; lz < -11; lz += .5) for (const lx of [-8, -3, 0, 3, 8]) {
    const deck = deckAt(structure.x + lx, structure.z + lz, structure.y - 1.5);
    // Stairs on the stage (the service flight, the two step bays) have their own
    // meshes and checks; the platform is every other stage cell.
    if (deck?.layer !== 'hall_stage' || (FP.flagsAt(deck.x, deck.y) & F.STAIR)) continue;
    assert.ok(near(deck.floor, structure.y - 1.5), `stage at ${lx},${lz}: ${deck.floor}`);
  }
  for (const sx of [-5.5, 5.5]) for (const [lz, top] of [[-11.5, -2.16], [-12.5, -1.83]]) {
    const deck = deckAt(structure.x + sx, structure.z + lz, structure.y + top);
    assert.ok(deck && near(deck.floor, structure.y + top), `step ${sx},${lz}: mesh ${top} vs floor ${deck?.floor}`);
  }
});

test('the built seating mesh is the one this layout describes', () => {
  const stats = JSON.parse(readFileSync(new URL('../public/assets/conservatory-props.stats.json', import.meta.url), 'utf8'));
  const b = stats.bounds.hall_seating, drawn = HALL_SEATING.terraces.filter((t) => t.top > 0);
  assert.ok(near(b.min[0], HALL_SEATING.width[0], .05) && near(b.max[0], HALL_SEATING.width[1], .05), `seating x ${b.min[0]}..${b.max[0]}`);
  assert.ok(near(b.min[2], drawn[0].front, .05) && near(b.max[2], drawn.at(-1).front + drawn.at(-1).depth, .05), `seating z ${b.min[2]}..${b.max[2]}`);
  // The balcony mesh spans its seats, in metres local to its anchor.
  const bb = stats.bounds.hall_balcony_seating, A = HALL_BALCONY_SEATING.anchor.physical;
  assert.ok(bb, 'the pack contains the balcony seating');
  const xs = HALL_BALCONY_SEATING.seats.map((q) => q.x - A.x), zs = HALL_BALCONY_SEATING.seats.map((q) => q.z - A.z);
  assert.ok(bb.min[0] <= Math.min(...xs) && bb.max[0] >= Math.max(...xs) && bb.min[2] <= Math.min(...zs) && bb.max[2] >= Math.max(...zs),
    `balcony seating bounds ${JSON.stringify(bb)} cover every seat`);
});

const balcony = pose('hall-balcony-seating');
const logical = (deck, lx, ly) => FP.toRuntimePoint({ x: lx, y: (deck === 'upper' ? 82 : 40) + ly }, { center: false });

test('the balcony seating is placed at world heights over its anchor', () => {
  assert.ok(balcony, 'the balcony seating is instantiated');
  assert.ok(near(balcony.y, 0, 1e-6), `balcony seating origin ${balcony.y} is world zero`);
  assert.ok(near(balcony.x, HALL_BALCONY_SEATING.anchor.physical.x, 1e-6) && near(balcony.z, HALL_BALCONY_SEATING.anchor.physical.z, 1e-6),
    `balcony anchor at ${balcony.x},${balcony.z}`);
});

test('every balcony seat stands on its own deck and blocks the player', () => {
  for (const seat of HALL_BALCONY_SEATING.seats) {
    const deck = deckAt(seat.x, seat.z, seat.y);
    const layer = seat.deck === 'upper' ? 'hall_upper' : 'hall_lower';
    assert.ok(deck && deck.layer === layer && near(deck.floor, seat.y), `${seat.deck} ${seat.part} seat at ${seat.x},${seat.z}: mesh ${seat.y} vs ${deck?.layer} ${deck?.floor}`);
    assert.equal(PROPS.propCanOccupy(deck.x, deck.y), false, `${seat.deck} ${seat.part} seat at ${seat.x},${seat.z} blocks the player`);
  }
});

test('the arm walkways and the presence seats stay open', () => {
  for (const deck of ['lower', 'upper']) for (const lx of [2, 27]) for (let ly = lx < 3 ? 11 : 8; ly < 36; ly++) {
    const r = logical(deck, lx, ly);
    if (!FP.cellAt(r.x, r.y) || FP.isSolid(r.x, r.y)) continue;
    assert.ok(PROPS.propCanOccupy(r.x, r.y), `${deck} walkway ${lx},${ly} is clear`);
  }
  for (const [lx, ly] of HALL_BALCONY_SEATING.presenceCells) {
    const r = logical('upper', lx, ly);
    assert.ok(PROPS.propCanOccupy(r.x, r.y), `presence seat ${lx},${ly} is clear`);
  }
});

test('the hall seats an audience at the scale of its volume', () => {
  assert.equal(HALL_BALCONY_SEATING.totalWithStalls, HALL_SEATING.seatCount + HALL_BALCONY_SEATING.seats.length);
  assert.ok(HALL_BALCONY_SEATING.totalWithStalls >= 600, `${HALL_BALCONY_SEATING.totalWithStalls} seats`);
});
