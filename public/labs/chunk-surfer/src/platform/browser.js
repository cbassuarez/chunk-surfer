export const browserPlatform = Object.freeze({
  kind: 'browser',
  nativeAchievements: false,
  async initialize() { return { ready: true, achievements: [], stats: {} }; },
  async unlockAchievement() { return false; },
  async setStat() { return false; },
  async flush() { return true; },
});
