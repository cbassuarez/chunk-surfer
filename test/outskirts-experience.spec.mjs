import assert from 'node:assert/strict';
import { createOutskirtsExperience } from '../src/game/outskirts-experience.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeChunkSurfState } from '../src/game/chunk-surf-state.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { OUTSKIRT_LAST_MARK, OUTSKIRT_STRETCH_START, OUTSKIRT_STRETCH_METRES } from '../src/data/source-outskirts-arrival.js';

const experience = createOutskirtsExperience();
const position = { x: 4, z: 20 };
// The retained legacy encounter remains available to older exterior bus uses.
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

// The one interior crossing has separate physical milestones. Opening the
// entrance cannot spend the encounter with the woman at the rear of the aisle.
const transit = createOutskirtsExperience();
transit.tickCharacters(.25);
transit.busTransit({ active: true, visible: true, entryNear: false, inside: false,
  closeWoman: false, exited: false, entryPosition: position, position });
assert.equal(transit.busStage(), 1);
transit.busTransit({ active: true, visible: false, entryNear: true, inside: false,
  closeWoman: true, exited: true, entryPosition: position, position });
assert.equal(transit.busStage(), 2);
assert.equal(transit.busTransitState().entered, false);
assert.equal(transit.busTransitState().close, false, 'proximity outside the side skin spends the rear encounter');
assert.equal(transit.busTransitState().exited, false, 'the exit can be completed without boarding');
assert.deepEqual(transit.events().map(e => e.id), ['outskirts-bus:arrival-air', 'outskirts-bus:entry-open']);
transit.tickCharacters(.25);
transit.busTransit({ active: true, visible: false, entryNear: false, inside: true,
  closeWoman: false, exited: false, entryPosition: position, position });
assert.equal(transit.busStage(), 3);
const aboardTransit = transit.busTransitState();
const transitReload = createOutskirtsExperience(JSON.parse(JSON.stringify(transit.snapshot())));
assert.deepEqual(transitReload.busTransitState(), aboardTransit, 'reload restarts the physical door/boarding clock');
transitReload.busTransit({ active: true, inside: false, closeWoman: false, exited: false,
  entryPosition: position, position });
assert.equal(transitReload.busStage(), 3, 'retreat resets boarding or closes the entrance');
transitReload.tickCharacters(.25);
transitReload.busTransit({ active: true, inside: true, closeWoman: true, exited: false,
  entryPosition: position, position });
assert.equal(transitReload.busTransitState().close, true);
transitReload.busTransit({ active: true, inside: false, closeWoman: false, exited: true,
  entryPosition: position, position });
assert.equal(transitReload.busStage(), 4);
assert.deepEqual(transitReload.events().map(e => e.id), ['outskirts-bus:rear-cloth','outskirts-bus:woman-notice','outskirts-bus:woman-pass','outskirts-bus:rear-step']);
const completedTransit = transitReload.busTransitState();
transitReload.busTransit({ active: true, inside: true, closeWoman: true, exited: true,
  entryPosition: position, position });
assert.deepEqual(transitReload.busTransitState(), completedTransit);
assert.deepEqual(transitReload.events(), [], 'walking back through repeats the interior cues');
const legacyCompleted = createOutskirtsExperience({ busStage: 3 });
legacyCompleted.busTransit({ active: true, entryNear: true, inside: true, closeWoman: true, exited: true,
  entryPosition: position, position });
assert.deepEqual(legacyCompleted.events(), [], 'legacy completed bus encounters replay as new interior scares');

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
assert.equal(runtime.geometry.canStep(atMark.x, atMark.y, atMark.x, atMark.y + 1).ok, true,
  'the retreat step is open before playback owns movement');
runtime.setLastLightHold(true);
assert.deepEqual(runtime.geometry.canStep(atMark.x, atMark.y, atMark.x, atMark.y + 1),
  { ok: false, why: 'last-light recording' }, 'the authored recording holds movement only during playback');
runtime.setLastLightOut(true);
assert.equal(runtime.geometry.canStep(atMark.x, atMark.y, atMark.x, atMark.y + 1).ok, true,
  'completion releases the same retreat step even before the presentation clears its hold');
runtime.setLastLightHold(false);
assert.equal(runtime.geometry.canStep(atMark.x, atMark.y, atMark.x, atMark.y + 1).ok, true,
  'the finished recording leaves no retreat wall');

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
