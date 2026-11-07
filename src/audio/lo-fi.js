// The keepsake's lo-fi tail. The game already wears its recordings down to a
// rough, low-bit texture (see source-rest-affliction.js). This music box is
// delivered the same way: amplitude-quantised to 8-12 bits and sample-and-held
// down to 20-32 kHz, the "Redux" character the rest of the game shares.
// Pure and deterministic: it transforms a Float32Array, so it is testable and
// reusable offline (overture render) and live (the hands UI's Web Audio graph).

export const LO_FI_DEFAULTS = Object.freeze({ bits: 10, targetRate: 24000 });

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));

// Quantise amplitude to `bits` bits. 8 bits -> 127 steps each side of zero;
// 12 bits -> 2047. Symmetric around zero, no DC step, so silence stays silent.
export function bitcrush(input, bits = LO_FI_DEFAULTS.bits) {
  const steps = 2 ** (clamp(Math.round(bits), 2, 24) - 1) - 1;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = Math.round(input[i] * steps) / steps;
  return out;
}

// Sample-and-hold: repeat each incoming sample `factor` times, reducing the
// effective sample rate to sourceRate / factor with the characteristic crunch.
export function sampleAndHold(input, factor = 1) {
  const hold = Math.max(1, Math.round(factor));
  if (hold === 1) return new Float32Array(input);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[Math.floor(i / hold) * hold];
  return out;
}

// Both, in the order a bitcrusher applies them: crush, then drop the rate.
export function loFi(input, { bits = LO_FI_DEFAULTS.bits, sampleRate = 44100, targetRate = LO_FI_DEFAULTS.targetRate } = {}) {
  const hold = sampleRate && targetRate ? Math.max(1, Math.round(sampleRate / Math.max(1, targetRate))) : 1;
  return sampleAndHold(bitcrush(input, bits), hold);
}
