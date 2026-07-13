import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS_BY_EVENT } from './achievement-defs.js';

export function evaluateAchievements({ event, profile, run, summary = null }) {
  const candidates = ACHIEVEMENTS_BY_EVENT.get(event?.type) || [];
  const unlocked = [];
  for (const def of candidates) {
    if (profile?.achievements?.[def.id]) continue;
    let passed = false;
    try { passed = !!def.test({ event, profile, run, summary }); }
    catch (_) { passed = false; }
    if (passed) unlocked.push(def.id);
  }
  return unlocked;
}

export function achievementDefinition(id) {
  return ACHIEVEMENT_BY_ID[id] || null;
}

export function achievementEntries(meta) {
  return Object.values(ACHIEVEMENT_BY_ID).map((def) => ({
    ...def,
    unlocked: !!meta?.achievements?.[def.id],
    unlockedAt: meta?.achievements?.[def.id]?.unlockedAt || null,
  }));
}
