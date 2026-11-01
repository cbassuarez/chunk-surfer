// Run: node --experimental-vm-modules test/microphone-startup-regressions.test.mjs
// Production capture/consent state; only browser devices, AudioNodes and clocks are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const failure = (name, fields = {}) => Object.assign(new Error('test capture failure'), { name, ...fields });

async function microphoneFixture({ sampleRate = 48000, worklet = 'ready', request = null, channels = 2, globals = {} } = {}) {
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
    ...(worklet !== 'unsupported' ? { AudioWorkletNode: FakeAudioWorkletNode } : {}), ...globals,
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
    mediaDevices, mic: module.namespace, clock, audioContext, nodes, worklets, streams, urls, pendingModule, makeStream,
    async start(options = {}) { await module.namespace.micInit(audioContext, options); await flush(); },
    message(message, index = worklets.length - 1) {
      worklets[index].port.onmessage?.({ data: { type: 'mic-meter', ...message } });
    },
    changeDevices(devices) { listedDevices = devices; mediaEvents.get('devicechange')?.(); },
    changeContextState(state) { audioContext.state = state; contextEvents.get('statechange')?.(); },
    contextEvents,
  };
}


test('a synchronous capture rejection settles and an explicit retry really requests again', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  let calls = 0;
  f.mediaDevices.getUserMedia = () => { calls++; throw failure('NotAllowedError'); };
  const denied = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(denied.state, 'denied');
  assert.equal(denied.reason, 'permission-denied');
  assert.equal(denied.failureStage, 'capture');
  assert.equal(denied.errorName, 'NotAllowedError');
  f.mediaDevices.getUserMedia = () => { calls++; return Promise.resolve(f.makeStream()); };
  const ready = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(calls, 2);
  assert.equal(ready.state, 'on');
  assert.equal(ready.failureStage, '');
});

test('a native denial does not automatically retry or change input devices', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  let calls = 0;
  f.mediaDevices.getUserMedia = () => { calls++; return Promise.reject(failure('NotAllowedError')); };
  await f.mic.micInit(f.audioContext, { force: true, deviceId: 'chosen' });
  const unchanged = await f.mic.micInit(f.audioContext);
  assert.equal(unchanged.state, 'denied');
  assert.equal(unchanged.deviceId, 'chosen');
  assert.equal(calls, 1);
});

for (const [name, state, reason] of [
  ['SecurityError', 'denied', 'capture-disabled'],
  ['NotReadableError', 'error', 'device-busy'],
  ['AbortError', 'error', 'capture-aborted'],
  ['InvalidStateError', 'error', 'inactive-document'],
  ['NotFoundError', 'unavailable', 'no-audioinput'],
  ['OverconstrainedError', 'error', 'bad-audio-constraint'],
]) {
  test(`${name} retains its own actionable capture category`, async () => {
    const f = await microphoneFixture({ worklet: 'unsupported' });
    f.mediaDevices.getUserMedia = () => Promise.reject(failure(name, { constraint: name === 'OverconstrainedError' ? 'sampleRate' : '' }));
    const result = await f.mic.micInit(f.audioContext, { force: true });
    assert.equal(result.state, state);
    assert.equal(result.reason, reason);
    assert.equal(result.failureStage, 'capture');
    assert.equal(result.errorName, name);
    assert.equal(result.failedConstraint, name === 'OverconstrainedError' ? 'sampleRate' : '');
  });
}

test('a SecurityError after access is granted reports audio setup failure and releases the stream', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  const create = f.audioContext.createMediaStreamSource;
  f.audioContext.createMediaStreamSource = () => { throw failure('SecurityError'); };
  const result = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(result.state, 'error');
  assert.equal(result.reason, 'audio-setup-failed');
  assert.equal(result.failureStage, 'audio-setup');
  assert.equal(result.errorName, 'SecurityError');
  assert.equal(f.streams[0].track.stopped, 1);
  assert.equal(f.mic.micStream(), null);
  f.audioContext.createMediaStreamSource = create;
  assert.equal((await f.mic.micInit(f.audioContext, { force: true })).state, 'on');
});

test('a readout exception after grant cannot be mislabeled as permission denial', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  const create = f.audioContext.createAnalyser;
  f.audioContext.createAnalyser = () => {
    const node = create();
    node.getFloatTimeDomainData = () => { throw failure('NotAllowedError'); };
    return node;
  };
  const result = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(result.reason, 'audio-setup-failed');
  assert.equal(result.state, 'error');
  assert.equal(result.failureStage, 'audio-setup');
  assert.equal(f.streams[0].track.stopped, 1);
  assert.equal(f.mic.micMeterMeasurement().available, false);
});

test('a resolved stream without a live audio track is closed and never reported ready', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  f.mediaDevices.getUserMedia = () => {
    const stream = f.makeStream();
    stream.getAudioTracks = () => [];
    return Promise.resolve(stream);
  };
  const result = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(result.state, 'unavailable');
  assert.equal(result.reason, 'no-audio-track');
  assert.equal(result.failureStage, 'audio-setup');
  assert.equal(f.streams[0].track.stopped, 1);
  assert.equal(f.nodes.length, 0);
});

for (const closed of [false, true]) {
  test(`${closed ? 'closed' : 'missing'} AudioContext is distinguished from a missing microphone API`, async () => {
    const f = await microphoneFixture({ worklet: 'unsupported' });
    let calls = 0;
    f.mediaDevices.getUserMedia = () => { calls++; return Promise.resolve(f.makeStream()); };
    if (closed) f.audioContext.state = 'closed';
    const result = await f.mic.micInit(closed ? f.audioContext : null, { force: true });
    assert.equal(result.state, 'error');
    assert.equal(result.reason, closed ? 'audio-context-closed' : 'no-audio-context');
    assert.equal(result.failureStage, 'environment');
    assert.equal(calls, 0);
  });
}

for (const [globals, expectedState, reason] of [
  [{ isSecureContext: false }, 'unavailable', 'insecure-context'],
  [{ document: { permissionsPolicy: { allowsFeature: () => false } } }, 'denied', 'microphone-policy-blocked'],
  [{ document: { featurePolicy: { allowsFeature: () => false } } }, 'denied', 'microphone-policy-blocked'],
]) {
  test(`observed ${reason} is reported without pretending that a native prompt opened`, async () => {
    const f = await microphoneFixture({ worklet: 'unsupported', globals });
    let calls = 0;
    f.mediaDevices.getUserMedia = () => { calls++; return Promise.resolve(f.makeStream()); };
    const result = await f.mic.micInit(f.audioContext, { force: true });
    assert.equal(result.state, expectedState);
    assert.equal(result.reason, reason);
    assert.equal(result.failureStage, 'environment');
    assert.equal(calls, 0);
  });
}

test('an unavailable capture API gets its own reason', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  delete f.mediaDevices.getUserMedia;
  const result = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(result.state, 'unavailable');
  assert.equal(result.reason, 'no-media-devices');
  assert.equal(result.failureStage, 'environment');
});

test('unsupported policy introspection still uses the real capture permission decision', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported', globals: {
    document: { permissionsPolicy: { allowsFeature() { throw failure('NotSupportedError'); } } },
  } });
  let calls = 0;
  f.mediaDevices.getUserMedia = () => { calls++; return Promise.reject(failure('NotAllowedError')); };
  const result = await f.mic.micInit(f.audioContext, { force: true });
  assert.equal(result.reason, 'permission-denied');
  assert.equal(result.failureStage, 'capture');
  assert.equal(calls, 1);
});

test('a stale exact device has no silent fallback; explicitly choosing default can recover', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  const requests = [];
  f.mediaDevices.getUserMedia = constraints => {
    requests.push(constraints);
    return constraints.audio.deviceId ? Promise.reject(failure('OverconstrainedError', { constraint: 'deviceId' }))
      : Promise.resolve(f.makeStream());
  };
  const failed = await f.mic.micInit(f.audioContext, { force: true, deviceId: 'expired-id', lastDeviceLabel: 'Old USB' });
  assert.equal(failed.reason, 'selected-device-missing');
  assert.equal(failed.failedConstraint, 'deviceId');
  assert.equal(failed.deviceId, 'expired-id');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].audio.deviceId.exact, 'expired-id');
  const ready = await f.mic.micInit(f.audioContext, { force: true, deviceId: 'default', lastDeviceLabel: '' });
  assert.equal(ready.state, 'on');
  assert.equal(ready.deviceId, 'default');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].audio.deviceId, undefined);
});

test('duplicate starts share one pending permission promise; opt-out still closes a late grant', async () => {
  const request = deferred(), f = await microphoneFixture({ worklet: 'unsupported', request });
  const first = f.mic.micInit(f.audioContext, { force: true });
  assert.equal(f.mic.micInit(f.audioContext, { force: true }), first);
  f.mic.micStop();
  const stream = f.makeStream();
  request.resolve(stream);
  const result = await first;
  assert.equal(result.state, 'idle');
  assert.equal(stream.track.stopped, 1);
  assert.equal(f.nodes.length, 0);
});

test('a late rejection cannot overwrite a newer successful capture', async () => {
  const request = deferred(), f = await microphoneFixture({ worklet: 'unsupported', request });
  const old = f.mic.micInit(f.audioContext, { force: true });
  f.mic.micStop();
  f.mediaDevices.getUserMedia = () => Promise.resolve(f.makeStream());
  await f.mic.micInit(f.audioContext, { force: true });
  request.reject(failure('NotAllowedError'));
  await old;
  assert.equal(f.mic.micState(), 'on');
  assert.equal(f.streams[0].track.stopped, 0);
});

test('enumeration failure cannot stop a granted selected input', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  f.mediaDevices.enumerateDevices = () => Promise.reject(failure('NotAllowedError'));
  await f.start({ force: true, deviceId: 'chosen' });
  assert.equal(f.mic.micSnapshot().devicesKnown, false);
  f.changeDevices([]);
  await flush();
  assert.equal(f.mic.micState(), 'on');
  assert.equal(f.streams[0].track.stopped, 0);
});

test('privacy-filtered enumeration preserves the explicit permission failure', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  f.mediaDevices.getUserMedia = () => Promise.reject(failure('NotAllowedError'));
  await f.mic.micInit(f.audioContext, { force: true });
  f.changeDevices([]);
  await flush();
  assert.equal(f.mic.micState(), 'denied');
  assert.equal(f.mic.micSnapshot().reason, 'permission-denied');
  assert.equal(f.mic.micSnapshot().errorName, 'NotAllowedError');
});

test('a device list begun for an older stream cannot close its replacement', async () => {
  const f = await microphoneFixture({ worklet: 'unsupported' });
  await f.start({ force: true, deviceId: 'chosen' });
  const listing = deferred();
  f.mediaDevices.enumerateDevices = () => listing.promise;
  f.changeDevices([]);
  f.mic.micStop();
  await f.mic.micInit(f.audioContext, { force: true, deviceId: 'replacement' });
  listing.resolve([]);
  await flush();
  assert.equal(f.mic.micState(), 'on');
  assert.equal(f.streams[1].track.stopped, 0);
});

test('display worklet loading failure falls back after a successful grant', async () => {
  const f = await microphoneFixture({ worklet: 'reject' });
  await f.start({ force: true });
  const snapshot = f.mic.micSnapshot();
  assert.equal(snapshot.state, 'on');
  assert.equal(snapshot.failureStage, '');
  assert.equal(f.mic.micMeterMeasurement().meterSource, 'analyser');
  assert.equal(f.streams[0].track.stopped, 0);
});
