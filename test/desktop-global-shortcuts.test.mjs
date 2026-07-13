import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetDesktopGlobalShortcutsForTests,
  desktopGlobalShortcutSpecs,
  installDesktopGlobalShortcuts,
  uninstallDesktopGlobalShortcuts,
} from '../src/platform/desktop-global-shortcuts.js';

test('desktop global shortcut specs include app lifecycle commands', () => {
  const specs = desktopGlobalShortcutSpecs();
  assert.ok(specs.some((spec) => spec.shortcut === 'CommandOrControl+Q' && spec.action === 'quit'));
  assert.ok(specs.some((spec) => spec.shortcut === 'CommandOrControl+M' && spec.action === 'minimize'));
  assert.ok(specs.some((spec) => spec.shortcut === 'F11' && spec.action === 'gameMode'));
});

test('desktop global shortcuts route only when native window is focused', async () => {
  __resetDesktopGlobalShortcutsForTests();
  const registered = new Map();
  const unregistered = [];
  const calls = [];

  await installDesktopGlobalShortcuts({
    quit: () => calls.push('quit'),
  }, {
    isFocused: () => true,
    shortcuts: ['CommandOrControl+Q'],
    register: async (shortcut, cb) => registered.set(shortcut, cb),
    unregister: async (shortcuts) => unregistered.push(...shortcuts),
  });

  await registered.get('CommandOrControl+Q')({ shortcut: 'CommandOrControl+Q', state: 'Pressed' });
  assert.deepEqual(calls, ['quit']);

  await uninstallDesktopGlobalShortcuts({ unregister: async (shortcuts) => unregistered.push(...shortcuts) });
  assert.ok(unregistered.includes('CommandOrControl+Q'));
});

test('desktop global shortcuts ignore released events and unfocused app', async () => {
  __resetDesktopGlobalShortcutsForTests();
  const registered = new Map();
  const calls = [];

  await installDesktopGlobalShortcuts({
    minimize: () => calls.push('minimize'),
  }, {
    isFocused: () => false,
    shortcuts: ['CommandOrControl+M'],
    register: async (shortcut, cb) => registered.set(shortcut, cb),
    unregister: async () => {},
  });

  await registered.get('CommandOrControl+M')({ shortcut: 'CommandOrControl+M', state: 'Released' });
  await registered.get('CommandOrControl+M')({ shortcut: 'CommandOrControl+M', state: 'Pressed' });
  assert.deepEqual(calls, []);

  await uninstallDesktopGlobalShortcuts({ unregister: async () => {} });
});
