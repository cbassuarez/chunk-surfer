import { IS_TAURI } from './paths.js';

export async function bootstrapNativeLens({ restart = false } = {}) {
  if (!IS_TAURI) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(restart ? 'chunk_lens_retry' : 'chunk_lens_bootstrap');
}

export async function stopNativeLens() {
  if (!IS_TAURI) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('chunk_lens_stop');
}
