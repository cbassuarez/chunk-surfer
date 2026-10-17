// Presentation variants belong to an existing return. They never increase the
// terminal-ending count or substitute for consent to a particular route.
export const ENDING_VARIANT = Object.freeze({ CENTURY_STAY: 'century-stay' });

export function normalizeEndingVariant(endingId, value, arrival = null) {
  if (endingId !== 'sacrifice' || value !== ENDING_VARIANT.CENTURY_STAY) return null;
  if (arrival != null && arrival !== 'agreed') return null;
  return ENDING_VARIANT.CENTURY_STAY;
}

export function centuryStayRecord(endingId, variant, arrival = null) {
  return normalizeEndingVariant(endingId, variant, arrival)
    ? { years: 100, guarantor: 'player', demolitionStayed: true, spiritsRemainHoused: true }
    : null;
}
