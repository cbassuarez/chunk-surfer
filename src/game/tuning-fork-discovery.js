// Cancelling an unfinished inspection is different from choosing to leave it.
// Keep every other once-per-run thought and any extra save fields intact.
export function tuningForkCancellationThoughts(state = {}, { owned = false, declined = false } = {}) {
  if (owned || declined) return state;
  return {
    ...state,
    had: (Array.isArray(state.had) ? state.had : []).filter(id => id !== 'talisman'),
  };
}
