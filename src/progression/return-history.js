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

export function resolvedReturnHistory(meta) {
  const records = meta?.returns?.records || {};
  return normalizeReturnHistory(meta?.returns?.history).map((id) => records[id]).filter(Boolean);
}

export function lastReturnRecord(meta) {
  const records = resolvedReturnHistory(meta);
  return records[records.length - 1] || null;
}
