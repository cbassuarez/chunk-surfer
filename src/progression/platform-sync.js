import { getMeta, metaCommit } from '../game/save.js';
import { ACHIEVEMENT_BY_ID } from './achievement-defs.js';
import { currentPlatform } from '../platform/index.js';
import { localStatKey, platformStatId } from './stat-defs.js';

const knownAchievement = id => Object.hasOwn(ACHIEVEMENT_BY_ID, id);
const statValue = value => Number.isFinite(Number(value)) ? Math.min(2147483647, Math.max(0, Math.trunc(Number(value)))) : 0;
let tail = Promise.resolve();
let reconcileProfile = null;
let status = { state: 'idle', lastAttemptAt: null, lastConfirmedAt: null, reason: null };
export function platformSyncStatus() { return { ...status, nextAutomaticAttemptAt: automatic.nextAttemptAt() }; }
export function configurePlatformReconciliation(callback = null) {
  if (callback !== null && typeof callback !== 'function') throw new TypeError('Profile reconciliation must be a synchronous function.');
  reconcileProfile = callback;
}

export function createPlatformSyncScheduler({ sync, now = Date.now, timer = setTimeout, minimumIntervalMs = 60000,
  isBusy = () => false } = {}) {
  let scheduled = false, running = false, next = 0;
  const noteAttempt = () => { next = Math.max(next, now() + minimumIntervalMs); };
  return {
    noteAttempt, nextAttemptAt: () => next,
    request({ delayMs = 800, ...options } = {}) {
      if (scheduled || running || isBusy() || now() < next) return false;
      scheduled = true;
      timer(async () => {
        scheduled = false; running = true; noteAttempt();
        try { await sync(options); } catch (_) {} finally { running = false; }
      }, Math.max(0, delayMs));
      return true;
    },
  };
}
const automatic = createPlatformSyncScheduler({ sync: options => syncPlatform(options), isBusy: () => status.state === 'syncing' });

export function mergeRemoteProfile(local, remote) {
  const achievements = { ...local.achievements };
  for (const id of remote?.achievements || []) {
    if (knownAchievement(id) && !achievements[id]) achievements[id] = {
      unlockedAt: Number.isFinite(Number(remote.unlockTimes?.[id])) && Number(remote.unlockTimes[id]) > 0 ? Number(remote.unlockTimes[id]) * 1000 : Date.now(),
      runId: null, build: 'REMOTE',
    };
  }
  const stats = { ...local.stats };
  for (const [id, value] of Object.entries(remote?.stats || {})) {
    const localKey = localStatKey(id) || (platformStatId(id) ? id : null);
    if (localKey) stats[localKey] = Math.max(statValue(stats[localKey]), statValue(value));
  }
  return { achievements, stats };
}

async function synchronize({ platform = currentPlatform() } = {}) {
  if (!platform?.nativeAchievements) return { ok: true, localOnly: true,
    pendingAchievements: getMeta().platform?.pendingAchievements?.length || 0,
    pendingStats: Object.keys(getMeta().platform?.pendingStats || {}).length };
  automatic.noteAttempt();
  status = { ...status, state: 'syncing', lastAttemptAt: Date.now(), reason: null };
  let remote;
  try { remote = await platform.initialize(); }
  catch (_) { status = { ...status, state: 'pending', reason: 'INIT_FAILED' }; return { ok: false, reason: 'INIT_FAILED' }; }
  if (remote?.ready !== true) {
    const reason = remote?.reason || 'PLATFORM_NOT_READY';
    status = { ...status, state: 'pending', reason };
    return { ok: false, localOnly: true, reason };
  }
  // Read after initialize: gameplay can earn progress while the native client
  // becomes ready. A pre-await profile must never replace those new awards.
  const local = getMeta(), merged = mergeRemoteProfile(local, remote);
  const remoteIds = new Set((remote.achievements || []).filter(knownAchievement));
  const pendingAchievements = [...new Set([
    ...(local.platform?.pendingAchievements || []),
    ...Object.keys(merged.achievements).filter(id => !remoteIds.has(id)),
  ])].filter(id => knownAchievement(id) && !remoteIds.has(id));
  const pendingStats = {};
  for (const [key, value] of Object.entries(merged.stats)) {
    const id = platformStatId(key);
    if (!id) continue;
    const target = Math.max(statValue(value), statValue(local.platform?.pendingStats?.[id]));
    if (target > statValue(remote.stats?.[id])) pendingStats[id] = target;
  }
  metaCommit({ achievements: merged.achievements, stats: merged.stats,
    platform: { ...local.platform, pendingAchievements, pendingStats } });
  try { reconcileProfile?.(); } catch (_) {
    status = { ...status, state: 'pending', reason: 'PROFILE_RECONCILIATION_FAILED' };
    return { ok: false, reason: status.reason };
  }
  // A remote restore can itself satisfy the local completion award. Include
  // that synchronous reconciliation in this batch without replacing its meta.
  const reconciled = getMeta();
  for (const id of reconciled.platform?.pendingAchievements || []) {
    if (knownAchievement(id) && !remoteIds.has(id) && !pendingAchievements.includes(id)) pendingAchievements.push(id);
  }
  for (const [id, value] of Object.entries(reconciled.platform?.pendingStats || {})) {
    if (localStatKey(id) && statValue(value) > statValue(remote.stats?.[id])) pendingStats[id] = Math.max(statValue(value), pendingStats[id] || 0);
  }
  const acceptedIds = new Set(), acceptedStats = {};
  for (const id of pendingAchievements) {
    try { if (await platform.unlockAchievement(id)) acceptedIds.add(id); } catch (_) {}
  }
  for (const [id, value] of Object.entries(pendingStats)) {
    try { if (await platform.setStat(id, value)) acceptedStats[id] = value; } catch (_) {}
  }
  let confirmed = false;
  if (acceptedIds.size || Object.keys(acceptedStats).length) {
    // Cache writes are not acknowledgements. The native adapter resolves true
    // only after the matching UserStatsStored callback reports success.
    try { confirmed = await platform.flush() === true; } catch (_) {}
  } else confirmed = pendingAchievements.length === 0 && Object.keys(pendingStats).length === 0;
  const latest = getMeta();
  const remainingAchievements = (latest.platform?.pendingAchievements || []).filter(id =>
    !remoteIds.has(id) && !(confirmed && acceptedIds.has(id)));
  const remainingStats = {};
  for (const [id, value] of Object.entries(latest.platform?.pendingStats || {})) {
    const target = statValue(value), remoteValue = statValue(remote.stats?.[id]);
    if (target <= remoteValue || (confirmed && target <= (acceptedStats[id] ?? -1))) continue;
    remainingStats[id] = target;
  }
  const complete = !remainingAchievements.length && !Object.keys(remainingStats).length;
  metaCommit({ platform: { ...latest.platform, pendingAchievements: remainingAchievements, pendingStats: remainingStats,
    ...(confirmed ? { lastSyncAt: Date.now() } : {}) } });
  status = { ...status, state: complete ? 'confirmed' : 'pending',
    ...(confirmed ? { lastConfirmedAt: Date.now() } : {}), reason: complete ? null : confirmed ? 'WRITES_PENDING' : 'STORE_UNCONFIRMED' };
  return { ok: complete, pendingAchievements: remainingAchievements.length,
    pendingStats: Object.keys(remainingStats).length, confirmed, reason: status.reason };
}

// Serialize platform transactions while local gameplay remains independent.
export function syncPlatform(options = {}) {
  const work = tail.then(() => synchronize(options));
  tail = work.catch(() => {});
  return work;
}
export function requestPlatformSync({ delayMs = 800, ...options } = {}) {
  if (!(options.platform || currentPlatform())?.nativeAchievements) return false;
  return automatic.request({ delayMs, ...options });
}
