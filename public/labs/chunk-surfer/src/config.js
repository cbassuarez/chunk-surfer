// ── Config ── extracted verbatim from index.html (M0 module split) ─────────
export const CONCURRENCY  = 8;
export const SURF_AT      = 14;
export const FADE_SEC     = 0.5;
export const FOG_R        = 16;
export const FULL_FIELD_VISIBLE = false;
export const TRAIL_LEN    = 100;
export const POLY_MAX     = 24;
export const MOVE_MS      = 90;
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
  introDistanceSteps: 42,
  speedStartMs: 220,
  speedEndMs: 68,
  ambientStart: 0.01,
  ambientEnd: 0.095,
  primaryGateDist: 5,
  finalGateDist: 42,
  funnelStartDist: 6,
  funnelLength: 36,
  funnelWidthStart: 7,
  funnelWidthEnd: 0,
  fogReleaseRadius: 6,
  // Phase boundaries as fractions of introProgress(); referenced by visuals/audio.
  voidEnd: 0.25,
  thresholdStart: 0.85
};

// World-boundary friction: only active right at seams between worlds.
// Hysteresis + dither keep it tactile without broad sluggish thresholds.
export const WORLD_BOUNDARY_FRICTION = {
  enterDist: 2,
  exitDist: 5,
  fullDist: 1,
  maxMult: 1.42,
  rampIn: 0.34,
  rampOut: 0.16,
  dither: 0.22
};
// Void trudge: sustained wilderness travel gets progressively heavier.
export const VOID_TRUDGE = {
  startPenalty: 1.02,
  maxPenalty: 1.45,
  buildPerStep: 0.05,
  decayPerStep: 0.22
};
export const VOID_SINK = {
  startFatigue: 0.82,
  maxFatigue: 1.0,
  lateralChanceMin: 0.04,
  lateralChanceMax: 0.22,
  pureLateralBonus: 0.08
};

// Per-sample visual terrain radius (renders glyphs around the chunk).
export const TERRAIN_R_MIN = 10;
export const TERRAIN_R_MAX = 26;
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
export const CHUNK_MIN_SEP = 4;

// Audible radius (proximity falloff & candidate selection) — wide enough that
// many samples overlap audibly wherever you stand. Big AUDIO_R + the cosine
// falloff in proxFor() means many chunks contribute non-zero gain at once;
// the per-chunk dedupe + POLY_MAX cap keeps total active voices bounded.
export const AUDIO_R = 110;
export const WORLD_TILE_SCALE_X = 2.8;
export const WORLD_TILE_SCALE_Y = 2.2;
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
export const WORLD_LAYER = {
  range: 30,
  minGain: 0.0,
  maxGain: 0.14
};

