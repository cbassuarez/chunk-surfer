import { ENDING_IDS } from './schema.js';

export const ENDING_REPLAY_UNLOCKS = Object.freeze({
  sacrifice: Object.freeze({ archiveEntry: 'sealed-ledger', titleDetail: 'ledger-line' }),
  helped: Object.freeze({ archiveEntry: 'operator-annotation', titleDetail: 'returned-key' }),
  inversion: Object.freeze({ archiveEntry: 'engineering-appendix', cosmetic: 'reverse-phase', titleDetail: 'reversed-waveform' }),
  drugged: Object.freeze({ archiveEntry: 'contaminant-report', titleDetail: 'coffee-ring' }),
});

export function deriveUnlocks(meta) {
  const endings = new Set((meta?.endingsSeen || []).filter((id) => ENDING_IDS.includes(id)));
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
      ...(meta?.cosmetics?.unlocked || []),
      ...[...endings].map((id) => ENDING_REPLAY_UNLOCKS[id]?.cosmetic).filter(Boolean),
      ...(meta?.challengeCompletions?.deadAir ? ['dead-air-certified'] : []),
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
