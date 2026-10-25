import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSourceIVScene } from '../src/game/source-iv-scene.js';
import { freshSourceIV, normalizeSourceIV, stepSourceIV, sourceIVFrame, sourceIVFocus } from '../src/game/source-iv.js';
import { SOURCE_IV as C } from '../src/data/source-iv.js';

const copy = value => JSON.parse(JSON.stringify(value));
const fresh = () => freshSourceIV({ runId: 'source-IV-scene-test', returnPose: { x: 20, y: 30, yaw: 0 } });
const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
const updateFor = (scene, seconds) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) scene.update(Math.min(1 / 60, seconds - n / 60)); };
function farDoor() { return { ...fresh(), x: C.exit.x, z: C.exit.z + 1.3 }; }
function completed() {
  let state = farDoor(); state = stepSourceIV(state, { interact: true }).state;
  for (let n = 0; n < 60; n++) state = stepSourceIV(state, { dt: 1 / 60 }).state;
  for (let n = 0; n < 40; n++) state = stepSourceIV(state, { dt: 1 / 60, forward: 1 }).state;
  assert.equal(state.status, 'completed'); assert.equal(state.exitReceipt.delivered, false); return state;
}
function harness(options = {}) {
  const checkpoints = [], sounds = [], errors = [], completes = [], exits = [], draws = [], traces = [];
  const presentation = { protected: false };
  let ready = true, initializations = 0, disposals = 0, clears = 0;
  const scene = createSourceIVScene({ checkpoint: options.checkpoint || fresh(), presentation: () => presentation,
    renderer: { initialize() { initializations++; return options.initialize?.() ?? true; }, ready: () => ready,
      render(state, mode) { draws.push({ state: copy(state), mode: copy(mode) }); return options.render?.() ?? true; },
      dispose() { disposals++; }, clear() { clears++; } },
    onCheckpoint(value, metadata) { checkpoints.push({ value: copy(value), metadata: copy(metadata) }); },
    onSound(value) { sounds.push(copy(value)); }, onError(error) { errors.push(String(error?.message || error)); },
    onTrace(value) { traces.push(copy(value)); },
    onComplete(value) { completes.push(copy(value)); return options.onComplete?.(value) ?? true; },
    onExit(value) { exits.push(copy(value)); },
  });
  return { scene, presentation, checkpoints, sounds, errors, completes, exits, draws, traces,
    ready(value) { ready = value; }, stats: () => ({ initializations, disposals, clears }) };
}

test('Source IV waits for its actual renderer and clears input offered during loading or a residency outage', async () => {
  let release;
  const h = harness({ initialize: () => new Promise(resolve => { release = resolve; }) }), initial = h.scene.serialize();
  const loading = h.scene.initialize(); assert.equal(h.scene.initialize(), loading);
  h.scene.key({ key: 'w' }); h.scene.update(99); h.scene.setLook({ yaw: 1 });
  assert.deepEqual(h.scene.serialize(), initial); assert.deepEqual(h.sounds, []);
  await flush(); release(true); assert.equal(await loading, true); assert.equal(h.stats().initializations, 1);
  h.scene.update(.1); assert.equal(h.scene.serialize().z, initial.z);
  h.scene.key({ key: 'w' }); h.ready(false); h.scene.update(.25);
  const stopped = h.scene.serialize(); h.ready(true); h.scene.update(.1);
  assert.equal(h.scene.serialize().z, stopped.z); assert.deepEqual(h.sounds, []); h.scene.exit();
});

test('ready play and loading draw no gameplay captions, including beside the final door', async () => {
  const source=readFileSync(new URL('../src/game/source-iv-scene.js',import.meta.url),'utf8');
  // Substitute only the text drawing boundary. Run the actual scene factory
  // with its actual physical controller, rather than a second test presenter.
  const factory=new Function('normalizeSourceIV','stepSourceIV','sourceIVFrame','sourceIVFocus','uiSize','uiCenter',
    source.replace(/^import[^\n]*\n/gm,'').replace('export function createSourceIVScene','return function createSourceIVScene'));
  const words=[],draws=[];
  const create=factory(normalizeSourceIV,stepSourceIV,sourceIVFrame,sourceIVFocus,
    ()=>({cols:120,rows:60}),(...args)=>words.push(args));
  const scene=create({checkpoint:farDoor(),renderer:{initialize:()=>true,ready:()=>true,
    clear(){},render(state){draws.push(copy(state));return true;}}});
  scene.render();assert.deepEqual(words,[],'loading stays visually within the transition');
  await scene.initialize();assert.ok(scene.view().focus);
  scene.render();scene.key({key:'e'});updateFor(scene,.9);scene.render();
  assert.equal(draws.length,2);assert.deepEqual(words,[],'the visible door and its physical swing carry the interaction');
  scene.exit();
});

test('IV traces bind route, gaze, door motion and the completed threshold without advancing protected play', async () => {
  const h=harness({checkpoint:farDoor()});await h.scene.initialize();
  assert.equal(h.traces[0].type,'ready');assert.equal(h.traces[0].sequence,'source-IV');
  h.scene.key({key:'e'});updateFor(h.scene,1);
  assert.ok(h.traces.some(t=>t.type==='event'&&t.event.type==='door'&&t.doorOpen));
  assert.ok(h.traces.some(t=>t.type==='pose'&&t.doorProgress>0&&Number.isFinite(t.yaw)));
  h.scene.pause();const paused=h.traces.length;h.scene.update(20);assert.equal(h.traces.length,paused);
  h.scene.resume();h.scene.key({key:'w'});updateFor(h.scene,2);await flush();
  assert.ok(h.traces.some(t=>t.type==='event'&&t.event.type==='complete'&&t.z<=C.exit.z));
  assert.equal(h.traces.filter(t=>t.type==='handoff').length,1);
  h.scene.exit();
});

test('Source IV emits footsteps only for real movement and the door sound only for a fresh interaction', async () => {
  const h = harness({ checkpoint: farDoor() }); await h.scene.initialize();
  h.scene.key({ key: 'w' }); updateFor(h.scene, 1);
  assert.equal(h.scene.serialize().status, 'active');
  const blocked = h.scene.serialize(), count = h.sounds.length; updateFor(h.scene, .5);
  assert.equal(h.scene.serialize().z, blocked.z); assert.equal(h.sounds.length, count, 'walking against a closed leaf cannot generate more steps');
  h.scene.keyup({ key: 'w' }); h.scene.key({ key: 'e', repeat: true }); assert.equal(h.scene.serialize().exitDoor.open, false);
  h.scene.key({ key: 'e' }); assert.equal(h.scene.serialize().exitDoor.open, true);
  assert.equal(h.sounds.filter(s => s.type === 'door').length, 1);
  assert.ok(h.sounds.some(s => s.type === 'footstep')); h.scene.exit();
});

test('pause, recording and focus protection freeze body, look, sound and delayed completion, requiring fresh movement', async () => {
  for (const protection of [{ protected: true }, { suspended: true }, { hidden: true }, { focused: false }]) {
    const h = harness(); await h.scene.initialize(); h.scene.key({ key: 'w' }); h.scene.update(.2);
    h.scene.pointer({ type: 'pointerdown', button: 2, clientX: 10, clientY: 10 });
    Object.assign(h.presentation, protection); const before = h.scene.serialize(), sounds = h.sounds.length;
    h.scene.key({ key: 'd' }); h.scene.update(20); h.scene.setLook({ yaw: 2 });
    h.scene.pointer({ type: 'pointermove', clientX: 100, clientY: 100 });
    assert.deepEqual(h.scene.serialize(), before); assert.equal(h.sounds.length, sounds);
    for (const key of Object.keys(protection)) delete h.presentation[key];
    h.scene.update(.1); assert.equal(h.scene.serialize().x, before.x); assert.equal(h.scene.serialize().z, before.z);
    h.scene.key({ key: 'd' }); h.scene.update(.1); assert.ok(h.scene.serialize().x > before.x); h.scene.exit();
  }
  const h = harness({ checkpoint: completed() }); await h.scene.initialize();
  h.scene.update(.25); const hold = h.scene.view().hold; h.scene.pause(); h.scene.update(20);
  assert.equal(h.scene.view().hold, hold); assert.equal(h.completes.length, 0);
  h.scene.resume(); h.presentation.protected = true; h.scene.update(20);
  assert.equal(h.scene.view().hold, hold); assert.equal(h.completes.length, 0); h.scene.exit();
});

test('opening the far door does not finish; physical crossing precedes a lived final hold and one delayed host dispatch', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; }), h = harness({ checkpoint: farDoor(), onComplete: () => waiting });
  await h.scene.initialize(); h.scene.key({ key: 'e' }); updateFor(h.scene, 1);
  assert.equal(h.completes.length, 0); assert.equal(h.scene.serialize().status, 'active');
  h.scene.key({ key: 'w' });
  for (let n = 0; n < 100 && h.scene.serialize().status !== 'completed'; n++) h.scene.update(1 / 60);
  const crossed = h.scene.serialize(); assert.equal(crossed.status, 'completed'); assert.ok(crossed.z <= C.exit.z);
  assert.equal(h.completes.length, 0); updateFor(h.scene, 1.3); assert.equal(h.completes.length, 0);
  updateFor(h.scene, .2); assert.equal(h.completes.length, 1); assert.equal(h.scene.view().dispatching, true);
  assert.equal(h.completes[0].checkpoint.exitReceipt.id, crossed.exitReceipt.id);
  const saves = h.checkpoints.length;
  h.scene.key({ key: 'w' }); h.scene.key({ key: 'e' }); h.scene.update(20); h.scene.key({ key: 'Escape' });
  assert.deepEqual(h.scene.serialize(), crossed); assert.equal(h.checkpoints.length, saves); assert.equal(h.completes.length, 1);
  release(true); await flush(); h.scene.exit(); assert.equal(h.stats().disposals, 1);
});

test('a saved pending final hold resumes without changing its completion receipt and retry is once per fresh E', async () => {
  let attempts = 0;
  const checkpoint = completed(), h = harness({ checkpoint, onComplete: () => ++attempts > 1 });
  await h.scene.initialize(); assert.equal(h.completes.length, 0); assert.equal(h.scene.view().hold, 0);
  updateFor(h.scene, 1.5); await flush(); assert.equal(h.completes.length, 1); assert.ok(h.scene.view().error);
  assert.equal(h.scene.view().dispatching, false); const saved = h.scene.serialize();
  h.scene.key({ key: 'e', repeat: true }); h.scene.update(20); assert.equal(h.completes.length, 1);
  h.scene.key({ key: 'e' }); h.scene.key({ key: 'e' }); await flush();
  assert.equal(h.completes.length, 2); assert.equal(h.scene.view().dispatching, true);
  assert.deepEqual(h.scene.serialize(), saved); assert.equal(h.completes[1].checkpoint.exitReceipt.id, checkpoint.exitReceipt.id);
  h.scene.exit(); const delivered = copy(checkpoint); delivered.exitReceipt.delivered = true;
  const acknowledged = harness({ checkpoint: delivered }); await acknowledged.scene.initialize(); updateFor(acknowledged.scene, 2); await flush();
  assert.equal(acknowledged.completes.length, 0, 'acknowledged completion is routed by the host without another return record'); acknowledged.scene.exit();
});

test('disposal during loading or pending host completion is idempotent and cannot write later', async () => {
  let release;
  const h = harness({ initialize: () => new Promise(resolve => { release = resolve; }) });
  const loading = h.scene.initialize(); await flush(); assert.equal(h.scene.exit(), true); assert.equal(h.scene.exit(), false);
  const saves = h.checkpoints.length; release(true); assert.equal(await loading, false);
  h.scene.update(10); h.scene.key({ key: 'w' }); h.scene.key({ key: 'Escape' }); h.scene.render(); h.scene.pause(); h.scene.resume();
  assert.equal(h.checkpoints.length, saves); assert.equal(h.stats().disposals, 1); assert.equal(h.exits.length, 1); assert.deepEqual(h.sounds, []);
  let complete;
  const pending = harness({ checkpoint: completed(), onComplete: () => new Promise(resolve => { complete = resolve; }) });
  await pending.scene.initialize(); updateFor(pending.scene, 1.5); assert.equal(pending.completes.length, 1);
  pending.scene.exit(); const pendingSaves = pending.checkpoints.length; complete(false); await flush();
  assert.equal(pending.checkpoints.length, pendingSaves); assert.deepEqual(pending.errors, []); assert.equal(pending.stats().disposals, 1);
});

test('failed initialization or drawing cannot advance the destination or leak footsteps', async () => {
  const loadingFailure = harness({ initialize: () => false }); assert.equal(await loadingFailure.scene.initialize(), false);
  const initial = loadingFailure.scene.serialize(); loadingFailure.scene.key({ key: 'w' }); loadingFailure.scene.update(99);
  assert.deepEqual(loadingFailure.scene.serialize(), initial); assert.equal(loadingFailure.errors.length, 1); assert.deepEqual(loadingFailure.sounds, []); loadingFailure.scene.exit();
  const drawFailure = harness({ render: () => false }); await drawFailure.scene.initialize(); drawFailure.scene.render();
  const stopped = drawFailure.scene.serialize(); drawFailure.scene.key({ key: 'w' }); drawFailure.scene.update(99);
  assert.deepEqual(drawFailure.scene.serialize(), stopped); assert.equal(drawFailure.errors.length, 1); assert.deepEqual(drawFailure.sounds, []);
  assert.equal(drawFailure.completes.length, 0); drawFailure.scene.exit();
});
