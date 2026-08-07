export const STORY_EVIDENCE_TAGS = Object.freeze([
  'reference-pressure',
  'student-performance',
  'pre-roll-causality',
  'contract-inheritance',
  'borrowed-body',
]);

const EVIDENCE_SOURCES = Object.freeze({
  'reference-pressure': Object.freeze({
    documents: ['faculty-reference-requirement'],
    props: ['practice-reference-deck'],
  }),
  'student-performance': Object.freeze({
    documents: ['student-monitoring-notes'],
    props: ['chunk-surfer-transfer-label'],
  }),
  'pre-roll-causality': Object.freeze({
    documents: ['pre-roll-analysis'],
    disclosures: ['main_b3'],
  }),
  'contract-inheritance': Object.freeze({
    documents: ['work-order', 'work-order-carbon'],
  }),
  'borrowed-body': Object.freeze({
    documents: ['page-9', 'page-10'],
    items: ['interface'],
    disclosures: ['source:borrowed-body'],
  }),
});

const setOf = (value) => new Set(Array.isArray(value) ? value : []);
const intersects = (set, values = []) => values.some((value) => set.has(value));

export function deriveStoryEvidence(ledger = {}) {
  const pools = {
    documents: setOf(ledger.documentsRead),
    props: new Set([...(ledger.propsInspected || []), ...(ledger.propsAuditioned || [])]),
    items: setOf(ledger.itemsObtained),
    disclosures: setOf(ledger.disclosures),
  };
  const tags = STORY_EVIDENCE_TAGS.filter((tag) => {
    const sources = EVIDENCE_SOURCES[tag];
    return Object.entries(sources).some(([bucket, ids]) => intersects(pools[bucket], ids));
  });
  return Object.freeze({
    tags: Object.freeze(tags),
    count: tags.length,
    combatReadings: Object.freeze(tags.slice(0, 2)),
    sourceGuidance: tags.length >= 3,
    strongestRouteEvidence: tags.length === STORY_EVIDENCE_TAGS.length,
  });
}

export function canQualifyBorrowedRecordist({ ledger, hasFork = false, hasRig = false, bodyRedacted = false } = {}) {
  const evidence = deriveStoryEvidence(ledger);
  return evidence.strongestRouteEvidence && !!hasFork && !!hasRig && !!bodyRedacted;
}
