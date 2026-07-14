import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDesktopMenuAction } from '../src/platform/desktop-menu-actions.js';

test('preferences opens full app settings', () => {
  const calls = [];
  routeDesktopMenuAction('preferences', {
    isInGame: () => true,
    openSettings: (opts) => calls.push(['settings', opts]),
  });
  assert.deepEqual(calls, [['settings', { inGame: false, initialTab: 'display' }]]);
});

test('pause routes to pause menu, not settings', () => {
  const calls = [];
  routeDesktopMenuAction('pause', {
    togglePauseMenu: () => calls.push('pause'),
    openSettings: () => calls.push('settings'),
  });
  assert.deepEqual(calls, ['pause']);
});

test('god menu has its own desktop route', () => {
  const calls=[];
  routeDesktopMenuAction('god_menu', {
    openGodMenu:()=>calls.push('god'),
    togglePauseMenu:()=>calls.push('pause'),
  });
  assert.deepEqual(calls,['god']);
});

test('audio diagnostics opens settings audio tab', () => {
  const calls = [];
  routeDesktopMenuAction('audio_diagnostics', {
    isInGame: () => true,
    openSettings: (opts) => calls.push(opts),
  });
  assert.deepEqual(calls, [{ inGame: true, initialTab: 'audio' }]);
});

test('reset window routes separately from game mode', () => {
  const calls = [];
  routeDesktopMenuAction('reset_window', { resetWindow: () => calls.push('reset') });
  routeDesktopMenuAction('game_mode', { toggleGameMode: () => calls.push('game-mode') });
  assert.deepEqual(calls, ['reset', 'game-mode']);
});
