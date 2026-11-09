// How fast the recordist moves, in metres per second, and what it costs him.
//
// THE LADDER. Five gaits in world metres, tuned for responsive exploration
// and pursuit. The faster walking, jogging, running and sprinting paces share
// one ladder across the world and self-contained scenes. "Crawl" remains the
// pace of somebody putting each foot down where they can see it.
//
// TWO SPEEDS PER PLACE. A place never offers all five. It offers its walk on
// the movement keys and its run on the run key, and which two rungs those are
// belongs to the place (Seb, 2026-11-06):
//
//   tight / wading     crawl  · walk     pool water, the bus's body, the belfry
//   interiors          walk   · jog      rooms, corridors, basement, stairs
//   exteriors          walk   · run      yard, road, square, streets, coast
//   any live chase     walk   · sprint   and sprint runs out on breath
//   authored walks     their own pace; the run key does nothing
//
// There is no quiet key any more. Walking IS the quiet choice: the footfall
// price climbs with the gait, so running is a decision about being heard.
//
// The grid still owns collision and every gameplay receipt. This module only
// says how many metres a second the body is allowed, so a half-metre cell is
// one cell at any gait and a diagonal is the diagonal's real length.

export const GAIT_ORDER = Object.freeze(['crawl', 'walk', 'jog', 'run', 'sprint']);

export const GAIT_SPEED = Object.freeze({
  crawl: 0.7,
  walk: 2.6,
  jog: 3.6,
  run: 5.2,
  sprint: 7.5,
});

// What one accepted step costs on the recordist's noise envelope — the number
// the HUSH, the take and the monitor hear. The old walk was .22 and the old
// quiet step .06; the new walk sits between them because walking is now the
// careful choice, and today's walk price moves up to the jog.
export const GAIT_NOISE = Object.freeze({
  crawl: 0.06,
  walk: 0.12,
  jog: 0.22,
  run: 0.32,
  sprint: 0.45,
});

export const PLACE_GAITS = Object.freeze({
  tight: Object.freeze(['crawl', 'walk']),
  interior: Object.freeze(['walk', 'jog']),
  exterior: Object.freeze(['walk', 'run']),
  chase: Object.freeze(['walk', 'sprint']),
});

export const PLACE_KINDS = Object.freeze(['tight', 'interior', 'exterior', 'authored']);

// THE BREATH. There is no stamina bar and there never will be one — the game
// already refuses an oxygen meter (hypoxia.js) for the same reason. A sprint
// lasts six to eight seconds, then the legs drop him to a run on their own and
// you hear him. Fear spends it faster. Walking (or standing) gives it back in
// about ten seconds; a jog gives it back slowly; a run neither spends nor
// returns it. Once winded, the run key cannot find a sprint again until he has
// half of it back, so the drop is a state you walk out of, not a flicker.
export const BREATH = Object.freeze({
  calmSprintSeconds: 8,
  afraidSprintSeconds: 6,
  // Drawn once per run, so the length of a sprint is his tonight and never a
  // number to learn.
  spreadSeconds: 0.5,
  restRecoverSeconds: 10,
  jogRecoverSeconds: 30,
  sprintAgainAt: 0.5,
  // How the audible breath follows the reserve: silent above this much left.
  audibleBelow: 0.85,
});

// Authored walks and slow modifiers may go below a crawl; nothing may stop the
// body outright through a speed (that is a lock, and locks are explicit), and
// nothing may exceed the sprint.
export const SPEED_FLOOR = 0.25;
export const SPEED_CEILING = GAIT_SPEED.sprint;

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function normalizePlace(place) {
  return PLACE_KINDS.includes(place) ? place : 'interior';
}

export function gaitsForPlace(place, { chase = false } = {}) {
  const kind = normalizePlace(place);
  if (kind === 'authored') return null;
  // A tight place stays tight in a chase: you cannot sprint through water.
  if (chase && kind !== 'tight') return PLACE_GAITS.chase;
  return PLACE_GAITS[kind];
}

/**
 * The gait the body is in. `run` is the run key; `winded` is breath.winded.
 * Authored places have no gait of their own — the caller owns that pace.
 */
export function chooseGait({ place = 'interior', run = false, chase = false, winded = false } = {}) {
  const pair = gaitsForPlace(place, { chase });
  if (!pair) return 'walk';
  const gait = run ? pair[1] : pair[0];
  return gait === 'sprint' && winded ? 'run' : gait;
}

export function gaitSpeed(gait) {
  return GAIT_SPEED[gait] ?? GAIT_SPEED.walk;
}

export function gaitNoise(gait) {
  return GAIT_NOISE[gait] ?? GAIT_NOISE.walk;
}

/** Product of slow-downs; each factor is a speed multiplier in (0, 1]. */
export function applySpeedFactors(speed, factors = []) {
  let v = finite(speed, GAIT_SPEED.walk);
  for (const factor of factors) {
    const f = finite(factor, 1);
    if (f > 0) v *= f;
  }
  return clamp(v, SPEED_FLOOR, SPEED_CEILING);
}

// ── Scenes that own their keys ───────────────────────────────────────────────
// The self-contained scenes (the pub, Source IV, earthfall, the Ellery aside,
// the continuation, the false return, the coast, first strike) take the same two
// rungs as the place they stand in. A scene that owns a live pursuit also passes
// its chase and breath state, so its run key can reach the shared sprint rung.
export function sceneWalkSpeed(place = 'interior', run = false, { chase = false, winded = false } = {}) {
  return gaitSpeed(chooseGait({ place, run: !!run, chase: !!chase, winded: !!winded }));
}

// Such a scene consumes its keys before the world sees them, so it keeps its own
// run key: Shift while it is down, or a stick click, which latches until the
// movement keys have been at rest for a moment. Same rule as the world's.
export function createSceneRunKey({ restSeconds = 0.22 } = {}) {
  const shifts = new Set();
  let latched = false, rest = 0;
  const isRun = (e) => e?.controllerAction === 'run' || e?.key === 'Shift' || e?.code === 'ShiftLeft' || e?.code === 'ShiftRight';
  const active = () => shifts.size > 0 || latched;
  return {
    key(e) {
      if (!isRun(e)) return false;
      if (e.controllerAction !== 'run') shifts.add(e.code || 'Shift');
      else if (!e.repeat) { latched = !latched; rest = 0; }
      return true;
    },
    keyup(e) {
      if (!isRun(e)) return false;
      if (e.controllerAction !== 'run') shifts.delete(e.code || 'Shift');
      return true;
    },
    update(dt, moving) {
      if (moving) rest = 0;
      else if (latched && (rest += finite(dt)) > restSeconds) latched = false;
      return active();
    },
    active,
    clear() { shifts.clear(); latched = false; rest = 0; },
  };
}

// The sprint is the ceiling for anything the player chooses (applySpeedFactors).
// An authored walk may be older and faster than the ladder, so the interval
// itself only guards against nonsense.
export const AUTHORED_SPEED_LIMIT = 20;

/** Milliseconds for one cardinal cell at this speed. */
export function cellIntervalMs(speedMps, cellMetres = 0.5) {
  const v = clamp(finite(speedMps, GAIT_SPEED.walk), SPEED_FLOOR, AUTHORED_SPEED_LIMIT);
  return (1000 * finite(cellMetres, 0.5)) / v;
}

/** Milliseconds for a grid step of (dx, dy) cells — a diagonal is √2 long. */
export function stepIntervalMs(speedMps, dx = 1, dy = 0, cellMetres = 0.5) {
  return cellIntervalMs(speedMps, cellMetres) * Math.max(1, Math.hypot(finite(dx), finite(dy)));
}

// ── Breath ────────────────────────────────────────────────────────────────

function seedUnit(seed) {
  let h = (Math.floor(finite(seed)) >>> 0) ^ 0x9e3779b9;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function sprintSeconds({ fear = 0, seed = 0 } = {}) {
  const f = clamp(finite(fear), 0, 1);
  const base = BREATH.calmSprintSeconds + (BREATH.afraidSprintSeconds - BREATH.calmSprintSeconds) * f;
  return base + (seedUnit(seed) * 2 - 1) * BREATH.spreadSeconds;
}

export function freshBreath() {
  return { reserve: 1, winded: false, sprinting: false };
}

export function normalizeBreath(value) {
  if (!value || typeof value !== 'object') return freshBreath();
  return {
    reserve: clamp(finite(value.reserve, 1), 0, 1),
    winded: value.winded === true,
    sprinting: value.sprinting === true,
  };
}

/**
 * Advance the breath by dt seconds. `gait` is the gait actually being walked
 * this frame, or null when the body is not travelling (standing recovers like
 * a walk). Pure: returns a new state.
 */
export function stepBreath(previous, dt, { gait = null, fear = 0, seed = 0 } = {}) {
  const state = normalizeBreath(previous);
  const seconds = clamp(finite(dt), 0, 0.25);
  if (gait === 'sprint') {
    state.reserve -= seconds / Math.max(1, sprintSeconds({ fear, seed }));
  } else if (gait === 'jog') {
    state.reserve += seconds / BREATH.jogRecoverSeconds;
  } else if (gait !== 'run') {
    state.reserve += seconds / BREATH.restRecoverSeconds;
  }
  state.reserve = clamp(state.reserve, 0, 1);
  if (state.reserve <= 0) state.winded = true;
  else if (state.winded && state.reserve >= BREATH.sprintAgainAt) state.winded = false;
  state.sprinting = gait === 'sprint';
  return state;
}

/** 0 = silent, 1 = labouring. Presentation only; never a gameplay input. */
export function breathExertion(breath) {
  const state = normalizeBreath(breath);
  const spent = clamp((BREATH.audibleBelow - state.reserve) / BREATH.audibleBelow, 0, 1);
  return state.winded ? Math.max(0.65, spent) : spent;
}
