export function nextGameModeState(current = {}, patch = {}) {
  const enabled = typeof patch.enabled === 'boolean' ? patch.enabled : !current.enabled;
  const previousWindowPreset = enabled
    ? (patch.previousWindowPreset || current.previousWindowPreset || '1280x800')
    : (current.previousWindowPreset || patch.previousWindowPreset || '1280x800');

  return {
    enabled,
    previousWindowPreset,
    enteredAt: enabled ? (patch.now ?? Date.now()) : null,
  };
}

export function applyGameModeDom(enabled, doc = document) {
  const body = doc?.body;
  if (!body?.classList) return;
  body.classList.toggle('desktop-game-mode', !!enabled);
  body.classList.toggle('desktop-cursor-idle', false);
}
