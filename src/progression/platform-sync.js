import { getMeta, metaCommit } from '../game/save.js';
import { ACHIEVEMENT_BY_ID } from './achievement-defs.js';
import { currentPlatform } from '../platform/index.js';
import { localStatKey, platformStatId } from './stat-defs.js';

const knownAchievement = (id) => !!ACHIEVEMENT_BY_ID[id];

export function mergeRemoteProfile(local, remote) {
  const achievements = { ...local.achievements };
  for (const id of remote?.achievements || []) {
    if (knownAchievement(id) && !achievements[id]) achievements[id] = { unlockedAt: Date.now(), runId: null, build: 'REMOTE' };
  }
  const stats = { ...local.stats };
  for (const [id, value] of Object.entries(remote?.stats || {})) {
    const localKey = localStatKey(id) || (platformStatId(id) ? id : null);
    if (!localKey) continue;
    stats[localKey] = Math.max(Number(stats[localKey]) || 0, Number(value) || 0);
  }
  return { achievements, stats };
}

export async function syncPlatform({ platform = currentPlatform() } = {}) {
  const local = getMeta();
  if (!platform?.nativeAchievements) {
    return {
      ok: true,
      localOnly: true,
      pendingAchievements: local.platform?.pendingAchievements?.length || 0,
      pendingStats: Object.keys(local.platform?.pendingStats || {}).length,
    };
  }
  let remote;
  try { remote = await platform.initialize(); }
  catch (_) { return { ok: false, reason: 'INIT_FAILED' }; }

  const merged = mergeRemoteProfile(local, remote);
  const pendingAchievements = [...new Set([
    ...(local.platform?.pendingAchievements || []),
    ...Object.keys(merged.achievements).filter((id) => !(remote?.achievements || []).includes(id)),
  ])].filter(knownAchievement);
  const pendingStats = {};
  for (const [localKey, value] of Object.entries(merged.stats)) {
    const platformId = platformStatId(localKey);
    if (!platformId) continue;
    const remoteValue = Number(remote?.stats?.[platformId]) || 0;
    const target = Math.max(
      Number(value) || 0,
      Number(local.platform?.pendingStats?.[platformId]) || 0,
    );
    if (target > remoteValue) pendingStats[platformId] = target;
  }

  metaCommit({
    achievements: merged.achievements,
    stats: merged.stats,
    platform: { ...local.platform, pendingAchievements, pendingStats },
  });

  const remainingAchievements = [];
  for (const id of pendingAchievements) {
    try {
      const ok = await platform.unlockAchievement(id);
      if (!ok) remainingAchievements.push(id);
    } catch (_) { remainingAchievements.push(id); }
  }

  const remainingStats = {};
  for (const [id, value] of Object.entries(pendingStats)) {
    try {
      const ok = await platform.setStat(id, value);
      if (!ok) remainingStats[id] = value;
    } catch (_) { remainingStats[id] = value; }
  }

  try { await platform.flush(); } catch (_) {}
  const meta = getMeta();
  metaCommit({
    platform: {
      ...meta.platform,
      pendingAchievements: remainingAchievements,
      pendingStats: remainingStats,
      lastSyncAt: Date.now(),
    },
  });
  return { ok: true, pendingAchievements: remainingAchievements.length, pendingStats: Object.keys(remainingStats).length };
}
