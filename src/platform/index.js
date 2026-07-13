import { browserPlatform } from './browser.js';
import { desktopPlatform } from './desktop.js';
import { steamPlatform } from './steam.js';
import { IS_TAURI } from './paths.js';

export function currentPlatform() {
  if (globalThis.window?.platformBridge) return steamPlatform;
  if (IS_TAURI) return desktopPlatform;
  return browserPlatform;
}

export const platform = currentPlatform();
