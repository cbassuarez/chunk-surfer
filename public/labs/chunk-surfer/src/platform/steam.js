const bridge = () => globalThis.window?.platformBridge || null;

export const steamPlatform = Object.freeze({
  get kind() { return bridge()?.kind || 'steam'; },
  nativeAchievements: true,
  async initialize() {
    return bridge()?.initialize?.() || { ready: false, achievements: [], stats: {} };
  },
  async unlockAchievement(id) { return !!(await bridge()?.unlockAchievement?.(id)); },
  async setStat(id, value) { return !!(await bridge()?.setStat?.(id, value)); },
  async flush() { return !!(await bridge()?.flush?.()); },
});
