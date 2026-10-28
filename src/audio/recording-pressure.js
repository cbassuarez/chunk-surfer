// The take-up mechanism answers a noise, strains, resists STOP, then releases.
// Live presentation and the saved tape use these exact rendered samples. This
// module only renders sound; it never reports player noise or changes a take.
const CUES = Object.freeze({
  'recording.answer': Object.freeze({ id: 'recording.answer', durationSeconds: 1.1, seed: 0x414e5357 }),
  'recording.drag': Object.freeze({ id: 'recording.drag', durationSeconds: 2.4, seed: 0x44524147 }),
  'recording.brake': Object.freeze({ id: 'recording.brake', durationSeconds: .48, seed: 0x4252414b }),
  'recording.release': Object.freeze({ id: 'recording.release', durationSeconds: .72, seed: 0x52454c53 }),
});
export const RECORDING_PRESSURE_AUDIO_PROVENANCE = Object.freeze({
  kind: 'authored-procedural-pcm', revision: 1,
  material: 'Dry take-up motor, slipping drive and brake; no voice or sampled performance.',
});
const buffers = new WeakMap();
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = value => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };

export function recordingPressureCue(cueId) { return Object.hasOwn(CUES, cueId) ? CUES[cueId] : null; }

// An exported PCM master also permits offline level/spectrum inspection without
// a second approximation of the live renderer. All frequencies stay well below
// Nyquist at the supported rates; the noise is low-passed twice before mixing.
export function renderRecordingPressurePCM(cueId, { sampleRate = 48000 } = {}) {
  const cue = recordingPressureCue(cueId);
  if (!cue) return null;
  const rate = Math.round(clamp(finite(sampleRate, 48000), 8000, 192000));
  const samples = new Float32Array(Math.ceil(rate * cue.durationSeconds));
  const pole = 1 - Math.exp(-2 * Math.PI * 2100 / rate);
  let seed = cue.seed, low = 0, filtered = 0, motorPhase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, p = t / cue.durationSeconds;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    low += (white - low) * pole;
    filtered += (low - filtered) * pole;
    let frequency = 88, strength = 0, grit = 0, catches = [];
    if (cueId === 'recording.answer') {
      frequency = 79 + 18 * smooth(p * 2) - p * 11;
      strength = .050 * Math.sin(Math.PI * p) ** 1.5;
      grit = .020 * Math.exp(-t * 3);
      catches = [.065, .235];
    } else if (cueId === 'recording.drag') {
      frequency = 96 - p * 23 + Math.sin(t * 2 * Math.PI * 2.1) * 3.5;
      const strain = .45 + .55 * Math.sin(Math.PI * (t * 1.35 + .12)) ** 2;
      strength = .064 * strain;
      grit = .030 * strain;
      catches = [.12, .86, 1.61];
    } else if (cueId === 'recording.brake') {
      frequency = 131 - 83 * smooth(p);
      strength = .077 * (1 - p) ** .7;
      grit = .036 * (1 - p);
      catches = [.025, .175];
    } else {
      frequency = 104 - p * 63;
      strength = .043 * Math.exp(-p * 3);
      grit = .014 * Math.exp(-p * 5);
      catches = [.025, .105, .23];
    }
    motorPhase += 2 * Math.PI * frequency / rate;
    const motor = Math.sin(motorPhase) + Math.sin(motorPhase * 2.01) * .32
      + Math.sin(motorPhase * 4.03) * .12;
    let sound = motor * strength + filtered * grit;
    // Short padded transients suggest a physical clutch rather than a digital
    // click. The pulse attack is finite and the global edges settle at zero.
    for (const at of catches) {
      const age = t - at;
      if (age < 0 || age > .11) continue;
      const attack = smooth(age / .004);
      sound += (Math.sin(age * 2 * Math.PI * 670) * .056 + filtered * .068)
        * attack * Math.exp(-age * 47);
    }
    const edge = smooth(t / .014) * smooth((samples.length - 1 - i) / (rate * .045));
    samples[i] = sound * edge;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > .21) for (let i = 0; i < samples.length; i++) samples[i] *= .21 / peak;
  samples[0] = samples[samples.length - 1] = 0;
  return { sampleRate: rate, durationSeconds: samples.length / rate, channels: [samples],
    provenance: RECORDING_PRESSURE_AUDIO_PROVENANCE };
}

function recordingPressureBuffer(context, cueId) {
  if (!context?.createBuffer) return null;
  let cache = buffers.get(context);
  if (!cache) { cache = new Map(); buffers.set(context, cache); }
  if (cache.has(cueId)) return cache.get(cueId);
  const pcm = renderRecordingPressurePCM(cueId, { sampleRate: context.sampleRate });
  if (!pcm) return null;
  const buffer = context.createBuffer(1, pcm.channels[0].length, pcm.sampleRate);
  buffer.getChannelData(0).set(pcm.channels[0]);
  cache.set(cueId, buffer);
  return buffer;
}

export function playRecordingPressure({ context, destination, cueId, when, gain = 1, pan = 0, reducedDread = false } = {}) {
  if (!context?.createBufferSource || !context.createGain || !destination) return null;
  const buffer = recordingPressureBuffer(context, cueId);
  if (!buffer) return null;
  const source = context.createBufferSource(), out = context.createGain();
  const panner = context.createStereoPanner?.() || null;
  const now = finite(context.currentTime, 0);
  const startedAt = Math.max(now, finite(when, now));
  const durationSeconds = buffer.duration || buffer.length / buffer.sampleRate;
  source.buffer = buffer; source.loop = false;
  out.gain.value = clamp(finite(gain, 1), 0, 1) * (reducedDread ? .65 : 1);
  source.connect(out);
  if (panner) { panner.pan.value = clamp(finite(pan, 0), -1, 1); out.connect(panner); panner.connect(destination); }
  else out.connect(destination);
  let ended = false, stopping = false;
  const cleanup = () => {
    if (ended) return;
    ended = true; source.onended = null;
    for (const node of [source, out, panner]) { try { node?.disconnect(); } catch {} }
  };
  const stop = () => {
    if (ended || stopping) return;
    stopping = true;
    const now = finite(context.currentTime, 0);
    if (now < startedAt) {
      try { source.stop(now); } catch {}
      cleanup();
      return;
    }
    // A very short release prevents cancelling a live cue from adding a click.
    // Scheduled future cues are disconnected immediately in the branch above.
    try {
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + .012);
      source.stop(now + .014);
    } catch { try { source.stop(); } catch {} cleanup(); }
  };
  source.onended = cleanup;
  try { source.start(startedAt); }
  catch { cleanup(); return null; }
  return { source, out, panner, nodes: [source, out, ...(panner ? [panner] : [])],
    startedAt, endsAt: startedAt + durationSeconds, durationSeconds, cueId,
    get ended() { return ended; }, stop, provenance: RECORDING_PRESSURE_AUDIO_PROVENANCE };
}
