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

const layout = outskirtsArrivalLayout();
for (const piece of layout) assert.ok(PROP_BOUNDS[piece.mesh] || (piece.mesh === 'outskirts_fold_guard' && piece.collision?.length), `${piece.mesh} has not been generated`);
const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength, { seed: 4417, marbleEyes: 'returned' });
let runtime = createSourceSpaceRuntime({ initialState: built.state });
let position = { ...built.position }, time = 0, moved = 0;
runtime.setPlayerPosition(position);
const axis = position.x, initialAlong = runtime.outskirtsLastLight().along;
const alongAt = p => initialAlong + (built.position.y - p.y) * CELL;
const passStart = k => OUTSKIRT_STRETCH_START + k * OUTSKIRT_STRETCH_METRES;
const emitted = [], submitted = new Set(), visitedPasses = new Set();
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
  position = { ...next, facing: 0 };
  runtime.setPlayerPosition(position);
  runtime.onStep(before, position);
  moved += Math.hypot(position.x - before.x, position.y - before.y) * CELL;
  frame();
}

// The search uses only actual canStep results. A node is half a metre from its
// neighbour, and each segment begins at the previous segment's exact endpoint.
function walkTo(targetAlong, across = 0, { extent = 11 } = {}) {
  const offset = Math.round(extent / CELL), nx = offset * 2 + 1, xAt = i => axis + i - offset;
  const startI = Math.round(position.x - axis) + offset, goalI = Math.round(across / CELL) + offset;
  const rows = Math.max(0, Math.ceil((targetAlong - alongAt(position)) / CELL));
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
    walkTo(passStart(k) + 12.5, -5.5);
    const guard = runtime.outskirtsPiece('r2-booth-guard'), eye = { x: (position.x + .5) * CELL, z: (position.y + .5) * CELL };
    assert.ok(guard);
    const bearing = Math.atan2(guard.x - eye.x, -(guard.z - eye.z));
    frame(bearing);
    frame(bearing + Math.PI);
    assert.ok(!lastInstances.some(p => p.id === 'r2-booth-guard'), 'the guard remains after a real look-away');
    assert.ok(runtime.state().outskirtsExperience.observed.some(p => p.id === 'r2-booth-guard' && p.seen && p.gone), 'the walk never observes and loses the guard');
  }
  if (k === 6) {
    walkTo(passStart(k) + 12.5, -5.5);
    assert.ok(emitted.some(e => e.id === 'r6:hatch-impact'), 'the close lodge approach has no retained physical event');
  }
  if (k === 14) {
    const saved = JSON.parse(JSON.stringify(runtime.state()));
    const oldHistory = saved.outskirtsExperience.history;
    assert.ok(oldHistory.length > 250 && oldHistory.some(p => p.pass === 0 && p.across === -2));
    assert.ok(saved.outskirtsExperience.busStage >= 3);
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
assert.equal(emitted.filter(e => e.id === 'outskirts-bus:coat-rustle').length, 1, 'close bus event is absent or repeated');
assert.equal(emitted.filter(e => e.id === 'outskirts-bus:footstep').length, 1, 'behind-body footstep is absent or repeated');
assert.equal(emitted.filter(e => e.id === 'r6:hatch-impact').length, 1, 'hatch event repeats');
for (const p of layout.filter(p => p.stretch >= 0 && p.stretch < 29 && (p.unfinished || p.encounter || p.mesh === 'wet_footprint' || p.key.endsWith('-stutter')))) {
  assert.ok(submitted.has(p.id) || [...submitted].some(id => id.startsWith(`${p.id}:frame-`)), `${p.id} never reaches the renderer during the walk`);
}
assert.ok(alongAt(position) > OUTSKIRT_ROAD_END);
console.log(`outskirts continuous walk passed: ${moved.toFixed(1)}m, 29 passes, retained encounter/guard/history, Last Light pool reached`);
