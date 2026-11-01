// Presentation variants belong to an existing return. They never increase the
// terminal-ending count or substitute for consent to a particular route.
export const ENDING_VARIANT = Object.freeze({ CENTURY_STAY: 'century-stay', SOURCE_REST: 'source-rest' });

export function normalizeEndingVariant(endingId, value, arrival = null) {
  if (endingId === 'sacrifice' && value === ENDING_VARIANT.CENTURY_STAY && (arrival == null || arrival === 'agreed')) return ENDING_VARIANT.CENTURY_STAY;
  if (endingId === 'contact-lost' && value === ENDING_VARIANT.SOURCE_REST && (arrival == null || arrival === 'rested')) return ENDING_VARIANT.SOURCE_REST;
  return null;
}

export function centuryStayRecord(endingId, variant, arrival = null) {
  return normalizeEndingVariant(endingId, variant, arrival) === ENDING_VARIANT.CENTURY_STAY
    ? { years: 100, guarantor: 'player', demolitionStayed: true, spiritsRemainHoused: true }
    : null;
}
