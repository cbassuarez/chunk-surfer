// The Hush's footfalls: what its own gait just did, and how that reaches this
// listener. Pure. Nothing here moves the body, makes noise it can hear, or tells it
// anything; the gait in pressure-gait.js keeps all authority over the walk.
//
// The walk is one committed stride every few seconds, longer as it gets closer, so
// the steps slow down as it nears. Every other stride drags. It goes silent to
// listen, and inside arm's length it makes no sound at all: a small sound just
// before a hit dampens the startle, and "it stopped" is the worst thing they'll hear.
import { distanceLossDb } from '../audio/acoustic-propagation.js';

export const HUSH_FOOTFALL = Object.freeze({
  plantProgress: .86, silentMetres: 1.25, audibleLossDb: 44, referenceMetres: 2.4,
  airStartMetres: 10, airDbPerMetre: .6, creakMetres: 8, captionMetres: 14,
  // The microphone is better than the man: on the monitor walls count for less.
  monitorOcclusion: .6, monitorLiftDb: 4,
  dry: .85, thump: .62, thumpDelay: .09, creak: .16,
  rate: .68, rateSpread: .05, dragRate: .6, dragGain: .34, dragDelay: .38,
  shakeMetres: 3.5, shake: .22,
});

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, number(value, lo)));

// One call per tick, after the gait has stepped. Returns what the walk did since.
export function createHushFootfallTracker() {
  let last = null, planted = true;
  return {
    step(gait) {
      const phase = gait?.phase || null, events = [];
      if (!phase) { last = null; planted = true; return events; }
      const cycle = number(gait.cycle), stride = phase === 'advance' && gait.redirect !== true;
      // Arriving part-way through a stride never invents the foot that started it.
      if (last === null) { last = phase; planted = phase !== 'load'; return events; }
      if (phase === 'load' && last !== 'load') { planted = false; events.push({ kind: 'load', cycle }); }
      if (phase === 'advance' && last !== 'advance') planted = gait.redirect === true;
      const foot = gait.pivot === true ? 'pivot' : 'plant';
      if (stride && !planted && number(gait.progress) >= HUSH_FOOTFALL.plantProgress) { planted = true; events.push({ kind: foot, cycle }); }
      // A long frame can leave the stride without showing the foot landing.
      if (phase === 'arrest' && !planted && gait.redirect !== true && (last === 'advance' || last === 'load')) { planted = true; events.push({ kind: foot, cycle }); }
      if (phase === 'recover' && last !== 'recover') { if (!planted) events.push({ kind: 'blocked', cycle }); planted = true; }
      last = phase;
      return events;
    },
  };
}

export function hushFootfallPlan({ kind = 'plant', metres = Infinity, occlusionDb = 0, absorption = 0, monitoring = false,
  cycle = 0, bearing = 0, riseM = -1.5, softened = false } = {}) {
  const F = HUSH_FOOTFALL, m = number(metres, Infinity);
  const occlusion = clamp(occlusionDb, 0, 60) * (monitoring ? F.monitorOcclusion : 1);
  const lossDb = distanceLossDb(m, { referenceDistance: F.referenceMetres, maxLossDb: 60 }) + Math.max(0, m - F.airStartMetres) * F.airDbPerMetre
    + occlusion - (monitoring ? F.monitorLiftDb : 0);
  const base = { kind, lossDb, audible: false };
  if (!Number.isFinite(m) || m < F.silentMetres || lossDb >= F.audibleLossDb) return Object.freeze(base);
  if (kind === 'load' && m > F.creakMetres) return Object.freeze(base);
  const level = 10 ** (-lossDb / 20), absorb = clamp(absorption, 0, 1), blocked = kind === 'blocked';
  const nearness = clamp(1 - (m - F.silentMetres) / 16, .25, 1), n = Math.abs(Math.floor(number(cycle)));
  const dry = (blocked ? .45 : 1) * F.dry * level;
  const reach = Math.max(1, m), b = number(bearing);
  return Object.freeze({
    ...base, audible: true, dryGain: kind === 'load' ? 0 : dry,
    clip: kind === 'pivot' ? 'scuff' : 'slow',
    rate: kind === 'pivot' ? F.dragRate : F.rate + F.rateSpread * ((n * 37) % 7) / 6,
    // The weight arrives just after the heel, and it is felt more than heard.
    thump: kind === 'load' ? null : { peak: (softened ? .7 : 1) * F.thump * level * nearness * (blocked ? .5 : 1), delay: F.thumpDelay, fromHz: 64, toHz: 38, seconds: .32 },
    creak: kind === 'load' ? { peak: F.creak * level, seconds: .46, fromHz: 210, toHz: 130 } : null,
    drag: kind === 'plant' && n % 2 === 1 ? { gain: F.dragGain * dry, delay: F.dragDelay + .02 * (n % 5), rate: F.dragRate } : null,
    // Walls keep the low end. The Hush itself eats the top as it closes.
    lowpassHz: clamp(14000 * 10 ** (-occlusion / 26) * (1 - .6 * absorb) / (1 + m / 60), 180, 14000),
    highpassHz: occlusion < 4 ? 35 + clamp(m / 24, 0, 1) * 90 : 28,
    // A far step has the room's answer on it. Close to, the room has stopped answering.
    wet: (.1 + .4 * clamp((m - 1.5) / 12, 0, 1)) * (1 - .9 * absorb) * (1 - clamp(occlusion / 48, 0, 1)) * (monitoring ? .25 : 1),
    position: { x: Math.sin(b) * reach, y: clamp(riseM, -12, 12), z: -Math.cos(b) * reach },
    needle: monitoring ? clamp(.42 * level, 0, .4) : 0,
    shake: kind !== 'load' && m <= F.shakeMetres ? F.shake * nearness : 0,
    caption: kind !== 'load' && m <= F.captionMetres,
  });
}

export function hushFootfallCaption({ kind = 'plant', bearing = 0, occlusionDb = 0 } = {}) {
  const b = Math.atan2(Math.sin(number(bearing)), Math.cos(number(bearing))), abs = Math.abs(b);
  const where = abs < Math.PI / 4 ? 'AHEAD' : abs > Math.PI * 3 / 4 ? 'BEHIND YOU' : b > 0 ? 'TO YOUR RIGHT' : 'TO YOUR LEFT';
  const what = kind === 'pivot' ? 'A FOOT TURNS' : kind === 'blocked' ? 'A WEIGHT MEETS SOMETHING' : 'A HEAVY STEP';
  return `${what}, ${number(occlusionDb) >= 6 ? 'THROUGH THE WALL, ' : ''}${where}`;
}
