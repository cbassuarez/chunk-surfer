// One dry, original impact. The host owns the context, output routing and
// encounter timing; this owner only connects its own short-lived voice.
const BODY_SECONDS = .12, METAL_SECONDS = .06, ATTACK_SECONDS = .006;
const BODY_LEVEL = .32, METAL_LEVEL = .08;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const envelope = (t, duration) => t >= duration ? 0
  : smooth(t / ATTACK_SECONDS) * Math.exp(-3.8 * t / duration) * (1 - smooth((t - duration + .02) / .02));

function makeImpactBuffer(context) {
  if (!context?.createBuffer || !Number.isFinite(context.sampleRate) || context.sampleRate <= 0) return null;
  // A pathological supplied rate must not turn a 120ms cue into an unbounded
  // allocation. Web Audio resamples this buffer into the host context normally.
  const rate = clamp(Math.round(context.sampleRate), 8000, 192000);
  const buffer = context.createBuffer(1, Math.ceil(rate * BODY_SECONDS) + 1, rate), data = buffer.getChannelData(0);
  const lowAlpha = 1 - Math.exp(-2 * Math.PI * 700 / rate), highAlpha = 1 - Math.exp(-2 * Math.PI * 1400 / rate);
  let seed = 0x42554d50, low = 0, high = 0, peak = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += lowAlpha * (noise - low); high += highAlpha * (noise - high);
    // Integral phases give a falling 170–110Hz body and a much quieter,
    // short 1400–700Hz buckle; there is no sustained ringing or sub-bass tail.
    const body = Math.sin(2 * Math.PI * (170 * t - 250 * t * t));
    const metal = .85 * Math.sin(2 * Math.PI * (1400 * t - 700 / (2 * METAL_SECONDS) * t * t)) + .15 * (high - low) / 2;
    data[i] = BODY_LEVEL * envelope(t, BODY_SECONDS) * body + METAL_LEVEL * envelope(t, METAL_SECONDS) * metal;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  return { buffer, peak };
}

export function createDriveBumperIntrusionAudio({ context, destination } = {}) {
  let master = null;
  try { if (destination && context?.createBufferSource && context?.createGain) master = makeImpactBuffer(context); } catch {}
  let paused = false, disposed = false, voice = null, playCalls = 0, plays = 0, cancellations = 0, endings = 0, lastStrength = 0, lastReducedMotion = false;
  function release(stop, reason) {
    const owned = voice;
    if (!owned) return;
    voice = null;
    owned.source.onended = null;
    if (stop) { try { owned.source.stop(); } catch {} cancellations++; }
    else if (reason === 'ended') endings++;
    try { owned.source.disconnect(); } catch {}
    try { owned.gain.disconnect(); } catch {}
  }
  function play({ strength = 1, reducedMotion = false } = {}) {
    playCalls++;
    const amount = Number.isFinite(strength) ? clamp(strength, 0, 1) : 0;
    if (disposed || paused || !master || !amount || (context.state && context.state !== 'running')) return false;
    // A duplicate host call cannot sum multiple impact peaks on the shared bus.
    release(true, 'retrigger');
    let source, gain;
    try {
      source = context.createBufferSource(); gain = context.createGain();
      source.buffer = master.buffer; source.loop = false;
      gain.gain.value = amount * (reducedMotion ? .55 : 1);
      source.connect(gain); gain.connect(destination);
      voice = { source, gain };
      source.onended = () => { if (voice?.source === source) release(false, 'ended'); };
      source.start(context.currentTime);
      plays++; lastStrength = amount; lastReducedMotion = !!reducedMotion;
      return true;
    } catch {
      if (voice?.source === source) release(true, 'failed');
      else { try { source?.disconnect(); } catch {} try { gain?.disconnect(); } catch {} }
      return false;
    }
  }
  function setPaused(value) { paused = !!value; if (paused) release(true, 'pause'); return paused; }
  function dispose() { if (disposed) return false; disposed = true; release(true, 'dispose'); master = null; return true; }
  function diagnostics() {
    return { ready: !!master, available: !!master, paused, disposed, playing: !!voice, activeSources: voice ? 1 : 0,
      bufferSeconds: master?.buffer.duration || 0, sampleRate: master?.buffer.sampleRate || 0, bufferPeak: master?.peak || 0,
      maximumGain: BODY_LEVEL + METAL_LEVEL, playCalls, plays, cancellations, endings, lastStrength, reducedMotion: lastReducedMotion,
      provenance: 'original deterministic procedural body thud and dry metal buckle; no recorded collision' };
  }
  return { play, setPaused, dispose, diagnostics };
}
