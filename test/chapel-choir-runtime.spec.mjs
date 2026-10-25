import test from 'node:test';
import assert from 'node:assert/strict';
import { createChapelChoirRuntime, validateChapelChoirBank } from '../src/audio/chapel-choir.js';
import { createChapelChoirScore } from '../src/audio/chapel-choir-score.js';

const parts = ['S', 'A', 'T1', 'T2', 'B1', 'B2'];
function manifest(independent = false) {
  return { version: 1, duration: 8, sourceKind: independent ? 'independent-parts' : 'ensemble-mix',
    tracks: (independent ? parts : ['ensemble']).map((part, i) => ({
      id: part.toLowerCase(), part, file: `voice-${i}.wav`, sha256: String(i + 1).repeat(64),
      source: 'https://example.test/original-session', licenceUrl: 'https://example.test/licence',
      originalTrack: `original-${i}`, anchor: `singer-${part.toLowerCase()}`,
      projectionAnchor: `speaker-${part.toLowerCase()}`,
    })) };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// This observes routing and scheduled AudioParam/source calls without a
// browser or an audio device. It makes no claim about rendered sound quality.
function fixture({ bank = manifest(), phaseOffset = .37, fetchFailure = null,
  decodedChannels = 1, decodedDuration = bank.duration, decodeGate = null } = {}) {
  const nodes = [], sources = [], fetched = [], decoded = [];
  let serial = 0;
  function parameter(owner, name, initial = 0) {
    return { owner, name, value: initial, calls: [],
      setTargetAtTime(...args) { this.calls.push(['target', ...args]); },
      setValueAtTime(...args) { this.calls.push(['set', ...args]); },
      linearRampToValueAtTime(...args) { this.calls.push(['ramp', ...args]); },
      cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]); },
    };
  }
  function node(kind) {
    const value = { id: serial++, kind, connections: new Set(), disconnectCount: 0,
      connect(other) { this.connections.add(other); return other; },
      disconnect(other) { this.disconnectCount++; if (other) this.connections.delete(other); else this.connections.clear(); },
    };
    nodes.push(value); return value;
  }
  const context = { sampleRate: 48000, currentTime: 23.4,
    createGain() { const value = node('gain'); value.gain = parameter(value, 'gain', 1); return value; },
    createConvolver: () => node('convolver'),
    createBiquadFilter() { const value = node('filter'); value.frequency = parameter(value, 'frequency'); value.Q = parameter(value, 'Q'); return value; },
    createStereoPanner() { const value = node('pan'); value.pan = parameter(value, 'pan'); return value; },
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate,
        getChannelData: i => data[i] };
    },
    async decodeAudioData(bytes) {
      decoded.push(bytes); if (decodeGate) await decodeGate.promise;
      return this.createBuffer(decodedChannels, Math.round(decodedDuration * this.sampleRate), this.sampleRate);
    },
    createBufferSource() {
      const value = node('source'); value.playbackRate = parameter(value, 'playbackRate', 1);
      value.starts = []; value.stops = [];
      value.start = (...args) => value.starts.push(args);
      value.stop = (...args) => value.stops.push(args);
      value.end = () => value.onended?.(); sources.push(value); return value;
    },
  };
  const destination = node('destination');
  const fetcher = async file => {
    fetched.push(file);
    return { ok: file !== fetchFailure, status: file === fetchFailure ? 404 : 200,
      json: async () => bank, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const runtime = createChapelChoirRuntime({ context, destination, urlFor: value => value,
    score: createChapelChoirScore({ duration: bank.duration }), fetcher, phaseOffset, random: () => .5 });
  const input = { active: true, voices: bank.tracks.flatMap((track, i) => [
    { id: track.anchor, dx: i - 2, dz: -3, gain: 1, occlusionDb: 0 },
    { id: track.projectionAnchor, dx: 4 - i, dz: -6, gain: 1, occlusionDb: 0 },
  ]) };
  const master = nodes.find(n => n.kind === 'gain' && n.connections.has(destination));
  return { context, runtime, input, nodes, sources, fetched, decoded, destination, master, phaseOffset, bank };
}
function reaches(from, target, visited = new Set()) {
  if (from === target) return true;
  if (!from?.connections || visited.has(from)) return false;
  visited.add(from);
  return [...from.connections].some(next => reaches(next, target, visited));
}

test('missing audio capability is inert and manifest distinguishes one ensemble from six actual parts', async () => {
  const inert = createChapelChoirRuntime();
  assert.equal(await inert.ready(), false); assert.equal(inert.update({ active: true }).audible, false);
  inert.stop(); inert.dispose();
  assert.equal(validateChapelChoirBank(manifest()).sourceKind, 'ensemble-mix');
  assert.equal(validateChapelChoirBank(manifest(true)).tracks.length, 6);
  assert.throws(() => validateChapelChoirBank({ ...manifest(), sourceKind: 'independent-parts' }));
  assert.throws(() => validateChapelChoirBank({ ...manifest(true), sourceKind: 'ensemble-mix' }));
});

test('independent parts reject reused audio, repeated roles, original-track aliases and missing anchors', () => {
  const mutations = [
    bank => { bank.tracks[1].sha256 = bank.tracks[0].sha256; },
    bank => { bank.tracks[1].part = bank.tracks[0].part; },
    bank => { bank.tracks[1].originalTrack = bank.tracks[0].originalTrack; },
    bank => { delete bank.tracks[1].anchor; },
    bank => { delete bank.tracks[1].projectionAnchor; },
  ];
  for (const mutate of mutations) { const bank = manifest(true); mutate(bank); assert.throws(() => validateChapelChoirBank(bank)); }
});

test('one recorded voice splits before gain; control and voice start on the same audio clock without pitch change', async () => {
  const f = fixture(); assert.equal(await f.runtime.ready(), true);
  const state = f.runtime.update(f.input), [voice, control] = f.sources;
  assert.equal(state.sourceKind, 'ensemble-mix'); assert.equal(state.independentParts, 0);
  assert.equal(state.sourceCount, 2); assert.equal(f.sources.length, 2, 'natural and projection do not duplicate PCM sources');
  assert.equal(voice.buffer.sampleRate, 48000); assert.equal(control.buffer.sampleRate, 12000);
  assert.equal(control.buffer.length, 8 * 12000 + 1, 'padded endpoint must not become the loop duration');
  assert.equal(control.buffer.getChannelData(0).at(-1), 1);
  for (const source of f.sources) {
    assert.equal(source.loop, true); assert.equal(source.loopStart, 0); assert.equal(source.loopEnd, f.bank.duration);
    assert.equal(source.playbackRate.value, 1); assert.equal(source.starts.length, 1);
  }
  assert.deepEqual(voice.starts, control.starts);
  const [at, offset] = voice.starts[0];
  assert.ok(Math.abs(at - (f.context.currentTime + .012)) < 1e-12);
  assert.ok(Math.abs(offset - ((at + f.phaseOffset) % f.bank.duration)) < 1e-12);
  const envelope = [...voice.connections][0], modulationGain = [...control.connections][0];
  assert.equal(envelope.connections.size, 2, 'one envelope feeds the natural path and modulator');
  assert.equal(modulationGain.name, 'gain'); assert.ok(envelope.connections.has(modulationGain.owner));
  assert.equal(modulationGain.value, 0, 'AudioParam input must replace, rather than add unity to, the authored control');
  assert.ok(reaches(envelope, f.master)); assert.ok(reaches(modulationGain.owner, f.master));
  f.runtime.dispose();
});

test('six declared parts keep six PCM sources and six aligned gain sources, rather than duplicating a mix', async () => {
  const f = fixture({ bank: manifest(true) }); await f.runtime.ready();
  const state = f.runtime.update(f.input);
  assert.equal(state.independentParts, 6); assert.equal(f.decoded.length, 6); assert.equal(state.sourceCount, 12);
  const starts = f.sources.map(source => source.starts[0]);
  assert.ok(starts.every(start => start[0] === starts[0][0] && start[1] === starts[0][1]));
  const pcm = f.sources.filter(source => source.buffer.sampleRate === 48000);
  assert.equal(pcm.length, 6); assert.equal(new Set(pcm.map(source => source.buffer)).size, 6);
  f.runtime.dispose();
});

test('render stalls and repeated updates cannot grow sources; re-entry seeks the advancing shared phase', async () => {
  const f = fixture(); await f.runtime.ready(); const first = f.runtime.update(f.input);
  for (let i = 0; i < 30; i++) f.runtime.update(f.input);
  assert.equal(f.sources.length, 2); assert.equal(f.runtime.frame().started, first.started);
  const retired = [...f.sources]; f.context.currentTime += 100.3;
  assert.equal(f.runtime.update({ ...f.input, active: false }).sourceCount, 0);
  assert.ok(retired.every(source => source.stops.length === 1));
  f.context.currentTime += .2; const next = f.runtime.update(f.input);
  assert.equal(f.sources.length, 4); assert.equal(next.sourceCount, 2);
  assert.notEqual(next.starts[0].offset, first.starts[0].offset);
  assert.ok(Math.abs(next.starts[0].offset - ((f.context.currentTime + .012 + f.phaseOffset) % 8)) < 1e-12);
  assert.equal(f.fetched.length, 2, 'returning does not refetch or redecode the bank');
  assert.equal(f.runtime.update({ active: true, voices: [] }).audible, false, 'removed anchors cannot leak the last position');
  f.runtime.dispose();
});

test('recording/pause protection covers dry and wet paths and quick return cannot reopen retired reflection history', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(f.input);
  const oldRoom = f.nodes.find(node => node.kind === 'convolver');
  const oldEnvelopes = f.sources.filter(source => source.buffer.sampleRate === 48000).map(source => [...source.connections][0]);
  f.context.currentTime += .003;
  const quiet = f.runtime.update({ ...f.input, muted: true, reason: 'recording' });
  assert.equal(quiet.audible, false); assert.equal(quiet.sourceCount, 0);
  assert.deepEqual(f.master.gain.calls.at(-1), ['target', 0, f.context.currentTime, .025]);
  assert.equal(oldRoom.connections.size, 0, 'retired convolver must not be reopened by the next master fade');
  assert.ok(oldEnvelopes.every(envelope => !reaches(envelope, f.master)), 'retired voices cannot feed newly cleared room history');
  const roomsAfterStop = f.nodes.filter(node => node.kind === 'convolver').length;
  for (let i = 0; i < 5; i++) f.runtime.update({ ...f.input, muted: true });
  assert.equal(f.nodes.filter(node => node.kind === 'convolver').length, roomsAfterStop);
  f.context.currentTime += .02; assert.equal(f.runtime.update(f.input).sourceCount, 2);
  assert.ok(oldEnvelopes.every(envelope => !reaches(envelope, f.master)));
  assert.equal(oldRoom.connections.size, 0);
  f.runtime.dispose();
});

test('speech ducks the full mix without restarting its vocal and control transports', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(f.input);
  f.context.currentTime += .4; f.runtime.update({ ...f.input, dialogue: true });
  assert.equal(f.sources.length, 2); assert.equal(f.runtime.frame().sourceCount, 2);
  assert.deepEqual(f.master.gain.calls.at(-1), ['target', .72 * .16, f.context.currentTime, .4]);
  f.sources[0].end(); assert.equal(f.runtime.update({ ...f.input, muted: true }).sourceCount, 0);
  assert.ok(f.sources.every(source => source.connections.size === 0)); f.runtime.dispose();
});

test('manifest/track failures and misaligned or stereo decoded input stay silent', async () => {
  for (const options of [
    { fetchFailure: 'manifest.json' }, { fetchFailure: 'voice-0.wav' },
    { decodedChannels: 2 }, { decodedDuration: 7.9 },
  ]) {
    const f = fixture(options); assert.equal(await f.runtime.ready(), false);
    const state = f.runtime.update(f.input);
    assert.equal(state.loaded, false); assert.equal(state.audible, false); assert.equal(state.sourceCount, 0);
    assert.ok(state.failed); assert.equal(f.sources.length, 0); f.runtime.dispose();
  }
});

test('disposal while decode is pending cannot install buses or restart audio', async () => {
  const gate = deferred(), f = fixture({ decodeGate: gate });
  const pending = f.runtime.ready();
  for (let i = 0; i < 20 && !f.decoded.length; i++) await Promise.resolve();
  assert.equal(f.decoded.length, 1); f.runtime.dispose();
  const afterDisposeCount = f.nodes.length; gate.resolve(); assert.equal(await pending, false);
  assert.equal(f.nodes.length, afterDisposeCount); assert.equal(f.sources.length, 0);
  assert.equal(f.runtime.update(f.input).audible, false);
  assert.ok(f.nodes.every(node => node.connections.size === 0));
});

test('disposal is final and idempotent before any loading', async () => {
  const f = fixture(); f.runtime.dispose(); const nodeCount = f.nodes.length;
  f.runtime.dispose(); assert.equal(f.nodes.length, nodeCount, 'second disposal must not allocate a fresh room');
  assert.equal(await f.runtime.ready(), false); assert.equal(f.fetched.length, 0);
  assert.equal(f.runtime.update(f.input).sourceCount, 0);
});
