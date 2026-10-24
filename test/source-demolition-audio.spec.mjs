import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SOURCE_DEMOLITION_AUDIO as CONFIG, SOURCE_DEMOLITION_AUDIO_SOURCES as SOURCES } from '../src/data/source-demolition-audio.js';
import { createSourceDemolitionAudio, sourceDemolitionVoiceMix, sourceDemolitionReflections } from '../src/audio/source-demolition.js';
import { normalizeSourceDemolition, advanceSourceDemolition, sourceDemolitionFrame } from '../src/game/source-demolition.js';
import { SOURCE_DEMOLITION as PLAN } from '../src/data/source-demolition.js';

const manifest = JSON.parse(fs.readFileSync('public/audio/source-demolition/manifest.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const listener = { x: 0, y: 1.65, z: 20, yaw: 0 };
const position = { x: -4, y: 9, z: 0 };
const cue = (type, extra = {}) => ({ id: `first:${type}`, type, age: 0, gain: 1, position, ...extra });
const frame = events => ({ active: true, sequenceId: 'first', events, anchors: { front: { x: 1, y: 2, z: 7 } } });

function fixture({ hrtf = true, bank = manifest, failedFile = null, noAudio = false,
  noDestination = false, contextKey = 'ctx', rate = 1000, decode = null, wrongBytes = false } = {}) {
  const gains = [], sources = [], fetches = [], convolvers = [], panners = [];
  const param = () => ({ value: 0, calls: [], setTargetAtTime(...args) { this.value = args[0]; this.calls.push(['target', ...args]); },
    setValueAtTime(...args) { this.value = args[0]; this.calls.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.value = args[0]; this.calls.push(['ramp', ...args]); }, cancelScheduledValues() {} });
  const node = () => ({ connections: [], connect(n) { this.connections.push(n); return n; }, disconnect(other) { this.connections = other ? this.connections.filter(n => n !== other) : []; this.disconnected = true; } });
  const context = { sampleRate: rate, currentTime: 0, destination: node(), decoded: 0,
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: {} }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createConvolver() { const n = { ...node(), buffers: [] }; Object.defineProperty(n, 'buffer', { get() { return this.buffers.at(-1); }, set(v) { this.buffers.push(v); } }); convolvers.push(n); return n; },
    createBuffer(n, length, sampleRate) { const channels = Array.from({ length: n }, () => new Float32Array(length)); return { numberOfChannels: n, sampleRate, length, duration: length / sampleRate, getChannelData: i => channels[i] }; },
    createBufferSource() { const n = { ...node(), starts: [], stops: [], playbackRate: {}, start(...a) { this.starts.push(a); }, stop(...a) { this.stops.push(a); } }; sources.push(n); return n; },
    async decodeAudioData(bytes) { this.decoded++; const duration = new DataView(bytes).getFloat64(0, true); return decode ? decode(duration) : { duration, sampleRate: rate, numberOfChannels: 1 }; },
  };
  if (hrtf) context.createPanner = () => { const p = { ...node(), positionX: param(), positionY: param(), positionZ: param() }; panners.push(p); return p; };
  const destination = node(); let pair = noAudio ? null : { [contextKey]: context, ...(!noDestination ? { destination } : {}) };
  const fetcher = async url => {
    fetches.push(url);
    if (url === '/bank/manifest.json') return { ok: true, json: async () => bank };
    const clip = manifest.clips.find(c => url.endsWith(c.file));
    if (url.endsWith(failedFile || '\u0000')) return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => { const b = new ArrayBuffer(wrongBytes ? 8 : clip.bytes); new DataView(b).setFloat64(0, clip.duration, true); return b; } };
  };
  const runtime = createSourceDemolitionAudio({ getAudio: () => pair, fetcher, urlFor: file => `/bank/${file}` });
  return { context, runtime, gains, sources, fetches, convolvers, panners, destination,
    setAudio(value = { ctx: context, destination }) { pair = value; } };
}

test('shipped material identities, honest provenance and encoded/decoded budgets are portable', () => {
  assert.equal(manifest.clips.length, 4); assert.equal(SOURCES.length, 3);
  assert.ok(manifest.clips.reduce((n, c) => n + c.bytes, 0) <= CONFIG.maxEncodedBytes);
  assert.ok(manifest.clips.reduce((n, c) => n + Math.round(c.duration * 48000) * 4, 0) <= CONFIG.maxDecodedBytes);
  assert.ok(manifest.clips.reduce((n, c) => n + Math.round(c.duration * 96000) * 4, 0)
    + Math.ceil(CONFIG.reflectionSeconds * 96000) * 2 * 4 <= CONFIG.maxDecodedBytes, '96k decode plus reflection buffer remains bounded');
  const licence = fs.readFileSync('third_party/licenses/SOURCE-DEMOLITION-AUDIO.md', 'utf8');
  for (const source of SOURCES) {
    const shipped = manifest.sources.find(item => item.id === source.id);
    assert.equal(source.licence, 'CC0 1.0'); assert.equal(shipped.sourceSHA, source.sourceSHA);
    assert.match(shipped.sourcePageSHA, /^[a-f0-9]{64}$/); assert.ok(licence.includes(source.url));
  }
  for (const clip of manifest.clips) {
    const bytes = fs.readFileSync(`public/audio/source-demolition/${clip.file}`);
    assert.equal(bytes.byteLength, clip.bytes); assert.equal(sha(bytes), clip.audioSHA);
    assert.ok(clip.measured.finite && clip.measured.peakDb < -9 && clip.duration > 1);
  }
  assert.match(manifest.sources[0].provenance, /roof frames remain standing/);
  assert.match(manifest.sources[1].provenance, /preview.*original uncompressed upload requires login/i);
  const stone = manifest.clips.find(c => c.id === 'stone-spall');
  assert.ok(stone.from > 2.95 && stone.to <= 7, 'the tower cut is not reused');
  assert.equal(manifest.clips.filter(c => c.source === 'oulu').length, 1, 'one primary chronology, no overlapping Oulu tail copies');
  assert.match(manifest.limitations.join(' '), /unmeasured/); assert.match(manifest.limitations.join(' '), /pending/);
});

test('the small reflection response is deterministic, finite and explicitly unlike an interior tail', () => {
  const f = fixture(), a = sourceDemolitionReflections(f.context), b = sourceDemolitionReflections(f.context);
  assert.equal(a.duration, .19); assert.equal(a.numberOfChannels, 2);
  assert.deepEqual(a.getChannelData(0), b.getChannelData(0));
  assert.equal([...a.getChannelData(0)].filter(Boolean).length, 3);
  assert.ok([...a.getChannelData(1)].every(Number.isFinite));
});

test('the close body preserves one source interval while recovering recorded body below a safe peak', () => {
  const clip = manifest.clips.find(c => c.id === 'failure-body');
  assert.equal(clip.from, 23.35); assert.equal(clip.to, 28.85); assert.equal(clip.duration, 5.5);
  const peakOnlyRms = clip.sourceMeasured.rmsDb + (-9 - clip.sourceMeasured.peakDb);
  assert.ok(clip.measured.rmsDb > peakOnlyRms + 2.5, 'body no longer disappears behind one captured peak');
  assert.ok(clip.measured.peakDb < -9 && clip.measured.rmsDb < -26);
  assert.match(manifest.processing, /1\.7:1/); assert.match(manifest.processing, /Original pitch\/timing/);
});

test('the bank preloads once through ctx or context and never bypasses the SFX destination', async () => {
  for (const contextKey of ['ctx', 'context']) {
    const f = fixture({ contextKey });
    f.runtime.update({ active: false, preload: true }); assert.ok(await f.runtime.ready());
    assert.equal(f.sources.length, 0); assert.equal(f.fetches.length, 5); assert.equal(f.context.decoded, 4);
    assert.equal(f.gains[0].connections[0], f.destination);
    await f.runtime.ready(); assert.equal(f.fetches.length, 5);
    f.runtime.update(frame([cue('strain')]), { listener }); assert.equal(f.sources.length, 1);
  }
  const f = fixture({ noDestination: true }); assert.equal(await f.runtime.ready(), false);
  f.runtime.update(frame([cue('strain')]), { listener }); assert.equal(f.sources.length, 0); assert.equal(f.fetches.length, 0);
});

test('fixed physical anchors respond to yaw, actual height, distance and finite propagation delay', async () => {
  const a = sourceDemolitionVoiceMix(position, listener), b = sourceDemolitionVoiceMix(position, { ...listener, yaw: Math.PI });
  assert.equal(a.distance, b.distance); assert.ok(a.pan * b.pan < 0); assert.equal(a.localY, 7.35);
  const raised = sourceDemolitionVoiceMix({ ...position, y: 50 }, listener); assert.ok(raised.gain < a.gain && raised.distance > a.distance);
  assert.equal(sourceDemolitionVoiceMix({ x: 1000, y: 0, z: 0 }, listener).arrivalDelay, CONFIG.maxArrivalDelay);
  const f = fixture(); await f.runtime.ready(); const first = f.runtime.update(frame([cue('release')]), { listener });
  assert.equal(first.voices[0].id, 'failure-body', 'the main release uses the one real recorded fall');
  assert.deepEqual(first.voices[0].position, position); assert.equal(f.sources[0].playbackRate.value, 1);
  assert.ok(Math.abs(f.sources[0].starts[0][0] - (.005 + a.arrivalDelay)) < 1e-8);
  f.runtime.update({ ...frame([cue('release')]), anchors: { front: { x: 80, y: 2, z: 100 } } }, { listener: { ...listener, yaw: Math.PI } });
  assert.deepEqual(f.runtime.snapshot().voices[0].position, position);
  assert.ok(f.runtime.snapshot().voices[0].mix.pan * a.pan < 0);
});

test('one body carries the recorded fall chronology, roof never repeats its tail, and only its derived send follows the front', async () => {
  const f = fixture(); await f.runtime.ready();
  const input = frame(['strain', 'infill', 'release', 'course', 'roof'].map(type => cue(type)));
  const first = f.runtime.update(input, { listener }); assert.equal(first.played, 5); assert.equal(first.sourceCount, 3); assert.equal(first.residualCount, 1);
  assert.deepEqual(first.voices.find(v => v.kind === 'residual').position, input.anchors.front);
  const count = f.sources.length;
  f.runtime.update({ ...input, anchors: { front: { x: -10, y: 3, z: 19 } } }, { listener });
  assert.equal(f.sources.length, count); assert.equal(f.runtime.snapshot().receipts.length, 5);
  assert.deepEqual(f.runtime.snapshot().voices.find(v => v.kind === 'residual').position, { x: -10, y: 3, z: 19 });
  assert.deepEqual(f.runtime.snapshot().voices.find(v => v.id === 'failure-body').position, position);
  assert.equal(f.sources.filter(source => source.buffer.duration === 5.5).length, 1);
  assert.equal(f.sources.find(source => source.buffer.duration === 5.5).starts[0][1], 0, 'release never restarts a shifted copy of recorded settling');
  assert.equal(f.runtime.snapshot().voices.find(v => v.kind === 'residual').derivedSend, true);
});

test('stale, restored, protected, absent-context and not-ready events are consumed without a delayed burst', async () => {
  const f = fixture(); await f.runtime.ready();
  for (const [i, input, options] of [
    [0, frame([cue('strain', { age: .3 })]), {}],
    [1, { ...frame([cue('infill')]), restored: true }, {}],
    [2, frame([cue('course')]), { protected: true }],
    [3, frame([cue('roof', { suppressed: true })]), {}],
    [4, frame([cue('release')]), { suspended: true }],
  ]) { f.runtime.update(input, { listener, ...options }); assert.equal(f.sources.length, 0, `suppression ${i}`); }
  f.runtime.update(frame(['strain', 'infill', 'course', 'roof', 'release'].map(type => cue(type))), { listener }); assert.equal(f.sources.length, 0);
  const pending = fixture(); pending.runtime.update(frame([cue('strain')]), { listener }); await pending.runtime.ready();
  pending.runtime.update(frame([cue('strain')]), { listener }); assert.equal(pending.sources.length, 0);
  const absent = fixture({ noAudio: true }); absent.runtime.update(frame([cue('course')]), { listener }); absent.setAudio(); await absent.runtime.ready();
  absent.runtime.update(frame([cue('course')]), { listener }); assert.equal(absent.sources.length, 0);
});

test('brief support initiation clears into held weight; release starts one body/send and progression never adds rubble attacks', async () => {
  const f = fixture(); await f.runtime.ready();
  f.runtime.update(frame([cue('strain')]), { listener });
  assert.deepEqual(f.sources[0].starts[0].slice(1), [0, .85]);
  f.context.currentTime = 1; f.runtime.update(frame([cue('infill')]), { listener });
  assert.equal(f.sources.length, 2, 'infill earns the next recorded support segment despite independent audio-clock drift');
  assert.equal(f.sources[0].buffer, f.sources[1].buffer);
  assert.equal(f.sources[1].starts[0][1], .85);
  assert.ok(Math.abs(f.sources[1].starts[0][2] - .75) < 1e-12);
  assert.equal(f.sources[0].starts[0][1] + f.sources[0].starts[0][2], f.sources[1].starts[0][1], 'support intervals are chronologically adjacent with no shared raw samples');
  assert.deepEqual(f.runtime.snapshot().voices.map(voice => [voice.sourceOffset, voice.sourceDuration]), [[.85, 1.6 - .85]], 'expired first segment is retired, not revived');
  f.context.currentTime = 2.5; f.runtime.update(frame([]), { listener });
  assert.equal(f.runtime.snapshot().sourceCount, 0, 'held interval has no main-body loop');
  f.context.currentTime = 3.15;
  const released = f.runtime.update(frame([cue('release')]), { listener });
  const source = f.sources[2], initialStarts = JSON.stringify(source.starts), level = source.connections[0], physicalPath = level.connections[0];
  assert.equal(f.sources.length, 3); assert.ok(source.starts[0][0] > 3.15);
  assert.equal(released.residualCount, 1); assert.equal(released.voices.find(v => v.kind === 'residual').derivedSend, true);
  f.context.currentTime = 3.2; f.runtime.update(frame([cue('course')]), { listener });
  f.context.currentTime = 7.5; f.runtime.update(frame([cue('roof')]), { listener });
  assert.equal(f.sources.length, 3); assert.equal(JSON.stringify(source.starts), initialStarts);
  f.runtime.update(frame([]), { listener, effectsMode: 'off' });
  assert.equal(f.runtime.snapshot().sourceCount, 1); assert.equal(f.runtime.snapshot().residualCount, 0);
  assert.deepEqual(level.connections, [physicalPath], 'disabling residue disconnects only that send, retaining physical sound');
  f.context.currentTime = 10;
  f.runtime.update(frame([cue('roof', { id: 'too-late' })]), { listener });
  assert.equal(f.sources.length, 3); assert.equal(f.runtime.snapshot().history.at(-1).reason, 'no-playing-material-no-backlog');
  const absent = fixture(); await absent.runtime.ready(); absent.runtime.update(frame([cue('course'), cue('roof')]), { listener });
  assert.equal(absent.sources.length, 0, 'missing main body cannot be replaced with unrelated later ticks');
});

test('REC, playback, focus/pause, outside and explicit stop cut all sources and clear saved reflection history only on transitions', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(frame([cue('infill'), cue('release')]), { listener });
  const conv = f.convolvers[0], cached = conv.buffer;
  const muted = f.runtime.update(frame([cue('course')]), { listener, protected: true });
  assert.equal(muted.sourceCount, 0); assert.equal(f.gains[0].gain.value, 0); assert.ok(f.sources.every(source => source.stops.length));
  assert.deepEqual(f.gains[0].gain.calls.at(-1), ['set', 0, f.context.currentTime], 'protected output is exactly zero without a fading leak');
  assert.equal(conv.buffers.at(-2), null); assert.equal(conv.buffer, cached);
  const n = conv.buffers.length; f.runtime.update(frame([]), { listener, protected: true }); assert.equal(conv.buffers.length, n);
  f.runtime.update(frame([cue('course')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 0);
  f.runtime.update(frame([cue('strain')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 1);
  f.runtime.update({ active: false }); assert.equal(f.runtime.snapshot().sourceCount, 0); assert.equal(conv.buffers.at(-2), null);
  f.runtime.update(frame([cue('strain')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 0);
  f.runtime.update(frame([cue('strain')]), { listener }); f.runtime.stop(); assert.equal(conv.buffers.at(-2), null);
  f.runtime.update(frame([cue('strain')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 0);
});

test('effects off retains physical warnings and failure while removing derived spirit audio and reflections', async () => {
  const f = fixture(); await f.runtime.ready();
  const state = f.runtime.update(frame([cue('strain'), cue('infill'), cue('release')]), { listener, effectsMode: 'off' });
  assert.equal(state.played, 3); assert.equal(state.sourceCount, 3); assert.equal(state.residualCount, 0);
  assert.equal(f.gains[1].gain.value, 0); assert.equal(f.gains[2].gain.value, 0);
  f.runtime.update(frame([cue('release')]), { listener, effectsMode: 'normal' }); assert.equal(f.runtime.snapshot().residualCount, 0, 'an omitted residual never returns as a queued attack');
  f.runtime.update(frame([cue('release', { id: 'live-release' })]), { listener }); assert.equal(f.runtime.snapshot().residualCount, 1);
  const n = f.convolvers[0].buffers.length;
  f.runtime.update(frame([]), { listener, effectsMode: 'off' }); assert.equal(f.runtime.snapshot().residualCount, 0); assert.equal(f.convolvers[0].buffers.length, n + 2);
  assert.ok(f.runtime.snapshot().sourceCount > 0, 'material feedback remains');
  const reduced = fixture(); await reduced.runtime.ready(); reduced.runtime.update(frame([cue('release')]), { listener, effectsMode: 'reduced' }); assert.equal(reduced.runtime.snapshot().sourceCount, 1);
});

test('consumption produces no extra hit, drains to silence, and cannot resurrect on resume or stored-state entry', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(frame([cue('infill'), cue('release')]), { listener });
  const count = f.sources.length;
  f.context.currentTime = 1; f.runtime.update({ ...frame([cue('consumed')]), consumed: true, blackness: 1 }, { listener });
  assert.equal(f.sources.length, count); assert.ok(f.runtime.snapshot().consumed);
  assert.ok(f.runtime.snapshot().voices.find(v => v.kind === 'material').mix.distance > 0);
  f.context.currentTime = 2.4; f.runtime.update({ ...frame([cue('consumed')]), consumed: true, blackness: 1 }, { listener });
  assert.equal(f.runtime.snapshot().sourceCount, 0); assert.equal(f.gains[0].gain.value, 0);
  f.runtime.update(frame([cue('roof')]), { listener }); assert.equal(f.runtime.snapshot().sourceCount, 0);
  f.runtime.stop(); f.runtime.update(frame([]), { listener }); assert.equal(f.runtime.snapshot().audible, false);
  const restored = fixture(); await restored.runtime.ready();
  restored.runtime.update({ ...frame([cue('consumed', { age: 0 }), cue('roof')]), restored: true, consumed: true }, { listener });
  restored.context.currentTime = 2; restored.runtime.update(frame([cue('roof')]), { listener }); assert.equal(restored.sources.length, 0);
});

test('reduced dread keeps physical warning level and placement while lowering only derived residue and reflections', async () => {
  const normal = fixture(); await normal.runtime.ready();
  normal.runtime.update(frame([cue('release'), cue('course')]), { listener });
  for (const options of [{ reducedDread: true }, { effectsMode: 'reduced' }]) {
    const reduced = fixture(); await reduced.runtime.ready();
    const state = reduced.runtime.update(frame([cue('release'), cue('course')]), { listener, ...options });
    assert.equal(state.played, 2); assert.equal(state.residualCount, 1); assert.equal(state.reducedDread, true);
    assert.equal(normal.gains[1].gain.value, 1); assert.equal(reduced.gains[1].gain.value, .45);
    assert.equal(normal.gains[2].gain.value, .6); assert.equal(reduced.gains[2].gain.value, .35);
    assert.deepEqual(state.voices.find(v => v.kind === 'material'), normal.runtime.snapshot().voices.find(v => v.kind === 'material'));
    assert.deepEqual(reduced.gains[3].gain.calls, normal.gains[3].gain.calls, 'physical envelope is unchanged');
    assert.equal(reduced.gains[4].gain.value, normal.gains[4].gain.value, 'physical direct distance level is unchanged');
  }
});

test('bounded voices and explicit new-run reset preserve normal stop receipts and reuse decoded bank', async () => {
  const f = fixture(); await f.runtime.ready();
  for (let i = 0; i < 40; i++) f.runtime.update(frame([cue(i % 2 ? 'release' : 'roof', { id: `stress:${i}` })]), { listener });
  assert.ok(f.runtime.snapshot().sourceCount <= CONFIG.maxVoices); assert.ok(f.runtime.snapshot().residualCount <= CONFIG.maxResidualVoices);
  assert.ok(f.runtime.snapshot().history.length <= 48);
  const fetches = f.fetches.length; f.runtime.reset(); assert.equal(f.runtime.snapshot().consumed, false); assert.equal(f.runtime.snapshot().receipts.length, 0);
  f.runtime.update(frame([cue('strain')]), { listener }); assert.equal(f.runtime.snapshot().played, 1); assert.equal(f.fetches.length, fetches);
  f.runtime.destroy(); assert.equal(f.runtime.update(frame([])).active, false); assert.equal(await f.runtime.ready(), false);
});

test('invalid/missing/oversized material banks fail wholly silent with no synthetic fallback', async () => {
  for (const options of [
    { bank: { ...manifest, clips: [{ ...manifest.clips[0], file: '../escape.mp3' }] } },
    { bank: { ...manifest, clips: [{ ...manifest.clips[0], bytes: CONFIG.maxEncodedBytes + 1 }] } },
    { bank: { ...manifest, clips: [{ ...manifest.clips[0], gain: 99 }] } },
    { failedFile: 'failure-body.mp3' }, { wrongBytes: true }, { rate: 192000 },
    { decode: duration => ({ duration, numberOfChannels: 2 }) },
  ]) {
    const f = fixture(options); assert.equal(await f.runtime.ready(), false);
    f.runtime.update(frame([cue('strain'), cue('infill'), cue('roof')]), { listener });
    assert.equal(f.runtime.snapshot().sourceCount, 0); assert.equal(f.sources.length, 0); assert.ok(f.runtime.snapshot().failed);
  }
  const stereo = fixture({ hrtf: false }); await stereo.runtime.ready(); stereo.runtime.update(frame([cue('strain')]), { listener });
  assert.match(stereo.runtime.snapshot().positioning, /stereo/);
});

test('actual pure-state restored and recording-suppressed receipts cannot become fresh failure cues', async () => {
  const f = fixture(); await f.runtime.ready();
  const here = { along: 12, across: 0 };
  const stored = normalizeSourceDemolition({ sequenceId: PLAN.sequenceId, committed: true,
    elapsed: 8, clock: 8, lastAlong: here.along, lastAcross: here.across });
  const restoredFrame = sourceDemolitionFrame(stored, here);
  assert.equal(restoredFrame.active, true, 'restored fixture is inside the actual first-shore encounter');
  assert.equal(restoredFrame.committed, true);
  f.runtime.update(restoredFrame, { listener });
  assert.equal(f.sources.length, 0, 'restored old failures are baseline only');
  f.runtime.reset();
  let state = normalizeSourceDemolition({ sequenceId: PLAN.sequenceId, committed: true, elapsed: .95, clock: .95 });
  state = advanceSourceDemolition(state, { dt: .1, ...here, eligible: true, protected: true }).state;
  const infill = state.receipts.find(receipt => receipt.type === 'infill');
  assert.equal(infill?.suppressed, true, 'the protected frame crosses and receipts the real 1 s infill boundary');
  const protectedFrame = sourceDemolitionFrame(state, here);
  assert.equal(protectedFrame.active, true);
  f.runtime.update(protectedFrame, { listener, protected: true });
  state = advanceSourceDemolition(state, { dt: .1, ...here, eligible: true }).state;
  f.runtime.update(sourceDemolitionFrame(state, here), { listener });
  assert.equal(f.sources.length, 0, 'recording-discarded infill never sounds later');
  while (state.elapsed < 3.25) {
    state = advanceSourceDemolition(state, { dt: .1, ...here, eligible: true }).state;
    f.runtime.update(sourceDemolitionFrame(state, here), { listener });
  }
  assert.equal(f.sources.length, 1, 'a later unprotected real course event still sounds');
  assert.equal(f.runtime.snapshot().voices[0].id, 'failure-body');
  f.runtime.reset();
  f.runtime.update({ ...frame([{ type: 'strain', id: 'null-anchor', position: { x: null, y: null, z: null }, age: null, at: 0 }]), elapsed: 10 }, { listener });
  assert.equal(f.runtime.snapshot().sourceCount, 0, 'null age/coordinates do not invent a fresh source at the origin');
  assert.doesNotThrow(() => f.runtime.update({ active: true, events: {} }));
});
