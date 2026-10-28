import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  micActive,
  micDevices,
  micInit,
  micLevel,
  micMeasurement,
  micPeak,
  micRefreshDevices,
  micRms,
  micSnapshot,
  micState,
  micStop,
  micTest,
} from '../src/game/mic.js';
import { normalizeSettings } from '../src/progression/schema.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function installMediaDevices(mediaDevices) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices },
  });
}

function restoreNavigator() {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
}

function fakeStream(settings = {}) {
  const track = {
    kind: 'audio',
    stopCalled: false,
    stop() { this.stopCalled = true; },
    getSettings() { return settings; },
  };
  return {
    track,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
}

function fakeAudioContext() {
  const ctx = {
    sample: 0.25,
    splitterChannel: null,
    createMediaStreamSource() {
      return { connect() {} };
    },
    createChannelSplitter() {
      return {
        connect(_node, channel) { ctx.splitterChannel = channel; },
      };
    },
    createAnalyser() {
      return {
        fftSize: 1024,
        smoothingTimeConstant: 0,
        getFloatTimeDomainData(samples) { samples.fill(ctx.sample); },
      };
    },
  };
  return ctx;
}

test.afterEach(() => {
  micTest(null);
  micStop();
  restoreNavigator();
});

test('mic settings normalize source and channel preferences', () => {
  const normalized = normalizeSettings({
    micInput: {
      deviceId: 'usb-interface',
      channelMode: 'right',
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
      lastDeviceLabel: 'USB Interface',
    },
  });
  assert.equal(normalized.mic, 'ask');
  assert.deepEqual(normalized.micInput, {
    deviceId: 'usb-interface',
    channelMode: 'right',
    echoCancellation: false,
    noiseSuppression: true,
    autoGainControl: true,
    lastDeviceLabel: 'USB Interface',
  });
  assert.equal(normalizeSettings({ micInput: { channelMode: 'center' } }).micInput.channelMode, 'mono');
});

test('mic reports unavailable when no media device API exists', async () => {
  installMediaDevices(null);
  await micInit(fakeAudioContext(), { force: true });
  assert.equal(micState(), 'unavailable');
  assert.equal(micSnapshot().reason, 'no-media-devices');
  assert.equal(micActive(), false);
});

test('mic refresh reports unavailable when no audio inputs are enumerated', async () => {
  installMediaDevices({
    enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'camera' }],
  });
  const snap = await micRefreshDevices();
  assert.equal(snap.state, 'unavailable');
  assert.equal(snap.reason, 'no-audioinput');
  assert.deepEqual(micDevices(), []);
});

test('mic denied permission is separate from no-input state', async () => {
  installMediaDevices({
    enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'default', label: '' }],
    getUserMedia: async () => {
      const err = new Error('blocked');
      err.name = 'NotAllowedError';
      throw err;
    },
  });
  const snap = await micInit(fakeAudioContext(), { force: true });
  assert.equal(snap.state, 'denied');
  assert.equal(snap.reason, 'permission-denied');
});

test('a late OS grant is stopped after consent is revoked', async () => {
  let resolveRequest;
  const stream = fakeStream();
  installMediaDevices({ getUserMedia: () => new Promise(resolve => { resolveRequest = resolve; }) });
  const pending = micInit(fakeAudioContext(), { force: true });
  assert.equal(micState(), 'asking');
  micStop();
  resolveRequest(stream);
  await pending;
  assert.equal(stream.track.stopCalled, true);
  assert.equal(micState(), 'idle');
  assert.equal(micActive(), false);
});

test('a stale denial cannot turn off a later microphone request', async () => {
  let rejectOld, resolveNew;
  installMediaDevices({ getUserMedia: (() => {
    let count = 0;
    return () => ++count === 1
      ? new Promise((_resolve, reject) => { rejectOld = reject; })
      : new Promise(resolve => { resolveNew = resolve; });
  })() });
  const old = micInit(fakeAudioContext(), { force: true });
  micStop();
  const next = micInit(fakeAudioContext(), { force: true });
  rejectOld(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  await old;
  assert.equal(micState(), 'asking');
  resolveNew(fakeStream());
  await next;
  assert.equal(micState(), 'on');
});

test('production entry paths require a run decision before opening the mic', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const part = (from, to) => main.slice(main.indexOf(from), main.indexOf(to, main.indexOf(from)));
  const start = part('function startRoomMic(', 'function applyStoryChoice(');
  assert.match(start, /roomMicRunConsent !== true/);
  assert.ok(start.indexOf('roomMicRunConsent !== true') < start.indexOf('MIC.micInit('));
  const profile = part('function applyPsychProfileConsent(', 'function chooseRoomMicForRun(');
  assert.doesNotMatch(profile, /startRoomMic\(/, 'profile consent alone cannot open the mic');
  const newRun = part('function beginNewGameFlow(', 'function enterSelectedRun(');
  assert.match(newRun, /roomMicRunConsent=null;\s*MIC\.micStop\(\)/);
  const selected = part('function enterSelectedRun(', 'function setGameChrome(');
  assert.match(selected, /askMic:true/);
  assert.match(selected, /onMicAllow:.*chooseRoomMicForRun\(true\)/);
  assert.match(selected, /onMicDeny:.*chooseRoomMicForRun\(false\)/);
  const resume = part('function requestFrontEndContinue(', 'function requestFrontEndNewRun(');
  assert.match(resume, /roomMicRunConsent===null/);
  assert.match(resume, /askMic:true/);
});

test('mic passes selected device constraints and analyzes selected stereo channel', async () => {
  let constraints = null;
  const stream = fakeStream({
    deviceId: 'usb-interface', channelCount: 2,
    echoCancellation: true, noiseSuppression: false, autoGainControl: false,
  });
  installMediaDevices({
    addEventListener() {},
    enumerateDevices: async () => [
      { kind: 'audioinput', deviceId: 'default', groupId: '', label: 'System Default' },
      { kind: 'audioinput', deviceId: 'usb-interface', groupId: '', label: 'USB Interface' },
    ],
    getUserMedia: async (request) => {
      constraints = request;
      return stream;
    },
  });
  await micRefreshDevices();
  const ctx = fakeAudioContext();
  const snap = await micInit(ctx, {
    force: true,
    deviceId: 'usb-interface',
    channelMode: 'right',
    lastDeviceLabel: 'USB Interface',
  });
  assert.equal(snap.state, 'on');
  assert.equal(snap.deviceLabel, 'USB Interface');
  assert.equal(snap.channelCount, 2);
  assert.equal(constraints.audio.deviceId.exact, 'usb-interface');
  assert.equal(constraints.audio.channelCount.ideal, 2);
  assert.deepEqual(constraints.audio.echoCancellation, { ideal: true });
  assert.equal(constraints.audio.noiseSuppression, false);
  assert.equal(constraints.audio.autoGainControl, false);
  assert.equal(snap.processing.echoCancellation, true);
  assert.equal(ctx.splitterChannel, 1);
  ctx.sample = 0.5;
  assert.equal(micLevel(), 0.5);
});

test('headless mic test override remains authoritative', async () => {
  installMediaDevices({
    getUserMedia: async () => {
      const err = new Error('blocked');
      err.name = 'NotAllowedError';
      throw err;
    },
  });
  micTest(0.2);
  await micInit(fakeAudioContext(), { force: true });
  assert.equal(micState(), 'test');
  assert.equal(micActive(), true);
  assert.equal(micLevel(), 0.2);
  assert.equal(micRms(new Float32Array([0.5, -0.5])), 0.5);
  assert.ok(Math.abs(micPeak(new Float32Array([0.5, -0.9, 0.2])) - 0.9) < 1e-6);
  micTest({ rms: 0.4, peak: 1, clipped: true });
  assert.deepEqual(micMeasurement(), { rms: 0.4, peak: 1, clipped: true });
  assert.equal(micLevel(), 0.4);
});
