import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveBumperIntrusionAudio } from '../src/audio/drive-bumper-intrusion.js';

function fakeContext(rate = 8000) {
  const nodes = [], sources = [], buffers = [];
  function node(kind, extra = {}) {
    const n = { kind, connections: [], disconnects: 0,
      connect(to) { this.connections.push(to); return to; },
      disconnect() { this.disconnects++; this.connections = []; }, ...extra };
    nodes.push(n); return n;
  }
  const context = { currentTime: 12, sampleRate: rate, state: 'running', nodes, sources, buffers,
    destination: node('global-destination'),
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const b = { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] };
      buffers.push(b); return b;
    },
    createBufferSource() {
      const n = node('source', { starts: [], stops: 0,
        start(at) { this.starts.push(at); }, stop() { this.stops++; this.onended?.(); } });
      sources.push(n); return n;
    },
    createGain() { return node('gain', { gain: { value: 1 } }); },
    resume() { throw Error('Cannot resume shared context'); }, suspend() { throw Error('Cannot suspend shared context'); }, close() { throw Error('Cannot close shared context'); },
  };
  const destination = node('existing-monitor-and-recording-bus'), other = node('unrelated-radio'); other.connect(destination);
  return { context, destination, other };
}
function setup(rate) { const f = fakeContext(rate); return { ...f, audio: createDriveBumperIntrusionAudio(f) }; }
const energy = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

test('initialization prepares one deterministic short, bounded dry PCM with silent ends', () => {
  const a = setup(), b = setup();
  assert.equal(a.context.sources.length, 0); assert.equal(a.context.buffers.length, 1);
  const buffer = a.context.buffers[0], samples = buffer.getChannelData(0);
  assert.deepEqual(samples, b.context.buffers[0].getChannelData(0));
  assert.equal(buffer.numberOfChannels, 1); assert.ok(buffer.duration >= .12 && buffer.duration < .121);
  assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
  assert.ok(samples.every(Number.isFinite));
  const peak = Math.max(...samples.map(Math.abs)); assert.ok(peak > .1 && peak <= .4);
  assert.ok(energy(samples.slice(0, 8)) < energy(samples.slice(48, 80)), 'the 6ms attack does not begin with a full-level edge');
  assert.ok(energy(samples.slice(720)) < energy(samples.slice(80, 240)) / 15, 'the final 30ms has at least 23dB less energy than the attack body');
  assert.equal(a.audio.diagnostics().maximumGain, .4);
  a.audio.dispose(); b.audio.dispose();
});

test('play owns only its source and gain and routes the shared PCM once to the provided bus', () => {
  const { context, destination, other, audio } = setup();
  assert.equal(audio.play(), true);
  const source = context.sources[0], gain = source.connections[0];
  assert.deepEqual(source.starts, [12]); assert.equal(source.loop, false); assert.equal(gain.gain.value, 1);
  assert.strictEqual(source.buffer, context.buffers[0]); assert.deepEqual(gain.connections, [destination]);
  assert.deepEqual(other.connections, [destination]); assert.equal(destination.disconnects, 0); assert.equal(context.destination.disconnects, 0);
  source.onended();
  assert.equal(source.stops, 0); assert.equal(source.disconnects, 1); assert.equal(gain.disconnects, 1);
  assert.equal(source.onended, null); assert.equal(audio.diagnostics().playing, false); assert.equal(audio.diagnostics().endings, 1);
  audio.dispose(); assert.equal(source.disconnects, 1); assert.deepEqual(other.connections, [destination]);
});

test('strength cannot amplify or stack peaks and reduced motion softens the same cue', () => {
  const { context, audio } = setup();
  assert.equal(audio.play({ strength: 100 }), true); const first = context.sources[0];
  assert.equal(first.connections[0].gain.value, 1);
  assert.equal(audio.play({ strength: .5, reducedMotion: true }), true);
  assert.equal(first.stops, 1); assert.equal(first.disconnects, 1);
  assert.equal(context.buffers.length, 1, 'playing never regenerates PCM');
  const current = context.sources[1]; assert.equal(current.connections[0].gain.value, .275);
  assert.equal(audio.diagnostics().activeSources, 1); assert.equal(audio.diagnostics().reducedMotion, true);
  for (const strength of [0, -1, NaN, Infinity]) assert.equal(audio.play({ strength }), false);
  assert.equal(context.sources.length, 2); assert.equal(audio.diagnostics().playCalls, 6); assert.equal(audio.diagnostics().plays, 2); audio.dispose();
});

test('pause cancels exact owned nodes once, does not restart on resume and never suspends other audio', () => {
  const { context, destination, other, audio } = setup(); audio.play();
  const source = context.sources[0], gain = source.connections[0], staleEnded = source.onended;
  audio.setPaused(true); audio.setPaused(true); staleEnded();
  assert.equal(source.stops, 1); assert.equal(source.disconnects, 1); assert.equal(gain.disconnects, 1);
  assert.equal(audio.play(), false); assert.equal(context.sources.length, 1); assert.equal(context.state, 'running');
  assert.deepEqual(other.connections, [destination]); assert.equal(other.disconnects, 0); assert.equal(destination.disconnects, 0);
  audio.setPaused(false); assert.equal(context.sources.length, 1); assert.equal(audio.play(), true);
  audio.dispose(); assert.ok(context.sources.every(s => s.stops === 1));
});

test('disposal is idempotent and suspended or absent contexts cannot create a voice', () => {
  const { context, audio } = setup(); context.state = 'suspended'; assert.equal(audio.play(), false); assert.equal(context.sources.length, 0);
  context.state = 'running'; audio.play(); assert.equal(audio.dispose(), true); assert.equal(audio.dispose(), false);
  audio.setPaused(false); assert.equal(audio.play(), false); assert.equal(context.sources.length, 1); assert.equal(context.sources[0].stops, 1);
  assert.deepEqual({ playing: audio.diagnostics().playing, available: audio.diagnostics().available, disposed: audio.diagnostics().disposed }, { playing: false, available: false, disposed: true });
  for (const options of [{}, { context: {}, destination: {} }, { context }]) {
    const absent = createDriveBumperIntrusionAudio(options); assert.equal(absent.diagnostics().ready, false); assert.equal(absent.play(), false); assert.equal(absent.dispose(), true);
  }
});

test('construction and failed starts leave shared nodes untouched and bound initialization work', () => {
  const f = fakeContext(10000000), audio = createDriveBumperIntrusionAudio(f);
  assert.ok(f.context.buffers[0].length <= 23041);
  const original = f.context.createBufferSource;
  f.context.createBufferSource = () => { const n = original(); n.start = () => { throw Error('device unavailable'); }; return n; };
  assert.equal(audio.play(), false); assert.equal(audio.diagnostics().playing, false);
  assert.equal(f.context.sources[0].disconnects, 1); assert.equal(f.destination.disconnects, 0); assert.equal(f.other.disconnects, 0);
  audio.dispose();
});
