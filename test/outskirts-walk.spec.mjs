// Continuous headless traversal through the production movement API. This does
// not stand in for first-person browser/audio acceptance or the main.js phone
// gate: it proves that the actual street can be walked, remembers its approach,
// and submits its authored changes throughout the full route.
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import {
  OUTSKIRT_LAST_MARK, OUTSKIRT_LAST_THRESHOLD, OUTSKIRT_ROAD_END,
  OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START, outskirtsArrivalLayout,
} from '../src/data/source-outskirts-arrival.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { OUTSKIRTS_BUS_PASSAGE as BUS, busPassageLocal, busPassageRoadPoint } from '../src/data/outskirts-bus-passage.js';
import { BUS_BODY_CORRIDOR, busBodyCorridorCentre } from '../src/game/bus-body-corridor.js';

const layout = outskirtsArrivalLayout();
for (const piece of layout) assert.ok(PROP_BOUNDS[piece.mesh]
  || (piece.mesh === BUS.mesh && piece.busPassage && piece.collision?.length)
  || (['outskirts_fold_guard', 'outskirts_overprint_body', 'outskirts_dog_handler', 'outskirts_vacant_dog'].includes(piece.mesh) && piece.collision?.length)
  || (piece.mesh === 'outskirts_slack_lead' && piece.collision === 'none'), `${piece.mesh} has not been generated`);
const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength, { seed: 4417, marbleEyes: 'returned' });
let runtime = createSourceSpaceRuntime({ initialState: built.state });
let position = { ...built.position }, time = 0, moved = 0;
runtime.setPlayerPosition(position);
const axis = position.x, initialAlong = runtime.outskirtsLastLight().along;
const alongAt = p => initialAlong + (built.position.y - p.y) * CELL;
const passStart = k => OUTSKIRT_STRETCH_START + k * OUTSKIRT_STRETCH_METRES;
const emitted = [], submitted = new Set(), visitedPasses = new Set();
const busTrajectory = [];
let lastInstances = [], replayChecked = false, saveChecked = false;

function frame(yaw = 0) {
  time += .25;
  runtime.tickOutskirtsCharacters(.25, { viewYaw: yaw, reducedMotion: true });
  const street = runtime.outskirtsStreetFrame({ time, viewYaw: yaw, reducedMotion: true });
  emitted.push(...street.events);
  if (street.pass >= 0 && street.pass < 29) visitedPasses.add(street.pass);
  lastInstances = runtime.propInstances(position.x, position.y, { time, viewYaw: yaw, reducedMotion: true });
  for (const p of lastInstances) if (p.sourceStructure === 'outskirts') submitted.add(p.id);
  emitted.push(...runtime.outskirtsBeatFrame({ viewYaw: yaw, reducedMotion: true }).events);
  return street;
}

function step(next) {
  const result = runtime.geometry.canStep(position.x, position.y, next.x, next.y);
  assert.equal(result.ok, true, `route fails at ${alongAt(position).toFixed(2)}m -> ${alongAt(next).toFixed(2)}m, x=${((next.x-axis)*CELL).toFixed(2)}: ${result.why}`);
  const before = position;
  position = { ...(result.redirect || next), facing: 0 };
  runtime.setPlayerPosition(position);
  runtime.onStep(before, position);
  if (!runtime.busInteriorFrame() && alongAt(position) >= passStart(BUS.pass) && alongAt(position) < passStart(BUS.pass + 1)) {
    busTrajectory.push(busPassageLocal({ across: (position.x - axis) * CELL,
      along: alongAt(position) - passStart(BUS.pass) }));
  }
  moved += Math.hypot(next.x - before.x, next.y - before.y) * CELL;
  frame();
}

function walkPocketTarget(target, { origin, bus = null } = {}) {
  const desired = { x: position.x + Math.round(target.x - position.x), y: position.y + Math.round(target.y - position.y) };
  const key = p => `${p.x},${p.y}`, queue = [position], parents = new Map([[key(position), null]]), points = new Map([[key(position), position]]);
  const local = p => { const dx = (p.x + .5) * CELL - origin.x, dz = (p.y + .5) * CELL - origin.z;
    return { x: dx * Math.cos(origin.yaw) - dz * Math.sin(origin.yaw), z: dx * Math.sin(origin.yaw) + dz * Math.cos(origin.yaw) }; };
  for (let q = 0; q < queue.length && !parents.has(key(desired)); q++) {
    const p = queue[q];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: p.x + dx, y: p.y + dy }, id = key(next), at = local(next);
      if (parents.has(id) || (bus ? Math.abs(at.x) > 3 || at.z < -4 || at.z > 5
        : Math.abs(at.x - busBodyCorridorCentre(at.z).x) > 1 || at.z < 0 || at.z > BUS_BODY_CORRIDOR.length + .5)) continue;
      if (!runtime.geometry.canStep(p.x, p.y, next.x, next.y).ok) continue;
      parents.set(id, key(p)); points.set(id, next); queue.push(next);
    }
  }
  assert.ok(parents.has(key(desired)), 'the ordinary body-passage route dead-ends');
  const path = []; for (let id = key(desired); parents.get(id) != null; id = parents.get(id)) path.push(points.get(id));
  for (const next of path.reverse()) step(next);
}

// The search uses only actual canStep results. A node is half a metre from its
// neighbour, and each segment begins at the previous segment's exact endpoint.
function walkTo(targetAlong, across = 0, { extent = 11, nearestAlong = false } = {}) {
  const offset = Math.round(extent / CELL), nx = offset * 2 + 1, xAt = i => axis + i - offset;
  const startI = Math.round(position.x - axis) + offset, goalI = Math.round(across / CELL) + offset;
  const distance = (targetAlong - alongAt(position)) / CELL;
  const rows = Math.max(0, nearestAlong ? Math.round(distance) : Math.ceil(distance));
  const startY = position.y, point = (i, j) => ({ x: xAt(i), y: startY - j });
  const start = startI, goal = rows * nx + goalI, queue = [start], parents = new Map([[start, null]]);
  for (let q = 0; q < queue.length && !parents.has(goal); q += 1) {
    const key = queue[q], i = key % nx, j = Math.floor(key / nx), p = point(i, j);
    for (const [di, dj] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const ii = i + di, jj = j + dj, next = jj * nx + ii;
      if (ii < 0 || ii >= nx || jj < 0 || jj > rows || parents.has(next)) continue;
      const n = point(ii, jj);
      if (!runtime.geometry.canStep(p.x, p.y, n.x, n.y).ok) continue;
      parents.set(next, key); queue.push(next);
    }
  }
  assert.ok(parents.has(goal), `no continuous route to ${targetAlong.toFixed(2)}m from ${alongAt(position).toFixed(2)}m`);
  const path = [];
  for (let key = goal; parents.get(key) != null; key = parents.get(key)) path.push(point(key % nx, Math.floor(key / nx)));
  for (const p of path.reverse()) step(p);
}

frame();
for (let k = 0; k < 29; k += 1) {
  if (k === 0) {
    walkTo(passStart(0) + 12, -2);
    frame(1.1); // A real earlier sideways look, distinct from the later live pose.
    for (let i = 0; i < 8; i++) frame(1.1);
    walkTo(passStart(0) + 13, -2);
  }
  if (k === 1) {
    walkTo(passStart(1) + 13);
    frame();
    const double = lastInstances.find(p => p.id === 'outskirts-double');
    assert.ok(double?.reflectionOnly, 'the previous traversal has no reflection-only replay');
    assert.ok(Math.abs(double.matrix[12] - ((axis + .5) * CELL - 2)) < .05, `the double misses the earlier detour: x=${double.matrix[12]}`);
    assert.ok(Math.abs(double.matrix[12] - (position.x + .5) * CELL) > 1.5);
    replayChecked = true;
  }
  if (k === 2) {
    const lodge = layout.find(p=>p.id==='r2-booth');
    walkTo(lodge.along+2.2,lodge.across);
    const guard = runtime.outskirtsPiece('r2-booth-guard'), eye = { x: (position.x + .5) * CELL, z: (position.y + .5) * CELL };
    assert.ok(guard);
    assert.equal(runtime.focusAt(position.x,position.y,3)?.inspect,'guard','the ordinary walked counter approach lost the guard conversation');
    const bearing = Math.atan2(guard.x - eye.x, -(guard.z - eye.z));
    frame(bearing);
    frame(bearing + Math.PI);
    frame(bearing);
    assert.ok(!lastInstances.some(p => p.id === 'r2-booth-guard'), 'the guard remains after a real look-away');
    assert.ok(runtime.state().outskirtsExperience.observed.some(p => p.id === 'r2-booth-guard' && p.seen && p.gone), 'the walk never observes and loses the guard');
  }
  if (k === 6) {
    const guard=layout.find(p=>p.id==='r6-booth-guard');
    walkTo(guard.along+Math.cos(guard.yaw)*1.85,guard.across-Math.sin(guard.yaw)*1.85);
    step({...position,x:position.x+Math.round(Math.sin(guard.yaw)),y:position.y+Math.round(Math.cos(guard.yaw))});
    assert.ok(emitted.some(e => e.id === 'r6:hatch-impact'), 'the close lodge approach has no retained physical event');
  }
  if (k === BUS.pass) {
    // The entrance opens on a physical approach; a static whole-pass search
    // from its closed starting state cannot stand in for that actual action.
    for (const [x, z] of [BUS.entry.approach, BUS.entry.inside]) {
      const road = busPassageRoadPoint(x, z);
      walkTo(passStart(k) + road.along, road.across, { nearestAlong: true });
      for (let i = 0; i < 4; i++) frame();
    }
    const bus = runtime.outskirtsPiece('r7-bus'), at = (x, z, origin = bus) => ({ x: (origin.x + x * Math.cos(origin.yaw) + z * Math.sin(origin.yaw)) / CELL - .5,
      y: (origin.z - x * Math.sin(origin.yaw) + z * Math.cos(origin.yaw)) / CELL - .5 });
    walkPocketTarget(at(.75, 4), { origin: bus, bus });
    assert.equal(runtime.outskirtsPerformAction({ action: 'bus-exit-try', pass: 7 }).changed, true);
    for (let i = 0; i < 7; i++) frame();
    walkPocketTarget(at(0, 2.5), { origin: bus, bus });
    assert.equal(runtime.outskirtsPerformAction({ action: 'bus-woman-open', pass: 7 }).changed, true);
    for (let i = 0; i < 12; i++) frame();
    walkPocketTarget(at(0, 4.5), { origin: bus, bus });
    const interior = runtime.busInteriorFrame(); assert.ok(interior?.active, 'ordinary movement never enters her opened body');
    walkPocketTarget(at(busBodyCorridorCentre(72).x, 72.5, interior.origin), { origin: interior.origin });
    assert.equal(runtime.busInteriorFrame(), null);
    assert.equal(runtime.state().outskirtsExperience.busTransit.exited, true, 'the continuous walk never completes the long organ passage');
  }
  if (k === 14) {
    const saved = JSON.parse(JSON.stringify(runtime.state()));
    const oldHistory = saved.outskirtsExperience.history;
    assert.ok(oldHistory.length > 250 && oldHistory.some(p => p.pass === 0 && p.across === -2));
    assert.ok(saved.outskirtsExperience.busStage >= 3);
    assert.equal(saved.outskirtsExperience.busTransit.exited, true);
    assert.ok(saved.outskirtsExperience.observed.some(p => p.id === 'r2-booth-guard' && p.gone));
    assert.ok(saved.outskirtsExperience.actions.includes('r6:hatch-impact'));
    const oldCount = emitted.length;
    runtime = createSourceSpaceRuntime({ initialState: saved });
    runtime.setPlayerPosition(position);
    frame();
    assert.deepEqual(runtime.state().outskirtsExperience.history.slice(0, oldHistory.length), oldHistory, 'reload rewrites the earlier walk');
    assert.ok(!lastInstances.some(p => p.id === 'r2-booth-guard'));
    assert.ok(!emitted.slice(oldCount).some(e => /^outskirts-bus:|^r6:hatch-impact$/.test(e.id)), 'reload replays a spent encounter');
    saveChecked = true;
  }
  walkTo(passStart(k + 1));
}

// The remaining darkness is still walked. The last recording is deliberately
// not played by this test: main owns its live audio clock. Its pool is optional
// and the old service stop cannot turn the final road into a compulsory gate.
walkTo(OUTSKIRT_LAST_THRESHOLD.fromAlong - 1);
walkTo(OUTSKIRT_LAST_MARK.along);
assert.ok(runtime.outskirtsLastLight().reached, 'the continuous route misses the actual pool mark');
walkTo(OUTSKIRT_LAST_THRESHOLD.endpointAlong + 2, 0, { extent: 36 });
assert.ok(moved >= OUTSKIRT_LAST_MARK.along - initialAlong && moved < 1300, `unexpected walk length ${moved}`);
assert.equal(visitedPasses.size, 29);
assert.ok(replayChecked && saveChecked);
for (const id of ['entry-open', 'floor-load', 'rear-cloth', 'rear-step']) {
  assert.equal(emitted.filter(e => e.id === `outskirts-bus:${id}`).length, 1, `${id} bus event is absent or repeated`);
}
const entry = busTrajectory.findIndex(p => p.x > -1.1 && p.x < -.4 && p.z > -3.7 && p.z < -2.6);
const aisle = busTrajectory.findIndex((p, i) => i > entry && Math.abs(p.x) <= .31 && Math.abs(p.z) < .5);
const exit = busTrajectory.findIndex((p, i) => i > aisle && p.x > .4 && p.x < 1.1 && p.z > 3.3 && p.z < 4.4);
assert.ok(entry >= 0 && aisle > entry && exit > aisle, 'the continuous route bypasses the real bus interior');
assert.ok(Number.isFinite(runtime.state().outskirtsExperience.busTransit.crossedAt), 'the walk bypasses the required body/corridor crossing');
assert.equal(emitted.filter(e => e.id === 'r6:hatch-impact').length, 1, 'hatch event repeats');
for (const p of layout.filter(p => p.stretch >= 0 && p.stretch < 29 && (p.unfinished || p.encounter || p.mesh === 'wet_footprint' || p.key.endsWith('-stutter')))) {
  assert.ok(submitted.has(p.id) || [...submitted].some(id => id.startsWith(`${p.id}:frame-`)), `${p.id} never reaches the renderer during the walk`);
}
assert.ok(alongAt(position) > OUTSKIRT_ROAD_END);
console.log(`outskirts continuous walk passed: ${moved.toFixed(1)}m, 29 passes, retained encounter/guard/history, Last Light pool reached`);
