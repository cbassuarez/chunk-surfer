export const DESKTOP_MENU_EVENT = 'chunk-surfer://desktop-menu';

export const DESKTOP_MENU_ACTION = Object.freeze({
  ABOUT: 'about',
  PREFERENCES: 'preferences',
  DIAGNOSTICS: 'diagnostics',

  NEW_GAME: 'new_game',
  CONTINUE: 'continue',
  RESTART_RUN: 'restart_run',
  PAUSE: 'pause',
  GOD_MENU: 'god_menu',
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

    case DESKTOP_MENU_ACTION.GOD_MENU:
      handlers.openGodMenu?.();
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

// The keys a BROWSER owns, which a shipped game must not hand back to it.
//
// These are the other half of isReservedDesktopShortcut: that one lists keys the
// desktop app claims for itself, this one lists keys it refuses to let the
// webview action. In a packaged build they are not developer tools, they are
// ways to break a run — and the reload is the worst of them, because it does not
// look like a reload. Cmd+R restores the last committed position, so a player
// who hits it mid-corridor is silently moved somewhere else and reports being
// teleported. There is no bug at the destination; the reload IS the bug.
//
// Deliberately excludes anything isReservedDesktopShortcut already claims —
// Cmd+P (print/pause), Cmd+F (find/fullscreen), Cmd+N, Cmd+M, Cmd+Q — those are
// handled and preventDefault'd there, and listing them twice would mean whichever
// check ran first decided the behaviour.
//
// Matches on `code` for the letter combinations because macOS rewrites `key`
// under Option: Cmd+Alt+I arrives as key 'ˆ' and code 'KeyI'.
export function isBrowserChromeShortcut(event) {
  if (!event) return false;

  const key = String(event.key || '').toLowerCase();
  const code = String(event.code || '');
  const primary = !!(event.metaKey || event.ctrlKey);

  // Reload, hard reload, and the one that needs no modifier at all.
  if (key === 'f5' || code === 'F5') return true;
  if (primary && (key === 'r' || code === 'KeyR')) return true;

  // Devtools. Cmd+Shift+C is the inspector, which is why plain Cmd+C — copy —
  // must not match: the shift/alt requirement is what keeps it out.
  if (key === 'f12' || code === 'F12') return true;
  if (primary && (event.shiftKey || event.altKey)
    && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC')) return true;

  // View source and save-page: a game window is not a document.
  if (primary && (key === 'u' || code === 'KeyU')) return true;
  if (primary && (key === 's' || code === 'KeyS')) return true;

  // Zoom. The renderer owns its own scale; browser zoom desynchronises the
  // canvas from the pointer and there is no way back from inside the game.
  if (primary && ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(code)) return true;

  return false;
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
  if (key === 'g' && event.shiftKey) return true;

  return false;
}
