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

// The God menu's NUKE ALL SD INSTANCES, on the desktop build: stop the lens this
// app manages and end every other copy of this game's lens, any chunk-lens
// sidecar (orphans keep a model in memory for days) and any checkout's dev lens
// server. Diffusion servers that are not this game's are reported, never
// touched. Returns { stoppedManaged, killed, foreign }.
export async function nukeNativeLens() {
  if (!IS_TAURI) return { stoppedManaged: false, killed: [], foreign: [] };
  const { invoke } = await import('@tauri-apps/api/core');
  publishBootstrap({ state: 'stopped', detail: 'nuked from the God menu' });
  return invoke('chunk_lens_nuke');
}

// What the nuke would end, without ending anything.
export async function scanNativeLens() {
  if (!IS_TAURI) return { managed: false, running: [], foreign: [] };
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('chunk_lens_scan');
}
