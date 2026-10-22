import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { STOP_LISTENING_CRUSH, bitcrush, levelMatch, rmsOf, signalStats } from '../tools/chunk_surfer/stop-listening-dsp.mjs';
import { createStopListeningGutRuntime, stopListeningVoiceMix } from '../src/audio/stop-listening-gut.js';

test('fractional clock captures at 24 kHz rather than an integer 22.05/14.7 kHz skip', () => {
  const input = Float32Array.from({ length: 44100 }, (_, i) => i / 44100);
  const result = bitcrush(input, 44100, { bits: 24, rate: 24000, mix: 1 });
  const q = 2 ** 23;
  assert.equal(result[0], 0);
  assert.equal(result[1], 0);
  assert.ok(Math.abs(result[2] - Math.round((1 / 24000) * q) / q) < 1e-12,
    'the first held capture must interpolate at 1/24000 seconds');
  let captures = 1;
  for (let i = 1; i < result.length; i++) if (result[i] !== result[i - 1]) captures += 1;
  assert.equal(captures, 24000, 'one second has exactly 24,000 held values');
});

test('8-bit signed quantisation has its real discrete levels and never overflows', () => {
  const result = bitcrush(Float32Array.from([-2, -1, -.1234, 0, .1234, 1, 2]), 32000,
    { bits: 8, rate: 32000, mix: 1 });
  assert.deepEqual([...result], [-1, -1, -16 / 128, 0, 16 / 128, 127 / 128, 127 / 128]);
});

test('grain processing rejects invalid clocks and non-finite waveforms', () => {
  const input = Float32Array.from([0, .2, -.2]);
  for (const profile of [{ bits: 1, rate: 24000, mix: 1 }, { bits: 9, rate: 50000, mix: 1 },
    { bits: 9, rate: 0, mix: 1 }, { bits: 9, rate: 24000, mix: NaN }]) {
    assert.throws(() => bitcrush(input, 44100, profile), RangeError);
  }
  assert.throws(() => bitcrush(Float32Array.from([0, NaN]), 44100, STOP_LISTENING_CRUSH.gut), TypeError);
});

test('stronger grain is level matched and retains protected headroom', () => {
  const input = Float32Array.from({ length: 44100 }, (_, i) => .1 * Math.sin(i * .23) + .022 * Math.sin(i * .87));
  for (const profile of Object.values(STOP_LISTENING_CRUSH)) {
    const crushed = bitcrush(input, 44100, profile), output = levelMatch(crushed, input);
    assert.ok(Math.abs(rmsOf(output) - rmsOf(input)) < 1e-8);
    assert.ok(signalStats(output).peakDb <= -3);
    assert.ok(output.some((v, i) => Math.abs(v - input[i]) > .002), 'the treatment changes the waveform');
  }
});

test('the built bank records actual 8–12-bit/20–36 kHz processing independently of its codec', () => {
  const manifest = JSON.parse(fs.readFileSync('public/audio/stop-listening/manifest.json'));
  assert.equal(manifest.crush.method, 'fractional-clock-interpolated-signed-pcm-zero-order-hold');
  assert.equal(manifest.processingSampleRate, 44100);
  assert.equal(manifest.encoding.rate, 32000);
  assert.equal(manifest.sources.length, 11);
  for (const entry of [...manifest.events, ...manifest.beds]) {
    const { bits, rate, mix } = entry.crush;
    assert.ok(bits >= 8 && bits <= 12 && rate >= 20000 && rate <= 36000 && mix >= .65);
    assert.ok(entry.levels.finite && entry.levels.peakDb <= -2.999);
    assert.ok(entry.levels.rmsChangeDb < .001 && entry.levels.rmsChangeDb > -.5,
      `${entry.file}: grain changed loudness by ${entry.levels.rmsChangeDb} dB`);
  }
});

test('existing placement keeps near/right/behind cues', () => {
  const left = stopListeningVoiceMix({ dx: -4, dz: 0 });
  const right = stopListeningVoiceMix({ dx: 4, dz: 0 });
  const behind = stopListeningVoiceMix({ dx: 0, dz: 4 });
  const ahead = stopListeningVoiceMix({ dx: 0, dz: -4 });
  assert.equal(left.pan, -right.pan);
  assert.ok(left.pan < -.99 && right.pan > .99);
  assert.ok(behind.cutoff < ahead.cutoff);
  assert.ok(stopListeningVoiceMix({ dx: 0, dz: -2 }).gain > ahead.gain);
});

test('monitor or recording mute stays after all dry and reverberant voices', async () => {
  const gains = [];
  const param = () => ({ value: 0, targets: [], setTargetAtTime(value, at, time) { this.targets.push({ value, at, time }); },
    setValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect(other) { return other; }, disconnect() {} });
  const ctx = { currentTime: 0, sampleRate: 1000,
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createConvolver: () => node(),
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: { value: 0 } }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBuffer: (channels, length) => { const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (ch) => data[ch] }; },
    createBufferSource: () => ({ ...node(), playbackRate: {}, start() {} }),
    decodeAudioData: async () => ({ duration: 22 }),
  };
  const runtime = createStopListeningGutRuntime({ context: ctx, destination: node(), urlFor: (f) => f,
    random: () => .5, fetcher: async (file) => ({ ok: true,
      json: async () => ({ beds: [{ file: 'bed.mp3' }], events: [{ file: 'event.mp3', role: 'gut' }] }),
      arrayBuffer: async () => new ArrayBuffer(1) }) });
  const input = { active: true, roomId: 'amplifications', voices: [{ id: 'floor-heap', dx: 2, dz: -2, gain: .8 }] };
  runtime.update(input);
  await new Promise(setImmediate);
  assert.equal(runtime.update(input).loaded, true);
  const master = gains[0];
  ctx.currentTime = 1;
  const muted = runtime.update({ ...input, muted: true });
  assert.equal(muted.muted, true);
  assert.equal(muted.audible, false);
  assert.deepEqual(master.gain.targets.at(-1), { value: 0, at: 1, time: .08 });
  ctx.currentTime = 2;
  assert.equal(runtime.update(input).audible, true);
  assert.deepEqual(master.gain.targets.at(-1), { value: .62, at: 2, time: .9 });
});
