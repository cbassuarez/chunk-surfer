import assert from 'node:assert/strict';
import { hushMixTargets, createHushMix } from '../src/audio/hush-mix.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const field = {
  absorption: { audio: .8, monitor: .9 },
  presentation: { audio: .8, monitor: .9, hiss: 1, softenCuts: false },
};
const full = hushMixTargets(field, {}, { monitorGain: 1, monitorOpen: true });
const reducedMonitor = hushMixTargets(field, {}, { monitorGain: .2, monitorOpen: true });
const closedMonitor = hushMixTargets(field, {}, { monitorGain: 1, monitorOpen: false });
assert.equal(full.worldGain, reducedMonitor.worldGain);
assert.equal(full.worldLowpassHz, reducedMonitor.worldLowpassHz);
assert.ok(reducedMonitor.monitorDryGain < full.monitorDryGain);
assert.ok(closedMonitor.monitorDryGain < full.monitorDryGain);
assert.ok(full.hissGain > 0);

const neutral = hushMixTargets(null, {}, { monitorGain: 1, monitorOpen: true });
assert.equal(neutral.worldGain, 1);
assert.equal(neutral.directGain, 1);
assert.equal(neutral.hissGain, 0);

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const before = structuredClone(field);
for (const [monitorFit, surroundingFit] of [[1.15,.9],[.85,1.1]]) {
  const fitted = hushMixTargets(field, {}, { monitorGain: 1, monitorOpen: true,
    headphoneMonitorScale: monitorFit, headphoneSurroundingScale: surroundingFit });
  near(fitted.worldGain, full.worldGain * surroundingFit);
  near(fitted.directGain, full.directGain * surroundingFit);
  near(fitted.monitorDryGain, full.monitorDryGain * monitorFit);
  near(fitted.hissGain, full.hissGain * monitorFit);
  assert.equal(fitted.worldLowpassHz, full.worldLowpassHz);
  assert.equal(fitted.fieldAmount, full.fieldAmount);
}
assert.deepEqual(field, before, 'equipment output shaping cannot rewrite the raw HUSH field');

// Exercise the live graph's setter, including its reapplication of the last
// field and user fader, without loading audio or touching the real microphone.
const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value=value; },
  linearRampToValueAtTime(value) { this.value=value; } });
const node = () => ({ gain:param(),frequency:param(),Q:param(),connect() {},disconnect() {},start() {},stop() {} });
const ctx = { currentTime: 0, sampleRate: 10, createGain: node, createBiquadFilter: node, createBufferSource: node,
  createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
  decodeAudioData: async () => ({ duration: 1 }) };
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
let mix;
try {
  mix=createHushMix(ctx, { worldDestination:{},directDestination:{} });
  await mix.preloadAll();
  mix.applyField(field, {}, { monitorGain:.4,monitorOpen:true });
  const original=mix.snapshot();
  mix.setHeadphoneMix(1.15,.9);
  near(mix.snapshot().monitorDryGain,original.monitorDryGain*1.15);
  near(mix.snapshot().worldGain,original.worldGain*.9);
  mix.setHeadphoneMix(1,1);
  near(mix.snapshot().monitorDryGain,original.monitorDryGain);
  near(mix.snapshot().worldGain,original.worldGain);
} finally { mix?.destroy();globalThis.fetch=oldFetch; }

// The actual frame-loop call resets the fit outside LISTEN, even while a take
// is recording or playing. Captions, gameplay hearing and consent are absent.
const main=readFileSync('src/main.js','utf8');
const start=main.indexOf('function updateAudio(){');
const end=main.indexOf('hushAudioMix?.setProgramMode?',start);
assert.ok(start>=0&&end>start);
const fittedUpdate=main.slice(start+'function updateAudio(){'.length,end);
for(const storyMode of [false,true])for(const listening of [false,true])for(const fitted of [false,true]){
  const calls=[];
  const acousticState={noise:.22,hearing:.4};
  vm.runInNewContext(fittedUpdate,{storyMode,REC:{isListening:()=>listening},flagTest:()=>fitted,
    activeKitEffects:{monitorGainScale:1.15,surroundingGainScale:.9},acousticState,
    hushAudioMix:{setHeadphoneMix:(...values)=>calls.push(values)}});
  assert.deepEqual(calls,storyMode&&listening&&fitted?[[1.15,.9]]:[[1,1]]);
  assert.deepEqual(acousticState,{noise:.22,hearing:.4});
}
assert.doesNotMatch(fittedUpdate,/emitNoise|configurePresence|micInit|micInput/);

console.log('hush mix tests ok');
