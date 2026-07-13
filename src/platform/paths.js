const viteEnv = import.meta.env || {};

export const APP_BASE = viteEnv.BASE_URL || './';

export const IS_TAURI = typeof window !== 'undefined' && (
  '__TAURI_INTERNALS__' in window ||
  '__TAURI__' in window ||
  window.location?.protocol === 'tauri:' ||
  window.location?.hostname === 'tauri.localhost'
);

export function assetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  if (typeof document === 'undefined') return clean;
  const base = APP_BASE && APP_BASE !== '/' ? APP_BASE : './';
  return new URL(`${base}${clean}`, document.baseURI).href;
}
