// Stable Diffusion is development-only. A production build passes available:false
// and cannot be re-enabled by URL parameters or persisted browser preferences.
// Keep the existing preference key for developer tools and baseline comparisons.
export const SD_OFF_KEY = 'chunk-surfer.sd-off';

export function stableDiffusionOffAtStartup(query, { storage, available = true, startupOptIn = false } = {}) {
  // The build-time development capability is authoritative. No query string,
  // saved God-menu setting or old profile can start an unbundled release lens.
  if (!available || query?.has('nosd')) return true;
  // An explicit --sd development launch wins over a previous OFF preference.
  if (startupOptIn || query?.get('sd') === '1' || query?.get('lens') === '1' || query?.get('diffusion')) return false;
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(SD_OFF_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch {}
  return true;
}

export function persistStableDiffusionOff(off, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem(SD_OFF_KEY, off ? '1' : '0'); } catch {}
}
