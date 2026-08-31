// THUNDER, AND WHAT DISTANCE DOES TO IT.
//
// Distance is not a volume knob here — it is the whole character of the sound,
// and treating it as a fader is why most synthesised thunder reads as "noise
// burst, quieter". Three things change together as a strike gets further away,
// and all three come off the one distance number the storm already scheduled it
// with (game/storm.js):
//
//   THE CRACK GOES FIRST. High frequencies are absorbed by air far faster than
//   low ones, so a strike at two hundred metres is a rip and a slam, and the
//   same strike at five kilometres has no top at all — just the roll. That is a
//   lowpass sweeping down with distance, and it does most of the work.
//
//   THE TAIL GETS LONGER. Close thunder is one event. Distant thunder is the
//   same event smeared by every surface between it and you, so it arrives as a
//   roll lasting several seconds rather than a bang.
//
//   IT SOFTENS AT THE FRONT. A near strike has an instant attack; a far one
//   fades up over a quarter second because the direct path and the reflections
//   arrive together.
//
// Synthesised for the same reason as the rain bed: it has to be available with
// no asset load in front of it, and a scheduled event cannot wait on a decode.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// The reference distances the shaping is written against.
const NEAR = 300;
const FAR = 7000;

export function thunderShape(distance = 1200, energy = 0.7) {
  const d = clamp(distance, 60, FAR * 1.5);
  // 0 at the yard fence, 1 at the horizon.
  const far = clamp((d - NEAR) / (FAR - NEAR), 0, 1);
  return {
    far,
    // Air eats the top. 5.2kHz overhead down to 210Hz on the horizon.
    cutoff: 5200 * Math.pow(0.04, far) + 190,
    // One event up close, a roll at distance.
    length: 1.1 + far * 5.4,
    // Instant, then increasingly smeared.
    attack: 0.004 + far * 0.30,
    // The inverse square, floored so a distant storm is still THERE.
    // The old 0.34 front was mastering-level, not weather-level: a close crack
    // arrived beside UI and dialogue at nearly half scale before the SFX bus.
    // Preserve distance and tail character at roughly eight decibels less.
    gain: clamp(0.14 * energy * (1 - far * 0.72), 0.016, 0.17),
    // Only a near strike has a crack on the front of it.
    crack: clamp(1 - far * 2.4, 0, 1),
  };
}

export function createThunderVoice({ context, destination } = {}) {
  if (!context || !destination) return { strike() { return false; }, stop() {} };

  // One noise buffer for every strike. Six seconds so the longest roll never
  // has to loop, and a random read offset per strike so two distant rumbles are
  // never the same rumble.
  const seconds = 6;
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i += 1) {
    // Brown-ish noise: thunder has almost nothing above the low mids once it
    // has travelled, and white noise filtered down still sounds like a hiss
    // with the top removed rather than like weight.
    brown = brown * 0.994 + (Math.random() * 2 - 1) * 0.055;
    data[i] = clamp(brown * 3.4, -1, 1);
  }

  let stopped = false;
  const live = new Set();

  function strike({ distance = 1200, energy = 0.7, bearing = 0 } = {}) {
    if (stopped) return false;
    const shape = thunderShape(distance, energy);
    const now = context.currentTime;

    const src = context.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = seconds;
    // Offset so repeated strikes are not the same waveform.
    try { src.start(now, Math.random() * (seconds - shape.length - 0.1)); } catch (_) { return false; }

    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(shape.cutoff, now);
    // The tail dulls further as it decays — the last of a roll is always lower
    // than the front of it.
    low.frequency.exponentialRampToValueAtTime(Math.max(80, shape.cutoff * 0.4), now + shape.length);
    low.Q.value = 0.7;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.gain), now + shape.attack);
    // Not a straight fall: thunder swells once as the reflections catch up.
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.gain * 0.55), now + shape.attack + shape.length * 0.26);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.gain * 0.78), now + shape.attack + shape.length * 0.44);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + shape.attack + shape.length);

    const panner = context.createStereoPanner();
    // Distant thunder is everywhere; a near strike has a side.
    panner.pan.value = clamp(Math.sin(bearing) * (1 - shape.far) * 0.7, -1, 1);

    src.connect(low); low.connect(gain); gain.connect(panner); panner.connect(destination);

    // The crack: a short bright layer on the front, only for a near strike.
    let crackNodes = [];
    if (shape.crack > 0.01) {
      const crackSrc = context.createBufferSource();
      crackSrc.buffer = buffer;
      const band = context.createBiquadFilter();
      band.type = 'highpass';
      band.frequency.value = 900 + shape.crack * 1600;
      const crackGain = context.createGain();
      const peak = shape.gain * shape.crack * 1.08;
      crackGain.gain.setValueAtTime(Math.max(0.0002, peak), now);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.10 + shape.crack * 0.22);
      crackSrc.connect(band); band.connect(crackGain); crackGain.connect(panner);
      try { crackSrc.start(now, Math.random() * 4); crackSrc.stop(now + 0.45); } catch (_) {}
      crackNodes = [crackSrc, band, crackGain];
    }

    const ends = now + shape.attack + shape.length + 0.2;
    try { src.stop(ends); } catch (_) {}
    const nodes = [src, low, gain, panner, ...crackNodes];
    live.add(nodes);
    src.onended = () => {
      live.delete(nodes);
      for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
    };
    return true;
  }

  return {
    strike,
    stop() {
      stopped = true;
      for (const nodes of live) for (const node of nodes) { try { node.stop?.(); } catch (_) {} try { node.disconnect(); } catch (_) {} }
      live.clear();
    },
  };
}
