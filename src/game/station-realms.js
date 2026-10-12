import { stationRealmPocket, realmSupportHeight } from '../data/realm-pockets.js';

export const STATION_REALM_BODY_RADIUS = .22;
export const STATION_DECOHERENCE_SECONDS = 1.15;
export const STATION_RETREAT_SECONDS = .4;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, finite(value)));

export function stationRealmSeed(runSeed, variant) {
  let n = (finite(runSeed) | 0) ^ Math.imul((finite(variant) | 0) + 1, 0x9e3779b9);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const inBox = (box, x, z, margin = 0) => Math.abs(x - box.center[0]) <= box.half[0] + margin
  && Math.abs(z - box.center[2]) <= box.half[2] + margin;

export function stationRealmFloor(variant, x, z) {
  const pocket = stationRealmPocket(variant);
  const supports = pocket?.supports.filter((box) => inBox(box, x, z, -STATION_REALM_BODY_RADIUS)) || [];
  return supports.length ? Math.max(...supports.map((box) => realmSupportHeight(box, x, z))) : null;
}

export function stationRealmCanOccupy(variant, x, z, fromFloor = 0) {
  const floor = stationRealmFloor(variant, x, z), pocket = stationRealmPocket(variant);
  if (floor == null || Math.abs(floor - fromFloor) > .45) return false;
  return !pocket.solids.some((box) => box.center[1] + box.half[1] > floor + .3
    && box.center[1] - box.half[1] < floor + pocket.eyeHeight
    && inBox(box, x, z, STATION_REALM_BODY_RADIUS));
}

// Home helper state is serializable data. Ignore prototype keys and constrain
// depth/size so malformed saves cannot smuggle objects or unbounded recursion.
function plain(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finite(value);
  if (typeof value === 'string') return value.slice(0, 200);
  if (Array.isArray(value)) return value.slice(0, 32).map((v) => plain(v, depth + 1));
  if (typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
    .slice(0, 40).map(([key, v]) => [key, plain(v, depth + 1)]));
}
export const normalizeStationRealmHomeState = (value) => value && typeof value === 'object' ? plain(value) : null;

export function normalizeStationRealm(value) {
  const pocket = stationRealmPocket(value?.variant);
  if (!pocket || !value || typeof value.entryDoorId !== 'string') return null;
  let x = finite(value.pose?.x, pocket.spawn.x), z = finite(value.pose?.z, pocket.spawn.z);
  if (!stationRealmCanOccupy(pocket.variant, x, z, stationRealmFloor(pocket.variant, x, z) ?? 0)) {
    x = pocket.spawn.x; z = pocket.spawn.z;
  }
  const returnPose = value.returnPose && Number.isFinite(Number(value.returnPose.x)) && Number.isFinite(Number(value.returnPose.y))
    ? { x: Number(value.returnPose.x), y: Number(value.returnPose.y), facing: finite(value.returnPose.facing),
      yaw: finite(value.returnPose.yaw), pitch: finite(value.returnPose.pitch) } : null;
  if (!returnPose) return null;
  return {
    version: 1, world: pocket.world, variant: pocket.variant, seed: finite(value.seed),
    entryDoorId: value.entryDoorId, home: !!value.home, returnPose,
    pose: { x, z, yaw: finite(value.pose?.yaw), pitch: clamp(value.pose?.pitch, -1.4, 1.4) },
    stage: ['inside', 'decohering', 'returning'].includes(value.stage) ? value.stage : 'inside',
    steps: Math.max(0, Math.floor(finite(value.steps))), strideM: clamp(value.strideM, 0, pocket.strideLength - 1e-8),
    startedAt: Math.max(0, finite(value.startedAt)),
    returnStartedAt: value.returnStartedAt == null ? null : Math.max(0, finite(value.returnStartedAt)),
    returnDuration: clamp(value.returnDuration ?? STATION_DECOHERENCE_SECONDS, .05, 5),
    returnReason: ['budget', 'retreat', 'home'].includes(value.returnReason) ? value.returnReason : null,
    windowReached: !!value.windowReached, homeState: normalizeStationRealmHomeState(value.homeState),
  };
}

export function createStationRealm({ variant, seed, entryDoorId, returnPose, home = false, now = 0 }) {
  const pocket = stationRealmPocket(variant);
  return pocket && normalizeStationRealm({ variant, seed, entryDoorId, returnPose, home, startedAt: now,
    pose: { ...pocket.spawn, yaw: 0, pitch: 0 }, stage: 'inside', steps: 0, strideM: 0 });
}

export function stationRealmAtWindow(realm) {
  const home = stationRealmPocket(realm?.variant)?.home;
  return !!(realm?.home && home && realm.pose.z < home.window.z
    && Math.hypot(realm.pose.x - home.window.x, realm.pose.z - home.window.z) <= home.viewingRadius);
}

export function beginStationRealmReturn(realm, now, reason = 'budget') {
  if (!realm || realm.stage !== 'inside') return false;
  realm.stage = reason === 'budget' ? 'decohering' : 'returning';
  realm.returnStartedAt = now;
  realm.returnDuration = reason === 'budget' ? STATION_DECOHERENCE_SECONDS : STATION_RETREAT_SECONDS;
  realm.returnReason = reason;
  return true;
}

export function stationRealmFrame(realm, now = 0) {
  if (!realm) return null;
  const pocket = stationRealmPocket(realm.variant), nearWindow = stationRealmAtWindow(realm);
  const decoherence = realm.returnStartedAt == null ? 0 : clamp((now - realm.returnStartedAt) / realm.returnDuration, 0, 1);
  return { ...realm, pose: { ...realm.pose, floorY: stationRealmFloor(realm.variant, realm.pose.x, realm.pose.z) ?? 0 },
    returnPose: { ...realm.returnPose }, homeState: normalizeStationRealmHomeState(realm.homeState),
    time: now, stepBudget: pocket.stepBudget, strideLength: pocket.strideLength, eyeHeight: pocket.eyeHeight,
    window: pocket.home ? { ...pocket.home.window } : null,
    decoherence, atWindow: nearWindow,
    home: { eligible: realm.home, nearWindow, reached: realm.windowReached,
      fold: realm.home ? clamp((realm.pose.z - (pocket.home?.foldFrom ?? 58))
        / Math.max(.001, (pocket.home?.foldTo ?? 66.7) - (pocket.home?.foldFrom ?? 58)), 0, 1) : 0,
      ...(normalizeStationRealmHomeState(realm.homeState) || {}) },
  };
}

export function moveStationRealm(realm, { dx = 0, dz = 0, yaw, pitch } = {}, now = 0) {
  if (!realm) return { movedDistance: 0, footsteps: 0, blocked: false, retreated: false, atWindow: false };
  if (Number.isFinite(Number(yaw))) realm.pose.yaw = Number(yaw);
  if (Number.isFinite(Number(pitch))) realm.pose.pitch = clamp(pitch, -1.4, 1.4);
  dx = finite(dx); dz = finite(dz);
  // Cap a request, then sweep it. Frame stalls cannot tunnel through a wall or
  // turn a corrupt delta into a whole visit's worth of footsteps.
  const requested = Math.hypot(dx, dz), scale = requested > 1.5 ? 1.5 / requested : 1;
  dx *= scale; dz *= scale;
  const subdivisions = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  let movedDistance = 0, retreated = false, blocked = false;
  const pocket = stationRealmPocket(realm.variant), beforeSteps = realm.steps;
  for (let i = 0; i < subdivisions; i += 1) {
    const ax = realm.pose.x, az = realm.pose.z, sx = dx / subdivisions, sz = dz / subdivisions;
    // A real return plane at the entrance. It works from the first visit step.
    if (realm.stage === 'inside' && az >= pocket.entrance.z && az + sz < pocket.entrance.z
      && Math.abs(ax + sx) < pocket.entrance.halfWidth) {
      const travelled = Math.hypot(sx, sz);
      realm.pose.x = ax + sx; realm.pose.z = az + sz; movedDistance += travelled;
      realm.strideM += travelled;
      const completed = Math.floor((realm.strideM + 1e-9) / pocket.strideLength);
      realm.strideM = Math.max(0, realm.strideM - completed * pocket.strideLength);
      realm.steps += completed;
      beginStationRealmReturn(realm, now, 'retreat'); retreated = true; break;
    }
    const floor = stationRealmFloor(realm.variant, ax, az) ?? 0;
    let nx = ax + sx, nz = az + sz;
    if (!stationRealmCanOccupy(realm.variant, nx, nz, floor)) {
      if (sx && stationRealmCanOccupy(realm.variant, ax + sx, az, floor)) nz = az;
      else if (sz && stationRealmCanOccupy(realm.variant, ax, az + sz, floor)) nx = ax;
      else { blocked = true; continue; }
      blocked = true;
    }
    const nextFloor = stationRealmFloor(realm.variant, nx, nz) ?? floor;
    const travelled = Math.hypot(nx - ax, nextFloor - floor, nz - az);
    realm.pose.x = nx; realm.pose.z = nz; movedDistance += travelled;
    realm.strideM += travelled;
    const completed = Math.floor((realm.strideM + 1e-9) / pocket.strideLength);
    realm.strideM = Math.max(0, realm.strideM - completed * pocket.strideLength);
    realm.steps += completed;
    if (realm.stage === 'inside' && !realm.home && realm.steps >= pocket.stepBudget) beginStationRealmReturn(realm, now, 'budget');
  }
  return { movedDistance, footsteps: realm.steps - beforeSteps, blocked, retreated, atWindow: stationRealmAtWindow(realm) };
}
