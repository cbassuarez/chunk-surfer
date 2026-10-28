// Presentation data only. Existing contact, recorder, battle and ending owners
// commit consequences; a future selected presenter consumes this receipt.
// This module chooses no image, copy, sound, duration, penalty or save action.
export const RECOVERY_OUTCOME_KINDS = Object.freeze([
  'taken', 'recoverable-defeat', 'ending-bound', 'terminal',
]);

const costFields = Object.freeze({
  injuryDelta: value => Number.isInteger(value) && value >= 0,
  composure: value => Number.isFinite(value) && value >= 0,
  recordingSpoiled: value => typeof value === 'boolean',
  recordingSpoilReason: value => typeof value === 'string' && value.length > 0,
  lostMinutes: value => Number.isInteger(value) && value >= 0,
  lostItemId: value => typeof value === 'string' && value.length > 0,
  destinationRoomId: value => typeof value === 'string' && value.length > 0,
});
const handoffOwners = Object.freeze({
  taken: ['wake-up'],
  'recoverable-defeat': ['wake-up', 'horizon-bust-return'],
  'ending-bound': ['ending-objective'],
  terminal: ['ending'],
});

export function recoveryOutcomeReceipt({
  eventId, runId = '', kind, sourceActorId = '', sourceRoomId = '',
  encounterId = '', endingId = '', handoffOwner = '', committed = {},
} = {}) {
  if (typeof eventId !== 'string' || !eventId.trim()) throw Error('An outcome needs its authoritative event identity.');
  if (!RECOVERY_OUTCOME_KINDS.includes(kind)) throw Error('Unknown recovery outcome kind.');
  const owner = handoffOwner || handoffOwners[kind][0];
  if (!handoffOwners[kind].includes(owner)) throw Error('The handoff owner does not match the resolved outcome.');
  const resumesNight = kind === 'taken' || kind === 'recoverable-defeat';
  if (!resumesNight && (typeof endingId !== 'string' || !endingId.trim()))
    throw Error('Resolve the ending destination before presenting an ending-bound outcome.');
  if (resumesNight && endingId) throw Error('A continuing-night recovery cannot promise an ending.');
  const facts = {};
  for (const [key, value] of Object.entries(committed)) {
    if (!costFields[key]?.(value)) throw Error(`Invalid committed outcome fact: ${key}`);
    facts[key] = value;
  }
  // Missing facts stay missing: a presenter cannot infer zero injury, no lost
  // equipment, a saved return or a successful recording from this receipt.
  // The handoff names the next owner; it is not a completed-run/save receipt.
  return Object.freeze({
    schemaVersion: 1, eventId, runId, kind, sourceActorId, sourceRoomId, encounterId,
    handoff: Object.freeze({ owner, endingId }),
    committed: Object.freeze(facts),
  });
}
