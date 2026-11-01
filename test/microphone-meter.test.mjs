// node --experimental-vm-modules --test test/microphone-meter.test.mjs
// Production DSP and microphone lifecycle, with only browser nodes/ports mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const processorCode = await readFile(path.join(root, 'audio/mic-meter-worklet.js'), 'utf8');
if (typeof vm.SourceTextModule !== 'function') {
  throw new Error('Use node --experimental-vm-modules --test test/microphone-meter.test.mjs');
}
const close = (actual, expected, epsilon = 1e-8) => assert(Math.abs(actual - expected) <= epsilon,
  `${actual} is not within ${epsilon} of ${expected}`);
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function processorFixture(sampleRate) {
  const messages = [];
  let Processor;
  const context = vm.createContext({
    sampleRate, currentFrame: 0,
    AudioWorkletProcessor: class {
      constructor() { this.port = { onmessage: null, postMessage: message => messages.push(message) }; }
    },
    registerProcessor(name, implementation) {
      assert.equal(name, 'chunk-surfer-mic-meter');
      Processor = implementation;
    },
  });
  vm.runInContext(processorCode, context);
  const processor = new Processor();
  let cursor = 0;
  return {
    processor, messages,
    run(samples, quantum = 128) {
      for (let at = 0; at < samples.length; at += quantum) {
        const block = samples.subarray(at, Math.min(samples.length, at + quantum));
        context.currentFrame = cursor;
        assert.equal(processor.process([[block]], []), true);
        cursor += block.length;
      }
    },
  };
}

for (const sampleRate of [44100, 48000]) {
  test(`worklet integrates the full 100 ms at ${sampleRate} Hz and reports 60 times per second`, () => {
    const fixture = processorFixture(sampleRate);
    fixture.run(new Float32Array(sampleRate).fill(0.25), sampleRate === 44100 ? 192 : 128);
    assert.equal(fixture.messages.length, 60);
    for (const message of fixture.messages) {
      assert.equal(message.windowSamples, Math.round(sampleRate * .1));
      assert.equal(message.samples, Math.round(sampleRate / 60));
      close(message.audioTime, message.frame / sampleRate);
      close(message.peak, .25);
      assert.equal(message.clipped, false);
    }
    close(fixture.messages[0].rms, .25 * Math.sqrt(Math.round(sampleRate / 60) / Math.round(sampleRate * .1)));
    close(fixture.messages.at(-1).rms, .25);
    close(fixture.messages.at(-1).audioTime, 1);
  });

  test(`worklet retains a single-sample peak between UI frames at ${sampleRate} Hz`, () => {
    const fixture = processorFixture(sampleRate);
    const samples = new Float32Array(Math.round(sampleRate * .3));
    samples[237] = -.99;
    fixture.run(samples);
    assert.equal(fixture.messages.filter(message => message.clipped).length, 1);
    close(fixture.messages[0].peak, Math.abs(samples[237]));
    close(fixture.messages[0].rms, Math.abs(samples[237]) / Math.sqrt(Math.round(sampleRate * .1)));
    close(fixture.messages.at(-1).rms, 0);
    close(fixture.messages.at(-1).peak, 0);
  });
}

test('processor stop releases its lifetime and never writes an output', () => {
  const fixture = processorFixture(48000);
  fixture.run(new Float32Array(800).fill(.5));
  assert.equal(fixture.messages.length, 1);
  fixture.processor.port.onmessage({ data: { type: 'stop' } });
  assert.equal(fixture.processor.process([[new Float32Array(128).fill(1)]], []), false);
  assert.equal(fixture.messages.length, 1);
});

async function microphoneFixture({ sampleRate = 48000, worklet = 'ready', request = null, channels = 2 } = {}) {
  const clock = { now: 1000, audio: 1 };
  const nodes = [], worklets = [], streams = [], urls = [];
  const contextEvents = new Map(), mediaEvents = new Map();
  const pendingModule = deferred();
  let listedDevices = [{ kind: 'audioinput', deviceId: 'chosen', label: 'Test input' }];
  const makeNode = (kind) => {
    const node = {
      kind, links: [], disconnects: 0,
      connect(destination, output = 0, input = 0) {
        assert.notEqual(destination, audioContext.destination, 'microphone must never connect to speakers');
        this.links.push({ destination, output, input });
        return destination;
      },
      disconnect(destination) {
        this.disconnects += 1;
        this.links = destination ? this.links.filter(link => link.destination !== destination) : [];
      },
    };
    nodes.push(node);
    return node;
  };
  const makeStream = () => {
    const events = new Map();
    const track = {
      stopped: 0,
      stop() { this.stopped += 1; },
      getSettings: () => ({ deviceId: 'chosen', channelCount: channels,
        echoCancellation: true, noiseSuppression: false, autoGainControl: false }),
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name); },
      end: () => events.get('ended')?.(),
    };
    const stream = { track, getAudioTracks: () => [track], getTracks: () => [track] };
    streams.push(stream);
    return stream;
  };
  const audioContext = {
    sampleRate, state: 'running', destination: { kind: 'speakers' },
    get currentTime() { return clock.audio; },
    addEventListener: (name, fn) => contextEvents.set(name, fn),
    removeEventListener: (name, fn) => { if (contextEvents.get(name) === fn) contextEvents.delete(name); },
    createGain() { throw new Error('No gain/destination branch is permitted for the microphone meter'); },
    createMediaStreamSource: () => makeNode('source'),
    createChannelSplitter: () => makeNode('splitter'),
    createAnalyser() {
      const node = makeNode('analyser');
      node.fftSize = 2048;
      node.frequencyBinCount = 512;
      node.reads = 0;
      node.level = .25;
      node.getFloatTimeDomainData = target => { node.reads += 1; target.fill(node.level); };
      node.getFloatFrequencyData = target => target.fill(-96);
      return node;
    },
    audioWorklet: worklet === 'unsupported' ? undefined : {
      addModule(url) {
        urls.push(String(url));
        if (worklet === 'pending') return pendingModule.promise;
        if (worklet === 'reject') return Promise.reject(new Error('module unavailable'));
        return Promise.resolve();
      },
    },
  };
  class FakeAudioWorkletNode {
    constructor(context, name, options) {
      assert.equal(context, audioContext);
      assert.equal(name, 'chunk-surfer-mic-meter');
      Object.assign(this, makeNode('worklet'), { options, onprocessorerror: null });
      this.port = {
        onmessage: null, closed: false, messages: [], starts: 0,
        postMessage(message) { this.messages.push(message); },
        start() { this.starts += 1; },
        close() { this.closed = true; },
      };
      worklets.push(this);
    }
  }
  const mediaDevices = {
    getUserMedia: () => request ? request.promise : Promise.resolve(makeStream()),
    enumerateDevices: () => Promise.resolve(listedDevices),
    addEventListener: (name, fn) => mediaEvents.set(name, fn),
  };
  const context = vm.createContext({
    console, URL, performance: { now: () => clock.now }, navigator: { mediaDevices },
    ...(worklet !== 'unsupported' ? { AudioWorkletNode: FakeAudioWorkletNode } : {}),
  });
  const modules = new Map();
  async function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), {
      context, identifier: filename,
      initializeImportMeta(meta) { meta.url = pathToFileURL(filename).href; },
    });
    modules.set(filename, module);
    await module.link((specifier, owner) => load(path.resolve(path.dirname(owner.identifier), specifier)));
    return module;
  }
  const module = await load(path.join(root, 'game/mic.js'));
  await module.evaluate();
  return {
    mic: module.namespace, clock, audioContext, nodes, worklets, streams, urls, pendingModule, makeStream,
    async start(options = {}) { await module.namespace.micInit(audioContext, options); await flush(); },
    message(message, index = worklets.length - 1) {
      worklets[index].port.onmessage?.({ data: { type: 'mic-meter', ...message } });
    },
    changeDevices(devices) { listedDevices = devices; mediaEvents.get('devicechange')?.(); },
    changeContextState(state) { audioContext.state = state; contextEvents.get('statechange')?.(); },
    contextEvents,
  };
}

for (const channelMode of ['mono', 'left', 'right']) {
  test(`${channelMode} display path uses the gameplay input and no audible output`, async () => {
    const fixture = await microphoneFixture();
    await fixture.start({ channelMode });
    const { mic, nodes, worklets } = fixture;
    assert.equal(mic.micState(), 'on');
    assert.equal(worklets.length, 1);
    const node = worklets[0];
    assert.equal(node.options.numberOfInputs, 1);
    assert.equal(node.options.numberOfOutputs, 0);
    assert.equal(node.options.channelCount, 1);
    assert.equal(node.options.channelCountMode, 'explicit');
    assert.equal(node.options.channelInterpretation, 'speakers');
    const owner = nodes.find(candidate => candidate.kind === (channelMode === 'mono' ? 'source' : 'splitter'));
    const wantedChannel = channelMode === 'right' ? 1 : 0;
    assert.equal(owner.links.find(link => link.destination === node).output, wantedChannel);
    const analysers = nodes.filter(candidate => candidate.kind === 'analyser');
    assert.equal(analysers[0].fftSize, 1024, 'gameplay integration remains unchanged');
    assert.equal(analysers[1].fftSize, 8192, 'display fallback contains a full 100 ms');
    assert.equal(owner.links.find(link => link.destination === analysers[0]).output, wantedChannel);
    assert.equal(owner.links.find(link => link.destination === analysers[1]).output, wantedChannel);
    close(mic.micMeasurement().rms, .25);
    assert.equal(node.links.length, 0);
    assert.match(fixture.urls[0], /mic-meter-worklet\.js\?no-inline$/);
  });
}

for (const worklet of ['unsupported', 'reject']) {
  test(`${worklet} worklet falls back once per audio quantum without changing raw gameplay`, async () => {
    const fixture = await microphoneFixture({ worklet });
    await fixture.start();
    const analysers = fixture.nodes.filter(node => node.kind === 'analyser');
    const rawReads = analysers[0].reads;
    const first = fixture.mic.micMeterMeasurement(fixture.clock.now);
    close(first.rms, .25);
    assert.equal(first.meterSource, 'analyser');
    assert.equal(first.available, true);
    assert.equal(first.dualTrace.peakKind, 'sample');
    fixture.mic.micMeterMeasurement(fixture.clock.now + 1);
    assert.equal(analysers[1].reads, 1, 'two views must not re-sample the same audio quantum');
    assert.equal(analysers[0].reads, rawReads, 'display does not poll or enlarge the gameplay analyser');
    fixture.clock.audio += 128 / 48000;
    fixture.clock.now += 3;
    fixture.mic.micMeterMeasurement(fixture.clock.now);
    assert.equal(analysers[1].reads, 2);
    close(fixture.mic.micEffectiveMeasurement().raw.rms, .25);
  });
}

test('fallback sizes its independent analyser for 192 kHz', async () => {
  const fixture = await microphoneFixture({ worklet: 'unsupported', sampleRate: 192000 });
  await fixture.start();
  const analysers = fixture.nodes.filter(node => node.kind === 'analyser');
  assert.equal(analysers[0].fftSize, 1024);
  assert.equal(analysers[1].fftSize, 32768);
  close(fixture.mic.micMeterMeasurement().rms, .25);
});

test('queued worklet packets preserve transient history and their original audio times', async () => {
  const fixture = await microphoneFixture();
  await fixture.start();
  fixture.clock.now = 1200;
  fixture.clock.audio = 1.2;
  // Render has already asked for a newer time. Reading must not mutate the
  // history against which the older, queued audio-thread packets are applied.
  fixture.mic.micMeterMeasurement(1200);
  fixture.message({ audioTime: 1.02, rms: .03, peak: .99, clipped: true });
  fixture.message({ audioTime: 1.04, rms: .02, peak: 0, clipped: false });
  fixture.message({ audioTime: 1.2, rms: 0, peak: 0, clipped: false });
  const reading = fixture.mic.micMeterMeasurement(1200);
  assert.equal(reading.meterSource, 'worklet');
  close(reading.timestamp, 1200);
  close(reading.dualTrace.peakDb, 20 * Math.log10(.99));
  assert.equal(reading.dualTrace.clipped, true);
  assert.equal(reading.peak, 0, 'latest raw interval has no peak; held trace retains the earlier one');
  fixture.clock.now = 1600;
  fixture.clock.audio = 1.6;
  assert.equal(fixture.mic.micMeterMeasurement(1600).available, false, 'missing packets become unavailable');
  fixture.clock.now = 2400;
  fixture.clock.audio = 2.4;
  fixture.message({ audioTime: 2.4, rms: 0, peak: 0, clipped: false });
  const released = fixture.mic.micMeterMeasurement(2400);
  assert(released.dualTrace.peakDb < reading.dualTrace.peakDb - 4);
  assert.equal(released.dualTrace.clipped, true);
  fixture.clock.now = 3050;
  fixture.clock.audio = 3.05;
  fixture.message({ audioTime: 3.05, rms: 0, peak: 0, clipped: false });
  assert.equal(fixture.mic.micMeterMeasurement(3050).dualTrace.clipped, false);
});

test('processor failure keeps microphone capture alive and restores the analyser path', async () => {
  const fixture = await microphoneFixture();
  await fixture.start();
  const node = fixture.worklets[0];
  node.onprocessorerror();
  const reading = fixture.mic.micMeterMeasurement();
  assert.equal(fixture.mic.micState(), 'on');
  assert.equal(reading.meterSource, 'analyser');
  assert.equal(reading.available, true);
  assert.equal(node.port.closed, true);
  assert.equal(node.port.messages[0].type, 'stop');
  close(reading.rms, .25);
});

test('a processor that sends no packets falls back without touching the stream', async () => {
  const fixture = await microphoneFixture();
  await fixture.start();
  fixture.clock.now = 1300;
  fixture.clock.audio = 1.3;
  const reading = fixture.mic.micMeterMeasurement();
  assert.equal(reading.meterSource, 'analyser');
  assert.equal(reading.available, true);
  assert.equal(fixture.streams[0].track.stopped, 0);
  assert.equal(fixture.worklets[0].port.closed, true);
});

test('stop disconnects all branches and ignores late processor messages', async () => {
  const fixture = await microphoneFixture();
  await fixture.start({ channelMode: 'right' });
  const node = fixture.worklets[0], lateMessage = node.port.onmessage;
  fixture.mic.micStop();
  lateMessage({ data: { type: 'mic-meter', audioTime: 1.1, rms: 1, peak: 1, clipped: true } });
  const reading = fixture.mic.micMeterMeasurement();
  assert.equal(reading.available, false);
  assert.equal(reading.dualTrace.available, false);
  assert.equal(fixture.streams[0].track.stopped, 1);
  assert.equal(node.port.closed, true);
  assert.equal(fixture.contextEvents.size, 0);
  for (const input of fixture.nodes.filter(item => ['source', 'splitter'].includes(item.kind))) {
    assert.equal(input.links.length, 0);
  }
});

test('module loading cannot resurrect a stopped stream and is reused in the same context', async () => {
  const fixture = await microphoneFixture({ worklet: 'pending' });
  await fixture.start();
  fixture.mic.micStop();
  fixture.pendingModule.resolve();
  await flush();
  assert.equal(fixture.worklets.length, 0);
  assert.equal(fixture.streams[0].track.stopped, 1);
  await fixture.start();
  assert.equal(fixture.worklets.length, 1);
  assert.equal(fixture.urls.length, 1);
  assert.equal(fixture.streams[1].track.stopped, 0);
});

test('a late permission grant after stop closes its tracks without building a meter', async () => {
  const request = deferred();
  const fixture = await microphoneFixture({ request });
  const pending = fixture.mic.micInit(fixture.audioContext);
  fixture.mic.micStop();
  const stream = fixture.makeStream();
  request.resolve(stream);
  await pending;
  await flush();
  assert.equal(stream.track.stopped, 1);
  assert.equal(fixture.worklets.length, 0);
  assert.equal(fixture.urls.length, 0);
  assert.equal(fixture.mic.micMeterMeasurement().available, false);
});

test('selected-device loss invalidates a pending worklet load and cleans the graph', async () => {
  const fixture = await microphoneFixture({ worklet: 'pending' });
  await fixture.start({ deviceId: 'chosen' });
  fixture.changeDevices([]);
  await flush();
  assert.equal(fixture.mic.micState(), 'unavailable');
  assert.equal(fixture.streams[0].track.stopped, 1);
  fixture.pendingModule.resolve();
  await flush();
  assert.equal(fixture.worklets.length, 0);
  assert.equal(fixture.mic.micMeterMeasurement().available, false);
});

test('ending the active track releases processor and display nodes', async () => {
  const fixture = await microphoneFixture();
  await fixture.start();
  fixture.streams[0].track.end();
  assert.equal(fixture.mic.micState(), 'unavailable');
  assert.equal(fixture.worklets[0].port.closed, true);
  assert.equal(fixture.mic.micMeterMeasurement().available, false);
});

test('suspended contexts are explicitly unavailable and resume on the correct clock', async () => {
  const fixture = await microphoneFixture();
  await fixture.start();
  fixture.clock.now = 1020;
  fixture.clock.audio = 1.02;
  fixture.message({ audioTime: 1.02, rms: .25, peak: .5, clipped: false });
  fixture.changeContextState('suspended');
  const suspended = fixture.mic.micMeterMeasurement();
  assert.equal(suspended.active, false);
  assert.equal(suspended.available, false);
  assert.equal(suspended.dualTrace.available, false);
  fixture.clock.now = 5020;
  fixture.changeContextState('running');
  fixture.clock.now = 5040;
  fixture.clock.audio = 1.04;
  fixture.message({ audioTime: 1.04, rms: .1, peak: .2, clipped: false });
  const resumed = fixture.mic.micMeterMeasurement();
  close(resumed.timestamp, 5040);
  assert.equal(resumed.available, true);
});

for (const eventBeforePackets of [true, false]) {
  test(`queued resumed peaks use the suspension boundary when running event arrives ${eventBeforePackets ? 'before' : 'after'} packets`, async () => {
    const fixture = await microphoneFixture();
    await fixture.start();
    fixture.clock.now = 1010;
    fixture.clock.audio = 1.01;
    fixture.message({ audioTime: 1.01, rms: .1, peak: .2, clipped: false });
    fixture.clock.now = 1020;
    fixture.clock.audio = 1.02;
    fixture.changeContextState('suspended');

    // Audio resumes at wall time 5020, but the running event is delayed until
    // several rendering quanta have already been processed and queued.
    fixture.clock.now = 5070;
    fixture.clock.audio = 1.07;
    if (eventBeforePackets) fixture.changeContextState('running');
    else fixture.audioContext.state = 'running';

    // A queued packet ending EXACTLY at the suspension boundary still belongs
    // to the old clock. Its clip must have expired during the four-second pause.
    fixture.message({ audioTime: 1.02, rms: .03, peak: .999, clipped: true });
    const beforePause = fixture.mic.micMeterMeasurement();
    close(beforePause.timestamp, 1020);
    assert.equal(beforePause.dualTrace.clipped, false);

    fixture.message({ audioTime: 1.04, rms: .03, peak: .99, clipped: true });
    close(fixture.mic.micMeterMeasurement().timestamp, 5040);
    fixture.message({ audioTime: 1.06, rms: .02, peak: 0, clipped: false });
    fixture.clock.now = 5080;
    fixture.clock.audio = 1.08;
    if (!eventBeforePackets) fixture.changeContextState('running');
    fixture.message({ audioTime: 1.08, rms: 0, peak: 0, clipped: false });
    const resumed = fixture.mic.micMeterMeasurement();
    close(resumed.timestamp, 5080);
    close(resumed.dualTrace.peakDb, 20 * Math.log10(.99));
    assert.equal(resumed.dualTrace.clipped, true);
    assert.equal(resumed.available, true);
  });
}

test('test injection remains authoritative and display filtering does not alter raw values', async () => {
  const fixture = await microphoneFixture({ worklet: 'unsupported' });
  fixture.mic.micTest({ rms: .04, peak: .99, clipped: true });
  const raw = fixture.mic.micMeasurement();
  const display = fixture.mic.micMeterMeasurement(1000);
  close(raw.rms, .04);
  close(raw.peak, .99);
  assert.equal(display.meterSource, 'test');
  assert.equal(display.dualTrace.clipped, true);
  assert.equal(fixture.urls.length, 0);
  fixture.mic.micTest(null);
  assert.equal(fixture.mic.micMeterMeasurement(1000).available, false);
});
