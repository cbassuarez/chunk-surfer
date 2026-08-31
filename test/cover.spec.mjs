import assert from 'node:assert/strict';

import {
  COVER, coverAxis, coverOpenings, leanLimit, resolveCover, resolvePeek,
} from '../src/game/cover.js';

// The same hand-built reader wall-contact.spec.mjs uses. The point of cover
// being pure is that "is that right?" is answerable by reading the grid.
//
// '#' solid, '.' open. `over.floor` raises a cell without making it solid.
function gridPlan(rows, over = {}) {
  const g = rows.map((r) => r.split(''));
  const h = g.length, w = g[0].length;
  const at = (map, x, y, dflt) => (map?.[`${x},${y}`] ?? dflt);
  return {
    size: () => ({ w, h }),
    isSolid: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? true : g[y][x] === '#'),
    floorAt: (x, y) => at(over.floor, x, y, 0),
    zoneAt: () => 1,
    materialAt: () => 1,
    doorAt: () => null,
    logicalToPhysical: (x, y) => ({ x, z: y, renderGroup: 'ground', arcId: 0 }),
  };
}

const ROOM = ['#####', '#...#', '#...#', '#...#', '#####'];
const CELLS = (m) => m / COVER.CELL_METRES;

// ── being against something ─────────────────────────────────────────────────
{
  const plan = gridPlan(ROOM);

  // Stood in the west of the room, a hand's width off the plaster.
  const west = resolveCover(plan, 1.5, 2.5);
  assert.ok(west, 'a man against the west wall is against something');
  assert.deepEqual([west.nx, west.ny], [1, 0], 'the normal points into the room');
  assert.equal(west.gap, 0.25, 'a quarter metre off the face');
  assert.deepEqual(west.wallCell, { x: 0, y: 2 }, 'the wall itself is the cell behind you');
  assert.deepEqual(west.axis, { x: 0, y: 1 }, 'a wall running north-south is slid along in y');

  // The middle of a room is not cover, and saying so is the whole gate.
  assert.equal(resolveCover(plan, 2.5, 2.5), null, 'the middle of a room is not cover');
}

// ── a riser is not cover ────────────────────────────────────────────────────
// wall-contact counts any neighbour 2cm higher as a wall face, because a base
// course has to run up to a step. Two centimetres is not something to hide
// behind, and this is the one place the two modules disagree on purpose.
{
  const step = gridPlan(ROOM, { floor: { '3,2': 0.30 } });
  assert.equal(resolveCover(step, 2.6, 2.5), null, 'a 30cm step is scenery, not cover');

  const parapet = gridPlan(ROOM, { floor: { '3,2': 1.20 } });
  const behind = resolveCover(parapet, 2.6, 2.5);
  assert.ok(behind, 'a chest-high rise IS something to get behind');
  assert.deepEqual([behind.nx, behind.ny], [-1, 0], 'and it faces back west, into the room');
}

// A short riser must not MASK real cover. Taking wall-contact's single nearest
// face would answer "no cover" for a man stood against a wall with a kerb at
// his other foot — which is why resolveCover asks each normal separately.
{
  const kerb = gridPlan(ROOM, { floor: { '2,2': 0.06 } });
  const found = resolveCover(kerb, 1.4, 2.5);
  assert.ok(found, 'a kerb underfoot does not delete the wall at your back');
  assert.deepEqual([found.nx, found.ny], [1, 0], 'the wall is still the cover');
}

// ── where the corner is ─────────────────────────────────────────────────────
// A stub of wall you can stand behind and look around one end of.
const STUB = [
  '#######',
  '#.....#',
  '#.###.#',
  '#.....#',
  '#######',
];
{
  const plan = gridPlan(STUB);
  const cover = resolveCover(plan, 2.5, 3.2);
  assert.ok(cover, 'stood under the stub');
  assert.deepEqual([cover.nx, cover.ny], [0, 1], 'the stub faces south');
  assert.deepEqual(cover.axis, { x: 1, y: 0 }, 'an east-west wall is slid along in x');

  const open = coverOpenings(plan, cover);
  assert.equal(open.positive, 2, 'the stub runs two more cells east before it gives out');
  assert.equal(open.negative, 0, 'and it ends immediately to the west — the corner is right there');
}

{
  // An inside corner: the wall turns and you cannot slide that way at all.
  const plan = gridPlan(ROOM);
  const cover = resolveCover(plan, 1.5, 1.5);
  const open = coverOpenings(plan, cover);
  assert.ok(open.positive === null || open.negative === null,
    'a wall meeting a wall is a dead end for a peek, not an opening');
}

// ── how far the head goes ───────────────────────────────────────────────────
{
  const plan = gridPlan(ROOM);
  const max = CELLS(COVER.MAX_LEAN_M);

  // Along the wall, into open room: the full shoulder lean.
  assert.equal(leanLimit(plan, 1.5, 2.5, 0, 1), max, 'a clear lean gets the whole 45cm');
  assert.equal(leanLimit(plan, 1.5, 2.5, 0, -1), max, 'and the same the other way');

  // Into the wall you are hiding behind: it stops the eye short of the plaster.
  const intoWall = leanLimit(plan, 1.5, 2.5, -1, 0);
  assert.ok(intoWall > 0 && intoWall < max, 'leaning at a wall is clamped, not refused');
  assert.ok(intoWall * COVER.CELL_METRES < 0.25,
    'the eye never reaches the face it is 25cm from');

  // The margin is what keeps the camera out of the plaster.
  const eye = 1.5 - intoWall;
  assert.ok(eye > 1, `the eye stays in the open cell (landed at x=${eye})`);

  assert.equal(leanLimit(plan, 1.5, 2.5, 0, 0), 0, 'no direction is no lean');
  assert.equal(leanLimit(plan, 1.5, 2.5, 0, 1, { maxLeanCells: 0 }), 0, 'no allowance is no lean');
}

// `solidAt` is how a closed door leaf or a blocking prop joins in — the plan
// does not know about either.
{
  const plan = gridPlan(ROOM);
  const blocked = leanLimit(plan, 1.5, 2.5, 0, 1, {
    solidAt: (cx, cy) => cx === 1 && cy === 3,
  });
  assert.ok(blocked < CELLS(COVER.MAX_LEAN_M), 'a prop in the way shortens the lean');
}

// ── the peek, resolved ──────────────────────────────────────────────────────
{
  const plan = gridPlan(ROOM);
  const cover = resolveCover(plan, 1.5, 2.5);
  const max = CELLS(COVER.MAX_LEAN_M);
  // Facing east out of the west wall, the camera's right hand points south.
  const rightX = 0, rightY = 1;

  const full = resolvePeek(plan, cover, 1.5, 2.5, rightX, rightY, 1);
  assert.equal(full.lean, max, 'pushing all the way leans all the way');
  assert.equal(full.clamped, false, 'and nothing was in the way');

  const half = resolvePeek(plan, cover, 1.5, 2.5, rightX, rightY, 0.5);
  assert.ok(Math.abs(half.lean - max * 0.5) < 1e-9, 'half a push is half a lean');

  const other = resolvePeek(plan, cover, 1.5, 2.5, rightX, rightY, -1);
  assert.equal(other.lean, -max, 'the sign follows the stick');

  assert.equal(resolvePeek(plan, cover, 1.5, 2.5, rightX, rightY, 0).lean, 0, 'no push, no lean');
  assert.equal(resolvePeek(plan, null, 1.5, 2.5, rightX, rightY, 1).lean, 0,
    'you cannot lean out of cover you are not in');

  // Pushed at the wall instead: clamped, and it says so.
  const at = resolvePeek(plan, cover, 1.5, 2.5, -1, 0, 1);
  assert.ok(at.clamped, 'a lean that hit something reports that it was cut short');
  assert.ok(at.lean > 0 && at.lean < max, 'and it still leans as far as it may');
}

console.log('cover.spec.mjs ok');
