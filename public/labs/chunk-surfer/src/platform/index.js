import { browserPlatform } from './browser.js';
import { steamPlatform } from './steam.js';

export function currentPlatform() {
  return globalThis.window?.platformBridge ? steamPlatform : browserPlatform;
}

export const platform = currentPlatform();
