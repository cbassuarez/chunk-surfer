import test from 'node:test';
import assert from 'node:assert/strict';
import { createTowerWarningAudio } from '../src/audio/tower-warning.js';

const line = { id: 'warning:first', text: 'Do not take the job.', voice: 'tower ghost' };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture({ hrtf = true, renderVoice = null, missing = false } = {}) {
  const nodes = [], sources = [], errors = [], renders = [];
  const parameter = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const node = (kind, more = {}) => { const value = { kind, connections: [], disconnected: false, connect(into) { this.connections.push(into); return into; }, disconnect() { this.disconnected = true; this.connections = []; }, ...more }; nodes.push(value); return value; };
  const context = { currentTime: 10, state: 'running', sampleRate: 22050, listener: Object.freeze({ untouched: true }), resumeCalls: 0,
    resume() { this.resumeCalls++; },
    createGain: () => node('gain', { gain: parameter() }),
    createBuffer: (count, length, sampleRate) => { const samples = new Float32Array(length); return { duration: length / sampleRate, sampleRate, getChannelData: () => samples }; },
    createBufferSource: () => { const value = node('source', { starts: [], stops: [], playbackRate: {}, start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); this.onended?.(); } }); sources.push(value); return value; },
    createStereoPanner: () => node('stereo', { pan: parameter() }),
  };
  if (hrtf) context.createPanner = () => node('hrtf', { positionX: parameter(), positionY: parameter(), positionZ: parameter() });
  const destination = node('existing-sfx');
  let route = missing ? null : { context, destination };
  const audio = createTowerWarningAudio({ getAudio: () => route, renderVoice: (text, options) => {
    renders.push({ text, options });
    return renderVoice ? renderVoice(text, options) : Promise.resolve({ samples: Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i * .1) * .3), sampleRate: 22050, provider: 'fixture' });
  }, onError: error => errors.push(error) });
  const frame = { line, listener: { x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0 }, source: { x: 3, y: 1.55, z: -4 }, paused: false, enabled: true };
  return { audio, context, nodes, sources, renders, errors, destination, frame, setRoute(value) { route = value; } };
}

test('preparation only renders cached PCM and never creates a source or changes shared context state', async () => {
  const f = fixture();
  assert.equal(await f.audio.prepare([line, line]), true);
  assert.equal(f.renders.length, 1); assert.equal(f.sources.length, 0); assert.equal(f.context.resumeCalls, 0);
  assert.deepEqual(f.context.listener, { untouched: true });
  assert.equal(f.audio.snapshot().lineId, null);
});

test('world updates alone start selected prepared speech through the existing SFX route', async () => {
  const f = fixture(); await f.audio.prepare([line]);
  const result = f.audio.update(f.frame);
  assert.equal(result.lineId, line.id); assert.equal(result.active, true); assert.equal(result.ready, true); assert.equal(result.done, false);
  assert.equal(result.provider, 'fixture'); assert.equal(result.spatialisation, 'HRTF');
  assert.equal(f.sources[0].playbackRate.value, .92); assert.deepEqual(f.sources[0].starts, [[10, 0]]);
  assert.equal(f.nodes.filter(node => node.connections.includes(f.destination)).length, 1);
  assert.equal(f.sources[0].buffer.getChannelData(0).length, 44100);
  assert.equal(f.context.resumeCalls, 0);
});

test('completion comes from the actual finite source ending, never a silent countdown', async () => {
  const f = fixture({ missing: true }); await f.audio.prepare([line]);
  f.audio.update(f.frame); f.context.currentTime = 1000;
  assert.equal(f.audio.update(f.frame).done, false); assert.equal(f.sources.length, 0);
  f.setRoute({ ctx: f.context, destination: f.destination });
  f.audio.update(f.frame); assert.equal(f.sources.length, 1);
  assert.equal(f.audio.snapshot().done, false);
  f.sources[0].onended();
  assert.equal(f.audio.snapshot().done, true); assert.equal(f.audio.snapshot().active, false);
  f.audio.update(f.frame); assert.equal(f.sources.length, 1, 'a completed line cannot restart');
});

test('pause retains the exact PCM offset and needs a subsequent world update to resume', async () => {
  const f = fixture(); await f.audio.prepare([line]); f.audio.update(f.frame);
  f.context.currentTime = 10.5;
  const paused = f.audio.pause();
  assert.equal(paused.offset, .46); assert.equal(paused.active, false); assert.equal(paused.done, false);
  f.context.currentTime = 100; f.audio.setPaused(false);
  assert.equal(f.sources.length, 1, 'unpausing itself does not start audio');
  assert.equal(f.audio.snapshot().offset, .46);
  f.audio.update(f.frame);
  assert.deepEqual(f.sources[1].starts, [[100, .46]]); assert.equal(f.context.resumeCalls, 0);
  assert.ok(f.sources[0].disconnected);
});

test('disabled or suspended context stops the current source without progressing speech', async () => {
  for (const reason of ['disabled', 'suspended']) {
    const f = fixture(); await f.audio.prepare([line]); f.audio.update(f.frame); f.context.currentTime = 10.25;
    if (reason === 'suspended') f.context.state = 'suspended';
    f.audio.update({ ...f.frame, enabled: reason !== 'disabled' });
    const before = f.audio.snapshot().offset;
    f.context.currentTime = 90;
    f.audio.update({ ...f.frame, enabled: reason !== 'disabled' });
    assert.equal(f.audio.snapshot().offset, before); assert.equal(f.audio.snapshot().done, false); assert.equal(f.context.resumeCalls, 0);
  }
});

test('async preparation settling during pause, disable or withdrawal cannot start a late voice', async () => {
  for (const interruption of ['pause', 'disable', 'withdraw', 'destroy']) {
    let release;
    const f = fixture({ renderVoice: () => new Promise(resolve => { release = resolve; }) });
    f.audio.update(f.frame); await flush();
    if (interruption === 'pause') f.audio.pause();
    if (interruption === 'disable') f.audio.update({ ...f.frame, enabled: false });
    if (interruption === 'withdraw') f.audio.update({ ...f.frame, line: null });
    if (interruption === 'destroy') f.audio.destroy();
    release({ samples: new Float32Array(22050), sampleRate: 22050, provider: 'late' }); await flush();
    assert.equal(f.sources.length, 0, interruption);
    if (interruption !== 'destroy') f.audio.update({ ...f.frame, line: interruption === 'withdraw' ? null : line, paused: interruption === 'pause', enabled: interruption !== 'disable' });
    else f.audio.update(f.frame);
    assert.equal(f.sources.length, 0, interruption);
  }
});

test('a superseded render cannot replace or end the new current line', async () => {
  const releases = new Map();
  const f = fixture({ renderVoice: text => new Promise(resolve => releases.set(text, resolve)) });
  const second = { ...line, id: 'warning:second', text: 'You will not make it out.' };
  f.audio.update(f.frame); await flush(); f.audio.update({ ...f.frame, line: second }); await flush();
  releases.get(line.text)({ samples: new Float32Array(22050), sampleRate: 22050 }); await flush();
  assert.equal(f.audio.snapshot().lineId, second.id); assert.equal(f.audio.snapshot().ready, false);
  releases.get(second.text)({ samples: new Float32Array(22050), sampleRate: 22050 }); await flush();
  assert.equal(f.sources.length, 0, 'render completion waits for a world update');
  f.audio.update({ ...f.frame, line: second });
  assert.equal(f.sources.length, 1); assert.equal(f.audio.snapshot().lineId, second.id);
});

test('line changes clear old ownership and stale onended cannot complete its successor', async () => {
  const f = fixture(); const second = { ...line, id: 'warning:second', text: 'You will not make it out.' };
  await f.audio.prepare([line, second]); f.audio.update(f.frame); const oldEnded = f.sources[0].onended;
  f.audio.update({ ...f.frame, line: second }); oldEnded();
  assert.equal(f.audio.snapshot().lineId, second.id); assert.equal(f.audio.snapshot().done, false); assert.equal(f.sources.length, 2);
  assert.ok(f.sources[0].disconnected); assert.equal(f.sources[0].onended, null);
  f.audio.update({ ...f.frame, line: null }); assert.equal(f.audio.snapshot().lineId, null); assert.equal(f.audio.snapshot().active, false);
});

test('fixed-world HRTF follows listener yaw, pitch and height without moving the shared listener', async () => {
  const f = fixture(); await f.audio.prepare([line]); const first = f.audio.update(f.frame);
  const turned = f.audio.update({ ...f.frame, listener: { ...f.frame.listener, yaw: Math.PI } });
  assert.ok(first.relativeXYZ[0] * turned.relativeXYZ[0] < 0);
  assert.deepEqual(first.source, turned.source);
  const pitched = f.audio.update({ ...f.frame, listener: { ...f.frame.listener, pitch: .7 } });
  assert.notEqual(pitched.relativeXYZ[1], first.relativeXYZ[1]);
  const panner = f.nodes.find(node => node.kind === 'hrtf');
  assert.equal(panner.panningModel, 'HRTF'); assert.equal(panner.rolloffFactor, 0);
  assert.deepEqual(f.context.listener, { untouched: true });
  assert.equal(f.sources.length, 1);
});

test('stereo fallback remains directional and distance attenuates without new sources', async () => {
  const f = fixture({ hrtf: false }); await f.audio.prepare([line]); f.audio.update(f.frame);
  const panner = f.nodes.find(node => node.kind === 'stereo'), before = panner.pan.value;
  f.audio.update({ ...f.frame, listener: { ...f.frame.listener, yaw: Math.PI } });
  assert.ok(before * panner.pan.value < 0); assert.equal(f.sources.length, 1);
  const gain = f.nodes.filter(node => node.kind === 'gain').at(-1).gain, near = gain.value;
  f.audio.update({ ...f.frame, listener: { ...f.frame.listener, x: 30 } });
  assert.ok(gain.value < near); assert.equal(f.audio.snapshot().spatialisation, 'stereo');
});

test('failed or invalid PCM reports honestly, stays silent and does not mark a line done', async () => {
  for (const renderVoice of [async () => { throw new Error('render failed'); }, async () => ({ samples: [], sampleRate: 0 })]) {
    const f = fixture({ renderVoice }); f.audio.update(f.frame); await flush();
    const state = f.audio.update(f.frame);
    assert.equal(state.ready, false); assert.equal(state.done, false); assert.ok(state.error);
    assert.equal(f.sources.length, 0); assert.equal(f.errors.length, 1);
  }
});

test('a context or output swap seeks the retained speech instead of replaying its beginning', async () => {
  const f = fixture(); await f.audio.prepare([line]); f.audio.update(f.frame);
  f.context.currentTime = 10.4;
  const changed = { ...f.context, currentTime: 80 };
  f.setRoute({ context: changed, destination: { id: 'new-sfx' } });
  const state = f.audio.update(f.frame);
  assert.ok(Math.abs(f.sources[1].starts[0][1] - .368) < 1e-8);
  assert.equal(f.sources[1].starts[0][0], 80); assert.equal(state.active, true);
  assert.equal(f.sources[0].disconnected, true);
});

test('partial graph failures release allocated nodes and cannot crash world updates', async () => {
  for (const failure of ['createBuffer', 'start']) {
    const f = fixture(); await f.audio.prepare([line]);
    if (failure === 'createBuffer') f.context.createBuffer = () => { throw new Error('allocation failed'); };
    else {
      const create = f.context.createBufferSource;
      f.context.createBufferSource = () => { const source = create(); source.start = () => { throw new Error('source failed'); }; return source; };
    }
    let state;
    assert.doesNotThrow(() => { state = f.audio.update(f.frame); });
    assert.equal(state.active, false); assert.equal(state.done, false); assert.ok(state.error);
    assert.equal(f.errors.length, 1);
    assert.ok(f.nodes.filter(node => node.kind !== 'existing-sfx').every(node => node.disconnected));
  }
});

test('destroy stops and disconnects its nodes, invalidates pending work and leaves the shared context alive', async () => {
  const f = fixture(); await f.audio.prepare([line]); f.audio.update(f.frame); f.audio.destroy(); f.audio.destroy();
  assert.equal(f.audio.snapshot().destroyed, true); assert.equal(f.audio.snapshot().active, false);
  assert.ok(f.nodes.filter(node => node.kind !== 'existing-sfx').every(node => node.disconnected));
  assert.equal(f.context.state, 'running'); assert.equal(await f.audio.prepare([line]), false);
  f.audio.update(f.frame); assert.equal(f.sources.length, 1);
});
