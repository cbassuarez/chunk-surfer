// HOW THE HUSH ANSWERS.
//
// It never speaks — signal-role.js refuses it as a narrative speaker. What it
// says, it says with the body: a lean, a flinch, a turn away, the second outline
// slipping out from behind the first. An authored contact line names one of
// these on `body`; the Text Space renderer eases the silhouette into it and lets
// it relax back when the cue has held.
//
// Pure, so content can be checked against the list without a GL context.
//
//   tilt   radians, pivoting on the feet
//   shift  sideways, in body widths
//   scale  1 is where it stands; above is nearer
//   lag    where the second outline sits, in body widths
//   ghost  how much of the second outline shows
//   flicker, turn (1 is edge-on), dim  — all 0..1
//   hold   seconds before it relaxes
export const HUSH_BODY_CUES = Object.freeze({
  still: Object.freeze({ hold: 1.6 }),
  lean: Object.freeze({ tilt: 0.10, hold: 2.4 }),
  'lean-in': Object.freeze({ tilt: -0.06, scale: 1.07, hold: 2.6 }),
  recoil: Object.freeze({ tilt: 0.05, scale: 0.9, shift: 0.18, hold: 1.8 }),
  'step-in': Object.freeze({ scale: 1.12, hold: 3.2 }),
  'step-back': Object.freeze({ scale: 0.92, hold: 3.2 }),
  'step-side': Object.freeze({ shift: 0.45, hold: 3.0 }),
  turn: Object.freeze({ turn: 0.78, hold: 2.2 }),
  double: Object.freeze({ ghost: 0.75, lag: 0.38, hold: 3.0 }),
  mirror: Object.freeze({ tilt: -0.08, ghost: 0.35, lag: -0.22, hold: 2.6 }),
  flicker: Object.freeze({ flicker: 1, hold: 1.2 }),
  dim: Object.freeze({ dim: 0.7, hold: 2.4 }),
});

export const HUSH_POSE_NEUTRAL = Object.freeze({ tilt: 0, shift: 0, scale: 1, lag: 0, ghost: 0, flicker: 0, turn: 0, dim: 0 });

const ATTACK = 0.35;
const RELEASE = 0.9;
const ease = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export const isHushBodyCue = (name) => Object.hasOwn(HUSH_BODY_CUES, String(name || ''));

// One cue at a time: a new one replaces the last, the way a body can only do
// one thing at once. Reduced motion halves the movement and drops the strobe.
export function hushPoseAt(cue, startedAt, now, { reducedMotion = false } = {}) {
  const shape = isHushBodyCue(cue) ? HUSH_BODY_CUES[cue] : null;
  if (!shape || !Number.isFinite(startedAt) || !Number.isFinite(now)) return { ...HUSH_POSE_NEUTRAL };
  const t = now - startedAt;
  const hold = shape.hold ?? 2;
  const k = t < 0 ? 0 : t < hold ? ease(t / ATTACK) : 1 - ease((t - hold) / RELEASE);
  if (k <= 0) return { ...HUSH_POSE_NEUTRAL };
  const motion = reducedMotion ? 0.5 : 1;
  return {
    tilt: (shape.tilt || 0) * k * motion,
    shift: (shape.shift || 0) * k * motion,
    scale: 1 + ((shape.scale ?? 1) - 1) * k * motion,
    lag: (shape.lag || 0) * k * motion,
    ghost: (shape.ghost || 0) * k,
    flicker: reducedMotion ? 0 : (shape.flicker || 0) * k,
    turn: (shape.turn || 0) * k,
    dim: (shape.dim || 0) * k,
  };
}
