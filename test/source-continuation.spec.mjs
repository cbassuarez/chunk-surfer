import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_CONTINUATION as C, CONTINUATION_DROP_LIPS, CONTINUATION_ALTERNATE_LIPS, continuationCatchFloor, continuationSurfaces, continuationSolids, continuationSurfaceY, continuationSupportAt, continuationDropLips } from '../src/data/source-continuation.js';
import { freshSourceContinuation, normalizeSourceContinuation, resumeSourceContinuation, stepSourceContinuation, continuationFocus, sourceContinuationFrame, sourceContinuationCanOccupy } from '../src/game/source-continuation.js';

const returnPose = { x: 6.125, y: -305.75, yaw: -.8, pitch: .12, floorH: 15.2, preserved: { source: true } };
const fresh = () => resumeSourceContinuation(freshSourceContinuation({ runId: 'test-run', returnPose }));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const step = (s, input = {}) => stepSourceContinuation(s, input).state;
function walk(state, x, z, { max = 3000 } = {}) {
  for (let i = 0; i < max; i++) {
    const dx = x - state.x, dz = z - state.z, d = Math.hypot(dx, dz);
    if (d < .045) return state;
    const amount = Math.min(1, d / (C.walkSpeed / 60));
    state = step(state, state.phase === 'catch' ? { dt: 1 / 60, side: dx / d * amount, forward: -dz / d * amount } : { dt: 1 / 60, forward: amount, look: { yaw: Math.atan2(dx, -dz) } });
  }
  assert.fail(`Cannot walk to ${x},${z}: at ${state.x},${state.z},feet ${state.feet},phase ${state.phase}`);
}
function finishFall(state) {
  const events = [];
  for (let i = 0; i < 800 && state.fall; i++) {
    const result = stepSourceContinuation(state, { dt: 1 / 60 }); state = result.state; events.push(...result.events);
    assert.ok([state.x, state.z, state.feet].every(Number.isFinite));
  }
  assert.equal(state.fall, null, 'a fall must finish without a hidden input');
  return { state, events };
}
function catchAt(level, point = null) {
  const p = point || CONTINUATION_DROP_LIPS[Math.min(4, level)];
  return { ...fresh(), phase: 'catch', level, x: p.x, z: p.z, feet: continuationCatchFloor(level), grace: 0, lastSafe: { x: -30.5, z: 7.5, feet: continuationCatchFloor(level), level, yaw: 0, pitch: 0 } };
}
function crossFinal(state) {
  const wasCompleted = state.completed;
  let result = stepSourceContinuation(state, { interact: true }); state = result.state;
  assert.equal(result.event.type, 'door'); assert.equal(state.completed, wasCompleted, 'opening alone cannot complete the continuation');
  for (let i = 0; i < 100 && state.status === 'active'; i++) { result = stepSourceContinuation(state, { dt: 1 / 60, side: 1 }); state = result.state; }
  return { state, event: result.event };
}
function wrongWalk() {
  let state = fresh();
  for (const [x, z] of [[0, -2], [-6, -2], [-6, -19], [6, -19], [6, -4], [0, -1], [-1.7, -1]]) state = walk(state, x, z);
  state = step(state, { look: { yaw: -Math.PI / 2 } });
  assert.equal(continuationFocus(state)?.id, 'wrong-onward');
  state = step(state, { interact: true });
  return walk(state, -14.8, -1);
}

test('new local state clones return pose, preserves run scope and contains no Contact state', () => {
  const state = fresh();
  assert.deepEqual(state.returnPose, returnPose); state.returnPose.preserved.source = false;
  assert.equal(returnPose.preserved.source, true);
  assert.equal(normalizeSourceContinuation(state, { runId: 'other' }).status, 'not-started');
  assert.equal(normalizeSourceContinuation(state, { runId: 'other' }).completed, false);
  assert.ok(!('contact' in state)); assert.ok(!('finale' in state));
});

test('pause and render readiness freeze movement, look, interaction, falls and threat clocks', () => {
  let state = catchAt(0); state = step(state, { interact: true });
  const snapshot = normalizeSourceContinuation(state);
  for (const input of [{ paused: true }, { renderReady: false }]) {
    assert.deepEqual(step(state, { ...input, dt: .25, forward: 1, side: 1, interact: true, look: { yaw: 2 } }), snapshot);
  }
  const wrong = fresh(); assert.deepEqual(step(wrong, { paused: true, dt: .25, interact: true, look: { yaw: 2 } }), normalizeSourceContinuation(wrong));
});

test('real two-level Wrong Return route is walked and changes height continuously', () => {
  const state = wrongWalk();
  assert.equal(state.phase, 'catch'); assert.equal(state.level, 0); near(state.feet, 3);
  assert.equal(state.wrongLap, 2); assert.ok(state.knowledge.includes('case-hinge'));
  assert.ok(state.knowledge.includes('upper-return-is-different'));
  assert.ok(state.x < -14.5, 'interacting with a door did not teleport to Catch');
  assert.equal(state.doorOpen['wrong-onward'], true);
});

test('unopened physical transfer and wide unsupported gaps refuse ordinary walking', () => {
  let state = { ...fresh(), x: -2.6, z: -1, feet: 3, yaw: -Math.PI / 2 };
  for (let i = 0; i < 80; i++) state = step(state, { dt: .1, forward: 1 });
  assert.ok(state.x >= -2.89, 'closed door has physical occupancy');
  state = { ...fresh(), x: 0, z: -3.5, feet: 0 };
  for (let i = 0; i < 80; i++) state = step(state, { dt: .1, forward: 1 });
  assert.ok(state.z >= -4.001, 'a wide gap is not an invisible walkable bridge');
  for (let level = 0; level < 5; level++) {
    state = catchAt(level); const before = state.feet;
    const p = CONTINUATION_DROP_LIPS[level];
    for (let i = 0; i < 30; i++) state = step(state, { dt: .1, side: p.dx, forward: -p.dz });
    near(state.feet, before); assert.equal(state.fall, null, 'walking alone cannot blindly fall');
  }
});

test('upper closure is physically local, announced, finite and has a freely reachable refuge', () => {
  let state = { ...fresh(), x: 6, z: -3.8, feet: 3, wrongLap: 1 };
  let result = stepSourceContinuation(state, { dt: .1 }); state = result.state;
  assert.ok(result.events.some(e => e.type === 'closure-warning'));
  assert.equal(state.closure.mode, 'warning');
  for (let i = 0; i < 20; i++) state = step(state, { dt: .1 });
  assert.equal(state.recovery, null, 'at least three seconds precede armed contact');
  for (let i = 0; i < 80 && !state.recovery; i++) state = step(state, { dt: .1 });
  assert.ok(state.recovery);
  const before = [...state.knowledge];
  for (let i = 0; i < 20; i++) state = step(state, { dt: .1 });
  assert.equal(state.recovery, null); assert.ok(state.x < 1); assert.ok(state.grace > 2.5);
  assert.deepEqual(state.knowledge, before);
  const low = { ...fresh(), x: 6, z: -18, feet: 0, closure: { mode: 'closing', elapsed: 10, frontZ: -1 } };
  assert.equal(step(low, { dt: .25 }).recovery, null, 'a front on the upper floor cannot capture below');
});

test('each Catch decision has two equally neutral release prompts and actual lower surfaces', () => {
  for (let level = 0; level < 5; level++) {
    assert.equal(continuationDropLips({ level }).length, 2);
    for (const lip of continuationDropLips({ level })) {
      const state = catchAt(level, lip), focus = continuationFocus(state);
      assert.equal(focus?.id, lip.id); assert.equal(focus.title, 'LOWER YOURSELF FROM THE EDGE');
      assert.ok(continuationSupportAt(state.x, state.z, state), 'release lip is on actual supporting floor');
    }
  }
});

test('all five required drops land physically on the next catch without air correction', () => {
  for (let level = 0; level < 5; level++) {
    const initial = catchAt(level), selected = stepSourceContinuation(initial, { interact: true });
    assert.equal(selected.event.type, 'drop'); assert.equal(selected.state.level, level);
    const { state, events } = finishFall(selected.state);
    assert.equal(state.level, level + 1); assert.equal(state.recovery, null);
    near(state.feet, continuationCatchFloor(level + 1));
    const landed = events.find(e => e.type === 'land'); assert.ok(landed);
    const surface = continuationSurfaces(state).find(s => s.id === landed.surface);
    near(continuationSurfaceY(surface, state.x, state.z), state.feet);
    assert.ok(continuationSupportAt(state.x, state.z, state));
  }
});

test('wrong projected footprints visibly land on loose lining then recover with knowledge intact', () => {
  for (let level = 0; level < 5; level++) {
    let state = catchAt(level, CONTINUATION_ALTERNATE_LIPS[level]); state.knowledge.push('remembered-first-door');
    const result = finishFall(step(state, { interact: true })); state = result.state;
    assert.ok(result.events.some(e => e.type === 'land' && e.surface === `catch-${level}-loose-lining`), `alternate ${level} must hit its actual lower cloth`);
    assert.ok(state.recovery, `alternate ${level} must have finite recovery`);
    for (let i = 0; i < 100 && state.recovery; i++) state = step(state, { dt: .05 });
    assert.equal(state.recovery, null); assert.equal(state.level, level); near(state.feet, continuationCatchFloor(level));
    assert.ok(state.knowledge.includes('remembered-first-door')); assert.ok(state.knowledge.includes(`missed-footprint-${level}`));
    assert.ok(state.grace > 2.5); assert.ok(continuationSupportAt(state.x, state.z, state));
  }
});

test('catch input uses world axes and overhead camera remains exactly vertical through falls', () => {
  let state = catchAt(0, { x: -17, z: -6 }); state.yaw = 2.8;
  state = step(state, { dt: .1, forward: 1, look: { yaw: -2 } }); near(state.x, -17); assert.ok(state.z < -6);
  near(state.yaw, 2.8);
  state = step(catchAt(0), { interact: true });
  for (let i = 0; i < 120 && state.fall; i++) {
    const f = sourceContinuationFrame(state); near(f.camera.pitch, -Math.PI / 2); near(f.camera.eye[1] - f.player.y, 14);
    assert.deepEqual(f.camera.up, [0, 0, -1]); state = step(state, { dt: 1 / 60 });
  }
});

test('a full taught route requires actual walks between catches and reaches the offset final balcony', () => {
  let state = wrongWalk(); state = walk(state, -17, -1); state = walk(state, -19.55, 0);
  const approaches = [
    [[-17, 0], [-17, -7], [-25, -7], [-25, -3.45]],
    [[-25, -7], [-30.5, -7], [-30.5, 2], [-28.45, 2]],
    [[-30.5, 2], [-30.5, 7.5], [-23, 7.5], [-23, 5.45]],
    [[-23, 7.5], [-30.5, 7.5], [-30.5, 0], [-26.45, 0]],
  ];
  for (let level = 0; level < 5; level++) {
    assert.equal(continuationFocus(state)?.id, CONTINUATION_DROP_LIPS[level].id);
    state = finishFall(step(state, { interact: true })).state;
    if (level < 4) for (const [x, z] of approaches[level]) state = walk(state, x, z);
  }
  assert.equal(state.level, 5); assert.equal(continuationFocus(state)?.id, 'catch-final');
  const done = crossFinal(state);
  assert.equal(done.event.type, 'complete'); assert.equal(done.state.completed, true); assert.equal(done.state.status, 'completed');
  assert.equal(stepSourceContinuation(done.state, { interact: true }).event, null);
  assert.ok(state.elapsed > 30, 'not a sequence of station teleports');
});

test('counterweight occupies physical supported routes, warns and freezes on pause', () => {
  let state = catchAt(1, { x: -30.5, z: 7.5 }); state.counterweight.active = true;
  for (let i = 0; i < 10000 && state.counterweight.mode !== 'settled'; i++) {
    state = step(state, { dt: 1 / 60 }); const w = state.counterweight;
    assert.ok([w.x, w.y, w.z].every(Number.isFinite));
    if (!w.fall) assert.ok(continuationSupportAt(w.x, w.z, { phase: 'catch', feet: w.y }), 'weight never walks through a shaft');
    assert.equal(state.recovery, null, 'visible refuge stays safe');
  }
  assert.equal(state.counterweight.mode, 'settled', 'stress the complete physical descent, including its last lip');
  assert.equal(state.counterweight.level, 6);
  const snapshot = normalizeSourceContinuation(state); assert.deepEqual(step(state, { dt: .25, paused: true }), snapshot);
});

test('save/reload midfall and fixed-step partition preserve trajectory and threat', () => {
  let state = step(catchAt(0), { interact: true });
  for (let i = 0; i < 9; i++) state = step(state, { dt: .05 });
  const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(state)), { runId: 'test-run' });
  assert.deepEqual(reload, state);
  let a = state, b = reload;
  for (let i = 0; i < 12; i++) a = step(a, { dt: .1 });
  for (let i = 0; i < 24; i++) b = step(b, { dt: .05 });
  near(a.x, b.x); near(a.z, b.z); near(a.feet, b.feet); near(a.elapsed, b.elapsed);
  assert.deepEqual(a.counterweight, b.counterweight);
});

test('visible return preserves progress and reverse reentry starts at the real final balcony', () => {
  let state = catchAt(3, C.catch.refuge); state.knowledge = ['case-hinge', 'catch-3']; state.doorOpen['wrong-onward'] = true;
  const returned = stepSourceContinuation(state, { interact: true }); assert.equal(returned.event.type, 'return');
  assert.equal(returned.state.status, 'returned');
  const resumed = resumeSourceContinuation(returned.state); near(resumed.x, state.x); near(resumed.feet, state.feet); assert.deepEqual(resumed.knowledge, state.knowledge);
  const completed = crossFinal({ ...catchAt(5, C.catch.finalApproach), ...C.catch.finalApproach }).state;
  completed.handoff = true; completed.exitReceipt.delivered = true;
  const reverse = resumeSourceContinuation(completed, { reverse: true });
  assert.equal(reverse.completed, true); assert.equal(reverse.handoff, true); assert.equal(reverse.exitReceipt.delivered, true);
  near(reverse.x, C.catch.finalApproach.x); near(reverse.feet, -15); assert.equal(reverse.status, 'active');
  // An already open leaf remains open on reverse entry; walk the real plane again.
  let again = { state: reverse, event: null };
  for (let i = 0; i < 100 && again.state.status === 'active'; i++) again = stepSourceContinuation(again.state, { dt: 1 / 60, side: 1 });
  assert.equal(again.event.firstCompletion, false); assert.equal(again.event.receipt, completed.exitReceipt.id);
});

test('malformed saves recover to actual support while finite falling checkpoints stay exact', () => {
  const state = normalizeSourceContinuation({ ...fresh(), x: NaN, z: 200, feet: Infinity });
  assert.ok(continuationSupportAt(state.x, state.z, state));
  const badCatch = normalizeSourceContinuation({ ...catchAt(2), x: -23, z: 2 });
  assert.ok(continuationSupportAt(badCatch.x, badCatch.z, badCatch));
  const fall = step(catchAt(0), { interact: true }); assert.deepEqual(normalizeSourceContinuation(fall).fall, fall.fall);
  const inWall = normalizeSourceContinuation({ ...fresh(), x: -9.1, z: -10, feet: 0 });
  assert.ok(sourceContinuationCanOccupy(inWall.x, inWall.z, inWall), 'wall intersections recover to safe supported space');
  const exitPose = { x: 2.25, y: -900.125, yaw: .75, pitch: -.1, floorH: 15.2 };
  assert.deepEqual(normalizeSourceContinuation({ ...fresh(), exitPose }).exitPose, exitPose);
  assert.equal(normalizeSourceContinuation({ ...fresh(), exitPose: { x: 1, y: Infinity } }).exitPose, null);
});
