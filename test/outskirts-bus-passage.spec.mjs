import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTSKIRTS_BUS_PASSAGE as BUS, busPassageFloorAt, busPassageLocal,
  busPassageRoadPoint } from '../src/data/outskirts-bus-passage.js';
import { sweptBusPassageRefuses, busPassageLocation } from '../src/game/outskirts-bus-passage.js';
import { outskirtsCollisionBoxes, outskirtsPointBlocked } from '../src/game/outskirts-geometry.js';

const RADIUS = BUS.bodyRadius, STEP = .5, EPSILON = 1e-8;
const doorsOpen = { entryAngle: BUS.entry.openYaw, exitAngle: BUS.exit.openYaw };
const inside = (p, box) => p.x >= box.minX - RADIUS && p.x <= box.maxX + RADIUS
  && p.z >= box.minZ - RADIUS && p.z <= box.maxZ + RADIUS;

// Use the actual two visible barrier props and their existing collision shapes.
// Sampling at 2cm is narrower than every inflated panel, including a corner.
function barrierRefuses(from, to) {
  const intervals = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .02));
  for (let j = 0; j <= intervals; j++) {
    const p = { x: from.x + (to.x - from.x) * j / intervals, z: from.z + (to.z - from.z) * j / intervals };
    const road = busPassageRoadPoint(p.x, p.z);
    if (Math.abs(road.across) > 11.5 - RADIUS + EPSILON) return true;
    for (const barrier of BUS.barriers) {
      const local = busPassageLocal(road, barrier);
      if (outskirtsPointBlocked(outskirtsCollisionBoxes(barrier), local.x, local.z, RADIUS)) return true;
    }
  }
  return false;
}

function pathThrough({ phaseX = 0, phaseZ = 0, angles = doorsOpen, closeAisle = false,
  diagonal = true } = {}) {
  const blockedAisle = { minX: -.56, maxX: .56, minZ: -.05, maxZ: .05 };
  const point = (i, j) => ({ x: phaseX + i * STEP, z: phaseZ + j * STEP });
  const key = (i, j) => `${i},${j}`;
  const start = { i: -7, j: 0 }, goal = { i: 7, j: 0 };
  const queue = [start], parents = new Map([[key(start.i, start.j), null]]);
  const valid = (from, to) => Math.abs(to.x) <= 4 && Math.abs(to.z) <= 11.5 - RADIUS + EPSILON
    && !barrierRefuses(from, to) && !sweptBusPassageRefuses(from, to, angles)
    && (!closeAisle || (!inside(from, blockedAisle) && !inside(to, blockedAisle)
      && !(from.z * to.z < 0 && Math.min(Math.abs(from.x), Math.abs(to.x)) < .81)))
    && Math.abs(busPassageFloorAt(to.x, to.z) - busPassageFloorAt(from.x, from.z)) <= .45 + EPSILON;
  for (let q = 0; q < queue.length && !parents.has(key(goal.i, goal.j)); q++) {
    const n = queue[q], from = point(n.i, n.j);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1],
      ...(diagonal ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])]) {
      const i = n.i + di, j = n.j + dj, id = key(i, j);
      if (parents.has(id) || i < -8 || i > 8 || j < -23 || j > 23) continue;
      const to = point(i, j);
      // The real input path degrades a diagonal when an orthogonal half fails;
      // a graph diagonal is accepted only if both halves are legal.
      if (di && dj && (!valid(from, point(i, n.j)) || !valid(from, point(n.i, j)))) continue;
      if (!valid(from, to)) continue;
      parents.set(id, key(n.i, n.j)); queue.push({ i, j });
    }
  }
  if (!parents.has(key(goal.i, goal.j))) return null;
  const result = [];
  for (let id = key(goal.i, goal.j); id != null; id = parents.get(id)) {
    const [i, j] = id.split(',').map(Number); result.push(point(i, j));
  }
  return result.reverse();
}

test('bus-local route coordinates preserve the actual source yaw and road placement', () => {
  for (const [x, z] of [[-2.8, -3.15], [0, 0], [1.9, 3.85]]) {
    const actual = busPassageLocal(busPassageRoadPoint(x, z));
    assert.ok(Math.abs(actual.x - x) < EPSILON && Math.abs(actual.z - z) < EPSILON);
  }
  assert.ok(busPassageRoadPoint(...BUS.entry.approach).along < BUS.along);
  assert.ok(busPassageRoadPoint(...BUS.exit.outside).along > BUS.along);
});

test('every half-metre grid phase can walk the real front entry, aisle and rear exit', () => {
  for (const phaseX of [-.25, -.125, 0, .125, .25]) for (const phaseZ of [-.25, -.125, 0, .125, .25]) {
    const path = pathThrough({ phaseX, phaseZ });
    assert.ok(path, `no route for grid phase ${phaseX}, ${phaseZ}`);
    const entry = path.findIndex(p => p.x > -1.1 && p.x < -.4 && p.z > BUS.entry.fromZ && p.z < BUS.entry.toZ);
    const aisle = path.findIndex((p, i) => i > entry && Math.abs(p.x) <= .31 + EPSILON && p.z > -.5 && p.z < .5);
    const exit = path.findIndex((p, i) => i > aisle && p.x > .4 && p.x < 1.1 && p.z > BUS.exit.fromZ && p.z < BUS.exit.toZ);
    assert.ok(entry >= 0 && aisle > entry && exit > aisle, `the route bypasses a physical gate at ${phaseX}, ${phaseZ}`);
    assert.ok(path.some(p => p.x >= 1.755 && p.x <= 2.455 && p.z >= 3.64 && p.z <= 4.15),
      `phase ${phaseX},${phaseZ} has no complete exit through the actual handle clearance`);
    assert.ok(path.some(p => busPassageFloorAt(p.x, p.z) === BUS.floor), 'never boards the deck');
    assert.ok(path.some(p => busPassageFloorAt(p.x, p.z) > 0 && busPassageFloorAt(p.x, p.z) < BUS.floor), 'skips every real tread');
    for (let i = 1; i < path.length; i++) assert.ok(Math.abs(busPassageFloorAt(path[i].x, path[i].z)
      - busPassageFloorAt(path[i - 1].x, path[i - 1].z)) <= .45 + EPSILON);
  }
});

test('closing either actual door or the aisle removes every forward route and edge bypass', () => {
  assert.equal(pathThrough({ angles: { ...doorsOpen, entryAngle: 0 } }), null, 'a closed entry can be bypassed');
  assert.equal(pathThrough({ angles: { ...doorsOpen, exitAngle: 0 } }), null, 'a closed exit can be bypassed');
  assert.equal(pathThrough({ closeAisle: true }), null, 'the aisle is optional');
  for (const z of [-11.25, -11, -4.7, 4.7, 11, 11.25]) {
    assert.equal(barrierRefuses({ x: -.5, z }, { x: .5, z }), true, `unprotected barrier end at ${z}`);
  }
});

test('sweeps stop free endpoints tunnelling through a side, seat, pole or door leaf', () => {
  for (const [from, to, angles, reason] of [
    [{ x: -2, z: 0 }, { x: 0, z: 0 }, doorsOpen, 'side panel'],
    [{ x: -.2, z: -2.1 }, { x: -1.6, z: -2.1 }, doorsOpen, 'seat, wheel housing and side'],
    [{ x: .3, z: -.3 }, { x: 1.6, z: -.3 }, doorsOpen, 'seat edge and side'],
    [{ x: -.1, z: -2.7 }, { x: -.85, z: -3.1 }, doorsOpen, 'front stanchion'],
    [{ x: -2, z: -3.15 }, { x: -.5, z: -3.15 }, { ...doorsOpen, entryAngle: 0 }, 'entry leaf'],
    [{ x: .5, z: 3.85 }, { x: 2, z: 3.85 }, { ...doorsOpen, exitAngle: 0 }, 'exit leaf'],
  ]) {
    assert.equal(sweptBusPassageRefuses(from, from, angles), false, `${reason}: fixture starts occupied`);
    assert.equal(sweptBusPassageRefuses(to, to, angles), false, `${reason}: fixture ends occupied`);
    assert.equal(sweptBusPassageRefuses(from, to, angles), true, reason);
  }
  assert.equal(sweptBusPassageRefuses({ x: 0, z: -3.15 }, { x: 0, z: 3.85 }, doorsOpen), false, 'the clear aisle must remain continuous');
});

test('a partly open leaf tests body corners in bus axes rather than rotating the body with the door', () => {
  const angle = -.675, c = Math.cos(angle), s = Math.sin(angle);
  const mid = { x: BUS.entry.hinge[0] + .55 * s, z: BUS.entry.hinge[2] + .55 * c };
  const halfThickness = BUS.leafThickness / 2;
  const bodyProjection = RADIUS * (Math.abs(c) + Math.abs(s));
  const beside = distance => ({ x: mid.x + c * distance, z: mid.z - s * distance });
  const cornerTouches = beside(halfThickness + bodyProjection - .005);
  const cornerClears = beside(halfThickness + bodyProjection + .005);
  assert.equal(sweptBusPassageRefuses(cornerTouches, cornerTouches, { ...doorsOpen, entryAngle: angle }), true);
  assert.equal(sweptBusPassageRefuses(cornerClears, cornerClears, { ...doorsOpen, entryAngle: angle }), false);
});

test('open emergency-door handles remain tangible beyond the board and admit the real clear route', () => {
  const nearHandle = [{ x: .5, z: 3.625 }, { x: 2.5, z: 3.625 }];
  assert.equal(sweptBusPassageRefuses(nearHandle[0], nearHandle[0]), false, 'fixture starts in other geometry');
  assert.equal(sweptBusPassageRefuses(nearHandle[1], nearHandle[1]), false, 'fixture ends in other geometry');
  assert.equal(sweptBusPassageRefuses(...nearHandle,doorsOpen), true, 'open pull/release hardware can be tunnelled through');
  assert.equal(sweptBusPassageRefuses({ x: .5, z: 4.125 }, { x: 2.5, z: 4.125 },doorsOpen), false,
    'the complete exit has no clear centre beyond the physical handles');
});

test('legacy overlap escape requires a free destination and cannot tunnel through another object', () => {
  const inPanel = { x: -1.165, z: 0 };
  assert.equal(sweptBusPassageRefuses(inPanel, { x: -1.8, z: 0 }), false, 'cannot leave a legacy panel overlap');
  assert.equal(sweptBusPassageRefuses(inPanel, { x: -1.17, z: .2 }), true, 'overlap permits an occupied destination');
  assert.equal(sweptBusPassageRefuses(inPanel, { x: 1.8, z: 0 }), true, 'escape tunnels through the opposite side');
  assert.equal(sweptBusPassageRefuses({ x: 1.445, z: 3.3 }, { x: 2.745, z: 3.3 },doorsOpen), true,
    'starting inside the open board also waives a separate pull/release handle farther along it');
  assert.equal(sweptBusPassageRefuses({ x: NaN, z: 0 }, { x: 0, z: 0 }), true);
});

test('physical encounter regions distinguish entry, aboard, proximity and a completed exit', () => {
  assert.equal(busPassageLocation({ x: -2.8, z: -3.15 }).entryNear, true);
  assert.equal(busPassageLocation({ x: -2.8, z: -3.15 }).inside, false);
  assert.equal(busPassageLocation({ x: 0, z: 0 }).inside, true);
  assert.equal(busPassageLocation({ x: 0, z: 2.8 }).closeWoman, true);
  assert.equal(busPassageLocation({ x: -1.8, z: BUS.woman.z }).closeWoman, false, 'her outside side panel cannot spend the close encounter');
  assert.equal(busPassageLocation({ x: 0, z: 3.85 }).exited, false, 'standing aboard is not a completed exit');
  assert.equal(busPassageLocation({ x: 1.9, z: 3.85 }).exited, true);
  assert.equal(busPassageLocation({ x: 1.9, z: -3.15 }).exited, false, 'the entry side cannot spend the rear-exit event');
  assert.deepEqual(busPassageLocation(null), { entryNear: false, inside: false, closeWoman: false, exited: false });
});
