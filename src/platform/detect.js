import { IS_TAURI } from './paths.js';

export function isTauriRuntime() {
  return !!IS_TAURI;
}

export function detectStorageBackendKind() {
  return isTauriRuntime() ? 'desktop' : 'browser';
}
