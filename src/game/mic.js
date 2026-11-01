import { effectiveMicMeasurement } from '../audio/self-audio-mask.js';
import { createDualTraceMeter } from '../audio/dual-trace.js';

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
let frequencyData = null;
let stream = null;
// Invalidates a pending OS request when the player leaves or revokes consent.
let requestGeneration = 0;
let pendingRequest = null;
let source = null;
let splitter = null;
let state = 'idle';          // 'idle' | 'asking' | 'on' | 'denied' | 'unavailable' | 'error'
let stateReason = '';
let stateFailure = null;
let devices = [];
let devicesKnown = false;
let deviceChangeBound = false;
let activeInput = { ...DEFAULT_INPUT };
let activeDeviceLabel = '';
let activeChannelCount = 0;
let activeProcessing = { echoCancellation: null, noiseSuppression: null, autoGainControl: null };
let testLevel = null;        // headless override
let spoilMutedUntil = 0;     // recorder transport cannot spoil its own take
let selfAudioProvider = null;

// Presentation has its own acquisition and history. None of these readings
// replaces micMeasurement()/micEffectiveMeasurement() in the gameplay rules.
const displayMeter = createDualTraceMeter();
const meterModules = new WeakMap();
let meterSession = null;
let meterGeneration = 0;
let endedTracks = [];
let testMeterRevision = 0, testMeterReadRevision = -1, testMeterQuantum = null;
const meterNow = () => globalThis.performance?.now?.() ?? Date.now();

function disconnect(node, destination = null, output = 0) {
  try {
    if (destination) node?.disconnect?.(destination, output, 0);
    else node?.disconnect?.();
  } catch (_) {}
}

function stopMeterProcessor(session) {
  const node = session?.node;
  if (!node) return;
  session.node = null;
  node.onprocessorerror = null;
  node.port.onmessage = null;
  try { node.port.postMessage({ type: 'stop' }); } catch (_) {}
  disconnect(session.input, node, session.output);
  disconnect(node);
  try { node.port.close?.(); } catch (_) {}
}

function stopDisplayMeter() {
  meterGeneration += 1;
  const session = meterSession;
  meterSession = null;
  if (session) {
    session.active = false;
    stopMeterProcessor(session);
    disconnect(session.input, session.analyser, session.output);
    disconnect(session.analyser);
    session.context.removeEventListener?.('statechange', session.onStateChange);
  }
  displayMeter.reset();
  testMeterReadRevision = -1;
  testMeterQuantum = null;
}

function loadMeterModule(context) {
  if (!context.audioWorklet?.addModule || typeof globalThis.AudioWorkletNode !== 'function') {
    return Promise.resolve(false);
  }
  if (!meterModules.has(context)) {
    // Static URL is recognized by Vite; never inline the processor into a data
    // URL, which would need a broader worklet CSP on the desktop application.
    const task = Promise.resolve().then(() => context.audioWorklet.addModule(
      new URL('../audio/mic-meter-worklet.js?no-inline', import.meta.url),
    )).then(() => true, () => {
      meterModules.delete(context);
      return false;
    });
    meterModules.set(context, task);
  }
  return meterModules.get(context);
}

function recordMeterClock(session, afterAudioTime = null) {
  const audioTime = Number(session.context.currentTime) || 0;
  session.clocks.push({
    from: afterAudioTime ?? audioTime,
    exclusive: afterAudioTime != null,
    offset: meterNow() - audioTime * 1000,
  });
  if (session.clocks.length > 8) session.clocks.shift();
}

function observeMeterContextState(session) {
  if (session.context.state === 'running') {
    if (session.suspendedAt == null) return;
    // The running event can arrive after audio has resumed. Its clock offset
    // applies to every sample AFTER the captured suspension boundary, including
    // packets already queued before that event. A packet ending at the boundary
    // still contains pre-suspension samples and must keep the preceding clock.
    recordMeterClock(session, session.suspendedAt);
    session.suspendedAt = null;
  } else if (session.context.state && session.suspendedAt == null) {
    session.suspendedAt = Number(session.context.currentTime) || 0;
  }
}

function meterMessageTime(session, audioTime, now) {
  let clock = session.clocks[0];
  for (const candidate of session.clocks) {
    if (candidate.exclusive ? candidate.from < audioTime : candidate.from <= audioTime) clock = candidate;
  }
  return Math.min(now, audioTime * 1000 + clock.offset);
}

function connectDisplayMeter(input, output) {
  const session = {
    generation: ++meterGeneration, active: true, context: ctx, input, output,
    analyser: null, samples: null, node: null, mode: 'analyser', latest: null,
    lastQuantum: null, lastAudioTime: null, lastWorkletTime: -Infinity,
    clocks: [], suspendedAt: null, startedAudioTime: 0,
  };
  meterSession = session;
  recordMeterClock(session);
  session.clocks[0].from = -Infinity;
  observeMeterContextState(session);
  session.onStateChange = () => {
    if (session.active) observeMeterContextState(session);
  };
  session.context.addEventListener?.('statechange', session.onStateChange);

  try {
    // The fallback has a full 100 ms time-domain window of its own. Enlarging
    // the gameplay analyser would change the detector that spoils takes.
    const sampleRate = Number(ctx.sampleRate) || 48000;
    session.windowSamples = Math.max(1, Math.min(32768, Math.round(sampleRate * 0.1)));
    const fallback = ctx.createAnalyser();
    fallback.fftSize = Math.max(32, 2 ** Math.ceil(Math.log2(session.windowSamples)));
    fallback.smoothingTimeConstant = 0;
    fallback.channelCount = 1;
    fallback.channelCountMode = 'explicit';
    fallback.channelInterpretation = 'speakers';
    session.analyser = fallback;
    session.samples = new Float32Array(fallback.fftSize);
    input.connect(fallback, output, 0);
  } catch (_) {
    // A failed display node must not interrupt microphone capture. Existing
    // analyser samples remain a degraded, frame-polled fallback in this case.
    disconnect(session.analyser);
    session.analyser = null;
    session.samples = null;
  }

  void loadMeterModule(session.context).then((loaded) => {
    if (!loaded || !session.active || meterSession !== session || !stream) return;
    try {
      const node = new globalThis.AudioWorkletNode(session.context, 'chunk-surfer-mic-meter', {
        numberOfInputs: 1, numberOfOutputs: 0,
        channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
      });
      session.node = node;
      session.mode = 'starting';
      session.startedAudioTime = Number(session.context.currentTime) || 0;
      node.port.onmessage = ({ data: message }) => {
        if (!session.active || meterSession !== session || testLevel != null
          || message?.type !== 'mic-meter' || !Number.isFinite(message.audioTime)
          || message.audioTime <= session.lastWorkletTime) return;
        if (![message.rms, message.peak].every(value => Number.isFinite(value) && value >= 0)) return;
        session.lastWorkletTime = message.audioTime;
        // Port messages and statechange events use separate task queues: a
        // resumed packet may be delivered before the running event itself.
        observeMeterContextState(session);
        const timestamp = meterMessageTime(session, message.audioTime, meterNow());
        const measurement = {
          rms: message.rms, peak: message.peak, clipped: !!message.clipped,
          integrated: true, available: true, peakKind: 'sample',
        };
        displayMeter.push(measurement, timestamp);
        session.mode = 'worklet';
        session.latest = { ...measurement, timestamp, meterSource: 'worklet' };
      };
      node.onprocessorerror = () => {
        if (!session.active || meterSession !== session) return;
        stopMeterProcessor(session);
        session.mode = 'analyser';
        session.lastQuantum = null;
        session.lastAudioTime = null;
      };
      input.connect(node, output, 0);
      node.port.start?.();
    } catch (_) {
      stopMeterProcessor(session);
      session.mode = 'analyser';
    }
  });
}

function sampleDisplayFallback(session, now) {
  const sampleRate = Number(session.context.sampleRate) || 48000;
  const audioTime = Number.isFinite(session.context.currentTime)
    ? session.context.currentTime : now / 1000;
  const quantum = Math.floor(audioTime * sampleRate / 128);
  if (quantum === session.lastQuantum) return;
  session.lastQuantum = quantum;
  let measurement;
  if (session.analyser && session.samples) {
    session.analyser.getFloatTimeDomainData(session.samples);
    const samples = session.samples, window = Math.min(session.windowSamples, samples.length);
    let power = 0, peak = 0;
    for (let index = samples.length - window; index < samples.length; index += 1) {
      const value = Number.isFinite(samples[index]) ? samples[index] : 0;
      power += value * value;
    }
    // Scan newly arrived samples for peaks. Re-scanning an overlapping 100 ms
    // history on every draw would keep extending the same transient's hold.
    const arrived = session.lastAudioTime == null ? window
      : Math.max(1, Math.min(samples.length, Math.round((audioTime - session.lastAudioTime) * sampleRate)));
    for (let index = samples.length - arrived; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(Number(samples[index]) || 0));
    }
    measurement = { rms: Math.sqrt(power / window), peak, clipped: peak >= .985, integrated: true };
  } else {
    measurement = { ...micMeasurement(), integrated: false };
  }
  session.lastAudioTime = audioTime;
  displayMeter.push({ ...measurement, available: true, peakKind: 'sample' }, now);
  session.latest = { ...measurement, timestamp: now, available: true, meterSource: 'analyser' };
}

// Prepared display-only state, shared by the recorder, mic check and navigator.
// Worklet packets advance it even between renders; read() cannot renew holds.
export function micMeterMeasurement(now = meterNow()) {
  if (testLevel != null) {
    const quantum = Math.floor(now / (1000 / 60));
    if (quantum !== testMeterQuantum || testMeterRevision !== testMeterReadRevision) {
      displayMeter.push({ ...micMeasurement(), available: true, integrated: true, peakKind: 'sample' }, now);
      testMeterQuantum = quantum;
      testMeterReadRevision = testMeterRevision;
    }
    return { ...micMeasurement(), active: true, available: true, meterSource: 'test', timestamp: now, dualTrace: displayMeter.read(now) };
  }
  const session = meterSession;
  if (state !== 'on' || !session?.active) {
    return { rms: 0, peak: 0, clipped: false, active: false, available: false,
      meterSource: 'inactive', timestamp: now, dualTrace: displayMeter.read(now) };
  }
  observeMeterContextState(session);
  if (session.context.state && session.context.state !== 'running') {
    return { rms: 0, peak: 0, clipped: false, active: false, available: false,
      meterSource: session.mode === 'worklet' ? 'worklet' : 'analyser', timestamp: now,
      dualTrace: { ...displayMeter.read(now), available: false } };
  }
  if (session.mode === 'starting'
    && session.context.currentTime - session.startedAudioTime > .25) {
    stopMeterProcessor(session);
    session.mode = 'analyser';
    session.lastQuantum = null;
  }
  if (session.mode === 'analyser') sampleDisplayFallback(session, now);
  const dualTrace = displayMeter.read(now);
  return { ...(session.latest || { rms: 0, peak: 0, clipped: false, timestamp: now }),
    active: !!dualTrace.available, available: !!dualTrace.available,
    meterSource: session.mode === 'worklet' ? 'worklet' : 'analyser', dualTrace };
}

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

function setState(next, reason = '', failure = null) {
  state = next;
  stateReason = reason;
  stateFailure = failure;
}

export function micState() { return testLevel != null ? 'test' : state; }
// A headless-injected level is authoritative: it means "on", whatever the real
// getUserMedia is doing (its async rejection must not un-inject the test).
export function micActive() { return testLevel != null || state === 'on'; }
export function micStream(){return state==='on'?stream:null;}

export function micDevices() {
  return devices.map((d) => ({ ...d }));
}

export function micSnapshot() {
  const measurement = micMeasurement();
  const effective = micEffectiveMeasurement();
  return {
    state: micState(),
    reason: stateReason,
    failureStage: stateFailure?.stage || '',
    errorName: stateFailure?.name || '',
    failedConstraint: stateFailure?.constraint || '',
    active: micActive(),
    devices: micDevices(),
    devicesKnown,
    deviceId: activeInput.deviceId,
    deviceLabel: activeDeviceLabel || activeInput.lastDeviceLabel || '',
    channelMode: activeInput.channelMode,
    channelCount: activeChannelCount,
    processing: { ...activeProcessing },
    canSelectDevice: !!mediaDevices()?.enumerateDevices,
    level: measurement.rms,
    peak: measurement.peak,
    clipped: measurement.clipped,
    effectiveLevel: effective.effective.rms,
    effectivePeak: effective.effective.peak,
    selfAudioMask: effective.mask,
    gameEchoLikely: effective.gameEchoLikely,
    playerNoiseLikely: effective.playerNoiseLikely,
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
    if (!md?.getUserMedia && state === 'idle') {
      const [next, reason] = captureEnvironmentFailure(md) || ['unavailable', 'no-media-devices'];
      setState(next, reason, { stage: 'environment' });
    }
    return micSnapshot();
  }
  try {
    const list = await md.enumerateDevices();
    devices = (Array.isArray(list) ? list : [])
      .filter((d) => d?.kind === 'audioinput')
      .map(normalizeDevice);
    devicesKnown = true;
    // Enumeration is optional and may be privacy-filtered before permission.
    // It must not replace the outcome of an explicit capture request.
    if (!devices.length && state === 'idle') setState('unavailable', 'no-audioinput');
    if (devices.length && state === 'unavailable' && ['no-audioinput', 'no-media-devices'].includes(stateReason)) setState('idle');
    return micSnapshot();
  } catch (_) {
    devicesKnown = false;
    return micSnapshot();
  }
}

function ensureDeviceChangeListener() {
  const md = mediaDevices();
  if (deviceChangeBound || !md?.addEventListener) return;
  deviceChangeBound = true;
  md.addEventListener('devicechange', () => {
    const observedStream = stream, generation = requestGeneration;
    micRefreshDevices().then(() => {
      if (generation !== requestGeneration || observedStream !== stream || !devicesKnown
        || !micActive() || activeInput.deviceId === 'default') return;
      if (!devices.some((d) => d.deviceId === activeInput.deviceId)) stopStream('unavailable', 'selected-device-missing');
    });
  });
}

function captureEnvironmentFailure(md = mediaDevices()) {
  if (globalThis.isSecureContext === false) return ['unavailable', 'insecure-context'];
  try {
    const policy = globalThis.document?.permissionsPolicy || globalThis.document?.featurePolicy;
    if (policy?.allowsFeature?.('microphone') === false) return ['denied', 'microphone-policy-blocked'];
  } catch (_) {} // Policy introspection is not supported by every WebView.
  if (typeof md?.getUserMedia !== 'function') return ['unavailable', 'no-media-devices'];
  return null;
}

function captureFailureDetails(err, stage) {
  return {
    stage,
    name: typeof err?.name === 'string' ? err.name.slice(0, 80) : '',
    constraint: typeof err?.constraint === 'string' ? err.constraint.slice(0, 80)
      : typeof err?.constraintName === 'string' ? err.constraintName.slice(0, 80) : '',
  };
}

function classifyGetUserMediaFailure(err, input) {
  const name = String(err?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return captureEnvironmentFailure() || ['denied', 'permission-denied'];
  if (name === 'SecurityError') return ['denied', 'capture-disabled'];
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return ['unavailable', input.deviceId !== 'default' ? 'selected-device-missing' : 'no-audioinput'];
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return (err?.constraint || err?.constraintName) === 'deviceId' && input.deviceId !== 'default'
      ? ['unavailable', 'selected-device-missing'] : ['error', 'bad-audio-constraint'];
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') return ['error', 'device-busy'];
  if (name === 'AbortError') return ['error', 'capture-aborted'];
  if (name === 'InvalidStateError') return ['error', 'inactive-document'];
  return ['error', 'get-user-media-failed'];
}

function audioConstraints(input) {
  const audio = {
    // Prefer system/browser processing without making unsupported processing a
    // hard getUserMedia failure. Built-in laptop speaker/mic pairs benefit most
    // from the platform AEC; the measured final-output reference below catches
    // residual echo that survives it.
    echoCancellation: input.echoCancellation ? { ideal: true } : false,
    noiseSuppression: input.noiseSuppression ? { ideal: true } : false,
    autoGainControl: input.autoGainControl ? { ideal: true } : false,
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
  frequencyData = typeof analyser.getFloatFrequencyData === 'function'
    ? new Float32Array(analyser.frequencyBinCount)
    : null;
  activeProcessing = {
    echoCancellation: typeof settings.echoCancellation === 'boolean' ? settings.echoCancellation : null,
    noiseSuppression: typeof settings.noiseSuppression === 'boolean' ? settings.noiseSuppression : null,
    autoGainControl: typeof settings.autoGainControl === 'boolean' ? settings.autoGainControl : null,
  };

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
  connectDisplayMeter(splitter || source, splitter ? desiredChannel : 0);
}

function stopStream(nextState = 'idle', reason = '', failure = null) {
  stopDisplayMeter();
  for (const { track, ended } of endedTracks) track.removeEventListener?.('ended', ended);
  endedTracks = [];
  try { stream?.getTracks?.().forEach((t) => t.stop?.()); } catch (_) {}
  disconnect(source);
  disconnect(splitter);
  disconnect(analyser);
  stream = null;
  source = null;
  splitter = null;
  analyser = null;
  data = null;
  frequencyData = null;
  activeChannelCount = 0;
  activeProcessing = { echoCancellation: null, noiseSuppression: null, autoGainControl: null };
  setState(nextState, reason, failure);
}

// Invoke capture synchronously in the consent gesture. Every completion is a
// snapshot (or promise of one); permission and later audio setup are distinct.
export function micInit(audioCtx, options = {}) {
  if (testLevel != null || state === 'on') return micSnapshot();
  if (state === 'asking') return pendingRequest || micSnapshot();
  const force = !!options.force;
  if (!force && (state === 'denied' || state === 'unavailable' || state === 'error')) return micSnapshot();
  const md = mediaDevices();
  const unavailable = !audioCtx ? ['error', 'no-audio-context']
    : audioCtx.state === 'closed' ? ['error', 'audio-context-closed'] : captureEnvironmentFailure(md);
  if (unavailable) {
    setState(...unavailable, { stage: 'environment' });
    return micSnapshot();
  }
  ctx = audioCtx;
  activeInput = normalizeMicInput(options);
  setState('asking');
  ensureDeviceChangeListener();
  const generation = ++requestGeneration;
  const failCapture = (err) => {
    if (generation !== requestGeneration) return micSnapshot();
    const [next, reason] = classifyGetUserMediaFailure(err, activeInput);
    stopStream(next, reason, captureFailureDetails(err, 'capture'));
    return micSnapshot();
  };
  let capture;
  try { capture = md.getUserMedia(audioConstraints(activeInput)); }
  catch (err) { return failCapture(err); }
  const request = Promise.resolve(capture).then((s) => {
    if (generation !== requestGeneration) {
      s?.getTracks?.().forEach((track) => track.stop?.());
      return micSnapshot();
    }
    stopStream('asking');
    stream = s;
    try {
      const tracks = stream?.getAudioTracks?.() || stream?.getTracks?.().filter(track => track.kind === 'audio') || [];
      if (!tracks.length || tracks.every(track => track.readyState === 'ended')) {
        stopStream('unavailable', 'no-audio-track', { stage: 'audio-setup' });
        return micSnapshot();
      }
      const settings = trackSettings(stream);
      connectAnalyser(stream, activeInput, settings);
      activeDeviceLabel = selectedDeviceLabel(activeInput, settings);
      setState('on');
      endedTracks = tracks.map(track => {
        const ownedStream = stream;
        const ended = () => { if (stream === ownedStream) stopStream('unavailable', 'input-ended'); };
        track.addEventListener?.('ended', ended);
        return { track, ended };
      });
      const snapshot = micSnapshot();
      void micRefreshDevices();
      return snapshot;
    } catch (err) {
      // Access was already granted. A graph/readout failure is not a rejected
      // permission, and all granted tracks must still be released on failure.
      stopStream('error', ctx?.state === 'closed' ? 'audio-context-closed' : 'audio-setup-failed',
        captureFailureDetails(err, 'audio-setup'));
      return micSnapshot();
    }
  }, failCapture);
  pendingRequest = request;
  const clearPending = () => { if (pendingRequest === request) pendingRequest = null; };
  void request.then(clearPending, clearPending);
  return request;
}

const clampLevel = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function micMeasurement() {
  if (testLevel != null) {
    if (testLevel && typeof testLevel === 'object') {
      const rms = clampLevel(testLevel.rms);
      const peak = Math.max(rms, clampLevel(testLevel.peak));
      return {
        rms, peak, clipped: !!testLevel.clipped || peak >= .985,
        ...(Array.isArray(testLevel.spectrum) ? { spectrum: [...testLevel.spectrum] } : {}),
      };
    }
    const rms = clampLevel(testLevel);
    return { rms, peak: rms, clipped: rms >= .985 };
  }
  if (state !== 'on' || !analyser || !data) return { rms: 0, peak: 0, clipped: false };
  analyser.getFloatTimeDomainData(data);
  const rms = micRms(data);
  const peak = micPeak(data);
  const spectrum = micSpectrum(analyser, frequencyData);
  return { rms, peak, clipped: peak >= .985, ...(spectrum ? { spectrum } : {}) };
}

function micSpectrum(node, bins, bands = 8) {
  if (!node || !bins || typeof node.getFloatFrequencyData !== 'function') return null;
  node.getFloatFrequencyData(bins);
  const out = new Array(bands).fill(0);
  const maxBin = bins.length;
  for (let band = 0; band < bands; band++) {
    const low = Math.max(1, Math.floor(Math.pow(maxBin, band / bands)));
    const high = Math.max(low + 1, Math.floor(Math.pow(maxBin, (band + 1) / bands)));
    let power = 0;
    let count = 0;
    for (let index = low; index < Math.min(maxBin, high); index++) {
      const db = Number(bins[index]);
      if (!Number.isFinite(db)) continue;
      const amplitude = Math.pow(10, db / 20);
      power += amplitude * amplitude;
      count++;
    }
    out[band] = count ? Math.sqrt(power / count) : 0;
  }
  return out;
}


export function micSetSelfAudioProvider(provider = null) {
  selfAudioProvider = typeof provider === 'function' ? provider : null;
}

export function micSelfAudioMask(now = performance.now()) {
  try {
    return selfAudioProvider?.(now) || {
      active: false,
      rms: 0,
      peak: 0,
      db: -96,
      count: 0,
      latencyMs: 0,
      maskGain: 1,
    };
  } catch (_) {
    return {
      active: false,
      rms: 0,
      peak: 0,
      db: -96,
      count: 0,
      latencyMs: 0,
      maskGain: 1,
    };
  }
}

export function micEffectiveMeasurement(now = performance.now()) {
  return effectiveMicMeasurement(micMeasurement(), micSelfAudioMask(now));
}

export function micEffectiveLevel(now = performance.now()) {
  return micEffectiveMeasurement(now).effective.rms;
}

// Current loudness of the real room, RMS 0..1. A quiet room is ~0.005; talking
// is ~0.05–0.15; a shout is past 0.3.
export function micLevel() { return micMeasurement().rms; }

export function micRms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export function micPeak(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}

// Known transport sounds remain visible on both meters, but cannot invalidate
// the take. The real room is still analysed throughout this narrow guard.
export function micIgnoreSpoilFor(ms = 1200) {
  spoilMutedUntil = Math.max(spoilMutedUntil, performance.now() + Math.max(0, Number(ms) || 0));
}
export function micMaySpoil(now = performance.now()) { return now >= spoilMutedUntil; }

// Headless suites cannot grant a mic, so they inject a level instead. It is
// authoritative (see micActive): a real getUserMedia rejection cannot clear it.
export function micTest(level) {
  const next = level == null ? null : level;
  if ((next == null) !== (testLevel == null)) displayMeter.reset();
  testLevel = next;
  testMeterRevision += 1;
  testMeterQuantum = null;
  if (meterSession) { meterSession.lastQuantum = null; meterSession.latest = null; }
}

export function micStop() {
  requestGeneration++;
  pendingRequest = null;
  stopStream('idle');
  spoilMutedUntil = 0;
}
