// Baked ear-room grain. The held branch is clocked independently of the file
// sample rate: 24 kHz at 44.1 kHz cannot be represented by an integer skip.
export const STOP_LISTENING_CRUSH = Object.freeze({
  gut: Object.freeze({ bits: 9, rate: 24000, mix: 0.86 }),
  wet: Object.freeze({ bits: 8, rate: 22050, mix: 0.80 }),
  bed: Object.freeze({ bits: 10, rate: 32000, mix: 0.68 }),
});

export function rmsOf(samples) {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export function bitcrush(samples, sampleRate, { bits, rate, mix }) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(bits) || bits < 2 || bits > 24
    || !Number.isFinite(rate) || rate <= 0 || rate > sampleRate || !Number.isFinite(mix) || mix < 0 || mix > 1) {
    throw new RangeError('Invalid bitcrush clock, signed bit depth or mix');
  }
  const out = new Float32Array(samples.length);
  const q = 2 ** (bits - 1), increment = rate / sampleRate;
  let phase = 1, held = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw new TypeError(`Non-finite audio sample ${i}`);
    if (phase >= 1) {
      // The new clock tick can fall between file samples. Interpolate its
      // actual value, quantise to signed PCM, then hold until the next tick.
      const fractionBehind = (phase - 1) / increment;
      const captured = i ? samples[i] + (samples[i - 1] - samples[i]) * fractionBehind : samples[0];
      held = Math.max(-q, Math.min(q - 1, Math.round(captured * q))) / q;
      phase -= 1;
    }
    out[i] = samples[i] * (1 - mix) + held * mix;
    phase += increment;
  }
  return out;
}

// Match the supplied reference RMS. Grain must earn its effect without a volume
// increase. A common -3 dBFS ceiling protects the bank's existing headroom.
export function levelMatch(samples, reference, peakDb = -3) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const gain = Math.min(rmsOf(reference) / Math.max(1e-12, rmsOf(samples)),
    10 ** (peakDb / 20) / Math.max(1e-12, peak));
  return samples.map((value) => value * gain);
}

export function signalStats(samples) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  return { samples: samples.length, rmsDb: 20 * Math.log10(Math.max(1e-12, rmsOf(samples))),
    peakDb: 20 * Math.log10(Math.max(1e-12, peak)), finite: samples.every(Number.isFinite) };
}
