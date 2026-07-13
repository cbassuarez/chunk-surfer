export const APP_BASE = import.meta.env.BASE_URL || './';

export const IS_TAURI = typeof window !== 'undefined' && (
  '__TAURI_INTERNALS__' in window ||
  '__TAURI__' in window ||
  window.location?.protocol === 'tauri:'
);

export function assetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '');
  const base = APP_BASE && APP_BASE !== '/' ? APP_BASE : './';
  return new URL(`${base}${clean}`, document.baseURI).href;
}
