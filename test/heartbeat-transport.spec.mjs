import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HeartbeatCore } from '../src/audio/heartbeat-worklet.js';
import { createHeartbeatPlayer } from '../src/audio/heartbeat.js';
import { HEARTBEAT_AUDIO_ASSETS } from '../src/data/heartbeat-audio-assets.js';
import { quantizeStandingTearPCM } from '../src/audio/standing-tear-dsp.js';

const rate = 48000;
function pcmPair({ seconds = .49, frequency = 173, strength = 1 } = {}) {
  return Float32Array.from({ length: Math.round(seconds * rate) }, (_, n) => {
    const t = n / rate;
    return strength * Math.sin(2 * Math.PI * frequency * t) *
      (.35 * Math.exp(-(((t - .05) / .016) ** 2)) + .24 * Math.exp(-(((t - .27) / .019) ** 2)));
  });
}
function bank() {
  return ['slow', 'fast'].flatMap(family => [0, 1, 2].map(index => ({
    id: family + index, family, sampleRate: rate, firstPeakSeconds: .05, secondPeakSeconds: .27,
    pcm: pcmPair({ seconds: family === 'slow' ? .55 : .49, strength: .8 + index * .1 }),
  })));
}
function run(core, seconds, { block = 128, collect = false, from = core.frame } = {}) {
  const length = Math.round(seconds * rate), result = collect ? new Float32Array(length) : null;
  for (let n = 0; n < length; n += block) {
    const out = new Float32Array(Math.min(block, length - n)); core.render(out, from + n);
    if (result) result.set(out, n);
  }
  return result;
}

test('audio-clock paired performances run for two minutes without drawing callbacks, phrase gaps or pitch changes', () => {
  const events = [], core = new HeartbeatCore(rate, event => events.push(event));
  core.configure(bank()); core.command({ type: 'pressure', level: .8 }); core.command({ type: 'start' });
  run(core, 120);
  const cycles = events.filter(e => e.type === 'cycle');
  assert.ok(cycles.length > 180, `${cycles.length} cycles`);
  for (let n = 1; n < cycles.length; n++) {
    const previous = cycles[n - 1], current = cycles[n];
    assert.equal(current.playbackRate, 1);
    assert.ok(Math.abs(current.time - previous.time - previous.interval) < 1 / rate);
    assert.ok(current.time - previous.time >= previous.durationSeconds + .025 - 1 / rate);
    assert.ok(current.firstPeakAt - previous.firstPeakAt > .5);
    if (current.family === previous.family) assert.notEqual(current.id, previous.id);
  }
  assert.ok(cycles.some(e => e.family === 'slow') && cycles.some(e => e.family === 'fast'));
  assert.equal(core.snapshot().resyncs, 0); assert.ok(core.snapshot().voices <= 1);
  assert.ok(core.snapshot().bytes < 2 * 1024 * 1024);
});

test('pressure changes preserve each complete pair and return to the slow family without doubled voices', () => {
  const events = [], core = new HeartbeatCore(rate, event => events.push(event)); core.configure(bank());
  core.command({ type: 'pressure', level: .22 }); core.command({ type: 'start' }); run(core, 8);
  core.command({ type: 'pressure', level: 1 }); run(core, 8);
  core.command({ type: 'pressure', level: .15 }); run(core, 8);
  const cycles = events.filter(e => e.type === 'cycle');
  assert.ok(cycles.filter(e => e.time < 8).every(e => e.family === 'slow'));
  assert.ok(cycles.some(e => e.time > 10 && e.time < 16 && e.family === 'fast'));
  assert.ok(cycles.filter(e => e.time > 19).every(e => e.family === 'slow'));
  assert.ok(cycles.every(e => e.voices === 1 && e.playbackRate === 1));
  assert.ok(cycles.every(e => e.secondPeakAt > e.firstPeakAt && e.secondPeakAt < e.time + e.durationSeconds));
});

test('pause discards a partial pair and resumes from a new slot, never a queue of elapsed beats', () => {
  const events = [], core = new HeartbeatCore(rate, event => events.push(event)); core.configure(bank());
  core.command({ type: 'pressure', level: .9 }); core.command({ type: 'start' }); run(core, 3);
  core.command({ type: 'pause', paused: true });
  const before = core.serial, silent = run(core, 4, { collect: true });
  assert.equal(core.serial, before); assert.ok(silent.every(v => v === 0));
  core.command({ type: 'pause', paused: false }); run(core, 1);
  const resumed = events.filter(e => e.type === 'cycle' && e.time >= 7);
  assert.ok(resumed.length >= 1 && resumed.length <= 2);
  assert.ok(resumed[0].time >= 7.025 - 1 / rate); assert.equal(core.snapshot().resyncs, 0);
});

test('withdrawal creates no new cycles and a displaced clock skips debt instead of catching up', () => {
  const events = [], core = new HeartbeatCore(rate, event => events.push(event)); core.configure(bank());
  core.command({ type: 'pressure', level: .9 }); core.command({ type: 'start' }); run(core, 3);
  core.command({ type: 'pressure', level: 0 });
  const before = core.serial; run(core, 2);
  assert.equal(core.serial, before); assert.ok(run(core, 1, { collect: true }).every(v => v === 0));
  core.command({ type: 'pressure', level: .9 }); run(core, .1, { from: 30 * rate });
  const resumed = events.filter(e => e.type === 'cycle' && e.time >= 30);
  assert.equal(resumed.length, 1); assert.ok(resumed[0].time >= 30.025 - 1 / rate);
  assert.equal(core.snapshot().resyncs, 1);
});

test('stop and dispose mute and release the bank, including stopped processors that still receive a quantum', () => {
  const core = new HeartbeatCore(rate); core.configure(bank()); core.command({ type: 'pressure', level: 1 });
  core.command({ type: 'start' }); run(core, 1); core.command({ type: 'stop', fadeSeconds: .05 }); run(core, .06);
  assert.ok(run(core, .5, { collect: true }).every(v => v === 0));
  core.command({ type: 'dispose' }); assert.equal(core.snapshot().bytes, 0); assert.equal(core.snapshot().clips, 0);
  assert.ok(run(core, .1, { collect: true }).every(v => v === 0));
});

function readPCM24(file) {
  const bytes = fs.readFileSync(file); let at = 12, data, sampleRate;
  while (at + 8 <= bytes.length) {
    const id = bytes.toString('ascii', at, at + 4), length = bytes.readUInt32LE(at + 4);
    if (id === 'fmt ') { assert.equal(bytes.readUInt16LE(at + 10), 1); sampleRate = bytes.readUInt32LE(at + 12); assert.equal(bytes.readUInt16LE(at + 22), 24); }
    if (id === 'data') data = bytes.subarray(at + 8, at + 8 + length);
    at += 8 + length + (length % 2);
  }
  const pcm = Float32Array.from({ length: data.length / 3 }, (_, n) => data.readIntLE(n * 3, 3) / 8388608);
  return { pcm, sampleRate };
}

test('the production CC0 bank remains complete and uses the existing quantizer before fixed-rate playback', () => {
  const clips = HEARTBEAT_AUDIO_ASSETS.clips.map(clip => {
    const original = readPCM24(new URL('../public/' + clip.url, import.meta.url));
    const crushed = quantizeStandingTearPCM(original.pcm, { ...HEARTBEAT_AUDIO_ASSETS.dsp, sampleRate: original.sampleRate });
    assert.equal(crushed.diagnostics.bitDepth, 10); assert.equal(crushed.diagnostics.effectiveSampleRate, 28000);
    assert.equal(crushed.diagnostics.invalidSamples, 0); assert.equal(crushed.diagnostics.clippedSamples, 0);
    assert.ok(crushed.diagnostics.observedAmplitudeLevels <= 1024);
    assert.ok(crushed.samples.some((value, n) => value !== original.pcm[n]), 'actual PCM amplitudes are crushed');
    assert.ok(clip.secondPeakSeconds + .15 < clip.durationSeconds, 'complete second contact and decay are retained');
    return { ...clip, sampleRate: original.sampleRate, pcm: crushed.samples };
  });
  const events = [], core = new HeartbeatCore(rate, event => events.push(event)); core.configure(clips);
  core.command({ type: 'pressure', level: 1 }); core.command({ type: 'start' }); const output = run(core, 20, { collect: true });
  assert.ok(output.some(v => Math.abs(v) > .1)); assert.ok(output.every(v => Number.isFinite(v) && Math.abs(v) < 1));
  const cycles = events.filter(e => e.type === 'cycle');
  for (let n = 1; n < cycles.length; n++) assert.ok(cycles[n].firstPeakAt - cycles[n - 1].firstPeakAt > .5);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function wrapperHarness({ unavailable = false, delay = null, failed = false } = {}) {
  let time = 1000; const requests = [], nodes = [], commands = [];
  const fakeBuffer = (channels, length, sampleRate) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: index => data[index] };
  };
  const createContext = id => ({ id, currentTime: 0, state: 'running', sampleRate: rate, baseLatency: .01,
    ...(unavailable ? {} : { audioWorklet: { addModule: async () => {} } }),
    createBuffer: fakeBuffer,
    decodeAudioData: async () => {
      if (delay) await delay.promise;
      const buffer = fakeBuffer(1, Math.round(.55 * rate), rate); buffer.getChannelData(0).set(pcmPair({ seconds: .55 })); return buffer;
    },
    createBiquadFilter: () => ({ frequency: { setValueAtTime() {} }, connect() {}, disconnect() {} }),
    createGain: () => ({ gain: { setValueAtTime() {} }, connect() {}, disconnect() {} }),
  });
  const nodeFactory = ctx => {
    const node = { disconnected: false, connect() {}, disconnect() { this.disconnected = true; }, port: { onmessage: null,
      postMessage(data) { commands.push(data); if (data.type === 'configure') core.configure(data.clips); else core.command(data); } } };
    const core = new HeartbeatCore(rate, data => node.port.onmessage?.({ data })); node.core = core; nodes.push(node); return node;
  };
  const manifest = { clips: bank().slice(0, 1).concat(bank().slice(3, 4)).map(({ pcm, ...row }) => ({ ...row, url: row.id + '.wav' })), dsp: { bitDepth: 10, effectiveSampleRate: 28000 } };
  const engine = createHeartbeatPlayer({ manifest, nodeFactory, wallNow: () => time, urlFor: x => x,
    fetcher: async url => { requests.push(url); if (failed) return { ok: false, status: 503 }; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; } });
  const context = createContext('first'); engine.init(context, { id: 'body' });
  return { engine, context, createContext, requests, nodes, commands, advance: seconds => { time += seconds * 1000; context.currentTime += seconds; } };
}

test('cold stop cannot be resurrected by decoding, and concurrent preparation deduplicates bank loads', async () => {
  const wait = deferred(), h = wrapperHarness({ delay: wait });
  h.engine.start(); const pending = h.engine.prepare(); h.engine.prepare(); h.engine.stop({ fade: 0 });
  wait.resolve(); await pending; await flush();
  assert.equal(h.requests.length, 2); assert.equal(h.engine.snapshot().ready, true);
  assert.equal(h.engine.snapshot().wanted, false); assert.equal(h.nodes[0].core.running, false);
  assert.equal(h.engine.frame().active, false); assert.equal(h.engine.snapshot().bitcrushing.clips[0].bitDepth, 10);
  h.engine.dispose();
});

test('context replacement releases the old processor and pending work cannot acquire the replacement owner', async () => {
  const h = wrapperHarness(); h.engine.start(); await h.engine.prepare(); const first = h.nodes[0];
  h.engine.init(h.createContext('second'), { id: 'body-2' });
  assert.equal(first.disconnected, true); assert.equal(first.core.configured, false);
  h.engine.start(); h.engine.setPressure(.7); await h.engine.prepare();
  assert.equal(h.nodes.length, 2); assert.equal(h.nodes[1].core.running, true); assert.equal(h.engine.frame().active, true);
  h.engine.dispose();
});

test('failed loading and processor errors release resources and wait for bounded caller-driven retry', async () => {
  const h = wrapperHarness({ failed: true }); h.engine.start(); await h.engine.prepare();
  const count = h.requests.length;
  for (let n = 0; n < 20; n++) h.engine.start(); await flush(); assert.equal(h.requests.length, count);
  h.advance(1.1); h.engine.start(); await h.engine.prepare(); assert.ok(h.requests.length > count); h.engine.dispose();
  const live = wrapperHarness(); live.engine.start(); await live.engine.prepare(); const old = live.nodes[0];
  old.onprocessorerror(); assert.equal(old.disconnected, true); assert.equal(live.engine.snapshot().ready, false);
  assert.match(live.engine.snapshot().errors.at(-1).message, /processor failed/);
  const before = live.requests.length; live.engine.start(); await flush(); assert.equal(live.requests.length, before);
  live.advance(1.1); live.engine.start(); await live.engine.prepare(); assert.equal(live.nodes.length, 2); live.engine.dispose();
});

test('zero pressure is deduplicated and heard-time visual frame is silent when paused, withdrawn or unavailable', async () => {
  const h = wrapperHarness(); h.engine.start(); await h.engine.prepare(); h.engine.setPressure(.8);
  h.context.currentTime = 2; run(h.nodes[0].core, 2);
  const frame = h.engine.frame(); assert.equal(frame.available, true); assert.equal(frame.active, true);
  assert.equal(frame.clockMode, 'reported-latency'); assert.ok(frame.pulse >= 0 && frame.pulse <= 1);
  h.engine.setPressure(0); const count = h.commands.length; for (let n = 0; n < 50; n++) h.engine.setPressure(0);
  assert.equal(h.commands.length, count); assert.equal(h.engine.frame().active, false); assert.equal(h.engine.frame().pulse, 0);
  h.engine.setPressure(.8); h.engine.setPaused(true); assert.equal(h.engine.frame().active, false); assert.equal(h.engine.frame().pulse, 0);
  h.engine.setPaused(false); h.context.getOutputTimestamp = () => ({ contextTime: 1.95, performanceTime: 1000 });
  assert.equal(h.engine.frame().audioTime, 1.95); assert.equal(h.engine.frame().clockMode, 'output-timestamp'); h.engine.dispose();
  const unsupported = wrapperHarness({ unavailable: true }); unsupported.engine.start(); await unsupported.engine.prepare();
  assert.equal(unsupported.engine.frame().available, false); assert.match(unsupported.engine.snapshot().errors[0].message, /unavailable/);
  assert.equal(unsupported.requests.length, 0); unsupported.engine.dispose();
});

test('the visual envelope follows both actual processed contacts and stays zero in the owned quiet interval', async () => {
  const h = wrapperHarness(); h.engine.start(); h.engine.setPressure(.8); await h.engine.prepare();
  run(h.nodes[0].core, 3); const cycle = h.engine.snapshot().events.filter(e => e.type === 'cycle').at(-2);
  for (const time of [cycle.firstPeakAt, cycle.secondPeakAt]) {
    h.context.currentTime = time + .01;
    const frame = h.engine.frame();
    assert.equal(frame.clipId, cycle.id); assert.ok(frame.pulse > .3, `${time}: ${frame.pulse}`);
    assert.ok(Math.abs(frame.audioTime - time) < 1e-9);
    assert.ok(Math.abs(frame.phase - (time - cycle.time) / cycle.interval) < 1e-9);
  }
  h.context.currentTime = cycle.time + cycle.durationSeconds + .025;
  assert.equal(h.engine.frame().pulse, 0); h.engine.dispose();
});

test('context replacement during a slow decode cannot install the abandoned bank or node', async () => {
  const wait = deferred(), h = wrapperHarness({ delay: wait });
  h.engine.start(); const abandoned = h.engine.prepare(); await flush();
  h.engine.init(h.createContext('replacement'), { id: 'replacement-body' });
  h.engine.start(); const replacement = h.engine.prepare(); wait.resolve();
  assert.equal(await abandoned, false); assert.equal(await replacement, true);
  assert.equal(h.nodes.length, 1); assert.equal(h.engine.snapshot().generation, 2);
  assert.equal(h.engine.snapshot().ready, true); h.engine.dispose();
});
