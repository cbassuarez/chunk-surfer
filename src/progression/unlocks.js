import { ENDING_IDS } from './schema.js';

export const WITNESS_EDITION_ID = 'witness';

// Count filed ending identities, not runs, return-history rows, difficulty, or
// the profile's cached statistic. A recorded unlock stays owned permanently.
export function witnessEditionStatus(meta = null) {
  const seen = Array.isArray(meta?.endingsSeen) ? meta.endingsSeen : [];
  const endingIds = ENDING_IDS.filter((id) => seen.includes(id));
  const count = endingIds.length;
  const required = 2;
  const owned = count >= required || (Array.isArray(meta?.cosmetics?.unlocked)
    && meta.cosmetics.unlocked.includes(WITNESS_EDITION_ID));
  return {
    visible: count >= 1 || owned, owned, count, required, endingIds,
    reason: owned ? 'WITNESS EDITION UNLOCKED. FIT AT THE VAN.'
      : `FILE 2 DIFFERENT ENDINGS TO UNLOCK. ${count} OF 2 FILED.`,
  };
}

export const ENDING_REPLAY_UNLOCKS = Object.freeze({
  sacrifice: Object.freeze({ archiveEntry: 'sealed-ledger', titleDetail: 'ledger-line' }),
  helped: Object.freeze({ archiveEntry: 'operator-annotation', titleDetail: 'returned-key' }),
  inversion: Object.freeze({ archiveEntry: 'engineering-appendix', cosmetic: 'reverse-phase', titleDetail: 'reversed-waveform' }),
  drugged: Object.freeze({ archiveEntry: 'contaminant-report', titleDetail: 'coffee-ring' }),
  surfaced: Object.freeze({ archiveEntry: 'other-recordist', cosmetic: 'source-clean', titleDetail: 'returned-body' }),
  'contact-won': Object.freeze({ archiveEntry: 'open-channel-log', titleDetail: 'open-channel' }),
  'contact-lost': Object.freeze({ archiveEntry: 'no-return-notice', titleDetail: 'terminal-carrier' }),
  'tower-won': Object.freeze({ archiveEntry: 'cathedral-return-sheet', cosmetic: 'cathedral-dust', titleDetail: 'gift-shop-exit' }),
  'tower-lost': Object.freeze({ archiveEntry: 'full-peal-report', titleDetail: 'six-bell-return' }),
});

export function deriveUnlocks(meta) {
  const endings = new Set((Array.isArray(meta?.endingsSeen) ? meta.endingsSeen : []).filter((id) => ENDING_IDS.includes(id)));
  const anyEnding = endings.size >= 1;
  const twoEndings = endings.size >= 2;
  const allEndings = ENDING_IDS.every((id) => endings.has(id));
  return {
    archive: anyEnding,
    returnIndex: anyEnding,
    reopenCase: anyEnding,
    deadAir: anyEnding,
    seenTextAcceleration: anyEnding,
    archiveSignals: anyEnding,
    condensedCheckIn: anyEnding,
    partialReturnClassifications: twoEndings,
    customShift: allEndings || !!meta?.challengeCompletions?.deadAir,
    fullReturnIndex: allEndings,
    cosmetics: [...new Set([
      ...(Array.isArray(meta?.cosmetics?.unlocked) ? meta.cosmetics.unlocked : []),
      ...[...endings].map((id) => ENDING_REPLAY_UNLOCKS[id]?.cosmetic).filter(Boolean),
      ...(meta?.challengeCompletions?.deadAir ? ['dead-air-certified'] : []),
      ...(witnessEditionStatus(meta).owned ? [WITNESS_EDITION_ID] : []),
    ])],
  };
}

export function diffUnlocks(before, after) {
  const out = [];
  for (const key of ['archive', 'returnIndex', 'reopenCase', 'deadAir', 'seenTextAcceleration', 'archiveSignals', 'condensedCheckIn', 'partialReturnClassifications', 'customShift', 'fullReturnIndex']) {
    if (!before?.[key] && after?.[key]) out.push(key);
  }
  for (const id of after?.cosmetics || []) {
    if (!(before?.cosmetics || []).includes(id)) out.push(`cosmetic:${id}`);
  }
  return out;
}
