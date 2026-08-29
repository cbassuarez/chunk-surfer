import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ONE TOGGLE. NO THIRD READING.
//
// The feature had four ways to be off and only one of them said so: the module
// switch, an "IN FRAME ONLY" demotion under fullscreen, a `low` intensity, and
// a native-fullscreen refusal in Rust. A player with WINDOW CHOREOGRAPHY: ON
// and WINDOW INTENSITY: HOSTILE on screen could still be getting nothing.
test('the settings screen offers one switch and no intensity dial', () => {
  const source = readFileSync('src/game/settings.js', 'utf8');
  assert.doesNotMatch(source, /windowChoreographyIsInFrameOnly/,
    'fullscreen no longer demotes the feature, so nothing may ask whether it did');
  assert.doesNotMatch(source, /profileWindowIntensity|cycleWindowIntensity/,
    'intensity is not a player-facing setting any more');
  // Two outcomes in the row's own value function, so there is no third reading.
  assert.match(source, /label: 'WINDOW CHOREOGRAPHY',\s*\n\s*value: \(\) => \(psychProfile\(\)\.modules\.windowChoreography \? 'ON' : 'OFF'\)/);
});

test('nothing in the effects layer declines a cast for how the game is displayed', () => {
  const source = readFileSync('src/platform/personalized-window-effects.js', 'utf8');
  const showNative = source.slice(source.indexOf('function showNative'), source.indexOf('function scheduleHide'));
  assert.doesNotMatch(showNative, /session\.fullscreen/);
  assert.doesNotMatch(showNative, /intensity==='low'/);
  assert.match(showNative, /if\(current!==session\|\|!session\.surfacesReady\)return false;/);
});

// macOS native fullscreen moves the window into its own Space and NOTHING can
// be composited over a Space — not an always-on-top window, not a click-through
// one. Game mode has to be the pre-Lion kind of fullscreen or the surfaces this
// whole feature exists for cannot be drawn while the game is fullscreen.
test('game mode is simple fullscreen, and every exit from it clears that', () => {
  const source = readFileSync('src-tauri/src/display_policy.rs', 'utf8');
  const gameMode = source.slice(source.indexOf('pub fn set_game_mode'), source.indexOf('pub fn chunk_window_metrics'));
  assert.match(gameMode, /set_simple_fullscreen\(true\)/);
  assert.match(gameMode, /set_fullscreen\(false\)/,
    'entering must leave any native fullscreen first — set_simple_fullscreen refuses over it');

  for (const fn of ['pub fn reset_main_window', 'pub fn chunk_set_window_size']) {
    const body = source.slice(source.indexOf(fn), source.indexOf('\n}', source.indexOf(fn)));
    assert.match(body, /set_simple_fullscreen\(false\)/, `${fn} must also leave simple fullscreen`);
  }
});

test('the surviving refusal is the platform floor, and it is reported', () => {
  const rust = readFileSync('src-tauri/src/window_choreography.rs', 'utf8');
  assert.match(rust, /if main\.is_fullscreen\(\)\.unwrap_or\(false\)\{return Ok\(false\);\}/,
    'a window genuinely inside a macOS Space still cannot be overlaid');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /onSurfaceReport:/, 'every prewarm outcome is reported');
  assert.match(main, /logWarn\('fireball surfaces unavailable'/);
});
