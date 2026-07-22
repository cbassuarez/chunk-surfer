// The presence.
//
// It cannot be fought, and it cannot be seen properly. It hunts by sound.
//
// The rule that makes this a game rather than a chase: it does not know where
// you are. It knows where you *were* — the cell you left a footfall in. Stand
// still and you deny it a precise sound target, but playtesting established
// that silence cannot make the encounter disappear. Without a sound it stalks
// the player's vicinity; run, and you draw a precise line straight to yourself.
// Injury raises your noise floor, so the more it has hurt you, the more easily
// it finds you again.
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

// The player's sustained rate. Locomotion is one cell per MOVE_MS, so this is
// the number the HUSH's speeds are quoted against — not its own former
// absolutes, which made it six times slower than the man it was hunting.
const PLAYER_CELLS_PER_SEC = 1000 / 45;

export const PRESENCE = {
  spawnDistance: 22 * D,    // close enough to enter the next authored beat
  // It never sprints while it is only circling: this is the weather, and you
  // can always walk out from under it.
  stalkSpeedRatio: 0.20,
  // With a fresh sound or a sighted light it commits, and then it is very
  // nearly as fast as you are. You do not outrun this; you go quiet.
  huntSpeedRatio: 0.62,
  catchRadius: 0.72 * D,
  hearingRadius: 30 * D,    // its initial placement is inside useful earshot
  lightRadius: 16 * D,      // and can see a lit player, if nothing is between you
  memorySec: 5.5,           // a sound remains useful long enough to close ground
  // It does not leave. It loses interest and drifts back out to the far band,
  // which is what `loseInterestSec` was always meant to mean.
  disengageSec: 18,
  // Dread decides how close it circles when it has nothing to chase.
  bandNear: 6 * D,
  bandFar: 34 * D,
  // How much of the room may sit between you before a lit torch stops being a
  // confession. Occlusion arrives in dB from the acoustic model.
  sightOcclusionDb: 6,
  catchCooldownSec: 7.0,    // one touch is one injury, not one per frame
  recoilCells: 12 * D,      // and it withdraws, so the moment can land
  spawnGraceSec: 2.5,       // the arrival reads without postponing the encounter
  visibleRadius: 48 * D,    // dread needs a body, not only a punishment
  dreadRadius: 52 * D,
};

export function stalkSpeed() { return PRESENCE.stalkSpeedRatio * PLAYER_CELLS_PER_SEC; }
export function huntSpeed() { return PRESENCE.huntSpeedRatio * PLAYER_CELLS_PER_SEC; }

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
  lastEngagedAt: 0,          // last noise heard or light seen — drives disengagement
  lastSightedAt: 0,          // last time a lit torch was in its line
  prowlX: 0, prowlY: 0,      // a destination in the world, not an offset from you
  hasProwl: false,
  prowlUntil: 0,
  dwellUntil: 0,             // it arrives, and then it waits
  velocityX: 0,
  velocityY: 0,
  speed: 0,
  motionMode: 'idle',
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
    velocity: { x: state.velocityX, y: state.velocityY },
    speed: state.speed,
    motionMode: state.motionMode,
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
  state.velocityX = 0; state.velocityY = 0; state.speed = 0; state.motionMode = 'idle';
  state.hasProwl = false; state.prowlUntil = 0; state.dwellUntil = 0;
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
export function updatePresence(dt, px, py, onCatch, {
  navigation = null, catchMode = 'normal', dreadLevel = 0, sightOcclusionDb = 0,
} = {}) {
  if (!state.active) return;
  const now = performance.now();
  const rec = REC.recState();

  // 1. Noise. Semantic acoustic events may already have supplied an exact
  // remembered source. The legacy envelope remains as a fail-safe so old and
  // partially initialized builds preserve their authored behaviour.
  const externalFresh = now < state.externalTargetUntil;
  if (!externalFresh && REC.currentWorldNoise() > 0.02) {
    hear(rec.lastNoiseAt.x, rec.lastNoiseAt.y, REC.currentWorldNoise(), now);
    state.lastEngagedAt = now;
  }

  // 2. Light — but only if it can SEE it. A torch through a wall is nothing;
  //    a torch across an open room is an address, and an exact one. This is the
  //    inversion the design turns on: the light does not hold it off, it calls
  //    it. Carrying the dark is the only way to be nobody.
  else if (REC.lightOn()
      && distanceTo(px, py) < PRESENCE.lightRadius
      && sightOcclusionDb <= PRESENCE.sightOcclusionDb) {
    hear(px, py, 0.24, now);
    state.lastSightedAt = now;
    state.lastEngagedAt = now;
  }

  // 3. Interest decays. A sound is only interesting for a few seconds.
  const sinceTarget = (now - state.targetSetAt) / 1000;
  if (state.hasTarget && !externalFresh && sinceTarget > PRESENCE.memorySec * difficultyRules.memoryScale) {
    state.hasTarget = false;
    state.externalTargetPriority = 0;
  }

  // 4. Move. Toward what it last heard or saw; otherwise it circles at a
  //    distance set by how frightened you already are. Dread is the leash: a
  //    calm building keeps it out at the edge of earshot, a bad night walks it
  //    in without it needing to hear anything at all.
  const engaged = (now - (state.lastEngagedAt || 0)) / 1000
    < PRESENCE.disengageSec * difficultyRules.memoryScale;
  let tx = state.targetX, ty = state.targetY;
  let speed = stalkSpeed() * difficultyRules.baseSpeedScale;
  if (state.hasTarget) {
    speed = sinceTarget < 1.5
      ? huntSpeed() * difficultyRules.huntSpeedScale
      : stalkSpeed() * difficultyRules.baseSpeedScale;
  } else {
    // PROWL. The old behaviour put the target at player + orbit, which meant
    // its destination was recomputed from your position every frame: it held a
    // fixed radius and moved only when you moved, because it was welded to you.
    // It now walks to a point in the WORLD and stays committed to it — so it
    // crosses rooms on its own schedule, sometimes away from you, and it stands
    // still when it arrives. Dread only biases where it chooses to go next.
    const pull = Math.max(0, Math.min(1, Number(dreadLevel) || 0));
    const arrived = Math.hypot(state.prowlX - state.x, state.prowlY - state.y) < 1.6 * D;
    const stale = now > (state.prowlUntil || 0);
    if (!state.hasProwl || arrived || stale) {
      if (arrived && !state.dwellUntil) {
        // It stops. A thing that is always walking is a machine; a thing that
        // arrives somewhere and waits is looking for something.
        state.dwellUntil = now + 900 + Math.random() * 2600;
      }
      if (!state.dwellUntil || now >= state.dwellUntil) {
        state.dwellUntil = 0;
        const band = PRESENCE.bandFar + (PRESENCE.bandNear - PRESENCE.bandFar)
          * (engaged ? Math.max(pull, 0.35) : pull);
        // Anchored on you, but only loosely, and then left alone until reached.
        // Each goal is drawn slightly inside the last, so a search that looks
        // aimless is still converging: silence buys you time, never escape.
        const angle = Math.random() * Math.PI * 2;
        const here = distanceTo(px, py);
        const inward = Math.min(band, here * 0.72);
        const reach = Math.max(PRESENCE.bandNear * 0.5, inward * (0.55 + Math.random() * 0.75));
        state.prowlX = px + Math.cos(angle) * reach;
        state.prowlY = py + Math.sin(angle) * reach;
        state.prowlUntil = now + 6000 + Math.random() * 9000;
        state.hasProwl = true;
      }
    }
    tx = state.prowlX; ty = state.prowlY;
    // Dwelling means dwelling: it holds position rather than sliding onward.
    speed = state.dwellUntil && now < state.dwellUntil
      ? 0
      : stalkSpeed() * difficultyRules.baseSpeedScale;
  }
  // Awareness makes it faster forever, but not fast. It learns you, and still
  // remains something you can get away from.
  speed *= 1 + state.awareness * 0.12;

  const dx = tx - state.x, dy = ty - state.y;
  const d = Math.hypot(dx, dy);
  const beforeX=state.x,beforeY=state.y;
  if (d > 0.001) {
    const step = Math.min(d, speed * dt);
    const destination={x:state.x+(dx/d)*step,y:state.y+(dy/d)*step};
    const resolved=navigation?.resolveMove?.({x:state.x,y:state.y},{x:tx,y:ty},step);
    if(resolved&&Number.isFinite(resolved.x)&&Number.isFinite(resolved.y)){
      state.x=resolved.x;state.y=resolved.y;
    }else{
      state.x=destination.x;state.y=destination.y;
    }
  }
  const frameDt=Math.max(.0001,dt);
  state.velocityX=(state.x-beforeX)/frameDt;state.velocityY=(state.y-beforeY)/frameDt;
  state.speed=Math.hypot(state.velocityX,state.velocityY);
  // Standing still with nothing to chase is still stalking — it has arrived
  // somewhere and is waiting. 'idle' is reserved for having a target it is not
  // moving toward, which is the genuinely inert case.
  state.motionMode=!state.hasTarget?'stalk'
    :state.speed<.02?'idle'
    :sinceTarget<1.5?'run':'walk';

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
    if(catchMode!=='source-checkpoint'){
      state.x += (rx / rm) * PRESENCE.recoilCells;
      state.y += (ry / rm) * PRESENCE.recoilCells;
    }
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
