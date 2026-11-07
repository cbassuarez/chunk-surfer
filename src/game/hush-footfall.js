// The Hush's footfalls: what its own gait just did, and how that reaches this
// listener. Pure. Nothing here moves the body, makes noise it can hear, or tells it
// anything; the gait in pressure-gait.js keeps all authority over the walk.
//
// The walk is one committed stride every few seconds, longer as it gets closer, so
// the steps slow down as it nears. Some strides drag. It goes silent to
// listen, and inside arm's length it makes no sound at all: a small sound just
// before a hit dampens the startle, and "it stopped" is the worst thing they'll hear.
import { distanceLossDb } from '../audio/acoustic-propagation.js';

export const HUSH_FOOTFALL = Object.freeze({
  plantProgress: .86, silentMetres: 1.25, audibleLossDb: 44, referenceMetres: 2.4,
  airStartMetres: 10, airDbPerMetre: .6, creakMetres: 8, captionMetres: 14,
  // The microphone is better than the man: on the monitor walls count for less.
  monitorOcclusion: .6, monitorLiftDb: 4,
  dry: .85, thump: .62, body: .3, thumpDelay: .09, creak: .16,
  rate: .68, humanRate: .84, rateSpread: .05, dragRate: .6, dragGain: .34, dragDelay: .38,
  shakeMetres: 3.5, shake: .22,
  // The route alternates long strides with tiny corrections onto the next cell.
  shuffleMetres: .2, shuffleGain: .4,
});

// Source's bodies have no gait to listen to. They move along authored lanes and the
// ground you walked, at Source's scale, where a walk covers 4 m a second and the
// gap is twenty metres. So their feet come from their own real travel, at a walking
// beat that doesn't speed up with them and owes nothing to the player's steps.
export const SOURCE_FOOTFALL = Object.freeze({
  intervalSeconds: .62, intervalSpread: .12, minStrideMetres: .8,
  stopSpeed: .2, stopTravelMetres: .4, cutSpeed: 40, cutMetres: 2,
  reach: .6, erasedDb: 16,
});

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, number(value, lo)));

// One call per tick, after the gait has stepped. Returns what the walk did since.
export function createHushFootfallTracker() {
  let last = null, planted = true, stuck = false;
  return {
    step(gait) {
      const phase = gait?.phase || null, events = [];
      if (!phase) { last = null; planted = true; stuck = false; return events; }
      const cycle = number(gait.cycle), stride = phase === 'advance' && gait.redirect !== true;
      // Arriving part-way through a stride never invents the foot that started it.
      if (last === null) { last = phase; planted = phase !== 'load'; return events; }
      if (phase === 'load' && last !== 'load') { planted = false; events.push({ kind: 'load', cycle }); }
      if (phase === 'advance' && last !== 'advance') planted = gait.redirect === true;
      const foot = gait.pivot === true ? 'pivot' : 'plant';
      if (stride && !planted && number(gait.progress) >= HUSH_FOOTFALL.plantProgress) { planted = true; if (foot === 'plant') stuck = false; events.push({ kind: foot, cycle, strideMetres: number(gait.stepDistanceMetres, .42) }); }
      // A long frame can leave the stride without showing the foot landing.
      if (phase === 'arrest' && !planted && gait.redirect !== true && (last === 'advance' || last === 'load')) { planted = true; if (foot === 'plant') stuck = false; events.push({ kind: foot, cycle, strideMetres: number(gait.stepDistanceMetres, .42) }); }
      // It meets the obstruction once. Pressing on it again isn't a new sound, or a
      // body held at a wall would knock forever.
      if (phase === 'recover' && last !== 'recover') { if (!planted && !stuck) { stuck = true; events.push({ kind: 'blocked', cycle }); } planted = true; }
      last = phase;
      return events;
    },
  };
}

// `bodies` are this tick's bodies, positions in metres. A body that jumps was cut,
// not walked: it starts over with no foot of its own for the distance.
export function createTravelFootfallTracker() {
  const F = SOURCE_FOOTFALL, seen = new Map();
  return {
    step(bodies = [], dt = 0) {
      const events = [], seconds = Math.max(0, number(dt)), present = new Set();
      for (const { id, x, y } of bodies) {
        present.add(id);
        const body = seen.get(id);
        if (!body) { seen.set(id, { x, y, travel: 0, speed: 0, cycle: 0 }); continue; }
        const moved = Math.hypot(x - body.x, y - body.y);
        body.x = x; body.y = y;
        if (seconds <= 0) continue;
        const rate = moved / seconds;
        if (moved > F.cutMetres && rate > F.cutSpeed) { body.travel = 0; body.speed = 0; continue; }
        body.speed += (rate - body.speed) * Math.min(1, seconds / .25);
        body.travel += moved;
        const beat = F.intervalSeconds * (1 + F.intervalSpread * (((body.cycle * 37) % 7) / 3 - 1));
        const stride = Math.max(F.minStrideMetres, body.speed * beat);
        // The last foot as it stops is the one that gets noticed.
        const stopped = rate < F.stopSpeed && body.travel >= F.stopTravelMetres;
        if (body.travel >= stride || stopped) {
          events.push({ id, kind: 'plant', cycle: body.cycle++, strideMetres: Math.max(stride, .42) });
          body.travel = 0;
        }
      }
      for (const id of [...seen.keys()]) if (!present.has(id)) seen.delete(id);
      return events;
    },
  };
}

export function hushFootfallPlan({ kind = 'plant', metres = Infinity, occlusionDb = 0, absorption = 0, monitoring = false,
  cycle = 0, bearing = 0, riseM = -1.5, softened = false, strideMetres = .42, reach = 1, extraLossDb = 0, human = false } = {}) {
  const F = HUSH_FOOTFALL, m = number(metres, Infinity);
  const occlusion = clamp(occlusionDb, 0, 60) * (monitoring ? F.monitorOcclusion : 1);
  const heard = m * clamp(reach, .1, 1);
  const lossDb = distanceLossDb(heard, { referenceDistance: F.referenceMetres, maxLossDb: 60 }) + Math.max(0, heard - F.airStartMetres) * F.airDbPerMetre
    + occlusion + Math.max(0, number(extraLossDb)) - (monitoring ? F.monitorLiftDb : 0);
  const base = { kind, lossDb, audible: false };
  if (!Number.isFinite(m) || m < F.silentMetres || lossDb >= F.audibleLossDb) return Object.freeze(base);
  if (kind === 'load' && m > F.creakMetres) return Object.freeze(base);
  const level = 10 ** (-lossDb / 20), absorb = clamp(absorption, 0, 1), blocked = kind === 'blocked';
  const shuffle = kind === 'plant' && number(strideMetres, .42) < F.shuffleMetres, heavy = kind !== 'load' && !shuffle;
  const nearness = clamp(1 - (m - F.silentMetres) / 16, .25, 1), n = Math.abs(Math.floor(number(cycle)));
  // The shape in the courts is a man's height, and its feet are nearer a man's.
  const weight = human ? .4 : 1;
  const dry = (blocked ? .45 : shuffle ? F.shuffleGain : 1) * F.dry * level;
  const orbit = Math.max(1, m), b = number(bearing);
  return Object.freeze({
    ...base, audible: true, dryGain: kind === 'load' ? 0 : dry,
    clip: kind === 'pivot' || shuffle ? 'scuff' : 'slow',
    rate: kind === 'pivot' || shuffle ? F.dragRate : (human ? F.humanRate : F.rate) + F.rateSpread * ((n * 37) % 7) / 6,
    // The weight arrives just after the heel, and it is felt more than heard.
    thump: !heavy ? null : { peak: (softened ? .7 : 1) * weight * F.thump * level * nearness * (blocked ? .5 : 1), delay: F.thumpDelay, fromHz: 64, toHz: 38, seconds: .32 },
    // The same weight for speakers that can't play the thump.
    body: !heavy ? null : { peak: (softened ? .7 : 1) * (human ? .8 : 1) * F.body * level * nearness * (blocked ? .5 : 1), delay: F.thumpDelay, fromHz: 210, toHz: 95, seconds: .17 },
    creak: kind === 'load' ? { peak: F.creak * level, seconds: .46, fromHz: 210, toHz: 130 } : null,
    drag: kind === 'plant' && !shuffle && n % 4 === 1 ? { gain: F.dragGain * dry, delay: F.dragDelay + .02 * (n % 5), rate: F.dragRate } : null,
    // Walls keep the low end. The Hush itself eats the top as it closes.
    lowpassHz: clamp(14000 * 10 ** (-occlusion / 26) * (1 - .6 * absorb) / (1 + m / 60), 180, 14000),
    highpassHz: occlusion < 4 ? 35 + clamp(m / 24, 0, 1) * 90 : 28,
    // A far step has the room's answer on it. Close to, the room has stopped answering.
    wet: (.1 + .4 * clamp((m - 1.5) / 12, 0, 1)) * (1 - .9 * absorb) * (1 - clamp(occlusion / 48, 0, 1)) * (monitoring ? .25 : 1),
    position: { x: Math.sin(b) * orbit, y: clamp(riseM, -12, 12), z: -Math.cos(b) * orbit },
    needle: monitoring ? clamp(.42 * level, 0, .4) : 0,
    shake: heavy && m <= F.shakeMetres ? F.shake * nearness : 0,
    caption: heavy && heard <= F.captionMetres,
  });
}

export function hushFootfallCaption({ kind = 'plant', bearing = 0, occlusionDb = 0 } = {}) {
  const b = Math.atan2(Math.sin(number(bearing)), Math.cos(number(bearing))), abs = Math.abs(b);
  const where = abs < Math.PI / 4 ? 'AHEAD' : abs > Math.PI * 3 / 4 ? 'BEHIND YOU' : b > 0 ? 'TO YOUR RIGHT' : 'TO YOUR LEFT';
  const what = kind === 'pivot' ? 'A FOOT TURNS' : kind === 'blocked' ? 'A WEIGHT MEETS SOMETHING' : 'A HEAVY STEP';
  return `${what}, ${number(occlusionDb) >= 6 ? 'THROUGH THE WALL, ' : ''}${where}`;
}
