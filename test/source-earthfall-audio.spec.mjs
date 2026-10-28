import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createSourceEarthfallAudio, sourceEarthfallVoiceMix, SOURCE_EARTHFALL_AUDIO as CONFIG } from '../src/audio/source-earthfall.js';
import { freshSourceEarthfall, stepSourceEarthfall, sourceEarthfallFrame } from '../src/game/source-earthfall.js';

const manifest = JSON.parse(fs.readFileSync('public/audio/source-demolition/manifest.json'));
const listener = { x: 0, y: 101.62, z: -2, yaw: 0 };
const earth = { x: 0, y: 100, z: -14 };
const cue = (type, extra = {}) => ({ id: `earth:run1:${type}`, type, age: 0, position: earth, gain: 1, ...extra });
const frame = (events = [], extra = {}) => ({ active: true, sequenceId: 'earth', runId: 'run1', events,
  anchors: { earth, fallingMaterial: { x: 2, y: 103, z: -4 }, front: { x: 0, y: 101, z: -2 } }, ...extra });

function fixture({ context = null, manifestValue = manifest, hrtf = true, delay = true,
  noAudio = false, noDestination = false, contextKey = 'ctx', failedFile = null, wrongBytes = false,
  rate = 48000, decode = null } = {}) {
  const gains = [], sources = [], delays = [], panners = [], filters = [], fetches = [];
  const param = () => ({ value: 0, calls: [], setTargetAtTime(...a) { this.value = a[0]; this.calls.push(['target', ...a]); },
    setValueAtTime(...a) { this.value = a[0]; this.calls.push(['set', ...a]); },
    linearRampToValueAtTime(...a) { this.value = a[0]; this.calls.push(['ramp', ...a]); }, cancelScheduledValues() {} });
  const node = () => ({ connections: [], connect(n) { this.connections.push(n); return n; },
    disconnect(other) { this.connections = other ? this.connections.filter(n => n !== other) : []; this.disconnected = true; } });
  const ctx = context || { state: 'running', sampleRate: rate, currentTime: 0, decoded: 0,
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createBiquadFilter() { const n = { ...node(), frequency: param(), Q: {} }; filters.push(n); return n; },
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBufferSource() { const n = { ...node(), starts: [], stops: [], playbackRate: {},
      start(...a) { this.starts.push(a); }, stop(...a) { this.stops.push(a); } }; sources.push(n); return n; },
    async decodeAudioData(bytes) { this.decoded++; const duration = new DataView(bytes).getFloat64(0, true);
      return decode ? decode(duration) : { duration, numberOfChannels: 1, sampleRate: rate }; },
  };
  if (!context && hrtf) ctx.createPanner = () => { const n = { ...node(), positionX: param(), positionY: param(), positionZ: param() }; panners.push(n); return n; };
  if (!context && delay) ctx.createDelay = max => { const n = { ...node(), delayTime: param(), maxDelay: max }; delays.push(n); return n; };
  const destination = node(); let pair = noAudio ? null : { [contextKey]: ctx, ...(!noDestination ? { destination } : {}) };
  const fetcher = async url => {
    fetches.push(url);
    if (url === '/bank/manifest.json') return { ok: true, json: async () => manifestValue };
    if (url.endsWith(failedFile || '\u0000')) return { ok: false, status: 404 };
    const clip = manifest.clips.find(item => url.endsWith(item.file));
    return { ok: true, arrayBuffer: async () => { const bytes = new ArrayBuffer(wrongBytes ? 8 : clip.bytes);
      new DataView(bytes).setFloat64(0, clip.duration, true); return bytes; } };
  };
  const runtime = createSourceEarthfallAudio({ getAudio: () => pair, fetcher, urlFor: file => `/bank/${file}` });
  return { runtime, ctx, gains, sources, delays, panners, filters, fetches, destination,
    setAudio(value = { ctx, destination }) { pair = value; } };
}

test('earthfall reuses three exact shipped CC0 cuts without adding a bank or recording', () => {
  const ids = new Set(['restraint', 'failure-body', 'stone-spall']);
  const clips = manifest.clips.filter(item => ids.has(item.id));
  assert.equal(clips.length, 3);
  for (const clip of clips) {
    const bytes = fs.readFileSync(`public/audio/source-demolition/${clip.file}`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), clip.audioSHA);
    assert.ok(clip.measured.finite && clip.measured.peakDb < -9);
  }
  assert.ok(clips.reduce((n, item) => n + item.bytes, 0) < CONFIG.maxEncodedBytes);
  assert.ok(clips.reduce((n, item) => n + item.duration * 96000 * 4, 0) < CONFIG.maxDecodedBytes);
  assert.ok(manifest.sources.every(item => item.licence === 'CC0 1.0'));
  const amplitude = id => clips.find(item => item.id === id).gain * 10 ** (clips.find(item => item.id === id).measured.peakDb / 20);
  const scalarBound = CONFIG.masterGain * (amplitude('restraint') * (.45 + .495) + amplitude('failure-body') * .76 * (1 + CONFIG.residualGain)
    + amplitude('stone-spall') * (.30 + .42));
  assert.ok(scalarBound < .5, 'physical plus same-source send retains scalar headroom before spatial processing');
});

test('lazy subset decode requires the normal SFX bus and shares a context-local bank across controllers', async () => {
  for (const contextKey of ['ctx', 'context']) {
    const f = fixture({ contextKey });
    assert.equal(f.fetches.length, 0); f.runtime.update({ active: false, preload: true });
    assert.equal(await f.runtime.ready(), true); assert.equal(f.ctx.decoded, 3); assert.equal(f.fetches.length, 4);
    assert.equal(f.sources.length, 0); assert.equal(f.gains[0].connections[0], f.destination);
    assert.ok(!f.fetches.some(url => url.endsWith('joint-fracture.mp3')));
    const second = fixture({ context: f.ctx }); assert.equal(await second.runtime.ready(), true);
    assert.equal(second.fetches.length, 0); assert.equal(f.ctx.decoded, 3);
    f.runtime.destroy(); second.runtime.update(frame([cue('footing-loss')]), { listener });
    assert.equal(second.runtime.snapshot().sourceCount, 1, 'disposing one controller does not clear the shared decoded bank');
  }
  const missing = fixture({ noDestination: true }); assert.equal(await missing.runtime.ready(), false);
  missing.runtime.update(frame([cue('strain')]), { listener }); assert.equal(missing.sources.length, 0); assert.equal(missing.fetches.length, 0);
});

test('upper material remains world-fixed and becomes quieter, filtered and acoustically later across a100m descent', async () => {
  const f = fixture(); await f.runtime.ready();
  const high = f.runtime.update(frame([cue('strain')]), { listener });
  assert.equal(f.sources[0].starts[0][0], .005); assert.equal(f.sources[0].playbackRate.value, 1);
  const lowListener = { ...listener, y: 1.62 };
  const low = f.runtime.update(frame(), { listener: lowListener });
  assert.deepEqual(low.voices[0].position, earth);
  assert.ok(low.voices[0].mix.localY > 98 && low.voices[0].mix.gain < high.voices[0].mix.gain);
  assert.ok(low.voices[0].mix.cutoff < high.voices[0].mix.cutoff);
  assert.ok(Math.abs(f.delays[0].delayTime.value - low.voices[0].mix.distance / CONFIG.arrivalSpeed) < 1e-10);
  assert.ok(f.delays[0].delayTime.value > .28 && f.delays[0].delayTime.value < .31);
  assert.equal(sourceEarthfallVoiceMix({ x: 0, y: 1000, z: 0 }, lowListener).arrivalDelay, CONFIG.maxArrivalDelay);
  const turned = sourceEarthfallVoiceMix({ x: 8, y: 100, z: -14 }, { ...listener, yaw: Math.PI });
  assert.ok(turned.pan * sourceEarthfallVoiceMix({ x: 8, y: 100, z: -14 }, listener).pan < 0);
});

test('disjoint recorded support segments clear into held weight; the body starts only at footing loss', async () => {
  const f = fixture(); await f.runtime.ready();
  f.runtime.update(frame([cue('strain')]), { listener });
  const initiation = f.sources[0];
  assert.deepEqual(initiation.starts[0].slice(1), [0, CONFIG.initiationSplit]);
  f.ctx.currentTime = .6; f.runtime.update(frame([cue('fracture')]), { listener });
  assert.equal(f.sources.length, 2, 'fracture earns its own chronological source segment despite independent audio-clock drift');
  const fracture = f.sources[1];
  assert.equal(fracture.buffer, initiation.buffer);
  assert.deepEqual(fracture.starts[0].slice(1), [CONFIG.initiationSplit, CONFIG.initiationSeconds - CONFIG.initiationSplit]);
  assert.equal(initiation.starts[0][1] + initiation.starts[0][2], fracture.starts[0][1], 'support source intervals meet without any raw overlap');
  assert.ok(f.runtime.snapshot().voices.every(voice => voice.id === 'restraint'));
  assert.deepEqual(f.runtime.snapshot().voices.map(voice => [voice.sourceOffset, voice.sourceDuration]), [[0, .55], [.55, .55]]);
  f.ctx.currentTime = 2; f.runtime.update(frame(), { listener });
  assert.equal(f.runtime.snapshot().graphVoices, 0, 'held gap contains no rubble body or loop');
  f.ctx.currentTime = 3;
  const anchors = { earth, fallingMaterial: { x: 2, y: 55, z: -10 }, front: { x: 0, y: 52, z: -8 } };
  const state = f.runtime.update(frame([cue('footing-loss')], { anchors }), { listener: { ...listener, y: 53.62, z: -8 } });
  assert.equal(f.sources.length, 3); const source = f.sources[2], starts = JSON.stringify(source.starts);
  assert.equal(source.buffer.duration, 5.5); assert.equal(source.starts[0][0], 3.005);
  assert.equal(state.residualCount, 1); assert.equal(state.voices[1].derivedSend, true);
  assert.deepEqual(state.voices[0].position, anchors.fallingMaterial);
  assert.deepEqual(state.voices[1].position, anchors.front);
  assert.equal(state.voices[0].sourceEnd, state.voices[1].sourceEnd);
  assert.equal(state.voices[0].until, state.voices[1].until);
  f.ctx.currentTime = 10;
  f.runtime.update(frame([cue('footing-loss', { id: 'late-new-id' })]), { listener });
  assert.equal(f.sources.length, 3, 'the tail is never restarted after the recorded chronology ends');
  assert.equal(JSON.stringify(source.starts), starts);
});

test('catch and land are restrained physical contacts at the actual support, independent of effects settings', async () => {
  const f = fixture(); await f.runtime.ready();
  const catchPosition = { x: 3, y: 12, z: -17 }, landPosition = { x: 4, y: 0, z: -19 };
  const state = f.runtime.update(frame([cue('catch', { position: catchPosition }), cue('land', { position: landPosition })]),
    { listener: { ...listener, y: 1.62 }, effectsMode: 'off' });
  assert.equal(state.played, 2); assert.equal(state.residualCount, 0);
  assert.ok(state.voices.every(voice => voice.id === 'stone-spall'));
  assert.deepEqual(state.voices.map(voice => voice.position), [catchPosition, landPosition]);
  assert.ok(f.sources.every(source => source.playbackRate.value === 1));
  const settledCatch = { x: 3, y: 5, z: -17 };
  const moved = f.runtime.update(frame([], { anchors: { earth, catch: settledCatch } }), { listener, effectsMode: 'off' });
  assert.deepEqual(moved.voices[0].position, settledCatch, 'the contact tail follows the real compressing catch');
  assert.deepEqual(moved.voices[1].position, landPosition, 'lower landing contact stays on the lower floor');
});

test('recording, playback suspension, hidden/focus, context suspension and outside hard-cut all delayed sound', async () => {
  for (const mode of ['protected', 'suspended', 'hidden', 'focus', 'context', 'outside']) {
    const f = fixture(); await f.runtime.ready(); f.runtime.update(frame([cue('footing-loss')]), { listener });
    if (mode === 'context') f.ctx.state = 'interrupted';
    const options = { listener, ...(mode === 'focus' ? { focused: false } : mode === 'outside' || mode === 'context' ? {} : { [mode]: true }) };
    const muted = f.runtime.update(mode === 'outside' ? { active: false, events: [cue('fracture'), cue('catch')] } : frame([cue('fracture'), cue('catch')]), options);
    assert.equal(muted.graphVoices, 0, mode); assert.equal(muted.muted, true);
    assert.equal(f.gains[0].gain.value, 0); assert.equal(f.gains[0].gain.calls.at(-1)[0], 'set');
    assert.ok(f.sources.every(source => source.stops.length)); assert.ok(f.delays.every(node => node.disconnected));
    f.ctx.state = 'running'; f.runtime.update(frame([cue('fracture'), cue('footing-loss'), cue('catch')]), { listener });
    assert.equal(f.runtime.snapshot().sourceCount, 0, 'protected receipts cannot return as a burst');
    f.runtime.update(frame([cue('land')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 1);
  }
});

test('effects off removes only the derived branch; reduced dread leaves physical warning levels unchanged', async () => {
  const normal = fixture(); await normal.runtime.ready();
  const standard = normal.runtime.update(frame([cue('footing-loss')]), { listener });
  const bodySource = normal.sources[0], primaryOutput = normal.gains[2].connections[0];
  normal.runtime.update(frame(), { listener, effectsMode: 'off' });
  assert.equal(normal.runtime.snapshot().sourceCount, 1); assert.equal(normal.runtime.snapshot().residualCount, 0);
  assert.equal(normal.sources[0], bodySource); assert.deepEqual(normal.gains[2].connections, [primaryOutput]);
  for (const options of [{ reducedDread: true }, { effectsMode: 'reduced' }]) {
    const f = fixture(); await f.runtime.ready(); const state = f.runtime.update(frame([cue('footing-loss')]), { listener, ...options });
    assert.deepEqual(state.voices[0], standard.voices[0]);
    assert.deepEqual(f.gains[2].gain.calls, normal.gains[2].gain.calls);
    assert.equal(f.gains[1].gain.value, CONFIG.reducedResidualGain); assert.equal(state.reducedDread, true);
  }
  const off = fixture(); await off.runtime.ready();
  off.runtime.update(frame([cue('footing-loss')]), { listener, effectsMode: 'off' });
  off.runtime.update(frame([cue('footing-loss')]), { listener });
  assert.equal(off.runtime.snapshot().residualCount, 0, 'omitted presence is permanently receipted');
});

test('unready, missing-context, stale and restored cues are discarded rather than caught up', async () => {
  const pending = fixture(); pending.runtime.update(frame([cue('fracture')]), { listener }); await pending.runtime.ready();
  pending.runtime.update(frame([cue('fracture')]), { listener }); assert.equal(pending.sources.length, 0);
  const absent = fixture({ noAudio: true }); absent.runtime.update(frame([cue('strain')]), { listener }); absent.setAudio(); await absent.runtime.ready();
  absent.runtime.update(frame([cue('strain')]), { listener }); assert.equal(absent.sources.length, 0);
  const f = fixture(); await f.runtime.ready();
  f.runtime.update(frame([cue('fracture', { age: .17 })]), { listener });
  f.runtime.update(frame([cue('catch')], { restored: true }), { listener });
  f.runtime.update(frame([cue('strain', { age: null, at: null })]), { listener });
  f.runtime.update(frame([cue('land', { position: { x: null, y: null, z: null } })]), { listener });
  assert.equal(f.sources.length, 0); assert.equal(f.runtime.snapshot().receipts.length, 4);
});

test('a newly observed committed save treats even zero-age receipts as baseline; live physics still earns later cues', async () => {
  const restored = fixture(); await restored.runtime.ready();
  restored.runtime.update(frame([cue('fracture')], { committed: true, elapsed: .6 }), { listener });
  assert.equal(restored.sources.length, 0); assert.equal(restored.runtime.snapshot().history[0].reason, 'restored-baseline');
  const f = fixture(); await f.runtime.ready();
  let state = freshSourceEarthfall({ runId: 'actual-audio-route' });
  f.runtime.update(sourceEarthfallFrame(state), { listener });
  for (let i = 0; i < 720; i++) {
    state = stepSourceEarthfall(state, { dt: 1 / 60, forward: 1, assetsReady: true }).state;
    f.ctx.currentTime += 1 / 60;
    f.runtime.update(sourceEarthfallFrame(state), { listener: { x: state.x, y: state.feet + 1.62, z: state.z, yaw: state.yaw } });
  }
  assert.equal(state.committed, true, 'fixture must actually cross the upper threshold');
  assert.ok(f.runtime.snapshot().history.some(item => item.type === 'strain' && item.reason === 'played'));
  assert.ok(f.runtime.snapshot().history.some(item => item.type === 'fracture' && item.reason === 'played'));
  assert.equal(state.phase, 'landed', 'the same pure physics fixture must descend, contact the catch and reach the lower floor');
  for (const type of ['strain', 'fracture', 'footing-loss','stratum-0','stratum-1','stratum-2', 'catch', 'land']) {
    const receipts = f.runtime.snapshot().history.filter(item => item.type === type);
    assert.equal(receipts.length, 1, type); assert.equal(receipts[0].reason, 'played', type);
  }
});

test('delayed material tails survive source end briefly, then retire; stop/reset/new-run never resurrect them', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(frame([cue('strain')]), { listener });
  f.ctx.currentTime = CONFIG.initiationSplit + .01; f.sources[0].onended();
  assert.equal(f.runtime.snapshot().sourceCount, 0); assert.equal(f.runtime.snapshot().propagationTails, 1);
  f.ctx.currentTime = 2; f.runtime.update(frame(), { listener }); assert.equal(f.runtime.snapshot().graphVoices, 0);
  f.runtime.update(frame([cue('footing-loss')]), { listener }); f.runtime.stop();
  assert.equal(f.runtime.snapshot().graphVoices, 0); f.runtime.update(frame([cue('footing-loss')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 0);
  f.runtime.update(frame([cue('strain')], { runId: 'run2' }), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 1);
  f.runtime.reset(); assert.equal(f.runtime.snapshot().receipts.length, 0);
  const fetched = f.fetches.length; f.runtime.update(frame([cue('strain')]), { listener });
  assert.equal(f.runtime.snapshot().played, 1); assert.equal(f.fetches.length, fetched);
  f.runtime.destroy(); assert.equal(f.runtime.update(frame()).active, false); assert.equal(await f.runtime.ready(), false);
});

test('semantic duplicates are bounded and diagnostics retain only the current graph and finite receipts', async () => {
  const f = fixture(); await f.runtime.ready();
  for (let i = 0; i < 100; i++) f.runtime.update(frame([cue('strain', { id: `malformed:${i}` })]), { listener });
  assert.equal(f.sources.length, 1); assert.equal(f.runtime.snapshot().receipts.length, 1);
  f.runtime.update(frame(['fracture', 'footing-loss', 'catch', 'land'].map(type => cue(type))), { listener });
  assert.equal(f.runtime.snapshot().graphVoices, CONFIG.maxVoices); assert.equal(f.runtime.snapshot().receipts.length, 5);
  assert.equal(f.runtime.snapshot().residualCount, 1); assert.ok(f.runtime.snapshot().history.length <= 32);
});

test('invalid or failed shared material fails silent; reduced capability has an explicit stereo/onset fallback', async () => {
  for (const options of [
    { manifestValue: { ...manifest, clips: [] } },
    { manifestValue: { ...manifest, clips: manifest.clips.map(clip => clip.id === 'restraint' ? { ...clip, file: '../escape.mp3' } : clip) } },
    { manifestValue: { ...manifest, clips: manifest.clips.map(clip => ({ ...clip, bytes: CONFIG.maxEncodedBytes + 1 })) } },
    { manifestValue: { ...manifest, clips: manifest.clips.map(clip => ({ ...clip, gain: 2 })) } },
    { failedFile: 'failure-body.mp3' }, { wrongBytes: true }, { rate: 384000 },
    { decode: duration => ({ duration, numberOfChannels: 2 }) },
  ]) {
    const f = fixture(options); assert.equal(await f.runtime.ready(), false);
    f.runtime.update(frame([cue('fracture')]), { listener }); assert.equal(f.sources.length, 0); assert.ok(f.runtime.snapshot().failed);
  }
  const f = fixture({ hrtf: false, delay: false }); await f.runtime.ready();
  const state = f.runtime.update(frame([cue('strain')]), { listener });
  assert.match(state.positionMethod, /stereo/); assert.match(state.propagationMethod, /onset travel delay only/);
  assert.ok(Math.abs(f.sources[0].starts[0][0] - (.005 + sourceEarthfallVoiceMix(earth, listener).arrivalDelay)) < 1e-10);
});
