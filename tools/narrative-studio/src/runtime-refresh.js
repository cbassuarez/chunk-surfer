// A code refresh must never erase a person's unsaved story/audio/media edits.
// Only the derived, read-only envelopes are replaced by the newest source view.
export function mergeRuntimeDocuments(current, refreshed) {
  if (!current) return refreshed;
  return {
    ...current,
    documents: [
      ...current.documents.filter((item) => !item.readOnly),
      ...refreshed.documents.filter((item) => item.readOnly),
    ],
  };
}
