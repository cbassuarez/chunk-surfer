import { IS_TAURI } from './paths.js';

function publishBootstrap(patch = {}) {
  const host = globalThis.window;
  if (!host) return null;
  host.__lensBootstrap = {
    state: 'idle',
    completed: 0,
    total: 4,
    detail: '',
    ...host.__lensBootstrap,
    ...patch,
    updatedAt: Date.now(),
  };
  return host.__lensBootstrap;
}

export function nativeLensBootstrapStatus() {
  return { ...(globalThis.window?.__lensBootstrap || {}) };
}

export async function bootstrapNativeLens({ restart = false } = {}) {
  if (!IS_TAURI) return null;
  publishBootstrap({
    state: restart ? 'recovering' : 'checking',
    completed: restart ? 1 : 0,
    detail: restart ? 'RECOVERING LOCAL RUNTIME' : 'VERIFYING BUNDLED CONTENT',
    error: '',
  });
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    publishBootstrap({
      state: restart ? 'recovering' : 'starting-runtime',
      completed: restart ? 2 : 1,
      detail: restart ? 'RESTARTING PYTORCH + COMPEL' : 'UNPACKING PYTORCH + COMPEL',
    });
    const config = await invoke(restart ? 'chunk_lens_retry' : 'chunk_lens_bootstrap');
    publishBootstrap({
      state: 'ready',
      completed: 4,
      detail: 'LOCAL RUNTIME READY',
      backend: config?.backend || '',
    });
    return config;
  } catch (error) {
    publishBootstrap({
      state: 'attention',
      detail: 'LOCAL RUNTIME NEEDS ATTENTION',
      error: error?.message || String(error || 'runtime unavailable'),
    });
    throw error;
  }
}

export async function stopNativeLens() {
  if (!IS_TAURI) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('chunk_lens_stop');
}
