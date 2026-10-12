import assert from 'node:assert/strict';
import { createOutskirtsExperience } from '../src/game/outskirts-experience.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeChunkSurfState } from '../src/game/chunk-surf-state.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { OUTSKIRT_LAST_MARK, OUTSKIRT_STRETCH_START, OUTSKIRT_STRETCH_METRES } from '../src/data/source-outskirts-arrival.js';

const experience = createOutskirtsExperience();
const position = { x: 4, z: 20 };
for (let i = 0; i < 100; i++) experience.bus({ active: true, visible: true, near: false, crossed: false, position });
assert.equal(experience.busStage(), 1, 'waiting at a safe distance cannot spend the close encounter');
assert.deepEqual(experience.events().map(e => e.cue), ['bus-air']);
experience.bus({ active: true, visible: false, near: true, crossed: false, position });
assert.equal(experience.busStage(), 2, 'a player looking away still physically approaches');
experience.bus({ active: true, visible: false, near: false, crossed: true, position });
assert.deepEqual(experience.events().map(e => e.cue), ['coat-rustle', 'footstep']);
const restored = createOutskirtsExperience(normalizeChunkSurfState({ outskirtsExperience: experience.snapshot() }).outskirtsExperience);
restored.bus({ active: true, visible: false, near: true, crossed: true, position });
assert.deepEqual(restored.events(), [], 'retreat/reload cannot replay a spent scare');

for (const [local, across, yaw] of [[0, -2, .1], [12, 3, 1.2], [24, 1, -.8]]) {
  experience.remember({ pass: 0, along: OUTSKIRT_STRETCH_START + local, across, yaw, time: local });
}
const echo = experience.echo(1, 12, OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START);
assert.equal(echo.across, 3);
assert.equal(echo.yaw, 1.2);
assert.equal(echo.along, OUTSKIRT_STRETCH_START + 2 * OUTSKIRT_STRETCH_METRES + 12);
assert.equal(experience.action('r6:knock', 'glass-knock', position), true);
assert.equal(experience.action('r6:knock', 'glass-knock', position), false);

const clocked = createOutskirtsExperience({ history: [
  { pass: 0, along: OUTSKIRT_STRETCH_START, across: -2, yaw: 0, clock: 0 },
  { pass: 0, along: OUTSKIRT_STRETCH_START + 1, across: -2, yaw: .8, clock: 1 },
  { pass: 0, along: OUTSKIRT_STRETCH_START + 1, across: -2, yaw: .8, clock: 3 },
  { pass: 0, along: OUTSKIRT_STRETCH_START + 3, across: 0, yaw: 0, clock: 4 },
  { pass: 1, along: OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_METRES, across: 0, yaw: 0, clock: 5 },
] });
for (let i = 0; i <= 8; i++) clocked.tickCharacters(i === 0 ? 0 : .25, { pass: 1, along: OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_METRES, across: 0, yaw: 0 });
const stoppedEcho = clocked.echo(1, 0, OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START);
assert.equal(stoppedEcho.along, OUTSKIRT_STRETCH_START + 2 * OUTSKIRT_STRETCH_METRES + 1, 'the earlier walk advances while the live player stands still');
assert.equal(stoppedEcho.yaw, .8, 'the earlier pause and turn replay on their recorded clock');
for (let i = 9; i <= 11; i++) clocked.tickCharacters(.25, { pass: 1, along: OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_METRES, across: 0, yaw: 0 });
assert.equal(clocked.echo(1, 0, OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START).along, stoppedEcho.along, 'recorded standing time is a real pause');

const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
const runtime = createSourceSpaceRuntime({ initialState: built.state });
runtime.setPlayerPosition(built.position);
const first = runtime.outskirtsLastLight();
const atMark = { x: built.position.x, y: built.position.y - (OUTSKIRT_LAST_MARK.along - first.along) / CELL, facing: 0 };
runtime.setPlayerPosition({ ...atMark, x: atMark.x + 30 });
assert.equal(runtime.outskirtsLastLight().reached, false, 'passing the light far off-axis cannot start it');
runtime.setPlayerPosition(atMark);
assert.equal(runtime.outskirtsLastLight().reached, true);
assert.equal(runtime.sourceVoidBeacon().strength, 0, 'the tape beacon gives way to the lone final lamp');
runtime.setLastLightPlayback({ started: true, elapsed: 32.5 });
const reloaded = createSourceSpaceRuntime({ initialState: runtime.state() });
reloaded.setPlayerPosition(atMark);
assert.equal(reloaded.outskirtsLastLight().playback.elapsed, 32.5, 'the fixed recording resumes rather than skipping/restarting');
runtime.setLastLightHold(true);
assert.equal(runtime.geometry.canStep(atMark.x, atMark.y, atMark.x, atMark.y + 1).ok, true, 'playback does not introduce an invisible retreat wall');

const savedObservation = { id: 'r2-booth-guard', seen: true, gone: true, epoch: 1, face: null };
const unvisitedReload = createSourceSpaceRuntime({ initialState: { ...built.state, outskirtsExperience: { observed: [savedObservation] } } });
assert.deepEqual(unvisitedReload.state().outskirtsExperience.observed, [savedObservation], 'saving before the first render must retain vanished figures');

const entranceRuntime = createSourceSpaceRuntime({ initialState: built.state });
entranceRuntime.setPlayerPosition(built.position);
for (const [id, points] of [
  ['r0-bus', [[-1.45, -3.15], [-1.10, -3.15], [-.80, -3.15], [-.45, -3.15]]],
  ['r0-van', [[0, 3.1], [0, 2.7], [0, 2.30]]],
]) {
  const p = entranceRuntime.outskirtsPiece(id), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const at = ([x, z]) => ({ x: (p.x + x * c + z * s) / CELL - .5, y: (p.z - x * s + z * c) / CELL - .5 });
  for (let i = 1; i < points.length; i++) {
    const a = at(points[i - 1]), b = at(points[i]);
    assert.equal(entranceRuntime.geometry.canStep(a.x, a.y, b.x, b.y).ok, true, `${id} entrance must follow its visible steps`);
  }
}
console.log('outskirts experience specs passed');
