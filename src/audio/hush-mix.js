// Player-facing HUSH audio. The graph only transforms presentation; gameplay
// hearing is handled by semantic acoustic events and never by these nodes.

const FILES = Object.freeze({
  hush: '/labs/chunk-surfer/audio/hush.mp3',
  scream: '/labs/chunk-surfer/audio/radio_breaks-scream.mp3',
  equipment: '/labs/chunk-surfer/audio/recorder.mp3',
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

function safeRamp(param, value, ctx, seconds = .1) {
  if (!param || !ctx) return;
  const now = ctx.currentTime;
  const target = Number.isFinite(value) ? value : param.value;
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(Number.isFinite(param.value) ? param.value : target, now);
    param.linearRampToValueAtTime(target, now + Math.max(.015, seconds));
  } catch (_) {
    try { param.value = target; } catch (_) {}
  }
}

function noiseBuffer(ctx, seconds = 2.4) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = last * .72 + white * .28;
    data[i] = (white * .74 + last * .26) * .46;
  }
  return buffer;
}

export function hushMixTargets(field, settings = {}, { monitorGain = 1, monitorOpen = false } = {}) {
  const audio = clamp01(field?.presentation?.audio ?? field?.absorption?.audio ?? 0);
  const monitor = clamp01(field?.presentation?.monitor ?? field?.absorption?.monitor ?? 0);
  const hissScale = clamp01(field?.presentation?.hiss ?? (settings.hushHiss === 'reduced' ? .48 : 1));
  const softened = field?.presentation?.softenCuts ?? settings.hushSuddenCuts === 'softened';
  const monitorPresence = clamp01(monitorGain) * (monitorOpen ? 1 : .52);
  return {
    worldGain: lerp(1, softened ? .32 : .10, Math.pow(audio, 1.30)),
    worldLowpassHz: lerp(19000, softened ? 1250 : 620, Math.pow(audio, 1.08)),
    directGain: lerp(1, softened ? .42 : .16, Math.pow(audio, 1.45)),
    directLowpassHz: lerp(19000, softened ? 1700 : 820, Math.pow(audio, 1.1)),
    monitorGain: monitorPresence,
    monitorDryGain: monitorPresence * lerp(1, softened ? .20 : .035, Math.pow(monitor, 1.20)),
    monitorLowpassHz: lerp(16000, softened ? 1100 : 480, Math.pow(monitor, 1.02)),
    hissGain: monitorPresence * hissScale * Math.max(0, (monitor - .16) / .84) * .27,
    residueGain: monitorPresence * Math.max(0, (monitor - .64) / .36) * .14,
    fieldAmount: Math.max(audio, monitor),
  };
}

export function createHushMix(ctx, { worldDestination = null, directDestination = null } = {}) {
  if (!ctx) return null;
  // Long-running chunk voices can represent either the world or the recorder's
  // monitor program. Route them through one input and crossfade destinations;
  // never duplicate the source or reconnect live AudioNodes during play.
  const programInput = ctx.createGain();
  const programWorld = ctx.createGain();
  const programMonitor = ctx.createGain();
  programWorld.gain.value = 1;
  programMonitor.gain.value = 0;

  const worldInput = ctx.createGain();
  const worldLowpass = ctx.createBiquadFilter();
  worldLowpass.type = 'lowpass';
  worldLowpass.frequency.value = 19000;
  const worldGain = ctx.createGain();
  worldGain.gain.value = 1;
  worldInput.connect(worldLowpass);
  worldLowpass.connect(worldGain);
  if (worldDestination) worldGain.connect(worldDestination);

  const directInput = ctx.createGain();
  const directLowpass = ctx.createBiquadFilter();
  directLowpass.type = 'lowpass';
  directLowpass.frequency.value = 19000;
  const directGain = ctx.createGain();
  directGain.gain.value = 1;
  directInput.connect(directLowpass);
  directLowpass.connect(directGain);
  if (directDestination) directGain.connect(directDestination);

  const monitorInput = ctx.createGain();
  const monitorLowpass = ctx.createBiquadFilter();
  monitorLowpass.type = 'lowpass';
  monitorLowpass.frequency.value = 16000;
  const monitorDry = ctx.createGain();
  monitorDry.gain.value = .52;
  monitorInput.connect(monitorLowpass);
  monitorLowpass.connect(monitorDry);
  if (directDestination) monitorDry.connect(directDestination);

  programInput.connect(programWorld);
  programWorld.connect(worldInput);
  programInput.connect(programMonitor);
  programMonitor.connect(monitorInput);

  const hissSource = ctx.createBufferSource();
  hissSource.buffer = noiseBuffer(ctx);
  hissSource.loop = true;
  const hissHighpass = ctx.createBiquadFilter();
  hissHighpass.type = 'highpass';
  hissHighpass.frequency.value = 1100;
  const hissLowpass = ctx.createBiquadFilter();
  hissLowpass.type = 'lowpass';
  hissLowpass.frequency.value = 7200;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0;
  hissSource.connect(hissHighpass);
  hissHighpass.connect(hissLowpass);
  hissLowpass.connect(hissGain);
  if (directDestination) hissGain.connect(directDestination);
  try { hissSource.start(); } catch (_) {}

  const buffers = new Map();
  const pending = new Map();
  let lastResidueAt = -1e12;
  let lastTargets = hushMixTargets(null, {}, {});
  let programMode = 'world';

  async function preload(url) {
    if (!url || buffers.has(url)) return buffers.get(url) || null;
    if (pending.has(url)) return pending.get(url);
    const job = fetch(url)
      .then((response) => { if (!response.ok) throw new Error(`${response.status} ${url}`); return response.arrayBuffer(); })
      .then((array) => ctx.decodeAudioData(array))
      .then((buffer) => { buffers.set(url, buffer); pending.delete(url); return buffer; })
      .catch((error) => { console.warn('[hush mix] load failed', url, error); pending.delete(url); return null; });
    pending.set(url, job);
    return job;
  }

  function applyField(field, settings = {}, options = {}) {
    const targets = hushMixTargets(field, settings, options);
    const previousAmount = lastTargets?.fieldAmount || 0;
    const attack = targets.fieldAmount > previousAmount ? .07 : .30;
    lastTargets = targets;
    safeRamp(worldGain.gain, targets.worldGain, ctx, attack);
    safeRamp(worldLowpass.frequency, targets.worldLowpassHz, ctx, .11);
    safeRamp(directGain.gain, targets.directGain, ctx, attack);
    safeRamp(directLowpass.frequency, targets.directLowpassHz, ctx, .11);
    safeRamp(monitorDry.gain, targets.monitorDryGain, ctx, .08);
    safeRamp(monitorLowpass.frequency, targets.monitorLowpassHz, ctx, .09);
    safeRamp(hissGain.gain, targets.hissGain, ctx, .12);
    return targets;
  }

  function setProgramMode(mode = 'world') {
    const monitor = mode === 'monitor';
    programMode = monitor ? 'monitor' : 'world';
    safeRamp(programWorld.gain, monitor ? 0 : 1, ctx, .09);
    safeRamp(programMonitor.gain, monitor ? 1 : 0, ctx, .09);
  }

  function playBuffer(url, { destination = 'monitor', gain = .2, rate = 1, pan = 0, offset = 0, duration = null, reverse = false } = {}) {
    const original = buffers.get(url);
    if (!original) { preload(url); return false; }
    let buffer = original;
    if (reverse) {
      buffer = ctx.createBuffer(original.numberOfChannels, original.length, original.sampleRate);
      for (let c = 0; c < original.numberOfChannels; c++) {
        const src = original.getChannelData(c), dst = buffer.getChannelData(c);
        for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
      }
    }
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.setValueAtTime(.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), now + .018);
    const maxDur = Math.max(.04, buffer.duration - Math.max(0, offset));
    const dur = Math.min(maxDur, duration == null ? maxDur : duration);
    env.gain.exponentialRampToValueAtTime(.0001, now + Math.max(.05, dur));
    let node = env;
    let panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      env.connect(panner);
      node = panner;
    }
    src.connect(env);
    node.connect(destination === 'world' ? directInput : monitorInput);
    try { src.start(now, Math.max(0, offset), dur); src.stop(now + dur + .04); } catch (_) { return false; }
    src.onended = () => { try { src.disconnect(); env.disconnect(); panner?.disconnect(); } catch (_) {} };
    return true;
  }

  function instrument({ gain = .2, pan = 0, pitch = 1 } = {}) {
    const now = ctx.currentTime;
    const fundamental = 174.61 * Math.max(.65, Math.min(1.3, pitch));
    const out = ctx.createGain();
    out.gain.setValueAtTime(.0001, now);
    out.gain.exponentialRampToValueAtTime(gain, now + .008);
    out.gain.exponentialRampToValueAtTime(.0001, now + 1.6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = fundamental * 2.05;
    filter.Q.value = 1.2;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = pan;
    for (const [ratio, amp] of [[1, 1], [2.01, .28], [3.96, .12]]) {
      const osc = ctx.createOscillator();
      osc.type = ratio === 1 ? 'sine' : 'triangle';
      osc.frequency.value = fundamental * ratio;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g); g.connect(filter);
      osc.start(now); osc.stop(now + 1.65);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (_) {} };
    }
    filter.connect(out);
    if (panner) { out.connect(panner); panner.connect(directInput); }
    else out.connect(directInput);
    setTimeout(() => { try { filter.disconnect(); out.disconnect(); panner?.disconnect(); } catch (_) {} }, 1900);
  }

  function negativePulse(intensity = .5) {
    const amount = clamp01(intensity);
    const now = ctx.currentTime;
    const current = worldGain.gain.value;
    try {
      worldGain.gain.cancelScheduledValues(now);
      worldGain.gain.setValueAtTime(current, now);
      worldGain.gain.linearRampToValueAtTime(Math.max(.04, current * (1 - amount * .78)), now + .045);
      worldGain.gain.linearRampToValueAtTime(lastTargets.worldGain, now + .36);
    } catch (_) {}
  }

  function playMischief(cue, { intensity = .5, pan = 0, random = Math.random } = {}) {
    if (!cue) return false;
    const range = cue.audio?.pitchRange || [1, 1];
    const rate = finite(range[0], 1) + random() * Math.max(0, finite(range[1], 1) - finite(range[0], 1));
    const gain = finite(cue.audio?.gain, .18) * (.72 + clamp01(intensity) * .48);
    switch (cue.audio?.sound) {
      case 'instrument': instrument({ gain, pan, pitch: rate }); return true;
      case 'equipment': return playBuffer(FILES.equipment, { destination: cue.delivery === 'monitor' ? 'monitor' : 'world', gain, rate, pan, duration: .42 });
      case 'negative': negativePulse(intensity); return true;
      case 'hush-fragment': {
        const url = random() < .35 ? FILES.scream : FILES.hush;
        const buffer = buffers.get(url);
        const offset = buffer ? random() * Math.max(0, buffer.duration - .32) : 0;
        return playBuffer(url, { destination: 'monitor', gain, rate, pan: 0, offset, duration: .18 + random() * .24, reverse: random() < .45 });
      }
      default: return false;
    }
  }

  function maybeResidue(field, { random = Math.random } = {}) {
    const strength = clamp01(field?.presentation?.monitor ?? field?.absorption?.monitor ?? 0);
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (strength < .68 || nowMs - lastResidueAt < 16000) return false;
    const chance = Math.pow(strength, 3) * .018;
    if (random() >= chance) return false;
    lastResidueAt = nowMs;
    const buffer = buffers.get(FILES.scream);
    const offset = buffer ? random() * Math.max(0, buffer.duration - .28) : 0;
    return playBuffer(FILES.scream, { destination: 'monitor', gain: .08 + strength * .06, rate: .62 + random() * .22, offset, duration: .12 + random() * .16, reverse: true });
  }

  Promise.all(Object.values(FILES).map(preload));

  return {
    programInput,
    worldInput,
    directInput,
    monitorInput,
    setProgramMode,
    applyField,
    playMischief,
    maybeResidue,
    preloadAll: () => Promise.all(Object.values(FILES).map(preload)),
    snapshot: () => ({ ...lastTargets, programMode, loaded: [...buffers.keys()] }),
    reset() { applyField(null, {}, { monitorGain: 1, monitorOpen: false }); },
    destroy() {
      try { hissSource.stop(); } catch (_) {}
      for (const node of [programInput, programWorld, programMonitor, worldInput, worldLowpass, worldGain, directInput, directLowpass, directGain, monitorInput, monitorLowpass, monitorDry, hissSource, hissHighpass, hissLowpass, hissGain]) {
        try { node.disconnect(); } catch (_) {}
      }
    },
  };
}
