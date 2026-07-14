import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESKTOP_MENU_ACTION, DESKTOP_MENU_EVENT } from '../src/platform/desktop-menu-actions.js';

test('Rust desktop menu file contains canonical frontend event name', () => {
  const rust = readFileSync('src-tauri/src/desktop_menu.rs', 'utf8');
  assert.match(rust, new RegExp(DESKTOP_MENU_EVENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Rust desktop menu emits every frontend action id', () => {
  const rust = readFileSync('src-tauri/src/desktop_menu.rs', 'utf8');
  const nativeRoleActions = new Set([DESKTOP_MENU_ACTION.MINIMIZE]);
  for (const id of Object.values(DESKTOP_MENU_ACTION).filter((id) => !nativeRoleActions.has(id))) {
    assert.match(rust, new RegExp(`"${id}"`), `missing Rust menu id: ${id}`);
  }
});

test('Rust menu uses native macOS lifecycle roles', () => {
  const rust = readFileSync('src-tauri/src/desktop_menu.rs', 'utf8');
  assert.match(rust, /\.quit_with_text\("Quit Chunk Surfer"\)/);
  assert.match(rust, /\.minimize_with_text\("Minimize"\)/);
  assert.doesNotMatch(rust, /MenuItemBuilder::with_id\("quit"/);
  assert.doesNotMatch(rust, /MenuItemBuilder::with_id\("minimize"/);
  assert.match(rust, /"fullscreen"/);
});

test('app boot does not install the conflicting global shortcut layer', () => {
  const main = readFileSync('src/main.js', 'utf8');
  assert.doesNotMatch(main, /installDesktopGlobalShortcuts/);
});
