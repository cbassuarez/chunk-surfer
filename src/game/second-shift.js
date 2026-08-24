import { resolvedReturnHistory } from '../progression/return-history.js';
import { ENDING_REPLAY_UNLOCKS } from '../progression/unlocks.js';
import { endingArchiveDocument } from '../data/ending-archive.js';

export const SECOND_SHIFT_BY_ENDING = Object.freeze({
  sacrifice: Object.freeze({
    evidence: 'sealed-ledger', residue: 'ledger-line',
    evidenceLabel: 'SEALED RETURN LEDGER', residueLabel: 'LINE ENTERED BEFORE ELLERY',
    lead: 'The RETURNED column predates Ellery; return without completing the seal.',
    adjacentEndingId: 'inversion', adjacentClassification: 'INVERSION',
  }),
  helped: Object.freeze({
    evidence: 'operator-annotation', residue: 'returned-key',
    evidenceLabel: 'OPERATOR ANNOTATION', residueLabel: 'SERVICE KEY MARKED RETURNED',
    lead: "A service key was logged as returned before the operator entered; trace the guard's intervention sober.",
    adjacentEndingId: 'drugged', adjacentClassification: 'CONTAMINATION',
  }),
  inversion: Object.freeze({
    evidence: 'engineering-appendix', residue: 'reversed-waveform',
    evidenceLabel: 'ENGINEERING APPENDIX', residueLabel: 'TWO EXITS IN PRE-ROLL',
    lead: 'The reversed waveform contains two exits before playback begins.',
    adjacentEndingId: 'surfaced', adjacentClassification: 'EXTRACTION',
  }),
  drugged: Object.freeze({
    evidence: 'contaminant-report', residue: 'coffee-ring',
    evidenceLabel: 'CONTAMINANT REPORT', residueLabel: 'CARBON TEXT BELOW THE RING',
    lead: 'Carbon text beneath the ring says the second operator must remain untreated.',
    adjacentEndingId: 'helped', adjacentClassification: 'INTERVENTION',
  }),
  surfaced: Object.freeze({
    evidence: 'other-recordist', residue: 'returned-body',
    evidenceLabel: 'OTHER RECORDIST FILE', residueLabel: 'SECOND NAME ALREADY RETURNED',
    lead: 'The second returned name was timestamped before either arrival.',
    adjacentEndingId: 'sacrifice', adjacentClassification: 'CONTAINMENT',
  }),
  'contact-won': Object.freeze({
    evidence:'open-channel-log',residue:'open-channel',evidenceLabel:'OPEN CHANNEL LOG',residueLabel:'CARRIER STILL ANSWERING',
    lead:'The open carrier has a second exit condition; refuse contact and follow the evidence with sight.',
    adjacentEndingId:'tower-won',adjacentClassification:'TOWER / EXTRACTION',
  }),
  'contact-lost': Object.freeze({
    evidence:'no-return-notice',residue:'terminal-carrier',evidenceLabel:'NO RETURN NOTICE',residueLabel:'WARNING ACKNOWLEDGED',
    lead:'The terminal route was chosen deliberately. A new run can walk away before contact.',
    adjacentEndingId:'contact-won',adjacentClassification:'CONTACT / VICTORY',
  }),
  'tower-won': Object.freeze({
    evidence:'cathedral-return-sheet',residue:'gift-shop-exit',evidenceLabel:'CATHEDRAL RETURN SHEET',residueLabel:'TWO OUT / NONE IN',
    lead:'The visitor return omits the route that stayed inside Source and never reached the Cathedral.',
    adjacentEndingId:'contact-won',adjacentClassification:'CONTACT / VICTORY',
  }),
  'tower-lost': Object.freeze({
    evidence:'full-peal-report',residue:'six-bell-return',evidenceLabel:'FULL PEAL REPORT',residueLabel:'TWO CARRIERS IN THE WAVEFORM',
    lead:'The second phase kept the pressure spent in the first. Return better prepared and sever the carrier line.',
    adjacentEndingId:'tower-won',adjacentClassification:'TOWER / EXTRACTION',
  }),
});

export function secondShiftForEnding(endingId) {
  return SECOND_SHIFT_BY_ENDING[endingId] || null;
}

export function returnFileEntries(meta) {
  return resolvedReturnHistory(meta).map((summary) => ({
    summary,
    ...secondShiftForEnding(summary.endingId),
    // THE DOCUMENT THE ENDING LEAVES BEHIND. ENDING_REPLAY_UNLOCKS has declared
    // an archiveEntry per ending since it was written and nothing ever consumed
    // one — the names existed, the documents did not. See data/ending-archive.js.
    document: endingArchiveDocument(ENDING_REPLAY_UNLOCKS[summary.endingId]?.archiveEntry, summary),
  }));
}
