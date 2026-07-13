export const DESKTOP_MENU_EVENT = 'chunk-surfer://desktop-menu';

export const DESKTOP_MENU_ACTION = Object.freeze({
  ABOUT: 'about',
  PREFERENCES: 'preferences',
  DIAGNOSTICS: 'diagnostics',

  NEW_GAME: 'new_game',
  CONTINUE: 'continue',
  RESTART_RUN: 'restart_run',
  PAUSE: 'pause',
  DIFFICULTY: 'difficulty',
  ACHIEVEMENTS: 'achievements',
  RETURN_TO_TITLE: 'return_to_title',

  GAME_MODE: 'game_mode',
  FULLSCREEN: 'fullscreen',
  MINIMIZE: 'minimize',
  RESET_WINDOW: 'reset_window',
  REDUCE_MOTION: 'reduce_motion',
  REDUCE_FLASH: 'reduce_flash',
  HIGH_CONTRAST: 'high_contrast',

  MUTE: 'mute',
  RESTART_AUDIO: 'restart_audio',
  AUDIO_DIAGNOSTICS: 'audio_diagnostics',

  CONTROLS: 'controls',
  OPEN_SAVE_FOLDER: 'open_save_folder',
  OPEN_RELEASE_PAGE: 'open_release_page',
  REPORT_ISSUE: 'report_issue',
});

const ACTION_SET = new Set(Object.values(DESKTOP_MENU_ACTION));

export function normalizeDesktopMenuPayload(payload) {
  if (typeof payload === 'string') return { id: payload };
  if (payload && typeof payload === 'object') {
    return {
      id: String(payload.id || ''),
      checked: typeof payload.checked === 'boolean' ? payload.checked : undefined,
      source: payload.source ? String(payload.source) : 'native-menu',
    };
  }
  return { id: '' };
}

export function isKnownDesktopMenuAction(id) {
  return ACTION_SET.has(String(id || ''));
}

export function routeDesktopMenuAction(payload, handlers = {}) {
  const action = normalizeDesktopMenuPayload(payload);

  switch (action.id) {
    case DESKTOP_MENU_ACTION.ABOUT:
      handlers.openAbout?.();
      return true;

    case DESKTOP_MENU_ACTION.PREFERENCES:
      handlers.openSettings?.({ inGame: false, initialTab: 'display' });
      return true;

    case DESKTOP_MENU_ACTION.DIAGNOSTICS:
      handlers.openSettings?.({ inGame: handlers.isInGame?.() === true, initialTab: 'system' });
      return true;

    case DESKTOP_MENU_ACTION.NEW_GAME:
    case DESKTOP_MENU_ACTION.RESTART_RUN:
      handlers.beginNewGameFlow?.();
      return true;

    case DESKTOP_MENU_ACTION.CONTINUE:
      handlers.continueRun?.();
      return true;

    case DESKTOP_MENU_ACTION.PAUSE:
      handlers.togglePauseMenu?.();
      return true;

    case DESKTOP_MENU_ACTION.DIFFICULTY:
      handlers.openDifficulty?.();
      return true;

    case DESKTOP_MENU_ACTION.ACHIEVEMENTS:
      handlers.openAchievements?.();
      return true;

    case DESKTOP_MENU_ACTION.RETURN_TO_TITLE:
      handlers.returnToTitle?.();
      return true;

    case DESKTOP_MENU_ACTION.GAME_MODE:
      handlers.toggleGameMode?.();
      return true;

    case DESKTOP_MENU_ACTION.FULLSCREEN:
      handlers.onNativeFullscreenToggled?.();
      return true;

    case DESKTOP_MENU_ACTION.MINIMIZE:
      handlers.onNativeMinimized?.();
      return true;

    case DESKTOP_MENU_ACTION.RESET_WINDOW:
      handlers.resetWindow?.();
      return true;

    case DESKTOP_MENU_ACTION.REDUCE_MOTION:
      handlers.setReduceMotion?.(action.checked);
      return true;

    case DESKTOP_MENU_ACTION.REDUCE_FLASH:
      handlers.setReduceFlash?.(action.checked);
      return true;

    case DESKTOP_MENU_ACTION.HIGH_CONTRAST:
      handlers.setHighContrast?.(action.checked);
      return true;

    case DESKTOP_MENU_ACTION.MUTE:
      handlers.toggleMute?.();
      return true;

    case DESKTOP_MENU_ACTION.RESTART_AUDIO:
      handlers.restartAudio?.();
      return true;

    case DESKTOP_MENU_ACTION.AUDIO_DIAGNOSTICS:
      handlers.openSettings?.({ inGame: handlers.isInGame?.() === true, initialTab: 'audio' });
      return true;

    case DESKTOP_MENU_ACTION.CONTROLS:
      handlers.openSettings?.({ inGame: handlers.isInGame?.() === true, initialTab: 'input' });
      return true;

    case DESKTOP_MENU_ACTION.OPEN_SAVE_FOLDER:
      handlers.openSaveFolder?.();
      return true;

    case DESKTOP_MENU_ACTION.OPEN_RELEASE_PAGE:
      handlers.openReleasePage?.();
      return true;

    case DESKTOP_MENU_ACTION.REPORT_ISSUE:
      handlers.reportIssue?.();
      return true;

    default:
      return false;
  }
}

export function isReservedDesktopShortcut(event) {
  if (!event) return false;

  const key = String(event.key || '').toLowerCase();
  const code = String(event.code || '').toLowerCase();
  const hasPrimaryMod = !!(event.metaKey || event.ctrlKey);

  if (!hasPrimaryMod && (key === 'f11' || code === 'f11')) return true;
  if (!hasPrimaryMod) return false;

  if (key === 'q') return true;
  if (key === ',') return true;
  if (key === 'm') return true;
  if (key === 'f') return true;
  if (key === 'p') return true;
  if (key === 'n') return true;

  return false;
}
