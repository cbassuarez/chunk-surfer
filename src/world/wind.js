// ONE NIGHT'S WIND, READ BY EVERYTHING.
//
// The weather shows up on three renderers that share no code: a 2D canvas over
// the boot credits, the raymarched yard, and Source's flat composited field.
// The temptation is to give each its own oscillator, and the result of that is
// three effects rather than one night — a gust arrives in the credits, a
// different gust arrives in the yard, and nothing in the game agrees with
// itself.
//
// So the gust is a pure function of the clock. Anything that wants to know what
// the wind is doing asks here, and they all get the same answer at the same
// moment. Leaves lean, sheets tumble, the bed surges and the howl opens on one
// curve.
//
// Two oscillators, deliberately incommensurate periods (they never repeat
// together inside a session), plus a slow drift so the whole night is not one
// steady blow. Nothing random: a seeded night must reproduce.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// Periods in seconds. Coprime-ish so the sum does not obviously loop.
const SLOW = 0.31;
const FAST = 0.83;
const DRIFT = 0.047;

// A gust, centred on 1. `depth` is how much of it a given weather feels — rain
// barely surges, leaves are almost all gust.
export function windAt(timeSec = 0, { depth = 1, seed = 0 } = {}) {
  const t = Math.max(0, Number(timeSec) || 0);
  const phase = (Number(seed) || 0) * 6.283;
  const slow = Math.sin(t * SLOW + 0.7 + phase);
  const fast = Math.sin(t * FAST + 2.1 + phase * 1.7) * 0.34;
  const drift = Math.sin(t * DRIFT + phase * 0.5) * 0.22;
  return 1 + (slow + fast + drift) * 0.34 * clamp(depth, 0, 2);
}

// 0..1, how hard it is blowing right now regardless of which way. This is what
// a howl opens on and what decides whether a flurry is worth spawning at all —
// a howl at a steady 1.0 is a fan, not weather.
export function windForce(timeSec = 0, { seed = 0 } = {}) {
  return clamp((windAt(timeSec, { depth: 1, seed }) - 1) / 0.68 * 0.5 + 0.5, 0, 1);
}
