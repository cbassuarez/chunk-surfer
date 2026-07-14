import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_MENU_ACTION,
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
