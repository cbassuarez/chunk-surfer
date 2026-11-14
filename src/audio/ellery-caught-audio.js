import { assetUrl } from '../platform/paths.js';

// Reuse the game's credited mono recordings. Trim from the recorded onset so
// the dry contact coincides with the picture and contains no earlier rattle.
const FOLEY = Object.freeze({
  room: { path: 'audio/doors/glazed-close-01.wav', offset: .006, rate: .92, duration: .19, cutoff: 2900, gain: .49 },
  hands: { path: 'assets/audio/outskirts/fold-cloth-a.wav', offset: .285, rate: 1.06, duration: .14, cutoff: 3400, gain: .92 },
  apparition: { path: 'audio/doors/timber-close-01.wav', offset: .084, rate: .83, duration: .21, cutoff: 2200, gain: .48 },
});
const prewarmed = new WeakMap();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Decoding is preparation only. A sample that misses the cut is silent for
// this catch. A late decode cannot play while the game restores or after exit.
export function prewarmElleryCaughtAudio(context, fetchImpl = (...args) => fetch(...args)) {
  if (!context?.decodeAudioData) return Promise.resolve(false);
  let cache = prewarmed.get(context);
  if (cache) return cache.ready;
  cache = { samples: new Map(), ready: null };
  prewarmed.set(context, cache);
  cache.ready = Promise.all(Object.values(FOLEY).map(async spec => {
    try {
      const response = await fetchImpl(assetUrl(spec.path));
      if (!response?.ok) return false;
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      if (decoded.duration <= spec.offset + spec.duration * spec.rate) return false;
      cache.samples.set(spec.path, decoded);
      return true;
    } catch (_) { return false; }
  })).then(results => results.every(Boolean));
  return cache.ready;
}

export function createElleryCaughtAudio({ context, destination, kind = 'room', bearing = 0, softened = false, muted = false } = {}) {
  if (muted || !context || !destination || context.state !== 'running') return null;
  const spec = FOLEY[kind] ?? FOLEY.room;
  const buffer = prewarmed.get(context)?.samples.get(spec.path);
  if (!buffer) return null;
  const now = context.currentTime;
  const source = context.createBufferSource(), lowpass = context.createBiquadFilter(), gain = context.createGain();
  const pan = context.createStereoPanner?.();
  let ended = false, stopping = false;
  const release = () => {
    ended = true;
    for (const node of [source, lowpass, gain, pan]) node?.disconnect();
  };
  source.buffer = buffer;
  source.playbackRate.value = spec.rate;
  lowpass.type = 'lowpass';
  lowpass.frequency.value = softened ? Math.min(spec.cutoff, 1750) : spec.cutoff;
  lowpass.Q.value = .5;
  const peak = spec.gain * (softened ? .59 : 1);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + (softened ? .013 : .005));
  gain.gain.linearRampToValueAtTime(peak * .48, now + spec.duration * .58);
  gain.gain.linearRampToValueAtTime(0, now + spec.duration);
  source.connect(lowpass); lowpass.connect(gain);
  if (pan) {
    pan.pan.value = clamp(Math.sin(Number.isFinite(bearing) ? bearing : 0) * .68, -.68, .68);
    gain.connect(pan); pan.connect(destination);
  } else gain.connect(destination);
  source.onended = release;
  try {
    source.start(now, spec.offset, spec.duration * spec.rate);
  } catch (_) { release(); return null; }
  return {
    get ended() { return ended; },
    stop() {
      if (ended || stopping) return;
      stopping = true;
      const at = context.currentTime;
      if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(at);
      else {
        const value = gain.gain.value;
        gain.gain.cancelScheduledValues(at);
        gain.gain.setValueAtTime(value, at);
      }
      gain.gain.linearRampToValueAtTime(0, at + .014);
      try { source.stop(at + .015); }
      catch (_) { if (!ended) release(); }
    },
  };
}
