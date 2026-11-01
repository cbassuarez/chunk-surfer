import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHushMix, hushMixTargets } from '../src/audio/hush-mix.js';
import { createHushAudioRuntime } from '../src/game/hush-audio-runtime.js';

const field = { active: true, absorption: { audio: .8, monitor: .8 },
  presentation: { audio: .8, monitor: .8, hiss: 1 } };
const options = { concealed: true, hushRelativeSide: 1 };

test('cover absence follows the real side without boosting or touching the monitor', () => {
  const right = hushMixTargets(field, {}, options);
  const left = hushMixTargets(field, {}, { ...options, hushRelativeSide: -1 });
  const centre = hushMixTargets(field, {}, { ...options, hushRelativeSide: 0 });
  assert.equal(right.worldLeftGain, 1);
  assert.equal(right.worldRightGain, 1 - .8 * .22);
  assert.equal(left.worldLeftGain, right.worldRightGain);
  assert.equal(left.worldRightGain, 1);
  assert.equal(centre.worldLeftGain, 1);
  assert.equal(centre.worldRightGain, 1);
  assert.equal(right.monitorDryGain, left.monitorDryGain);
  assert.equal(right.worldGain, left.worldGain);
  // For any mono source duplicated into two channels, this gain is at most 1.
  assert.ok((right.worldLeftGain + right.worldRightGain) / 2 <= 1);
  for (const side of [-20, -1, 0, 1, 20, NaN, null]) {
    const t = hushMixTargets(field, {}, { concealed: true, hushRelativeSide: side });
    assert.ok(t.worldLeftGain >= .78 && t.worldLeftGain <= 1);
    assert.ok(t.worldRightGain >= .78 && t.worldRightGain <= 1);
  }
  for (const t of [hushMixTargets(null, {}, options), hushMixTargets(field, {}, {}),
    hushMixTargets({ ...field, active: false }, {}, options),
    hushMixTargets({ ...field, presentation: { ...field.presentation, audio: 0 } }, {}, options)]) {
    assert.equal(t.worldLeftGain, 1);
    assert.equal(t.worldRightGain, 1);
  }
  const reduced = hushMixTargets({ ...field, presentation: { ...field.presentation, audio: .3 } }, {}, options);
  assert.ok(reduced.worldRightGain > right.worldRightGain);
});

test('split stereo graph restores equal channels after exit and works without a splitter', async () => {
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; } });
  const nodes = [];
  const node = (kind) => { const n = { kind, gain: param(), frequency: param(), Q: param(), connections: [],
    connect(...args) { this.connections.push(args); }, disconnect() {}, start() {}, stop() {} }; nodes.push(n); return n; };
  const ctx = { currentTime: 0, sampleRate: 10, createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'), createBufferSource: () => node('source'),
    createChannelSplitter: () => node('splitter'), createChannelMerger: () => node('merger'),
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
    decodeAudioData: async () => ({ duration: 1 }) };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  try {
    const mix = createHushMix(ctx, { worldDestination: node('destination') });
    await mix.preloadAll();
    mix.applyField(field, {}, options);
    const splitter = nodes.find((n) => n.kind === 'splitter');
    const merger = nodes.find((n) => n.kind === 'merger');
    const [left, right] = splitter.connections.map(([n]) => n);
    assert.equal(left.gain.value, 1);
    assert.equal(right.gain.value, 1 - .8 * .22);
    assert.deepEqual(left.connections[0], [merger, 0, 0]);
    assert.deepEqual(right.connections[0], [merger, 0, 1]);
    const input = nodes.find((n) => n.connections.some(([destination]) => destination === splitter));
    assert.equal(input.channelCountMode, 'explicit');
    assert.equal(input.channelInterpretation, 'speakers');
    mix.applyField(field, {}, { concealed: false, hushRelativeSide: 1 });
    assert.equal(left.gain.value, 1);
    assert.equal(right.gain.value, 1);
    mix.destroy();
    delete ctx.createChannelSplitter;
    const fallback = createHushMix(ctx, { worldDestination: node('fallback-destination') });
    await fallback.preloadAll();
    fallback.applyField(field, {}, options);
    fallback.destroy();
  } finally { globalThis.fetch = oldFetch; }
});

test('runtime forwards only the player-facing spatial context, never a target', () => {
  let applied;
  const runtime = createHushAudioRuntime({
    presence: { publicSnapshot: () => ({ active: true, position: { x: 1, y: 0 } }) },
    playerSpatial: () => ({ position: { x: 0, y: 0 } }),
    context: () => ({ allowMischief: false, concealed: true, hushRelativeSide: -.5 }),
    effects: { applyField: (_, __, options) => { applied = options; } },
  });
  runtime.tick(.016);
  assert.equal(applied.concealed, true);
  assert.equal(applied.hushRelativeSide, -.5);
  assert.equal('target' in applied, false);
  runtime.destroy();
});
