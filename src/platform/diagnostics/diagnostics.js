import { detectStorageBackendKind, isTauriRuntime } from '../detect.js';
import { runtimeSnapshot } from '../launch.js';

const recent = [];
let logApi = null;
let logApiLoaded = false;

const SENSITIVE_WORD = /\b(username|persona|identity|operator)\b|display\s*name|display_name|displayName/i;

function redact(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (SENSITIVE_WORD.test(text)) return '[redacted local identity detail]';
  return text.slice(0, 500);
}

function remember(level, message, detail = null) {
  recent.push({ at: new Date().toISOString(), level, message: redact(message || ''), detail: detail ? redact(detail) : null });
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
    const text = detail ? `${redact(message)} ${redact(detail)}` : redact(message);
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
  const launch = runtimeSnapshot();
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
    location: launch.rawLocation,
    launch,
    renderer: launch.renderer,
    lens: launch.lens,
    storage: storageInfo,
    recent,
  };
}

export async function exportDiagnostics(storage) {
  return collectDiagnostics({ storage });
}
