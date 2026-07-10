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

import { NOISE } from '../config.js';
import * as REC from './recordist.js';

export const PRESENCE = {
  spawnDistance: 22,       // cells behind you, out of sight
  baseSpeed: 1.35,         // cells/sec while investigating
  huntSpeed: 2.30,         // cells/sec when it has a fresh sound
  catchRadius: 1.05,
  hearingRadius: 30,       // it only registers noise within this
  lightRadius: 16,         // and can sense a lit player, vaguely, this far
  memorySec: 6.5,          // how long a sound stays interesting
  loseInterestSec: 14,     // with nothing to chase, it drifts and settles
  catchCooldownSec: 3.0,   // one touch is one injury, not one per frame
  recoilCells: 9,          // and it withdraws, so the moment can land
};

const state = {
  active: false,
  x: 0, y: 0,
  targetX: 0, targetY: 0,
  hasTarget: false,
  targetSetAt: 0,
  lastHeardAt: 0,
  lastCatchAt: -1e9,
  awareness: 0,            // 0..1 — permanent, grows with every capture
  caughtCount: 0,
};

export function presenceState() { return state; }
export function isActive() { return state.active; }

export function spawnBehind(px, py, dirX = 0, dirY = 1) {
  state.active = true;
  state.x = px + dirX * PRESENCE.spawnDistance;
  state.y = py + dirY * PRESENCE.spawnDistance;
  state.hasTarget = false;
  state.lastHeardAt = performance.now();
}

export function despawn() { state.active = false; state.hasTarget = false; }

export function distanceTo(px, py) {
  return state.active ? Math.hypot(state.x - px, state.y - py) : Infinity;
}

// How loud you are *to it*, right now. Drives the shader's dread and the mix.
export function pressure(px, py) {
  if (!state.active) return 0;
  const d = distanceTo(px, py);
  return Math.max(0, Math.min(1, 1 - d / PRESENCE.hearingRadius));
}

// A sound happened at (x,y). If it is within earshot, that is now the target.
// This is the ONLY way it learns where to go — noise, never the player.
function hear(x, y, level, now) {
  const d = Math.hypot(state.x - x, state.y - y);
  const range = PRESENCE.hearingRadius * (0.55 + level * 2.2);
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

  // 1. Noise. The cell you left, not the cell you occupy.
  if (REC.currentNoise() > 0.02) {
    hear(rec.lastNoiseAt.x, rec.lastNoiseAt.y, REC.currentNoise(), now);
  }

  // 2. Light. A lit player is a smear on the dark, not an address: the target
  //    is offset, so it comes *near* you rather than *to* you.
  else if (REC.lightOn() && distanceTo(px, py) < PRESENCE.lightRadius) {
    const jitter = 2.5;
    hear(px + (Math.random() * 2 - 1) * jitter,
         py + (Math.random() * 2 - 1) * jitter, 0.08, now);
  }

  // 3. Interest decays. A sound is only interesting for a few seconds.
  const sinceTarget = (now - state.targetSetAt) / 1000;
  if (state.hasTarget && sinceTarget > PRESENCE.memorySec) state.hasTarget = false;

  // 4. Move. Toward the last sound if it has one; otherwise drift, slowly, in
  //    a way that is not quite random and is never toward you.
  let tx = state.targetX, ty = state.targetY, speed = PRESENCE.baseSpeed;
  if (state.hasTarget) {
    speed = sinceTarget < 1.5 ? PRESENCE.huntSpeed : PRESENCE.baseSpeed;
  } else {
    const wander = (now / 2400) + state.awareness * 3;
    tx = state.x + Math.cos(wander) * 6;
    ty = state.y + Math.sin(wander * 1.31) * 6;
    speed = PRESENCE.baseSpeed * 0.42;
  }
  // Awareness makes it faster forever. It learns you.
  speed *= 1 + state.awareness * 0.35;

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
  if (!cooling && distanceTo(px, py) <= PRESENCE.catchRadius) {
    state.lastCatchAt = now;
    state.caughtCount++;
    state.awareness = Math.min(1, state.awareness + 0.34);
    state.hasTarget = false;
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
}
export function savePresenceState() {
  return { awareness: state.awareness, caughtCount: state.caughtCount };
}
