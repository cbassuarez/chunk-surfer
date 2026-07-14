// The room you are actually in.
//
// A game about holding still and making no sound, played through a microphone
// that is listening to the actual room the player is actually sitting in. When
// you roll a take, the recorder is not a metaphor: the browser opens the mic,
// and if the player's real room makes a noise — a cough, a chair, a word — the
// take is spoiled, because the take was never only about the game's room.
//
// And if the player screams, the recordist screams, because at that point the
// two rooms are the same room.
//
// This is entirely optional and fails soft. No permission, an iframe without
// `allow="microphone"`, a headless test — any of these and micActive() stays
// false and the game plays exactly as it did before. It never routes the mic
// to the output; there is no feedback, only an analyser.

const DEFAULT_INPUT = Object.freeze({
  deviceId: 'default',
  channelMode: 'mono',
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
  lastDeviceLabel: '',
});

let ctx = null;
let analyser = null;
let data = null;
let stream = null;
let source = null;
let splitter = null;
let state = 'idle';          // 'idle' | 'asking' | 'on' | 'denied' | 'unavailable' | 'error'
let stateReason = '';
let devices = [];
let devicesKnown = false;
let deviceChangeBound = false;
let activeInput = { ...DEFAULT_INPUT };
let activeDeviceLabel = '';
let activeChannelCount = 0;
let testLevel = null;        // headless override
let spoilMutedUntil = 0;     // recorder transport cannot spoil its own take

const mediaDevices = () => globalThis.navigator?.mediaDevices || null;

export function normalizeMicInput(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const deviceId = typeof source.deviceId === 'string' && source.deviceId.trim()
    ? source.deviceId
    : DEFAULT_INPUT.deviceId;
  const channelMode = ['mono', 'left', 'right'].includes(source.channelMode)
    ? source.channelMode
    : DEFAULT_INPUT.channelMode;
  return {
    deviceId,
    channelMode,
    echoCancellation: source.echoCancellation !== false,
    noiseSuppression: !!source.noiseSuppression,
    autoGainControl: !!source.autoGainControl,
    lastDeviceLabel: typeof source.lastDeviceLabel === 'string' ? source.lastDeviceLabel : '',
  };
}

function setState(next, reason = '') {
  state = next;
  stateReason = reason;
}

export function micState() { return testLevel != null ? 'test' : state; }
// A headless-injected level is authoritative: it means "on", whatever the real
// getUserMedia is doing (its async rejection must not un-inject the test).
export function micActive() { return testLevel != null || state === 'on'; }

export function micDevices() {
  return devices.map((d) => ({ ...d }));
}

export function micSnapshot() {
  return {
    state: micState(),
    reason: stateReason,
    active: micActive(),
    devices: micDevices(),
    devicesKnown,
    deviceId: activeInput.deviceId,
    deviceLabel: activeDeviceLabel || activeInput.lastDeviceLabel || '',
    channelMode: activeInput.channelMode,
    channelCount: activeChannelCount,
    canSelectDevice: !!mediaDevices()?.enumerateDevices,
    level: micLevel(),
  };
}

function deviceLabel(device, index = 0) {
  if (device?.label) return device.label;
  if (device?.deviceId === 'default') return 'System Default';
  return `Microphone ${index + 1}`;
}

function normalizeDevice(device, index) {
  return {
    deviceId: device.deviceId || 'default',
    groupId: device.groupId || '',
    kind: 'audioinput',
    label: deviceLabel(device, index),
    labelVisible: !!device.label,
  };
}

export async function micRefreshDevices() {
  const md = mediaDevices();
  ensureDeviceChangeListener();
  if (!md?.enumerateDevices) {
    devices = [];
    devicesKnown = false;
    if (!md?.getUserMedia && !micActive() && state !== 'asking') setState('unavailable', 'no-media-devices');
    return micSnapshot();
  }
  try {
    const list = await md.enumerateDevices();
    devices = (Array.isArray(list) ? list : [])
      .filter((d) => d?.kind === 'audioinput')
      .map(normalizeDevice);
    devicesKnown = true;
    if (!devices.length && !micActive() && state !== 'asking') setState('unavailable', 'no-audioinput');
    if (devices.length && state === 'unavailable') setState('idle');
    return micSnapshot();
  } catch (_) {
    devicesKnown = false;
    if (!micActive() && state !== 'asking') setState('error', 'enumerate-failed');
    return micSnapshot();
  }
}

function ensureDeviceChangeListener() {
  const md = mediaDevices();
  if (deviceChangeBound || !md?.addEventListener) return;
  deviceChangeBound = true;
  md.addEventListener('devicechange', () => {
    micRefreshDevices().then(() => {
      if (!micActive() || activeInput.deviceId === 'default') return;
      if (!devices.some((d) => d.deviceId === activeInput.deviceId)) stopStream('unavailable', 'selected-device-missing');
    });
  });
}

function classifyGetUserMediaFailure(err) {
  const name = String(err?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return ['denied', 'permission-denied'];
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return ['unavailable', 'no-audioinput'];
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return ['error', 'bad-audio-constraint'];
  if (name === 'NotReadableError' || name === 'AbortError') return ['error', 'device-busy'];
  return ['error', 'get-user-media-failed'];
}

function audioConstraints(input) {
  const audio = {
    echoCancellation: input.echoCancellation,
    noiseSuppression: input.noiseSuppression,
    autoGainControl: input.autoGainControl,
    channelCount: { ideal: input.channelMode === 'mono' ? 1 : 2 },
  };
  if (input.deviceId && input.deviceId !== 'default') audio.deviceId = { exact: input.deviceId };
  return { audio };
}

function trackSettings(s) {
  const track = s?.getAudioTracks?.()?.[0] || s?.getTracks?.()?.find?.((t) => t.kind === 'audio') || null;
  return track?.getSettings?.() || {};
}

function selectedDeviceLabel(input, settings = {}) {
  const id = settings.deviceId || input.deviceId;
  const match = devices.find((d) => d.deviceId === id) || devices.find((d) => d.deviceId === input.deviceId);
  return match?.label || input.lastDeviceLabel || (input.deviceId === 'default' ? 'System Default' : '');
}

function connectAnalyser(s, input, settings = {}) {
  source = ctx.createMediaStreamSource(s);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;
  data = new Float32Array(analyser.fftSize);

  const desiredChannel = input.channelMode === 'right' ? 1 : 0;
  const count = Number(settings.channelCount) || (input.channelMode === 'mono' ? 1 : 2);
  activeChannelCount = count;
  if (input.channelMode !== 'mono' && count > desiredChannel && ctx.createChannelSplitter) {
    splitter = ctx.createChannelSplitter(Math.max(2, count));
    source.connect(splitter);
    splitter.connect(analyser, desiredChannel);
  } else {
    splitter = null;
    source.connect(analyser);           // to the analyser ONLY. never to output.
  }
}

function stopStream(nextState = 'idle', reason = '') {
  try { stream?.getTracks?.().forEach((t) => t.stop?.()); } catch (_) {}
  stream = null;
  source = null;
  splitter = null;
  analyser = null;
  data = null;
  activeChannelCount = 0;
  setState(nextState, reason);
}

// Must be called from (or shortly after) a user gesture. Fire-and-forget: the
// caller does not wait, and a rejection just leaves the game mic-less.
export function micInit(audioCtx, options = {}) {
  if (testLevel != null) return;                 // a test has taken the mic
  const force = !!options.force;
  if (state === 'on' || state === 'asking') return;
  if (!force && (state === 'denied' || state === 'unavailable' || state === 'error')) return;
  const md = mediaDevices();
  if (!audioCtx || !md?.getUserMedia) { setState('unavailable', 'no-media-devices'); return; }
  ctx = audioCtx;
  activeInput = normalizeMicInput(options);
  setState('asking');
  ensureDeviceChangeListener();
  const request = md.getUserMedia(audioConstraints(activeInput)).then((s) => {
    stopStream('asking');
    stream = s;
    const settings = trackSettings(stream);
    connectAnalyser(stream, activeInput, settings);
    activeDeviceLabel = selectedDeviceLabel(activeInput, settings);
    setState('on');
    micRefreshDevices();
    return micSnapshot();
  }).catch((err) => {
    const [next, reason] = classifyGetUserMediaFailure(err);
    stopStream(next, reason);
    return micSnapshot();
  });
  return request;
}

// Current loudness of the real room, RMS 0..1. A quiet room is ~0.005; talking
// is ~0.05–0.15; a shout is past 0.3.
export function micLevel() {
  if (testLevel != null) return testLevel;
  if (state !== 'on' || !analyser || !data) return 0;
  analyser.getFloatTimeDomainData(data);
  return micRms(data);
}

export function micRms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

// Known transport sounds remain visible on both meters, but cannot invalidate
// the take. The real room is still analysed throughout this narrow guard.
export function micIgnoreSpoilFor(ms = 1200) {
  spoilMutedUntil = Math.max(spoilMutedUntil, performance.now() + Math.max(0, Number(ms) || 0));
}
export function micMaySpoil(now = performance.now()) { return now >= spoilMutedUntil; }

// Headless suites cannot grant a mic, so they inject a level instead. It is
// authoritative (see micActive): a real getUserMedia rejection cannot clear it.
export function micTest(level) { testLevel = level == null ? null : level; }

export function micStop() {
  stopStream('idle');
  spoilMutedUntil = 0;
}
