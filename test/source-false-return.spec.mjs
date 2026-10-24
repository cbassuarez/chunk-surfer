import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSERVATORY_DOORS, DOOR_BY_ID, doorDefinitionWithArchetype } from '../src/data/conservatory-doors.js';
import { freshSourceContinuation } from '../src/game/source-continuation.js';
import { freshSourceFalseReturn, normalizeSourceFalseReturn, sourceFalseReturnNeeded,
  stepSourceFalseReturn, sourceFalseReturnFocus, sourceFalseReturnDoorFraction,
  sourceFalseReturnDoorAllowsWidth } from '../src/game/source-false-return.js';

const counted = ['practice-west-1', 'practice-east-1', 'practice-west-2', 'practice-east-2', 'practice-west-3'];
const spawn = { x: 0, z: 2, feet: 4.8, yaw: 0, pitch: 0 };
const returnPose = { x: 6.125, y: -305.75, yaw: -.8, pitch: .12, retained: { original: true } };
// The controller fixture separates the five canonical assemblies spatially.
// Actual plan/model reachability is owned by source-false-return-layout tests.
function fixture() {
  const bounds = { minX: -3, maxX: 20, minZ: -4, maxZ: 5 };
  return { spawn, bounds,
    doors: [...counted.map((id, i) => ({ id, x: i * 4, z: 0, feet: 4.8,
      width: 1.2, normal: { x: 0, z: 1 }, counted: true, openSeconds: .45 })),
    { id: 'practice-side', x: -1.5, z: 3, feet: 4.8, width: 1.2, normal: { x: 0, z: 1 }, entry: true, openInitial: true },
    { id: 'upper-bridge-east', x: 19, z: 0, feet: 4.8, width: 1.2, normal: { x: 0, z: 1 } }],
    supportAt: (x, z) => x >= -3 && x <= 20 && z >= -4 && z <= 5 ? { floor: 4.8, ceil: 7.8 } : null,
    canOccupy: () => true,
    loops: [{ id: 'chapel-end', bounds: { minX: 17, maxX: 18, minZ: 3, maxZ: 4 }, arrival: spawn, feet: 4.8 }] };
}
const fresh = () => freshSourceFalseReturn({ runId: 'false-run', returnPose, spawn });
const tick = (state, input = {}, layout = fixture()) => stepSourceFalseReturn(state, input, layout);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function atDoor(state, index, z = 1.2) { return { ...state, x: index * 4, z, feet: 4.8, yaw: 0, lastSafe: { ...spawn, x: index * 4, z } }; }
function openDoor(state, index) {
  state = atDoor(state, index);
  const r = tick(state, { interact: true });
  assert.equal(r.events[0]?.type, 'door');
  return tick(r.state, { dt: .45 }).state;
}
function fiveOpen() { let state = fresh(); for (let i = 0; i < 5; i++) state = openDoor(state, i); return state; }

test('the five identities are actual unique Ellery assemblies, with independent local state', () => {
  assert.equal(new Set(counted).size, 5);
  for (const id of [...counted, 'practice-side']) assert.ok(CONSERVATORY_DOORS.some(d => d.id === id), id);
  const state = fresh();
  state.returnPose.retained.original = false;
  assert.equal(returnPose.retained.original, true);
  assert.ok(!('contact' in state)); assert.ok(!('inventory' in state)); assert.ok(!('finale' in state));
  const wrong = normalizeSourceFalseReturn({ ...state, opened: counted }, { runId: 'other', spawn });
  assert.equal(wrong.runId, 'other'); assert.deepEqual(wrong.opened, []);
  assert.equal(wrong.returnPose, null, 'a different run cannot inherit the borrowed original body');
  assert.deepEqual(normalizeSourceFalseReturn({ ...state, version: 9 }, { spawn }).opened, []);
});

test('only the untouched forward entrance receives this insertion; existing journeys stay intact', () => {
  const continuation = freshSourceContinuation({ runId: 'false-run', returnPose });
  assert.equal(sourceFalseReturnNeeded(null, continuation), true);
  for (const changed of [{ elapsed: 1 }, { phase: 'catch' }, { knowledge: ['seam'] }, { wrongLap: 1 }, { completed: true }, { direction: 'reverse' }])
    assert.equal(sourceFalseReturnNeeded(null, { ...continuation, ...changed }), false);
  assert.equal(sourceFalseReturnNeeded(null, continuation, 'reverse'), false);
  for (const status of ['active', 'returned', 'completed'])
    assert.equal(sourceFalseReturnNeeded(null, continuation, 'forward', { earthfall: { status } }), false);
  assert.equal(sourceFalseReturnNeeded(fresh(), continuation, 'forward', { earthfall: { status: 'active' } }), true);
  assert.equal(sourceFalseReturnNeeded({ ...fiveOpen(), status: 'completed' }, continuation), false);
});

test('E starts a real saved swing; unique opening counts only when physically passable', () => {
  let state = atDoor(fresh(), 0), r = tick(state, { interact: true }); state = r.state;
  assert.deepEqual(state.opened, []); near(sourceFalseReturnDoorFraction(state, counted[0]), 0);
  state = tick(state, { dt: .38 }).state;
  assert.deepEqual(state.opened, []);
  state = tick(state, { dt: .01 }).state;
  assert.deepEqual(state.opened, [counted[0]]);
  state = tick(state, { dt: .2 }).state;
  state = tick(state, { interact: true }).state; state = tick(state, { dt: .45 }).state;
  state = tick(state, { interact: true }).state; state = tick(state, { dt: .45 }).state;
  assert.deepEqual(state.opened, [counted[0]], 'reopening the same assembly cannot count leaves or repeats');
  assert.equal(state.status, 'active'); assert.equal(state.exitReceipt, null);
});

test('fifth door is source-bound during its swing; opening does not itself leave Ellery', () => {
  let state = fresh(); for (let i = 0; i < 4; i++) state = openDoor(state, i);
  assert.equal(state.opened.length, 4); assert.deepEqual(state.sourceDoors, []);
  state = atDoor(state, 4); let r = tick(state, { interact: true }); state = r.state;
  assert.deepEqual(state.sourceDoors, [counted[4]]); assert.equal(state.opened.length, 4);
  state = tick(state, { dt: .45 }).state;
  assert.equal(state.opened.length, 5); assert.equal(state.status, 'active'); assert.equal(state.exitReceipt, null);
  r = tick(state, { dt: .7, forward: 1 });
  assert.equal(r.state.status, 'completed'); assert.equal(r.events.filter(e => e.type === 'complete').length, 1);
  assert.equal(r.state.exitReceipt.doorId, counted[4]); assert.equal(r.state.exitReceipt.delivered, false);
  assert.ok(r.state.z > -.06 && r.state.z <= 0, 'remaining movement stops at the doorway crossing');
  assert.deepEqual(tick(r.state, { dt: 1, forward: 1, interact: true }).events, []);
});

test('after five, crossing an earlier open door also continues, without a sixth unique opening', () => {
  const state = atDoor(fiveOpen(), 0);
  const r = tick(state, { dt: .7, forward: 1 });
  assert.equal(r.state.status, 'completed'); assert.equal(r.state.opened.length, 5);
  assert.equal(r.state.exitReceipt.doorId, counted[0]);
  assert.equal(normalizeSourceFalseReturn(JSON.parse(JSON.stringify(r.state)), { spawn }).exitReceipt.id, r.state.exitReceipt.id);
});

test('closed leaf, insufficient swing and jamb margin prevent fast-step tunnelling', () => {
  for (const x of [0, .5]) {
    const state = { ...atDoor(fresh(), 0), x };
    const r = tick(state, { dt: 1, forward: 1 });
    assert.ok(r.state.z >= 0); assert.equal(r.state.status, 'active'); assert.deepEqual(r.state.opened, []);
  }
  let state = atDoor(fresh(), 0); state = tick(state, { interact: true }).state;
  state = tick(state, { dt: .2, forward: 1 }).state;
  assert.ok(state.z > 0); assert.equal(state.opened.length, 0);
  state = tick(state, { dt: .6, forward: 1 }).state;
  assert.ok(state.z < 0); assert.equal(state.opened.length, 1); assert.equal(state.status, 'active');
});

test('entry and chapel loop preserve opened identities and consume the rest of held movement', () => {
  let state = openDoor(fresh(), 0);
  state = { ...state, x: -1.5, z: 3.4, yaw: 0 };
  let r = tick(state, { dt: 1, forward: 1 });
  assert.equal(r.events.at(-1).type, 'loop'); assert.equal(r.events.at(-1).id, 'entry:practice-side');
  near(r.state.x, spawn.x); near(r.state.z, spawn.z); assert.deepEqual(r.state.opened, [counted[0]]);
  state = { ...r.state, x: 16.8, z: 3.5, yaw: Math.PI / 2 };
  r = tick(state, { dt: 1, forward: 1 });
  assert.equal(r.events.at(-1).id, 'chapel-end'); near(r.state.x, spawn.x); near(r.state.z, spawn.z);
  assert.deepEqual(r.state.opened, [counted[0]]); assert.equal(r.state.exitReceipt, null);
});

test('other ordinary doors remain locked before five and never add progress', () => {
  const state = { ...fresh(), x: 19, z: 1.2, yaw: 0 };
  assert.equal(sourceFalseReturnFocus(state, fixture()).locked, true);
  const r = tick(state, { interact: true, dt: 1, forward: 1 });
  assert.deepEqual(r.state.opened, []); assert.ok(r.state.z >= 0);
  assert.deepEqual(r.events, []);
});

test('entry-return bounds become inert after five; only its real open plane can continue while chapel still loops', () => {
  const layout = fixture();
  layout.loops.push({ id: 'entry-return', doorId: 'practice-side', sourceAfterFifth: true,
    bounds: { minX: 1, maxX: 1.4, minZ: 1.8, maxZ: 2.2 }, arrival: spawn });
  let r = tick({ ...fresh(), x: .9, z: 2, yaw: Math.PI / 2 }, { dt: 1, forward: 1 }, layout);
  assert.equal(r.events.at(-1).type, 'loop'); assert.equal(r.state.status, 'active'); near(r.state.x, 0);
  r = tick({ ...fiveOpen(), x: .9, z: 2, yaw: Math.PI / 2 }, { dt: 1, forward: 1 }, layout);
  assert.equal(r.events.length, 0); assert.equal(r.state.status, 'active'); assert.ok(r.state.x > 1.4);
  r = tick({ ...fiveOpen(), x: 16.8, z: 3.5, yaw: Math.PI / 2 }, { dt: 1, forward: 1 }, layout);
  assert.equal(r.events.at(-1).type, 'loop'); assert.equal(r.state.status, 'active');
});

test('closed outer doors cannot finish through loop bounds; an open Source plane needs no old floor on the far side', () => {
  const layout = fixture(), door = layout.doors.find(d => d.entry);
  layout.doors.filter(d => d.counted).forEach((d, i) => { d.x = 10 + i * 4; });
  Object.assign(door, { x: 0, z: 0, normal: { x: 0, z: 1 }, openInitial: false });
  layout.loops = [{ id: 'entry-return', doorId: door.id, sourceAfterFifth: true,
    bounds: { minX: -.4, maxX: .4, minZ: .05, maxZ: .5 }, arrival: spawn }];
  layout.supportAt = (x, z) => Math.abs(x) <= 2 && z >= 0 && z <= 5 ? { floor: 4.8, ceil: 7.8 } : null;
  let state = { ...fiveOpen(), x: 0, z: .45, yaw: 0,
    doorOpen: { ...fiveOpen().doorOpen, [door.id]: false }, lastSafe: { ...spawn, z: .45 } };
  let r = tick(state, { dt: .6, forward: 1 }, layout);
  assert.equal(r.state.status, 'active'); assert.equal(r.state.exitReceipt, null);
  assert.ok(r.state.z >= 0); assert.ok(!r.events.some(e => e.type === 'loop' || e.type === 'complete'));
  state = { ...state, z: .45 };
  r = tick(state, { interact: true }, layout);
  assert.equal(r.events[0].type, 'door'); assert.equal(r.state.status, 'active');
  state = tick(r.state, { dt: .45 }, layout).state;
  near(sourceFalseReturnDoorFraction(state, door.id), 1);
  r = tick(state, { dt: .6, forward: 1 }, layout);
  assert.equal(r.state.status, 'completed'); assert.equal(r.state.exitReceipt.doorId, door.id);
  assert.ok(r.state.z < 0); assert.equal(layout.supportAt(r.state.x, r.state.z), null);
  assert.equal(r.events.filter(e => e.type === 'complete').length, 1);
  const blockedApproach = { ...layout, canOccupy: () => false };
  r = tick({ ...state, x: 0, z: .01 }, { dt: .1, forward: 1 }, blockedApproach);
  assert.equal(r.state.status, 'active', 'an invalid from-pose cannot bypass physical approach collision');
});

test('pause/readiness freeze swing, look and motion; reload and reversal preserve physical fraction', () => {
  let state = tick(atDoor(fresh(), 0), { interact: true }).state;
  state = tick(state, { dt: .2 }).state;
  for (const guard of [{ paused: true }, { renderReady: false }, { assetsReady: false }, { protected: true }]) {
    const r = tick(state, { ...guard, dt: 1, forward: 1, interact: true, look: { yaw: 2 } });
    assert.deepEqual(r.state, state); assert.deepEqual(r.events, []);
  }
  const saved = JSON.parse(JSON.stringify(state)); state = normalizeSourceFalseReturn(saved, { spawn });
  const fraction = sourceFalseReturnDoorFraction(state, counted[0]);
  state = tick(state, { interact: true }).state;
  near(sourceFalseReturnDoorFraction(state, counted[0]), fraction);
  state = tick(state, { dt: .1 }).state;
  assert.ok(sourceFalseReturnDoorFraction(state, counted[0]) < fraction);
  state = tick(state, { interact: true }).state;
  state = tick(state, { dt: .45 }).state;
  assert.deepEqual(state.opened, [counted[0]]);
});

test('a body straddling the actual door mouth prevents closing instead of becoming an invalid saved pose', () => {
  let state = openDoor(fresh(), 0);
  state = { ...state, z: .1, yaw: 0 };
  const r = tick(state, { interact: true });
  assert.equal(r.events[0].type, 'door-obstructed'); assert.equal(r.state.doorOpen[counted[0]], true);
  near(sourceFalseReturnDoorFraction(r.state, counted[0]), 1);
  state = tick(r.state, { dt: .3, forward: -1 }).state;
  assert.ok(state.z > .9); assert.equal(tick(state, { interact: true }).state.doorOpen[counted[0]], false);
});

test('valid local poses persist; corrupt unsupported pose recovers to finite support without touching host or layout', () => {
  const layout = fixture(), before = JSON.stringify(layout.doors), host = { ...returnPose };
  let state = { ...fresh(), x: NaN, z: Infinity, feet: -Infinity, pitch: NaN };
  state = tick(state, { dt: .1 }, layout).state;
  assert.ok([state.x, state.z, state.feet, state.pitch].every(Number.isFinite));
  state = tick({ ...state, x: 999, z: 999, feet: -70 }, { dt: .1 }, layout).state;
  near(state.x, spawn.x); near(state.z, spawn.z); near(state.feet, 4.8);
  assert.equal(JSON.stringify(layout.doors), before); assert.deepEqual(returnPose, host);
  const tooLow = { ...layout, supportAt: () => ({ floor: 4.8, ceil: 5.8 }) };
  assert.equal(tick(fresh(), { dt: .2, forward: 1 }, tooLow).state.z, spawn.z);
});

test('stacked floors stay on the current storey and real risers change candidate feet before collision', () => {
  const at = { x: 0, z: 0, feet: 0, yaw: Math.PI / 2, pitch: 0 }, seen = [];
  const supportAt = (x, z, state) => {
    assert.ok(Number.isFinite(state?.feet), 'height-aware support must receive the saved current feet');
    if (x < -1 || x > 8 || Math.abs(z) > 1) return null;
    const candidates = x >= 1 && x <= 5 ? [Math.min(3.2, Math.floor((x - 1) / .5 + 1e-8) * .4)] : [0, 3.2];
    const floor = candidates.sort((a, b) => Math.abs(a - state.feet) - Math.abs(b - state.feet))[0];
    seen.push({ x, current: state.feet, floor });
    return { floor, ceil: floor + 2.5 };
  };
  const layout = { spawn: at, doors: [], loops: [], supportAt,
    bounds: { minX: -1, maxX: 8, minZ: -1, maxZ: 1 },
    canOccupy(x, z, state) { return Math.abs(supportAt(x, z, state).floor - state.feet) < 1e-7; } };
  let state = freshSourceFalseReturn({ spawn: at });
  state = tick(state, { dt: 1, forward: 1 }, layout).state;
  near(state.x, 3); near(state.feet, 1.6);
  state = tick(state, { dt: 1, forward: 1 }, layout).state;
  near(state.x, 6); near(state.feet, 3.2);
  state = normalizeSourceFalseReturn(JSON.parse(JSON.stringify(state)), { spawn: at });
  state = tick(state, { dt: .2, forward: 1 }, layout).state;
  near(state.feet, 3.2, 'reloading over stacked ground retains the upper storey');
  state = tick(state, { dt: .2, forward: -1 }, layout).state;
  state = tick(state, { dt: 1, forward: -1 }, layout).state;
  state = tick(state, { dt: 1, forward: -1 }, layout).state;
  near(state.x, 0); near(state.feet, 0);
  assert.ok(seen.some(p => p.floor > p.current + .39), 'test actually crossed authored risers');
  assert.ok(seen.every(p => Math.abs(p.floor - p.current) <= .4000001));
});

test('a stair cannot jump an oversized riser, and co-located doors focus only at their real height', () => {
  const at = { x: 0, z: 0, feet: 0, yaw: Math.PI / 2, pitch: 0 };
  const layout = { spawn: at, doors: [], loops: [], canOccupy: () => true,
    supportAt(x) { return { floor: x < 1 ? 0 : .5, ceil: 3 }; } };
  let state = freshSourceFalseReturn({ spawn: at });
  state = tick(state, { dt: 1, forward: 1 }, layout).state;
  assert.ok(state.x < 1); near(state.feet, 0);
  const doors = [0, 4.8].map((feet, i) => ({ id: counted[i], counted: true, x: 1, z: 0, feet, width: 1.2, normal: { x: 1, z: 0 } }));
  assert.equal(sourceFalseReturnFocus({ ...state, x: 0, feet: 0 }, { ...layout, doors }).id, counted[0]);
  assert.equal(sourceFalseReturnFocus({ ...state, x: 0, feet: 4.8 }, { ...layout, doors }).id, counted[1]);
});

test('the same five-opening rule accepts any five counted actual doors in the expanded floorset', () => {
  const otherIds = ['dock-foyer-service', 'hall-vestibule', 'pool-lobby', 'hall-rear-service', 'chapel-c17'];
  for (const id of otherIds) assert.ok(CONSERVATORY_DOORS.some(d => d.id === id));
  const layout = fixture();
  layout.doors.slice(0, 5).forEach((d, i) => { d.id = otherIds[i]; });
  let state = fresh();
  for (let i = 0; i < 5; i++) {
    state = atDoor(state, i); state = tick(state, { interact: true }, layout).state;
    state = tick(state, { dt: .45 }, layout).state;
  }
  assert.deepEqual(state.opened, otherIds); assert.equal(state.status, 'active');
  const r = tick(state, { dt: .7, forward: 1 }, layout);
  assert.equal(r.state.status, 'completed'); assert.equal(r.state.exitReceipt.doorId, 'chapel-c17');
});

test('actual one-active-leaf pairs admit only that physical half, independently of normal direction', () => {
  for (const [id, activeSign] of [['hall-vestibule', -1], ['chapel-c17', 1]]) {
    const door = doorDefinitionWithArchetype(DOOR_BY_ID[id]), half = door.aperture.width / 2;
    assert.equal(door.leafCount, 2); assert.equal(door.activeLeaves.length, 1);
    assert.equal(sourceFalseReturnDoorAllowsWidth(door, activeSign * half / 2), true, id);
    assert.equal(sourceFalseReturnDoorAllowsWidth(door, -activeSign * half / 2), false, `${id}: fixed leaf`);
    assert.equal(sourceFalseReturnDoorAllowsWidth(door, 0), false, `${id}: body straddles the fixed leaf`);
    assert.equal(sourceFalseReturnDoorAllowsWidth(door, activeSign * (half - .1)), false, `${id}: jamb clearance`);
    assert.equal(sourceFalseReturnDoorAllowsWidth(door, activeSign * half, 0), true, `${id}: unpadded surface sample`);
  }
  const both = doorDefinitionWithArchetype(DOOR_BY_ID['dock-grey-exterior']);
  assert.equal(sourceFalseReturnDoorAllowsWidth(both, 0), true, 'two open leaves share one continuous opening');
  assert.equal(sourceFalseReturnDoorAllowsWidth({ width: 1, leafCount: 1 }, 0), true);
  assert.equal(sourceFalseReturnDoorAllowsWidth({ width: 1, leafCount: 1 }, .4), false);
});

test('an open pair cannot hand off through its inactive leaf, including reversed normals and rotated width axes', () => {
  for (const [normal, yaw] of [[{ x: 0, z: 1 }, 0], [{ x: 0, z: -1 }, 0], [{ x: 1, z: 0 }, Math.PI / 2]]) {
    const layout = fixture(), original = layout.doors[0];
    const door = { ...doorDefinitionWithArchetype(DOOR_BY_ID['hall-vestibule']),
      x: 0, z: 0, feet: 4.8, yaw, normal, counted: true };
    layout.doors[0] = door;
    let base = fiveOpen();
    base.opened = [door.id, ...base.opened.slice(1)];
    base.doorOpen[door.id] = true;
    delete base.doorOpen[original.id]; delete base.doorMotion[original.id];
    const half = door.aperture.width / 2;
    for (const [coord, expected] of [[half / 2, 'active'], [-half / 2, 'completed']]) {
      const at = yaw ? { x: 1.2, z: coord, yaw: -Math.PI / 2 } : { x: coord, z: 1.2, yaw: 0 };
      const r = tick({ ...base, ...at, lastSafe: { ...spawn, ...at } }, { dt: .7, forward: 1 }, layout);
      assert.equal(r.state.status, expected, `width ${coord}, yaw ${yaw}, normal ${normal.z}`);
      assert.equal(r.state.opened.length, 5, 'a pair remains one canonical assembly');
    }
  }
});

test('opening and reopening an actual pair counts one assembly regardless of its active leaf count', () => {
  for (const id of ['hall-vestibule', 'chapel-c17', 'dock-grey-exterior']) {
    const layout = fixture();
    layout.doors[0] = { ...doorDefinitionWithArchetype(DOOR_BY_ID[id]),
      x: 0, z: 0, feet: 4.8, yaw: 0, normal: { x: 0, z: 1 }, counted: true };
    let state = atDoor(fresh(), 0);
    for (let n = 0; n < 3; n++) {
      state = tick(state, { interact: true }, layout).state;
      state = tick(state, { dt: .45 }, layout).state;
    }
    assert.deepEqual(state.opened, [id]); assert.equal(state.status, 'active');
  }
});
