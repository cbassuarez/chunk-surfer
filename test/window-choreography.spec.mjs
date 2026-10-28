import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WINDOW_RAMP, WINDOW_RAMP_APPROVED } from '../src/render/window-surface-look.js';
import { FIREBALL_SURFACE_LABELS,substantiallyOnscreenPosition } from '../src/platform/personalized-window-effects.js';
import { createWindowVideoClock, normalizeWindowMediaAssignment } from '../src/platform/window-composition.js';

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
assert.doesNotMatch(rust,/predicted_cursor|set_cursor_position\(/,
  'reactive targets may observe the hand but never warp or predict the pointer');
const nativeCastStep=rust.slice(rust.indexOf('pub fn chunk_fireball_cast_step('),rust.indexOf('pub fn chunk_fireball_cast_place('));
assert.equal((nativeCastStep.match(/app\.cursor_position\(\)/g)||[]).length,1,
  'one desktop cursor sample serves the entire native batch');
assert.match(nativeCastStep,/active = game_owns_keyboard\(&app\)/,
  'global pointer reaction carries whether the game owns keyboard focus');
assert.ok(nativeCastStep.indexOf('apply_placement(')<nativeCastStep.indexOf('app.emit_to('),
  'the carrier is placed before its relative pointer sample is delivered');
assert.match(nativeCastStep,/app\.emit_to\(&cast\.label, "fireball-cast-pointer", pointer\)/,
  'pointer samples are targeted to their fixed carrier');
assert.match(nativeCastStep,/Result<u8, String>/,'pointer delivery preserves the existing batched placement response');
const castGeometry=rust.slice(rust.indexOf('fn base_center('),rust.indexOf('fn apply_placement('));
assert.match(castGeometry,/main\.inner_position\(\)/,'carrier placement anchors to the actual client rectangle');
assert.match(castGeometry,/main\.inner_size\(\)/);
assert.doesNotMatch(castGeometry,/main\.outer_(?:position|size)\(\)/);
assert.match(castGeometry,/carrier_slot_for_cast\(&client,\s*monitor\.work_area\(\),\s*scale,\s*cast\)/,
  'peripheral placement receives the main client anchor and complete monitor work area');
assert.match(rust,/fn logical_size\([^)]*\)\s*->\s*f64\s*\{\s*240\.0\s*\}/,
  'the native input carrier has a fixed 240 logical pixel extent');
const carrierSlot=rust.slice(rust.indexOf('fn carrier_slot_for_cast('),rust.indexOf('struct CarrierPlacement'));
assert.match(carrierSlot,/peripheral_carrier_slot\(client,\s*work,\s*scale,\s*cast\.index,\s*cast\.count,\s*cast\.seed\)/,
  'each original ray keeps its reserved peripheral slot for the complete cast');
assert.doesNotMatch(carrierSlot,/progress|dodge|formation_progress|cursor|casts\.len/,
  'visible feints and changing live membership cannot move native input coverage');
const carrierLayout=rust.slice(rust.indexOf('fn peripheral_carrier_slot('),rust.indexOf('fn carrier_slot_for_cast('));
assert.match(carrierLayout,/\.clamp\(left,\s*right - side\)/,'peripheral columns remain within monitor work area');
assert.match(carrierLayout,/\.clamp\(top,\s*bottom - height\)/,'each reserved column is clamped as a whole');
assert.match(carrierLayout,/\.clamp\(left,\s*right - width\)/,'the fallback row is clamped as a whole');
const castPlacement=rust.slice(rust.indexOf('fn apply_placement('),rust.indexOf('#[cfg(target_os = "macos")]\nfn show_cast_without_focus'));
assert.match(castPlacement,/if surface\.inner_size\(\)\.ok\(\) != Some\(placement\.size\)/,
  'a settled carrier cannot repeatedly resize its webview');
assert.match(castPlacement,/if surface\.outer_position\(\)\.ok\(\) != Some\(placement\.position\)/,
  'an unchanged carrier cannot repeatedly move its native window');
assert.match(castPlacement,/if !surface\.is_visible\(\)\.unwrap_or\(false\)\s*\{\s*show_cast_without_focus/,
  'moving a visible attack window cannot repeatedly reactivate it');
assert.doesNotMatch(castPlacement,/surface\.show\(\)/);
assert.match(castPlacement,/if owned_keyboard && surface\.is_focused\(\)/,
  'revealing a cast can restore only keyboard focus already owned by the game');
const macCastReveal=rust.slice(rust.indexOf('#[cfg(target_os = "macos")]\nfn show_cast_without_focus'),rust.indexOf('#[cfg(not(target_os = "macos"))]\nfn show_cast_without_focus'));
assert.match(macCastReveal,/run_on_main_thread/);
assert.match(macCastReveal,/orderFront:/,'macOS cast reveal orders the window without making it key');
assert.doesNotMatch(macCastReveal,/\.show\(\)|makeKeyAndOrderFront|\.set_focus\(\)/);
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
assert.match(effects,/const size=240/,'the webview pool agrees with the native carrier extent');
assert.match(effects,/let surface=await api\.WebviewWindow\.getByLabel\(label\)/);
assert.match(effects,/surface=new api\.WebviewWindow\(label/);
const mediaSurface=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
// This transport moved from the native presenter into the clock shared with
// simulation. Exercise the preserved score-time behavior and the explicit
// source-time exception rather than pinning the old function's source text.
for(const seconds of[5,12]){
  const assignment=normalizeWindowMediaAssignment({content:{kind:'video',assetId:'clouds'}});
  const clock=createWindowVideoClock({score:{epochMs:1000,durationMs:12000,loop:true},assignment,nowMs:1000});
  assert.equal(assignment.clockMode,'score','existing plans keep their authored composition clock');
  assert.equal(clock.time(7000,{durationSeconds:seconds}),seconds/2);
  assert.equal(clock.time(19000,{durationSeconds:seconds}),seconds/2,'short clips loop over the score instead of pinning a final frame');
  assert.equal(clock.playbackRate({durationSeconds:seconds}),seconds/12);
}
{
  const assignment=normalizeWindowMediaAssignment({content:{kind:'video',assetId:'clouds'},clockMode:'source',phaseOffsetMs:650});
  const clock=createWindowVideoClock({score:{epochMs:1000,durationMs:120000,loop:false},assignment,nowMs:1000});
  assert.equal(clock.time(6000,{durationSeconds:12}),5.65,'new source-clock studies retain real media-time offsets');
  assert.equal(clock.playbackRate({durationSeconds:12}),1,'a long event score cannot slow a performed action tenfold');
}
assert.match(mediaSurface,/(?:video|media)\.playbackRate=Math\.max/);
assert.doesNotMatch(mediaSurface,/float bayer/,'window media no longer inherits an ordered Bayer screen');
assert.match(mediaSurface,/blueNoiseRank\(cellId\)/,'one physical-desktop blue-noise field thresholds every pane');
// Same intent, now actually true. It used to be keyed to `globalPx`, which added
// a desktop origin in CSS points to a gl_FragCoord in device pixels -- so on a
// retina display the "one field" was offset by half in every pane. It is keyed
// to the shared desktop CELL now; see test/window-surface-look.spec.mjs.
assert.match(mediaSurface,/vec2 globalPt=vec2\(gl_FragCoord\.x,framebufferSize\.y-gl_FragCoord\.y\)\/scale\+desktopOrigin/,
  'and the field is laid out in one space rather than two mixed ones');
assert.match(mediaSurface,/assets\/blue-noise-64\.png/,'window media shares the game shader stack blue-noise asset');
assert.match(mediaSurface,/function makeMediaTexture\(\)[\s\S]{0,300}TEXTURE_MIN_FILTER,gl\.LINEAR[\s\S]{0,120}TEXTURE_MAG_FILTER,gl\.LINEAR/,
  'source, held, and outgoing media are sampled continuously');
assert.match(mediaSurface,/function makeBlueNoiseTexture\(\)[\s\S]{0,500}TEXTURE_MIN_FILTER,gl\.NEAREST[\s\S]{0,180}TEXTURE_WRAP_S,gl\.REPEAT/,
  'the rank table itself remains an exact repeating texel lookup');
// The approved five remain exact -- they are the even steps of the ramp now,
// with a step interpolated between each pair so the dither has somewhere to go.
// Five swatches and nothing between them is what made the panes posterise into
// flat continents; the palette was never the problem, the gaps were.
for(const approved of WINDOW_RAMP_APPROVED)
  assert.ok(WINDOW_RAMP.some((step)=>step.every((v,i)=>v===approved[i])),
    `the approved colour ${JSON.stringify(approved)} is still in the ramp, exactly`);
assert.equal(WINDOW_RAMP.filter((_,i)=>i%2===0).length,WINDOW_RAMP_APPROVED.length,
  'and they are still the palette the ramp is built around');
assert.match(mediaSurface,/bool broken=cell>1\.-fault\*\.58/,'authored block faults remain available');
const mediaDocument=readFileSync(new URL('../window-media.html',import.meta.url),'utf8');
assert.doesNotMatch(mediaDocument,/image-rendering:(?:pixelated|crisp-edges)/,
  'CSS cannot re-pixelate the full-resolution WebGL or fallback surface');
const cast=readFileSync(new URL('../src/fireball-cast.js',import.meta.url),'utf8');
assert.match(cast,/pointerdown[\s\S]{0,220}strike\(event\)/,
  'the physical press coordinates reach tile hit testing inside the input carrier');
assert.doesNotMatch(cast,/addEventListener\(['"]focus['"]/,
  'window activation alone cannot report a player catch');
assert.match(cast,/emit\('fireball-cast-hit',payload\)/);
assert.match(cast,/if\(cast\.catchReady\)/,'the stationary catch is visually identified');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(main,/onUnexpectedUnlock:[\s\S]{0,420}ownsPointerTransfer\?\.\(\)[\s\S]{0,120}return/,
  'clicking a game-owned fireball cannot open pause under the click');
console.log('fireball native surface contracts passed');
