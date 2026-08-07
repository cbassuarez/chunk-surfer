// THE PEAK OF THE BED: THE SENTENCE STOPS BEING A SENTENCE.
//
// The whisper bed plays whole takes, faded up and down under a Hann window so
// nothing ever starts. That is right for a night that is mostly absent, and it
// has a ceiling: five overlapping takes is a room with people in it, and a room
// with people in it is somewhere you can be. The end of this should not be
// somewhere you can be.
//
// So the last third of the night grows a second layer made of the same thirteen
// recordings cut below the word — forty to a hundred and twenty milliseconds,
// which is a mouth shape and not a syllable. Enough of them, transposed apart
// and loosely pulsed, and the voice you have been half-hearing all night stops
// resolving into speech and becomes the surface of the room. It is Lansky's
// method in Idle Chatter, and it cannot be reached by raising a voice count:
// words stay words however many you stack. The grain size is the whole idea.
//
// This owns no buffers and no loading. It is handed the array the bed already
// decoded and it hangs off the bed's own output node, which is what gives it the
// pause-mute, the accessibility scale and the teardown for free.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// One raised cosine, sampled once. Every grain is scaled into it by
// setValueCurveAtTime, so a grain has no attack and no release — it has a shape.
// A linear ramp pair would put a corner at the top of forty milliseconds, which
// at this density is a click track.
const ENVELOPE_POINTS = 48;
const HANN = new Float32Array(ENVELOPE_POINTS);
for (let i = 0; i < ENVELOPE_POINTS; i++) {
  HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (ENVELOPE_POINTS - 1)));
}

export function createWhisperGrains(ctx, {
  destination = null,
  buffers = [],
  random = Math.random,
} = {}) {
  if (!ctx) return null;

  const output = ctx.createGain();
  output.gain.value = 1;
  if (destination) output.connect(destination);

  const live = new Set();
  let nextAt = 0;
  let elapsedMs = 0;
  let engagedAt = 0;

  function release(grain) {
    live.delete(grain);
    for (const node of grain.nodes) { try { node.disconnect(); } catch (_) {} }
  }

  function scatter(shape, level) {
    const pool = [];
    for (let i = 0; i < buffers.length; i++) if (buffers[i]) pool.push(i);
    if (!pool.length) return;
    const buffer = buffers[pool[Math.floor(clamp01(random()) * pool.length) % pool.length]];
    if (!buffer || buffer.duration <= 0.05) return;

    const lengthSec = Math.max(0.02, finite(shape.lengthMs, 80) / 1000);
    // Anywhere in the take, including the quiet between the words. A grain of
    // breath is as much this voice as a grain of consonant, and taking only the
    // loud parts is what makes granular synthesis sound like a machine.
    const offset = clamp01(random()) * Math.max(0, buffer.duration - lengthSec);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Transposition without time-stretch: the grain is short enough that the
    // rate change reads as a different throat rather than as a speed.
    source.playbackRate.value = 1;
    if (source.detune) {
      source.detune.value = (random() * 2 - 1) * finite(shape.detuneCents, 120);
    } else {
      source.playbackRate.value = 1 + (random() * 2 - 1) * 0.06;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = (random() * 2 - 1) * clamp01(shape.spread);

    source.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(output); } else { gain.connect(output); }

    const now = ctx.currentTime;
    const peak = Math.max(0.00001, level * (0.55 + random() * 0.45));
    const curve = new Float32Array(ENVELOPE_POINTS);
    for (let i = 0; i < ENVELOPE_POINTS; i++) curve[i] = HANN[i] * peak;
    try {
      gain.gain.setValueCurveAtTime(curve, now, lengthSec);
    } catch (_) {
      gain.gain.setValueAtTime(peak, now);
      gain.gain.linearRampToValueAtTime(0, now + lengthSec);
    }

    const grain = { source, nodes: pan ? [source, gain, pan] : [source, gain] };
    live.add(grain);
    source.onended = () => release(grain);
    try { source.start(now, offset, lengthSec); } catch (_) { release(grain); }
  }

  // `shape` is whisperGrainsAt(); `level` is already scaled by the bed's own
  // level and by the accessibility setting, so this function never reads
  // settings and never decides whether it is allowed to make a sound.
  function tick(dtMs, shape, level) {
    elapsedMs += Math.max(0, finite(dtMs, 0));
    if (!shape?.active || level <= 0.00001) { engagedAt = 0; return { active: false, live: live.size }; }
    if (!engagedAt) engagedAt = elapsedMs;

    const now = ctx.currentTime;
    if (now >= nextAt && live.size < shape.density) {
      scatter(shape, level);
      // LOOSELY QUANTISED, WHICH IS WHY IT PULSES.
      //
      // Pure jitter is a hiss and pure quantisation is a drum machine. Each
      // grain is pulled a fraction of the way toward the next slow pulse and
      // left where it lands, so a rhythm keeps almost forming.
      const interval = Math.max(0.012, finite(shape.intervalMs, 90) / 1000);
      const jittered = interval * (0.65 + random() * 0.7);
      const pulse = Math.max(0.05, finite(shape.pulseMs, 340) / 1000);
      const target = Math.ceil((now + jittered) / pulse) * pulse;
      nextAt = jittered + now + (target - (now + jittered)) * clamp01(shape.pulseBias);
    }
    return { active: true, live: live.size, engagedMs: elapsedMs - engagedAt };
  }

  function silence(fadeSec = 0.25) {
    for (const grain of [...live]) {
      try { grain.source.stop(ctx.currentTime + fadeSec); } catch (_) { release(grain); }
    }
  }

  function dispose() {
    silence(0.05);
    try { output.disconnect(); } catch (_) {}
  }

  return {
    output,
    tick,
    silence,
    dispose,
    liveCount: () => live.size,
  };
}
