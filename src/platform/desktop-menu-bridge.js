import { IS_TAURI } from './paths.js';
import { DESKTOP_MENU_EVENT, routeDesktopMenuAction } from './desktop-menu-actions.js';

let installed = false;
let unlisten = null;

export async function installDesktopMenuBridge(handlers = {}, options = {}) {
  if (installed) return () => {};
  installed = true;

  const targetWindow = options.window || (typeof window !== 'undefined' ? window : null);

  const route = (payload) => {
    try {
      return routeDesktopMenuAction(payload, handlers);
    } catch (err) {
      console.warn?.('[desktop-menu] action failed', err);
      return false;
    }
  };

  if (targetWindow && options.devWindow !== false) {
    targetWindow.__chunkSurferDesktopMenu = {
      dispatch: (idOrPayload) => route(idOrPayload),
    };
  }

  if (!IS_TAURI && !options.listen) {
    return () => uninstallDesktopMenuBridge({ window: targetWindow });
  }

  const listen = options.listen || (await import('@tauri-apps/api/event')).listen;
  unlisten = await listen(DESKTOP_MENU_EVENT, (event) => {
    route(event?.payload);
  });

  return () => uninstallDesktopMenuBridge({ window: targetWindow });
}

export function uninstallDesktopMenuBridge(options = {}) {
  const targetWindow = options.window || (typeof window !== 'undefined' ? window : null);
  installed = false;

  if (targetWindow?.__chunkSurferDesktopMenu) {
    delete targetWindow.__chunkSurferDesktopMenu;
  }

  try { unlisten?.(); } catch (_) {}
  unlisten = null;
}

export function __resetDesktopMenuBridgeForTests() {
  installed = false;
  unlisten = null;
}
