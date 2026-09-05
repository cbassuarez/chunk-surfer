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
assert.equal((effects.match(/parent:'main'/g)||[]).length,2,
  'both auxiliary surface pools are explicit children of the Chunk Surfer main window');
assert.match(rust,/set_focusable\(request\.interactive\)/,
  'passive panes cannot become key windows merely by being shown');
assert.match(rust,/surface\.is_focused\(\)\.unwrap_or\(false\)/,
  'a passive pane that became key during the macOS show race immediately returns focus to main');
assert.match(effects,/mainWasFocused[\s\S]*chunk_fireball_cast_focus_main/,
  'creation-time focus is restored only when the game owned focus before media prewarm');
const activation=rust.slice(rust.indexOf('pub fn chunk_window_surfaces_sync_app_activation'),rust.indexOf('fn allowed'));
assert.match(activation,/set_always_on_top\(focused\)/,
  'task switching only changes auxiliary stacking while preserving the composition');
assert.doesNotMatch(activation,/\.hide\(\)|hide_media/,
  'task switching cannot erase the native visibility state that must survive Alt-Tab');
assert.doesNotMatch(effects,/chunk_window_media_hide_if_unfocused/);
assert.match(effects,/ownsPointerTransfer:\(\)=>!!current&&/);
assert.match(effects,/const size=128/);
assert.match(effects,/let surface=await api\.WebviewWindow\.getByLabel\(label\)/);
assert.match(effects,/surface=new api\.WebviewWindow\(label/);
const mediaSurface=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
assert.match(mediaSurface,/\(elapsed\/loopMs\)\*mediaSeconds/,'short clips map over the authored composition loop instead of pinning their final frame');
assert.match(mediaSurface,/(?:video|media)\.playbackRate=Math\.max/);
assert.doesNotMatch(mediaSurface,/float bayer/,'window media no longer inherits an ordered Bayer screen');
assert.match(mediaSurface,/blueNoiseRank\(globalPx\)/,'one physical-desktop blue-noise field thresholds every pane');
assert.match(mediaSurface,/assets\/blue-noise-64\.png/,'window media shares the game shader stack blue-noise asset');
assert.match(mediaSurface,/function makeMediaTexture\(\)[\s\S]{0,300}TEXTURE_MIN_FILTER,gl\.LINEAR[\s\S]{0,120}TEXTURE_MAG_FILTER,gl\.LINEAR/,
  'source, held, and outgoing media are sampled continuously');
assert.match(mediaSurface,/function makeBlueNoiseTexture\(\)[\s\S]{0,500}TEXTURE_MIN_FILTER,gl\.NEAREST[\s\S]{0,180}TEXTURE_WRAP_S,gl\.REPEAT/,
  'the rank table itself remains an exact repeating texel lookup');
assert.match(mediaSurface,/vec3\(\.004,\.008,\.018\),vec3\(\.018,\.045,\.105\),vec3\(\.115,\.105,\.35\),vec3\(\.38,\.20,\.56\),vec3\(\.73,\.88,1\.\)/,
  'the approved five-color luminance palette remains exact');
assert.match(mediaSurface,/bool broken=cell>1\.-fault\*\.58/,'authored block faults remain available');
const mediaDocument=readFileSync(new URL('../window-media.html',import.meta.url),'utf8');
assert.doesNotMatch(mediaDocument,/image-rendering:(?:pixelated|crisp-edges)/,
  'CSS cannot re-pixelate the full-resolution WebGL or fallback surface');
const cast=readFileSync(new URL('../src/fireball-cast.js',import.meta.url),'utf8');
assert.match(cast,/pointerdown[\s\S]{0,220}strike\(\)/);
assert.match(cast,/emit\('fireball-cast-hit',payload\)/);
assert.match(cast,/if\(cast\.catchReady\)/,'the stationary catch is visually identified');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/onUnexpectedUnlock:[\s\S]{0,420}ownsPointerTransfer\?\.\(\)[\s\S]{0,120}return/,
  'clicking a game-owned fireball cannot open pause under the click');
console.log('fireball native surface contracts passed');
