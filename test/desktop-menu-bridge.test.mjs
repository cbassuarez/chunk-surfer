import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetDesktopMenuBridgeForTests,
  installDesktopMenuBridge,
  uninstallDesktopMenuBridge,
} from '../src/platform/desktop-menu-bridge.js';
import { DESKTOP_MENU_EVENT } from '../src/platform/desktop-menu-actions.js';

test('bridge subscribes and routes payloads', async () => {
  __resetDesktopMenuBridgeForTests();
  const calls = [];
  const listened = [];
  const fakeWindow = {};

  const dispose = await installDesktopMenuBridge({
    openSettings: (opts) => calls.push(opts),
  }, {
    window: fakeWindow,
    devWindow: false,
    listen: async (eventName, cb) => {
      listened.push(eventName);
      cb({ payload: 'preferences' });
      return () => listened.push('unlisten');
    },
  });

  assert.deepEqual(listened, [DESKTOP_MENU_EVENT]);
  assert.deepEqual(calls, [{ inGame: false, initialTab: 'display' }]);

  dispose();
  assert.deepEqual(listened, [DESKTOP_MENU_EVENT, 'unlisten']);
});

test('bridge exposes dev dispatch hook in browser builds', async () => {
  __resetDesktopMenuBridgeForTests();
  const calls = [];
  const fakeWindow = {};

  const dispose = await installDesktopMenuBridge({
    beginNewGameFlow: () => calls.push('new'),
  }, { window: fakeWindow });

  assert.equal(typeof fakeWindow.__chunkSurferDesktopMenu.dispatch, 'function');
  assert.equal(fakeWindow.__chunkSurferDesktopMenu.dispatch('new_game'), true);
  assert.deepEqual(calls, ['new']);

  dispose();
  assert.equal(fakeWindow.__chunkSurferDesktopMenu, undefined);
});

test('duplicate installs do not create duplicate listeners', async () => {
  __resetDesktopMenuBridgeForTests();
  let count = 0;
  const listen = async () => {
    count += 1;
    return () => {};
  };

  const first = await installDesktopMenuBridge({}, { devWindow: false, listen });
  const second = await installDesktopMenuBridge({}, { devWindow: false, listen });

  assert.equal(count, 1);
  second();
  first();
  uninstallDesktopMenuBridge();
});
