import { APP_BASE, IS_TAURI } from './paths.js';

const DESKTOP_DEFAULTS = Object.freeze({
  renderer: '3d',
  lens: '1',
});

function rawSearch() {
  try { return globalThis.location?.search || ''; }
  catch (_) { return ''; }
}

export function runtimeParams() {
  const qp = new URLSearchParams(rawSearch());

  if (IS_TAURI) {
    for (const [key, value] of Object.entries(DESKTOP_DEFAULTS)) {
      if (!qp.has(key)) qp.set(key, value);
    }
  }

  return qp;
}

export function runtimeParam(name, fallback = null) {
  const qp = runtimeParams();
  return qp.has(name) ? qp.get(name) : fallback;
}

export function runtimeHas(name) {
  return runtimeParams().has(name);
}

export function runtimeDefaults() {
  return { ...DESKTOP_DEFAULTS };
}

export function rawLocationSnapshot() {
  if (typeof location === 'undefined') return null;
  return {
    href: location.href,
    protocol: location.protocol,
    pathname: location.pathname,
    search: location.search,
    hostname: location.hostname,
  };
}

export function runtimeSnapshot() {
  const qp = runtimeParams();
  return {
    tauri: IS_TAURI,
    appBase: APP_BASE,
    defaults: runtimeDefaults(),
    rawLocation: rawLocationSnapshot(),
    params: Object.fromEntries(qp.entries()),
    renderer: qp.get('renderer'),
    lens: qp.get('lens'),
  };
}
