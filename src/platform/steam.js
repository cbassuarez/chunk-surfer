import { IS_TAURI } from './paths.js';
import { ACHIEVEMENT_BY_ID } from '../progression/achievement-defs.js';
import { LOCAL_STAT_BY_PLATFORM_ID } from '../progression/stat-defs.js';

// Capability means we can attempt the native adapter. Actual readiness and
// notification ownership are established by the native client's snapshot.
export function createSteamPlatform({ invoke = null, native = IS_TAURI, getBridge = () => globalThis.window?.platformBridge || null } = {}) {
  let ready = false, lastSnapshot = null, nativeInvoke = invoke;
  const call = async (command, args = {}) => {
    if (!nativeInvoke && native) nativeInvoke = (await import('@tauri-apps/api/core')).invoke;
    return nativeInvoke ? nativeInvoke(command, args) : false;
  };
  return Object.freeze({
    get kind() { return ready ? 'steam' : native ? 'tauri' : getBridge()?.kind || 'browser'; },
    nativeAchievements: true,
    get nativeNotifications() { return ready; },
    snapshot() { return lastSnapshot ? { ...lastSnapshot } : { ready: false, reason: 'NOT_INITIALIZED' }; },
    async initialize() {
      try {
        const bridge = getBridge();
        const result = bridge?.initialize ? await bridge.initialize() : native ? await call('chunk_steam_initialize') : null;
        lastSnapshot = result && typeof result === 'object' ? result : { ready: false, reason: 'STEAM_RUNTIME_UNAVAILABLE', achievements: [], stats: {} };
        ready = lastSnapshot.ready === true;
        return { ...lastSnapshot };
      } catch (error) {
        ready = false; lastSnapshot = { ready: false, reason: 'STEAM_INITIALIZE_FAILED', achievements: [], stats: {} };
        return { ...lastSnapshot };
      }
    },
    async unlockAchievement(id) {
      if (!ready || !Object.hasOwn(ACHIEVEMENT_BY_ID, id)) return false;
      const bridge = getBridge();
      return (bridge?.unlockAchievement ? await bridge.unlockAchievement(id) : await call('chunk_steam_unlock', { id })) === true;
    },
    async setStat(id, value) {
      if (!ready || !Object.hasOwn(LOCAL_STAT_BY_PLATFORM_ID, id) || !Number.isInteger(value) || value < 0 || value > 2147483647) return false;
      const bridge = getBridge();
      return (bridge?.setStat ? await bridge.setStat(id, value) : await call('chunk_steam_set_stat', { id, value })) === true;
    },
    async flush() {
      if (!ready) return false;
      const bridge = getBridge();
      return (bridge?.flush ? await bridge.flush() : await call('chunk_steam_flush')) === true;
    },
  });
}
export const steamPlatform = createSteamPlatform();
