// Stable Diffusion is an explicit opt-in. Missing or unreadable browser
// preferences now choose the ordinary authored renderer. Keep the old key so
// existing OFF choices survive; an explicit ON is represented by '0'.
export const SD_OFF_KEY = 'chunk-surfer.sd-off';

export function stableDiffusionOffAtStartup(query, { storage, startupOptIn = false } = {}) {
  if (query?.has('nosd')) return true;
  // These are deliberate development requests, rather than the mere presence
  // of a configured local endpoint. They apply to this launch only.
  if (query?.get('sd') === '1' || query?.get('lens') === '1' || query?.get('diffusion')) return false;
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(SD_OFF_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch {}
  return !startupOptIn;
}

export function persistStableDiffusionOff(off, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(SD_OFF_KEY, off ? '1' : '0'); } catch {}
}
