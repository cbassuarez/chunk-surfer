import test from 'node:test';
import assert from 'node:assert/strict';

import {
  micActive,
  micDevices,
  micInit,
  micLevel,
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

test('mic passes selected device constraints and analyzes selected stereo channel', async () => {
  let constraints = null;
  const stream = fakeStream({ deviceId: 'usb-interface', channelCount: 2 });
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
});
