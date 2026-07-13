import { ENDING_IDS, PROFILE_EXPORT_VERSION, normalizeMeta, normalizeSettings } from './schema.js';
import { ACHIEVEMENT_BY_ID } from './achievement-defs.js';

const objectOr = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const uniqueKnown = (values, known) => [...new Set((Array.isArray(values) ? values : []).filter((id) => known.includes(id)))];

function maxStats(a, b) {
  const out = {};
  for (const key of new Set([...Object.keys(objectOr(a)), ...Object.keys(objectOr(b))])) {
    out[key] = Math.max(Number(a?.[key]) || 0, Number(b?.[key]) || 0);
  }
  return out;
}

function mergeKnowledge(a, b) {
  const out = {};
  for (const category of ['lines', 'choices', 'documents', 'playbacks', 'props']) {
    const bucket = { ...objectOr(a?.[category]) };
    for (const [id, imported] of Object.entries(objectOr(b?.[category]))) {
      const local = bucket[id];
      if (!local) bucket[id] = imported;
      else bucket[id] = {
        firstSeenAt: Math.min(Number(local.firstSeenAt) || Infinity, Number(imported.firstSeenAt) || Infinity),
        firstSeenRunId: (Number(local.firstSeenAt) || Infinity) <= (Number(imported.firstSeenAt) || Infinity)
          ? local.firstSeenRunId : imported.firstSeenRunId,
        lastSeenAt: Math.max(Number(local.lastSeenAt) || 0, Number(imported.lastSeenAt) || 0),
        count: Math.max(Number(local.count) || 1, Number(imported.count) || 1),
      };
    }
    out[category] = bucket;
  }
  return out;
}

export function exportProfile(meta, settings, { build = 'LOCAL', now = Date.now() } = {}) {
  const cleanMeta = normalizeMeta(meta);
  return {
    format: 'chunk-surfer-profile',
    version: PROFILE_EXPORT_VERSION,
    exportedAt: now,
    build,
    meta: {
      endingsSeen: cleanMeta.endingsSeen,
      achievements: cleanMeta.achievements,
      stats: cleanMeta.stats,
      knowledge: cleanMeta.knowledge,
      challengeCompletions: cleanMeta.challengeCompletions,
      returns: cleanMeta.returns,
      cosmetics: cleanMeta.cosmetics,
    },
    settings: {
      lastDifficulty: settings?.lastDifficulty || 'contract',
      seenTextMode: settings?.seenTextMode || 'fast',
      archiveSignals: settings?.archiveSignals || 'subtle',
      condensedCheckIn: !!settings?.condensedCheckIn,
      customShiftRules: settings?.customShiftRules && typeof settings.customShiftRules === 'object'
        ? { ...settings.customShiftRules }
        : null,
    },
  };
}

export function validateProfileImport(value) {
  if (value?.format !== 'chunk-surfer-profile') return { ok: false, error: 'UNKNOWN_FORMAT' };
  if (value?.version !== PROFILE_EXPORT_VERSION) return { ok: false, error: 'UNSUPPORTED_VERSION' };
  if (!value.meta || typeof value.meta !== 'object') return { ok: false, error: 'INVALID_META' };
  return { ok: true, profile: value };
}

export function mergeImportedProfile(localMeta, localSettings, imported) {
  const valid = validateProfileImport(imported);
  if (!valid.ok) return valid;
  const local = normalizeMeta(localMeta);
  const incoming = normalizeMeta({ ...imported.meta, version: 2 });
  const achievements = Object.fromEntries(
    Object.entries(local.achievements).filter(([id]) => !!ACHIEVEMENT_BY_ID[id]),
  );
  for (const [id, record] of Object.entries(incoming.achievements)) {
    if (!ACHIEVEMENT_BY_ID[id]) continue;
    if (!achievements[id]) achievements[id] = record;
  }
  const records = { ...local.returns.records, ...incoming.returns.records };
  const history = [...new Set([...local.returns.history, ...incoming.returns.history])]
    .filter((id) => records[id]);

  return {
    ok: true,
    meta: normalizeMeta({
      ...local,
      endingsSeen: uniqueKnown([...local.endingsSeen, ...incoming.endingsSeen], ENDING_IDS),
      achievements,
      stats: maxStats(local.stats, incoming.stats),
      knowledge: mergeKnowledge(local.knowledge, incoming.knowledge),
      challengeCompletions: {
        deadAir: local.challengeCompletions.deadAir || incoming.challengeCompletions.deadAir,
      },
      returns: { records, history },
      cosmetics: {
        unlocked: [...new Set([...local.cosmetics.unlocked, ...incoming.cosmetics.unlocked])],
        selected: local.cosmetics.selected || incoming.cosmetics.selected,
      },
      // Never import queues or unpresented notices from another installation.
      platform: local.platform,
      presentation: local.presentation,
    }),
    settings: normalizeSettings({ ...localSettings, ...objectOr(imported.settings) }),
  };
}
