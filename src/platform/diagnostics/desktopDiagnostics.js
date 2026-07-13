import { isTauriRuntime } from '../detect.js';

async function opener() {
  if (!isTauriRuntime()) return null;
  try { return await import('@tauri-apps/plugin-opener'); } catch (_) { return null; }
}

export async function revealPath(path) {
  const api = await opener();
  if (!api?.revealItemInDir) return { ok: false, unsupported: true };
  await api.revealItemInDir(path);
  return { ok: true, path };
}
