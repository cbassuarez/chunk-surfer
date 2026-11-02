import {
  COMPLETION_ROOMS, COMPLETION_PAPERS, COMPLETION_LEADS,
  COMPLETION_DISCLOSURES, SECRET_DEFS, COMPLETION_COLLECTIONS,
} from './completion-defs.js';
import {
  normalizeCompletionLedger, reduceCompletionLedger, completionLedgerFromSave,
  mergeCompletionLedgers, noteCompletionReceipt,
} from './completion-ledger.js';

export { COMPLETION_CATALOG_VERSION, COMPLETION_ROOMS, COMPLETION_PAPERS,
  COMPLETION_LEADS, COMPLETION_DISCLOSURES, SECRET_DEFS, SECRET_BY_ID } from './completion-defs.js';
export const normalizeCompletion = normalizeCompletionLedger;
export const reduceCompletion = reduceCompletionLedger;
export { completionLedgerFromSave, mergeCompletionLedgers, noteCompletionReceipt };

const paperNames = Object.freeze({
  'north-gallery-service-word': 'North gallery service access',
  'foh-overflow-note': 'Furniture off the floor',
  'pre-roll-analysis': 'Pre-roll analysis',
  'faculty-reference-requirement': 'Reference requirement',
  'student-monitoring-notes': 'The second performance',
  'work-order-carbon': 'Work order carbon',
});
const roomName = id => COMPLETION_ROOMS.find(row => row.id === id)?.label || id;

// These are finite collection checklists, not a second competing 100% score.
// Overall completion belongs to the full known achievement catalogue.
export function completionCollections(meta = {}) {
  const completion = normalizeCompletionLedger(meta?.completion);
  const documents = meta?.knowledge?.documents || {};
  const entries = {
    rooms: COMPLETION_ROOMS.map(row => ({ id: row.id, name: row.label, done: !!completion.rooms[row.id] })),
    papers: COMPLETION_PAPERS.map(id => ({ id,
      name: paperNames[id] || `Field log ${id.slice(5).padStart(2, '0')}`, done: !!documents[id] })),
    leads: COMPLETION_LEADS.map(row => ({ id: row.id, name: row.label, done: !!completion.leads[row.id] })),
    disclosures: COMPLETION_DISCLOSURES.map(id => ({ id, name: `${roomName(id)} playback`, done: !!completion.disclosures[id] })),
    secrets: SECRET_DEFS.map(def => ({ id: def.id, name: completion.secrets[def.id] ? def.name : 'Undiscovered Easter egg',
      done: !!completion.secrets[def.id], hint: def.hint })),
  };
  return COMPLETION_COLLECTIONS.map(def => ({ id: def.id, label: def.label,
    current: entries[def.id].filter(row => row.done).length, target: entries[def.id].length,
    entries: entries[def.id] }));
}
