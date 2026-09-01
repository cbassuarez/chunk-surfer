import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIREBALL_SURFACE_LABELS,substantiallyOnscreenPosition } from '../src/platform/personalized-window-effects.js';

assert.deepEqual(FIREBALL_SURFACE_LABELS,['fireball-cast-1','fireball-cast-2','fireball-cast-3','fireball-cast-4']);
assert.deepEqual(substantiallyOnscreenPosition({position:{x:-3900,y:-200},size:{width:200,height:200},monitor:{position:{x:-3840,y:-120},size:{width:3840,height:2160}}}),{x:-3880,y:-160});
const rust=readFileSync(new URL('../src-tauri/src/window_choreography.rs',import.meta.url),'utf8');
const capability=readFileSync(new URL('../src-tauri/capabilities/personalized-interference.json',import.meta.url),'utf8');
assert.match(rust,/chunk_window_choreography_begin/);
assert.match(rust,/chunk_window_choreography_execute/);
assert.match(rust,/chunk_window_choreography_restore/);
assert.match(rust,/note_main_window_event/);
assert.match(rust,/restore_game_mode/);
assert.match(rust,/wait_for_windowed_bounds/);
assert.match(rust,/fullscreen exit did not settle/);
assert.match(rust,/spawn_blocking\(move \|\| begin_transaction/,
  'fullscreen exit settles off the native event loop before any authored keyframe');
assert.doesNotMatch(rust,/window-choreography-recovery/);
assert.doesNotMatch(capability,/allow-set-(?:position|size|fullscreen|title)/);
assert.match(capability,/allow-set-focus/);
assert.match(rust,/set_ignore_cursor_events\(false\)/);assert.match(rust,/set_ignore_cursor_events\(true\)/);assert.match(rust,/count > 0 && count <= 4/);
assert.match(rust,/chunk_fireball_cast_focus_main/);
assert.doesNotMatch(rust,/predicted_cursor|cursor_position\(\)/,'fireballs never inspect or chase the pointer');
assert.match(rust,/An authored tease, not a reaction to the player's hand/);
const mediaPlacement=rust.slice(rust.indexOf('fn media_placement'),rust.indexOf('fn place_media'));
assert.match(mediaPlacement,/x: position\.x as f64,/,'shader origin remains in physical framebuffer coordinates');
assert.doesNotMatch(mediaPlacement,/x: position\.x as f64 \/ scale/);
const effects=readFileSync(new URL('../src/platform/personalized-window-effects.js',import.meta.url),'utf8');
assert.match(effects,/focusable:true/);assert.match(effects,/focusable:false/);assert.match(effects,/skipTaskbar:true/);
assert.match(rust,/set_focusable\(request\.interactive\)/,
  'passive panes cannot become key windows merely by being shown');
assert.match(rust,/surface\.is_focused\(\)\.unwrap_or\(false\)/,
  'a passive pane that became key during the macOS show race immediately returns focus to main');
assert.match(effects,/mainWasFocused[\s\S]*chunk_fireball_cast_focus_main/,
  'creation-time focus is restored only when the game owned focus before media prewarm');
assert.match(effects,/ownsPointerTransfer:\(\)=>!!current&&/);
assert.match(effects,/const size=128/);
assert.match(effects,/let surface=await api\.WebviewWindow\.getByLabel\(label\)/);
assert.match(effects,/surface=new api\.WebviewWindow\(label/);
const mediaSurface=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
assert.match(mediaSurface,/\(elapsed\/loopMs\)\*mediaSeconds/,'short clips map over the authored composition loop instead of pinning their final frame');
assert.match(mediaSurface,/(?:video|media)\.playbackRate=Math\.max/);
const cast=readFileSync(new URL('../src/fireball-cast.js',import.meta.url),'utf8');
assert.match(cast,/pointerdown[\s\S]{0,220}strike\(\)/);
assert.match(cast,/emit\('fireball-cast-hit',payload\)/);
assert.match(cast,/if\(cast\.catchReady\)/,'the stationary catch is visually identified');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/onUnexpectedUnlock:[\s\S]{0,420}ownsPointerTransfer\?\.\(\)[\s\S]{0,120}return/,
  'clicking a game-owned fireball cannot open pause under the click');
console.log('fireball native surface contracts passed');
