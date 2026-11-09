import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoastalHandsScene, COASTAL_HANDS } from '../src/game/coastal-hands-scene.js';
import { HANDS_INTERACTION_MODE } from '../src/game/coastal-memory/hands-scene.js';

function fakeAudio() {
  const calls = [];
  return { calls, pauses: [], initialize: async () => true, update: (i) => calls.push(i), setPaused(value) {this.pauses.push(value);}, dispose() {} };
}

test('the hands scene initializes and reports ready', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  assert.equal(await scene.initialize(), true);
  assert.equal(scene.view().ready, true);
});

test('E picks the box up and E puts it back down', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  assert.equal(scene.view().mode, HANDS_INTERACTION_MODE.HANDLING);
  scene.key({ key: 'e', type: 'keydown' });
  assert.equal(scene.view().mode, HANDS_INTERACTION_MODE.AWAY);
});

test('holding the pin and cranking advances the winding and voices audio', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  scene.key({ key: 'f', type: 'keydown' });
  scene.key({ key: 'w', type: 'keydown' });
  for (let i = 0; i < 12; i++) scene.update(0.25);
  scene.keyup({ key: 'w' });
  scene.keyup({ key: 'f' });
  const view = scene.view();
  assert.ok(view.winding.score > 0, 'cranking must advance the tune');
  assert.ok(audio.calls.length > 0, 'the audio owner must be fed');
  assert.ok(audio.calls.some((c) => c.held === true), 'cranking is held');
});

test('releasing the pin slams the winding through the audio owner', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  scene.key({ key: 'f', type: 'keydown' });
  scene.key({ key: 'w', type: 'keydown' });
  for (let i = 0; i < 12; i++) scene.update(0.25);
  scene.keyup({ key: 'f' });
  const released = scene.view();
  assert.equal(released.winding.phase, 'slamming');
  assert.equal(released.winding.playbackRate, 0);
  // The audio owner saw an un-held update after the release.
  assert.ok(audio.calls.some((c) => c.held === false));
});

test('a keyboard catch and release within one frame reaches audio as a second genuine release', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio, startHandling: true });
  await scene.initialize();
  scene.key({ key: 'f', type: 'keydown' });
  scene.key({ key: 'w', type: 'keydown' });
  scene.update(.1);
  const playback = scene.view().winding.playbackSeconds;
  scene.keyup({ key: 'f' });
  assert.equal(scene.view().winding.phase, 'slamming');
  const releases = () => audio.calls.flatMap(call => call.events).filter(event => event.type === 'slam-start');
  assert.equal(releases().length, 1);
  const key = scene.view().winding.keyPhase;
  // No intervening update: both real input edges must reach the mechanism.
  scene.key({ key: 'f', type: 'keydown' });
  assert.equal(scene.view().winding.phase, 'held');
  assert.equal(scene.view().winding.keyPhase, key);
  scene.keyup({ key: 'f' });
  assert.equal(releases().length, 2);
  assert.equal(audio.calls.at(-1).events.filter(event => event.type === 'slam-start').length, 1);
  assert.equal(scene.view().winding.playbackSeconds, playback);
  scene.keyup({ key: 'f' });
  assert.equal(releases().length, 2, 'a duplicate keyup is not a new release');
  scene.exit();
});

test('pointer orbit while holding the key preserves its grip and cannot fabricate releases or playback time', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio, startHandling: true });
  await scene.initialize();
  scene.pointer({ type: 'pointerdown' });
  scene.update(.1);
  const before = scene.view(), firstCall = audio.calls.length;
  for (let i = 0; i < 20; i++) scene.pointer({ type: 'pointermove', movementX: 2, movementY: -1 });
  const after = scene.view();
  assert.notDeepEqual(after.boxPose.rotation, before.boxPose.rotation, 'orbit still changes the inspected orientation');
  assert.equal(after.winding.phase, 'cranking');
  assert.equal(after.winding.playbackSeconds, before.winding.playbackSeconds);
  assert.equal(after.winding.keyPhase, before.winding.keyPhase);
  assert.equal(after.winding.wind, before.winding.wind);
  assert.ok(audio.calls.slice(firstCall).every(call => call.held === true));
  assert.equal(audio.calls.slice(firstCall).flatMap(call => call.events).some(event => ['slam-start', 'play-stop'].includes(event.type)), false);
  scene.pointer({ type: 'pointerup' });
  assert.equal(audio.calls.flatMap(call => call.events).filter(event => event.type === 'slam-start').length, 1);
  scene.exit();
});

test('pause and focus loss freeze the tune, mute the owner and clear held winding input', async () => {
  const audio=fakeAudio(),scene=createCoastalHandsScene({context:{},destination:{},createAudio:()=>audio,startHandling:true});
  await scene.initialize();
  assert.equal(scene.view().handling,true,'the plinth pickup opens directly in hand');
  scene.pointer({type:'pointerdown'});scene.update(.25);
  assert.equal(scene.diagnostics().pinHeld,true);
  scene.pause();const held=scene.serialize();scene.update(.25);
  assert.deepEqual(scene.serialize(),held);assert.equal(audio.pauses.at(-1),true);
  assert.deepEqual(scene.diagnostics().keys,[]);assert.equal(scene.diagnostics().pinHeld,false);
  scene.resume();scene.blur();scene.update(.25);assert.equal(audio.pauses.at(-1),true);
  scene.focus();assert.equal(audio.pauses.at(-1),false);
  scene.exit();
});

test('continuous and zero-event input reaches audio, while the shell can be inspected without holding the key', async () => {
  const audio=fakeAudio(),scene=createCoastalHandsScene({context:{},destination:{},createAudio:()=>audio,startHandling:true});
  await scene.initialize();const before=audio.calls.length;
  scene.update(.016);assert.ok(audio.calls.length>before,'stationary state must reach the audio owner');
  scene.lookBy(.5,.2);assert.equal(scene.view().boxPose.yaw,.5);assert.equal(scene.view().boxPose.pitch,.2);
  scene.pointer({type:'pointerdown'});scene.update(.25);scene.pointer({type:'pointerup'});
  assert.equal(audio.calls.at(-1).held,false,'pointer release must arrive in the same input dispatch');
  scene.exit();
});

test('A/D orbit the box and Q shakes it', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  const before = scene.view().boxPose.yaw;
  scene.key({ key: 'd', type: 'keydown' });
  scene.update(0.25);
  scene.keyup({ key: 'd' });
  assert.ok(scene.view().boxPose.yaw > before, 'D must orbit the box');
  scene.key({ key: COASTAL_HANDS.shakeKey, type: 'keydown' });
  scene.update(0.25);
  assert.ok(audio.calls.some(c=>c.events.some(e=>e.type==='shake')), 'shake must reach the recorded rattle owner');
});

test('exit puts the box down, disposes audio and calls onExit', async () => {
  const audio = fakeAudio();
  let exited = null;
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio, onExit: (v) => { exited = v; } });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  scene.exit();
  assert.equal(scene.view().mode, HANDS_INTERACTION_MODE.AWAY);
  assert.ok(exited, 'onExit must fire');
});

test('actual coastal controls retain the projected centre through full yaw, pitch and roll turns',async()=>{
 const audio=fakeAudio(),eye=[1,2,3],worldFromLocal=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const scene=createCoastalHandsScene({eye,yaw:.4,pitch:-.3,worldFromLocal,context:{},destination:{},createAudio:()=>audio,startHandling:true});
 await scene.initialize();
 const centre=()=>{const m=scene.view().heldLocal;return[0,1,2].map(i=>m[4+i]*.023+m[12+i]);};
 const original=centre();
 for(const key of ['d','w',']']){scene.key({key,type:'keydown'});for(let i=0;i<30;i++)scene.update(.1);scene.keyup({key});const current=centre();current.forEach((n,i)=>assert.ok(Math.abs(n-original[i])<1e-8));}
 assert.ok(scene.view().boxPose.pitch>Math.PI,'inspection pitch must not hit the ordinary head-look clamp');
 assert.ok(audio.calls.some(c=>c.events.some(e=>e.type==='handling-rattle')));
 scene.key({key:'e',type:'keydown'});assert.equal(scene.allowsLook,false,'lowering must return control instead of leaving an empty handling owner');
});

test('concurrent entry shares one audio preparation and a late decode cannot resurrect a lowered scene',async()=>{
 let resolve,loads=0,rattles=0;
 const audio={initialize(){loads++;return new Promise(done=>{resolve=done;});},update(){},setPaused(){},dispose(){},rattle(){rattles++;}};
 const scene=createCoastalHandsScene({context:{},destination:{},createAudio:()=>audio,startHandling:true});
 const first=scene.initialize(),second=scene.initialize();assert.equal(first,second);
 await Promise.resolve();await Promise.resolve();assert.equal(loads,1);scene.exit();resolve(true);
 assert.equal(await first,false);assert.equal(rattles,0);assert.equal(scene.view().ready,false);
});

test('intentional lowering retains the release tail; interruption cancels it', async () => {
  for (const lower of [true, false]) {
    const audio = fakeAudio(), disposal = [];
    audio.dispose = options => disposal.push(options);
    const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio, startHandling: true });
    await scene.initialize();
    scene.pointer({ type: 'pointerdown' });scene.update(.1);
    const pauseCount = audio.pauses.length;
    if (lower) scene.key({ key: 'e', type: 'keydown' });else scene.exit();
    assert.equal(audio.calls.flatMap(call => call.events).filter(event => event.type === 'slam-start').length, 1);
    assert.deepEqual(disposal, [{ releaseTail: lower }]);
    assert.equal(audio.pauses.slice(pauseCount).includes(true), !lower, 'the intentional release is not immediately muted');
  }
});

test('unavailable release sound cannot spend winding time or prevent inspection and lowering', async () => {
  const audio = fakeAudio();audio.ready = () => false;
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio, startHandling: true });
  await scene.initialize();
  const before = scene.view();
  scene.pointer({ type: 'pointerdown' });scene.update(.25);
  scene.pointer({ type: 'pointermove', movementX: 12, movementY: 5 });
  assert.equal(scene.view().winding.playbackSeconds, before.winding.playbackSeconds);
  assert.equal(scene.view().winding.wind, 0);
  assert.notDeepEqual(scene.view().boxPose.rotation, before.boxPose.rotation);
  scene.key({ key: 'e', type: 'keydown' });
  assert.equal(scene.diagnostics().mode, HANDS_INTERACTION_MODE.AWAY);
});
