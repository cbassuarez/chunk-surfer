import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ONE TOGGLE. NO THIRD READING.
//
// The module has one player-facing setting. Native placement may use the
// desktop when there is enough space, with the canvas keeping the cast live.
test('the settings screen offers one switch and no intensity dial', () => {
  const source = readFileSync('src/game/settings.js', 'utf8');
  assert.doesNotMatch(source, /windowChoreographyIsInFrameOnly/,
    'fullscreen fallback belongs to native placement, leaving the setting unchanged');
  assert.doesNotMatch(source, /profileWindowIntensity|cycleWindowIntensity/,
    'intensity is not a player-facing setting any more');
  // Two outcomes in the row's own value function, so there is no third reading.
  assert.match(source, /label: 'WINDOW CHOREOGRAPHY',\s*\n\s*value: \(\) => \(psychProfile\(\)\.modules\.windowChoreography \? 'ON' : 'OFF'\)/);
});

test('nothing in the effects layer declines a cast for how the game is displayed', () => {
  const source = readFileSync('src/platform/personalized-window-effects.js', 'utf8');
  const sync = source.slice(source.indexOf('function syncFireballCast'), source.indexOf('function beginFireballCast'));
  assert.doesNotMatch(sync, /session\.fullscreen/);
  assert.doesNotMatch(sync, /intensity==='low'/);
  assert.match(sync, /if\(!session\.surfacesReady\)return false;/);
});

test('reduced motion lowers choreography without becoming a hidden off switch', () => {
  const source = readFileSync('src/platform/window-choreography.js', 'utf8');
  const nativePolicy = source.slice(source.indexOf('const nativeDesired'), source.indexOf('async function loadApi'));
  assert.doesNotMatch(nativePolicy, /reduced/,
    'the dedicated choreography toggle, not the camera-shake setting, owns native pane availability');
  assert.doesNotMatch(source, /forceSimulate:reduced\(\)/,
    'reduced plans already compile out travel and retain their desktop presentation');
});

// Game mode uses simple fullscreen. Resetting or choosing a window size must
// clear that mode so off-window placement can work again.
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

test('fullscreen retains the in-game cast and the game reports prewarm outcomes', () => {
  const rust = readFileSync('src-tauri/src/window_choreography.rs', 'utf8');
  const geometry = rust.slice(rust.indexOf('fn base_center('), rust.indexOf('fn apply_placement('));
  assert.match(geometry, /main\.is_fullscreen\(\)[\s\S]*simple_fullscreen_active\(\)\s*\{\s*return Ok\(None\);/,
    'both fullscreen modes decline native carriers');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /onSurfaceReport:/, 'every prewarm outcome is reported');
  assert.match(main, /logWarn\('fireball surfaces unavailable'/);
});
