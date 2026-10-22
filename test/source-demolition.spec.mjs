import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_DEMOLITION as PLAN } from '../src/data/source-demolition.js';
import { normalizeSourceDemolition, advanceSourceDemolition, sourceDemolitionFrame } from '../src/game/source-demolition.js';
import { normalizeChunkSurfState, freshChunkSurfState } from '../src/game/chunk-surf-state.js';

const json = value => JSON.parse(JSON.stringify(value));
const authored = patch => ({ ...normalizeSourceDemolition(), ...patch });
const tick = (state, options = {}) => advanceSourceDemolition(state, {
  dt: .1, along: 2, across: 0, eligible: true, portalPassable: true, ...options,
});
function commit() {
  const initial = tick(null, { along: 1.1 }).state;
  return tick(initial, { along: 1.3, movingForward: true }).state;
}
function wait(state, seconds, options = {}) {
  const events = []; let checkpoints = 0;
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    const next = tick(state, options); state = next.state; events.push(...next.events);
    if (next.immediate) checkpoints++;
  }
  return { state, events, checkpoints };
}

test('new sequence rejects retired road receipts and normalizes finite bounded state idempotently', () => {
  for (const value of [null, undefined, [], 'bad', { committed: true, elapsed: 18 },
    { version: 1, sequenceId: 'source-demolition:conservatoire-west-v1', committed: true, elapsed: 18, consumed: true }]) {
    const state = normalizeSourceDemolition(value);
    assert.equal(state.committed, false); assert.equal(state.consumed, false);
    assert.equal(state.elapsed, 0); assert.deepEqual(normalizeSourceDemolition(json(state)), state);
  }
  const imported = normalizeSourceDemolition(authored({ committed: true, elapsed: 999, clock: 999999,
    caught: true, consumed: true, consumedAt: 700, lastAlong: Infinity,
    receipts: [{ type: 'roof', at: Infinity }, { type: 'roof', at: 2 }, { type: 'new-route', at: 0 }] }));
  assert.equal(imported.elapsed, 18); assert.equal(imported.clock, 86400);
  assert.equal(imported.consumedAt, 18); assert.equal(imported.lastAlong, null);
  assert.equal(imported.receipts.filter(r => r.type === 'roof').length, 1);
  assert.ok(imported.receipts.every(r => Number.isFinite(r.at) && Object.values(r.position).every(Number.isFinite)));
  assert.equal(imported.receipts.some(r => r.type === 'new-route'), false);
});

test('the threshold fixture is fixed and can preload inside; opening, looking or waiting is not commitment', () => {
  let state = tick(null, { along: -12, portalPassable: false }).state;
  assert.equal(state.anchored, true); assert.equal(state.committed, false);
  state = wait(state, 3, { along: -2, echoVisible: true }).state;
  state = tick(state, { along: 1.1, echoVisible: false }).state;
  state = tick(state, { along: 1.1, movingForward: true }).state;
  assert.equal(state.recognized, false); assert.equal(state.committed, false); assert.deepEqual(state.receipts, []);
  assert.equal(sourceDemolitionFrame(state, { along: -18, across: 0 }).preload, true);
  assert.equal(sourceDemolitionFrame(state, { along: -18.01, across: 0 }).preload, false);
  const first = sourceDemolitionFrame(state, { along: 1.1, across: 0 });
  const turned = sourceDemolitionFrame(state, { along: 1.1, across: 0, yaw: Math.PI });
  assert.deepEqual(first, turned); assert.equal(first.anchors.building.y, 0);
});

test('one capsule-cleared outward crossing commits through a passable throat and receipts its first strain', () => {
  const initial = tick(null, { along: 1.24 }).state;
  const result = tick(initial, { along: 1.26, movingForward: true });
  assert.equal(result.state.committed, true); assert.equal(result.state.recognized, true);
  assert.equal(result.immediate, true); assert.equal(result.saveDue, true);
  assert.deepEqual(result.events.map(e => e.type), ['strain']);
  for (const guard of [{ portalPassable: false }, { movingForward: false }, { protected: true },
    { suspended: true }, { restored: true }, { eligible: false }, { dt: 0 }]) {
    assert.equal(tick(initial, { along: 1.26, movingForward: true, ...guard }).state.committed, false, JSON.stringify(guard));
  }
  const side = tick(null, { along: 1.24, across: 1 }).state;
  assert.equal(tick(side, { along: 1.26, across: 1, movingForward: true }).state.committed, false);
  assert.equal(tick(initial, { along: 20, movingForward: true }).state.committed, false, 'a warp is not an accepted body step');
  const outside = tick(null, { along: 3 }).state;
  assert.equal(tick(outside, { along: 3.1, movingForward: true }).state.committed, false, 'loading outside does not invent a threshold crossing');
  assert.equal(tick(initial, { along: 1.1, movingForward: true }).state.committed, false, 'inward retreat does not commit');
});

test('structural loss lasts18 lived seconds, remains irreversible during retreat and bounds suspension jumps', () => {
  let state = commit(); assert.equal(state.committed, true);
  const huge = tick(state, { dt: 600 }); assert.ok(huge.state.elapsed - state.elapsed <= .100001);
  state = wait(huge.state, 20, { along: -8 }).state;
  assert.equal(state.elapsed, 18); assert.equal(state.status, 'spent');
  const frame = sourceDemolitionFrame(state, { along: -8, across: 0 });
  assert.equal(frame.loss, 1); assert.equal(frame.shell, 0); assert.equal(frame.frontAlong, -5);
  const paused = tick(state, { suspended: true, dt: 999, along: 12 });
  assert.equal(paused.state.clock, state.clock); assert.equal(paused.state.consumed, false);
});

test('release never precedes its genuine3.15-second aperture; protected attacks and reload backlog stay suppressed', () => {
  let state = wait(commit(), 2.9).state;
  const before = sourceDemolitionFrame(state); assert.equal(before.release, 0);
  assert.equal(state.receipts.some(r => r.type === 'release'), false);
  const opened = wait(state, .2); state = opened.state;
  assert.ok(sourceDemolitionFrame(state).release > 0);
  assert.ok(opened.events.some(e => e.type === 'release'));
  const silent = wait(commit(), 6, { protected: true }); state = silent.state;
  assert.deepEqual(silent.events, []);
  for (const type of ['infill', 'release', 'course']) assert.equal(state.receipts.find(r => r.type === type).suppressed, true);
  assert.equal(tick(state).events.length, 0);
  const later = wait(state, 2); assert.deepEqual(later.events.map(e => e.type), ['roof']);
  const reloaded = tick(json(later.state), { restored: true });
  assert.deepEqual(reloaded.events, []); assert.deepEqual(sourceDemolitionFrame(reloaded.state).events, []);
});

test('stopping before8m or retreating into the room preserves a view without forced consumption', () => {
  const watcher = wait(commit(), 12, { along: 5 }).state;
  assert.equal(watcher.caught, true); assert.equal(watcher.consumed, false);
  assert.equal(sourceDemolitionFrame(watcher, { along: 5, across: 0 }).blackness, 0);
  const retreat = wait(commit(), 12, { along: -10 }).state;
  assert.equal(retreat.caught, false); assert.equal(retreat.consumed, false);
  assert.equal(sourceDemolitionFrame(retreat, { along: -10, across: 0 }).frontReach, 35);
});

test('actual early pocket occupancy uses4.8-second readiness and a.65-second body fill, then geographic exit releases it', () => {
  let state = wait(commit(), 4.5, { along: 12 }).state;
  assert.equal(state.consumed, false);
  const start = wait(state, .3, { along: 12 }); state = start.state;
  assert.equal(state.consumed, true); assert.deepEqual(start.events.map(e => e.type), ['consumed']);
  let frame = sourceDemolitionFrame(state, { along: 12, across: 0 });
  assert.equal(frame.blackness, 0); assert.equal(frame.consumption, 0);
  const event = frame.events.find(e => e.type === 'consumed');
  assert.deepEqual(event.position, { x: 0, y: .95, z: -12 });
  state = wait(state, .7, { along: 15 }).state;
  frame = sourceDemolitionFrame(state, { along: 15, across: 0 });
  assert.equal(frame.blackness, 1); assert.equal(frame.consumption, 1);
  assert.deepEqual(frame.events.find(e => e.type === 'consumed').position, event.position);
  for (const exit of [{ along: 38.01, across: 0 }, { along: 7.99, across: 0 }, { along: 15, across: 18.01 }]) {
    const released = tick(state, exit).state;
    assert.equal(released.released, true);
    assert.equal(sourceDemolitionFrame(released, exit).blackness, 0);
    assert.equal(sourceDemolitionFrame(tick(released, { along: 12 }).state, { along: 12, across: 0 }).blackness, 0);
  }
});

test('late entry after structural completion still fills, saves once at full cover and survives reload without a repeated cue', () => {
  let state = wait(commit(), 20, { along: 2 }).state;
  assert.equal(state.elapsed, 18); assert.equal(state.consumed, false);
  for (let along = 3; along <= 9; along++) state = tick(state, { along, movingForward: true }).state;
  state = normalizeSourceDemolition(json(state));
  assert.ok(sourceDemolitionFrame(state, { along: 9, across: 0 }).consumption < 1);
  const completed = wait(state, .7, { along: 9 }); state = completed.state;
  assert.equal(completed.checkpoints, 1);
  assert.equal(sourceDemolitionFrame(state, { along: 9, across: 0 }).blackness, 1);
  const loaded = tick(json(state), { along: 9, restored: true });
  assert.deepEqual(loaded.events, []); assert.equal(sourceDemolitionFrame(loaded.state, { along: 9, across: 0 }).blackness, 1);
  assert.equal(state.receipts.filter(r => r.type === 'consumed').length, 1);
});

test('passing the finite first-shore band without crossing spends the optional event and serialization preserves progress', () => {
  const skipped = tick(null, { along: 71 }).state;
  assert.equal(skipped.status, 'skipped'); assert.equal(skipped.committed, false);
  let returned = tick(skipped, { along: 1.1 }).state;
  returned = tick(returned, { along: 1.3, movingForward: true }).state;
  assert.equal(returned.committed, false);
  const active = wait(commit(), 5).state, restored = normalizeSourceDemolition(json(active));
  assert.deepEqual(restored, active);
  const frame = sourceDemolitionFrame(restored, { along: 5, across: 0 });
  assert.equal(frame.loss, sourceDemolitionFrame(active).loss);
  assert.equal(new Set(frame.events.map(e => e.id)).size, frame.events.length);
});

test('top-level save normalization removes old Horizon ownership and suppresses legacy backtracking past first lift', () => {
  const fresh = freshChunkSurfState();
  assert.equal(fresh.sourceDemolition.sequenceId, PLAN.sequenceId); assert.equal('demolition' in fresh.horizon, false);
  const old = { sequenceId: 'source-demolition:conservatoire-west-v1', committed: true, elapsed: 18, consumed: true };
  const beforeLift = normalizeChunkSurfState({ horizon: { demolition: old }, firstLiftCompleted: false });
  assert.equal(beforeLift.sourceDemolition.committed, false); assert.equal('demolition' in beforeLift.horizon, false);
  const past = normalizeChunkSurfState({ horizon: { demolition: old }, firstLiftCompleted: true });
  assert.equal(past.sourceDemolition.status, 'skipped'); assert.deepEqual(past.sourceDemolition.receipts, []);
  const active = commit();
  assert.equal(normalizeChunkSurfState({ sourceDemolition: json(active), firstLiftCompleted: true }).sourceDemolition.committed, true,
    'a valid new receipt is not reset by the onward progression flag');
});

test('the contract contains no relocation, phase choice or resource mutation and leaves the40m stand and170m lift outside its pocket', () => {
  const state = wait(commit(), 6, { along: 12 }).state;
  const allowed = new Set(['version','sequenceId','status','anchored','recognized','committed','skipped','clock','elapsed',
    'caught','caughtAt','consumed','consumedAt','consumedPosition','pocketEntered','released','lastAlong','lastAcross','lastEligible','receipts']);
  assert.ok(Object.keys(state).every(key => allowed.has(key)));
  for (const key of ['phase','position','checkpoint','health','battery','route','victories','roomTaken','sourceShore']) assert.equal(key in state, false);
  assert.deepEqual(sourceDemolitionFrame(state, { along: 12, across: 0 }), sourceDemolitionFrame(state, { along: 12, across: 0, yaw: Math.PI }));
  assert.equal(PLAN.pocket.to, 38); assert.ok(PLAN.pocket.to < 40 && PLAN.pocket.to < 170);
});
