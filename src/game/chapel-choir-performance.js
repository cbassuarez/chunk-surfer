import { CHAPEL_CHOIR_PERFORMANCE as recording } from '../data/generated/chapel-choir-performance.js';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const ascent = [[0, 0], [6, .18], [16, .48], [32, 1.02], [48, 1.65], [58, 1.65], [68, 1.24], [77, .43], [80.2, 0], [88, 0]];

export function chapelChoirVocalEnergy(phase) {
  if (!Number.isFinite(phase) || phase < 0 || phase >= recording.duration) return 0;
  const frame = phase * recording.hz, index = Math.floor(frame), f = frame - index;
  return ((recording.levels[index] || 0) * (1 - f) + (recording.levels[index + 1] || 0) * f) / 255;
}

// A common musical phrase, with a small front-to-back release from the pews.
// Never use the PWM signal to animate jaws: the humans continue underneath it.
export function chapelChoirPose({ phase = 0, presence = {}, reducedMotion = false,
  ceilingY = presence.ceilingY, active = true, amount = 1 } = {}) {
  const quiet = { singing: false, jaw: 0, breathe: 0, lift: 0, headPitch: 0, roll: 0, activity: 0, phraseLift: 0 };
  if (!active || !Number.isFinite(phase) || phase < 0 || phase >= recording.duration) return quiet;
  const weight = clamp(Number(amount) || 0), row = clamp(Number(presence.row) || 0, 0, 8);
  const bank = Number(presence.bank) || 0, seat = Number(presence.seat) || 0;
  const delay = presence.role === 'congregant' ? (8 - row) * .22 + bank * .08 + seat * .025 : 0;
  const age = Math.max(0, phase - delay), index = ascent.findIndex(([at]) => age < at);
  const a = ascent[Math.max(0, index - 1)], b = ascent[index < 0 ? ascent.length - 1 : index];
  const phraseLift = a[1] + (b[1] - a[1]) * smooth((age - a[0]) / Math.max(.001, b[0] - a[0]));
  const activity = chapelChoirVocalEnergy(Math.max(0, phase - Math.min(.12, delay * .035)));
  const voice = smooth((activity - .045) / .26);
  const variation = .5 + .5 * Math.sin(phase * 2.1 + row * .7 + bank + seat * 1.2);
  const jaw = weight * voice * (.13 + .21 * activity + (reducedMotion ? 0 : .025 * variation));
  // Celebrant/servers sing, but the officiant remains the grounded datum.
  const roleLift = presence.role === 'celebrant' ? 0 : presence.role === 'acolyte' ? .38 : 1;
  const scale = Number(presence.scale) || 1, ground = Number(presence.y) || 0;
  // Includes the head tilted back and the small upper-body expansion.
  const bodyTop = (presence.figure === 'celebrant' ? 1.91 : 1.77) * scale;
  const clearance = Number.isFinite(ceilingY) ? Math.max(0, ceilingY - ground - bodyTop - .35) : 1.65;
  const lift = Math.min(clearance, phraseLift * roleLift * (reducedMotion ? .32 : 1)) * weight;
  return { singing: voice * weight > .06, jaw: clamp(jaw, 0, .40), activity,
    breathe: weight * voice * (.35 + .65 * activity), lift, phraseLift,
    headPitch: weight * voice * (.16 + .20 * clamp(lift / 1.65)),
    roll: reducedMotion ? 0 : weight * voice * Math.sin(phase * .48 + row * .9 + bank) * .018,
  };
}
