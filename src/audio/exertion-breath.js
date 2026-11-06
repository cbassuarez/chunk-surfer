// HIS BREATH AFTER A SPRINT. The only readout the sprint has (game/locomotion.js):
// no bar, no number — when the reserve is being spent you start to hear him,
// and when it is gone he is labouring and the legs drop him to a run.
//
// Synthesised from filtered noise: an inhale high and thin through the teeth,
// an exhale lower and wider through the mouth, the cycle quickening as he
// labours. It is a placeholder for a recorded breath set — there is no breath
// recording in the game's assets — and it is deliberately quiet, under the
// footsteps, because it is his body and not the room.
//
// Presentation only. It is not a world noise, never reaches the HUSH or the
// take, and does nothing the player has to react to.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export const EXERTION_BREATH = Object.freeze({
  audibleFrom: 0.05,
  // Seconds per in/out cycle, from barely spent to labouring.
  slowCycle: 1.9,
  fastCycle: 0.92,
  peakGain: 0.085,
  inhaleHz: 1750,
  exhaleHz: 880,
  lookAhead: 0.12,
});

export function exertionCycleSeconds(exertion) {
  const e = clamp(exertion, 0, 1);
  return EXERTION_BREATH.slowCycle + (EXERTION_BREATH.fastCycle - EXERTION_BREATH.slowCycle) * e;
}

export function exertionGain(exertion) {
  const e = clamp(exertion, 0, 1);
  return e <= EXERTION_BREATH.audibleFrom ? 0 : EXERTION_BREATH.peakGain * Math.pow(e, 1.3);
}

export function createExertionBreath({ getAudio = () => null, random = Math.random } = {}) {
  let noise = null, noiseCtx = null, out = null, outCtx = null;
  let nextAt = 0, cycles = 0, exertion = 0;

  function ensure(ctx, destination) {
    if (noiseCtx !== ctx) {
      const length = Math.floor(ctx.sampleRate * 2);
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      // Pink-ish: breath has more body than white noise.
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < length; i++) {
        const w = random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      }
      noiseCtx = ctx;
    }
    if (outCtx !== ctx) {
      out = ctx.createGain();
      out.gain.value = 1;
      out.connect(destination);
      outCtx = ctx;
    }
  }

  function puff(ctx, at, { hz, q, seconds, gain, attack }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + random() * 0.2;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = hz * (0.92 + random() * 0.16); band.Q.value = q;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass'; soften.frequency.value = hz * 2.4; soften.Q.value = 0.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(gain, at + attack);
    env.gain.setValueAtTime(gain, at + seconds * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(band); band.connect(soften); soften.connect(env); env.connect(out);
    src.start(at, random() * 1.2, seconds + 0.05);
    src.stop(at + seconds + 0.06);
  }

  function breathe(ctx, at, level, period) {
    const inhale = Math.min(0.42, period * 0.36), exhale = Math.min(0.62, period * 0.5);
    puff(ctx, at, { hz: EXERTION_BREATH.inhaleHz, q: 1.1, seconds: inhale, gain: level * 0.55, attack: inhale * 0.45 });
    puff(ctx, at + inhale + period * 0.04, { hz: EXERTION_BREATH.exhaleHz, q: 0.8, seconds: exhale, gain: level, attack: 0.05 });
  }

  return {
    update({ exertion: next = 0, paused = false } = {}) {
      exertion = clamp(next, 0, 1);
      const audio = getAudio();
      if (!audio?.ctx || !audio.destination || paused || audio.ctx.state !== 'running') { nextAt = 0; return; }
      const level = exertionGain(exertion);
      if (level <= 0) { nextAt = 0; return; }
      const ctx = audio.ctx;
      ensure(ctx, audio.destination);
      const now = ctx.currentTime;
      if (nextAt < now) nextAt = now + 0.05;
      if (nextAt > now + EXERTION_BREATH.lookAhead) return;
      const period = exertionCycleSeconds(exertion) * (0.93 + random() * 0.14);
      breathe(ctx, nextAt, level, period);
      cycles++;
      nextAt += period;
    },
    snapshot() { return { exertion, gain: exertionGain(exertion), cycles, nextAt }; },
  };
}
