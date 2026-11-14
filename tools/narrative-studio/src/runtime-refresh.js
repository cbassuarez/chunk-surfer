// A code refresh must never erase a person's unsaved story/audio/media edits.
// Documents generated from code are replaced by the newest source view,
// except those with unsaved edits (keep: their ids): those stay as they are,
// and their save is checked against the module field by field.
export function mergeRuntimeDocuments(current, refreshed, keep = new Set()) {
  if (!current) return refreshed;
  const kept = new Map(current.documents.filter((item) => item.fromCode && keep.has(item.document.id)).map((item) => [item.document.id, item]));
  const fresh = refreshed.documents.filter((item) => item.fromCode);
  const freshIds = new Set(fresh.map((item) => item.document.id));
  return {
    ...current,
    documents: [
      ...current.documents.filter((item) => !item.fromCode),
      ...fresh.map((item) => kept.get(item.document.id) || item),
      ...[...kept.values()].filter((item) => !freshIds.has(item.document.id)),
    ],
  };
}
