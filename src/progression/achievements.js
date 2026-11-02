import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS_BY_EVENT } from './achievement-defs.js';
import { achievementRunEligible } from './eligibility.js';

export function evaluateAchievements({ event, profile, run, summary = null }) {
  if (!achievementRunEligible(run)) return [];
  const candidates = ACHIEVEMENTS_BY_EVENT.get(event?.type) || [];
  const unlocked = [];
  const working = { ...profile, achievements: { ...profile?.achievements } };
  for (const def of candidates) {
    if (working.achievements[def.id]) continue;
    let passed = false;
    try { passed = !!def.test({ event, profile: working, run, summary }); }
    catch (_) { passed = false; }
    if (passed) { unlocked.push(def.id); working.achievements[def.id] = { unlockedAt: event?.at || 0 }; }
  }
  return unlocked;
}

export function achievementDefinition(id) {
  return ACHIEVEMENT_BY_ID[id] || null;
}

export function achievementEntries(meta, { run = null } = {}) {
  return Object.values(ACHIEVEMENT_BY_ID).map(def => {
    const unlocked = !!meta?.achievements?.[def.id];
    let progress = null;
    try { progress = def.progress?.({ profile: meta, run }) || null; } catch { /* incomplete imported context */ }
    if (progress) progress = { ...progress,
      current: unlocked ? progress.target : Math.max(0, Math.min(progress.target, Number(progress.current) || 0)),
      eligible: achievementRunEligible(run),
    };
    return { ...def, progress, unlocked, unlockedAt: meta?.achievements?.[def.id]?.unlockedAt || null };
  });
}

export function achievementCompletion(meta, run = null) {
  const entries = achievementEntries(meta, { run }), completed = entries.filter(row => row.unlocked).length, total = entries.length;
  return { completed, total, complete: total > 0 && completed === total,
    percent: total ? Math.floor(completed / total * 10000) / 100 : 0,
    categories: ['work', 'disclosures', 'returns', 'method'].map(id => {
      const rows = entries.filter(row => row.category === id);
      return { id, total: rows.length, completed: rows.filter(row => row.unlocked).length };
    }),
  };
}
