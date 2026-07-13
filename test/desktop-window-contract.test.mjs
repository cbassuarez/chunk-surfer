import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Rust display policy exposes required commands', () => {
  const rust = readFileSync('src-tauri/src/display_policy.rs', 'utf8');
  assert.match(rust, /chunk_window_metrics/);
  assert.match(rust, /chunk_set_window_size/);
  assert.match(rust, /chunk_reset_window/);
  assert.match(rust, /chunk_set_game_mode/);
  assert.match(rust, /chunk_quit/);
});

test('desktop menu has reset window and game mode ids', () => {
  const rust = readFileSync('src-tauri/src/desktop_menu.rs', 'utf8');
  assert.match(rust, /reset_window/);
  assert.match(rust, /game_mode/);
});
