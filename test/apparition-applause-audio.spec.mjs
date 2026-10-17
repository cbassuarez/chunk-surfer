import assert from 'node:assert/strict';
import { createApparitionApplauseAudio } from '../src/audio/apparition-applause-audio.js';

function mockContext() {
  const nodes = [], decodes = [], listenerWrites = [];
  const param = () => ({ baseValue: 0, writes: [], events: [], get value() { return this.baseValue; }, set value(next) { this.baseValue = next; this.writes.push(next); },
    setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); },
    setTargetAtTime(...args) { this.events.push(['target', ...args]); } });
  const make = kind => {
    const node = { kind, connections: [], disconnected: false, starts: [], stops: [], gain: param(), pan: param(), delayTime: param(), playbackRate: param(),
      connect(next) { this.connections.push(next); }, disconnect() { this.disconnected = true; },
      start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } };
    nodes.push(node); return node;
  };
  return {
    currentTime: 10, state: 'running', sampleRate: 48000, nodes, decodes, destination: { kind: 'world-sfx' },
    listener: new Proxy({}, { set(_, key, value) { listenerWrites.push([key, value]); return true; } }), listenerWrites,
    createGain: () => make('gain'), createStereoPanner: () => make('pan'), createBufferSource: () => make('source'),
    createConvolver: () => make('convolver'), createDelay: () => make('delay'),
    async decodeAudioData(bytes) {
      decodes.push(bytes);
      const duration = new Uint8Array(bytes)[0] / 10;
      return { duration, sampleRate: 48000, numberOfChannels: 2 };
    },
  };
}

function setup({ context = mockContext(), failures = [], ...overrides } = {}) {
  const fetched = [], emitted = [], timers = new Map(), cleared = [];
  let sequence = 0, currentContext = context;
  const engine = createApparitionApplauseAudio({
    getAudio: () => ({ ctx: currentContext, destination: currentContext.destination }),
    emitAcoustic: event => emitted.push(event),
    fetchAsset: async url => {
      fetched.push(url);
      return { ok: !failures.includes(url), status: failures.includes(url) ? 404 : 200,
        arrayBuffer: async () => new Uint8Array([url.includes('room') ? 30 : 5]).buffer };
    },
    setTimer: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimer: id => { cleared.push(id); timers.delete(id); },
    ...overrides,
  });
  return { engine, context, fetched, emitted, timers, cleared, setContext: next => { currentContext = next; } };
}

const manifest = Object.freeze({
  sources: Object.freeze({ palmA: Object.freeze({ url: '/raw/palm-a.wav', license: 'CC0' }), palmB: '/raw/palm-b.wav' }),
  impulses: Object.freeze({ measuredRoom: Object.freeze({ url: '/raw/measured-room.wav', license: 'CC-BY-4.0' }) }),
});
const score = Object.freeze({ id: 'audience-proof', gain: .5, events: Object.freeze([
  Object.freeze({ id: 'first-hand', source: 'palmA', time: .08, position: Object.freeze({ x: 4, y: 0 }), offset: .1, duration: .2,
    gain: .6, dry: .7, wet: .2, impulse: 'measuredRoom', preDelay: .04, fadeIn: .001, fadeOut: .012 }),
  Object.freeze({ id: 'late-hand', source: 'palmB', time: 2, position: Object.freeze({ x: -3, y: 2 }), gain: .4, dry: 1, wet: 0 }),
]) });
const event = { id: 'encounter-1', at: { x: 4, y: 0 }, spatial: { floorId: 'third' }, acoustic: { levelDb: -24 } };

const run = setup();
assert.equal(run.engine.play(event, { score }), false, 'a cue never consumes an encounter before its recordings are ready');
assert.equal(run.context.nodes.length, 0);
assert.deepEqual(await run.engine.preload(manifest), { ready: true, sourceCount: 2, impulseCount: 1 });
assert.deepEqual(new Set(run.fetched), new Set(['/raw/palm-a.wav', '/raw/palm-b.wav', '/raw/measured-room.wav']));
assert.equal(run.context.decodes.length, 3);
assert.equal(run.engine.inspect().assets.impulses[0].duration, 3);
assert.equal(run.engine.inspect().assets.sources[0].license, 'CC0');

assert.equal(run.engine.play(event, { score, listener: { x: 0, y: 0, yaw: 0 } }), true);
assert.equal(run.engine.inspect().activeVoices, 2);
const recordedSources = run.context.nodes.filter(node => node.kind === 'source');
assert.deepEqual(recordedSources[0].starts, [[10.092, .1, .2]], 'the original buffer region starts on the authored audio clock');
assert.deepEqual(recordedSources[1].starts, [[12.012, 0, .5]], 'a future clap is scheduled without a wall-clock playback callback');
assert.equal(recordedSources[1].connections[0].gain.writes[0], .4, 'a future source has its authored base gain before the first automation sample');
const convolution = run.context.nodes.find(node => node.kind === 'convolver');
assert.equal(convolution.normalize, false, 'the measured IR retains its authored gain instead of browser normalization');
assert.equal(convolution.buffer.duration, 3);
assert.equal(run.context.nodes.find(node => node.kind === 'delay').delayTime.value, .04);
assert.equal(run.context.listenerWrites.length, 0, 'spatial updates cannot rotate other world-audio emitters');
assert.equal(run.emitted.length, 1, 'the whole composition has one acoustic envelope');
assert.deepEqual(run.emitted[0].semantics, { playerGenerated: false, deliberate: false, audibleToHush: false, audibleToMonitor: false,
  audibleInWorld: true, canBeMimicked: false, canSpoilTake: false, family: 'apparition', tags: ['apparition-applause', 'treatment'] });
assert.equal(run.emitted[0].spatial.floorId, 'third');
assert.ok(run.emitted[0].acoustic.durationMs >= 3332 && run.emitted[0].acoustic.durationMs <= 3333, 'the semantic envelope includes predelay and the complete measured tail');
assert.equal(run.engine.inspect().voices[0].pan, 1);
run.engine.updateListener({ yaw: Math.PI });
assert.ok(Math.abs(run.engine.inspect().voices[0].pan + 1) < 1e-9, 'turning reverses pan around a fixed world source');
assert.deepEqual(run.engine.inspect().voices[0].position, { x: 4, y: 0, yaw: 0 }, 'a source never relocates behind the listener');
const nearAttenuation = run.engine.inspect().voices[0].attenuation;
run.engine.updateListener({ x: -20 });
assert.ok(run.engine.inspect().voices[0].attenuation < nearAttenuation, 'walking away attenuates the contact and updates the existing graph');
assert.equal(run.engine.play(event, { score }), false, 'a repeated receipt cannot double the jump or its measured peak');
assert.equal(run.context.nodes.filter(node => node.kind === 'source').length, 2);
assert.equal(score.events[0].time, .08, 'authoring data remains immutable');
assert.equal(run.engine.cancel('pause'), 2);
assert.equal(run.engine.inspect().activeVoices, 0);
assert.equal(run.engine.inspect().lastCancelReason, 'pause');
assert.ok(run.context.nodes.every(node => node.disconnected), 'pause disconnects direct paths, room responses and every intermediate node');
assert.ok(recordedSources.every(node => node.stops.length === 2), 'pause stops both the current hand and the scheduled late hand');
assert.equal(run.timers.size, 0);

const silent = setup(); await silent.engine.preload(manifest);
assert.equal(silent.engine.play({ id: 'silence' }, { condition: 'silent', score }), true);
assert.equal(silent.context.nodes.length, 0, 'the silent control is actual silence, without a muted graph or convolution tail');
assert.equal(silent.emitted.length, 0, 'the silent control cannot register world noise');
assert.equal(silent.engine.inspect().history[0].condition, 'silent');
assert.equal(silent.engine.inspect().history[0].voiceCount, 0);

const ordinary = setup(); await ordinary.engine.preload(manifest);
assert.equal(ordinary.engine.play({ id: 'ordinary' }, { condition: 'ordinary', score }), true);
assert.deepEqual(ordinary.engine.inspect().history[0].events.map(item => item.source), ['palmA', 'palmB'], 'comparison conditions use the supplied human recordings');
assert.equal(ordinary.emitted[0].provenance.condition, 'ordinary');
const timer = [...ordinary.timers.values()][0];
assert.ok(timer.delay > 3300, 'a dry source ending does not truncate its longer room decay');
timer.callback();
assert.equal(ordinary.engine.inspect().activeVoices, 1, 'an exhausted tail frees only its own source graph');
for (const pending of [...ordinary.timers.values()]) pending.callback();
assert.equal(ordinary.engine.inspect().activePerformances, 0);
assert.ok(ordinary.context.nodes.every(node => node.disconnected), 'natural completion releases the shared cue bus too');

const suspended = setup(); suspended.context.state = 'suspended';
assert.equal((await suspended.engine.preload(manifest)).ready, true, 'recordings can be decoded while awaiting an existing user gesture');
assert.equal(suspended.engine.play(event, { score }), false);
assert.equal(suspended.engine.play(event, { score, offlineRendering: true }), false, 'the offline opt-in cannot schedule against a suspended real-time context');
assert.equal(suspended.context.nodes.length, 0, 'optional world audio never resumes a suspended context');
suspended.context.state = 'running'; suspended.engine.play(event, { score });
suspended.context.state = 'suspended'; suspended.engine.updateListener({ x: 1 });
assert.equal(suspended.engine.inspect().activeVoices, 0, 'a suspended context cannot leave a future clap armed for resume');

const changed = setup(); await changed.engine.preload(manifest); changed.engine.play(event, { score });
const nextContext = mockContext(); changed.setContext(nextContext);
changed.engine.play({ id: 'new-context' }, { score });
assert.ok(changed.context.nodes.every(node => node.disconnected), 'context recovery tears down the previous context graph');
assert.equal(changed.engine.inspect().activeVoices, 2);
changed.engine.dispose();
assert.ok(nextContext.nodes.every(node => node.disconnected));
assert.equal(changed.engine.inspect().disposed, true);
assert.equal(changed.engine.play({ id: 'after-dispose' }, { score }), false);
assert.equal((await changed.engine.preload(manifest)).error, 'disposed');

const missing = setup({ failures: ['/raw/measured-room.wav'] });
const missingResult = await missing.engine.preload(manifest);
assert.equal(missingResult.ready, false);
assert.equal(missingResult.failedAssets[0].id, 'measuredRoom');
assert.equal(missing.engine.play(event, { score }), false, 'a failed room response cannot silently become a different audible treatment');
assert.equal(missing.context.nodes.length, 0);
assert.equal((await setup().engine.preload({ impulses: manifest.impulses })).error, 'no-sources');
const absent = createApparitionApplauseAudio();
assert.equal((await absent.preload(manifest)).error, 'audio-unavailable');

const invalid = setup(); await invalid.engine.preload(manifest);
assert.equal(invalid.engine.play(event, { score: { events: [{ source: 'missing', time: 0 }] } }), false);
assert.equal(invalid.context.nodes.length, 0, 'invalid scores are rejected atomically before building audible nodes');
assert.equal(invalid.engine.play(event, { score: { events: [{ source: 'palmA', time: 0, wet: .5, impulse: 'missing' }] } }), false);
assert.equal(invalid.engine.play(event, { score, condition: 'invented-condition' }), false);
assert.equal(invalid.context.nodes.length, 0);
assert.equal(invalid.engine.play(event, { score }), true, 'a failed attempt does not consume its receipt');
invalid.engine.dispose();

const noPannerContext = mockContext(); delete noPannerContext.createStereoPanner;
const mono = setup({ context: noPannerContext }); await mono.engine.preload(manifest);
assert.equal(mono.engine.play(event, { score }), true, 'older output implementations retain the real recording and measured room response');
mono.engine.dispose();
const noConvolverContext = mockContext(); delete noConvolverContext.createConvolver;
const noConvolver = setup({ context: noConvolverContext }); await noConvolver.engine.preload(manifest);
assert.equal(noConvolver.engine.play(event, { score }), false, 'missing convolution support never substitutes a synthetic room');
assert.ok(noConvolver.context.nodes.every(node => node.disconnected));
assert.equal(noConvolver.engine.inspect().activeVoices, 0);

const offlineContext = mockContext(); offlineContext.state = 'suspended'; offlineContext.startRendering = () => {};
const offline = setup({ context: offlineContext }); await offline.engine.preload(manifest);
assert.equal(offline.engine.play(event, { score }), false);
assert.equal(offline.engine.play(event, { score, offlineRendering: true, leadTime: 0 }), true, 'an explicit OfflineAudioContext render can receive the actual graph before startRendering');
assert.equal(offlineContext.state, 'suspended', 'the audio engine never starts or resumes offline rendering itself');
offline.engine.dispose();

console.log('apparition applause audio tests ok');
