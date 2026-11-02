export function normalizeReturnHistory(history) {
  const ids = [];
  for (const entry of Array.isArray(history) ? history : []) {
    const id = typeof entry === 'string'
      ? entry
      : typeof entry?.id === 'string'
        ? entry.id
        : typeof entry?.summaryId === 'string' ? entry.summaryId : '';
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// Old ordinary returns did not carry an integrity field. Only explicit
// developer evidence excludes a record; a real failed night remains history.
export function isOrdinaryReturnRecord(record) {
  return !!record && typeof record === 'object' && !Array.isArray(record)
    && record.developerRun !== true && record.integrity?.achievements?.eligible !== false;
}

export function resolvedReturnHistory(meta, { includeDeveloper = false } = {}) {
  const records = meta?.returns?.records || {};
  return normalizeReturnHistory(meta?.returns?.history).map((id) => records[id])
    .filter(record => includeDeveloper ? !!record : isOrdinaryReturnRecord(record));
}

export function lastReturnRecord(meta, options) {
  const records = resolvedReturnHistory(meta, options);
  return records[records.length - 1] || null;
}
