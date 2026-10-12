import test from 'node:test';
import assert from 'node:assert/strict';
import { packShadowFrames, unpackShadowFrames, shadowFrameAt, CAUSAL_SPINE_IDS, validateCausalTape } from '../src/causal/tape.js';
import { CausalRecorder } from '../src/causal/recorder.js';
import { initGameStorage, loadLatestCausalTape } from '../src/platform/storage/storageService.js';
import { BrowserStorage } from '../src/platform/storage/browserStorage.js';
import { defaultSave } from '../src/platform/storage/defaults.js';
import { beginSourceReplayTake, completeSourceReplayTake, freshSourceReplayManifest,
  normalizeSourceReplayManifest, buildSourceReprisePlan } from '../src/game/source-replay-manifest.js';
import { makeSourceRepriseScene, SOURCE_REPRISE_CAST_SECONDS,
  SOURCE_REPRISE_UNFOLD_SECONDS, SOURCE_REPRISE_RECOGNITION_SECONDS } from '../src/game/source-reprise-scene.js';
import { createPressurePerformance } from '../src/game/pressure-performance.js';

const actor = (time = 0, extra = {}) => ({
  id: 'pressure:spawn-1', x: 12, y: -7, floorH: .25, strength: .92,
  radiusM: 6, heightM: 2.18, widthM: .65, glow: 1, mode: 'live',
  performance: { version: 1, role: 'live-pressure', heading: 3.13,
    clip: 'pressure_approach', time, loop: true, seed: 4417,
    manifestation: .92, motion: 'walk', cue: null, reducedMotion: false },
  ...extra,
});
const presentation = (clock, primary = actor(clock), secondary = null) => ({ version: 1, clock, primary, secondary });
const frame = (t, pressurePresentation, extra = {}) => ({ t, x: 0, y: 2, yaw: .2, pitch: 0,
  floorH: 0, roomId: 'service_corridor', renderGroup: 'ground', spaceId: 'conservatory',
  ...(pressurePresentation ? { pressurePresentation } : {}), ...extra });

test('bounded Pressure tracks survive base/delta/JSON packing and explicit actor removal in every space', () => {
  const first = presentation(0), second = presentation(1, actor(1), actor(1, { id: 'source-front',
    performance: { ...actor(1).performance, role: 'source-front', clip: 'pressure_hold' } }));
  const source = [frame(0, first), frame(1000, second), frame(2000, presentation(2, null, null)), frame(3000, null)];
  const decoded = unpackShadowFrames(JSON.parse(JSON.stringify(packShadowFrames(source))));
  assert.equal(decoded[0].pressurePresentation.primary.x, 12);
  assert.equal(decoded[1].pressurePresentation.secondary.performance.role, 'source-front');
  assert.equal(decoded[2].pressurePresentation.primary, null);
  assert.equal(decoded[2].pressurePresentation.secondary, null);
  assert.ok(!Object.hasOwn(decoded[3], 'pressurePresentation'), 'removal resurrected the previous actor');
  for (const spaceId of ['conservatory', 'source-space']) {
    const packed = packShadowFrames([frame(0, first, { spaceId })]);
    assert.equal(unpackShadowFrames(packed)[0].pressurePresentation.primary.id, first.primary.id);
  }
  const legacy = unpackShadowFrames(packShadowFrames([frame(0), frame(500)]));
  assert.ok(legacy.every(v => !Object.hasOwn(v, 'pressurePresentation')), 'legacy tape gained a live Pressure fallback');
  first.primary.x = 999;
  assert.equal(decoded[0].pressurePresentation.primary.x, 12, 'decoding retains caller-owned mutable actors');
});

test('Pressure replay interpolates its saved world position and heading but never crosses actor/clip/cue resets', () => {
  const a = actor(1), b = actor(2, { x: 14, floorH: .5,
    performance: { ...actor(2).performance, heading: -3.13 } });
  const tape = { shadowFrames: packShadowFrames([frame(0, presentation(1, a)), frame(1000, presentation(2, b))]) };
  const middle = shadowFrameAt(tape, 500).pressurePresentation;
  assert.equal(middle.primary.x, 13);
  assert.equal(middle.primary.floorH, .375);
  assert.equal(middle.primary.performance.time, 1.5);
  assert.ok(Math.abs(middle.primary.performance.heading) > 3.13, 'the saved actor spins through zero at the angle seam');
  const frozen = JSON.stringify(tape);
  assert.deepEqual(shadowFrameAt(tape, 500).pressurePresentation, middle);
  assert.equal(JSON.stringify(tape), frozen, 'read-only sampling mutated the saved performance');
  assert.equal(shadowFrameAt(tape, 5000).pressurePresentation.primary.performance.time, 2, 'sampling past the tape advanced its final pose');
  for (const reset of [
    { ...b, id: 'pressure:spawn-2' },
    { ...b, performance: { ...b.performance, clip: 'pressure_hold', time: 0 } },
    { ...b, performance: { ...b.performance, cue: { name: 'recoil', elapsed: 0 } } },
  ]) {
    const changed = { shadowFrames: packShadowFrames([frame(0, presentation(1, a)), frame(1000, presentation(2, reset))]) };
    const before = shadowFrameAt(changed, 250).pressurePresentation.primary;
    const after = shadowFrameAt(changed, 750).pressurePresentation.primary;
    assert.equal(before.performance.time, 1, 'old clip/actor time was blended into a reset');
    assert.equal(after.performance.time, reset.performance.time, 'new clip/actor time was blended from the old performance');
  }
  const crossedSpace = { shadowFrames: packShadowFrames([
    frame(0, presentation(1, a)), frame(1000, presentation(2, b), { spaceId: 'source-space' }),
  ]) };
  assert.equal(shadowFrameAt(crossedSpace, 250).pressurePresentation.primary.x, 12, 'a world transition interpolated an actor through the building');
});

test('a stationary observer records and actually stores continuing Pressure, with capture detached from live objects', async () => {
  const previousStorage = globalThis.localStorage, memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
  try {
    await initGameStorage({ kind: 'browser', gameVersion: 'PRESSURE-CHARACTER-TEST' });
    const recorder = new CausalRecorder(); recorder.begin({ runId: 'pressure-character-acceptance' });
    for (const id of CAUSAL_SPINE_IDS) recorder.recordAnchor({ id, verb: 'haunt', required: true,
      locus: { x: 0, y: 2, spaceId: 'conservatory' } });
    const mutable = presentation(0);
    for (let i = 0; i < 201; i++) {
      mutable.clock = i * .05;
      mutable.primary.performance.time = i * .05;
      recorder.tick(.05, frame(0, mutable));
    }
    assert.ok(recorder.frames.length >= 95, `stationary observing undersampled Pressure (${recorder.frames.length} samples)`);
    assert.equal(recorder.frames[0].pressurePresentation.primary.performance.time, 0, 'later live ticks rewrote the first captured pose');
    mutable.primary.x = 99;
    assert.equal(recorder.frames.at(-1).pressurePresentation.primary.x, 12, 'recording retained mutable world placement');
    const window=recorder.poseWindow({maxFrames:24,spaceId:'conservatory'});
    assert.equal(window.length,24);
    assert.equal(window[0].pressurePresentation.primary.performance.time,0,'the bounded Source reprise window lost its recorded Pressure');
    window[0].pressurePresentation.primary.x=999;
    assert.equal(recorder.frames[0].pressurePresentation.primary.x,12,'the reprise window mutated the captured night');
    // Presence/cue changes must be captured even inside the normal 100ms interval.
    recorder.tick(.001, frame(0, presentation(10.001, null)));
    assert.equal(recorder.frames.at(-1).pressurePresentation.primary, null);
    const result = await recorder.finalize({ summary: { id: 'return:pressure-character-acceptance' }, endingId: 'sacrifice', completedAt: 44 });
    assert.equal(result.ok, true);
    const saved = await loadLatestCausalTape();
    assert.equal(validateCausalTape(saved).ok, true);
    const decoded = unpackShadowFrames(saved.shadowFrames);
    assert.ok(decoded.length >= 95);
    assert.equal(decoded.at(-1).pressurePresentation.primary, null, 'saved replay resurrects the departed actor');
    const middle = shadowFrameAt(saved, 5050);
    assert.equal(middle.x, 0, 'the stationary witness moved');
    assert.ok(middle.pressurePresentation.primary.performance.time > 4.8);
    assert.equal(middle.pressurePresentation.primary.x, 12);
    const count = recorder.frames.length;
    recorder.tick(20, frame(0, presentation(30)));
    assert.equal(recorder.frames.length, count, 'a finalized take captured later live performance');
  } finally { globalThis.localStorage = previousStorage; }
});

test('a saved Source reprise carries captured Pressure through poseWindow, manifest, storage and player-paced reconstruction', async () => {
  const previousStorage=globalThis.localStorage,memory=new Map();
  globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
  try{
    const recorder=new CausalRecorder();recorder.begin({runId:'pressure-reprise-night'});
    for(let i=0;i<=40;i++)recorder.tick(.1,frame(0,presentation(i*.1),{x:i*.1,roomId:'main_b3'}));
    const approach=recorder.poseWindow({maxFrames:24,spaceId:'conservatory'});
    assert.equal(approach.length,24);
    const pending=beginSourceReplayTake(freshSourceReplayManifest({runId:'pressure-reprise-night'}),{
      ordinal:1,roomId:'main_b3',mark:{x:4,y:2,yaw:.8,pitch:-.2},approach,startedAt:1,
    });
    const manifest=completeSourceReplayTake(freshSourceReplayManifest({runId:'pressure-reprise-night'}),pending,{completedAt:4100});
    const browser=new BrowserStorage({gameVersion:'PRESSURE-REPRISE-TEST'});await browser.init();
    await browser.saveGame('autosave',{...defaultSave(),sourceReplay:manifest});
    approach[0].pressurePresentation.primary.x=999;
    const saved=await browser.loadSave('autosave');
    const restored=normalizeSourceReplayManifest(saved.sourceReplay,{runId:'pressure-reprise-night'});
    assert.equal(restored.takes[0].approach[0].pressurePresentation.primary.x,12,'save/reload lost the detached captured actor');
    const savedJSON=JSON.stringify(saved.sourceReplay),driver=createPressurePerformance();
    const scene=makeSourceRepriseScene({plan:buildSourceReprisePlan(restored)['call-site'],worldBacked:true,
      onShadowFrame:value=>value?driver.applyFrame(value.pressurePresentation??null):driver.clearReplay()});
    scene.enter();scene.update(SOURCE_REPRISE_CAST_SECONDS);scene.update(SOURCE_REPRISE_UNFOLD_SECONDS);
    assert.equal(scene.view().phase,'traverse');
    assert.equal(scene.worldView().suppressActors,true,'live actors must stay suppressed during reconstruction');
    assert.equal(driver.isReplay(),true);
    assert.equal(driver.snapshot().primary.id,'pressure:spawn-1');
    const before=scene.view().pose.pressurePresentation;
    scene.key({code:'KeyW'});scene.keyup({code:'KeyW'});
    const after=scene.view().pose.pressurePresentation;
    assert.ok(after.primary.performance.time>before.primary.performance.time,'deliberate movement did not recover the next captured pose');
    assert.equal(after.primary.x,12,'the saved actor was tethered to the reconstructed camera');
    assert.equal(after.primary.performance.heading,3.13);
    const frozen=driver.snapshot();scene.update(20);driver.tick(.25,{primary:null,secondary:null,suspended:true});
    assert.deepEqual(driver.snapshot(),frozen,'waiting in a read-only reprise advanced or erased its recorded performance');
    const view=scene.view();view.pose.pressurePresentation.primary.x=888;
    assert.equal(scene.view().pose.pressurePresentation.primary.x,12,'a view consumer can rewrite the reconstructed performance');
    for(let n=0;n<20&&scene.view().phase==='traverse';n++){scene.key({code:'KeyW'});scene.keyup({code:'KeyW'});}
    assert.equal(scene.view().phase,'recognition');
    assert.equal(scene.view().pose.pressurePresentation.primary.performance.time,4,'the exact recorder mark discarded the last captured actor');
    scene.update(SOURCE_REPRISE_RECOGNITION_SECONDS);
    assert.equal(scene.view().shadowPose.pressurePresentation.primary.performance.heading,3.13,'the player-shadow recognition turn rotated a separate saved actor');
    scene.exit();assert.equal(driver.isReplay(),false);
    assert.equal(JSON.stringify(saved.sourceReplay),savedJSON,'reconstruction mutated the durable take');
    const legacy=makeSourceRepriseScene({plan:{id:'call-site',segments:[{roomId:'main_b3',frames:[{x:0,y:0},{x:4,y:0}]}]}});
    assert.ok(!Object.hasOwn(legacy.view().pose,'pressurePresentation'),'a legacy reprise invents a live Pressure actor');
  }finally{globalThis.localStorage=previousStorage;}
});
