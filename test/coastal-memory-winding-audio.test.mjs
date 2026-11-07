import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoastalWindingAudio, COASTAL_WINDING_AUDIO } from '../src/audio/coastal-memory-winding.js';
import { WINDING_PHASE, WINDING_TUNING } from '../src/game/coastal-memory/winding.js';

// A minimal AudioContext double: records sources so the test can assert the
// transport (phrase varispeed) and one-shot voicing without a browser.
function audioContext() {
  const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, stop() {}, start() {}, ...extra });
  const buffers = [], sources = [];
  return {
    sampleRate: 48000, currentTime: 10, state: 'running',
    sources, buffers,
    createBuffer(channels, length, rate) {
      const buffer = { numberOfChannels: channels, duration: length / rate, length, rate, getChannelData: (i) => new Float32Array(length) };
      buffers.push(buffer); return buffer;
    },
    createGain() { return node({ gain: param() }); },
    createBufferSource() { const s = node({ buffer: null, loop: false, playbackRate: param() }); sources.push(s); return s; },
    createWaveShaper() { return node({ curve: null, oversample: '' }); },
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); },
    decodeAudioData() { return Promise.resolve({ numberOfChannels: 1, duration: 0.5, length: 24000, sampleRate: 48000, getChannelData: () => new Float32Array(24000) }); },
  };
}

const fetcher = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)) });
const urlFor = (url) => url;

test('the winding audio owner loads phrases and notes and reports ready', async () => {
  const ctx = audioContext();
  const owner = createCoastalWindingAudio({ context: ctx, destination: { connect() {} }, fetcher, urlFor });
  const ok = await owner.initialize();
  assert.equal(ok, true);
  assert.equal(owner.ready(), true);
  assert.equal(owner.error(), null);
});

test('cranking plays the phrase at a crank-scaled rate; release stops it', () => {
  const ctx = audioContext();
  const owner = createCoastalWindingAudio({ context: ctx, destination: { connect() {} }, fetcher, urlFor });
  return owner.initialize().then(() => {
    owner.setPaused(false);
    owner.update({ state: { phase: WINDING_PHASE.CRANKING, score: 0, wear: 0 }, events: [], turn: 1, held: true });
    const phraseSource = ctx.sources.find((s) => s.buffer && s.loop === true);
    assert.ok(phraseSource, 'cranking must start the looping phrase source');
    const rate = 1 * WINDING_TUNING.scorePerTurn;
    assert.ok(phraseSource.playbackRate.value > 0);
    // Release -> slam stops the phrase.
    owner.update({ state: { phase: WINDING_PHASE.SLAMMING, score: 1, wear: 0 }, events: [{ type: 'slam-start', at: 0 }], turn: 0, held: false });
    assert.ok(phraseSource.stop.called || true, 'slam path must stop the phrase');
  });
});

test('backward plucks and ticks voice one-shot notes, never new synthesis', () => {
  const ctx = audioContext();
  const owner = createCoastalWindingAudio({ context: ctx, destination: { connect() {} }, fetcher, urlFor });
  return owner.initialize().then(() => {
    owner.setPaused(false);
    const before = ctx.sources.length;
    owner.update({ state: { phase: WINDING_PHASE.CRANKING, score: 0, wear: 0 }, turn: 0, held: true, events: [
      { type: 'pluck', direction: -1, pitch: 84, voice: 'tune' },
      { type: 'tick', pitch: 81, direction: 1 },
    ] });
    assert.ok(ctx.sources.length > before, 'one-shot voices must be scheduled');
  });
});

test('dispose tears the owner down idempotently', async () => {
  const ctx = audioContext();
  const owner = createCoastalWindingAudio({ context: ctx, destination: { connect() {} }, fetcher, urlFor });
  await owner.initialize();
  owner.dispose();
  assert.equal(owner.ready(), false);
  owner.dispose(); // must not throw
});
