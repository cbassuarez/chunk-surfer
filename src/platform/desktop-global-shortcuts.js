import { IS_TAURI } from './paths.js';
import { isNativeWindowFocused } from './desktop-window.js';

const SHORTCUTS = Object.freeze([
  ['CommandOrControl+Q', 'quit'],
  ['CommandOrControl+M', 'minimize'],
  ['CommandOrControl+,', 'preferences'],
  ['CommandOrControl+F', 'gameMode'],
  ['F11', 'gameMode'],
  ['CommandOrControl+P', 'pause'],
  ['CommandOrControl+N', 'newGame'],
  ['CommandOrControl+Shift+M', 'mute'],
]);

let installed = false;
let registeredShortcuts = [];

export function desktopGlobalShortcutSpecs() {
  return SHORTCUTS.map(([shortcut, action]) => ({ shortcut, action }));
}

function actionForShortcut(shortcut) {
  const canonical = String(shortcut || '').toLowerCase();
  return SHORTCUTS.find(([candidate]) => candidate.toLowerCase() === canonical)?.[1] || null;
}

async function shouldHandleShortcut(options = {}) {
  if (typeof options.isFocused === 'function') return !!(await options.isFocused());
  return isNativeWindowFocused();
}

export async function installDesktopGlobalShortcuts(handlers = {}, options = {}) {
  if (installed) return () => {};
  if (!IS_TAURI && !options.register) return () => {};

  installed = true;

  const register = options.register || (await import('@tauri-apps/plugin-global-shortcut')).register;
  const unregister = options.unregister || (await import('@tauri-apps/plugin-global-shortcut')).unregister;
  const shortcuts = options.shortcuts || SHORTCUTS.map(([shortcut]) => shortcut);

  try {
    await unregister(shortcuts).catch?.(() => {});
  } catch (_) {}

  registeredShortcuts = [];

  for (const shortcut of shortcuts) {
    try {
      await register(shortcut, async (event = {}) => {
        if (event.state && event.state !== 'Pressed') return;
        if (!(await shouldHandleShortcut(options))) return;

        const action = actionForShortcut(event.shortcut || shortcut);
        switch (action) {
          case 'quit':
            await handlers.quit?.();
            break;
          case 'minimize':
            await handlers.minimize?.();
            break;
          case 'preferences':
            await handlers.openPreferences?.();
            break;
          case 'gameMode':
            await handlers.toggleGameMode?.();
            break;
          case 'pause':
            await handlers.togglePauseMenu?.();
            break;
          case 'newGame':
            await handlers.beginNewGameFlow?.();
            break;
          case 'mute':
            await handlers.toggleMute?.();
            break;
          default:
            break;
        }
      });
      registeredShortcuts.push(shortcut);
    } catch (err) {
      console.warn?.(`[desktop-shortcuts] failed to register ${shortcut}`, err);
    }
  }

  return () => uninstallDesktopGlobalShortcuts({ unregister });
}

export async function uninstallDesktopGlobalShortcuts(options = {}) {
  const unregister = options.unregister || (IS_TAURI ? (await import('@tauri-apps/plugin-global-shortcut')).unregister : null);
  if (unregister && registeredShortcuts.length) {
    try { await unregister(registeredShortcuts); } catch (_) {}
  }
  registeredShortcuts = [];
  installed = false;
}

export function __resetDesktopGlobalShortcutsForTests() {
  installed = false;
  registeredShortcuts = [];
}
