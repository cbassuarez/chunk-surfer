export const desktopPlatform = Object.freeze({
  kind: 'tauri',
  nativeAchievements: false,
  // Initial desktop port keeps browser-compatible storage. The boundary exists
  // so settings.json/save.json/profile.json can move into app-data without
  // touching game systems later.
  async initialize() { return { ready: true, achievements: [], stats: {} }; },
  async unlockAchievement() { return false; },
  async setStat() { return false; },
  async flush() { return true; },
});
