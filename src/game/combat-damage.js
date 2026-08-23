// How much a blow is worth, and how well it was thrown.
//
// Every outgoing number in signal combat used to be a literal: EXPOSE was 2,
// WHITEOUT was 4, and the only thing that ever moved them was the ±1 stance
// shift. Landing a hit therefore told the player nothing about how well they had
// played the beat — the fight had a skill test in it (the counter triangle) and
// no way to feel the difference between passing it and scraping through.
//
// A hit is a BAND now, and where inside the band it lands is EARNED. This module
// owns that arithmetic and nothing else: it knows no combat state, imports
// nothing from the reducer, and every input is passed in. That keeps it pure,
// keeps the module graph acyclic, and makes the whole quality curve testable
// without standing up an encounter.
//
// The two halves of the roll, and why it is split this way:
//
//   FLOOR is skill.  Reading the opponent, holding the right stance, spending a
//                    beat on the fork, setting up before you cash in — each one
//                    lifts the bottom of the band. A player who does all of it
//                    cannot roll badly, because the bad end of the band is no
//                    longer reachable.
//   DRAW  is texture. What remains above the floor is decided by the encounter's
//                    deterministic per-beat hash, so the same night replays byte
//                    for byte and nobody is ever cheated by a die they cannot see.
//
// The consequence is the one the design wanted: the player controls the
// DISTRIBUTION, never the individual roll. "I know this will hit better than my
// regular" is answerable; "I know it will do 12" is not.

// ── the grid ────────────────────────────────────────────────────────────────
// One point of coherence used to be a fifth of a phase. Bands need room to read
// as miss / graze / clean / good / critical, so the whole grid was multiplied by
// GRID: a phase is 25 rather than 5, a torch swing 8–12 rather than a flat 2.
// The number of turns a fight takes is unchanged — only the resolution is finer.
export const GRID = 5;

export const HIT_QUALITY = Object.freeze({
  MISS: 'miss',
  GRAZE: 'graze',
  CLEAN: 'clean',
  GOOD: 'good',
  CRITICAL: 'critical',
});

// Where the tier lines sit, as a fraction of the band. Read off the FULL band
// rather than off the part left above the floor, which is the whole point: lift
// the floor past 0.20 and GRAZE stops being a thing that can happen to you.
const QUALITY_STEPS = Object.freeze([
  { at: 0.20, quality: HIT_QUALITY.GRAZE },
  { at: 0.55, quality: HIT_QUALITY.CLEAN },
  { at: 0.85, quality: HIT_QUALITY.GOOD },
]);

// What each tier is called in front of the player, and how hard the presentation
// layer should hit for it. `weight` scales the existing screen shake / glitch /
// knock so a critical is felt and not merely read.
export const QUALITY_PRESENTATION = Object.freeze({
  [HIT_QUALITY.MISS]: Object.freeze({ label: 'MISS', weight: 0 }),
  [HIT_QUALITY.GRAZE]: Object.freeze({ label: 'GRAZE', weight: 0.45 }),
  [HIT_QUALITY.CLEAN]: Object.freeze({ label: '', weight: 1 }),
  [HIT_QUALITY.GOOD]: Object.freeze({ label: 'GOOD', weight: 1.35 }),
  [HIT_QUALITY.CRITICAL]: Object.freeze({ label: 'CRITICAL', weight: 2 }),
});

// ── what lifts the floor ────────────────────────────────────────────────────
// Named so the reducer never sprinkles bare fractions, and so the balance pass
// has one table to argue with. They sum and clamp: doing everything right is
// worth a floor near the top of the band, not above it.
export const EARNED = Object.freeze({
  // Answering the committed intent with the move that counters its kind. The
  // fight's central skill, and priced as such.
  PERFECT_COUNTER: 0.30,
  // Acting from the stance the move belongs in — a torch swing thrown from
  // NOISE, a capture taken from SIGNAL. Rewards sequencing, not single beats.
  STANCE_ALIGNED: 0.20,
  // The fork was struck this movement, so the read cannot be wrong. Paying a
  // beat for certainty should show up in the damage, not only in the card.
  TUNE_HELD: 0.15,
  // Residue on the target: EXPOSE before PLAYBACK. Setting up, then cashing in.
  SETUP: 0.20,
});

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value, 0)));

// A band, normalized. Bands are always integers in grid units and never invert.
export function makeBand(min, max = min) {
  const lo = Math.max(0, Math.round(finite(min, 0)));
  const hi = Math.max(lo, Math.round(finite(max, lo)));
  return { min: lo, max: hi };
}

// Build a band around a centre. `spread` is a fraction of the centre, so a band
// widens with the size of the blow and a 5-point chip does not get a ±4 swing.
export function bandAround(centre, spread = 0.2) {
  const mid = Math.max(0, finite(centre, 0));
  const half = mid * Math.max(0, finite(spread, 0));
  return makeBand(mid - half, mid + half);
}

// THE RULE EVERY BAND IN THE GAME IS BUILT WITH.
//
// The floor of a band is what the move used to GUARANTEE, and the range above it
// is upside the player earns. Centring the band on the old value instead was the
// first attempt, and it was a quiet nerf: a move whose damage was certain became
// a move whose damage was certain ON AVERAGE, which over a whole encounter is a
// real loss and which tipped the meaner presets from winnable to not.
//
// Framing it this way also makes the tile honest in the direction that matters.
// "8–12" invites a player to plan around 8 and feel cheated by it. "10–15" tells
// them the truth: the worst case is the deal they already had.
export function bandFrom(base, upside = 0.4) {
  const floor = Math.max(0, finite(base, 0));
  if (floor <= 0) return makeBand(0, 0);
  return makeBand(floor, Math.max(floor + 1, Math.round(floor * (1 + Math.max(0, finite(upside, 0))))));
}

// Move a whole band without changing its width. This is how stance modifies
// damage now: NOISE lifts the band, SILENCE drops it. Folding the shift into the
// band rather than adding it to the finished number keeps the tile honest —
// what the player is shown is the range that will actually be rolled.
export function shiftBand(band, delta) {
  const source = makeBand(band?.min, band?.max);
  const step = Math.round(finite(delta, 0));
  return makeBand(Math.max(0, source.min + step), Math.max(0, source.max + step));
}

// Narrow a band toward its top. For the moves whose whole promise is that they
// are dependable — the definitive capture is not allowed to come out a graze.
export function tightenBand(band, keep = 0.5) {
  const source = makeBand(band?.min, band?.max);
  const width = source.max - source.min;
  return makeBand(source.max - width * clamp01(keep), source.max);
}

export function bandWidth(band) {
  const source = makeBand(band?.min, band?.max);
  return source.max - source.min;
}

// Where a value sits in its band, 0..1. A zero-width band is wholly "clean":
// it never varied, so grading it would be inventing information.
export function bandPosition(band, value) {
  const source = makeBand(band?.min, band?.max);
  const width = source.max - source.min;
  if (width <= 0) return 0.5;
  return clamp01((finite(value, source.min) - source.min) / width);
}

export function qualityAt(position) {
  const p = clamp01(position);
  for (const step of QUALITY_STEPS) if (p < step.at) return step.quality;
  return HIT_QUALITY.CRITICAL;
}

export function qualityFor(band, value) {
  return qualityAt(bandPosition(band, value));
}

// ── the roll ────────────────────────────────────────────────────────────────
// `earned` is the summed skill fractions above; `draw` is the caller's
// deterministic 0..1 for this beat. Nothing in here reads a clock or a global
// RNG, so a fight is a pure function of its seed and the player's inputs.
export function resolveHit(band, { earned = 0, draw = 0 } = {}) {
  const source = makeBand(band?.min, band?.max);
  const width = source.max - source.min;
  if (width <= 0) {
    return { value: source.min, quality: HIT_QUALITY.CLEAN, floor: source.min, band: source, earned: clamp01(earned) };
  }
  const skill = clamp01(earned);
  const floor = source.min + width * skill;
  const value = Math.round(floor + clamp01(draw) * (source.max - floor));
  return {
    value,
    quality: qualityFor(source, value),
    floor: Math.round(floor),
    band: source,
    earned: skill,
  };
}

// The one place a band becomes player-facing text, so a tile and a tooltip can
// never disagree about what a move is worth.
export function bandText(band, { unit = '' } = {}) {
  const source = makeBand(band?.min, band?.max);
  const range = source.min === source.max ? `${source.min}` : `${source.min}–${source.max}`;
  return unit ? `${range} ${unit}` : range;
}
