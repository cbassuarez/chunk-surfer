import {comparePlayerCondition} from './player-condition.js';

const seconds = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const clamp01 = value => Math.max(0, Math.min(1, value));
const snapshot = value => value && typeof value === 'object' ? Object.freeze({...value}) : null;
const NOTICE_SECONDS = 3;
const ATTACK_SECONDS = .04;
const RELEASE_SECONDS = .45;
const SETTLE_SECONDS = 1.5;

export function playerConditionImpact(event, condition) {
  if (!event || !condition?.available) return 0;
  const damage = Math.max(0, Number(event.damage) || 0);
  const injury = Math.max(0, Number(event.injuriesAdded) || 0);
  if (!damage && !injury) return 0;
  const fraction = Math.min(1, damage / Math.max(1, condition.ceiling));
  return Math.min(1, Math.max(injury ? .85 : 0, damage ? .18 + .82 * Math.sqrt(fraction) : 0));
}

// Ephemeral presentation only. The supplied condition remains authoritative.
export function createPlayerConditionFeedback() {
  let condition = null, event = null, eventAge = null, impactAge = null, serial = 0, run = null, wasSuppressed = false;
  function clear() { event = null; eventAge = null; impactAge = null; }
  function frame() {
    const hurt = !!event && (event.damage > 0 || event.injuriesAdded > 0);
    const age = impactAge ?? 0;
    const impact = !hurt ? 0 : age < ATTACK_SECONDS ? age / ATTACK_SECONDS
      : Math.pow(1 - clamp01((age - ATTACK_SECONDS) / RELEASE_SECONDS), 2);
    return Object.freeze({condition, event, eventAge, impactAge, impact,
      force:playerConditionImpact(event, condition),
      settle:hurt ? 1 - clamp01(age / SETTLE_SECONDS) : 0,
      strain:condition?.available ? condition.strainRatio : 0,
      wounds:condition?.available ? condition.injuries : 0, serial});
  }
  function update(next, dt = 0, {active = true, presented = true, suppressed = false, runId = '', hydrating = false} = {}) {
    const nextCondition = snapshot(next), nextRun = String(runId ?? '');
    const first = run === null, runChanged = !first && nextRun !== run;
    const authorityChanged = condition && nextCondition
      && (condition.owner !== nextCondition.owner || condition.combat !== nextCondition.combat);
    const resumesPresentation = wasSuppressed && !suppressed;
    const previous = condition;
    condition = nextCondition; run = nextRun; wasSuppressed = !!suppressed;
    if (first || runChanged || hydrating || suppressed || resumesPresentation || authorityChanged || !condition?.available) {
      clear();
      return frame();
    }
    // Inactive updates still record the current facts, so resume cannot replay
    // a resource change that occurred while the game had no active presenter.
    if (!active) return frame();
    if (event) {
      const elapsed = seconds(dt);
      impactAge += elapsed;
      if (presented) eventAge += elapsed;
      if (eventAge >= NOTICE_SECONDS) clear();
    }
    const receipt = comparePlayerCondition(previous, condition);
    if (receipt) {
      serial += 1;
      event = Object.freeze({...receipt, serial});
      eventAge = 0;
      impactAge = 0;
    }
    return frame();
  }
  function reset() { condition = null; run = null; serial = 0; wasSuppressed = false; clear(); }
  return Object.freeze({update, frame, reset});
}
