// The presence.
//
// It cannot be fought, and it cannot be seen properly. It hunts by sound.
//
// The rule that makes this a game rather than a homing missile: it never knows
// the player transform. It keeps a fallible belief about sounds in the
// building. Footsteps, the live monitor, and the little electrical complaint
// of a flashlight can update that belief. Silence leaves it searching the last
// place it heard, not silently following an invisible player marker.
//
// This is a refactor of the old `hush` chase (updateHushMotion / punishByHush),
// which already had the right shape: pursuit with a soft, non-lethal capture.
// What changes is what it chases.

import { CELL_SCALE, NOISE } from '../config.js';
import * as REC from './recordist.js';
import {
  freshHushContactDirectorState,
  normalizeHushContactDirectorState,
} from './hush-contact.js';

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
  // A pinpoint sound can produce a short pursuit burst, broken by moments in
  // which it stops to listen. Sustained hot noise keeps renewing the burst.
  huntSpeedRatio: 0.56,
  investigateSpeedRatio: 0.28,
  limpSpeedRatio: 0.14,
  catchRadius: 0.72 * D,
  hearingRadius: 30 * D,    // its initial placement is inside useful earshot
  lightRadius: 16 * D,      // useful radius of the torch's filament/driver hum
  lightHumMinIntervalMs: 850,
  lightHumMaxIntervalMs: 1650,
  memorySec: 5.5,           // a sound remains useful long enough to close ground
  // It does not leave. It loses interest and drifts back out to the far band,
  // which is what `loseInterestSec` was always meant to mean.
  disengageSec: 18,
  // Dread decides how close it circles when it has nothing to chase.
  bandNear: 6 * D,
  bandFar: 34 * D,
  catchCooldownSec: 7.0,    // one touch is one injury, not one per frame
  recoilCells: 12 * D,      // and it withdraws, so the moment can land
  spawnGraceSec: 2.5,       // the arrival reads without postponing the encounter
  visibleRadius: 48 * D,    // dread needs a body, not only a punishment
  dreadRadius: 52 * D,
  // Semantic monitor bands own ordinary player-noise acquisition. This is the
  // legacy-envelope fail-safe for partially initialized builds: regular
  // footsteps stay below it and therefore do nothing.
  noiseClueThreshold: 0.34,
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
  targetLevel: 0,
  targetConfidence: 0,
  targetReason: null,
  targetPriority: 0,
  targetSetAt: 0,
  lastHeardAt: 0,
  lastCatchAt: -1e9,
  spawnedAt: -1e9,
  awareness: 0,            // 0..1 — permanent, grows with every capture
  caughtCount: 0,
  externalTargetUntil: 0,
  externalTargetPriority: 0,
  lastEngagedAt: 0,
  lastSoundX: 0, lastSoundY: 0,
  hasSearchOrigin: false,
  prowlX: 0, prowlY: 0,      // a destination in the world, not an offset from you
  hasProwl: false,
  prowlUntil: 0,
  dwellUntil: 0,             // it arrives, and then it waits
  velocityX: 0,
  velocityY: 0,
  speed: 0,
  motionMode: 'idle',
  behaviorMode: 'stand',
  phaseUntil: 0,
  chaseUntil: 0,
  directorIntent: 'IGNORE',
  tauntRequested: false,
  nextLightListenAt: 0,
  spawnSector: null,
  contactSerial: 0,
  pendingContact: null,
  contactDirector: freshHushContactDirectorState(),
};

// An authored tableau borrows the real body without lending the scene any of
// the pursuit state underneath it. External sound can keep driving the monitor
// while all presence mutation and ordinary contact remain frozen.
let tableau = null;

const remainingMs = (at, now) => Math.max(0, Math.min(120000, (Number(at) || 0) - now));
const ageMs = (at, now) => Math.max(0, Math.min(120000, now - (Number(at) || now)));

export function presenceTableauActive() { return !!tableau; }

export function capturePresenceTableauState(now = performance.now()) {
  return {
    schema: 1,
    active: !!state.active,
    x: state.x, y: state.y,
    targetX: state.targetX, targetY: state.targetY, hasTarget: !!state.hasTarget,
    targetLevel: state.targetLevel, targetConfidence: state.targetConfidence,
    targetReason: state.targetReason, targetPriority: state.targetPriority,
    targetAgeMs: ageMs(state.targetSetAt, now),
    lastHeardAgeMs: ageMs(state.lastHeardAt, now),
    lastEngagedAgeMs: ageMs(state.lastEngagedAt, now),
    lastCatchAgeMs: ageMs(state.lastCatchAt, now),
    spawnedAgeMs: ageMs(state.spawnedAt, now),
    externalTargetPriority: state.externalTargetPriority,
    lastSoundX: state.lastSoundX, lastSoundY: state.lastSoundY, hasSearchOrigin: !!state.hasSearchOrigin,
    prowlX: state.prowlX, prowlY: state.prowlY, hasProwl: !!state.hasProwl,
    velocityX: state.velocityX, velocityY: state.velocityY, speed: state.speed,
    escapeDir: Array.isArray(state.escapeDir)?[...state.escapeDir]:null,
    motionMode: state.motionMode, behaviorMode: state.behaviorMode,
    directorIntent: state.directorIntent, tauntRequested: !!state.tauntRequested,
    spawnSector: state.spawnSector,
    contactDirector: contactDirectorState(),
    remaining: {
      externalTarget: remainingMs(state.externalTargetUntil, now),
      prowl: remainingMs(state.prowlUntil, now),
      dwell: remainingMs(state.dwellUntil, now),
      phase: remainingMs(state.phaseUntil, now),
      chase: remainingMs(state.chaseUntil, now),
      nextLightListen: remainingMs(state.nextLightListenAt, now),
    },
  };
}

export function beginPresenceTableau({ x, y, snapshot = null } = {}) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
  if (!tableau) tableau = { snapshot: snapshot || capturePresenceTableauState() };
  else if (snapshot) tableau.snapshot = snapshot;
  state.active = true;
  state.x = Number(x); state.y = Number(y);
  state.velocityX = 0; state.velocityY = 0; state.speed = 0;
  state.motionMode = 'idle'; state.behaviorMode = 'stand';
  state.hasTarget = false; state.targetLevel = 0; state.targetConfidence = 0;
  state.targetReason = null; state.targetPriority = 0;
  state.externalTargetUntil = 0; state.externalTargetPriority = 0;
  state.hasProwl = false; state.pendingContact = null;
  state.directorIntent = 'IGNORE'; state.tauntRequested = false;
  return tableau.snapshot;
}

export function restorePresenceTableau(snapshot = tableau?.snapshot, now = performance.now()) {
  tableau = null;
  if (!snapshot?.active) {
    state.active = false;
    state.hasTarget = false;
    state.pendingContact = null;
    return false;
  }
  const remaining = snapshot.remaining || {};
  Object.assign(state, {
    active: true,
    x: Number(snapshot.x) || 0, y: Number(snapshot.y) || 0,
    targetX: Number(snapshot.targetX) || 0, targetY: Number(snapshot.targetY) || 0,
    hasTarget: !!snapshot.hasTarget,
    targetLevel: Number(snapshot.targetLevel) || 0,
    targetConfidence: Number(snapshot.targetConfidence) || 0,
    targetReason: snapshot.targetReason || null,
    targetPriority: Number(snapshot.targetPriority) || 0,
    targetSetAt: now - Math.max(0, Number(snapshot.targetAgeMs) || 0),
    lastHeardAt: now - Math.max(0, Number(snapshot.lastHeardAgeMs) || 0),
    lastEngagedAt: now - Math.max(0, Number(snapshot.lastEngagedAgeMs) || 0),
    lastCatchAt: now - Math.max(0, Number(snapshot.lastCatchAgeMs) || 0),
    spawnedAt: now - Math.max(0, Number(snapshot.spawnedAgeMs) || 0),
    externalTargetUntil: now + Math.max(0, Number(remaining.externalTarget) || 0),
    externalTargetPriority: Number(snapshot.externalTargetPriority) || 0,
    lastSoundX: Number(snapshot.lastSoundX) || 0,
    lastSoundY: Number(snapshot.lastSoundY) || 0,
    hasSearchOrigin: !!snapshot.hasSearchOrigin,
    prowlX: Number(snapshot.prowlX) || 0, prowlY: Number(snapshot.prowlY) || 0,
    hasProwl: !!snapshot.hasProwl,
    prowlUntil: now + Math.max(0, Number(remaining.prowl) || 0),
    dwellUntil: now + Math.max(0, Number(remaining.dwell) || 0),
    velocityX: Number(snapshot.velocityX) || 0, velocityY: Number(snapshot.velocityY) || 0,
    speed: Math.max(0, Number(snapshot.speed) || 0),
    escapeDir: Array.isArray(snapshot.escapeDir)?[Number(snapshot.escapeDir[0])||0,Number(snapshot.escapeDir[1])||0]:null,
    motionMode: snapshot.motionMode || 'idle', behaviorMode: snapshot.behaviorMode || 'stand',
    phaseUntil: now + Math.max(0, Number(remaining.phase) || 0),
    chaseUntil: now + Math.max(0, Number(remaining.chase) || 0),
    directorIntent: snapshot.directorIntent || 'IGNORE',
    tauntRequested: !!snapshot.tauntRequested,
    nextLightListenAt: now + Math.max(0, Number(remaining.nextLightListen) || 0),
    spawnSector: snapshot.spawnSector || null,
    pendingContact: null,
    contactDirector: normalizeHushContactDirectorState(snapshot.contactDirector),
  });
  return true;
}

export function endPresenceTableau({ restore = null, despawn: shouldDespawn = false } = {}) {
  if (!tableau && !restore && !shouldDespawn) return false;
  if (shouldDespawn) {
    tableau = null;
    state.active = false; state.hasTarget = false; state.pendingContact = null;
    state.externalTargetUntil = 0; state.externalTargetPriority = 0;
    return true;
  }
  return restorePresenceTableau(restore || tableau?.snapshot);
}

export function presenceState() { return state; }
export function isActive() { return state.active; }
export function contactDirectorState() { return normalizeHushContactDirectorState(state.contactDirector); }
export function setContactDirectorState(value = {}) {
  if (tableau) return contactDirectorState();
  state.contactDirector = normalizeHushContactDirectorState(value);
  return contactDirectorState();
}

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
    behaviorMode: state.behaviorMode,
    spawnSector: state.spawnSector,
    tableau: !!tableau,
  };
}

// Acoustic systems may offer a remembered source location. The presence module
// remains the authority for movement and decides how long that offer matters.
export function offerSoundTarget({ position, level = 0.2, confidence = 0.5, expiresAt = 0, priority = 0.5, reason = 'SOUND' } = {}) {
  if (tableau) return false;
  if (!state.active || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const now = performance.now();
  const p = Math.max(0, Math.min(1, Number(priority) || 0));
  if (now < state.externalTargetUntil && p < state.externalTargetPriority) return false;
  const certainty = Math.max(0, Math.min(1, Number(confidence) || 0));
  const strength = Math.max(0, Math.min(1, Number(level) || 0));
  // Low-certainty sounds name a patch of room, not a coordinate. The offset is
  // chosen once per offer and then held stable; swimming it every frame would
  // merely be a different kind of player tracking.
  const errorRadius = (1 - certainty) * (3 + (1 - strength) * 9) * D;
  const errorAngle = Math.random() * Math.PI * 2;
  state.targetX = position.x + Math.cos(errorAngle) * errorRadius;
  state.targetY = position.y + Math.sin(errorAngle) * errorRadius;
  state.hasTarget = true;
  state.targetLevel = strength;
  state.targetConfidence = certainty;
  state.targetReason = reason;
  state.targetPriority = p;
  state.targetSetAt = now;
  state.lastHeardAt = now;
  state.lastEngagedAt = now;
  state.lastSoundX = state.targetX;
  state.lastSoundY = state.targetY;
  state.hasSearchOrigin = true;
  state.externalTargetUntil = Math.max(now + 450, Number(expiresAt) || 0);
  state.externalTargetPriority = p;
  const pinpoint = p >= .88 || (certainty >= .82 && strength >= .72);
  if (pinpoint) {
    state.behaviorMode = 'chase';
    state.chaseUntil = now + 1400 + Math.random() * 1900;
    state.phaseUntil = 0;
  } else {
    state.behaviorMode = strength < .42 || certainty < .52 ? 'limp' : 'investigate';
    state.phaseUntil = 0;
  }
  return true;
}

function activateAt(x, y, { sector = null } = {}) {
  if (tableau) return false;
  state.active = true;
  state.x = x;
  state.y = y;
  state.hasTarget = false;
  state.targetLevel = 0;
  state.targetConfidence = 0;
  state.targetReason = null;
  state.targetPriority = 0;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
  state.lastHeardAt = performance.now();
  state.spawnedAt = state.lastHeardAt;
  state.velocityX = 0; state.velocityY = 0; state.speed = 0; state.motionMode = 'idle';
  state.hasProwl = false; state.prowlUntil = 0; state.dwellUntil = 0;
  state.lastSoundX = x; state.lastSoundY = y; state.hasSearchOrigin = true;
  state.behaviorMode = 'stand';
  state.phaseUntil = state.spawnedAt + 1800 + Math.random() * 4600;
  state.chaseUntil = 0;
  state.directorIntent = 'IGNORE';
  state.tauntRequested = false;
  state.nextLightListenAt = state.spawnedAt + 400 + Math.random() * 900;
  state.spawnSector = sector;
  state.pendingContact = null;
  return true;
}

// Compatibility entry point for Source Space and deterministic contact tests.
// Ordinary building play uses spawnInHabitableSpace below.
export function spawnBehind(px, py, dirX = 0, dirY = 1) {
  return activateAt(px + dirX * PRESENCE.spawnDistance, py + dirY * PRESENCE.spawnDistance, { sector: 'legacy' });
}

export function spawnInHabitableSpace(px, py, {
  navigation,
  forwardX = 0,
  forwardY = -1,
  random = Math.random,
  minDistance = 15 * D,
  maxDistance = 24 * D,
} = {}) {
  const selected = navigation?.sampleSpawn?.({
    player: { x: px, y: py },
    forward: { x: forwardX, y: forwardY },
    minDistance,
    maxDistance,
    random,
  });
  if (!selected) return false;
  return activateAt(selected.x, selected.y, { sector: selected.sector || null });
}

export function setDirectorIntent(intent = null) {
  if (tableau) return state.directorIntent;
  const kind = typeof intent === 'string' ? intent : intent?.kind;
  state.directorIntent = kind || 'IGNORE';
  if (state.directorIntent === 'PLAY' && state.targetPriority < .88) state.tauntRequested = true;
  return state.directorIntent;
}

export function despawn() {
  if (tableau) return false;
  state.active = false;
  state.hasTarget = false;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
  state.pendingContact = null;
  return true;
}

export function pendingContactAttempt() {
  return state.pendingContact ? { ...state.pendingContact } : null;
}

export function confirmContactAttempt(id) {
  const pending = state.pendingContact;
  if (!pending || pending.id !== id) return null;
  state.pendingContact = null;
  state.caughtCount++;
  state.awareness = Math.min(1, state.awareness + 0.18);
  return { count: state.caughtCount, awareness: state.awareness };
}

// Sustained hot operator noise is itself a committed contact. It does not move,
// spawn, or despawn the body, but it must share the ordinary contact cooldown
// and awareness bookkeeping so a nearby body cannot punish twice in one frame.
export function commitForcedContact(now = performance.now()) {
  if (!state.active || tableau) return null;
  state.lastCatchAt = Number(now) || performance.now();
  state.caughtCount++;
  state.awareness = Math.min(1, state.awareness + 0.18);
  state.pendingContact = null;
  enterStand(state.lastCatchAt, 1800, 3800);
  return { count: state.caughtCount, awareness: state.awareness };
}

export function releaseContactAttempt(id, {
  target = null,
  expiresAt = 0,
  priority = 1,
} = {}) {
  const pending = state.pendingContact;
  if (!state.active || !pending || pending.id !== id) return false;
  state.pendingContact = null;
  state.hasTarget = false;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
  state.lastEngagedAt = performance.now();
  if (target && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
    offerSoundTarget({
      position: { x: Number(target.x), y: Number(target.y) },
      level: 0.2,
      confidence: 1,
      expiresAt,
      priority,
    });
  }
  return true;
}

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

function hear(x, y, level, now, { confidence = .42, priority = .38, reason = 'LEGACY_NOISE' } = {}) {
  const d = Math.hypot(state.x - x, state.y - y);
  const range = PRESENCE.hearingRadius * difficultyRules.hearingScale * (0.55 + level * 2.2);
  if (d > range) return false;
  return offerSoundTarget({
    position: { x, y }, level, confidence,
    expiresAt: now + Math.max(900, PRESENCE.memorySec * 650), priority, reason,
  });
}

const between = (min, max) => min + Math.random() * (max - min);

function enterStand(now, minMs = 1800, maxMs = 6200) {
  state.hasTarget = false;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
  state.targetPriority = 0;
  state.behaviorMode = 'stand';
  state.phaseUntil = now + between(minMs, maxMs);
  state.hasProwl = false;
}

function chooseSearchPoint(now, navigation, { taunt = false } = {}) {
  const anchor = state.hasSearchOrigin
    ? { x: state.lastSoundX, y: state.lastSoundY }
    : { x: state.x, y: state.y };
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const reach = (taunt ? between(2.5, 6) : between(4, 11)) * D;
    const candidate = navigation?.nearestWalkable?.({
      x: anchor.x + Math.cos(angle) * reach,
      y: anchor.y + Math.sin(angle) * reach,
    }, 4) || {
      x: anchor.x + Math.cos(angle) * reach,
      y: anchor.y + Math.sin(angle) * reach,
    };
    if (navigation?.isWalkable && !navigation.isWalkable(candidate)) continue;
    if (navigation?.findPath && !navigation.findPath({ x: state.x, y: state.y }, candidate)) continue;
    state.prowlX = candidate.x;
    state.prowlY = candidate.y;
    state.hasProwl = true;
    state.prowlUntil = now + between(5000, 11000);
    state.behaviorMode = taunt ? 'feint' : (Math.random() < .42 ? 'limp' : 'investigate');
    state.phaseUntil = state.prowlUntil;
    state.tauntRequested = false;
    return true;
  }
  enterStand(now, 2600, 7200);
  return false;
}

function processLightSound(lightSound, now) {
  if (!lightSound?.active || now < state.nextLightListenAt) return false;
  state.nextLightListenAt = now + between(PRESENCE.lightHumMinIntervalMs, PRESENCE.lightHumMaxIntervalMs);
  const position = lightSound.position;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const distance = Math.hypot(state.x - position.x, state.y - position.y);
  if (distance > PRESENCE.lightRadius * difficultyRules.hearingScale) return false;
  const occlusion = Math.max(0, Number(lightSound.occlusionDb) || 0);
  const transmitted = Math.pow(10, -occlusion / 20);
  const level = Math.max(0, Math.min(1, (Number(lightSound.level) || .22) * transmitted));
  if (level < .035) return false;
  return hear(position.x, position.y, level, now, {
    confidence: Math.max(.12, Math.min(.52, (Number(lightSound.confidence) || .32) * transmitted)),
    priority: .28,
    reason: 'FLASHLIGHT_ELECTRICAL_HUM',
  });
}

function resolveTargetToFloor(navigation) {
  if (!state.hasTarget || !navigation?.nearestWalkable) return;
  const target = navigation.nearestWalkable({ x: state.targetX, y: state.targetY }, 8);
  if (!target) {
    enterStand(performance.now(), 2200, 5600);
    return;
  }
  state.targetX = target.x;
  state.targetY = target.y;
  state.lastSoundX = target.x;
  state.lastSoundY = target.y;
}

// `onContactAttempt` is the game's, not ours. In ordinary building play it
// receives a deferred transaction; Source checkpoint mode deliberately keeps
// the legacy immediate count callback.
export function updatePresence(dt, px, py, onContactAttempt, {
  navigation = null, catchMode = 'normal', dreadLevel = 0, lightSound = null,
  deferContact = false, suppressContact = false,
} = {}) {
  if (!state.active || tableau) return;
  const now = performance.now();
  const rec = REC.recState();

  const sourceMode = catchMode === 'source-checkpoint';

  // Semantic acoustic events normally supply the belief. The old envelope is
  // retained only as a compatibility fail-safe for partially initialized
  // builds in Source Space. Ordinary building play has one authority: the
  // field-monitor bands, so normal-band noise cannot leak through this legacy
  // envelope and become a hidden clue.
  const externalFresh = now < state.externalTargetUntil;
  if (sourceMode && !externalFresh && REC.currentWorldNoise() >= PRESENCE.noiseClueThreshold) {
    hear(rec.lastNoiseAt.x, rec.lastNoiseAt.y, REC.currentWorldNoise(), now, {
      confidence: .46, priority: .42, reason: 'LEGACY_WORLD_NOISE',
    });
  }
  if (!sourceMode) processLightSound(lightSound, now);
  resolveTargetToFloor(navigation);

  // A sound is only useful for a few seconds. Losing it leaves a search origin,
  // not a hidden tether to the player.
  const sinceTarget = (now - state.targetSetAt) / 1000;
  if (state.hasTarget && !externalFresh && sinceTarget > PRESENCE.memorySec * difficultyRules.memoryScale) {
    enterStand(now, 1600, 5200);
  }

  // Source Space owns authored pursuit geometry and keeps its prior circling
  // behavior. The building path below is the blind sound-belief director.
  let tx = state.targetX, ty = state.targetY;
  let speed = stalkSpeed() * difficultyRules.baseSpeedScale;
  if (sourceMode) {
    if (state.hasTarget) {
      speed = sinceTarget < 1.5
        ? huntSpeed() * difficultyRules.huntSpeedScale
        : stalkSpeed() * difficultyRules.baseSpeedScale;
    } else {
      const engaged = (now - (state.lastEngagedAt || 0)) / 1000
        < PRESENCE.disengageSec * difficultyRules.memoryScale;
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
  } else {
    if (state.tauntRequested && state.targetPriority < .88) {
      state.tauntRequested = false;
      enterStand(now, 1400, 3400);
    }
    if (state.hasTarget) {
      const remaining = Math.hypot(state.targetX - state.x, state.targetY - state.y);
      if (remaining < .72 * D) {
        enterStand(now, state.targetPriority >= .88 ? 450 : 1800, state.targetPriority >= .88 ? 1100 : 6200);
      } else if (state.behaviorMode === 'chase' && now >= state.chaseUntil) {
        state.behaviorMode = 'listen';
        state.phaseUntil = now + between(320, 920);
      } else if (state.behaviorMode === 'listen' && now >= state.phaseUntil) {
        state.behaviorMode = state.targetPriority >= .88 ? 'chase' : 'investigate';
        state.chaseUntil = now + between(1200, 2800);
      }
    } else if (state.behaviorMode === 'stand' && now >= state.phaseUntil) {
      chooseSearchPoint(now, navigation, { taunt: state.directorIntent === 'PLAY' || Math.random() < .28 });
    } else if (state.hasProwl) {
      const arrived = Math.hypot(state.prowlX - state.x, state.prowlY - state.y) < .72 * D;
      if (arrived || now >= state.prowlUntil) enterStand(now, 2200, state.behaviorMode === 'feint' ? 7800 : 5600);
    }

    if (state.hasTarget) {
      tx = state.targetX; ty = state.targetY;
    } else if (state.hasProwl) {
      tx = state.prowlX; ty = state.prowlY;
    } else {
      tx = state.x; ty = state.y;
    }

    switch (state.behaviorMode) {
      case 'chase': speed = huntSpeed() * difficultyRules.huntSpeedScale; break;
      case 'investigate': speed = PRESENCE.investigateSpeedRatio * PLAYER_CELLS_PER_SEC * difficultyRules.baseSpeedScale; break;
      case 'limp': {
        // It advances unevenly: weight, drag, listen. This is a world-space
        // gait, not a cosmetic animation over uninterrupted homing.
        const stride = ((now - state.spawnedAt) % 1150) / 1150;
        speed = stride < .62 ? PRESENCE.limpSpeedRatio * PLAYER_CELLS_PER_SEC * difficultyRules.baseSpeedScale : 0;
        break;
      }
      case 'feint': speed = stalkSpeed() * .82 * difficultyRules.baseSpeedScale; break;
      case 'listen':
      case 'stand':
      default: speed = 0; break;
    }
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
  if (sourceMode) {
    state.motionMode = !state.hasTarget ? 'stalk' : state.speed < .02 ? 'idle' : sinceTarget < 1.5 ? 'run' : 'walk';
  } else {
    state.motionMode = state.speed < .02
      ? (state.behaviorMode === 'listen' ? 'listen' : 'stand')
      : state.behaviorMode;
  }

  // 5. Contact. Not death — a spoiled take, an injury, and it knows you better.
  //    Guarded and cooled: without this it touches you on every frame and one
  //    encounter becomes six injuries. It also withdraws afterwards, so the
  //    moment has an after.
  const cooling = (now - state.lastCatchAt) / 1000 < PRESENCE.catchCooldownSec;
  const spawning = (now - state.spawnedAt) / 1000 < PRESENCE.spawnGraceSec;
  if (!suppressContact && !state.pendingContact && !cooling && !spawning && distanceTo(px, py) <= PRESENCE.catchRadius) {
    // Preserve the approach that actually made contact. `enterStand()` below
    // deliberately clears the chase belief, so reading these fields afterwards
    // would mislabel every collision as a quiet surprise.
    const contactBehaviorMode = state.behaviorMode;
    const contactTargetPriority = state.targetPriority;
    const contactTargetReason = state.targetReason;
    state.lastCatchAt = now;
    state.hasTarget = false;
    state.externalTargetUntil = 0;
    state.externalTargetPriority = 0;
    // Recoil away along the line between you. If it is standing exactly on you
    // there is no such line, so pick one.
    let rx = state.x - px, ry = state.y - py;
    let rm = Math.hypot(rx, ry);
    if (rm < 0.001) { const a = Math.random() * Math.PI * 2; rx = Math.cos(a); ry = Math.sin(a); rm = 1; }
    if(catchMode!=='source-checkpoint'){
      // Do not teleport the body through whatever wall happened to be behind
      // it. The contact cooldown creates the separation; its next search point
      // is chosen on valid floor.
      state.lastSoundX = state.x + (rx / rm) * PRESENCE.recoilCells;
      state.lastSoundY = state.y + (ry / rm) * PRESENCE.recoilCells;
      state.hasSearchOrigin = true;
      enterStand(now, 1800, 3800);
    }
    state.escapeDir = [rx / rm, ry / rm];   // the game shoves the player the other way
    if (deferContact && catchMode !== 'source-checkpoint') {
      const id = ++state.contactSerial;
      state.pendingContact = {
        id,
        proposedCount: state.caughtCount + 1,
        position: { x: state.x, y: state.y },
        escapeDirection: [...state.escapeDir],
        behaviorMode: contactBehaviorMode,
        targetPriority: contactTargetPriority,
        targetReason: contactTargetReason,
      };
      onContactAttempt?.({ ...state.pendingContact });
    } else {
      state.caughtCount++;
      state.awareness = Math.min(1, state.awareness + 0.18);
      onContactAttempt?.(state.caughtCount);
    }
  }
}

export function loadPresenceState(saved = {}) {
  tableau = null;
  state.awareness = saved.awareness || 0;
  state.caughtCount = saved.caughtCount || 0;
  state.spawnedAt = -1e9;
  state.lastCatchAt = performance.now() - Math.max(0, PRESENCE.catchCooldownSec - 3) * 1000;
  state.externalTargetUntil = 0;
  state.externalTargetPriority = 0;
  state.pendingContact = null;
  state.contactDirector = normalizeHushContactDirectorState(saved.contactDirector);
}
export function savePresenceState() {
  return {
    awareness: state.awareness,
    caughtCount: state.caughtCount,
    contactDirector: contactDirectorState(),
  };
}
