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
  for (const id of Object.values(DESKTOP_MENU_ACTION)) {
    assert.match(rust, new RegExp(`"${id}"`), `missing Rust menu id: ${id}`);
  }
});

test('Rust menu reserves native lifecycle ids', () => {
  const rust = readFileSync('src-tauri/src/desktop_menu.rs', 'utf8');
  assert.match(rust, /"quit"/);
  assert.match(rust, /"minimize"/);
  assert.match(rust, /"fullscreen"/);
});
