import { RULE_RANK } from './difficulty-defs.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function beginIntegrity(presetId) {
  const eligible = presetId === 'dead-air';
  return {
    deadAir: {
      startedEligible: eligible,
      eligible,
      invalidations: [],
    },
  };
}

export function isLowerChallenge(key, from, to) {
  const rank = RULE_RANK[key];
  if (!rank || rank[from] == null || rank[to] == null) return false;
  return rank[to] < rank[from];
}

export function previewRuleChange(run, key, nextValue) {
  const current = run?.rules?.values?.[key];
  const lowers = isLowerChallenge(key, current, nextValue);
  return {
    allowed: current != null && nextValue != null,
    needsIntegrityWarning: !!run?.integrity?.deadAir?.eligible && lowers,
    change: { key, from: current, to: nextValue },
  };
}

export function applyRuleChange(run, change, now = Date.now()) {
  if (!run || !change?.key || change.to == null) return run;
  const next = clone(run);
  const from = next.rules.values[change.key];
  next.rules.custom = true;
  next.rules.currentPreset = 'custom';
  next.rules.values[change.key] = change.to;

  if (next.integrity?.deadAir?.eligible && isLowerChallenge(change.key, from, change.to)) {
    next.integrity.deadAir.eligible = false;
    next.integrity.deadAir.invalidations.push({
      at: now,
      reason: 'RULE_LOWERED',
      key: change.key,
      from,
      to: change.to,
    });
  }
  return next;
}
