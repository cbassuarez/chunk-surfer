// THE STORM.
//
// The whole idea is one sentence: THUNDER AND LIGHTNING ARE ONE EVENT WITH A
// DELAY BETWEEN THEM, AND THE DELAY IS THE DISTANCE.
//
// Every cheap version of this treats them as two unrelated effects — a flash on
// one timer, a rumble on another — and the result is that the storm never tells
// you anything. Schedule the thunder at `distance / 343 m/s` and the player
// starts counting without ever being told to, and a strike that arrives at two
// hundred metres is genuinely frightening in a way a random rumble is not.
//
// Everything else follows from that one decision:
//   near   -> short delay, hard crack, blinding, brief
//   far    -> long delay, low roll, a lift on the horizon rather than a flash
// so the same three numbers (bearing, distance, energy) drive the picture and
// the sound and they cannot disagree.
//
// Pure. It schedules; it does not flash and it does not play anything.

const SPEED_OF_SOUND = 343;          // m/s, which is the only constant here
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// A strike close enough to be over the yard rather than over the county.
export const NEAR_METRES = 400;
export const FAR_METRES = 7000;

function nextRandom(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (state, lo, hi) => lo + nextRandom(state) * (hi - lo);

export function freshStorm({ seed = 1, intensity = 1 } = {}) {
  return {
    rng: (Math.floor(Number(seed) || 1) >>> 0) || 1,
    // 0..1. A storm that is passing over is not the same as one three counties
    // away, and the difference is how often and how close.
    intensity: clamp(intensity, 0, 1),
    time: 0,
    nextAt: 4,
    strikes: [],        // live flashes
    pending: [],        // thunder waiting on its own travel time
    lastDistance: 0,
  };
}

// The shape of a flash. Real lightning is a stroke and then one or more return
// strokes down the same channel, which is why it stutters rather than fading —
// and why a single smooth envelope always reads as a lamp being turned up.
function flashAt(strike, t) {
  if (t < 0 || t > strike.duration) return 0;
  let value = 0;
  for (const stroke of strike.strokes) {
    const local = t - stroke.at;
    if (local < 0 || local > stroke.length) continue;
    // Instant on, exponential off. Nothing in a storm ramps up.
    value = Math.max(value, stroke.gain * Math.exp(-local / (stroke.length * 0.34)));
  }
  return clamp(value, 0, 1);
}

function makeStrike(state) {
  // Closer strikes are rarer. Squaring the roll biases the field outward, which
  // is what makes a near one an event.
  const roll = nextRandom(state);
  const nearness = Math.pow(roll, 1.9) * (0.35 + state.intensity * 0.65);
  const distance = FAR_METRES + (NEAR_METRES - FAR_METRES) * nearness;
  const energy = clamp(0.30 + nearness * 0.85, 0, 1);
  // Two or three return strokes for a near one; a distant sheet gets a single
  // slow bloom, because you are seeing cloud lit from inside rather than a bolt.
  const near = distance < 1800;
  const count = near ? (nextRandom(state) < 0.55 ? 3 : 2) : 1;
  const strokes = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    strokes.push({
      at,
      // Long enough to SEE. Real return strokes are tens of milliseconds, which
      // at sixty frames is one or two frames and reads as a dropped frame
      // rather than as lightning. These are the shortest that still register as
      // light rather than as a glitch, and the stutter between strokes is what
      // carries the "lightning" reading anyway.
      length: near ? between(state, 0.10, 0.19) : between(state, 0.30, 0.52),
      // The first stroke is the brightest; the returns are weaker.
      gain: energy * (i === 0 ? 1 : between(state, 0.35, 0.7)),
    });
    at += between(state, 0.055, 0.14);
  }
  const duration = at + 0.45;
  return {
    bearing: nextRandom(state) * Math.PI * 2,
    distance,
    energy,
    strokes,
    duration,
    startedAt: state.time,
    // Where the sound is, once it gets here.
    thunderAt: state.time + distance / SPEED_OF_SOUND,
  };
}

// Returns the events that fell due this step: `{ thunder: [...] }`. The caller
// plays them; this module never touches audio.
export function stepStorm(state, dt, { active = true } = {}) {
  if (!state) return { thunder: [] };
  const step = clamp(dt, 0, 0.5);
  state.time += step;
  const thunder = [];

  if (active && state.time >= state.nextAt) {
    const strike = makeStrike(state);
    state.strikes.push(strike);
    state.pending.push(strike);
    state.lastDistance = strike.distance;
    // Busier storms strike more often. Never regular: a metronome overhead is
    // not weather.
    const spacing = between(state, 5, 26) * (1.35 - state.intensity * 0.7);
    state.nextAt = state.time + spacing;
  }

  state.strikes = state.strikes.filter((strike) => state.time - strike.startedAt <= strike.duration);
  state.pending = state.pending.filter((strike) => {
    if (state.time < strike.thunderAt) return true;
    thunder.push({
      distance: strike.distance,
      energy: strike.energy,
      bearing: strike.bearing,
      // How long the flash was ago, which is the number the player has been
      // counting whether they know it or not.
      delay: strike.thunderAt - strike.startedAt,
    });
    return false;
  });

  return { thunder };
}

// 0..1 right now, across every live strike.
export function stormFlash(state) {
  if (!state?.strikes?.length) return 0;
  let value = 0;
  for (const strike of state.strikes) value = Math.max(value, flashAt(strike, state.time - strike.startedAt));
  return value;
}

// Which way the light is coming from, for anything that wants to throw a
// shadow rather than just brighten.
export function stormBearing(state) {
  if (!state?.strikes?.length) return 0;
  let best = null;
  for (const strike of state.strikes) {
    const value = flashAt(strike, state.time - strike.startedAt);
    if (!best || value > best.value) best = { value, bearing: strike.bearing };
  }
  return best?.bearing || 0;
}

// Force the next strike, for review and for the god menu. Distance in metres.
export function forceStrike(state, { distance = 900 } = {}) {
  if (!state) return null;
  state.nextAt = state.time;
  const strike = makeStrike(state);
  strike.distance = clamp(distance, 60, FAR_METRES * 1.5);
  // A forced strike gets the energy its distance implies, not whatever the
  // random one it was cloned from happened to roll. Otherwise "fire one at two
  // hundred metres" produces a distant sheet standing very close by.
  const nearness = clamp((FAR_METRES - strike.distance) / (FAR_METRES - NEAR_METRES), 0, 1);
  strike.energy = clamp(0.30 + nearness * 0.85, 0, 1);
  const scale = strike.energy / Math.max(0.05, strike.strokes[0].gain);
  for (const stroke of strike.strokes) stroke.gain = clamp(stroke.gain * scale, 0, 1);
  strike.thunderAt = state.time + strike.distance / SPEED_OF_SOUND;
  state.strikes.push(strike);
  state.pending.push(strike);
  state.nextAt = state.time + 8;
  return strike;
}
