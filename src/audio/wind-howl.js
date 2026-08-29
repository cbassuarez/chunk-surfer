// THE WIND, OUTDOORS.
//
// The arrival is a walk across an open yard in the rain and it has been playing
// over a music bed with no weather in it. Wind is the sound that tells you a
// space has no roof — and it is the one the player is standing in for the whole
// opening.
//
// WHAT MAKES A HOWL A HOWL IS RESONANCE, NOT NOISE. Filtered noise at any
// bandwidth is a hiss; wind only starts to sing when it is being forced past an
// edge, and what you hear then is a narrow resonant peak wandering in pitch.
// So the top layer is a high-Q bandpass whose frequency rides the gust, and the
// howl appears at the top of a gust and dies between them. Below it sits a wide
// low body — the pressure of moving air, which is what stops the whole thing
// sounding like a kettle.
//
// It reads the same gust as the leaves and the credits (world/wind.js), so a
// surge you hear is a surge you can watch cross the yard.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// Against the opening bed, which is music. This has to be underneath it and
// still be the reason the yard feels open.
export const HOWL_GAIN = 0.055;
export const BODY_GAIN = 0.070;

export function createWindHowl({ context, destination } = {}) {
  if (!context || !destination) return { update() {}, stop() {}, active: () => false };

  const seconds = 3;
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i += 1) {
    brown = brown * 0.988 + (Math.random() * 2 - 1) * 0.06;
    data[i] = clamp((Math.random() * 2 - 1) * 0.35 + brown * 2.2, -1, 1);
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const out = context.createGain();
  out.gain.value = 0;
  out.connect(destination);

  // The body: wide, low, always there when you are outdoors at all.
  const body = context.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 420;
  body.Q.value = 0.6;
  const bodyGain = context.createGain();
  bodyGain.gain.value = BODY_GAIN;
  noise.connect(body); body.connect(bodyGain); bodyGain.connect(out);

  // The howl: narrow and resonant, and only present at the top of a gust.
  const howl = context.createBiquadFilter();
  howl.type = 'bandpass';
  howl.frequency.value = 620;
  howl.Q.value = 7.5;
  const howlGain = context.createGain();
  howlGain.gain.value = 0;
  noise.connect(howl); howl.connect(howlGain); howlGain.connect(out);

  let stopped = false;
  try { noise.start(); } catch (_) { /* a context that will not run is silence */ }

  return {
    active: () => !stopped,
    // `force` is windForce(): 0..1, how hard it is blowing right now.
    // `presence` is the caller's — 1 outdoors, 0 under a roof.
    update({ force = 0.5, presence = 0 } = {}, now = context.currentTime) {
      if (stopped) return;
      const open = clamp(presence, 0, 1);
      const gust = clamp(force, 0, 1);
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(open, now + 0.35);
      // The pitch of a howl is the size of the gap it is being forced through,
      // and it rises as the wind does — this is the part the ear reads as
      // "harder", more than the level is.
      howl.frequency.cancelScheduledValues(now);
      howl.frequency.linearRampToValueAtTime(430 + gust * 900, now + 0.30);
      // And it only sings at the top. Below that there is pressure and no note,
      // which is what makes the gust an arrival rather than a fader move.
      const sing = Math.max(0, gust - 0.48) / 0.52;
      howlGain.gain.cancelScheduledValues(now);
      howlGain.gain.linearRampToValueAtTime(HOWL_GAIN * sing * sing, now + 0.30);
      bodyGain.gain.cancelScheduledValues(now);
      bodyGain.gain.linearRampToValueAtTime(BODY_GAIN * (0.45 + gust * 0.55), now + 0.30);
    },
    stop({ fade = 0.8 } = {}) {
      if (stopped) return;
      stopped = true;
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(0, now + fade);
      try { noise.stop(now + fade + 0.1); } catch (_) {}
    },
  };
}
