import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_EARTHFALL as C, SOURCE_EARTHFALL_MATERIAL_CELL, sourceEarthfallCellLayout, earthfallContains, earthfallCatchHeight, earthfallCatchVelocity, earthfallExitDoorHeight, sourceEarthfallFracturePose, sourceEarthfallReleasePlan, sourceEarthfallReleaseAt, sourceEarthfallControlledDrop } from '../src/data/source-earthfall.js';
import { freshSourceEarthfall, normalizeSourceEarthfall, stepSourceEarthfall, sourceEarthfallFrame, sourceEarthfallSupportAt, sourceEarthfallFocus } from '../src/game/source-earthfall.js';

const copy = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const fresh = () => freshSourceEarthfall({ runId: 'earthfall-test', returnPose: { x: 7, y: -919, yaw: .3, preserved: ['original-field'] } });
const step = (state, input = {}) => stepSourceEarthfall(state, input).state;
function advance(state, seconds, input = {}, quantum = C.fixedStep) {
  const events = [];
  for (let time = 0; time + 1e-9 < seconds;) {
    const dt = Math.min(quantum, seconds - time), result = stepSourceEarthfall(state, { ...input, dt });
    state = result.state; events.push(...result.events); time += dt;
  }
  return { state, events };
}
function committed() {
  let state = fresh();
  for (let n = 0; n < 120 && !state.committed; n++) state = step(state, { dt: C.fixedStep, forward: 1 });
  assert.equal(state.committed, true);
  return state;
}
function landed() {
  const result = advance(committed(), 10);
  assert.equal(result.state.phase, 'landed');
  return result.state;
}
function walk(state, x, z, limit = 5000) {
  const events = [];
  for (let n = 0; n < limit; n++) {
    const dx = x - state.x, dz = z - state.z, distance = Math.hypot(dx, dz);
    if (distance < .04 || state.status !== 'active') return { state, events };
    const result = stepSourceEarthfall(state, { dt: C.fixedStep, forward: Math.min(1, distance / (C.walkSpeed * C.fixedStep)), look: { yaw: Math.atan2(dx, -dz) } });
    state = result.state; events.push(...result.events);
  }
  assert.fail(`Could not walk to(${x},${z}), at(${state.x},${state.z}), ${state.phase}`);
}

test('the local threshold is exactly100m high with a42m route and one physical catch covering the whole upper sheet', () => {
  const state = fresh(), frame = sourceEarthfallFrame(state);
  assert.equal(C.upperFloor - C.lowerFloor, 100);
  assert.equal(C.passage.entryZ - C.passage.exitZ, 42);
  assert.equal(C.earth.maxX - C.earth.minX, 160); assert.equal(C.earth.maxZ - C.earth.minZ, 130);
  assert.deepEqual({ x: state.x, z: state.z, feet: state.feet }, { x: 0, z: -1.7, feet: 100 });
  for (const x of [-79.7, 0, 79.7]) for (const z of [-99.7, -20, 29.7]) {
    assert.ok(earthfallContains(C.catch, x, z));
    assert.equal(sourceEarthfallSupportAt(x, z, state)?.y, 100);
    assert.equal(frame.geometry.catchSurface.y, 12);
  }
  assert.equal(frame.entryDoor.y, 100); assert.equal(frame.exitDoor.y, 100); assert.equal(frame.exitDoor.locked, true);
  assert.equal(sourceEarthfallSupportAt(81, 0, state), null);
});

test('waiting, looking, a door interaction, restored pose and rejected motion cannot arm the event', () => {
  for (const input of [{}, { look: { yaw: 1.2, pitch: -.8 } }, { interact: true }]) {
    const result = advance(fresh(), 4, input);
    assert.equal(result.state.committed, false); assert.equal(result.state.feet, 100);
    assert.ok(result.events.every(event => event.type === 'door'));
  }
  const warped = normalizeSourceEarthfall({ ...fresh(), z: -9 });
  assert.equal(advance(warped, 1, { forward: 1 }).state.committed, false, 'being beyond the threshold on load is not a crossing');
  const rejected = advance(fresh(), 1, { forward: 1, acceptedStep: false });
  assert.equal(rejected.state.z, C.spawn.z); assert.equal(rejected.state.committed, false); assert.deepEqual(rejected.events, []);
});

test('walking around the14m route strip cannot bypass a collapse of the whole physical earth', () => {
  let state = advance(fresh(), 3, { side: 1 }).state;
  near(state.x, 9.6); assert.equal(state.committed, false); near(state.z, -1.7);
  state = advance(state, 1, { forward: 1 }).state;
  assert.equal(state.committed, true, 'an accepted outward crossing on the actual earth arms even outside the narrow visual route');
  assert.equal(state.receipts.filter(event => event.type === 'strain').length, 1);
  state = advance(state, 3, { side: -1 }).state;
  assert.equal(state.phase, 'falling'); assert.ok(state.feet < 100);
  assert.equal(state.receipts.filter(event => event.type === 'strain').length, 1);
});

test('the accepted outward body step beyond2.4m receipts the omen once and stopping cannot cancel its collapse', () => {
  let state = committed();
  assert.ok(state.z <= -2.4 && state.z > -2.43);
  assert.deepEqual(state.receipts.map(event => event.type), ['strain']);
  const result = advance(state, 3.1); state = result.state;
  assert.equal(state.phase, 'falling'); assert.ok(state.feet < 100); assert.ok(state.feet > 99);
  assert.deepEqual(state.receipts.map(event => event.type), ['strain', 'fracture', 'footing-loss']);
  assert.deepEqual(result.events.map(event => event.type), ['fracture', 'footing-loss']);
  assert.equal(new Set(state.receipts.map(event => event.id)).size, 3);
  assert.equal(advance(state, .1).events.length, 0);
});

test('upper ground stays freely walkable until support is lost and the existing entry remains a physical retreat', () => {
  let state = committed();
  const moved = advance(state, .3, { side: 1 });
  assert.ok(moved.state.x > .9); assert.equal(moved.state.feet, 100); assert.equal(moved.state.phase, 'fracturing');
  state = advance(state, 1.2, { forward: -1 }).state;
  assert.equal(state.status, 'returned'); assert.equal(state.feet, 100); assert.equal(state.committed, true);
  assert.deepEqual(state.returnPose, fresh().returnPose);
  const frozen = step(state, { dt: .25, forward: 1 }); assert.deepEqual(frozen, normalizeSourceEarthfall(state));
  const resumed = advance({ ...state, status: 'active' }, 3.1);
  assert.equal(resumed.state.phase, 'falling'); assert.equal(resumed.state.receipts.filter(event => event.type === 'strain').length, 1);
});

test('pause, recording protection and unavailable rendering freeze pose, doors, fall and cue clocks', () => {
  const falling = advance(committed(), 4).state;
  assert.equal(falling.phase, 'falling');
  for (const state of [fresh(), committed(), falling, landed()]) for (const guard of [{ paused: true }, { protected: true }, { assetsReady: false }, { renderReady: false }]) {
    const before = normalizeSourceEarthfall(state);
    const result = stepSourceEarthfall(state, { ...guard, dt: 99, forward: 1, side: 1, look: { yaw: 2 }, interact: true });
    assert.deepEqual(result.state, before); assert.deepEqual(result.events, []); assert.equal(result.saveDue, false);
  }
  const capped = step(fresh(), { dt: 90, side: 1 });
  near(capped.clock, .25); near(capped.x, C.walkSpeed * .25);
});

test('the full100m descent belongs to body coordinates and lands through a visible compressing folio with no air snap', () => {
  let state = committed(), lastY = 100, catchStart = null, lowest = 100, downwardDistance = 0;
  const events = [];
  for (let n = 0; n < 1800 && state.phase !== 'landed'; n++) {
    const old = state, result = stepSourceEarthfall(state, { dt: C.fixedStep }); state = result.state; events.push(...result.events);
    const frame = sourceEarthfallFrame(state);
    assert.ok(state.feet <= lastY + 1e-8); assert.ok(state.feet >= -1e-8);
    assert.ok(old.feet - state.feet <= C.terminalSpeed * C.fixedStep + 1e-7, 'no vertical teleport hidden at an intercept or landing');
    downwardDistance += old.feet - state.feet; lowest = Math.min(lowest, state.feet); lastY = state.feet;
    assert.equal(frame.player.y, state.feet);
    if (state.phase === 'catching') {
      catchStart ??= copy(state);
      near(frame.catchSurfaceY, state.feet); near(frame.geometry.catchSurface.y, state.feet);
      near(sourceEarthfallSupportAt(state.x, state.z, state).y, state.feet);
    }
  }
  assert.equal(state.phase, 'landed'); near(lowest, 0); near(downwardDistance, 100);
  assert.ok(catchStart); near(catchStart.feet, 12); near(catchStart.catchVelocity, -26);
  near(state.velocityY, 0); assert.equal(state.x, 0);
  assert.deepEqual(events.map(event => event.type), ['fracture', 'footing-loss', 'catch', 'land']);
  assert.equal(state.receipts.find(event => event.type === 'catch').position.y, 12);
  assert.equal(state.receipts.find(event => event.type === 'land').position.y, 0);
});

test('the catch curve meets falling velocity, stays monotone and never overshoots its real lower support', () => {
  for (const velocity of [-26, -20, -8, 0]) {
    near(earthfallCatchHeight(0, velocity), 12); near(earthfallCatchVelocity(0, velocity), velocity);
    near(earthfallCatchHeight(1.2, velocity), 0); near(earthfallCatchVelocity(1.2, velocity), 0);
    let previous = 12;
    for (let n = 0; n <= 1200; n++) {
      const t = n / 1000, y = earthfallCatchHeight(t, velocity), v = earthfallCatchVelocity(t, velocity);
      assert.ok(y >= -1e-8 && y <= previous + 1e-8); assert.ok(v <= 1e-7); previous = y;
    }
  }
});

test('air control remains in real metres without snapping to the narrow lower-path strip', () => {
  let state = advance(committed(), 3.1).state;
  state = { ...state, x: 8 };
  const before = { x: state.x, z: state.z };
  state = advance(state, 1, { side: 1 }).state;
  near(state.x, before.x + C.airSpeed); near(state.z, before.z);
  assert.ok(state.x > C.passage.halfWidth); assert.equal(state.phase, 'falling');
  assert.ok(earthfallContains(C.catch, state.x, state.z));
});

test('all four upper edges and corners have visible catch support beyond a full outward airborne drift', () => {
  const stations = [
    [79.7, -20, 1, 0], [-79.7, -20, -1, 0], [20, -99.7, 0, 1], [20, 29.7, 0, -1],
    [79.7, -99.7, 1, 1], [-79.7, -99.7, -1, 1], [79.7, 29.7, 1, -1], [-79.7, 29.7, -1, -1],
  ];
  for (const [x, z, side, forward] of stations) {
    const initial = committed();
    let state = { ...initial, x, z, elapsed: 2.99, clock: initial.committedAt + 2.99 };
    for (let n = 0; n < 900 && state.phase !== 'landed'; n++) state = step(state, { dt: 1 / 60, side, forward });
    assert.equal(state.phase, 'landed', `outward drift from(${x},${z}) must finish on actual support`);
    assert.equal(state.feet, 0); assert.equal(state.velocityY, 0);
    assert.ok(!earthfallContains(C.earth, state.x, state.z), 'the body drifted beyond the old upper edge without an air clamp');
    const frame = sourceEarthfallFrame(state), support = sourceEarthfallSupportAt(state.x, state.z, state);
    assert.equal(support?.y, 0); assert.ok(earthfallContains(frame.geometry.catchSurface, state.x, state.z));
    assert.ok(earthfallContains(frame.geometry.lowerApron, state.x, state.z));
    const before = { x: state.x, z: state.z };
    state = advance(state, .5, { side: -side, forward: -forward }).state;
    assert.ok(Math.hypot(state.x - before.x, state.z - before.z) > 1.5, 'the lower support permits walking back from its broad apron');
    assert.equal(sourceEarthfallSupportAt(state.x, state.z, state)?.y, 0);
  }
});

test('fixed-step partitions and serialized midfall/midcatch checkpoints preserve trajectory and do not replay attacks', () => {
  const initial = committed(), a = advance(initial, 7.9, {}, 1 / 60), b = advance(initial, 7.9, {}, .1);
  near(a.state.feet, b.state.feet); near(a.state.velocityY, b.state.velocityY); near(a.state.clock, b.state.clock);
  assert.equal(a.state.phase, b.state.phase); assert.deepEqual(a.state.receipts, b.state.receipts);
  for (const age of [4, 7.9]) {
    const current = advance(initial, age).state;
    assert.ok(['falling', 'catching'].includes(current.phase));
    const reloaded = normalizeSourceEarthfall(copy(current)); assert.deepEqual(reloaded, current);
    const original = advance(current, .1), resumed = advance(reloaded, .1);
    assert.deepEqual(resumed, original); assert.equal(resumed.events.length, 0);
    assert.ok(sourceEarthfallFrame(resumed.state).events.every(event => event.age > 0));
  }
});

test('the lower door must open for.8s and then be crossed by the body; interaction and off-axis crossing cannot hand off', () => {
  let state = landed();
  state = walk(state, 0, -40.6).state;
  assert.equal(sourceEarthfallFocus(state)?.id, 'source-earthfall-exit');
  const blocked = advance(state, 1, { forward: 1 }); assert.ok(blocked.state.z > -42); assert.equal(blocked.state.status, 'active');
  let result = stepSourceEarthfall(blocked.state, { interact: true }); state = result.state;
  assert.equal(result.event.type, 'door'); assert.equal(state.status, 'active'); assert.equal(sourceEarthfallFrame(state).exitDoor.passable, false);
  state = advance(state, .79).state; assert.equal(sourceEarthfallFrame(state).exitDoor.passable, false);
  state = advance(state, .01).state; assert.equal(sourceEarthfallFrame(state).exitDoor.passable, true);
  assert.equal(state.status, 'active', 'opening a leaf does not move the body or dispatch Source II');
  const jamb = advance({ ...state, x: 1.4, z: -41.99 }, .1, { forward: 1 });
  assert.ok(jamb.state.z > -42, 'open doorjamb retains capsule clearance'); assert.equal(jamb.state.status, 'active');
  const aside = advance({ ...state, x: 4, z: -41.99 }, .1, { forward: 1 });
  assert.ok(aside.state.z < -42); assert.equal(aside.state.status, 'active', 'walking beside a semantic door does not complete it');
  result = stepSourceEarthfall(state, { dt: .1, forward: 1 }); state = result.state;
  assert.equal(state.status, 'completed'); assert.equal(result.event.type, 'enter-source-II');
  assert.equal(result.event.receipt, state.exitReceipt.id); assert.ok(state.z <= -42);
  const frozen = stepSourceEarthfall(copy(state), { dt: 2, interact: true, forward: -1 });
  assert.deepEqual(frozen.state, normalizeSourceEarthfall(state)); assert.deepEqual(frozen.events, []);
});

test('one far door initially completes the upper corridor, descends continuously and stays locked until the body has settled', () => {
  for (const elapsed of [0, 2.99, C.footingLossAt]) near(earthfallExitDoorHeight(elapsed), 100);
  let previous = 100;
  for (let index = 0; index <= 600; index++) {
    const elapsed = C.footingLossAt + index / 120, height = earthfallExitDoorHeight(elapsed);
    assert.ok(height >= 0 && height <= previous + 1e-8);
    assert.ok(previous - height < .5, 'the door descends continuously rather than jumping to its lower anchor');
    previous = height;
  }
  assert.equal(previous, 0);
  let state = advance(committed(), 7).state;
  assert.equal(state.phase, 'falling'); assert.ok(state.feet > C.catch.interceptY);
  let frame = sourceEarthfallFrame(state);
  assert.equal(frame.exitDoor.y, 0); assert.equal(frame.exitDoor.locked, true);
  assert.equal(frame.anchors.exit.y, frame.exitDoor.y + 1.2);
  while (state.phase !== 'catching' || state.catchElapsed < 1.15) state = step(state, { dt: C.fixedStep });
  state = { ...state, x: 0, z: -40.6 };
  const held = stepSourceEarthfall(state, { interact: true });
  assert.equal(sourceEarthfallFocus(state).locked, true); assert.deepEqual(held.events, []); assert.equal(held.state.exitDoor.open, false);
  state = advance(state, .1).state; assert.equal(state.phase, 'landed'); frame = sourceEarthfallFrame(state);
  assert.equal(frame.exitDoor.y, 0); assert.equal(frame.exitDoor.locked, false);
  assert.equal(stepSourceEarthfall(state, { interact: true }).event.type, 'door');
  for (const elapsed of [.5, 3.1, 3.7, 5, 7, 10]) {
    const value = { ...committed(), phase: elapsed < 3 ? 'fracturing' : 'falling', elapsed, clock: elapsed + .225 };
    const view = sourceEarthfallFrame(value);
    assert.equal(view.anchors.exit.y, view.exitDoor.y + 1.2);
    assert.equal(view.exitDoor.y, earthfallExitDoorHeight(elapsed));
  }
});

test('run-scoped normalization rejects another run, remains idempotent and never adopts host resources or Source II state', () => {
  const state = landed(), sourceII = { phase: 'wrong-return', wrongLap: 1, knowledge: ['seam'], returnPose: { x: 2, y: -9 } };
  const host = { ...copy(state), sourceContinuation: copy(sourceII), health: 7, battery: .3, injuries: 1, inventory: ['recorder'], take: ['original'] }, before = copy(host);
  const cloned = normalizeSourceEarthfall(copy(state)); assert.deepEqual(normalizeSourceEarthfall(cloned), cloned);
  assert.deepEqual(normalizeSourceEarthfall(state, { runId: 'another-run' }), freshSourceEarthfall({ runId: 'another-run', returnPose: state.returnPose }));
  const isolated = advance(host, 1).state; assert.deepEqual(host, before);
  for (const key of ['health', 'battery', 'injuries', 'inventory', 'sourceContinuation', 'finale', 'contact']) assert.equal(key in state, false);
  for (const key of ['health', 'battery', 'injuries', 'inventory', 'sourceContinuation']) assert.equal(key in isolated, false);
  const malformed = normalizeSourceEarthfall({ ...state, feet: NaN, x: Infinity, z: -Infinity, velocityY: Infinity, receipts: [...state.receipts, state.receipts[0]] });
  assert.ok([malformed.x, malformed.z, malformed.feet, malformed.velocityY].every(Number.isFinite));
  assert.equal(new Set(malformed.receipts.map(event => event.id)).size, malformed.receipts.length);
});

test('deterministic fracture pieces retain the supported upper plane until release and depart only after footing loss', () => {
  const center = { x: 9, y: 100, z: -23 };
  for (let index = 0; index < 20; index++) {
    const held = sourceEarthfallFracturePose(index, 2.9, center);
    assert.equal(held.x, center.x); assert.equal(held.y, center.y); assert.equal(held.z, center.z);
    near(held.pitch, 0); near(held.roll, 0); assert.equal(held.support, true);
    const lost = sourceEarthfallFracturePose(index, 4, center);
    assert.equal(lost.support, false); assert.ok(lost.y < center.y);
    assert.deepEqual(sourceEarthfallFracturePose(index, 4, center), lost);
    assert.ok(Object.values(lost).every(value => typeof value === 'boolean' || Number.isFinite(value)));
  }
});

test('the moving material source belongs to one exact shared earth cell and stays independent of the listener', () => {
  const cells = sourceEarthfallCellLayout(); assert.equal(cells.length, 120);
  assert.ok(cells.includes(SOURCE_EARTHFALL_MATERIAL_CELL)); assert.equal(SOURCE_EARTHFALL_MATERIAL_CELL.index, 78);
  near(SOURCE_EARTHFALL_MATERIAL_CELL.center.x, 5.989854680436358); near(SOURCE_EARTHFALL_MATERIAL_CELL.center.z, -15.599118912300328);
  const state = advance(committed(), 4).state, expected = sourceEarthfallFracturePose(78, state.elapsed, SOURCE_EARTHFALL_MATERIAL_CELL.center);
  const frame = sourceEarthfallFrame(state), turned = sourceEarthfallFrame({ ...state, x: 9, z: -9, yaw: 2.1 });
  assert.deepEqual(frame.anchors.fallingMaterial, { x: expected.x, y: expected.y, z: expected.z });
  assert.deepEqual(turned.anchors.fallingMaterial, frame.anchors.fallingMaterial);
  assert.ok(frame.anchors.fallingMaterial.y < 100); assert.ok(frame.anchors.fallingMaterial.y > state.feet - 20);
});

// Transform shared top vertices independently of the render-mesh payload.
// Opposite inward hinges may open a tapered three-dimensional joint, rather
// than the outward translation that the earlier burst treatment required.
function fractureTopPoint(cell, point, elapsed) {
  const pose = sourceEarthfallFracturePose(cell.index, elapsed, cell.center);
  const x = point[0] - cell.center.x, z = point[2] - cell.center.z;
  const c = Math.cos(pose.roll), d = Math.sin(pose.roll), a = Math.cos(pose.pitch), b = Math.sin(pose.pitch);
  const u = c * x + d * b * z, v = d * x - c * b * z, w = a * z;
  return [pose.x + Math.cos(pose.yaw) * u + Math.sin(pose.yaw) * w, pose.y + v,
    pose.z - Math.sin(pose.yaw) * u + Math.cos(pose.yaw) * w];
}

test('released earth separates below the falling body while outer bearings open a real central slot', () => {
  const body = advance(committed(), C.footingLossAt + .75).state;
  assert.equal(body.phase, 'falling');
  for (const cell of sourceEarthfallCellLayout()) {
    const pose = sourceEarthfallFracturePose(cell.index, body.elapsed, cell.center);
    assert.ok(body.feet - pose.y > 3, `cell ${cell.index} must depart rather than cofall directly beneath the body`);
  }
  const [a, b] = [sourceEarthfallCellLayout()[77], sourceEarthfallCellLayout()[78]];
  const shared = a.points.filter(p => b.points.some(q => p.every((v, axis) => v === q[axis])));
  assert.equal(shared.length, 2, 'the comparison starts from one exact shared physical seam');
  for (const elapsed of [C.footingLossAt, C.footingLossAt + .3, C.footingLossAt + .6]) {
    const gaps = shared.map(point => {
      const left = fractureTopPoint(a, point, elapsed), right = fractureTopPoint(b, point, elapsed);
      return Math.hypot(...left.map((value, axis) => value - right[axis]));
    });
    if (elapsed === C.footingLossAt) gaps.forEach(gap => near(gap, 0));
    else {
      assert.ok(Math.min(...gaps) > .08, 'the shared seam must actually separate in space');
      assert.ok(Math.max(...gaps) > .3 * ((elapsed - C.footingLossAt) / .3), 'one hinge end must open a legible wedge');
      const pa = sourceEarthfallFracturePose(a.index, elapsed, a.center), pb = sourceEarthfallFracturePose(b.index, elapsed, b.center);
      assert.ok(pa.x < a.center.x && pb.x > b.center.x, 'the inner edges must recede toward the actual outer bearings');
    }
  }
  const highestCentralVertex = Math.max(...b.points.map(point => fractureTopPoint(b, point, body.elapsed)[1]));
  assert.ok(body.feet - highestCentralVertex > 3, 'actual rotated material must leave a visible void below the body');
});

test('support cuts initiate in a legible centre-out order while weight remains held, then the actual release follows that order', () => {
  const cells = sourceEarthfallCellLayout(), bands = new Map();
  for (const cell of cells) {
    const plan = sourceEarthfallReleasePlan(cell.index, cell.center);
    assert.equal(sourceEarthfallReleaseAt(cell.index, cell.center), plan.releaseAt);
    assert.ok(plan.initiationAt >= C.fractureAt && plan.initiationAt < C.footingLossAt);
    assert.ok(plan.releaseAt >= C.footingLossAt && plan.releaseAt <= C.footingLossAt + .1 + 1e-8);
    bands.set(plan.band, plan);
    for (const elapsed of [0, plan.initiationAt, 2.99, C.footingLossAt]) {
      const pose = sourceEarthfallFracturePose(cell.index, elapsed, cell.center);
      near(pose.x, cell.center.x); near(pose.y, 100); near(pose.z, cell.center.z);
      near(pose.pitch, 0); near(pose.roll, 0); near(pose.yaw, 0);
    }
    if (Math.abs(cell.center.x) < C.passage.halfWidth) near(plan.releaseAt, C.footingLossAt);
    near(sourceEarthfallFracturePose(cell.index, plan.releaseAt, cell.center).y, 100);
    assert.ok(sourceEarthfallFracturePose(cell.index, plan.releaseAt + .01, cell.center).y < 100);
  }
  assert.equal(bands.size, 6);
  for (let band = 1; band < bands.size; band++) {
    assert.ok(bands.get(band).initiationAt > bands.get(band - 1).initiationAt);
    assert.ok(bands.get(band).releaseAt > bands.get(band - 1).releaseAt);
  }
  const at = C.footingLossAt + .05;
  assert.ok(sourceEarthfallFracturePose(78, at, cells[78].center).y < 100);
  near(sourceEarthfallFracturePose(0, at, cells[0].center).y, 100);
});

test('controlled fragments rotate about actual outer bearings under dominant gravity without a lateral blast or indefinite spinning', () => {
  for (const cell of sourceEarthfallCellLayout()) {
    const plan = sourceEarthfallReleasePlan(cell.index, cell.center);
    let previous = sourceEarthfallFracturePose(cell.index, plan.releaseAt, cell.center);
    for (let tick = 1; tick <= 240; tick++) {
      const age = tick / 120, pose = sourceEarthfallFracturePose(cell.index, plan.releaseAt + age, cell.center);
      const horizontal = Math.hypot(pose.x - cell.center.x, pose.z - cell.center.z), drop = 100 - pose.y;
      assert.ok(pose.y <= previous.y && pose.y <= 100);
      assert.ok(horizontal < drop * .8, 'vertical descent must dominate the bounded hinge orbit');
      assert.ok(horizontal < 12, 'the hinge must not translate a fragment beyond its own local support span');
      const west = cell.center.x < 0, edge = west ? [cell.points[0], cell.points[3]] : [cell.points[1], cell.points[2]];
      const materialDrop = sourceEarthfallControlledDrop(plan.releaseAt + age, plan.releaseAt, 180, plan.departureSpeed);
      for (const bearing of edge) {
        const actual = fractureTopPoint(cell, bearing, plan.releaseAt + age);
        near(actual[0], bearing[0]); near(actual[2], bearing[2]); near(actual[1], 100 - materialDrop);
      }
      const late = sourceEarthfallFracturePose(cell.index, 100, cell.center);
      assert.ok(Math.abs(pose.roll) <= Math.abs(late.roll) + 1e-8);
      previous = pose;
    }
    const settled = sourceEarthfallFracturePose(cell.index, 100, cell.center);
    assert.deepEqual(sourceEarthfallFracturePose(cell.index, 200, cell.center), settled, 'motion must reach a finite pose rather than keep tumbling');
    const secondDifference = sourceEarthfallControlledDrop(plan.releaseAt + .8, plan.releaseAt, 180, plan.departureSpeed)
      - 2 * sourceEarthfallControlledDrop(plan.releaseAt + .7, plan.releaseAt, 180, plan.departureSpeed)
      + sourceEarthfallControlledDrop(plan.releaseAt + .6, plan.releaseAt, 180, plan.departureSpeed);
    near(secondDifference, C.gravity * .1 ** 2);
  }
  near(sourceEarthfallControlledDrop(C.footingLossAt), 0);
  near(sourceEarthfallControlledDrop(C.footingLossAt + 100), 180);
});
