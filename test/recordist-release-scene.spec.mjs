import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRecordistReleaseScene } from '../src/game/recordist-release-scene.js';
import { beginRecordistRelease, normalizeRecordistRelease, RECORDIST_RELEASE_SECONDS as DURATION } from '../src/game/recordist-release.js';

const key = { key: 'e', code: 'KeyE' };
function fixture(options = {}) {
  let saved = options.state || beginRecordistRelease({ runId: 'chapel-real-run', origin: { x: 1, y: 0, z: 2, yaw: .2 } });
  const ctx = { runId: saved.runId, inRange: true, facing: true, hasRig: true, hasFork: true,
    paused: false, focused: true, hidden: false, blocked: false };
  const writes = [], cues = [], carries = [], errors = [];
  let ready = options.ready !== false, requests = 0, failCommit = false;
  const scene = makeRecordistReleaseScene({
    getState: () => saved, getContext: () => ctx,
    commitState: (value, metadata) => {
      if (failCommit) throw new Error('disk unavailable');
      saved = value; writes.push({ value, metadata });
    },
    assetsReady: () => ready,
    requestAssets: () => { requests++; return options.requestAssets?.(); },
    onCue: value => cues.push(value), onCarry: value => carries.push(value), onError: error => errors.push(error),
  });
  scene.enter();
  return { scene, ctx, writes, cues, carries, errors, get saved() { return saved; },
    get requests() { return requests; }, ready: value => { ready = value; }, failCommit: value => { failCommit = value; } };
}
function wait(scene, seconds, dt = .05) { for (let i = 0; i < Math.round(seconds / dt); i++) scene.update(dt); }
function hold(scene, seconds) { scene.keyup(key); scene.update(.01); scene.key(key); wait(scene, seconds); }
function releaseToLift(f) {
  hold(f.scene, DURATION.address); hold(f.scene, DURATION.interrupt);
  wait(f.scene, DURATION.settling); assert.equal(f.scene.serialize().stage, 'lift');
}

test('release overlay preserves walking, look, Escape and unrelated interactions', () => {
  const { scene, ctx } = fixture();
  assert.equal(scene.blocksInput, false); assert.equal(scene.blocksWorld, false);
  assert.equal(scene.allowsLook, true); assert.equal(scene.suppressesHud, false);
  for (const event of [{ key: 'w' }, { key: 'Escape' }, { key: 'b' }, { controllerAction: 'move_forward' }])
    assert.equal(scene.key(event), false);
  ctx.inRange = false; assert.equal(scene.key(key), false);
  ctx.inRange = true; ctx.facing = false; assert.equal(scene.key(key), false);
  ctx.facing = true; assert.equal(scene.key(key), true);
});

test('selection key, repeats and a missing real tool cannot perform a release', () => {
  const f = fixture();
  f.scene.key(key); wait(f.scene, 5); assert.equal(f.scene.serialize().stage, 'address');
  f.scene.keyup(key); f.scene.update(.01);
  f.scene.key({ ...key, repeat: true }); wait(f.scene, 5);
  assert.equal(f.scene.serialize().holdSeconds, 0);
  f.ctx.hasRig = false; hold(f.scene, 5);
  assert.equal(f.scene.serialize().stage, 'address'); assert.equal(f.carries.length, 0);
  assert.equal(f.scene.view().canInteract, false);
  assert.match(f.scene.view().prompt, /SERVICE INTERFACE/);
});

test('all physical operations save transitions before the one earned carry callback', () => {
  const f = fixture();
  hold(f.scene, DURATION.address);
  assert.equal(f.saved.stage, 'interrupt'); assert.equal(f.carries.length, 0);
  // An E held across the transition does not also strike the fork.
  wait(f.scene, 5); assert.equal(f.scene.serialize().stage, 'interrupt');
  hold(f.scene, DURATION.interrupt); assert.equal(f.saved.stage, 'settling');
  wait(f.scene, DURATION.settling); assert.equal(f.saved.stage, 'lift');
  hold(f.scene, DURATION.lift); assert.equal(f.saved.stage, 'carried');
  assert.equal(f.carries.length, 1); assert.equal(f.carries[0].proof.lifted, true);
  wait(f.scene, 5); f.scene.key(key); f.scene.exit(); assert.equal(f.carries.length, 1);
  assert.deepEqual(f.cues.map(c => c.id), ['rig-seated', 'fork-struck', 'body-released', 'carry-ready']);
  assert.deepEqual(f.writes.filter(w => w.metadata.stageChanged).map(w => w.value.stage), ['interrupt', 'settling', 'lift', 'carried']);
});

test('a failed or loading model blocks every hold, and a retry never grants a release', async () => {
  const f = fixture({ ready: false });
  assert.equal(await f.scene.initialize(), false); assert.equal(f.requests, 1);
  assert.equal(f.scene.view().status, 'asset-error'); assert.equal(f.errors.length, 1);
  f.scene.keyup(key); f.scene.update(.01); f.scene.key(key); wait(f.scene, 20);
  assert.equal(f.scene.serialize().stage, 'address'); assert.equal(f.carries.length, 0);
  assert.equal(await f.scene.initialize(), false); assert.equal(f.requests, 2);
  f.ready(true); f.scene.update(.01);
  // Restoring assets has not preserved the prior held key.
  wait(f.scene, 5); assert.equal(f.scene.serialize().holdSeconds, 0);
  hold(f.scene, DURATION.address); assert.equal(f.scene.serialize().stage, 'interrupt');
});

test('look-away, focus, pause and scene resume cancel unfinished holds without losing earned stages', () => {
  for (const change of ['range', 'aim', 'focus', 'hidden', 'blocked', 'pause', 'resume', 'blur']) {
    const f = fixture(); hold(f.scene, DURATION.address); hold(f.scene, .6);
    assert.ok(f.scene.serialize().holdSeconds > .5);
    if (change === 'range') f.ctx.inRange = false;
    else if (change === 'aim') f.ctx.facing = false;
    else if (change === 'focus') f.ctx.focused = false;
    else if (change === 'hidden') f.ctx.hidden = true;
    else if (change === 'blocked') f.ctx.blocked = true;
    else f.scene[change]();
    f.scene.update(.05);
    assert.equal(f.scene.serialize().holdSeconds, 0, change);
    assert.equal(f.saved.holdSeconds, 0, `${change}: cancellation is saved immediately`);
    assert.equal(f.scene.serialize().proof.addressed, true);
    assert.equal(f.carries.length, 0);
  }
});

test('checkpoints preserve completed work, not a key held before reload or another run owner', () => {
  const first = fixture(); hold(first.scene, DURATION.address); hold(first.scene, .7);
  const checkpoint = first.scene.serialize(), resumed = fixture({ state: checkpoint });
  assert.equal(resumed.scene.serialize().stage, 'interrupt');
  assert.equal(resumed.scene.serialize().holdSeconds, 0);
  assert.equal(resumed.scene.serialize().requiresRelease, true);
  resumed.scene.key(key); wait(resumed.scene, 5); assert.equal(resumed.scene.serialize().stage, 'interrupt');
  resumed.ctx.runId = 'new-night'; hold(resumed.scene, 10);
  assert.equal(resumed.scene.serialize().stage, 'interrupt'); assert.equal(resumed.scene.key(key), false);
  assert.equal(resumed.carries.length, 0);
  const writes = resumed.writes.length;
  resumed.scene.exit();
  assert.equal(resumed.writes.length, writes, 'exit cannot save an old release into the new run');
});

test('active progress checkpoints are bounded, transitions and cancellations are immediate', () => {
  const f = fixture();
  f.scene.keyup(key); f.scene.update(.01); f.writes.length = 0;
  f.scene.key(key); wait(f.scene, 1);
  assert.equal(f.writes.length, 4, '60 Hz work must not write on every render frame');
  assert.equal(f.writes.every(w => w.metadata.reason === 'progress'), true);
  f.scene.keyup(key); f.scene.update(.01);
  assert.equal(f.writes.at(-1).metadata.reason, 'interrupted');
  assert.equal(f.writes.at(-1).value.holdSeconds, 0);
  f.writes.length = 0; wait(f.scene, 2); assert.equal(f.writes.length, 0, 'an idle pose does not rewrite storage');
});

test('a failed carry checkpoint withholds handoff until that exact earned state is saved', () => {
  const f = fixture(); releaseToLift(f);
  f.scene.keyup(key); f.scene.update(.01); f.scene.key(key); wait(f.scene, DURATION.lift - .05);
  f.failCommit(true); f.scene.update(.05);
  assert.equal(f.scene.serialize().stage, 'carried'); assert.equal(f.carries.length, 0);
  assert.equal(f.scene.view().status, 'checkpoint-error');
  wait(f.scene, 1); assert.equal(f.carries.length, 0);
  f.failCommit(false); wait(f.scene, .25);
  assert.equal(f.saved.stage, 'carried'); assert.equal(f.carries.length, 1);
  wait(f.scene, 1); assert.equal(f.carries.length, 1);
});

test('a carried checkpoint is inspectable but cannot manufacture a second earned edge', () => {
  const f = fixture(); releaseToLift(f); hold(f.scene, DURATION.lift);
  const resumed = fixture({ state: normalizeRecordistRelease(f.saved) });
  assert.equal(resumed.scene.view().carryReady, true);
  wait(resumed.scene, 10); assert.equal(resumed.carries.length, 0);
  const snapshot = resumed.scene.serialize(); snapshot.proof.lifted = false;
  assert.equal(resumed.scene.serialize().proof.lifted, true, 'public snapshots cannot mutate the scene');
});
