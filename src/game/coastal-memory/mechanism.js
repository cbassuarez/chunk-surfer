// Lyle's music box, as the crash left it. One deterministic model drives the
// cylinder you see, the tines that move, and the audio you hear, so a pin meets
// a tine on screen exactly when that note sounds.
//
// It plays Clair de lune, bars 1-8 (src/data/clair-de-lune-music-box.js, from the
// public domain Mutopia edition). Ordinary cylinder/comb construction (one tine
// per pitch, pins on a brass cylinder, a spring barrel, a fan governor):
// https://www.reuge.com/en/factory/nos-savoirs-faire/mouvements-a-musique-mecanique
//
// What is broken, and how each shows:
// - The winding: the click ratchet slips half way through winding (a whirr and
//   two more clicks), so the spring is short of a full wind.
// - The spring: too weak to finish. The tune slows from the first bar and stops
//   in bar 7, before the cadence: the part that wouldn't play.
// - The gear: three teeth chipped. Twice a turn the cylinder catches, hangs,
//   and lurches forward, smearing the notes it skipped into one.
// - The governor's fan is bent: the speed wobbles.
// - The comb: A5 and Eb6 snapped (their pins tick on the stubs, so the tune has
//   holes where Eb falls), Db6 bent flat, Gb5 bent sharp, Bb5 buzzing against
//   its neighbour.
// - The cylinder: six pins sheared off.
// - When it has stalled, the spring lets go: the cylinder whips back to the
//   start and its pins rake the comb backwards, softly. Then it begins again.
import { CLAIR_DE_LUNE_COMB, CLAIR_DE_LUNE_EVENTS, CLAIR_DE_LUNE_SCORE_SECONDS } from '../../data/clair-de-lune-music-box.js';

const TAU = Math.PI * 2;
const freeze = (v) => Object.freeze(v);
const SCORE = CLAIR_DE_LUNE_SCORE_SECONDS;
export const COASTAL_MUSIC_BOX_TUNE = freeze({ title: 'Clair de lune', composer: 'Claude Debussy', bars: '1-8', from: 'Lyle' });

// The comb: one tine per pitch, lowest at -X. Damage by pitch.
const SNAPPED = new Set([81, 87]), DETUNE = new Map([[85, -45], [78, 32]]), BUZZ = new Set([82]);
const N = CLAIR_DE_LUNE_COMB.length, SPACING = .0153;
export const COASTAL_MUSIC_BOX_COMB = freeze(CLAIR_DE_LUNE_COMB.map((pitch, index) => freeze({
  index, pitch, x: -SPACING * (N - 1) / 2 + index * SPACING,
  // Roots step back along the comb's slanted edge: bass tines are longest.
  rootZ: .062 + .006 * (1 - index / Math.max(1, N - 1)),
  state: SNAPPED.has(pitch) ? 'snapped' : BUZZ.has(pitch) ? 'buzz' : DETUNE.has(pitch) ? 'bent' : 'whole',
  cents: DETUNE.get(pitch) || 0,
})));
const tineOf = new Map(COASTAL_MUSIC_BOX_COMB.map((t) => [t.pitch, t]));
// Pins sheared off the cylinder: by event index in the arrangement.
const MISSING_PINS = new Set([5, 14, 23, 31, 44, 58]);

// The broken drive, integrated once into a lookup: score seconds s(t).
const WIND_CLICKS = [.18, .42, .63, .9, 1.1, 1.75, 1.98], WIND_SLIP = 1.32, MUSIC_START = 2.4;
const GEAR_CATCHES = [9.6, 17.9], CATCH_HANG = .42, CATCH_LURCH = .38;
const STALL_SCORE = .79 * SCORE, BACK_SECONDS = .95, REST_AFTER = 3.4, HOLD_STALLED = 2.6;
function integrate() {
  const dt = 1 / 2000, track = [];
  let t = 0, s = 0, catchIndex = 0, hang = 0, stalledAt = null;
  const lurches = [];
  while (t < MUSIC_START) { track.push(0); t += dt; }
  while (stalledAt == null) {
    // Near tempo while the spring has torque, then it runs down: rate falls as
    // the root of what is left, so it reaches nothing in finite time.
    const left = Math.max(0, 1 - (s / STALL_SCORE) ** 2.6);
    let rate = 1.04 * Math.sqrt(left) * (1 + .07 * Math.sin(TAU * 1.7 * t) + .03 * Math.sin(TAU * 4.3 * t + 1.1));
    if (catchIndex < GEAR_CATCHES.length && s >= GEAR_CATCHES[catchIndex] - .12) {
      hang += dt; rate *= .12;
      if (hang >= CATCH_HANG) { s += CATCH_LURCH; lurches.push({ at: t, score: s }); catchIndex++; hang = 0; }
    }
    s += rate * dt; t += dt; track.push(s);
    if (left <= 0 || (rate < .01 && s > STALL_SCORE * .97)) stalledAt = t;
  }
  const stallScore = s;
  for (let k = 0; k < HOLD_STALLED / dt; k++) { track.push(stallScore); t += dt; }
  const backStart = t;
  // The spring lets go: back to the start, fast then slowing on the stop.
  for (let k = 1; k <= BACK_SECONDS / dt; k++) { const u = k * dt / BACK_SECONDS; track.push(stallScore * (1 - (1 - (1 - u) ** 2.4))); t += dt; }
  for (let k = 0; k < REST_AFTER / dt; k++) { track.push(0); t += dt; }
  return { dt, track, stalledAt, stallScore, backStart, lurches, cycle: Math.ceil(t * 10) / 10 };
}
const DRIVE = integrate();
export const COASTAL_MUSIC_BOX_CYCLE = DRIVE.cycle;
export const COASTAL_MUSIC_BOX_STALL = DRIVE.stalledAt;
export const COASTAL_MUSIC_BOX_STALL_SCORE = DRIVE.stallScore;
export const COASTAL_MUSIC_BOX_SPRING_RELEASE = DRIVE.backStart;
export const COASTAL_MUSIC_BOX_LURCHES = freeze(DRIVE.lurches.map(freeze));
// Score positions where a chipped tooth meets the governor's worm and binds.
export const COASTAL_MUSIC_BOX_GEAR_CATCHES = freeze(GEAR_CATCHES.map((at) => at - .12));
export const COASTAL_MUSIC_BOX_CLICKS = freeze([...WIND_CLICKS]);
export const COASTAL_MUSIC_BOX_WIND_SLIP = WIND_SLIP;

export function coastalMusicBoxPhase(seconds = 0) {
  const t = Number.isFinite(seconds) ? seconds : 0, c = COASTAL_MUSIC_BOX_CYCLE;
  return ((t % c) + c) % c;
}
// Score seconds the cylinder has turned through at this time of the cycle.
export function coastalMusicBoxScoreAt(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), i = Math.min(DRIVE.track.length - 1, Math.max(0, t / DRIVE.dt));
  const a = Math.floor(i), b = Math.min(DRIVE.track.length - 1, a + 1), f = i - a;
  return DRIVE.track[a] + (DRIVE.track[b] - DRIVE.track[a]) * f;
}
export function coastalMusicBoxAngle(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), base = TAU * coastalMusicBoxScoreAt(t) / SCORE;
  // The stalled spring shudders once, torsionally, then holds.
  const d = t - DRIVE.stalledAt;
  return base + (d > 0 && d < .5 ? .002 * Math.sin(d * TAU * 81) * Math.exp(-d * 15) : 0);
}
// How fast the cylinder is turning, in score seconds per second (1 = tempo).
export function coastalMusicBoxRateAt(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), k = Math.min(DRIVE.track.length - 2, Math.max(0, Math.floor(t / DRIVE.dt)));
  return (DRIVE.track[k + 1] - DRIVE.track[k]) / DRIVE.dt;
}
// The winding key turns by itself at the start of each cycle: one ratchet
// tooth (a twelfth of a turn) per click, back three teeth when the click slips,
// and all the way back when the spring lets go.
const KEY_TOOTH = TAU / 12;
function keyTeeth(t) {
  let teeth = 0;
  for (const at of WIND_CLICKS) { if (t >= at) teeth++; else { const into = 1 - (at - t) / .17; if (into > 0) teeth += into ** 2; break; } }
  if (t >= WIND_SLIP) teeth -= 3 * Math.min(1, (t - WIND_SLIP) / .14) ** .5;
  if (t >= DRIVE.backStart) teeth *= Math.max(0, 1 - (t - DRIVE.backStart) / .5) ** 2;
  return teeth;
}
export function coastalMusicBoxKeyAngle(seconds = 0) { return -KEY_TOOTH * keyTeeth(coastalMusicBoxPhase(seconds)); }
// The governor's fan, geared up from the cylinder.
export function coastalMusicBoxFanAngle(seconds = 0) { return TAU * 2.6 * coastalMusicBoxScoreAt(seconds); }
// Where a pin sits on the cylinder, for an event at score seconds s.
export function coastalMusicBoxPinAngle(scoreSeconds) { return TAU * scoreSeconds / SCORE; }

// Every pluck in a cycle: forwards while it plays, softly backwards as the
// spring lets go. A pin passes its tine when the cylinder's score time crosses
// the event's; a sheared pin plays nothing, a snapped tine only ticks.
function crossing(scoreAt, from, to) {
  for (let k = Math.max(1, Math.floor(from / DRIVE.dt)); k < Math.min(DRIVE.track.length, Math.ceil(to / DRIVE.dt)); k++) {
    const a = DRIVE.track[k - 1], b = DRIVE.track[k];
    if ((a < scoreAt && b >= scoreAt) || (a > scoreAt && b <= scoreAt)) return (k - 1 + (scoreAt - a) / (b - a || 1)) * DRIVE.dt;
  }
  return null;
}
const plucks = [];
CLAIR_DE_LUNE_EVENTS.forEach((event, index) => {
  const tine = tineOf.get(event.pitch);
  if (!tine) return;
  const pin = !MISSING_PINS.has(index);
  const forward = crossing(event.at, MUSIC_START - .01, DRIVE.stalledAt + .01);
  if (forward != null && pin) plucks.push(freeze({ at: forward, event: index, pitch: event.pitch, tine: tine.index, voice: event.voice, state: tine.state, cents: tine.cents, direction: 1 }));
  const back = event.at < DRIVE.stallScore ? crossing(event.at, DRIVE.backStart, DRIVE.backStart + BACK_SECONDS + .01) : null;
  if (back != null && pin) plucks.push(freeze({ at: back, event: index, pitch: event.pitch, tine: tine.index, voice: event.voice, state: tine.state, cents: tine.cents, direction: -1 }));
});
plucks.sort((a, b) => a.at - b.at);
export const COASTAL_MUSIC_BOX_PLUCKS = freeze(plucks);
export const COASTAL_MUSIC_BOX_EVENTS = freeze(CLAIR_DE_LUNE_EVENTS.map((event, index) => freeze({ ...event, index, pinMissing: MISSING_PINS.has(index), tine: tineOf.get(event.pitch)?.index ?? -1 })));
const plucksByTine = COASTAL_MUSIC_BOX_COMB.map((t) => plucks.filter((p) => p.tine === t.index && p.state !== 'snapped').map((p) => p.at));

export const COASTAL_MUSIC_BOX_MECHANISM = freeze({
  cylinderCenter: freeze([0, .086, -.032]), cylinderRadius: .026, pinRadius: .0295,
  cylinderHalfLength: .108, gearCenter: freeze([.1265, .086, -.032]),
  contactAngle: 1.9, tineThickness: .0017, tineWidth: .0085,
  // Spring barrel behind the cylinder; its arbor runs out through the -X wall
  // to the key. The governor arbor stands behind the gear.
  barrelCenter: freeze([-.095, .068, -.088]), barrelRadius: .019, keyCenter: freeze([-.15, .068, -.088]),
  fanCenter: freeze([.127, .116, -.0705]), wormAngle: -Math.PI / 2, gearTeeth: 24,
  liveTines: freeze(COASTAL_MUSIC_BOX_COMB.filter((t) => t.state !== 'snapped').map((t) => freeze({ index: t.index, x: t.x, pitch: t.pitch, rootZ: t.rootZ, state: t.state, bend: t.state === 'bent' ? Math.sign(t.cents) * .022 : 0 }))),
});
export function coastalMusicBoxMechanism(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), m = COASTAL_MUSIC_BOX_MECHANISM;
  const tipY = m.cylinderCenter[1] + Math.cos(m.contactAngle) * m.pinRadius;
  const tipZ = m.cylinderCenter[2] + Math.sin(m.contactAngle) * m.pinRadius;
  const angle = coastalMusicBoxAngle(t);
  return {
    phase: t, cylinderAngle: angle, gearAngle: angle, score: coastalMusicBoxScoreAt(t),
    keyAngle: coastalMusicBoxKeyAngle(t), fanAngle: coastalMusicBoxFanAngle(t),
    liveTines: m.liveTines.map((tine) => {
      const times = plucksByTine[tine.index];
      let last = null;
      for (const at of times) { if (at <= t) last = at; else break; }
      const d = last == null ? -1 : t - last, buzz = tine.state === 'buzz' ? 1.8 : 1;
      return { ...tine, tipY, tipZ, length: tine.rootZ - tipZ,
        // A sub-millimetre settling envelope, rather than frame-aliased pitch.
        deflection: d >= 0 && d < 1 ? .012 * buzz * Math.sin(d * TAU * 32) * Math.exp(-d / .17) : 0 };
    }),
  };
}
