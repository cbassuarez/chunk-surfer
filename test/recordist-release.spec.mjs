import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginRecordistRelease, normalizeRecordistRelease, advanceRecordistRelease,
  recordistReleaseView, RECORDIST_RELEASE_SECONDS,
} from '../src/game/recordist-release.js';

const origin = { x: 25, y: -4, z: 61, yaw: .4 };
const fresh = () => beginRecordistRelease({ runId: 'earned-chapel-win', origin });
const live = { dt: .1, inRange: true, facing: true, hasRig: true, hasFork: true };
const step = (state, input = {}) => advanceRecordistRelease(state, { ...live, ...input });
function hold(state, seconds) {
  state = step(state, { interactHeld: false }).state;
  let last;
  for (let i = 0; i < Math.ceil(seconds / .1); i++) { last = step(state, { interactHeld: true }); state = last.state; }
  return { ...last, state };
}

test('choosing the route and a key already held cannot release or carry the recordist', () => {
  let state = fresh();
  for (let i = 0; i < 300; i++) state = step(state, { interactHeld: true }).state;
  assert.equal(state.stage, 'address');
  assert.equal(state.proof.lifted, false);
  assert.equal(recordistReleaseView(state).carryReady, false);
});

test('the actual rig, fork interruption, physical settling and lift are separately earned', () => {
  let state = fresh(), result;
  state = hold(state, RECORDIST_RELEASE_SECONDS.address).state;
  assert.equal(state.stage, 'interrupt');
  assert.deepEqual(state.proof, { addressed: true, interrupted: false, released: false, lifted: false });
  result = hold(state, RECORDIST_RELEASE_SECONDS.interrupt); state = result.state;
  assert.equal(state.stage, 'settling');
  assert.equal(result.carryReady, false);
  assert.deepEqual(result.cues, [{ id: 'fork-struck', kind: 'fork' }]);
  for (let i = 0; i < 22; i++) state = step(state, { interactHeld: false }).state;
  assert.equal(state.stage, 'lift');
  assert.equal(state.proof.released, true);
  result = hold(state, RECORDIST_RELEASE_SECONDS.lift);
  assert.equal(result.carryReady, true);
  assert.equal(result.state.stage, 'carried');
  assert.deepEqual(result.cues, [{ id: 'carry-ready', kind: 'effort' }]);
  assert.equal(step(result.state, { interactHeld: true }).carryReady, false, 'the host receives one carry handoff');
});

test('ownership, range and facing come from the host and cannot be invented by an interaction', () => {
  for (const denied of [{ hasRig: false }, { inRange: false }, { facing: false }]) {
    let state = step(fresh(), { interactHeld: false }).state;
    for (let i = 0; i < 40; i++) state = step(state, { ...denied, interactHeld: true }).state;
    assert.equal(state.stage, 'address');
    assert.equal(state.holdSeconds, 0);
  }
  let state = hold(fresh(), RECORDIST_RELEASE_SECONDS.address).state;
  state = step(state, { interactHeld: false }).state;
  for (let i = 0; i < 30; i++) state = step(state, { hasFork: false, interactHeld: true }).state;
  assert.equal(state.stage, 'interrupt');
});

test('cancelled holds and loss of focus reset only unfinished work and require a fresh press', () => {
  let state = hold(fresh(), .9).state;
  assert.equal(state.stage, 'address');
  assert.ok(state.holdSeconds > .8);
  state = step(state, { interactHeld: false }).state;
  assert.equal(state.holdSeconds, 0);
  state = hold(state, RECORDIST_RELEASE_SECONDS.address).state;
  for (const suspension of [{ paused: true }, { focused: false }, { hidden: true }, { blocked: true }]) {
    state = hold(state, .6).state;
    const time = state.timeSeconds;
    state = step(state, { ...suspension, dt: 10, interactHeld: true }).state;
    assert.equal(state.timeSeconds, time);
    assert.equal(state.holdSeconds, 0);
    assert.equal(state.stage, 'interrupt');
    assert.equal(state.proof.addressed, true);
    assert.equal(state.requiresRelease, true);
    state = step(state, { interactHeld: true }).state;
    assert.equal(state.holdSeconds, 0);
  }
});

test('pause and focus cannot advance the physical slump; a frame stall cannot complete it unseen', () => {
  let state = hold(hold(fresh(), RECORDIST_RELEASE_SECONDS.address).state, RECORDIST_RELEASE_SECONDS.interrupt).state;
  const before = structuredClone(state);
  state = step(state, { paused: true, dt: 30 }).state;
  assert.equal(state.phaseSeconds, before.phaseSeconds);
  assert.equal(state.timeSeconds, before.timeSeconds);
  state = step(state, { dt: 30 }).state;
  assert.equal(state.stage, 'settling');
  assert.equal(state.phaseSeconds, .1);
});

test('saved checkpoints preserve completed stages and reject a different run or unearned terminal stage', () => {
  const state = hold(fresh(), RECORDIST_RELEASE_SECONDS.address).state;
  const resumed = normalizeRecordistRelease(JSON.parse(JSON.stringify(state)), { runId: state.runId });
  assert.deepEqual(resumed, state);
  assert.equal(normalizeRecordistRelease(state, { runId: 'other-night' }), null);
  assert.equal(normalizeRecordistRelease({ ...fresh(), stage: 'carried', proof: { lifted: true } }).stage, 'address');
  assert.equal(normalizeRecordistRelease({ ...state, stage: 'carried', proof: { ...state.proof, lifted: true } }).stage, 'interrupt');
  assert.throws(() => beginRecordistRelease({ runId: state.runId, origin: { x: 1, y: 1 } }), /anchor/);
});

test('world target is transformed once by the persistent physical floor anchor', () => {
  const state = fresh(), view = recordistReleaseView(state), p = [0, .86, -.18];
  assert.equal(view.origin.y, -4);
  assert.ok(Math.abs(view.target.x - (origin.x + Math.sin(origin.yaw) * p[2])) < 1e-10);
  assert.ok(Math.abs(view.target.z - (origin.z + Math.cos(origin.yaw) * p[2])) < 1e-10);
  assert.equal(view.target.y, origin.y + p[1]);
  assert.equal(view.tool, 'rig');
});
