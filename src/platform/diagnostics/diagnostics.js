import { detectStorageBackendKind, isTauriRuntime } from '../detect.js';

const recent = [];
let logApi = null;
let logApiLoaded = false;

function remember(level, message, detail = null) {
  recent.push({ at: new Date().toISOString(), level, message: String(message || ''), detail: detail ? String(detail).slice(0, 500) : null });
  while (recent.length > 80) recent.shift();
}

async function loadLogApi() {
  if (logApiLoaded) return logApi;
  logApiLoaded = true;
  if (!isTauriRuntime()) return null;
  try { logApi = await import('@tauri-apps/plugin-log'); }
  catch (_) { logApi = null; }
  return logApi;
}

export async function initDiagnostics() {
  installGlobalErrorHandlers();
  await logInfo('app boot');
}

export function recentDiagnostics() { return [...recent]; }

export async function logDebug(message, detail) { return logWith('debug', message, detail); }
export async function logInfo(message, detail) { return logWith('info', message, detail); }
export async function logWarn(message, detail) { return logWith('warn', message, detail); }
export async function logError(message, detail) { return logWith('error', message, detail); }

async function logWith(level, message, detail = null) {
  remember(level, message, detail);
  try {
    const api = await loadLogApi();
    const text = detail ? `${message} ${String(detail).slice(0, 500)}` : String(message);
    if (api?.[level]) await api[level](text);
    else console[level === 'debug' ? 'debug' : level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](text);
  } catch (_) {
    try { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](message, detail || ''); } catch (__) {}
  }
}

let handlersInstalled = false;
export function installGlobalErrorHandlers() {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;
  window.addEventListener('error', (event) => {
    logError('window error', event?.message || event?.error?.message || 'unknown');
  });
  window.addEventListener('unhandledrejection', (event) => {
    logError('unhandled rejection', event?.reason?.message || event?.reason || 'unknown');
  });
}

export async function collectDiagnostics({ storage = null, build = 'LOCAL' } = {}) {
  let storageInfo = null;
  try { storageInfo = storage?.getStorageInfo ? await storage.getStorageInfo() : null; } catch (error) { storageInfo = { error: String(error?.message || error) }; }
  return {
    format: 'chunk-surfer-diagnostics',
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: build,
    schemaVersions: { settings: 1, profile: 1, save: 1 },
    platformMode: detectStorageBackendKind(),
    tauri: isTauriRuntime(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
    location: typeof location !== 'undefined' ? { protocol: location.protocol, search: location.search } : null,
    renderer: typeof location !== 'undefined' ? new URLSearchParams(location.search).get('renderer') : null,
    lens: typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lens') : null,
    storage: storageInfo,
    recent,
  };
}

export async function exportDiagnostics(storage) {
  return collectDiagnostics({ storage });
}
