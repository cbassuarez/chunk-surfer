import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceContinuationAudio, sourceContinuationPlacement, SOURCE_CONTINUATION_AUDIO as C } from '../src/audio/source-continuation.js';

function graph({ panner = true } = {}) {
  const nodes = [], sources = [], buffers = [];
  const param = () => ({ value: 0, history: [], setValueAtTime(v, at) { this.value = v; this.history.push(['set', v, at]); },
    exponentialRampToValueAtTime(v, at) { this.value = v; this.history.push(['ramp', v, at]); },
    setTargetAtTime(v, at, seconds) { this.value = v; this.history.push(['target', v, at, seconds]); } });
  const node = (kind, extra = {}) => { const n = { kind, ...extra, connections: [], connect(to) { this.connections.push(to); return to; },
    disconnect() { this.connections = []; this.disconnected = true; } }; nodes.push(n); return n; };
  const source = kind => { const n = node(kind, { frequency: param(), starts: [], stops: [], start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } }); sources.push(n); return n; };
  const ctx = { state: 'running', currentTime: 10, sampleRate: 8000, createOscillator: () => source('tone'), createBufferSource: () => source('noise'),
    createGain: () => node('gain', { gain: param() }), createBiquadFilter: () => node('filter', { frequency: param(), Q: param() }),
    createBuffer(channels, length, rate) { const data = new Float32Array(length), b = { getChannelData: () => data, length, rate }; buffers.push(b); return b; } };
  if (panner) ctx.createStereoPanner = () => node('pan', { pan: param() });
  return { ctx, destination: node('destination'), nodes, sources, buffers };
}
const state = (extra = {}) => ({ phase: 'catch', x: -23, z: 0, feet: 3, yaw: 0, elapsed: 0,
  counterweight: { active: true, mode: 'walking', x: -18, z: -3, y: 3 }, ...extra });
const layer = (sound, kind) => sound.snapshot().layers.filter(v => v.kind === kind);
function frame(sound, s, dt = .1, focus = null) { return sound.update({ state: s, dt, focus, ready: true }); }

test('unavailable and suspended contexts never queue cues to replay at readiness', () => {
  let pair = null; const sound = createSourceContinuationAudio({ getAudio: () => pair });
  sound.event({ type: 'drop' }, state()); assert.equal(sound.snapshot().voices, 0);
  const g = graph(); pair = g; frame(sound, state());
  assert.equal(g.sources.length, 2, 'only the physical mechanism starts'); assert.equal(sound.snapshot().events, 0);
  g.ctx.state = 'suspended'; sound.event({ type: 'land' }, state()); assert.equal(sound.snapshot().voices, 0);
  assert.ok(g.sources.every(n => n.stops.length));
  g.ctx.state = 'running'; frame(sound, state());
  assert.equal(g.sources.length, 4, 'the old landing is absent'); assert.equal(g.buffers.length, 1, 'one noise allocation per context'); sound.dispose();
});

test('event storms before and after readiness preserve source budgets and hard pause releases every graph', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  for (let i = 0; i < 100; i++) sound.event({ type: 'closure-warning' }, state({ phase: 'wrong-return' }));
  frame(sound, state());
  assert.ok(sound.snapshot().voices <= C.maxVoices); assert.ok(sound.snapshot().sources <= C.maxSources);
  assert.ok(sound.snapshot().skipped > 0); assert.equal(layer(sound, 'mechanism').length, 1);
  sound.pause(); assert.equal(sound.snapshot().sources, 0);
  assert.ok(g.sources.every(n => n.stops.length && n.disconnected));
  assert.ok(g.nodes.filter(n => n !== g.destination).every(n => n.disconnected));
  frame(sound, state()); assert.equal(sound.snapshot().sources, 2); sound.update({ state: state(), ready: false });
  assert.equal(sound.snapshot().sources, 0); sound.dispose();
});

test('a new shared bus cuts old voices and context changes rebuild only the bounded noise buffer', () => {
  const first = graph(), second = graph(); let pair = first;
  const sound = createSourceContinuationAudio({ getAudio: () => pair });
  frame(sound, state()); sound.event({ type: 'drop' }, state()); pair = second; frame(sound, state());
  assert.ok(first.sources.every(n => n.stops.length && n.disconnected));
  assert.equal(second.sources.length, 2); assert.equal(second.buffers.length, 1);
  sound.stop(); sound.stop(); assert.equal(sound.snapshot().voices, 0); sound.dispose();
});

test('stereo follows first-person yaw and Catch fixed north, with real vertical distance attenuation', () => {
  const at = { x: 5, y: .95, z: 0 }, listener = { x: 0, feet: 0, z: 0, yaw: 0, phase: 'wrong-return' };
  assert.ok(sourceContinuationPlacement(at, listener).pan > .8);
  assert.ok(sourceContinuationPlacement(at, { ...listener, yaw: Math.PI }).pan < -.8);
  assert.equal(sourceContinuationPlacement(at, { ...listener, phase: 'catch' }).pan,
    sourceContinuationPlacement(at, { ...listener, phase: 'catch', yaw: Math.PI }).pan);
  const near = sourceContinuationPlacement(at, listener), below = sourceContinuationPlacement({ ...at, y: -18 }, listener);
  assert.ok(below.distance > near.distance); assert.ok(below.gain < near.gain); assert.ok(below.cutoff < near.cutoff);
  assert.ok(sourceContinuationPlacement({ x: NaN, y: Infinity }, {}).gain > 0, 'malformed optional positions stay finite');
});

test('there is no ambient score: the silent dormant front becomes an actual spatial mechanical source', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  const s = state({ phase: 'wrong-return', x: 5, z: 1, feet: 3, closure: { mode: 'dormant', frontZ: -4.5 } });
  frame(sound, s); assert.equal(sound.snapshot().mechanicalGain, 0);
  frame(sound, { ...s, closure: { mode: 'closing', frontZ: 0 } });
  const snap = sound.snapshot(); assert.ok(snap.mechanicalGain > .01); assert.deepEqual(snap.source, { x: 6, y: 3.65, z: 0 });
  assert.ok(snap.mix.pan > 0); assert.equal(layer(sound, 'mechanism').length, 1); sound.dispose();
});

test('ratchets require real machinery travel, and paused relocation cannot create a catch-up burst', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  let s = state(); frame(sound, s);
  for (let i = 0; i < 30; i++) { g.ctx.currentTime += .1; frame(sound, { ...s, elapsed: i * .1 }); }
  assert.equal(layer(sound, 'ratchet').length, 0, 'waiting at an unmoving mechanism has no invented footsteps');
  s = { ...s, counterweight: { ...s.counterweight, x: -18.8 } }; frame(sound, s);
  assert.equal(layer(sound, 'ratchet').length, 1);
  sound.pause(); s = { ...s, counterweight: { ...s.counterweight, x: -28, y: -15 } }; frame(sound, s);
  assert.equal(layer(sound, 'ratchet').length, 0); assert.equal(sound.snapshot().sources, 2);
  sound.dispose();
});

test('vertical cable return remains audible at its actual moving height instead of restarting a score', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  const s = state({ counterweight: { active: true, mode: 'hoisting', x: -28, z: -3, y: -15 } });
  frame(sound, s); const first = sound.snapshot();
  frame(sound, { ...s, counterweight: { ...s.counterweight, y: -14.2 } });
  const second = sound.snapshot(); assert.equal(second.mode, 'hoisting');
  assert.ok(second.mechanicalGain > .01); assert.ok(second.mix.distance < first.mix.distance);
  assert.equal(layer(sound, 'ratchet').length, 1); assert.equal(g.sources.filter(n => n.loop).length, 1);
  sound.dispose();
});

test('the complete repeated cable circuit has audible physical phases and an announced lowering release', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  let s = state(); frame(sound, s);
  const modes = ['returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering'];
  const events = ['counterweight-return', 'counterweight-rewind', 'counterweight-hoist', 'counterweight-traverse', 'counterweight-lowering-warning', 'counterweight-lower'];
  for (let i = 0; i < modes.length; i++) {
    g.ctx.currentTime += 2;
    s = { ...s, elapsed: s.elapsed + 2, counterweight: { ...s.counterweight, mode: modes[i], y: 3 - i * .7 } };
    frame(sound, s); assert.equal(sound.event({ type: events[i] }, s), true, events[i]);
    const snap = sound.snapshot(); assert.equal(snap.mode, modes[i]); assert.ok(snap.mechanicalGain >= .007);
    assert.deepEqual(layer(sound, events[i])[0].source, { x: -18, y: 3 - i * .7, z: -3 });
    assert.ok(snap.sources <= C.maxSources); assert.equal(layer(sound, 'mechanism').length, 1);
  }
  g.ctx.currentTime += 2; frame(sound, s); assert.equal(sound.event({ type: 'counterweight-cycle' }, s), true);
  assert.equal(g.sources.filter(n => n.loop).length, 1, 'the circuit does not restart its continuous mechanism'); sound.dispose();
});

test('body footsteps come from supported body travel and cannot play during a drop or recovery', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }); let s = state();
  frame(sound, s); s = { ...s, x: s.x + 1 }; frame(sound, s);
  assert.equal(layer(sound, 'footstep').length, 1);
  g.ctx.currentTime += 1; s = { ...s, x: s.x + 1, fall: { vy: -4 } }; frame(sound, s);
  assert.equal(layer(sound, 'footstep').length, 0);
  s = { ...s, x: s.x + 1, fall: null, recovery: { elapsed: .1 } }; frame(sound, s);
  assert.equal(layer(sound, 'footstep').length, 0); sound.dispose();
});

test('handle and lip approach are one physical contact, never a repeated beacon or resume notification', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }), s = state();
  const handle = { id: 'catch-return-0', type: 'return', position: { x: -30.5, y: 4.1, z: 8.4 } };
  frame(sound, s, .1, handle); assert.equal(layer(sound, 'handle-contact').length, 0, 'entry at a handle does not replay contact');
  frame(sound, s); frame(sound, s, .1, handle); assert.equal(layer(sound, 'handle-contact').length, 1);
  for (let i = 0; i < 50; i++) { g.ctx.currentTime += .1; frame(sound, s, .1, handle); }
  assert.equal(layer(sound, 'handle-contact').length, 0, 'no repeating cue while holding position');
  frame(sound, s); frame(sound, s, .1, { id: 'catch-lip-0', type: 'drop', x: -19.55, y: 3, z: 0 });
  assert.equal(layer(sound, 'edge-contact').length, 1);
  sound.pause(); frame(sound, s, .1, handle); assert.equal(layer(sound, 'handle-contact').length, 0); sound.dispose();
});

test('the authored phase transition preserves continuous source ownership and carries a finite material creak', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  frame(sound, state({ phase: 'wrong-return', closure: { mode: 'closing', frontZ: 0 } }));
  const continuous = g.sources.slice(); sound.event({ type: 'phase', phase: 'catch' }, state()); frame(sound, state());
  assert.ok(continuous.every(n => !n.stops.length)); assert.equal(layer(sound, 'mechanism').length, 1);
  assert.equal(layer(sound, 'phase').length, 1); assert.equal(layer(sound, 'footstep').length, 0);
  g.ctx.currentTime += 2; frame(sound, state()); assert.equal(sound.snapshot().sources, 2); sound.dispose();
});

test('warning, drop, body landing, machine landing and recovery keep distinct material envelopes', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }); frame(sound, state());
  const expected = ['closure-warning', 'drop', 'land', 'counterweight-lands', 'capture', 'recovered', 'door'];
  const voices = [];
  for (const type of expected) {
    g.ctx.currentTime += 2; frame(sound, state()); assert.equal(sound.event({ type, open: true }, state()), true);
    const v = layer(sound, type)[0]; assert.ok(v, type); voices.push(v);
    assert.ok(Object.values(v.mix).every(Number.isFinite));
  }
  assert.deepEqual(voices.find(v => v.kind === 'counterweight-lands').source, { x: -18, y: 3, z: -3 });
  assert.notEqual(voices.find(v => v.kind === 'capture').gain, voices.find(v => v.kind === 'recovered').gain);
  assert.ok(g.sources.filter(n => n.kind === 'noise').length > g.sources.filter(n => n.kind === 'tone').length / 2);
  sound.dispose();
});

test('mono fallback, unavailable suppliers and disposal remain silent-safe', () => {
  const g = graph({ panner: false }), sound = createSourceContinuationAudio({ getAudio: () => g });
  assert.equal(frame(sound, state()), true); assert.equal(sound.event({ type: 'drop' }, state()), true);
  assert.equal(g.nodes.some(n => n.kind === 'pan'), false); sound.dispose();
  assert.equal(frame(sound, state()), false); assert.equal(sound.event({ type: 'land' }, state()), false);
  const absent = createSourceContinuationAudio({ getAudio() { throw Error('missing bus'); } });
  assert.doesNotThrow(() => absent.event({ type: 'land' }, state())); assert.equal(absent.snapshot().sources, 0);
});
