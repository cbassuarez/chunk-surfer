import { HUSH_MISCHIEF_CUES } from '../data/hush-cues.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function freshMischiefState() {
  return { schema: 1, lastCueAt: -1e12, familyUntil: {}, cueUntil: {}, cueCounts: {}, history: [] };
}

function eligible(def, context, state, now) {
  const r = def.requirements || {};
  if (context.interest < finite(r.minInterest, 0)) return false;
  if (context.agitation > finite(r.maxAgitation, 1)) return false;
  if (context.certainty < finite(r.minCertainty, 0)) return false;
  if (context.recording || context.blocked || context.finale || context.battle) return false;
  if (now < finite(state.familyUntil[def.family], 0)) return false;
  if (now < finite(state.cueUntil[def.id], 0)) return false;
  if ((state.cueCounts[def.id] || 0) >= finite(def.selection?.maxPerRun, Infinity)) return false;
  return true;
}

export function selectMischiefCue({ definitions = HUSH_MISCHIEF_CUES, context, state, now, random = Math.random } = {}) {
  const candidates = definitions.filter((def) => eligible(def, context, state, now));
  if (!candidates.length) return null;
  const weighted = candidates.map((def) => {
    const count = state.cueCounts[def.id] || 0;
    const weight = finite(def.selection?.baseWeight, 1) * Math.pow(finite(def.selection?.repeatPenalty, .7), count);
    return { def, weight: Math.max(.001, weight) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let pick = random() * total;
  for (const item of weighted) {
    pick -= item.weight;
    if (pick <= 0) return item.def;
  }
  return weighted.at(-1)?.def || null;
}

export function commitMischiefCue(state, cue, now) {
  const next = structuredClone(state);
  next.lastCueAt = now;
  next.familyUntil[cue.family] = now + finite(cue.selection?.familyCooldownMs, 18000);
  next.cueUntil[cue.id] = now + finite(cue.selection?.cueCooldownMs, 45000);
  next.cueCounts[cue.id] = (next.cueCounts[cue.id] || 0) + 1;
  next.history.push({ id: cue.id, family: cue.family, at: now });
  next.history = next.history.slice(-16);
  return next;
}

export function normalizeMischiefState(value) {
  const base = freshMischiefState();
  if (!value || typeof value !== 'object') return base;
  return {
    ...base,
    lastCueAt: finite(value.lastCueAt, base.lastCueAt),
    familyUntil: { ...(value.familyUntil || {}) },
    cueUntil: { ...(value.cueUntil || {}) },
    cueCounts: { ...(value.cueCounts || {}) },
    history: Array.isArray(value.history) ? value.history.filter(Boolean).slice(-16) : [],
  };
}
