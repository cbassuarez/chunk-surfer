import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_CONTINUATION as C, CONTINUATION_DROP_LIPS, CONTINUATION_ALTERNATE_LIPS, continuationCatchFloor, continuationSurfaces, continuationSolids, continuationSurfaceY, continuationSupportAt, continuationDropLips, continuationBodyClearAt } from '../src/data/source-continuation.js';
import { freshSourceContinuation, normalizeSourceContinuation, resumeSourceContinuation, stepSourceContinuation, continuationFocus, sourceContinuationFrame, sourceContinuationCanOccupy, sourceContinuationRecoveryPlan, sourceContinuationThreatTelemetry, sourceContinuationDoorFraction } from '../src/game/source-continuation.js';

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

test('a phase crossing consumes no old movement under the new overhead axes or queued time', () => {
  const initial = { ...fresh(), x: -13.19, z: -1, feet: 3, yaw: -Math.PI / 2, doorOpen: { 'wrong-onward': true } };
  const result = stepSourceContinuation(initial, { dt: .25, forward: 1 });
  assert.equal(result.state.phase, 'catch');
  assert.equal(result.events.filter(e => e.type === 'phase').length, 1);
  near(result.state.x, initial.x - C.walkSpeed * C.fixedStep);
  near(result.state.z, initial.z, 1e-12);
  near(result.state.elapsed - initial.elapsed, C.fixedStep);
  assert.equal(result.state.accumulator, 0, 'unconsumed old-axis time is discarded at the physical threshold');
  assert.equal(result.state.reveal.duration, C.revealSeconds); assert.equal(result.state.caption, null);
  const drained = step(result.state, { dt: 0, forward: 1 });
  near(drained.x, result.state.x); near(drained.z, result.state.z); assert.equal(drained.accumulator, 0);
  const released = step(drained, { dt: C.fixedStep });
  near(released.x, drained.x); near(released.z, drained.z);
  let revealed = released;
  while (revealed.reveal) { const before = revealed; revealed = step(revealed, { dt: .05, side: 1, forward: 1, interact: true }); near(revealed.x, before.x); near(revealed.z, before.z); }
  assert.equal(revealed.accumulator, 0);
  const freshInput = step(revealed, { dt: C.fixedStep, side: 1 });
  assert.ok(freshInput.x > revealed.x, 'fresh overhead input is available as soon as the bounded reveal ends'); near(freshInput.z, revealed.z);
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
  for (const z of [-1.05, 0, 1.05]) {
    state = catchAt(5, { x: -25, z });
    for (let i = 0; i < 12; i++) state = step(state, { dt: .1, side: 1 });
    assert.ok(state.x <= -24.21, 'the widened supported footing cannot bypass the actual closed leaf');
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
    assert.equal(state.recovery.repaired, false, 'a normal missed footprint uses the physical sling, never corrupt-save repair');
    assert.ok(state.recovery.duration <= 5, 'ordinary wrong-footprint recovery stays within the usual five-second bound');
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
    [[-20.5, 0], [-20.5, -4.5], [-25, -4.5], [-25, -3.45]],
    [[-25, -2.5], [-29.5, -2.5], [-29.5, 2], [-28.45, 2]],
    [[-27.5, 2], [-27.5, 6.5], [-23, 6.5], [-23, 5.45]],
    [[-23, 4.5], [-27.5, 4.5], [-27.5, 0], [-26.45, 0]],
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
  const seen = new Set(), snapshots = new Map();
  for (let i = 0; i < 130 * 30; i++) {
    const before = state.counterweight; state = step(state, { dt: 1 / 30 }); const w = state.counterweight;
    seen.add(w.mode); if (!snapshots.has(w.mode)) snapshots.set(w.mode, state);
    assert.ok([w.x, w.y, w.z].every(Number.isFinite));
    assert.ok(Math.hypot(w.x - before.x, w.z - before.z, w.y - before.y) < .41, 'the cycle contains no position reset or rubberband');
    if (['warning', 'walking', 'returning', 'rewinding'].includes(w.mode)) assert.ok(continuationSupportAt(w.x, w.z, { phase: 'catch', feet: w.y }), 'weight never walks through a shaft');
    if (['hoisting', 'traversing', 'lowering-warning', 'lowering'].includes(w.mode)) assert.ok(continuationBodyClearAt(w, { radius: C.catch.hoist.drumRadius, height: C.catch.hoist.drumHeight, margin: C.catch.hoist.clearance }), `actual hoop envelope clears every return obstacle during ${w.mode}`);
    assert.equal(state.recovery, null, 'visible refuge stays safe');
  }
  assert.ok(state.counterweight.cycle >= 1, 'a completed descent physically returns and starts again');
  for (const mode of ['warning', 'walking', 'falling', 'returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering']) assert.ok(seen.has(mode), mode);
  for (const saved of snapshots.values()) {
    const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(saved))); assert.deepEqual(reload, saved);
    assert.deepEqual(step(saved, { dt: .25, paused: true, interact: true, forward: 1 }), saved);
    const a = step(saved, { dt: .1 }), b = step(reload, { dt: .1 }); assert.deepEqual(a, b);
  }
  const snapshot = normalizeSourceContinuation(state); assert.deepEqual(step(state, { dt: .25, paused: true }), snapshot);
});

test('Catch uses offset narrow ledges rather than a repeated full shaft plate', () => {
  for (let level = 0; level < C.catch.levels; level++) {
    const c = C.catch.centers[level], rings = continuationSurfaces('catch').filter(s => s.level === level && s.role === 'catch');
    assert.equal(rings.length, 4);
    near(Math.min(...rings.map(s => s.minX)), c.x - 6.3); near(Math.max(...rings.map(s => s.maxX)), c.x + 6.3);
    near(Math.min(...rings.map(s => s.minZ)), c.z - 6.3); near(Math.max(...rings.map(s => s.maxZ)), c.z + 6.3);
    const area = rings.reduce((n, s) => n + (s.maxX - s.minX) * (s.maxZ - s.minZ), 0);
    assert.ok(area < (18 * 18 - 6 * 6) * .45, 'each catch removes over half the old plate footprint');
    assert.equal(continuationSupportAt(c.x, c.z + 1.8, { phase: 'catch', feet: continuationCatchFloor(level) }), null, 'central shaft stays physically open beyond the final finger balcony');
  }
  const tongue = continuationSurfaces('catch').find(s => s.id === 'catch-entry-bridge');
  assert.deepEqual([tongue.minX, tongue.maxX, tongue.minZ, tongue.maxZ], [-20, -3, -2, 0]);
});

test('every catch and final balcony has a physically walked arm to its visible return refuge', () => {
  const approaches = [
    [[-18.5, 0], [-18.5, 4.25], [-27.5, 4.25], [-30.5, 4.25], [-30.5, 7.5]],
    [[-25, -4.5], [-29.5, -4.5], [-29.5, 4.25], [-30.5, 4.25], [-30.5, 7.5]],
    [[-29.5, 2], [-29.5, 6.25], [-30.5, 6.25], [-30.5, 7.5]],
    [[-23, 6.25], [-27.5, 6.25], [-30.5, 6.25], [-30.5, 7.5]],
    [[-27.5, 0], [-27.5, 4.25], [-30.5, 4.25], [-30.5, 7.5]],
    [[-29.5, 0], [-29.5, 4.25], [-30.5, 4.25], [-30.5, 7.5]],
  ];
  for (let level = 0; level < C.catch.levels; level++) {
    let state = catchAt(level, level === 5 ? C.catch.finalApproach : CONTINUATION_DROP_LIPS[level]);
    for (const [x, z] of approaches[level]) state = walk(state, x, z);
    assert.equal(continuationFocus(state)?.id, `catch-return-${level}`);
    assert.equal(state.level, level); near(state.feet, continuationCatchFloor(level));
    assert.ok(continuationSupportAt(state.x, state.z, state));
    assert.equal(stepSourceContinuation(state, { interact: true }).event?.type, 'return');
  }
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
  const priorWidePlate = normalizeSourceContinuation({ ...catchAt(1), counterweight: { ...fresh().counterweight, active: true, x: -16.5, z: -7 } });
  assert.ok(continuationSupportAt(priorWidePlate.counterweight.x, priorWidePlate.counterweight.z, { phase: 'catch', feet: priorWidePlate.counterweight.y }), 'old broad-plate threat positions resume on the same supported catch');
  assert.equal(priorWidePlate.counterweight.mode, 'warning');
});

test('saved reveal has no movement queue, pauses exactly and releases in bounded active time', () => {
  const initial = { ...fresh(), x: -13.19, z: -1, feet: 3, yaw: -Math.PI / 2, doorOpen: { 'wrong-onward': true } };
  let state = step(initial, { dt: .2, forward: 1 });
  assert.ok(state.reveal); const at = { x: state.x, z: state.z };
  state = step(state, { dt: .2, forward: 1, side: 1, interact: true });
  const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(state))); assert.deepEqual(reload, state);
  assert.deepEqual(step(state, { dt: .25, paused: true, interact: true }), state);
  assert.deepEqual(step(state, { dt: .25, renderReady: false, forward: 1 }), state);
  for (let i = 0; i < 10 && state.reveal; i++) state = step(state, { dt: .2, forward: 1, side: 1, interact: true });
  assert.equal(state.reveal, null); near(state.x, at.x); near(state.z, at.z); assert.equal(state.accumulator, 0);
  assert.ok(state.elapsed < C.revealSeconds + .03);
});

test('recovery transports the actual body through clear space with exact saved timing and no dead hold', () => {
  const points = [];
  for (let level = 0; level < 6; level++) {
    const c = C.catch.centers[level];
    for (const [dx, dz] of [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]]) points.push(catchAt(level, { x: c.x + dx, z: c.z + dz }));
  }
  // The last lining overhang is safe to stand under, but a straight rise would
  // cross it: this case must first escape sideways at the original feet level.
  points.push(catchAt(5, { x: -20.9, z: 0 }));
  for (const original of points) {
    assert.ok(continuationBodyClearAt(original, { height: C.bodyHeight }));
    const plan = sourceContinuationRecoveryPlan(original);
    assert.equal(plan.repaired, false); assert.equal(plan.kind, 'sling');
    assert.ok(plan.duration >= C.recoverySeconds && plan.duration <= 8);
    for (let i = 1; i < plan.path.length; i++) {
      const a = plan.path[i - 1], b = plan.path[i], d = Math.hypot(a.x - b.x, a.z - b.z, a.feet - b.feet), count = Math.max(1, Math.ceil(d / .04));
      for (let j = 0; j <= count; j++) { const t = j / count; assert.ok(continuationBodyClearAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t }, { height: C.bodyHeight }), `full body sweep at level ${original.level}`); }
    }
    let state = { ...original, recovery: plan }, first = step(state, { dt: .05, side: 1, interact: true });
    assert.ok(Math.hypot(first.x - state.x, first.z - state.z, first.feet - state.feet) > .01, 'transport begins immediately');
    state = first;
    const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(state))); assert.deepEqual(reload, state);
    assert.deepEqual(step(state, { dt: .25, paused: true, side: 1 }), state);
    assert.deepEqual(step(state, { dt: .25, renderReady: false, side: 1 }), state);
    let steps = 0;
    while (state.recovery && steps++ < 180) state = step(state, { dt: .05, side: 1, interact: true });
    assert.equal(state.recovery, null); assert.ok(steps * .05 < 8.1);
    near(state.x, plan.target.x); near(state.z, plan.target.z); near(state.feet, plan.target.feet);
    assert.ok(continuationSupportAt(state.x, state.z, state)); assert.equal(state.accumulator, 0); assert.equal(state.grace, C.graceSeconds);
  }
  const under = sourceContinuationRecoveryPlan(points.at(-1));
  near(under.path[0].feet, under.path[1].feet); assert.ok(Math.hypot(under.path[0].x - under.path[1].x, under.path[0].z - under.path[1].z) > .1, 'overhead cloth requires a horizontal escape before raising');
});

test('a real drum capture carries once while the physical pursuit continues, retaining knowledge', () => {
  let state = catchAt(0); state.knowledge = ['remembered-door'];
  Object.assign(state.counterweight, { active: true, mode: 'walking', pathIndex: 2, x: -18.55, z: 0, y: 3 });
  let result = stepSourceContinuation(state, { dt: C.fixedStep }); state = result.state;
  assert.equal(result.events.filter(e => e.type === 'capture').length, 1); assert.ok(state.recovery);
  const beforeWeight = { ...state.counterweight }, target = { ...state.recovery.target }; let captures = 1;
  for (let i = 0; i < 220; i++) { result = stepSourceContinuation(state, { dt: .05, ...(state.recovery ? { forward: 1, interact: true } : {}) }); state = result.state; captures += result.events.filter(e => e.type === 'capture').length; }
  assert.equal(captures, 1); assert.equal(state.recovery, null); assert.ok(state.knowledge.includes('remembered-door'));
  assert.equal(state.status, 'active'); near(state.x, target.x); near(state.z, target.z);
  assert.ok(Math.hypot(state.counterweight.x - beforeWeight.x, state.counterweight.z - beforeWeight.z, state.counterweight.y - beforeWeight.y) > 1, 'recovery does not freeze the mechanism');
  assert.ok(!('contact' in state)); assert.ok(!('inventory' in state));
  assert.ok(continuationSupportAt(target.x, target.z, { ...state, feet: target.feet }));
});

test('ordinary waiting cannot permanently exhaust the repeating threat and audit telemetry is honest', () => {
  let state = catchAt(0, C.catch.refuge); state.counterweight.active = true;
  for (let i = 0; i < 2600; i++) state = step(state, { dt: .1 });
  assert.ok(state.counterweight.cycle >= 2); assert.equal(state.counterweight.active, true); assert.notEqual(state.counterweight.mode, 'settled');
  const refuge = sourceContinuationThreatTelemetry(state); assert.equal(refuge.refuge, true); assert.equal(refuge.timeToContact, null);
  const exposed = { ...state, ...CONTINUATION_DROP_LIPS[0], level: 0, feet: 3, recovery: null, reveal: null };
  const before = JSON.stringify(exposed), reach = sourceContinuationThreatTelemetry(exposed, { horizonSeconds: 180 });
  assert.equal(reach.model, 'stationary-authored-route'); assert.equal(reach.refuge, false); assert.ok(reach.timeToContact >= 0 && reach.timeToContact < 180);
  assert.equal(JSON.stringify(exposed), before, 'audit prediction cannot steer or mutate the live pursuit');
  const legacy = normalizeSourceContinuation({ ...state, counterweight: { ...state.counterweight, mode: 'settled', level: 6, x: -25, z: -2.5, y: continuationCatchFloor(6) } });
  assert.equal(legacy.counterweight.mode, 'returning', 'old exhausted saves regain the physical cable return');
});

test('door leaf motion persists on simulation time and reverses continuously at constant speed', () => {
  let state = { ...fresh(), x: -1.7, z: -1, feet: 3, yaw: -Math.PI / 2 };
  assert.equal(continuationFocus(state)?.id, 'wrong-onward');
  state = step(state, { interact: true });
  assert.equal(state.doorOpen['wrong-onward'], true); assert.equal(sourceContinuationDoorFraction(state, 'wrong-onward'), 0);
  state = step(state, { dt: .15 }); const fraction = sourceContinuationDoorFraction(state, 'wrong-onward'); near(fraction, 1 / 3);
  assert.equal(sourceContinuationCanOccupy(-3.2, -1, state), false, 'intent alone cannot make a partly open door passable');
  const paused = step(state, { dt: .25, paused: true, interact: true }); assert.deepEqual(paused, state);
  assert.deepEqual(step(state, { dt: .25, renderReady: false, interact: true }), state);
  const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(state))); assert.deepEqual(reload, state);
  assert.deepEqual(step(state, { dt: .1 }), step(reload, { dt: .1 }));
  state = step(state, { interact: true }); assert.equal(state.doorOpen['wrong-onward'], false);
  near(sourceContinuationDoorFraction(state, 'wrong-onward'), fraction);
  near(state.doorMotion['wrong-onward'].duration, C.doorSwingSeconds * fraction);
  state = step(state, { dt: .05 }); const closing = sourceContinuationDoorFraction(state, 'wrong-onward'); near(closing, fraction - .05 / C.doorSwingSeconds);
  state = step(state, { interact: true }); assert.equal(state.doorOpen['wrong-onward'], true); near(sourceContinuationDoorFraction(state, 'wrong-onward'), closing);
  for (let i = 0; i < 10; i++) state = step(state, { dt: .1 }); near(sourceContinuationDoorFraction(state, 'wrong-onward'), 1);
  const legacy = normalizeSourceContinuation({ ...fresh(), doorOpen: { 'wrong-onward': true } });
  assert.equal(sourceContinuationDoorFraction(legacy, 'wrong-onward'), 1, 'old open booleans load at their old complete angle');
  assert.equal(sourceContinuationDoorFraction(legacy, 'catch-final'), 0);
});

test('final opening is drawn and colliding at the same saved fraction before the physical crossing', () => {
  let state = catchAt(5, { ...C.catch.finalApproach, x: -24.24 });
  state = step(state, { interact: true });
  state = step(state, { dt: .25, side: 1 }); assert.equal(state.completed, false); assert.ok(state.x <= -24.21);
  const drawn = sourceContinuationFrame(state).geometry.doors.find(d => d.id === 'catch-final');
  near(drawn.openFraction, sourceContinuationDoorFraction(state, 'catch-final')); assert.ok(drawn.openFraction < C.doorPassFraction);
  state = step(state, { dt: .1, side: 1 }); assert.equal(state.completed, false); assert.ok(state.x <= -24.21);
  let result = { state, event: null };
  for (let i = 0; i < 20 && result.state.status === 'active'; i++) result = stepSourceContinuation(result.state, { dt: .05, side: 1 });
  assert.equal(result.event?.type, 'complete'); assert.ok(result.state.x > -23.8);
  assert.ok(sourceContinuationDoorFraction(result.state, 'catch-final') >= C.doorPassFraction);
});

test('closing the transfer behind a body on its bridge cannot undo the physical crossing', () => {
  let state = { ...fresh(), x: -4.4, z: -1, feet: 3, yaw: Math.PI / 2, doorOpen: { 'wrong-onward': true } };
  assert.equal(continuationFocus(state)?.id, 'wrong-onward'); state = step(state, { interact: true });
  assert.equal(state.doorOpen['wrong-onward'], false);
  state = walk(state, -14.8, -1); assert.equal(state.phase, 'catch');
  near(sourceContinuationDoorFraction(state, 'wrong-onward'), 0);
});

test('stationary threat prediction expires grace rather than predicting eternal protection', () => {
  const state = catchAt(0); state.grace = .2;
  Object.assign(state.counterweight, { active: true, mode: 'warning', elapsed: 0, x: -18.6, z: 0, y: 3 });
  const snapshot = JSON.stringify(state), immediate = sourceContinuationThreatTelemetry(state, { horizonSeconds: 0 });
  assert.equal(immediate.timeToContact, null);
  const projected = sourceContinuationThreatTelemetry(state, { horizonSeconds: 1 });
  assert.equal(projected.counterfactual, true); assert.match(projected.assumption, /remains.*grace/);
  assert.ok(projected.timeToContact >= .19 && projected.timeToContact < .25);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(sourceContinuationThreatTelemetry({ ...state, grace: 0 }, { horizonSeconds: 0 }).timeToContact, 0);
});
