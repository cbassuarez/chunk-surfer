import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createChapelServiceRuntime, chapelServiceVoiceMix } from '../src/audio/chapel-service.js';
import { CHAPEL_SERVICE } from '../src/data/chapel-service-score.js';
import { chapelServiceFrame, chapelServiceWorldSources } from '../src/game/chapel-service.js';
import { CHAPEL_SERVICE_AUDIO_SOURCES } from '../src/data/chapel-service-audio.js';
import { flattenCredits } from '../src/data/credits.js';
import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';

const manifest = JSON.parse(fs.readFileSync('public/audio/chapel-service/manifest.json'));
const main = fs.readFileSync('src/main.js', 'utf8');
function fixture(bank = manifest) {
  const gains = [], sources = [], fetched = [];
  const param = () => ({ value: 0, calls: [], setTargetAtTime(...args) { this.calls.push(['target', ...args]); },
    setValueAtTime(...args) { this.calls.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.calls.push(['ramp', ...args]); }, cancelScheduledValues() {} });
  const node = () => ({ connect(other) { return other; }, disconnect() {} });
  const context = { currentTime: 0, sampleRate: 1000,
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createConvolver: () => node(),
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: {} }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBuffer: (n, length) => { const channels = Array.from({ length: n }, () => new Float32Array(length));
      return { getChannelData: i => channels[i] }; },
    decodeAudioData: async bytes => ({ duration: new DataView(bytes).getFloat64(0, true) }),
    createBufferSource() { const n = { ...node(), playbackRate: {}, starts: [], stops: [],
      start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } }; sources.push(n); return n; },
  };
  const fetcher = async file => {
    fetched.push(file);
    const clip = manifest.clips.find(c => c.file === file);
    return { ok: true, json: async () => bank, arrayBuffer: async () => {
      const bytes = new ArrayBuffer(8); new DataView(bytes).setFloat64(0, clip.duration, true); return bytes;
    } };
  };
  const runtime = createChapelServiceRuntime({ context, destination: node(), urlFor: f => f, fetcher, random: () => .5 });
  const input = { active: true, voices: ['officiant', 'front', 'middle', 'rear'].map((id, i) =>
    ({ id, dx: i - 1, dz: -4 - i, gain: 1, radius: 36, occlusionDb: 0 })) };
  return { context, runtime, input, gains, sources, fetched };
}

test('unavailable audio is inert; fixed world directions attenuate through real occlusion', () => {
  assert.equal(createChapelServiceRuntime().update({ active: true }).audible, false);
  const left = chapelServiceVoiceMix({ dx: -4, dz: 0, gain: 1 });
  const right = chapelServiceVoiceMix({ dx: 4, dz: 0, gain: 1 });
  assert.equal(left.gain, right.gain); assert.equal(left.pan, -right.pan);
  const closed = chapelServiceVoiceMix({ dx: -4, dz: 0, gain: 1, occlusionDb: 28 });
  assert.ok(closed.gain < left.gain * .05); assert.ok(closed.cutoff < left.cutoff);
  assert.equal(chapelServiceVoiceMix({ dx: 2, dz: 0, gain: 0 }).gain, 0);
  assert.equal(chapelServiceVoiceMix({ dx: 50, dz: 0, gain: 1, radius: 36 }).gain, 0);
});

test('real manifest is decoded once and entry joins an existing prayer, without replay on every frame', async () => {
  const f = fixture(); assert.equal(await f.runtime.ready(), true);
  assert.equal(f.fetched.length, manifest.clips.length + 1);
  const first = f.runtime.update(f.input);
  const prayer = first.playing.find(p => p.id === 'priest-pater-deliverance');
  assert.ok(prayer && prayer.at < 0);
  assert.ok(f.sources.some(s => Math.abs(s.starts[0][1] - 3.85) < .001), 'starts with the actual phrase offset');
  f.context.currentTime = .10;
  const again = f.runtime.update(f.input);
  assert.equal(again.scheduled, first.scheduled);
  assert.equal(f.fetched.length, manifest.clips.length + 1);
});

test('monitor protection fades the complete graph and re-entry seeks the service clock', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(f.input);
  const started = [...f.sources]; f.context.currentTime = .5;
  const muted = f.runtime.update({ ...f.input, muted: true });
  assert.equal(muted.audible, false); assert.equal(muted.sourceCount, 0);
  assert.deepEqual(f.gains[0].gain.calls.at(-1), ['target', 0, .5, CHAPEL_SERVICE.fadeOutSeconds]);
  assert.ok(started.every(s => s.stops.length === 1));
  f.context.currentTime = 2;
  const resumed = f.runtime.update(f.input);
  assert.ok(resumed.audible && resumed.phase > muted.phase);
  assert.ok(f.sources.slice(started.length).some(s => s.starts[0][1] > 5), 'resumes the current prayer, not its first word');
});

test('long absence cannot queue missed answers or grow active sources beyond the fixed budget', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(f.input);
  f.runtime.update({ active: false }); f.context.currentTime = 10000;
  const after = f.runtime.update(f.input);
  assert.ok(after.sourceCount <= 4 && after.sourceCount <= CHAPEL_SERVICE.maxSources);
  assert.ok(after.playing.every(p => p.until > 10000 && p.at < 10000.075));
  const scheduled = after.scheduled;
  for (let i = 0; i < 100; i++) f.runtime.update(f.input);
  assert.equal(f.runtime.frame().scheduled, scheduled);
  f.runtime.stop(); assert.equal(f.runtime.frame().sourceCount, 0);
  f.runtime.dispose(); assert.equal(f.runtime.update(f.input).active, false);
});

test('malformed bank and asset failures stay silent and never fall back to generated chant', async () => {
  const f = fixture({ ...manifest, clips: [{ ...manifest.clips[0], file: '../other.mp3' }] });
  assert.equal(await f.runtime.ready(), false);
  const state = f.runtime.update(f.input);
  assert.equal(state.loaded, false); assert.equal(state.audible, false);
  assert.match(state.failed, /Invalid chapel service clip/);
  assert.equal(f.sources.length, 0);
});

test('actual main wiring uses the world bus, checks finale without REC and ticks during special views', () => {
  FP.compile(conservatory.levels, conservatory);
  const here = FP.toRuntimePoint({ x: 92.5, y: 79.5 });
  const context = { storyMode: true, inRogue: true, planName: 'conservatory', sourceDriveSession: null, sourcePubScene: null,
    sourceContinuationScene: null, coastalMemoryScene: null,
    usingPlan: () => true, usingSpecialSpace: () => false, FP, CELL: .5, BODY_EYE_M: 1.62,
    chapelServiceFrame, chapelServiceWorldSources, chapelServicePlan: null, chapelServiceSources: [],
    chapelServiceOcclusionKey: '', chapelServiceOcclusion: new Map(),
    performance: { now: () => 1000 }, px: here.x, py: here.y,
    acousticSpatialAt: () => ({}), acousticFloorIdAt: () => 'upper', acousticOcclusionDb: () => 0,
    R3: { r3dLookAngles: () => ({ yaw: .2 }) },
    REC: { isRecording: () => false, isListening: () => false }, PB: { isPlaying: () => false },
    paused: false, scenes: { blocksWorld: () => false, top: () => null, worldView: () => null },
    activeBattleId: null, finaleActive: false, gameplayInputLifecycleActive: () => true,
    getSave: () => ({ settings: {} }), SPEECH: { speaking: () => null }, ZONE,
  };
  vm.createContext(context);
  const fn = main.match(/function currentChapelServiceInput\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn); vm.runInContext(fn, context);
  assert.equal(context.currentChapelServiceInput().active, true);
  context.finaleActive = true;
  assert.equal(context.currentChapelServiceInput().active, false, 'chapel REC goes straight to confrontation');
  context.finaleActive = false; context.REC.isListening = () => true;
  assert.equal(context.currentChapelServiceInput().muted, true);
  assert.match(main, /createChapelServiceRuntime\(\{context:actx,destination:sfxGain,/);
  assert.match(main.match(/function resetRunAudio[\s\S]*?\n\}/)[0], /chapelServiceAudio\?\.stop\?\.\(\)/);
  let ticks = 0;
  const tick = main.match(/if\(!sourceDriveSession[^\n]*tickStopListeningAudio\(\);\}\n\s+tickChapelServiceAudio\(\);/)[0];
  vm.runInNewContext(tick, { sourceDriveSession: {}, sourcePubScene: {}, tickChapelServiceAudio: () => ticks++ });
  assert.equal(ticks, 1, 'special view still ticks the service silent');
});

test('in-game credits carry source, licence and adaptation for every service recording', () => {
  const credits = flattenCredits().map(line => line.text).join('\n');
  for (const source of CHAPEL_SERVICE_AUDIO_SOURCES) {
    assert.ok(credits.includes(source.title) && credits.includes(source.author));
    assert.ok(credits.includes(source.url) && credits.includes(source.licenceUrl));
    assert.match(source.licence, /^CC0|^CC BY (3|4)\.0$/);
  }
  assert.match(credits, /Adapted: excerpts, levelling, world placement and procedural room tail/);
});

