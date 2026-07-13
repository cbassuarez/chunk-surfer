// The presence.
//
// It cannot be fought, and it cannot be seen properly. It hunts by sound.
//
// The rule that makes this a game rather than a chase: it does not know where
// you are. It knows where you *were* — the cell you left a footfall in. Stand
// still and you become a hole in its world. Run, and you draw a line straight
// to yourself. Injury raises your noise floor, so the more it has hurt you,
// the more easily it finds you again.
//
// A flashlight is a second, weaker channel. Light does not tell it where you
// are, only that you are somewhere over there.
//
// This is a refactor of the old `hush` chase (updateHushMotion / punishByHush),
// which already had the right shape: pursuit with a soft, non-lethal capture.
// What changes is what it chases.

import { CELL_SCALE, NOISE } from '../config.js';
import * as REC from './recordist.js';

const D = CELL_SCALE;

export const PRESENCE = {
  spawnDistance: 34 * D,    // cells behind you, out of sight
  baseSpeed: 0.65 * D,      // cells/sec while investigating
  huntSpeed: 1.25 * D,      // cells/sec when it has a fresh sound
  catchRadius: 0.72 * D,
  hearingRadius: 22 * D,    // it only registers noise within this
  lightRadius: 11 * D,      // and can sense a lit player, vaguely, this far
  memorySec: 3.4,          // how long a sound stays interesting
  loseInterestSec: 18,     // with nothing to chase, it drifts and settles
  catchCooldownSec: 8.0,   // one touch is one injury, not one per frame
  recoilCells: 16 * D,      // and it withdraws, so the moment can land
  spawnGraceSec: 4.0,      // enough time to understand it before it can touch
  visibleRadius: 42 * D,    // dread needs a body, not only a punishment
  dreadRadius: 46 * D,
};

let difficultyRules = {
  baseSpeedScale: 1,
  huntSpeedScale: 1,
  hearingScale: 1,
  memoryScale: 1,
};

export function configurePresence(next = {}) {
  difficultyRules = { ...difficultyRules, ...next };
}

export function presenceDifficulty() { return { ...difficultyRules }; }

const state = {
  active: false,
  x: 0, y: 0,
  targetX: 0, targetY: 0,
  hasTarget: false,
  targetSetAt: 0,
  lastHeardAt: 0,
  lastCatchAt: -1e9,
  spawnedAt: -1e9,
  awareness: 0,            // 0..1 — permanent, grows with every capture
  caughtCount: 0,
  externalTargetUntil: 0,
  externalTargetPriority: 0,
};

export function presenceState() { return state; }
export function isActive() { return state.active; }

// Sanitized bridge for sensory systems. It intentionally exposes no search
// mode, attack cooldown, or pathfinding internals.
export function publicSnapshot() {
  return {
    active: state.active,
    position: { x: state.x, y: state.y },
    x: state.x, y: state.y,
    hasTarget: state.hasTarget,
    targetAgeMs: state.hasTarget ? Math.max(0, performance.now() - state.targetSetAt) : Infinity,
    awareness: state.awareness,
  };
}

// Acoustic systems may offer a remembered source location. The presence module
// remains the authority for movement and decides how long that offer matters.
export function offerSoundTarget({ position, level = 0.2, confidence = 0.5, expiresAt = 0, priority = 0.5 } = {}) {
  if (!state.active || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const now = performance.now();
  const p = Math.max(0, Math.min(1, Number(priority) || 0));
  if (now < state.externalTargetUntil && p < state.externalTargetPriority) return false;
  state.targetX = position.x;
  state.targetY = position.y;
  state.hasTarget = true;
  state.targetSetAt = now;
  state.lastHeardAt = now;
  state.externalTargetUntil = Math.max(now + 450, Number(expiresAt) || 0);
  state.externalTargetPriority = p;
  return true;
}

export function spawnBehind(px, py, dirX = 0, dirY = 1) {
  state.active = true;
  state.x = px + dirX * PRESENCE.spawnDistance;
  state.y = py + dirY * PRESENCE.spawnDistance;
  state.hasTarget = false;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
  state.lastHeardAt = performance.now();
  state.spawnedAt = state.lastHeardAt;
}

export function despawn() { state.active = false; state.hasTarget = false; state.externalTargetUntil = 0; state.externalTargetPriority = 0; }

export function distanceTo(px, py) {
  return state.active ? Math.hypot(state.x - px, state.y - py) : Infinity;
}

// How loud you are *to it*, right now. Drives the shader's dread and the mix.
export function pressure(px, py) {
  if (!state.active) return 0;
  const d = distanceTo(px, py);
  return Math.max(0, Math.min(1, 1 - d / (PRESENCE.hearingRadius * difficultyRules.hearingScale)));
}

export function dread(px, py) {
  if (!state.active) return 0;
  const d = distanceTo(px, py);
  return Math.max(0, Math.min(1, 1 - d / PRESENCE.dreadRadius));
}

export function visibleFrom(px, py) {
  return state.active && distanceTo(px, py) <= PRESENCE.visibleRadius;
}

// A sound happened at (x,y). If it is within earshot, that is now the target.
// This is the ONLY way it learns where to go — noise, never the player.
function hear(x, y, level, now) {
  const d = Math.hypot(state.x - x, state.y - y);
  const range = PRESENCE.hearingRadius * difficultyRules.hearingScale * (0.55 + level * 2.2);
  if (d > range) return false;
  state.targetX = x; state.targetY = y;
  state.hasTarget = true;
  state.targetSetAt = now;
  state.lastHeardAt = now;
  return true;
}

// `onCatch` is the game's, not ours: spoil the take, injure, degrade.
export function updatePresence(dt, px, py, onCatch) {
  if (!state.active) return;
  const now = performance.now();
  const rec = REC.recState();

  // 1. Noise. Semantic acoustic events may already have supplied an exact
  // remembered source. The legacy envelope remains as a fail-safe so old and
  // partially initialized builds preserve their authored behaviour.
  const externalFresh = now < state.externalTargetUntil;
  if (!externalFresh && REC.currentWorldNoise() > 0.02) {
    hear(rec.lastNoiseAt.x, rec.lastNoiseAt.y, REC.currentWorldNoise(), now);
  }

  // 2. Light. A lit player is a smear on the dark, not an address: the target
  //    is offset, so it comes *near* you rather than *to* you.
  else if (REC.lightOn() && distanceTo(px, py) < PRESENCE.lightRadius) {
    const jitter = 2.5 * D;
    hear(px + (Math.random() * 2 - 1) * jitter,
         py + (Math.random() * 2 - 1) * jitter, 0.08, now);
  }

  // 3. Interest decays. A sound is only interesting for a few seconds.
  const sinceTarget = (now - state.targetSetAt) / 1000;
  if (state.hasTarget && !externalFresh && sinceTarget > PRESENCE.memorySec * difficultyRules.memoryScale) {
    state.hasTarget = false;
    state.externalTargetPriority = 0;
  }

  // 4. Move. Toward the last sound if it has one; otherwise drift, slowly, in
  //    a way that is not quite random and is never toward you.
  let tx = state.targetX, ty = state.targetY, speed = PRESENCE.baseSpeed * difficultyRules.baseSpeedScale;
  if (state.hasTarget) {
    speed = sinceTarget < 1.5
      ? PRESENCE.huntSpeed * difficultyRules.huntSpeedScale
      : PRESENCE.baseSpeed * difficultyRules.baseSpeedScale;
  } else {
    const wander = (now / 2400) + state.awareness * 3;
    tx = state.x + Math.cos(wander) * 6;
    ty = state.y + Math.sin(wander * 1.31) * 6;
    speed = PRESENCE.baseSpeed * difficultyRules.baseSpeedScale * 0.42;
  }
  // Awareness makes it faster forever, but not fast. It learns you, and still
  // remains something you can get away from.
  speed *= 1 + state.awareness * 0.12;

  const dx = tx - state.x, dy = ty - state.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.001) {
    const step = Math.min(d, speed * dt);
    state.x += (dx / d) * step;
    state.y += (dy / d) * step;
  }

  // 5. Contact. Not death — a spoiled take, an injury, and it knows you better.
  //    Guarded and cooled: without this it touches you on every frame and one
  //    encounter becomes six injuries. It also withdraws afterwards, so the
  //    moment has an after.
  const cooling = (now - state.lastCatchAt) / 1000 < PRESENCE.catchCooldownSec;
  const spawning = (now - state.spawnedAt) / 1000 < PRESENCE.spawnGraceSec;
  if (!cooling && !spawning && distanceTo(px, py) <= PRESENCE.catchRadius) {
    state.lastCatchAt = now;
    state.caughtCount++;
    state.awareness = Math.min(1, state.awareness + 0.18);
    state.hasTarget = false;
    state.externalTargetUntil = 0;
    state.externalTargetPriority = 0;
    // Recoil away along the line between you. If it is standing exactly on you
    // there is no such line, so pick one.
    let rx = state.x - px, ry = state.y - py;
    let rm = Math.hypot(rx, ry);
    if (rm < 0.001) { const a = Math.random() * Math.PI * 2; rx = Math.cos(a); ry = Math.sin(a); rm = 1; }
    state.x += (rx / rm) * PRESENCE.recoilCells;
    state.y += (ry / rm) * PRESENCE.recoilCells;
    state.escapeDir = [rx / rm, ry / rm];   // the game shoves the player the other way
    onCatch?.(state.caughtCount);
  }
}

export function loadPresenceState(saved = {}) {
  state.awareness = saved.awareness || 0;
  state.caughtCount = saved.caughtCount || 0;
  state.spawnedAt = -1e9;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
}
export function savePresenceState() {
  return { awareness: state.awareness, caughtCount: state.caughtCount };
}
