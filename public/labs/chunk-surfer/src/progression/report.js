import { ENDING_IDS } from './schema.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const RETURN_DEFS = Object.freeze([
  Object.freeze({ id: 'sacrifice', order: 1, title: 'THE SEAL', classification: 'CONTAINMENT', hiddenUntilSeen: true }),
  Object.freeze({ id: 'helped', order: 2, title: 'HE TRIED TO HELP', classification: 'INTERVENTION', hiddenUntilSeen: true }),
  Object.freeze({ id: 'inversion', order: 3, title: 'THE OTHER DOOR', classification: 'INVERSION', hiddenUntilSeen: true }),
  Object.freeze({ id: 'drugged', order: 4, title: 'COLD, BITTER, GONE', classification: 'CONTAMINATION', hiddenUntilSeen: true }),
]);

export function returnDefinition(id) {
  return RETURN_DEFS.find((def) => def.id === id) || null;
}

export function returnIndexEntries(meta) {
  const seen = new Set((meta?.endingsSeen || []).filter((id) => ENDING_IDS.includes(id)));
  const revealClassifications = seen.size >= 2;
  return RETURN_DEFS.map((def) => ({
    ...def,
    seen: seen.has(def.id),
    displayTitle: seen.has(def.id) ? def.title : '████████████',
    displayClassification: seen.has(def.id) || revealClassifications ? def.classification : '',
    status: seen.has(def.id) ? 'FILED' : 'WITHHELD',
  }));
}

export function buildRunSummary({ endingId, save, meta, authoritative = {}, now = Date.now() } = {}) {
  const run = save?.run;
  if (!run || !ENDING_IDS.includes(endingId)) throw new Error(`cannot summarize ending: ${endingId}`);
  const ledger = run.ledger || {};
  const rec = authoritative.rec || {};
  const completedRooms = Array.isArray(rec.takes) ? [...new Set(rec.takes)] : [...new Set(ledger.takes?.rooms || [])];
  const injuries = Number.isFinite(Number(rec.injuries)) ? Number(rec.injuries) : Number(ledger.injuries) || 0;
  const issued = ['light', 'recorder', 'map', 'radio'];
  const dropped = [...new Set(ledger.equipment?.dropped || [])];
  const missing = [...new Set(authoritative.missingEquipment || dropped)];
  const returned = issued.filter((id) => !missing.includes(id));

  return {
    schema: 1,
    id: `return:${run.id}`,
    runId: run.id,
    endingId,
    startedAt: run.startedAt,
    completedAt: now,
    durationSeconds: Math.max(0, Number(save?.playSeconds) || Math.floor((now - run.startedAt) / 1000)),
    rules: clone(run.rules),
    integrity: clone(run.integrity),
    takes: {
      completed: completedRooms.length,
      spoiled: Number(ledger.takes?.spoiled) || 0,
      aborted: Number(ledger.takes?.aborted) || 0,
      rooms: completedRooms,
    },
    injuries,
    battles: clone(ledger.battles || { started: 0, won: 0, lost: 0, firstPassWon: 0, results: {} }),
    disclosures: { found: (ledger.disclosures || []).length, ids: [...(ledger.disclosures || [])] },
    documents: { read: (ledger.documentsRead || []).length, ids: [...(ledger.documentsRead || [])] },
    equipment: {
      issued: issued.length,
      returned: returned.length,
      missing,
      dropped,
      recovered: [...(ledger.equipment?.recovered || [])],
    },
    choices: clone(ledger.choices || {}),
    replay: clone(run.replay || {}),
    unlockedAchievements: [],
    newlyUnlockedFeatures: [],
    endingsAtCompletion: new Set([...(meta?.endingsSeen || []), endingId]).size,
  };
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
