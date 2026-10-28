import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoastalMemoryScene, walkCoastalMemoryPose } from '../src/game/coastal-memory-scene.js';
import { beginCoastalMemory, normalizeCoastalMemory, requestCoastalReturn } from '../src/game/coastal-memory.js';
import { COASTAL_NOTE_COPY, COASTAL_MEMORY_LAYOUT } from '../src/data/coastal-memory.js';

const layout = { spawn: { x: 0, z: 3, feet: 5, yaw: 0, pitch: -.1 }, walkSpeed: 2,
  musicBox: { x: 0, y: 5.6, z: 0, interactionRadius: 1.45 },
  pierReturnPlane: { point: { x: 0, z: -3 }, normal: { x: 0, z: -1 }, halfWidth: 1.5 },
  supportAt: (x, z) => Math.abs(x) <= 3 && Math.abs(z) <= 5 ? { height: 5, walkable: true } : null,
  canOccupy: (x, z) => Math.abs(x) <= 2.76 && Math.abs(z) <= 4.76 && !(x >= .9 && x <= 1.7 && Math.abs(z) < 1),
};
const returnPose = { x: 3.123456789012, y: -4401.987654321, yaw: .78, facing: .6, pitch: -.23, floorH: 15.2 };
const opts = { layout, runId: 'foot-owner', entryDoorId: 'optional-door', returnPose };
const checkpoint = overrides => normalizeCoastalMemory({ ...beginCoastalMemory(null, opts), ...overrides }, opts);
function renderer() { return { frames: [], disposed: 0, initialized: 0,
  async initialize() { this.initialized++; return true; },
  render(frame, options) { this.frames.push({ frame: structuredClone(frame), options }); return true; },
  dispose() { this.disposed++; } }; }
function audio() { return { samples: [], updates: [], pauses: [], initialized: 0, disposed: 0, sampled: 0,
  initialize(input) { this.initialized++; this.updates.push(input); }, update(input) { this.updates.push(input); },
  sample() { this.sampled++; return { audibleSeconds: 0, recordingOffset: 0, sourceReady: true, audioRunning: true,
    ...(this.samples.shift() || {}) }; }, setPaused(value) { this.pauses.push(value); }, dispose() { this.disposed++; } }; }
async function make(extra = {}) {
  const r = renderer(), a = audio(), saves = [], overlays = [];
  const scene = createCoastalMemoryScene({ ...opts, renderer: r, audio: a,
    onCheckpoint: (state, reason) => saves.push({ state, reason }), paintOverlay: frame => overlays.push(frame), ...extra });
  await scene.initialize(); return { scene, r, a, saves, overlays };
}
const equal = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);

test('swept walking normalizes diagonals, follows support, slides and never tunnels across a blocked strip', () => {
  const pose = { x: 0, z: 0, feet: 5, yaw: Math.PI / 2, pitch: -.4 };
  const cardinal = walkCoastalMemoryPose(pose, { dt: .25, forward: 1 }, layout);
  const diagonal = walkCoastalMemoryPose(pose, { dt: .25, forward: 1, side: 1 }, layout);
  equal(Math.hypot(cardinal.x, cardinal.z), .5); equal(Math.hypot(diagonal.x, diagonal.z), .5);
  let at = pose;
  for (let n = 0; n < 12; n++) at = walkCoastalMemoryPose(at, { dt: .25, forward: 1 }, layout);
  assert.ok(at.x < .9); assert.equal(at.feet, 5); assert.equal(at.pitch, -.4);
  at = walkCoastalMemoryPose(at, { dt: .25, forward: 1, side: 1 }, layout);
  assert.ok(at.z > .2); assert.ok(at.x < .9);
  const edge = walkCoastalMemoryPose({ ...pose, x: -2.7, yaw: -Math.PI / 2 }, { dt: 99, forward: 1 }, layout);
  assert.ok(edge.x >= -2.76);
});

test('loading stays covered and late initialization after exit releases borrowed rendering once', async () => {
  let release; const r = renderer(); r.initialize = () => new Promise(resolve => { release = resolve; });
  const overlays = [], scene = createCoastalMemoryScene({ ...opts, renderer: r, paintOverlay: f => overlays.push(f) });
  const pending = scene.initialize(); await Promise.resolve(); scene.render();
  assert.equal(overlays.at(-1).coverAlpha, 1); assert.equal(scene.view().ready, false);
  const before = scene.serialize(); scene.key({ key: 'w' }); scene.update(.2); assert.deepEqual(scene.serialize(), before);
  scene.exit(); release(true); assert.equal(await pending, false); assert.equal(r.disposed, 1);
});

test('a failed picture exposes X return and restores Source once under cover without movement or audio credit', async () => {
  const r = renderer(), a = audio(), overlays = [], returns = [];
  r.initialize = async () => { throw Error('Coastal assets unavailable'); };
  const scene = createCoastalMemoryScene({ ...opts, renderer: r, audio: a, paintOverlay: value => overlays.push(value),
    onReturn: value => { returns.push(value); return true; } });
  assert.equal(await scene.initialize(), false); scene.render();
  assert.equal(overlays.at(-1).coverAlpha, 1); assert.equal(overlays.at(-1).ui.errorReturn, 'X · RETURN');
  assert.match(overlays.at(-1).ui.error, /assets unavailable/);
  scene.key({ key: 'w' }); scene.key({ key: 'r' }); scene.update(.25);
  assert.deepEqual(scene.serialize().pose, layout.spawn); assert.equal(scene.serialize().elapsed, 0);
  a.samples.push({ audibleSeconds: 9 }); scene.key({ key: 'x' });
  assert.equal(scene.serialize().status, 'return-pending'); assert.equal(scene.serialize().returnReceipt.reason, 'retreat');
  scene.update(.25); scene.update(.25); assert.equal(returns.length, 0);
  scene.pause(); const held = scene.serialize(); scene.update(.25); assert.deepEqual(scene.serialize(), held);
  scene.resume(); scene.update(.25); scene.update(.25);
  assert.equal(returns.length, 1); assert.deepEqual(returns[0].returnPose, returnPose);
  assert.equal(returns[0].checkpoint.returnElapsed, .9); assert.equal(returns[0].receipt.reason, 'retreat');
  assert.equal(scene.serialize().returnReceipt.delivered, true); assert.equal(scene.serialize().completed, false);
  assert.equal(scene.serialize().listenedSeconds, 0); assert.equal(scene.serialize().recordingHeard, false);
  assert.equal(a.sampled, 0); assert.equal(a.initialized, 0);
  scene.update(.25); scene.key({ key: 'x' }); assert.equal(returns.length, 1); scene.exit();
});

test('ordinary controls walk, turn and look without changing the exact saved Source return', async () => {
  const { scene, r, overlays } = await make();
  const before = scene.serialize(); scene.key({ key: 'w' }); scene.update(.2); scene.keyup({ key: 'w' });
  equal(scene.serialize().pose.z, before.pose.z - .4);
  scene.key({ key: 'ArrowLeft' }); scene.update(.2); scene.keyup({ key: 'ArrowLeft' });
  assert.ok(scene.serialize().pose.yaw < before.pose.yaw);
  scene.setLook({ yaw: .7, pitch: -.8 }); equal(scene.serialize().pose.yaw, .7); equal(scene.serialize().pose.pitch, -.8);
  scene.pointer({ type: 'pointerdown', button: 2, clientX: 10, clientY: 10 });
  scene.pointer({ type: 'pointermove', clientX: 30, clientY: 20 });
  equal(scene.serialize().pose.yaw, .78); equal(scene.serialize().pose.pitch, -.83);
  scene.render(); assert.equal(r.frames.at(-1).options.recorderHeld, false); assert.ok(overlays.at(-1).coverAlpha < 1);
  assert.deepEqual(scene.serialize().returnPose, returnPose); scene.exit();
});

test('explicit technical placement rejects unsupported bodies and records every accepted assignment', async () => {
  const traces = [], { scene } = await make({ onTrace: value => traces.push(value) });
  const original = scene.serialize();
  for (const pose of [{ x: 99 }, { x: NaN }, { x: 1.2, z: 0 }, { x: 0, z: 0, feet: 9 }])
    assert.equal(scene.setPose(pose), false);
  assert.deepEqual(scene.serialize(), original);
  assert.equal(scene.setPose({ x: -1, z: 1, yaw: -.7, pitch: -.4 }), true);
  assert.deepEqual(scene.serialize().pose, { x: -1, z: 1, feet: 5, yaw: -.7, pitch: -.4 });
  assert.equal(traces.filter(value => value.type === 'technical-pose-assignment').length, 1);
  assert.deepEqual(scene.serialize().returnPose, returnPose); scene.exit();
});

test('R is a non-repeating monitor toggle; proximity and simulation do not manufacture heard seconds', async () => {
  const { scene, a } = await make(); scene.key({ key: 'r' }); assert.equal(scene.view().recorderHeld, true);
  scene.key({ key: 'r', repeat: true }); assert.equal(scene.view().recorderHeld, true);
  for (let n = 0; n < 40; n++) scene.update(.25);
  assert.equal(scene.serialize().listenedSeconds, 0);
  a.samples.push({ audibleSeconds: 4.2, recordingOffset: 6.1 }); scene.update(.1);
  equal(scene.serialize().listenedSeconds, 4.2); equal(scene.serialize().recordingOffset, 6.1);
  scene.key({ key: 'r' }); assert.equal(scene.view().recorderHeld, false);
  a.samples.push({ audibleSeconds: 7 }); scene.update(.1); equal(scene.serialize().listenedSeconds, 4.2); scene.exit();
});

test('L calls the real host torch only once per live press and never during lifecycle holds', async () => {
  let calls = 0;
  const { scene } = await make({ checkpoint: checkpoint({ pose: { ...layout.spawn, z: 1 } }), onTorch: () => { calls++; return true; } });
  scene.key({ key: 'l' }); scene.key({ key: 'l', repeat: true }); assert.equal(calls, 1);
  scene.pause(); scene.key({ key: 'l' }); assert.equal(calls, 1); scene.resume();
  scene.blur(); scene.key({ key: 'l' }); assert.equal(calls, 1); scene.focus();
  scene.key({ key: 'e' }); assert.equal(scene.view().noteOpen, true); scene.key({ key: 'l' }); assert.equal(calls, 1);
  scene.key({ key: 'e' }); scene.key({ key: 'l' }); assert.equal(calls, 2);
  scene.requestReturn(); scene.key({ key: 'l' }); assert.equal(calls, 2);
  scene.exit(); scene.key({ key: 'l' }); assert.equal(calls, 2);
});

test('E opens a voluntary readable note in range, clears movement and uses identical physical copy', async () => {
  const { scene, overlays } = await make({ checkpoint: checkpoint({ pose: { ...layout.spawn, z: 1 } }) });
  scene.key({ key: 'w' }); scene.key({ key: 'e' });
  assert.equal(scene.view().noteOpen, true); assert.equal(scene.serialize().noteRead, true);
  const at = scene.serialize().pose; scene.update(.25); assert.deepEqual(scene.serialize().pose, at);
  scene.render(); assert.equal(overlays.at(-1).ui.noteCopy, COASTAL_NOTE_COPY);
  assert.equal(overlays.at(-1).ui.instruction, null);
  scene.key({ key: 'e' }); scene.key({ key: 'w', repeat: true }); scene.update(.25);
  assert.deepEqual(scene.serialize().pose, at); scene.render(); assert.equal(overlays.at(-1).ui.instruction, 'E · READ NOTE');
  scene.exit();
});

test('pause flushes the previous actually audible interval before freezing and clears held movement', async () => {
  const receipts = [], { scene, a } = await make({ onRecording: value => { receipts.push(value); return true; } });
  scene.key({ key: 'r' }); scene.key({ key: 'w' }); a.samples.push({ audibleSeconds: 9 });
  scene.pause(); assert.equal(scene.serialize().recordingHeard, true); assert.equal(scene.serialize().recordingReceipt.delivered, true);
  assert.equal(receipts.length, 1); assert.equal(a.pauses.at(-1), true);
  const stopped = scene.serialize(); scene.update(.25); assert.deepEqual(scene.serialize(), stopped);
  scene.resume(); scene.update(.25); assert.deepEqual(scene.serialize().pose, stopped.pose);
  assert.equal(scene.key({ key: 'Escape' }), false); assert.equal(scene.handlesEscape, false); scene.exit();
});

test('blur remains held while the document is visible; hidden and external pause freeze controls', async () => {
  let hidden = false, held = false;
  const { scene, a } = await make({ isHidden: () => hidden, isHeld: () => held });
  scene.key({ key: 'w' }); scene.blur(); const before = scene.serialize(); scene.render(); scene.update(.25);
  assert.deepEqual(scene.serialize(), before); assert.equal(a.pauses.at(-1), true);
  scene.focus(); scene.update(.25); assert.deepEqual(scene.serialize().pose, before.pose);
  for (const change of [() => { hidden = true; }, () => { hidden = false; held = true; }]) {
    change(); scene.key({ key: 'w' }); scene.update(.25); assert.deepEqual(scene.serialize().pose, before.pose);
  }
  held = false; scene.update(.25); assert.deepEqual(scene.serialize().pose, before.pose); scene.exit();
});

test('recording callback must explicitly succeed; an undelivered receipt survives reload and retries without new audio', async () => {
  const receipts = []; let success = false;
  const { scene, a } = await make({ onRecording: value => { receipts.push(value); return success; } });
  scene.key({ key: 'r' }); a.samples.push({ audibleSeconds: 9 }); scene.update(.1);
  assert.equal(receipts.length, 1); assert.equal(scene.serialize().recordingReceipt.delivered, false);
  const saved = scene.serialize(); scene.exit(); success = true;
  const resumed = await make({ checkpoint: saved, onRecording: value => { receipts.push(value); return true; } });
  assert.equal(receipts.length, 2); assert.equal(resumed.scene.serialize().recordingReceipt.delivered, true);
  assert.equal(resumed.scene.view().recorderHeld, false); assert.equal(resumed.scene.serialize().listenedSeconds, 9);
  resumed.scene.update(.25); assert.equal(receipts.length, 2); resumed.scene.exit();
});

test('return callback occurs only under full cover, is one-shot and may synchronously release the owner', async () => {
  const calls = [], pending = requestCoastalReturn(checkpoint(), { layout, reason: 'pier' }); let scene;
  const made = await make({ checkpoint: pending, onReturn: value => { calls.push(value); scene.exit(); return true; } }); scene = made.scene;
  for (let n = 0; n < 3; n++) scene.update(.25);
  assert.equal(calls.length, 0); assert.ok(scene.view().coverAlpha < 1);
  scene.pause(); scene.update(.25); assert.equal(calls.length, 0); scene.resume(); scene.update(.25);
  assert.equal(calls.length, 1); assert.equal(calls[0].checkpoint.returnElapsed, .9);
  assert.deepEqual(calls[0].returnPose, returnPose); assert.equal(calls[0].receipt.reason, 'pier');
  assert.equal(scene.serialize().completed, true); assert.equal(scene.serialize().rewardEarned, false);
  scene.update(.25); scene.exit(); assert.equal(calls.length, 1); assert.equal(made.r.disposed, 1);
});

test('a failed restore remains covered and undelivered until explicit retry succeeds', async () => {
  let calls = 0, success = false;
  const { scene } = await make({ checkpoint: requestCoastalReturn(checkpoint(), { layout, reason: 'pier' }),
    onReturn: () => { calls++; return success; } });
  for (let n = 0; n < 4; n++) scene.update(.25);
  assert.equal(calls, 1); assert.equal(scene.view().coverAlpha, 1); assert.equal(scene.serialize().returnReceipt.delivered, false);
  scene.update(.25); assert.equal(calls, 1); success = true; scene.key({ key: 'e' });
  assert.equal(calls, 2); assert.equal(scene.serialize().returnReceipt.delivered, true); scene.exit();
});

test('return fade reload resumes its durable cover without changing Source pose or requiring the box', async () => {
  let saved = requestCoastalReturn(checkpoint(), { layout, reason: 'pier' });
  saved.returnElapsed = .5; let calls = 0;
  const { scene } = await make({ checkpoint: saved, onReturn: value => { calls++; assert.deepEqual(value.returnPose, returnPose); return true; } });
  scene.update(.25); assert.equal(calls, 0); scene.update(.15); assert.equal(calls, 1);
  assert.equal(scene.serialize().noteRead, false); assert.equal(scene.serialize().recordingHeard, false); scene.exit();
});

test('actual authored spawn has a supported continuous approach to the box without a third driving control', async () => {
  const made = await make({ layout: COASTAL_MEMORY_LAYOUT, checkpoint: undefined }); const { scene } = made;
  const target = { x: COASTAL_MEMORY_LAYOUT.musicBox.x - 1.1, z: COASTAL_MEMORY_LAYOUT.musicBox.z };
  for (const [x, z] of COASTAL_MEMORY_LAYOUT.arrivalPath.slice(1)) {
    const start = scene.serialize().pose;
    const budget = Math.ceil(Math.hypot(x - start.x, z - start.z) / 2.1 * 60) + 120;
    scene.key({ key: 'w' });
    for (let n = 0; n < budget; n++) {
      const at = scene.serialize().pose;
      if (Math.hypot(at.x - x, at.z - z) < .12) break;
      scene.setLook({ yaw: Math.atan2(x - at.x, -(z - at.z)), pitch: -.1 });
      scene.update(1 / 60);
    }
    scene.keyup({ key: 'w' });
    const at = scene.serialize().pose;
    assert.ok(Math.hypot(at.x - x, at.z - z) < .12, `ordinary controls must reach ${x},${z}`);
  }
  const at = scene.serialize().pose; assert.ok(Math.hypot(at.x - target.x, at.z - target.z) < .25);
  assert.equal(scene.view().ui.instruction, 'E · READ NOTE'); assert.deepEqual(scene.serialize().returnPose, returnPose);
  scene.exit();
});

test('ordinary look lease and relative input update the coastal camera without borrowing the saved Source view',async()=>{
  const {scene}=await make();assert.equal(scene.allowsLook,true);const before=scene.lookAngles(),source=scene.serialize().returnPose;
  assert.equal(scene.lookBy(.4,-.2),true);equal(scene.lookAngles().yaw,before.yaw+.4);equal(scene.lookAngles().pitch,before.pitch-.2);
  assert.deepEqual(scene.serialize().returnPose,source);scene.pause();const frozen=scene.lookAngles();assert.equal(scene.allowsLook,false);assert.equal(scene.lookBy(.4,.2),false);assert.deepEqual(scene.lookAngles(),frozen);
  scene.resume();assert.equal(scene.allowsLook,true);scene.exit();assert.equal(scene.lookBy(.4,.2),false);
});
