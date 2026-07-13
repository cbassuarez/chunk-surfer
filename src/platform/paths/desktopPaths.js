import { isTauriRuntime } from '../detect.js';

export async function resolveDesktopPaths() {
  if (!isTauriRuntime()) return null;
  const path = await import('@tauri-apps/api/path');
  return {
    appData: await path.appDataDir(),
    appConfig: await path.appConfigDir(),
    appLog: await path.appLogDir(),
  };
}
