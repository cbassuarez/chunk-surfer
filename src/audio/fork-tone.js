// THE ROOM IS STILL HOLDING IT.
//
// The tuning fork is a battle tool that most players never find. It sits on a
// music stand in a service room off the practice wing, it is small, it is steel,
// and the only thing that ever pointed at it was one line about somebody having
// left one out — in "one of these rooms".
//
// The fiction already had the fix in it. When the fork is struck the game says
// the tone is "held by the room rather than by the steel", which is why damping
// the steel does nothing. So the room is holding it BEFORE you get there too: a
// faint A somewhere off to your left that gets louder as you walk, and you find
// the stand because you heard it.
//
// Modelled on fountain-water.js, whose own note states the whole argument for
// doing this at all: "IT IS HEARD BEFORE IT IS SEEN, which is most of what makes
// it worth having."
//
// It is NOT a sound event and never enters the HUSH noise envelope. Like the
// fountain, this is not something the building did — it is something that was
// already happening.
//
// Synthesised, because it is one pitch. A=440 with a very slightly detuned
// partner an octave up, both nearly silent, beating against each other slowly so
// the tone breathes instead of sitting there like a test signal.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const FORK_TONE = Object.freeze({
  // A=440, the pitch the object makes everywhere else in the game.
  hz: 440,
  // Quiet. It has to be findable in a silent building without ever competing
  // with the room tone the player is there to record.
  gain: 0.028,
  // Metres. Roughly the practice wing's own length, so the tone is present for
  // the walk rather than only in the doorway.
  radius: 26,
});

/**
 * The frame for a listener at `{x, z}` and a source at `{x, z}`, both in
 * building metres. Same shape as fountainWaterAt: `{ audible, gain, pan }`.
 */
export function forkToneAt(listener, source, { active = true } = {}) {
  if (!active || !source) return { audible: false, gain: 0, pan: 0, distance: Infinity };
  const x = Number(listener?.x) || 0;
  const z = Number(listener?.z ?? listener?.y) || 0;
  const sx = Number(source.x) || 0;
  const sz = Number(source.z ?? source.y) || 0;
  const distance = Math.hypot(sx - x, sz - z);
  if (distance >= FORK_TONE.radius) return { audible: false, gain: 0, pan: 0, distance };
  // Steeper than the fountain's. A pure tone carries a long way in a dead
  // building, and a gentle curve would make it audible across half the wing with
  // no sense of getting warmer — which is the one thing this has to give.
  const air = (1 - distance / FORK_TONE.radius) ** 2.1;
  const gain = FORK_TONE.gain * air;
  const dx = sx - x;
  const spread = clamp(distance / 6, 0, 1);
  const pan = clamp((dx / Math.max(1, distance)) * spread, -1, 1);
  return { audible: gain > 0.0015, gain, pan, distance };
}

export function createForkToneRuntime({ context, destination } = {}) {
  if (!context || !destination) return { update() {}, stop() {} };

  const out = context.createGain();
  out.gain.value = 0;
  const pan = context.createStereoPanner
    ? context.createStereoPanner()
    : { pan: { value: 0, cancelScheduledValues() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };

  // The fundamental, and its octave a few cents off. Two nearly-identical
  // partials beating slowly is what a struck fork actually sounds like once the
  // strike is long gone, and it is also the thing that stops a sine wave reading
  // as a system beep.
  const voices = [
    { hz: FORK_TONE.hz, gain: 1 },
    { hz: FORK_TONE.hz * 2, gain: 0.22, detune: 6 },
  ].map(({ hz, gain, detune = 0 }) => {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    if (osc.detune) osc.detune.value = detune;
    const level = context.createGain();
    level.gain.value = gain;
    osc.connect(level);
    level.connect(out);
    try { osc.start(); } catch (_) { /* already running */ }
    return { osc, level };
  });

  if (pan.connect) { out.connect(pan); pan.connect(destination); }
  else out.connect(destination);

  let stopped = false;
  return {
    update(frame = {}, now = context.currentTime) {
      if (stopped) return;
      out.gain.cancelScheduledValues(now);
      // Slow ramps. A tone that snaps on at a threshold tells the player they
      // crossed a line; one that swells tells them they are getting closer.
      out.gain.linearRampToValueAtTime(clamp(Number(frame.gain) || 0, 0, FORK_TONE.gain), now + 0.35);
      pan.pan.cancelScheduledValues(now);
      pan.pan.linearRampToValueAtTime(clamp(Number(frame.pan) || 0, -1, 1), now + 0.35);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const { osc } of voices) { try { osc.stop(); } catch (_) {} }
      try { out.disconnect(); } catch (_) {}
      try { pan.disconnect?.(); } catch (_) {}
    },
  };
}
