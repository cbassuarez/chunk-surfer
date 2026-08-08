import assert from 'node:assert/strict';

import {
  WALL_CONTACT, wallFaces, wallRuns, wallContactAt, snapToWall, yawFromNormal,
} from '../src/world/wall-contact.js';

// A hand-built plan reader. The whole point of wall-contact being pure is that
// the rules can be checked against a grid you can see, rather than against the
// conservatory, where "is that right?" is not answerable by reading.
//
// '#' solid, '.' open. Options override floor/zone/material/group/arc per cell.
function gridPlan(rows, over = {}) {
  const g = rows.map((r) => r.split(''));
  const h = g.length, w = g[0].length;
  const at = (map, x, y, dflt) => (map?.[`${x},${y}`] ?? dflt);
  return {
    size: () => ({ w, h }),
    isSolid: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? true : g[y][x] === '#'),
    floorAt: (x, y) => at(over.floor, x, y, 0),
    zoneAt: (x, y) => at(over.zone, x, y, 1),
    materialAt: (x, y) => at(over.material, x, y, 1),
    doorAt: (x, y) => at(over.door, x, y, null),
    logicalToPhysical: (x, y) => ({
      x, z: y, renderGroup: at(over.group, x, y, 'ground'), arcId: at(over.arc, x, y, 0),
    }),
  };
}

// A three-by-three room inside rock.
const ROOM = ['#####', '#...#', '#...#', '#...#', '#####'];

// ── faces ───────────────────────────────────────────────────────────────────
{
  const faces = wallFaces(gridPlan(ROOM));
  // Eight of the nine cells touch rock; the centre touches none. The corners
  // touch on two sides, the edges on one: 4*2 + 4*1 = 12.
  assert.equal(faces.length, 12, 'a 3x3 room has twelve wall faces');
  assert.ok(!faces.some((f) => f.x === 2 && f.y === 2), 'the middle of a room is not against a wall');

  // The normal points INTO the room, away from the rock.
  const north = faces.find((f) => f.x === 2 && f.y === 1);
  assert.deepEqual([north.nx, north.ny], [0, 1], 'the north wall faces south, into the room');
  const west = faces.find((f) => f.x === 1 && f.y === 2);
  assert.deepEqual([west.nx, west.ny], [1, 0], 'the west wall faces east, into the room');
}

// A RISER IS A WALL as far as its base is concerned; a header is not.
{
  const open = ['.....', '.....', '.....'];
  const step = wallFaces(gridPlan(open, { floor: { '3,1': 1.2 } }));
  assert.ok(step.some((f) => f.x === 2 && f.y === 1 && f.nx === -1),
    'a neighbour with a higher floor presents a wall to the cell below it');
  // Five wide by three tall, all open: 5 + 5 north/south and 3 + 3 east/west.
  const flat = wallFaces(gridPlan(open));
  assert.equal(flat.length, 16, 'open floor with no step has only the plan edge');
}

// A skirting must not run across an opening.
{
  const withDoor = wallFaces(gridPlan(ROOM, { door: { '2,1': { id: 'd' } } }));
  assert.ok(!withDoor.some((f) => f.x === 2 && f.y === 1), 'a door cell carries no skirting');
  assert.ok(wallFaces(gridPlan(ROOM, { door: {} }), { skipDoors: false }).length === 12);
}

// ── runs ────────────────────────────────────────────────────────────────────
{
  const runs = wallRuns(gridPlan(ROOM));
  // Four walls, each three cells long.
  assert.equal(runs.length, 4, 'a 3x3 room merges into four runs');
  for (const r of runs) assert.equal(r.to - r.from, 3, 'each wall of the room is one three-cell run');
}

// A run STOPS at a step. Bridging one would leave skirting in mid-air, which is
// the whole failure this module exists to prevent.
{
  const runs = wallRuns(gridPlan(ROOM, { floor: { '2,1': 0.4 } }));
  // The north wall was one three-cell run; raising the middle cell must break it
  // into single cells. (The raised cell also presents a riser to the cell south
  // of it, which is a fourth north-facing run and is correct.)
  const northWall = runs.filter((r) => r.nx === 0 && r.ny === 1 && r.along === 1);
  assert.equal(northWall.length, 3, 'a floor-height change splits the run it crosses');
  assert.ok(northWall.every((r) => r.to - r.from === 1), 'no run spans the step');
  assert.ok(runs.some((r) => r.nx === 0 && r.ny === 1 && r.along === 2),
    'the raised cell presents a riser to the cell below it');
}

// And at a render-group change, and at an arc.
{
  const split = wallRuns(gridPlan(ROOM, { group: { '2,1': 'upper' } }));
  assert.equal(split.filter((r) => r.nx === 0 && r.ny === 1).length, 3, 'a run does not span two render groups');

  const arced = wallRuns(gridPlan(ROOM, { arc: { '2,1': 7 } }));
  const north = arced.filter((r) => r.nx === 0 && r.ny === 1);
  assert.equal(north.length, 3, 'an arc cell is never merged into a straight run');
  assert.ok(north.some((r) => r.arcId === 7 && r.to - r.from === 1), 'the arc cell stands alone');
}

// ── contact, for standing something against a wall ──────────────────────────
{
  const plan = gridPlan(ROOM);
  // Just inside the west wall, which sits at the boundary x=1.
  const c = wallContactAt(plan, 1.2, 2.5);
  assert.ok(c, 'there is a wall near the west side of the room');
  assert.deepEqual([c.nx, c.ny], [1, 0], 'it is the west wall, facing east');
  assert.ok(Math.abs(c.gap - 0.2 * WALL_CONTACT.CELL_METRES) < 1e-9, 'the gap is measured to the face plane');

  // THE NEAR WALL, not the far one.
  const near = wallContactAt(plan, 1.1, 2.5);
  assert.deepEqual([near.nx, near.ny], [1, 0]);
  const far = wallContactAt(plan, 3.9, 2.5);
  assert.deepEqual([far.nx, far.ny], [-1, 0], 'from the east side it finds the east wall');

  assert.equal(wallContactAt(plan, 2.5, 2.5, { searchCells: 0 }), null,
    'no wall in range returns null rather than snapping to something distant');
}

// The yaw faces OUT of the wall, in the prop pack's own convention: local +z
// goes to (-sin yaw, cos yaw).
{
  for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const yaw = yawFromNormal(nx, ny);
    assert.ok(Math.abs(-Math.sin(yaw) - nx) < 1e-9 && Math.abs(Math.cos(yaw) - ny) < 1e-9,
      `yaw for normal ${nx},${ny} does not face out of the wall`);
  }
}

// SNAPPING IS IDEMPOTENT. Resolving twice must not walk the prop into the wall,
// which is what happens when you snap by nudging instead of by solving.
{
  const plan = gridPlan(ROOM);
  const half = 0.15;
  const first = snapToWall(wallContactAt(plan, 1.4, 2.5), { halfDepth: half });
  assert.ok(first.x !== null && first.y === null, 'a west wall constrains x only');
  const again = snapToWall(wallContactAt(plan, first.x, 2.5), { halfDepth: half });
  assert.ok(Math.abs(again.x - first.x) < 1e-9, 'snapping an already-snapped prop moves it again');
  // And it ends up flat against the wall, half its depth off the plane.
  assert.ok(Math.abs((first.x - 1) * WALL_CONTACT.CELL_METRES - half) < 1e-9,
    'the prop stands its own half-depth off the face');
}

console.log('wall contact specs passed');
