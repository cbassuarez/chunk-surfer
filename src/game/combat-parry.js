import { INTENT_KIND, PARRY_TIER } from './combat-state.js';

export const PARRY_BPM = 168;
export const PARRY_BEAT_SECONDS = 60 / PARRY_BPM;
export const PARRY_REACTION_SECONDS = PARRY_BEAT_SECONDS * 4;
export const PARRY_IMPACT_SECONDS = PARRY_BEAT_SECONDS * 2.5;
export const PARRY_STANDARD_WINDOW_SECONDS = PARRY_BEAT_SECONDS * 2;
export const PARRY_BUFFER_SECONDS = PARRY_BEAT_SECONDS * .25;
export const PARRY_CONTACT_HOLD_SECONDS = PARRY_BEAT_SECONDS * .25;
export const PARRY_CONTACT_GRACE_SECONDS = PARRY_BEAT_SECONDS * .125;
export const PARRY_GOOD_AT = .40;
export const PARRY_PERFECT_AT = .75;

const PARRYABLE_INTENTS = new Set([
  INTENT_KIND.BROADCAST,
  INTENT_KIND.OVERLOAD,
  INTENT_KIND.LOOP,
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function isParryableEnemyAction(action = {}) {
  return PARRYABLE_INTENTS.has(String(action?.kind || action || ''));
}

export function parryOpportunitySnapshot({
  side = 'enemy',
  actionKind = null,
  elapsed = 0,
  duration = PARRY_REACTION_SECONDS,
  windowScale = 1,
  attempted = false,
  buffered = false,
  parried = false,
  whiffed = false,
  tier = null,
  impactFired = false,
} = {}) {
  if (side !== 'enemy' || !isParryableEnemyAction(actionKind)) return null;

  const total = Math.max(PARRY_REACTION_SECONDS, Number(duration) || PARRY_REACTION_SECONDS);
  const atSeconds = clamp(elapsed, 0, total);
  const widthSeconds = Math.min(
    PARRY_IMPACT_SECONDS,
    PARRY_STANDARD_WINDOW_SECONDS * Math.max(.1, Number(windowScale) || 1),
  );
  const openSeconds = Math.max(0, PARRY_IMPACT_SECONDS - widthSeconds);
  const bufferSeconds = Math.max(0, openSeconds - PARRY_BUFFER_SECONDS);
  const contactEnds = PARRY_IMPACT_SECONDS + PARRY_CONTACT_HOLD_SECONDS;
  const graceEnds = PARRY_IMPACT_SECONDS + PARRY_CONTACT_GRACE_SECONDS;
  const through = widthSeconds <= 0
    ? 1
    : clamp((Math.min(atSeconds, PARRY_IMPACT_SECONDS) - openSeconds) / widthSeconds, 0, 1);
  const liveTier = atSeconds >= PARRY_IMPACT_SECONDS
    ? PARRY_TIER.PERFECT
    : through < PARRY_GOOD_AT
      ? PARRY_TIER.LATE
      : through < PARRY_PERFECT_AT
        ? PARRY_TIER.GOOD
        : PARRY_TIER.PERFECT;
  const inWindow = atSeconds >= openSeconds && atSeconds < PARRY_IMPACT_SECONDS;
  const inContactGrace = atSeconds >= PARRY_IMPACT_SECONDS && atSeconds <= graceEnds && !impactFired;
  const inContact = atSeconds >= PARRY_IMPACT_SECONDS && atSeconds < contactEnds && !impactFired;
  const spent = !!attempted;
  const armed = !spent && (inWindow || inContactGrace);
  const bufferable = !spent && !buffered && atSeconds >= bufferSeconds && atSeconds < openSeconds;
  const progress = clamp(atSeconds / total, 0, 1);

  let phase = 'approach';
  if (impactFired) phase = 'resolved';
  else if (spent) phase = parried ? 'turned' : whiffed ? 'missed' : 'spent';
  else if (buffered) phase = 'buffered';
  else if (inContact) phase = 'contact';
  else if (inWindow) phase = 'open';

  return Object.freeze({
    eligible: true,
    phase,
    atSeconds,
    duration: total,
    progress,
    impactProgress: clamp(PARRY_IMPACT_SECONDS / total, 0, 1),
    openProgress: clamp(openSeconds / total, 0, 1),
    closeProgress: clamp(PARRY_IMPACT_SECONDS / total, 0, 1),
    goodProgress: clamp((openSeconds + widthSeconds * PARRY_GOOD_AT) / total, 0, 1),
    perfectProgress: clamp((openSeconds + widthSeconds * PARRY_PERFECT_AT) / total, 0, 1),
    contactEndProgress: clamp(contactEnds / total, 0, 1),
    openSeconds,
    impactSeconds: PARRY_IMPACT_SECONDS,
    contactEnds,
    graceEnds,
    widthSeconds,
    through,
    armed,
    bufferable,
    buffered: !!buffered,
    contact: inContact,
    spent,
    parried: !!parried,
    whiffed: !!whiffed,
    tier: tier || liveTier,
  });
}

export function parryInputDecision(opportunity, { repeat = false, held = false } = {}) {
  if (!opportunity?.eligible) return 'none';
  if (repeat || held || opportunity.spent || opportunity.buffered) return 'ignore';
  if (opportunity.bufferable) return 'buffer';
  if (opportunity.armed) return 'parry';
  if (opportunity.contact) return 'miss';
  return 'wait';
}
