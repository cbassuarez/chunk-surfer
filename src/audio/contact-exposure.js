// Last Exposure's contact voice. This is a bounded edit of the existing
// processed HUSH recording, not a new body recording or a measured room IR.
// The direct impact which spoils a rolling take remains with its current owner.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function contactExposurePlan({
  pan, bearing = 0, intensity = 1, reduced = false, physical = true,
  protectedAudio = false, muted = false, duration = .72,
} = {}) {
  const strength = clamp(finite(intensity, 1), 0, 1);
  const seconds = clamp(finite(duration, .72), .12, .72);
  // bearing is the real source angle relative to the listener, in radians.
  // Stereo pan expresses lateral bearing; it does not claim rear localization.
  const lateral = pan == null ? Math.sin(finite(bearing, 0)) : finite(pan, 0);
  return Object.freeze({
    allowed: !muted && !(protectedAudio && !physical),
    physical: !!physical,
    pan: clamp(lateral, -1, 1),
    rate: 1,
    peak: (.12 + strength * .42) * (reduced ? .65 : 1),
    cutoffHz: Math.min(reduced ? 3500 : 6900, 900 + strength * 6000),
    attackSeconds: .008,
    directEndSeconds: Math.min(.38, seconds * .60),
    duration: seconds,
    startDeadlineSeconds: .05,
  });
}

const disconnect = node => { try { node?.disconnect(); } catch (_) {} };
const defaultClock = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;

// Injecting the current context/destination/buffer keeps decode cancellation
// testable without a browser or a second audio implementation.
export function createContactExposurePlayer({
  getContext, getDestination, getBuffer, loadBuffer, nowSeconds = defaultClock,
} = {}) {
  let current = null, generation = 0;
  const recent = new Map();

  function play(options = {}) {
    const eventId = options.eventId;
    if (typeof eventId !== 'string' || !eventId.trim())
      throw new Error('A contact exposure needs its authoritative event identity.');
    // A render/update or quiet re-entry may refer to the same event again. It
    // must never replay the attack, even after a previous voice was cancelled.
    if (recent.has(eventId)) return recent.get(eventId);
    current?.cancel({ fade: 0 });
    const token = ++generation, plan = contactExposurePlan(options);
    const context = getContext?.(), destination = getDestination?.();
    const startedClock = nowSeconds(), startedAudio = context?.currentTime ?? 0;
    let state = 'pending', source = null, gain = null, filter = null, panner = null;
    let disconnected = false;
    const cleanup = () => {
      if (disconnected) return;
      disconnected = true;
      for (const node of [source, filter, gain, panner]) disconnect(node);
      if (current === owner) current = null;
    };
    const owner = Object.freeze({
      eventId, plan,
      get state() { return state; },
      get active() { return state === 'pending' || state === 'playing' || state === 'fading'; },
      cancel({ fade = .025 } = {}) {
        if (!owner.active || state === 'fading') return;
        if (current === owner) { current = null; generation++; }
        if (!source) { state = 'cancelled'; cleanup(); return; }
        const seconds = clamp(finite(fade, .025), 0, .06);
        state = seconds > 0 ? 'fading' : 'cancelled';
        const at = context.currentTime;
        try {
          if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(at);
          else gain.gain.cancelScheduledValues(at);
          if (seconds > 0) gain.gain.setTargetAtTime(0, at, seconds / 3);
          else gain.gain.setValueAtTime(0, at);
          source.stop(at + seconds);
        } catch (_) { state = 'cancelled'; cleanup(); }
        if (!seconds) cleanup();
      },
    });
    recent.set(eventId, owner);
    while (recent.size > 32) recent.delete(recent.keys().next().value);
    current = owner;

    if (!plan.allowed || !context || !destination ||
        (context.state && context.state !== 'running')) {
      state = plan.allowed ? 'unavailable' : 'protected'; cleanup(); return owner;
    }

    function start(buffer) {
      if (token !== generation || state !== 'pending' || current !== owner) return;
      if (getContext() !== context || getDestination() !== destination ||
          (context.state && context.state !== 'running') ||
          nowSeconds() - startedClock > plan.startDeadlineSeconds ||
          context.currentTime - startedAudio > plan.startDeadlineSeconds) {
        state = 'expired'; cleanup(); return;
      }
      if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
        state = 'unavailable'; cleanup(); return;
      }
      const at = context.currentTime, duration = Math.min(plan.duration, buffer.duration);
      try {
        source = context.createBufferSource(); source.buffer = buffer;
        source.playbackRate.setValueAtTime(plan.rate, at);
        filter = context.createBiquadFilter(); filter.type = 'lowpass';
        filter.frequency.setValueAtTime(plan.cutoffHz, at);
        gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(plan.peak, at + Math.min(plan.attackSeconds, duration / 4));
        gain.gain.linearRampToValueAtTime(plan.peak * .52, at + Math.min(.055, duration / 2));
        gain.gain.exponentialRampToValueAtTime(Math.max(.0001, plan.peak * .14), at + Math.min(plan.directEndSeconds, duration * .8));
        gain.gain.linearRampToValueAtTime(0, at + duration);
        panner = context.createStereoPanner(); panner.pan.setValueAtTime(plan.pan, at);
        source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(destination);
        source.onended = () => { state = state === 'fading' ? 'cancelled' : state === 'cancelled' ? state : 'ended'; cleanup(); };
        source.start(at, 0, duration); source.stop(at + duration + .005);
        state = 'playing';
      } catch (_) { state = 'unavailable'; try { source?.stop(); } catch (_) {} cleanup(); }
    }

    const buffer = getBuffer?.();
    if (buffer) start(buffer);
    else {
      try {
        Promise.resolve(loadBuffer?.()).then(start).catch(() => {
          if (token === generation && state === 'pending') { state = 'unavailable'; cleanup(); }
        });
      } catch (_) { state = 'unavailable'; cleanup(); }
    }
    return owner;
  }

  return Object.freeze({
    play,
    cancel(options) { current?.cancel(options); },
    get active() { return current?.active ?? false; },
  });
}
