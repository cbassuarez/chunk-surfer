// ── Config ── extracted verbatim from index.html (M0 module split) ─────────
import { CELL, PLAN_SCALE } from './data/floorplan/legend.js';

export const CELL_METERS = CELL;
export const CELL_SCALE = PLAN_SCALE;
const D = CELL_SCALE;
const T = 1 / CELL_SCALE;
const dist = (n) => n * D;
const ms = (n) => Math.max(1, Math.round(n * T));

export const CONCURRENCY  = 8;
export const SURF_AT      = 14;
export const FADE_SEC     = 0.5;
export const FOG_R        = dist(16);
export const FULL_FIELD_VISIBLE = false;
export const TRAIL_LEN    = 100;
export const POLY_MAX     = 24;
export const MOVE_MS      = ms(90);
export const RMS_TARGET   = 0.12;
export const ONBOARDING_PHASES = {
  INTRO_PRELUDE: 'intro_prelude',
  INTRO_FUNNEL: 'intro_funnel',
  INTRO_DISABLED_SESSION: 'intro_disabled_session',
  WORLD_LIVE: 'world_live'
};
export const INTRO_SCENE = {
  worldId: 'main_b3',
  forwardDx: 0,
  forwardDy: -1,
  introDistanceSteps: dist(42),
  speedStartMs: ms(220),
  speedEndMs: ms(68),
  ambientStart: 0.01,
  ambientEnd: 0.095,
  primaryGateDist: dist(5),
  finalGateDist: dist(42),
  funnelStartDist: dist(6),
  funnelLength: dist(36),
  funnelWidthStart: dist(7),
  funnelWidthEnd: 0,
  fogReleaseRadius: dist(6),
  // Phase boundaries as fractions of introProgress(); referenced by visuals/audio.
  voidEnd: 0.25,
  thresholdStart: 0.85
};

// World-boundary friction: only active right at seams between worlds.
// Hysteresis + dither keep it tactile without broad sluggish thresholds.
export const WORLD_BOUNDARY_FRICTION = {
  enterDist: dist(2),
  exitDist: dist(5),
  fullDist: dist(1),
  maxMult: 1.42,
  rampIn: 0.34,
  rampOut: 0.16,
  dither: 0.22
};
// Void trudge: sustained wilderness travel gets progressively heavier.
export const VOID_TRUDGE = {
  startPenalty: 1.02,
  maxPenalty: 1.45,
  buildPerStep: 0.05 * T,
  decayPerStep: 0.22 * T
};
export const VOID_SINK = {
  startFatigue: 0.82,
  maxFatigue: 1.0,
  lateralChanceMin: 0.04,
  lateralChanceMax: 0.22,
  pureLateralBonus: 0.08
};

// Per-sample visual terrain radius (renders glyphs around the chunk).
export const TERRAIN_R_MIN = dist(10);
export const TERRAIN_R_MAX = dist(26);
export const TERRAIN_EMITTERS = {
  minSatellites: 1,
  maxSatellites: 5,
  radiusFracMin: 0.22,
  radiusFracMax: 0.78,
  gainMin: 0.42,
  gainMax: 0.82
};

// World packing: tighter canvas + lower minimum chunk separation so travel is
// dense and biome transitions happen quickly.
export const WORLD_SCALE_X = 2.2;
export const WORLD_SCALE_Y = 2.2;
export const CHUNK_MIN_SEP = dist(4);

// Audible radius (proximity falloff & candidate selection) — wide enough that
// many samples overlap audibly wherever you stand. Big AUDIO_R + the cosine
// falloff in proxFor() means many chunks contribute non-zero gain at once;
// the per-chunk dedupe + POLY_MAX cap keeps total active voices bounded.
export const AUDIO_R = dist(110);
export const WORLD_TILE_SCALE_X = 2.8 * D;
export const WORLD_TILE_SCALE_Y = 2.2 * D;
export const WORLD_SPREAD_MIN = 0.2;
export const WORLD_SPREAD_MAX = 0.68;

// Hierarchical voice weighting (applied on top of proximity × baseVol).
// Softer cross-biome attenuation so blends are audible polyphony, not just hints.
export const W_BIOME_SAME    = 1.00;  // same biome
export const W_BIOME_OTHER   = 0.55;  // different biome, same world
export const W_BIOME_FOREIGN = 0.25;  // different world

// Ambient drone — bit-crushed noise bed that always plays under the polyphony.
export const AMBIENT_DRONE_GAIN = 0.028;
export const AMBIENT_BIT_LEVELS = 8;   // 8 quantisation steps per side (~3-bit feel)
export const AMBIENT_LOOP_SEC   = 4;
// ── ROOM TONE ────────────────────────────────────────────────────────────────
// The game's audio posture, and the inverse of the lab's. Walking the building
// is near-silent: footsteps and a room-tone floor, nothing else. The catalog is
// audible ONLY through the recorder's monitor — you must stop, put the light
// away, and listen, which is exactly when you are helpless.
//
// Silence is the floor. Addition detonates.
export const ROOM_TONE = {
  bedGain: 0.010,        // the noise floor of an empty room
  monitorRadius: dist(96), // cells. The chunk field is sparse: a tight radius
                         // finds nothing at all. Sparseness comes from
                         // monitorPoly, not from the radius.
  monitorNear: dist(38), // falloff scale of the monitor's own curve
  monitorPoly: 4,        // voices; the lab uses POLY_MAX = 24
  monitorGain: 1.15,     // headphones are louder than the room
  monitorFadeSec: 1.1,   // the monitor opens slowly, like a hand on a fader
  takeSeconds: 45,       // an unbroken clean minute, near enough
  spoilNoise: 0.18,      // noise above this ruins the take
  catchNoise: 0.40,      // noise above this doesn't just ruin the take — it
                         // finds you. A footstep (0.22) or a lone squelch
                         // (0.34) spoils; a shout (0.5), or a squelch stacked
                         // on top of a step, is loud enough to be caught.
};

// Noise is the axis the presence hunts on. Injury adds to it permanently.
export const NOISE = {
  still: 0.0,
  slow: 0.06,            // Shift
  walk: 0.22,
  perInjury: 0.09,       // a limp is loud, and loud is what finds you
  decayPerSec: 0.45,     // how fast the world forgets where you were. Slow
                         // enough that a footfall hangs in the air for a second.
};

export const WORLD_LAYER = {
  range: dist(30),
  minGain: 0.0,
  maxGain: 0.14
};
