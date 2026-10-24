import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_EARTHFALL as C } from '../src/data/source-earthfall.js';
import { freshSourceEarthfall, stepSourceEarthfall, sourceEarthfallSupportAt } from '../src/game/source-earthfall.js';
import {
  ENDING_WRONG_DOOR_SEQUENCE_ID as SEQUENCE,
  freshEndingWrongDoorDemolition as fresh,
  normalizeEndingWrongDoorDemolition as normalize,
  stepEndingWrongDoorDemolition as step,
  endingWrongDoorDemolitionFrame as frame,
  endingWrongDoorDemolitionFocus as focus,
} from '../src/game/ending-wrong-door.js';

const copy = value => JSON.parse(JSON.stringify(value));
const initial = () => fresh({ runId: 'ending-test', returnPose: { x: 17, y: 43, yaw: .7, preserved: ['ordinary world'] } });
function advance(state, seconds, input = {}, quantum = 1 / 60) {
  const events = [];
  for (let time = 0; time + 1e-9 < seconds;) {
    const dt = Math.min(quantum, seconds - time), result = step(state, { ...input, dt });
    state = result.state; events.push(...result.events); time += dt;
  }
  return { state, events };
}
function committed() {
  const result = advance(initial(), .25, { forward: 1 });
  assert.equal(result.state.physical.committed, true);
  return result;
}
function landed() {
  const result = advance(committed().state, 10);
  assert.equal(result.state.physical.phase, 'landed');
  return result.state;
}
function walk(state, x, z) {
  const events = [];
  for (let n = 0; n < 5000; n++) {
    const p = state.physical, dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
    if (distance < .04 || state.status !== 'active') return { state, events };
    const result = step(state, { dt: C.fixedStep,
      forward: Math.min(1, distance / (C.walkSpeed * C.fixedStep)), look: { yaw: Math.atan2(dx, -dz) } });
    state = result.state; events.push(...result.events);
  }
  assert.fail(`Could not reach (${x},${z}) from ${JSON.stringify(state.physical)}`);
}
function ready() {
  let state = walk(landed(), 0, C.passage.exitZ + 1.4).state;
  assert.equal(focus(state)?.kind, 'exit');
  state = step(state, { interact: true }).state;
  state = advance(state, C.door.openSeconds).state;
  return walk(state, 0, C.passage.exitZ - .5);
}

test('ending checkpoint owns the borrowed engine and refuses ordinary or other-run progress', () => {
  const state = initial();
  assert.equal(state.sequenceId, SEQUENCE);
  assert.equal(state.runId, 'ending-test');
  assert.equal(state.status, 'active');
  assert.equal(state.physical.runId, 'ending-wrong-door:ending-test:physical');
  assert.deepEqual(normalize(copy(state)), state);
  assert.deepEqual(normalize(committed().state, { runId: 'other' }), fresh({ runId: 'other' }));
  const ordinary = freshSourceEarthfall({ runId: state.runId });
  assert.deepEqual(normalize(ordinary, { runId: state.runId }), fresh({ runId: state.runId }));
  assert.deepEqual(normalize({ ...state, physical: ordinary }), fresh({ runId: state.runId }));
  assert.deepEqual(normalize({ ...state, sequenceId: 'source-earthfall:source-II-v1' }), fresh({ runId: state.runId }));
});

test('normalization permits only finite return poses and never adopts host or source resources', () => {
  for (const returnPose of [{ x: Infinity, y: 1 }, { x: 1, y: NaN }, { x: 1, z: 2, yaw: Infinity },
    { x: 1, y: '2' }, { x: 1, y: 2, nested: [Infinity] }, { y: 2 }]) {
    assert.equal(fresh({ returnPose }).returnPose, null);
  }
  const current = committed().state;
  const host = { ...current, sourceContinuation: { phase: 'wrong-return', knowledge: ['seam'] },
    sourceDemolition: { status: 'spent' }, health: 7, battery: .3, inventory: ['recorder'] };
  const before = copy(host), normalized = normalize(host);
  assert.deepEqual(host, before);
  assert.deepEqual(normalized, current);
  assert.equal('sourceContinuation' in normalized, false);
  assert.equal('health' in normalized, false);
  assert.deepEqual(normalized.returnPose, initial().returnPose);
});

test('accepted forward movement performs the same controlled failure and full 100m physical descent', () => {
  let state = initial(), ordinary = freshSourceEarthfall({ runId: 'independent-control', returnPose: state.returnPose });
  let previousY = 100, distance = 0, didCatch = false;
  const events = [];
  for (let n = 0; n < 1000; n++) {
    const input = { dt: 1 / 60, forward: n < 15 ? 1 : 0 };
    const result = step(state, input); state = result.state;
    ordinary = stepSourceEarthfall(ordinary, input).state; events.push(...result.events);
    const p = state.physical;
    for (const key of ['phase', 'x', 'z', 'feet', 'velocityY', 'clock', 'elapsed', 'committed'])
      assert.equal(p[key], ordinary[key], key);
    assert.ok(p.feet <= previousY + 1e-8); distance += previousY - p.feet; previousY = p.feet;
    assert.equal(frame(state).player.y, p.feet);
    if (p.phase === 'catching') {
      didCatch = true;
      assert.equal(sourceEarthfallSupportAt(p.x, p.z, p)?.y, p.feet);
      assert.equal(frame(state).catchSurfaceY, p.feet);
    }
    if (p.phase === 'landed') break;
  }
  assert.equal(state.physical.phase, 'landed');
  assert.equal(state.physical.feet, 0); assert.ok(didCatch); assert.ok(Math.abs(distance - 100) < 1e-8);
  assert.deepEqual(events.map(event => event.type), ['strain', 'fracture', 'footing-loss', 'catch', 'land']);
  assert.ok(events.every(event => event.id.startsWith('ending-wrong-door:ending-test:')));
  assert.equal(JSON.stringify(events).includes('source-II'), false);
  assert.deepEqual(state.receipts.map(receipt => receipt.type), events.map(event => event.type));
});

test('waiting, rejected movement and protected presentation cannot spend the ending', () => {
  for (const input of [{}, { look: { yaw: .7, pitch: -.3 } }, { forward: 1, acceptedStep: false }]) {
    const result = advance(initial(), 1, input);
    assert.equal(result.state.physical.committed, false); assert.deepEqual(result.events, []);
  }
  for (const state of [initial(), committed().state, advance(committed().state, 4).state, landed()]) {
    for (const guard of [{ paused: true }, { protected: true }, { assetsReady: false }, { renderReady: false }]) {
      const result = step(state, { dt: 99, forward: 1, side: 1, look: { yaw: 2 }, interact: true, ...guard });
      assert.deepEqual(result.state, state); assert.deepEqual(result.events, []); assert.equal(result.saveDue, false);
    }
  }
  const capped = step(initial(), { dt: 99, side: 1 });
  assert.ok(Math.abs(capped.state.physical.clock - .25) < 1e-8);
  assert.ok(Math.abs(capped.state.physical.x - C.walkSpeed * .25) < 1e-8);
});

test('midfall and midcatch serialization preserve cues and subsequent motion without replay', () => {
  for (const age of [4, 7.9]) {
    const current = advance(committed().state, age).state;
    assert.ok(['falling', 'catching'].includes(current.physical.phase));
    const loaded = normalize(copy(current)); assert.deepEqual(loaded, current);
    assert.deepEqual(advance(loaded, .1), advance(current, .1));
    assert.deepEqual(advance(loaded, .1).events, []);
    assert.ok(frame(loaded).events.every(event => event.age > 0 && event.id.startsWith(`${SEQUENCE}:`)));
  }
});

test('returning through the real upper door preserves the ending return position and freezes the checkpoint', () => {
  const result = advance(committed().state, 1.2, { forward: -1 });
  assert.equal(result.state.status, 'returned');
  assert.equal(result.events.at(-1).type, 'return');
  assert.deepEqual(result.events.at(-1).returnPose, initial().returnPose);
  assert.equal(result.events.at(-1).id, 'ending-wrong-door:ending-test:return');
  const frozen = step(copy(result.state), { dt: 20, forward: 1, interact: true });
  assert.deepEqual(frozen.state, result.state); assert.deepEqual(frozen.events, []);
});

test('only the opened lower leaf and actual body crossing produce one Source IV receipt', () => {
  let state = walk(landed(), 0, C.passage.exitZ + 1.4).state;
  const blocked = advance(state, 1, { forward: 1 });
  assert.equal(blocked.state.status, 'active'); assert.ok(blocked.state.physical.z > C.passage.exitZ);
  const opened = step(blocked.state, { interact: true });
  assert.equal(opened.event.id, 'ending-wrong-door:ending-test:door:exit');
  assert.equal(opened.state.status, 'active');
  assert.equal(focus(opened.state)?.id, opened.event.id);
  state = advance(opened.state, C.door.openSeconds).state;
  const aside = copy(state); aside.physical.x = 4; aside.physical.z = C.passage.exitZ + .01;
  assert.equal(advance(aside, .1, { forward: 1 }).state.status, 'active');
  const result = walk(state, 0, C.passage.exitZ - .5);
  assert.equal(result.state.status, 'ready-for-source-IV');
  assert.equal(result.state.physical.status, 'completed');
  assert.deepEqual(result.events, [{ type: 'enter-source-IV', id: 'ending-wrong-door:ending-test:source-IV', receipt: 'ending-wrong-door:ending-test:source-IV' }]);
  assert.equal(result.state.exitReceipt.id, result.events[0].receipt);
  assert.equal(result.state.exitReceipt.delivered, false);
  assert.equal(result.state.physical.exitReceipt.id, result.state.exitReceipt.id);
  assert.equal(result.state.receipts.at(-1).type, 'enter-source-IV');
  assert.equal(frame(result.state).exitReceipt.id, result.state.exitReceipt.id);
  assert.equal(JSON.stringify(result.state.receipts).includes('source-II'), false);
  for (const checkpoint of [result.state, copy(result.state), normalize(copy(result.state))]) {
    const frozen = step(checkpoint, { dt: 99, forward: -1, interact: true });
    assert.deepEqual(frozen.state, result.state); assert.deepEqual(frozen.events, []); assert.equal(frozen.saveDue, false);
  }
});

test('delivered handoff survives reload and cannot be forged before the physical exit', () => {
  const completed = ready().state;
  const delivered = normalize({ ...completed, exitReceipt: { ...completed.exitReceipt, delivered: true } });
  assert.equal(delivered.exitReceipt.delivered, true);
  assert.deepEqual(normalize(copy(delivered)), delivered);
  assert.equal(step(delivered, { dt: .25 }).event, null);
  const early = normalize({ ...initial(), status: 'ready-for-source-IV',
    exitReceipt: { id: 'ending-wrong-door:ending-test:source-IV', delivered: true } });
  assert.equal(early.status, 'active'); assert.equal(early.exitReceipt, null);
});

// A nested physical receipt cannot confer authority to skip this ending's
// lower door; only its validated outer handoff receipt acknowledges delivery.
test('a stale nested acknowledgement cannot acknowledge the ending handoff',()=>{
  let state=fresh({runId:'nested-ack'});
  state.physical.status='completed';state.physical.committed=true;state.physical.phase='landed';
  state.physical.exitReceipt={id:'old-source-II-receipt',delivered:true};
  state.exitReceipt=null;
  const normalized=normalize(state,{runId:'nested-ack'});
  assert.equal(normalized.status,'ready-for-source-IV');
  assert.equal(normalized.exitReceipt.delivered,false);
});
