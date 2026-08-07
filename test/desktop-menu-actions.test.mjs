import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_MENU_ACTION,
  isBrowserChromeShortcut,
  isKnownDesktopMenuAction,
  isReservedDesktopShortcut,
  normalizeDesktopMenuPayload,
  routeDesktopMenuAction,
} from '../src/platform/desktop-menu-actions.js';

test('desktop menu action ids are unique and stable', () => {
  const ids = Object.values(DESKTOP_MENU_ACTION);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('preferences'));
  assert.ok(ids.includes('new_game'));
  assert.ok(ids.includes('game_mode'));
  assert.equal(ids.includes('quit'), false);
});

test('normalizes string and object payloads', () => {
  assert.deepEqual(normalizeDesktopMenuPayload('preferences'), { id: 'preferences' });
  assert.deepEqual(normalizeDesktopMenuPayload({ id: 'reduce_motion', checked: true }), {
    id: 'reduce_motion',
    checked: true,
    source: 'native-menu',
  });
});

test('known action predicate accepts only frontend actions', () => {
  assert.equal(isKnownDesktopMenuAction('preferences'), true);
  assert.equal(isKnownDesktopMenuAction('quit'), false);
  assert.equal(isKnownDesktopMenuAction('not_real'), false);
});

test('preferences opens app-level settings display tab', () => {
  const calls = [];
  const ok = routeDesktopMenuAction('preferences', {
    isInGame: () => true,
    openSettings: (opts) => calls.push(opts),
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [{ inGame: false, initialTab: 'display' }]);
});

test('pause opens pause menu instead of preferences', () => {
  const calls = [];
  routeDesktopMenuAction('pause', {
    togglePauseMenu: () => calls.push('pause'),
    openSettings: () => calls.push('settings'),
  });
  assert.deepEqual(calls, ['pause']);
});

test('audio diagnostics opens audio tab in game', () => {
  const calls = [];
  routeDesktopMenuAction('audio_diagnostics', {
    isInGame: () => true,
    openSettings: (opts) => calls.push(opts),
  });
  assert.deepEqual(calls, [{ inGame: true, initialTab: 'audio' }]);
});

test('checked toggles are forwarded to handlers', () => {
  const calls = [];
  routeDesktopMenuAction({ id: 'reduce_flash', checked: true }, {
    setReduceFlash: (checked) => calls.push(checked),
  });
  assert.deepEqual(calls, [true]);
});

test('unknown desktop menu action is ignored', () => {
  assert.equal(routeDesktopMenuAction('bogus', {}), false);
});

test('desktop shortcuts are reserved before game shortcuts', () => {
  assert.equal(isReservedDesktopShortcut({ key: 'q', metaKey: true }), true);
  assert.equal(isReservedDesktopShortcut({ key: ',', ctrlKey: true }), true);
  assert.equal(isReservedDesktopShortcut({ key: 'm', ctrlKey: true }), true);
  assert.equal(isReservedDesktopShortcut({ key: 'f', ctrlKey: true }), true);
  assert.equal(isReservedDesktopShortcut({ key: 'p', ctrlKey: true }), true);
  assert.equal(isReservedDesktopShortcut({ key: 'g', metaKey: true, shiftKey: true }), true);
  assert.equal(isReservedDesktopShortcut({ key: 'F11' }), true);
  assert.equal(isReservedDesktopShortcut({ key: 'f' }), false);
});

test('the browser keys a packaged build refuses', () => {
  // Reload, which is the one that matters: it does not look like a reload in
  // play, it looks like being teleported to the last committed position.
  assert.equal(isBrowserChromeShortcut({ key: 'r', metaKey: true }), true);
  assert.equal(isBrowserChromeShortcut({ key: 'r', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBrowserChromeShortcut({ key: 'F5' }), true);

  // Devtools, including the macOS Option rewrite: Cmd+Alt+I arrives with a dead
  // character in `key`, so the letter has to be read off `code`.
  assert.equal(isBrowserChromeShortcut({ key: 'F12' }), true);
  assert.equal(isBrowserChromeShortcut({ key: 'i', metaKey: true, shiftKey: true, code: 'KeyI' }), true);
  assert.equal(isBrowserChromeShortcut({ key: 'ˆ', metaKey: true, altKey: true, code: 'KeyI' }), true);
  assert.equal(isBrowserChromeShortcut({ key: 'c', metaKey: true, shiftKey: true, code: 'KeyC' }), true);

  assert.equal(isBrowserChromeShortcut({ key: 'u', metaKey: true }), true);
  assert.equal(isBrowserChromeShortcut({ key: 's', ctrlKey: true }), true);
  assert.equal(isBrowserChromeShortcut({ key: '0', metaKey: true, code: 'Digit0' }), true);
});

test('and the ones it must not swallow', () => {
  // Copy is not the inspector. Requiring shift or alt is the whole difference,
  // and getting it wrong would break clipboard support everywhere in the game.
  assert.equal(isBrowserChromeShortcut({ key: 'c', metaKey: true, code: 'KeyC' }), false);
  // Plain typing, and the letters with no modifier held.
  assert.equal(isBrowserChromeShortcut({ key: 'r' }), false);
  assert.equal(isBrowserChromeShortcut({ key: 's' }), false);
  assert.equal(isBrowserChromeShortcut({}), false);
  assert.equal(isBrowserChromeShortcut(null), false);

  // Nothing may appear in both lists. Whichever check ran first would silently
  // decide the behaviour, and the two disagree about what to do.
  for (const e of [
    { key: 'q', metaKey: true }, { key: ',', metaKey: true }, { key: 'm', metaKey: true },
    { key: 'f', metaKey: true }, { key: 'p', metaKey: true }, { key: 'n', metaKey: true },
    { key: 'g', metaKey: true, shiftKey: true }, { key: 'F11' },
  ]) {
    assert.equal(isBrowserChromeShortcut(e), false,
      `${e.key} is claimed by isReservedDesktopShortcut and must not also be refused here`);
    assert.equal(isReservedDesktopShortcut(e), true, `${e.key} should still be reserved`);
  }
});
