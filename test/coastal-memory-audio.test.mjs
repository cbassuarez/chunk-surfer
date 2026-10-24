import assert from 'node:assert/strict';
import test from 'node:test';
import { coastalMemoryRecordingBuffer, playCoastalMemoryRecording, createCoastalMemoryAudio,
  COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS,
  COASTAL_MEMORY_NOTES, COASTAL_MEMORY_AUDIO_PROVENANCE } from '../src/audio/coastal-memory.js';
import { towerPersonalRecordingBuffer } from '../src/audio/tower-personal-recording.js';
import { beginCoastalMemory, stepCoastalMemory } from '../src/game/coastal-memory.js';

function context() {
  const nodes = [], sources = [], destination = { kind: 'destination' };
  const param = value => ({ value, targets: [], setTargetAtTime(next, at, tau) { this.value = next; this.targets.push({ value: next, at, tau }); } });
  function node(kind, extra = {}) {
    const item = { kind, connects: [], disconnected: false,
      connect(to, output) { this.connects.push({ to, output }); return to; }, disconnect() { this.disconnected = true; }, ...extra };
    nodes.push(item); return item;
  }
  const ctx = { sampleRate: 8000, currentTime: 0, state: 'running', destination, nodes, sources,
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: i => data[i] };
    },
    createBufferSource() { const s = node('source', { starts: [], stops: 0,
      start(at, offset = 0) { this.starts.push({ at, offset }); }, stop() { this.stops++; } }); sources.push(s); return s; },
    createGain: () => node('gain', { gain: param(1) }),
    createBiquadFilter: () => node('filter', { frequency: param(0), Q: param(0) }),
    createStereoPanner: () => node('pan', { pan: param(0) }),
    createChannelSplitter: () => node('splitter'),
    createAnalyser: () => node('analyser', { fftSize: 0, getFloatTimeDomainData(data) { data.fill(.03); } }),
  };
  return ctx;
}
const layout = { spawn: { feet: 28 }, musicBox: { x: 27, y: 28.8, z: 43 }, listenRadius: 5.4 };
const pose = { x: 25.9, z: 43, feet: 28, yaw: Math.PI / 2, pitch: -.3 };
const state = { active: true, status: 'active', recordingOffset: 0, pose };
const make = () => { const ctx = context(), audio = createCoastalMemoryAudio({ context: ctx, destination: ctx.destination, layout }); return { ctx, audio }; };
const near = (audio, extra = {}) => audio.update({ state, pose, recorderHeld: true, ...extra });
const equal = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
function energy(data, rate, from, to) { let sum = 0, n = 0; for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i++) { sum += data[i] ** 2; n++; } return Math.sqrt(sum / n); }
function spectral(data, rate, from, seconds, f) { let re = 0, im = 0; const start = Math.floor(from * rate), n = Math.floor(seconds * rate); for (let j = 0; j < n; j++) { const w = Math.sin(j / (n - 1) * Math.PI) ** 2, angle = 2 * Math.PI * f * j / rate; re += data[start + j] * w * Math.cos(angle); im += data[start + j] * w * Math.sin(angle); } return Math.hypot(re, im) / n; }

test('the separate deterministic 14s stereo master has two pitched plucks and no old chair master substitution', () => {
  const ctx = context(), buffer = coastalMemoryRecordingBuffer(ctx), copy = coastalMemoryRecordingBuffer(context());
  assert.strictEqual(coastalMemoryRecordingBuffer(ctx), buffer); assert.equal(buffer.duration, 14); assert.equal(buffer.numberOfChannels, 2);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  assert.deepEqual(left, copy.getChannelData(0)); assert.notDeepEqual(left, right);
  assert.notDeepEqual(left, towerPersonalRecordingBuffer(ctx).getChannelData(0));
  assert.equal(COASTAL_MEMORY_TAKE, 'coastal-memory-musicbox'); assert.equal(COASTAL_MEMORY_CUE, 'coastal.memory.musicbox');
  assert.deepEqual(COASTAL_MEMORY_NOTES, [196, 261.63]);
  let max = 0; for (const value of left) { assert.ok(Number.isFinite(value)); max = Math.max(max, Math.abs(value)); }
  assert.ok(max > .04 && max < .3);
  assert.ok(energy(left, ctx.sampleRate, 2.29, 2.8) > energy(left, ctx.sampleRate, 12, 13) * 10);
  for (const [at, f] of [[2.3, 196], [7.44, 261.63]])
    assert.ok(spectral(left, ctx.sampleRate, at, .5, f) > spectral(left, ctx.sampleRate, at, .5, f + 15) * 4);
  assert.match(COASTAL_MEMORY_AUDIO_PROVENANCE.material, /music box/); assert.match(COASTAL_MEMORY_AUDIO_PROVENANCE.ambience, /placeholder/);
});

test('direct playback resolves the same master with wrapped offset, scheduled start and idempotent disposal', () => {
  const ctx = context(); ctx.currentTime = 4;
  assert.equal(playCoastalMemoryRecording(), null);
  const recording = playCoastalMemoryRecording({ context: ctx, destination: ctx.destination, when: 3, gain: 9, loop: true, offset: 31.25 });
  assert.strictEqual(recording.source.buffer, coastalMemoryRecordingBuffer(ctx)); assert.equal(recording.source.loop, true);
  assert.deepEqual(recording.source.starts, [{ at: 4, offset: 3.25 }]); assert.equal(recording.out.gain.value, 2);
  recording.stop(); recording.stop(); assert.equal(recording.source.stops, 1); assert.equal(recording.out.disconnected, true);
});

test('one source phase feeds world and held monitor; only routed AudioContext time is consumed once', () => {
  const { ctx, audio } = make();
  audio.initialize({ state, pose, recorderHeld: false });
  assert.equal(ctx.sources.length, 2); // one music box plus procedural air
  ctx.currentTime = 2; assert.equal(audio.sample().audibleSeconds, 0);
  near(audio); assert.equal(ctx.sources.length, 2);
  ctx.currentTime = 3;
  const first = audio.sample(); equal(first.audibleSeconds, .96); equal(first.recordingOffset, 3);
  assert.equal(first.sourceReady, true); assert.equal(first.audioRunning, true); assert.ok(first.left > 0 && first.right > 0);
  assert.equal(audio.sample().audibleSeconds, 0);
  const monitorGain = ctx.nodes.find(n => n.kind === 'gain' && n.gain.targets.at(-1)?.value === .8);
  assert.ok(monitorGain);
  const worldGain = ctx.nodes.find(n => n.kind === 'gain' && n.gain.targets.at(-1)?.value === 0);
  assert.ok(worldGain); assert.notStrictEqual(worldGain, monitorGain);
  audio.dispose();
});

test('distance and active state determine monitoring without converting world ambience into evidence', () => {
  const { ctx, audio } = make();
  near(audio, { pose: { ...pose, x: -20 } }); ctx.currentTime = 5;
  assert.equal(audio.sample().audibleSeconds, 0);
  near(audio); ctx.currentTime = 6; equal(audio.sample().audibleSeconds, .96);
  near(audio, { recorderHeld: false }); ctx.currentTime = 9; assert.equal(audio.sample().audibleSeconds, 0);
  near(audio, { state: { ...state, status: 'return-pending' } });
  assert.equal(audio.sample().sourceReady, false); assert.ok(ctx.sources.every(s => s.stops === 1));
});

test('pause freezes phase and credit while the shared context continues other game audio', () => {
  const { ctx, audio } = make(); near(audio);
  ctx.currentTime = 1; equal(audio.sample().audibleSeconds, .96);
  audio.setPaused(true); ctx.currentTime = 8;
  const held = audio.sample(); assert.equal(held.audibleSeconds, 0); equal(held.recordingOffset, 1);
  audio.setPaused(false); ctx.currentTime = 9;
  const resumed = audio.sample(); equal(resumed.audibleSeconds, .96); equal(resumed.recordingOffset, 2);
  assert.equal(ctx.sources.length, 4); assert.equal(ctx.sources[2].starts[0].offset, 1);
  assert.equal(typeof ctx.resume, 'undefined'); assert.equal(typeof ctx.suspend, 'undefined');
});

test('hidden, interrupted, unavailable rendering and explicit pause never start an audible source', () => {
  for (const extra of [{ hidden: true }, { interrupted: true }, { renderReady: false }, { paused: true }]) {
    const { ctx, audio } = make(); near(audio, extra); ctx.currentTime = 20;
    const sample = audio.sample(); assert.equal(sample.audibleSeconds, 0); assert.equal(sample.sourceReady, false);
    assert.equal(ctx.sources.length, 0); audio.dispose();
  }
});

test('a suspended shared context supplies no evidence and saved offset resumes without a new master', () => {
  const { ctx, audio } = make(); ctx.state = 'suspended';
  near(audio, { state: { ...state, recordingOffset: 11 } });
  assert.equal(ctx.sources.length, 0); assert.equal(audio.sample().audioRunning, false);
  ctx.state = 'running'; near(audio, { state: { ...state, recordingOffset: 11 } });
  assert.equal(ctx.sources[0].starts[0].offset, 11);
  ctx.currentTime = 5; const sample = audio.sample(); equal(sample.audibleSeconds, 4.96); equal(sample.recordingOffset, 2);
  assert.strictEqual(ctx.sources[0].buffer, coastalMemoryRecordingBuffer(ctx));
});

test('disposal is permanent, stops every source once and releases all owned nodes', () => {
  const { ctx, audio } = make(); near(audio); ctx.currentTime = 1;
  audio.dispose(); audio.dispose(); assert.equal(audio.update({ state, pose, recorderHeld: true }), false);
  assert.ok(ctx.sources.every(s => s.stops === 1)); assert.ok(ctx.nodes.every(n => n.disconnected));
  assert.deepEqual(audio.sample(), { audibleSeconds: 0, recordingOffset: 1, sourceReady: false, audioRunning: false, left: 0, right: 0 });
  assert.equal(createCoastalMemoryAudio(), null);
});

test('the actual owner sample earns only the coastal controller receipt after nine routed seconds', () => {
  const plan = { ...layout, spawn: pose, pierReturnPlane: { point: { x: 10, z: 79 }, normal: { x: 0, z: 1 } } };
  const ctx = context(), audio = createCoastalMemoryAudio({ context: ctx, destination: ctx.destination, layout: plan });
  let coast = beginCoastalMemory(null, { layout: plan, runId: 'audio-circuit', returnPose: { x: 1, y: -4000 } });
  audio.initialize({ state: coast, pose: coast.pose, recorderHeld: true });
  for (let t = 1; t <= 9; t++) {
    ctx.currentTime = t;
    coast = stepCoastalMemory(coast, { dt: .1, recorderHeld: true, ...audio.sample() }, { layout: plan }).state;
  }
  assert.equal(coast.recordingHeard, false); equal(coast.listenedSeconds, 8.96);
  ctx.currentTime = 9.04;
  const result = stepCoastalMemory(coast, { dt: 0, recorderHeld: true, ...audio.sample() }, { layout: plan });
  assert.equal(result.state.recordingHeard, true); assert.equal(result.state.recordingReceipt.cueId, COASTAL_MEMORY_CUE);
  assert.equal(result.state.recordingReceipt.takeId, COASTAL_MEMORY_TAKE); assert.equal(result.state.rewardEarned, false);
  audio.dispose();
});
