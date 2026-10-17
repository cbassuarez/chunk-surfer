import assert from 'node:assert/strict';
import { createBustReliquaryAudio } from '../src/audio/bust-reliquary-audio.js';

function mockContext() {
  const nodes = [], buffers = [];
  const param = () => ({ events: [], setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); }, exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); } });
  const make = kind => {
    const node = { kind, connections: [], disconnected: false, stops: [], starts: [], connect(next) { this.connections.push(next); }, disconnect() { this.disconnected = true; }, start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); }, gain: param(), pan: param(), frequency: param(), Q: param() };
    nodes.push(node); return node;
  };
  return {
    sampleRate: 8000, currentTime: 10, state: 'running', destination: { kind: 'destination' }, nodes, buffers,
    createGain: () => make('gain'), createStereoPanner: () => make('panner'),
    createOscillator: () => make('oscillator'), createBufferSource: () => make('buffer-source'), createBiquadFilter: () => make('filter'),
    createBuffer(channels, size, rate) { const data = new Float32Array(size); const buffer = { channels, size, rate, getChannelData: () => data }; buffers.push(buffer); return buffer; },
  };
}

const cue = { id: 'bearing-turns', phase: 'ritual', target: 'neck', receipt: 'ritual:bearing-turns' };
const ctx = mockContext();
const audio = createBustReliquaryAudio({ getAudio: () => ({ ctx, destination: ctx.destination }) });
assert.deepEqual(audio.play([cue], { pan: .6, gain: .5, distance: 8 }), { played: 1, skipped: 0 });
assert.equal(audio.snapshot().voices, 1);
assert.equal(audio.snapshot().lastPan, .6);
assert.equal(audio.snapshot().lastCue, 'bearing-turns');
const master = ctx.nodes[0];
assert.equal(master.gain.events[0][1], .18 * .5 / 2, 'distance and scene gain both attenuate the audible contact');
assert.equal(ctx.nodes.find(node => node.kind === 'panner').pan.events[0][1], .6);
assert.ok(ctx.nodes.filter(node => node.kind === 'oscillator').every(node => node.starts[0] === 10 && node.stops[0] < 11), 'contacts are short tails scheduled at the cue, not a separate ritual timeline');
assert.equal(audio.play([cue]).played, 0, 'a duplicate receipt cannot play twice');
assert.equal(audio.snapshot().played, 1);
audio.suspend();
assert.equal(audio.snapshot().voices, 0);
assert.equal(audio.snapshot().suspended, true);
assert.ok(ctx.nodes.every(node => node.disconnected), 'pause tears down all tails and intermediate graph nodes');
assert.ok(ctx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'buffer-source').every(node => node.stops.length === 2), 'pause cancels every sounding source');
assert.equal(audio.play([{ ...cue, id: 'seal-contact', receipt: 'ritual:seal-contact' }], { pan: 5, gain: 100 }).played, 1);
assert.equal(audio.snapshot().suspended, false, 'a new cue after resume can play normally');
assert.equal(audio.snapshot().lastPan, 1, 'spatial pan is bounded');
audio.dispose();
assert.equal(audio.snapshot().disposed, true);
assert.equal(audio.snapshot().voices, 0);
assert.equal(audio.play([{ ...cue, receipt: 'new' }]).played, 0);

const otherCtx = mockContext();
const deterministic = createBustReliquaryAudio({ getAudio: () => ({ ctx: otherCtx }) });
deterministic.play([cue]);
assert.deepEqual(ctx.buffers[0].getChannelData(0), otherCtx.buffers[0].getChannelData(0), 'mechanical grain is deterministic across runs without Math.random');
assert.ok(otherCtx.buffers[0].getChannelData(0).some(value => value !== 0), 'friction produces actual audio samples');
for (const source of otherCtx.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'buffer-source')) source.onended();
assert.equal(deterministic.snapshot().voices, 0, 'finished sources release their whole contact graph');
assert.ok(otherCtx.nodes.every(node => node.disconnected));

const missing = createBustReliquaryAudio();
assert.equal(missing.play([cue]).played, 0);
const pausedCtx = mockContext(); pausedCtx.state = 'suspended';
const paused = createBustReliquaryAudio({ getAudio: () => ({ ctx: pausedCtx }) });
assert.equal(paused.play([cue]).played, 0);
assert.equal(pausedCtx.nodes.length, 0, 'the optional scene audio does not resume a suspended AudioContext');
pausedCtx.state = 'running';
assert.equal(paused.play([cue]).played, 1);
assert.equal(paused.play([{ id: 'unknown', receipt: 'unknown' }]).played, 0);
const unsupportedPannerCtx = mockContext(); delete unsupportedPannerCtx.createStereoPanner;
assert.equal(createBustReliquaryAudio({ getAudio: () => ({ ctx: unsupportedPannerCtx }) }).play([cue]).played, 1, 'mono fallback retains contact sound');
const throwing = createBustReliquaryAudio({ getAudio: () => { throw new Error('audio unavailable'); } });
assert.equal(throwing.play([cue]).played, 0);
assert.equal(throwing.snapshot().errors, 1, 'an optional audio failure cannot interrupt gameplay');

console.log('bust reliquary audio tests ok');
