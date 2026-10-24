import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COASTAL_MEMORY_KIND, COASTAL_MEMORY_VERSION, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_CUE,
  COASTAL_MEMORY_SECONDS, COASTAL_MEMORY_LISTEN_SECONDS,
  freshCoastalMemory, normalizeCoastalMemory, beginCoastalMemory, setCoastalMemoryPose,
  stepCoastalMemory, coastalMemoryFrame, requestCoastalReturn, acknowledgeCoastalReturn,
  acknowledgeCoastalRecording, consumeCoastalReward,
  coastalWreckSight,
} from '../src/game/coastal-memory.js';

const layout = {
  spawn: { x: -20, z: 42, feet: 28, yaw: -.4, pitch: -.07 },
  musicBox: { x: 27, y: 28.8, z: 43 }, note: { x: 27.4, z: 43 },
  pierReturnPlane: { point: { x: 10, z: 79 }, normal: { x: 0, z: 1 }, halfWidth: 4.5 },
  supportAt: (x, z) => Math.abs(x) <= 40 && z >= 30 && z <= 100 ? 28 + .002 * (z - 42) : null,
  canOccupy: (x, z) => !(x >= 1 && x <= 2 && z >= 45 && z <= 46),
  returnFadeSeconds: .9,
};
const returnPose = { x: 42.6123456789012, y: -4201.8123456789, facing: .37, yaw: .4123,
  pitch: -.1634, floorH: 15.2, eyeHeight: 1.72, checkpoint: { id: 'door-before-entry', value: .123456789 } };
const options = { layout, runId: 'run-coast', entryDoorId: 'optional-coast-door', returnPose };
const begin = () => beginCoastalMemory(null, options);
const reload = state => normalizeCoastalMemory(JSON.parse(JSON.stringify(state)), { layout, runId: options.runId });
const boxPose = { x: 27, z: 43, feet: 28, yaw: 1.7, pitch: -.6 };
const atBox = state => setCoastalMemoryPose(state, boxPose, { layout });
const monitor = (state, seconds, extra = {}) => stepCoastalMemory(state, { dt: .1, recorderHeld: true,
  audioRunning: true, sourceReady: true, audibleSeconds: seconds, recordingOffset: 4.2, ...extra }, { layout });
function cover(state) {
  for (let n = 0; n < 4; n++) state = stepCoastalMemory(state, { dt: .25 }, { layout }).state;
  return state;
}
function finishPier(state = begin()) {
  state = setCoastalMemoryPose(state, { x: 10, z: 78, yaw: 2.2, pitch: -.15 }, { layout });
  state = stepCoastalMemory(state, { dt: .1 }, { layout }).state;
  const result = stepCoastalMemory(state, { dt: .1, pose: { x: 10, z: 80 } }, { layout });
  assert.equal(result.state.status, 'return-pending');
  assert.deepEqual(result.events.map(event => event.type), ['coastal-return-requested']);
  const covered = cover(result.state);
  return acknowledgeCoastalReturn(covered, covered.returnReceipt.id, { layout });
}

test('a new coast uses separate source identity and retains an exact copied Source pose', () => {
  const saved = structuredClone(returnPose), input = structuredClone(returnPose);
  const state = beginCoastalMemory(null, { ...options, returnPose: input });
  assert.equal(state.kind, COASTAL_MEMORY_KIND); assert.equal(state.version, COASTAL_MEMORY_VERSION);
  assert.equal(state.status, 'active'); assert.equal(state.visit, 1);
  assert.deepEqual(state.pose, layout.spawn); assert.deepEqual(state.returnPose, saved);
  input.x = 0; input.checkpoint.value = 99;
  assert.deepEqual(state.returnPose, saved);
  assert.deepEqual(normalizeCoastalMemory(state, { ...options, returnPose: { x: 0, y: 0 } }).returnPose, saved);
  assert.deepEqual(beginCoastalMemory(state, { ...options, returnPose: { x: 0, y: 0 }, entryDoorId: 'different-door' }).returnPose, saved);
  assert.deepEqual(reload(state).returnPose, saved);
  assert.equal(reload(state).entryDoorId, 'optional-coast-door');
  assert.equal(normalizeCoastalMemory(state, { ...options, entryDoorId: 'different-door' }).entryDoorId, 'optional-coast-door');
  assert.equal(beginCoastalMemory(null, { layout }), null);
  assert.throws(() => freshCoastalMemory(), /authored spawn/);
});

test('legacy completion, wrong versions and other runs cannot become a heard coast', () => {
  for (const old of [
    { version: 2, completed: true, rewardEarned: true, recordingHeard: true },
    { ...begin(), version: COASTAL_MEMORY_VERSION + 1, listenedSeconds: 9, completed: true },
    { ...begin(), runId: 'another-run', listenedSeconds: 9, completed: true },
  ]) {
    const state = normalizeCoastalMemory(old, options);
    assert.equal(state.active, false); assert.equal(state.recordingHeard, false);
    assert.equal(state.rewardEarned, false); assert.equal(state.recordingReceipt, null);
  }
  const state = reload({ ...begin(), completed: true, recordingHeard: true, rewardEarned: true });
  assert.equal(state.completed, false); assert.equal(state.recordingHeard, false); assert.equal(state.rewardEarned, false);
});

test('walking preserves deliberate gaze, uses authored support and rejects unsupported or occupied poses', () => {
  const state = begin(), next = setCoastalMemoryPose(state, { x: 24, z: 48, feet: 0, yaw: 2.3, pitch: -.8 }, { layout });
  assert.deepEqual(next.pose, { x: 24, z: 48, feet: 28.012, yaw: 2.3, pitch: -.8 });
  assert.deepEqual(next.sampledPose, state.sampledPose);
  for (const pose of [{ x: 80, z: 48 }, { x: 1.5, z: 45.5 }, { x: NaN, z: 48 }])
    assert.deepEqual(setCoastalMemoryPose(next, pose, { layout }).pose, next.pose);
  assert.deepEqual(state.pose, layout.spawn);
});

test('the anonymous note is independent of recording, progression and the return', () => {
  let result = stepCoastalMemory(begin(), { dt: .1, inspectNote: true }, { layout });
  assert.equal(result.state.noteRead, false);
  result = stepCoastalMemory(atBox(result.state), { dt: .1, inspectNote: true }, { layout });
  assert.equal(result.state.noteRead, true); assert.deepEqual(result.events, [{ type: 'coastal-note-read' }]);
  assert.equal(result.state.listenedSeconds, 0); assert.equal(result.state.recordingReceipt, null);
  result = stepCoastalMemory(reload(result.state), { dt: .1, inspectNote: true }, { layout });
  assert.equal(result.events.length, 0);
  assert.equal(finishPier(begin()).completed, true);
});

test('only audible running monitor evidence at the box earns the new receipt', () => {
  const state = atBox(begin());
  for (const input of [
    { recorderHeld: false }, { sourceReady: false }, { audioRunning: false },
    { sourceReady: undefined }, { audioRunning: undefined }, { audibleSeconds: undefined },
    { audibleSeconds: -10 },
  ]) assert.equal(monitor(state, 9, input).state.listenedSeconds, 0);
  assert.equal(monitor(begin(), 9).state.listenedSeconds, 0);
  let result = monitor(state, 4.5);
  assert.equal(result.state.recordingHeard, false); assert.equal(result.state.recordingReceipt, null);
  result = monitor(reload(result.state), 4.499);
  assert.equal(result.state.recordingHeard, false);
  result = monitor(result.state, .001);
  assert.equal(result.state.listenedSeconds, COASTAL_MEMORY_LISTEN_SECONDS);
  assert.equal(result.state.recordingHeard, true);
  assert.deepEqual(result.state.recordingReceipt, { id: 'run-coast:coastal-memory:musicbox',
    takeId: COASTAL_MEMORY_TAKE, cueId: COASTAL_MEMORY_CUE, durationSeconds: COASTAL_MEMORY_SECONDS, delivered: false });
  assert.equal(result.events[0].type, 'coastal-recording-heard');
  assert.equal(result.state.completed, false); assert.equal(result.state.rewardEarned, false);
  assert.equal(monitor(result.state, 14).events.length, 0);
  assert.equal(reload(result.state).recordingHeard, true);
});

test('monitor flushes may report real audio with dt zero; simulation time never stands in for audio', () => {
  let state = atBox(begin());
  for (let n = 0; n < 80; n++) state = stepCoastalMemory(state, { dt: .25, recorderHeld: true,
    sourceReady: true, audioRunning: true }, { layout }).state;
  assert.equal(state.listenedSeconds, 0);
  const result = monitor(state, 9, { dt: 0, recordingOffset: 31.25 });
  assert.equal(result.state.elapsed, state.elapsed); assert.equal(result.state.recordingHeard, true);
  assert.equal(result.state.recordingOffset, 3.25);
});

test('the unmonitored physical musicbox phase persists without earning listening credit', () => {
  const result = monitor(begin(), 8, { recorderHeld: false, recordingOffset: 19.4 });
  assert.equal(result.state.listenedSeconds, 0); assert.equal(result.state.recordingHeard, false);
  assert.ok(Math.abs(result.state.recordingOffset - 5.4) < 1e-8);
  assert.equal(reload(result.state).recordingOffset, result.state.recordingOffset);
  assert.equal(monitor(begin(), 0, { sourceReady: false, recordingOffset: 10 }).state.recordingOffset, 0);
});

test('pause, hidden, interrupted and unavailable rendering freeze actions, audio, movement and the cover', () => {
  for (const flag of [{ paused: true }, { hidden: true }, { interrupted: true }, { renderReady: false }]) {
    const state = atBox(begin());
    const result = stepCoastalMemory(state, { dt: .25, pose: { x: 10, z: 80 }, inspectNote: true,
      recorderHeld: true, audioRunning: true, sourceReady: true, audibleSeconds: 9, ...flag }, { layout });
    assert.deepEqual(result.state, reload(state)); assert.equal(result.events.length, 0);
    const returning = requestCoastalReturn(state, { layout });
    assert.equal(stepCoastalMemory(returning, { dt: .25, ...flag }, { layout }).state.returnElapsed, 0);
  }
});

test('the finite directed descent plane returns without note or listening gates', () => {
  let state = begin();
  // Crossing the infinite extension cannot trigger a return beyond the path.
  state = stepCoastalMemory(state, { pose: { x: 30, z: 80 } }, { layout }).state;
  assert.equal(state.status, 'active');
  // Reverse travel does not trigger the forward-facing threshold.
  state = stepCoastalMemory(state, { pose: { x: 10, z: 80 } }, { layout }).state;
  state = stepCoastalMemory(state, { pose: { x: 10, z: 78 } }, { layout }).state;
  assert.equal(state.status, 'active');
  const result = stepCoastalMemory(state, { pose: { x: 10, z: 80 } }, { layout });
  assert.equal(result.state.status, 'return-pending'); assert.equal(result.frame.returnCover, 0);
  assert.equal(result.state.noteRead, false); assert.equal(result.state.recordingHeard, false);
  assert.equal(result.frame.controlOwner, 'covered-return');
});

test('return remains durable and unacknowledgeable until covered; acknowledgement is one-shot', () => {
  let state = requestCoastalReturn(begin(), { layout, reason: 'pier' });
  const id = state.returnReceipt.id;
  assert.equal(acknowledgeCoastalReturn(state, id, { layout }), null);
  state = stepCoastalMemory(state, { dt: .25 }, { layout }).state;
  state = reload(state);
  assert.equal(state.returnElapsed, .25); assert.equal(state.status, 'return-pending');
  const result = stepCoastalMemory(cover(state), { dt: .25 }, { layout });
  assert.equal(result.frame.returnReady, true); assert.equal(result.frame.returnCover, 1);
  assert.equal(result.events.length, 0); assert.equal(acknowledgeCoastalReturn(result.state, 'wrong', { layout }), null);
  state = acknowledgeCoastalReturn(result.state, id, { layout });
  assert.equal(state.status, 'returned'); assert.equal(state.active, false); assert.equal(state.completed, true);
  assert.equal(state.rewardEarned, false); assert.deepEqual(state.returnPose, returnPose);
  assert.equal(acknowledgeCoastalReturn(reload(state), id, { layout }), null);
  assert.equal(beginCoastalMemory(state, options), null);
});

test('the full-cover ready event emits once and reload does not restart the fade', () => {
  let state = requestCoastalReturn(begin(), { layout, reason: 'pier' }), events = [];
  for (let n = 0; n < 5; n++) {
    const result = stepCoastalMemory(reload(state), { dt: .25 }, { layout });
    state = result.state; events.push(...result.events);
  }
  assert.deepEqual(events, [{ type: 'coastal-return-ready', receipt: state.returnReceipt.id }]);
  assert.equal(state.returnElapsed, layout.returnFadeSeconds);
});

test('retreat restores its Source pose; a new visit recaptures current body and door without inventing completion', () => {
  let state = monitor(atBox(begin()), 4.5).state;
  const partialOffset = state.recordingOffset;
  state = requestCoastalReturn(state, { layout, reason: 'retreat' });
  const firstId = state.returnReceipt.id;
  state = cover(state); state = acknowledgeCoastalReturn(state, firstId, { layout });
  assert.equal(state.completed, false); assert.equal(state.rewardEarned, false);
  const reentryPose = { ...returnPose, x: 1.8912345678, y: -4302.1287654321, yaw: -1.3, pitch: .2 };
  state = beginCoastalMemory(reload(state), { ...options, returnPose: reentryPose, entryDoorId: 'second-coastal-door' });
  assert.equal(state.visit, 2); assert.equal(state.listenedSeconds, 4.5);
  assert.deepEqual(state.returnPose, reentryPose); assert.equal(state.entryDoorId, 'second-coastal-door');
  assert.equal(state.recordingOffset, partialOffset); assert.deepEqual(state.pose, layout.spawn);
  state = requestCoastalReturn(state, { layout, reason: 'pier' });
  assert.notEqual(state.returnReceipt.id, firstId);
  assert.equal(acknowledgeCoastalReturn(cover(state), firstId, { layout }), null);
});

test('new entry after retreat preserves the committed musicbox receipt, note and phase while recapturing only Source ownership', () => {
  let state = monitor(atBox(begin()), 9).state;
  state = stepCoastalMemory(state, { dt: 0, inspectNote: true }, { layout }).state;
  state = acknowledgeCoastalRecording(state, state.recordingReceipt.id, { layout });
  const receipt = structuredClone(state.recordingReceipt), heardOffset = state.recordingOffset;
  state = requestCoastalReturn(state, { layout, reason: 'retreat' });
  state = acknowledgeCoastalReturn(cover(state), state.returnReceipt.id, { layout });
  assert.equal(state.completed, false); assert.equal(state.rewardEarned, false);
  const nextPose = { ...returnPose, x: 90.123456789, y: -4100.987654321, yaw: 2.7, pitch: -.9 };
  state = beginCoastalMemory(reload(state), { ...options, returnPose: nextPose, entryDoorId: 'current-entry-door' });
  assert.deepEqual(state.returnPose, nextPose); assert.equal(state.entryDoorId, 'current-entry-door');
  assert.deepEqual(state.recordingReceipt, receipt); assert.equal(state.recordingOffset, heardOffset);
  assert.equal(state.recordingHeard, true); assert.equal(state.noteRead, true); assert.equal(state.returnReceipt, null);
  assert.equal(state.completed, false); assert.equal(state.rewardEarned, false);
  const cannotRecapture = beginCoastalMemory(state, { ...options, returnPose, entryDoorId: 'old-door' });
  assert.deepEqual(cannotRecapture.returnPose, nextPose); assert.equal(cannotRecapture.entryDoorId, 'current-entry-door');
});

test('recording and reward receipts commit independently, persist and cannot overwrite another take', () => {
  let state = monitor(atBox(begin()), 9).state;
  const receipt = state.recordingReceipt;
  assert.notEqual(receipt.takeId, 'tower-personal-recording'); assert.notEqual(receipt.cueId, 'tower.personal.take');
  assert.equal(acknowledgeCoastalRecording(state, 'tower-personal-recording', { layout }), null);
  state = acknowledgeCoastalRecording(state, receipt.id, { layout });
  assert.equal(reload(state).recordingReceipt.delivered, true);
  assert.equal(acknowledgeCoastalRecording(state, receipt.id, { layout }), null);
  assert.equal(consumeCoastalReward(state, { layout }), null);
  state = finishPier(state);
  assert.equal(state.rewardEarned, true); assert.equal(state.rewardConsumed, false);
  state = consumeCoastalReward(reload(state), { layout });
  assert.equal(state.rewardConsumed, true); assert.equal(reload(state).rewardConsumed, true);
  assert.equal(consumeCoastalReward(state, { layout }), null);
});

test('derived frames are copies and do not change persisted state or seize exploration gaze', () => {
  const state = atBox(begin()), saved = structuredClone(state), frame = coastalMemoryFrame(state, { layout });
  assert.equal(frame.controlOwner, 'player'); assert.equal(frame.canListen, true);
  assert.equal(frame.canInspectNote, true); assert.equal(frame.localPose.yaw, 1.7); assert.equal(frame.localPose.pitch, -.6);
  frame.localPose.yaw = 0; frame.returnPose.x = 0; frame.source.x = 0;
  assert.deepEqual(state, saved);
});

test('submerged lights wait for a real unobstructed glance, rise over time and persist without a reward', () => {
  const plan = { ...layout, wreckTarget: [27, 10, 0] };
  const at = { x: 27, z: 43, feet: 28, yaw: 0, pitch: Math.atan2(10 - 29.62, 43) };
  const visiblePlan = { ...plan, supportAt: (x, z) => z > 40 ? 28 : null };
  assert.equal(coastalWreckSight(at, plan), false, 'bank blocks an otherwise aligned eye');
  assert.equal(coastalWreckSight(at, visiblePlan), true);
  assert.equal(coastalWreckSight({ ...at, yaw: Math.PI }, visiblePlan), false);
  let state = beginCoastalMemory(null, { layout: visiblePlan, runId: 'wreck-glance', returnPose });
  state = setCoastalMemoryPose(state, at, { layout: visiblePlan });
  let result = stepCoastalMemory(state, { dt: .1 }, { layout: visiblePlan });
  assert.deepEqual(result.events, [{ type: 'coastal-wreck-noticed' }]);
  assert.equal(result.frame.wreckLightLevel, 0); assert.equal(result.state.rewardEarned, false);
  state = result.state;
  for (let n = 0; n < 6; n++) state = stepCoastalMemory(state, { dt: .25 }, { layout: visiblePlan }).state;
  assert.equal(coastalMemoryFrame(state, { layout: visiblePlan }).wreckLightLevel, 1);
  assert.equal(normalizeCoastalMemory(JSON.parse(JSON.stringify(state)), { layout: visiblePlan }).wreckLightsElapsed, 1.4);
  const paused = stepCoastalMemory({ ...state, wreckLightsElapsed: .5 }, { dt: .25, paused: true }, { layout: visiblePlan });
  assert.equal(paused.state.wreckLightsElapsed, .5); assert.equal(paused.events.length, 0);
});

test('recognition rejects actual stone footprints even when the bank height ray is clear', () => {
  const pose = { x: 0, z: 0, feet: 0, yaw: 0, pitch: 0 }, plan = { ...layout, wreckTarget: [0, 1.62, -10], supportAt: () => null };
  assert.equal(coastalWreckSight(pose, plan), true);
  const stone = { x: 0, z: -5, groundY: 0, height: 2, visibilityHeight: 2.1, footprint: [[-.5, -5.5], [.5, -5.5], [.5, -4.5], [-.5, -4.5]] };
  assert.equal(coastalWreckSight(pose, { ...plan, barriers: [stone] }), false);
  assert.equal(coastalWreckSight(pose, { ...plan, barriers: [{ ...stone, groundY: -3 }] }), true, 'a genuinely lower outcrop does not block the eye');
  assert.equal(coastalWreckSight(pose, { ...plan, barriers: [{ x: 0, z: -5, groundY: 0, height: 2, radius: .6 }] }), false, 'inland bedrock also blocks');
});

test('the authored coast supports box-side listening and its actual descent return without old pocket gates', async () => {
  const { COASTAL_MEMORY_LAYOUT: coast } = await import('../src/data/coastal-memory.js');
  const { walkCoastalMemoryPose } = await import('../src/game/coastal-memory-scene.js');
  const own = { layout: coast, runId: 'actual-coast', returnPose };
  let state = beginCoastalMemory(null, own);
  assert.ok(coast.canOccupy(state.pose.x, state.pose.z, state.pose.feet));
  // This proves the box-to-descent circuit, not the host's full spawn approach.
  const approach = { x: coast.musicBox.x - 1.1, z: coast.musicBox.z };
  approach.feet = coast.supportAt(approach.x, approach.z).height;
  state = setCoastalMemoryPose(state, approach, own);
  let frame = coastalMemoryFrame(state, own);
  assert.equal(frame.canListen, true); assert.equal(frame.canInspectNote, true);
  state = stepCoastalMemory(state, { dt: .1, inspectNote: true }, own).state;
  assert.equal(state.noteRead, true); assert.equal(state.recordingHeard, false);
  const route = [[25.9, 41.6], ...coast.coastalPath.slice(1)];
  let returnAt = null;
  for (const [x, z] of route) {
    let ticks = 0;
    while (Math.hypot(x - state.pose.x, z - state.pose.z) > .08 && ticks++ < 2400) {
      const facing = { ...state.pose, yaw: Math.atan2(x - state.pose.x, -(z - state.pose.z)) };
      const pose = walkCoastalMemoryPose(facing, { dt: .025, forward: 1 }, coast);
      const result = stepCoastalMemory(state, { dt: .025, pose }, own); state = result.state;
      assert.ok(Math.abs(state.pose.x - pose.x) < 1e-8 && Math.abs(state.pose.z - pose.z) < 1e-8);
      if (state.status === 'return-pending') { returnAt = { ...state.pose }; break; }
    }
    assert.ok(returnAt || ticks < 2400, `swept controls reach ${x},${z}`);
    if (returnAt) break;
  }
  assert.ok(returnAt); assert.ok(returnAt.z > coast.pierReturnPlane.point.z && returnAt.z < coast.pierReturnPlane.point.z + .3);
  assert.equal(state.recordingHeard, false); assert.equal(state.rewardEarned, false);
  assert.deepEqual(state.returnPose, returnPose);
});

test('actual inland and rim routes both cross the finite descent without hidden box gates', async () => {
  const { COASTAL_MEMORY_LAYOUT: coast } = await import('../src/data/coastal-memory.js');
  const p = coast.pierReturnPlane.point, n = coast.pierReturnPlane.normal;
  for (const x of [-34, 13]) {
    const z = p.z - (x - p.x) * n.x / n.z;
    const before = { x, z: z - .3 }, after = { x, z: z + .3 };
    before.feet = coast.supportAt(before.x, before.z).height;
    after.feet = coast.supportAt(after.x, after.z).height;
    assert.ok(coast.canOccupy(before.x, before.z, before.feet));
    assert.ok(coast.canOccupy(after.x, after.z, after.feet));
    let state = beginCoastalMemory(null, { layout: coast, runId: 'bank-' + x, returnPose });
    state = setCoastalMemoryPose(state, before, { layout: coast });
    state = stepCoastalMemory(state, { dt: 0 }, { layout: coast }).state;
    const result = stepCoastalMemory(state, { dt: .1, pose: after }, { layout: coast });
    assert.equal(result.state.status, 'return-pending', `directed ${x < 0 ? 'inland' : 'rim'} approach`);
    assert.equal(result.state.recordingHeard, false); assert.equal(result.state.noteRead, false);
    assert.equal(result.state.rewardEarned, false); assert.deepEqual(result.state.returnPose, returnPose);
  }
});

test('the canonical sunken van is occluded from the box and visible from supported rim viewpoints', async () => {
  const { COASTAL_MEMORY_LAYOUT: coast } = await import('../src/data/coastal-memory.js');
  const m = coast.settledBodyLocal, target = [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2];
  for (const [x, z, expected] of [[25.9, 43, false], [33, 42, false], [35, 44, false], [35, 43, true], [34.6, 42.5, true]]) {
    const feet = coast.supportAt(x, z).height, dx = target[0] - x, dz = target[2] - z;
    const pose = { x, z, feet, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(target[1] - feet - 1.62, Math.hypot(dx, dz)) };
    assert.ok(coast.canOccupy(x, z, feet)); assert.equal(coastalWreckSight(pose, coast), expected);
  }
});
