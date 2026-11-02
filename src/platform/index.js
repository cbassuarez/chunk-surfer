import { browserPlatform } from './browser.js';
import { steamPlatform } from './steam.js';
import { IS_TAURI } from './paths.js';

export function currentPlatform() {
  if (globalThis.window?.platformBridge) return steamPlatform;
  if (IS_TAURI) return steamPlatform;
  return browserPlatform;
}

export const platform = currentPlatform();
