import { IS_TAURI } from './paths.js';
import { findWindowPreset } from './display-policy.js';

async function invokeDesktop(command, payload) {
  if (!IS_TAURI) return { ok: false, reason: 'not-tauri' };
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke(command, payload);
  return { ok: true };
}

export async function setNativeWindowPreset(presetId, options = {}) {
  const preset = findWindowPreset(presetId);
  return invokeDesktop('chunk_set_window_size', {
    request: {
      width: preset.width,
      height: preset.height,
      center: options.center !== false,
    },
  });
}

export async function resetNativeWindow() {
  return invokeDesktop('chunk_reset_window');
}

export async function setNativeGameMode(enabled) {
  return invokeDesktop('chunk_set_game_mode', { enabled: !!enabled });
}

export async function minimizeNativeWindow() {
  return invokeDesktop('chunk_minimize');
}

export async function isNativeWindowFocused() {
  if (!IS_TAURI) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return !!(await invoke('chunk_window_is_focused'));
}

export async function quitNativeApp() {
  return invokeDesktop('chunk_quit');
}

export async function readNativeWindowMetrics() {
  if (!IS_TAURI) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('chunk_window_metrics');
}
