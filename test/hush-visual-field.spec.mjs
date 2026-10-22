import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  applyFieldPresentationPolicy,
  applyHushTorchInterference,
  computeHushField,
  effectiveTorchScale,
  hushAbsenceLook,
  hushPhysicallySensed,
  inactiveHushField,
} from '../src/game/hush-field.js';
import { hushMixTargets } from '../src/audio/hush-mix.js';
import { PRESSURE_FINISH_FRAG, PRESSURE_SCENE_GLSL } from '../src/render/pressure-composite.js';
import { props3dDebugShaders } from '../src/render/props3d.js';

const operator = { position: { x: 0, y: 0 }, roomId: 'room', floorId: 'g' };
const at = (x, options = {}) => applyFieldPresentationPolicy(computeHushField({
  hush: { active: true, position: { x, y: 0 }, roomId: 'room', floorId: 'g' },
  operator,
  now: options.now ?? 1000,
  occlusion: options.occlusion ?? 0,
}), options.settings || {});

test('the sensory trace precedes contact and strengthens monotonically', () => {
  const far = at(50);
  const near = at(34);
  const engulf = at(20);
  assert.equal(far.stage, 'trace');
  assert.equal(near.stage, 'near');
  assert.equal(engulf.stage, 'engulf');
  assert.ok(far.absorption.light < near.absorption.light);
  assert.ok(near.absorption.light < engulf.absorption.light);
  assert.ok(far.absorption.audio < near.absorption.audio);
  assert.ok(near.absorption.audio < engulf.absorption.audio);
});

test('minimap sensing begins at embodied pressure, not at simulation spawn', () => {
  const subliminal=at(50);
  const felt=at(40);
  assert.equal(subliminal.stage,'trace');
  assert.equal(hushPhysicallySensed({field:subliminal}),false);
  assert.equal(hushPhysicallySensed({field:felt}),true);
  assert.equal(hushPhysicallySensed({visible:true,field:inactiveHushField()}),true);
  assert.equal(hushPhysicallySensed({field:inactiveHushField(),authoredPressure:.08}),true,
    'an authored physical tableau can become sensible without borrowing the generic HUSH field');
});

test('geometry suppresses remote torch interference without deleting the local absence', () => {
  const open = at(20);
  const blocked = at(20, { occlusion: 1 });
  assert.ok(blocked.absorption.light < open.absorption.light * .2);
  assert.ok(blocked.absorption.audio < open.absorption.audio);
  assert.ok(hushAbsenceLook({ active: true, field: blocked }).strength >= .88);
  assert.deepEqual(hushAbsenceLook({ active: false, field: open }), { active: false, strength: 0, radiusM: 0 });
});

test('HUSH interference corrupts the whole torch contract without spending battery', () => {
  const torch = {
    band: 'clean', health: .8, power: 1, reach: 1,
    color: [1, .94, .82], coneInner: .88, coneOuter: .94, spill: .05,
  };
  const field = at(20);
  const corrupted = applyHushTorchInterference(torch, field);
  assert.equal(corrupted.health, torch.health);
  assert.equal(corrupted.band, torch.band);
  assert.ok(corrupted.power < torch.power);
  assert.ok(corrupted.reach < torch.reach);
  assert.ok(corrupted.coneInner > torch.coneInner);
  assert.ok(corrupted.spill < torch.spill);
  assert.equal(corrupted.power, effectiveTorchScale(field));
});

test('flicker-off keeps steady dimming and sound still collapses in the inner field', () => {
  const lowPulse = at(10, { now: 0, settings: { hushLightFlicker: 'off' } });
  const highPulse = { ...lowPulse, pulse: 1 };
  assert.equal(effectiveTorchScale(lowPulse), effectiveTorchScale(highPulse));
  assert.ok(effectiveTorchScale(lowPulse) < .65);
  const mix = hushMixTargets(lowPulse, {}, { monitorGain: 1, monitorOpen: true });
  assert.ok(mix.worldGain < .25);
  assert.ok(mix.worldLowpassHz < 1800);
  assert.ok(mix.monitorDryGain < .2);
});

test('the final absence pass consumes props, practicals, and beacons together', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const propComposite = renderer.indexOf('if(propView < archView + 0.015');
  const absencePass = renderer.indexOf('// The HUSH is not a dark decal on the walls');
  assert.ok(propComposite >= 0 && absencePass > propComposite, 'HUSH absorption runs after the mesh-prop composite');
  assert.match(renderer, /uHush;\s*\/\/ x, z, absorption strength, radius in metres/);
  assert.match(renderer, /state\.hush\?\.radiusM \?\? 0/);
  assert.match(renderer, /float surfaceSpan=min\(span,[\s\S]*?float s = clamp\([\s\S]*?surfaceSpan\)/,
    'the absence clips to the nearest composed surface instead of projecting through props');
});

test('the rigged Pressure volume transports depth and surface relief after the absence pass', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const props = await readFile(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  const shaders=props3dDebugShaders();
  const absencePass = renderer.indexOf('// The HUSH is not a dark decal on the walls');
  const bodyPass = renderer.indexOf('compositePressureVolume(col,zView)');
  assert.ok(bodyPass > absencePass, 'the broad light-eating field resolves before the authored body composite');
  assert.match(renderer,/HUSH_BODY_ASSET='assets\/pressure-character\.glb'/);
  assert.match(renderer,/P3\.addCharacterPack\(assetUrl\(HUSH_BODY_ASSET\)\)/,'the real rig must be loaded through the character renderer');
  const glb=await readFile(new URL('../public/assets/pressure-character.glb',import.meta.url));
  assert.equal(glb.readUInt32LE(0),0x46546c67,'the active asset is not a GLB');
  assert.match(shaders.pressureVertex,/uCharacterBones\[aCharacterJoints\./,'Pressure must share skeletal deformation rather than rotate a card');
  assert.match(shaders.pressureFragment,/texture\(uNormalTex,vUv\)/,'actual material relief was discarded');
  assert.match(shaders.pressureFragment,/dot\(vWorld-uEye,uForward\)/,'the transport has no physical view depth');
  assert.match(shaders.pressureFragment,/o=vec4\(depthBytes,flags\/255\.0,clamp\(uPressure\.x/,'triangle coverage is not carried independently of colour');
  const geometryPass=props.slice(props.indexOf('export function renderPressurePass'),props.indexOf('export function pressureTargets'));
  assert.match(geometryPass,/gl\.enable\(gl\.DEPTH_TEST\)/,'the volume cannot self-occlude');
  assert.match(geometryPass,/gl\.depthFunc\(gl\.LEQUAL\)/);
  assert.match(PRESSURE_SCENE_GLSL,/g\.a\*step\(d,zView\+\.022\)\*core/,'composed architecture and props must occlude the physical volume');
  assert.match(PRESSURE_SCENE_GLSL,/if\(a>\.018\)zView=min\(zView,d\)/,'only real covered triangles may write scene depth');
  assert.doesNotMatch(renderer,/sourcePressureMask|texture\([^\n]*[sS][dD][fF]|hush-body-sdf/,'the active contour still samples the archived 2D figure');
  assert.match(renderer,/pixelMeshU\('uHushBodyPost'\),0,0,0,0/,'the obsolete chromakey/SDF reconstruction must remain disabled');
  assert.match(renderer, /HUSH_BODY_MODES=Object\.freeze\(\['live','core','glow','off'\]\)/);
});

test('the archived HUSH cover SDF retains its provenance independently of the active 3D asset', async () => {
  const png = await readFile(new URL('../assets/hush/hush-body-sdf.png', import.meta.url));
  const runtimePng = await readFile(new URL('../public/assets/hush/hush-body-sdf.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(createHash('sha256').update(png).digest('hex'), '8f52397c0c2b050c4b3f78b14f6a7fb3040f8fa0253498c928151ffeb280d655');
  assert.equal(createHash('sha256').update(runtimePng).digest('hex'), createHash('sha256').update(png).digest('hex'));
  const provenance = JSON.parse(await readFile(new URL('../assets/hush/provenance.json', import.meta.url), 'utf8'));
  assert.equal(provenance.source.sha256, 'b2b6d9050bae346d1b90fac329ece047a6108d17d7d47c1499f13882c3e950d5');
  assert.deepEqual(provenance.processed.size, [128, 256]);
  assert.equal(provenance.processed.alphaFloor, 32);
  assert.equal(provenance.processed.distanceSource, 'thresholded figure alpha; smart-object canvas wash excluded');
  assert.equal(provenance.processed.sha256, createHash('sha256').update(png).digest('hex'));
});

test('special spaces suppress live HUSH while recorded Pressure retains explicit reprise authority', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /hushBodySpaceAllowed=!usingSpecialSpace\(\)\|\|usingSourceSpace\(\)/);
  assert.match(main, /hushBodyAllowed:pressureFrame\.allowed&&hushBodySpaceAllowed/);
  assert.match(main, /pressurePerformance\.isReplay\(\)/,'recorded actor authority must be distinguished from a live Presence');
  assert.match(main, /const pressureFrame=pressureRenderFrame\(worldView\)/,'rendering bypasses the actor visibility policy');
  assert.match(main, /source\|\|chapelTowerState\(\)\.phase!==CHAPEL_TOWER_PHASE\.TOWER_ACTIVE/,
    'the saved building tower phase must not hide the Source-owned meeting');
  assert.match(main, /hushSecondary:renderedHushSecondary/, 'Source bracket does not supply the render-only forward manifestation');
  assert.match(main, /HUSH BODY COMPOSITE/);
  assert.match(main, /hushBody:\(\)=>R3\.r3dHushBodyStatus/);
});

test('Pressure black material, white radiance and overprints enter acquisition before shared POST, with bounded mesh coverage', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const present=renderer.slice(renderer.indexOf('function presentThroughPost('),renderer.indexOf('export function r3dSourceIdentityStatus'));
  const acquisition=renderer.slice(renderer.indexOf('function runPixelMeshPass('),renderer.indexOf('function loadImageTexture('));
  assert.match(acquisition,/const pressureSourceTex = finishPressure\(sceneTex\);[\s\S]*?const worldTex = runBurstPass\(pressureSourceTex, now\);/,
    'the actual volume and its edge must enter the same world recording');
  assert.match(acquisition,/gl\.TEXTURE2\);\s*gl\.bindTexture\(gl\.TEXTURE_2D, pressureSourceTex\);/,
    'the recorded pattern must follow real mesh depth rather than the world behind it');
  assert.doesNotMatch(present,/finishPressure\(/,'the final presentation must not repaint smooth relief over the dither');
  const copy=renderer.slice(renderer.indexOf('function presentTexture('),renderer.indexOf('const sourceVoidPhysicalUniformCache'));
  assert.doesNotMatch(copy,/finishPressure\(/,'the legacy text presentation must not repaint an undithered figure');
  assert.match(renderer,/presentThroughPost\(runPixelMeshPass\(voidState,now(?:,\{[^}]*\})?\)/,'the physical route skips acquisition');
  assert.match(renderer,/pressureFinishTex=makeTex\(sw,sh,null,'rgba16f'\)/,'the material adapter must retain scene depth precision');
  assert.match(PRESSURE_FINISH_FRAG,/z=min\(z,[\s\S]*?texture\(uScene,uv\)\.a|texture\(uScene,uv\)\.a[\s\S]*?z=min\(z/,'architecture must participate in occlusion');
  assert.match(PRESSURE_FINISH_FRAG,/float z=propDepth\(uv\)/,'prop occlusion must participate independently');
  assert.match(PRESSURE_FINISH_FRAG,/g\.a\*step\(meshDepth\(g\),front\+\.022\)/,'the final volume ignores the nearest composed surface');
  assert.match(PRESSURE_FINISH_FRAG,/coreMask=step\(\.018,mass\)\*core/,'the core must cover only visible physical triangles');
  assert.match(PRESSURE_FINISH_FRAG,/c\+=vec3\(glowLight\*1\.45\/exposure\);[\s\S]*?c\*=1\.0-coreMask/,
    'white radiance must enter acquisition before the covered core is sealed to exact black');
  assert.match(PRESSURE_FINISH_FRAG,/exposure=clamp\(uCaptureExposure,1\.0,12\.0\)/);
  assert.match(renderer,/U\('uCaptureExposure'\),captureExposureOverride\?\?lightingCaptureExposure/);
  assert.doesNotMatch(PRESSURE_FINISH_FRAG,/vec3 fibre=|pow\(relief,/,'surface-relief data must not relight the requested black silhouette');
  assert.match(PRESSURE_FINISH_FRAG,/glowCoverage\(uv\+d\*px\*15\.0,front\)/,'white radiance needs finite local support');
  assert.match(PRESSURE_FINISH_FRAG,/glowLight=[^;]+\*exterior/,'white radiance must remain outside the body');
  assert.match(PRESSURE_FINISH_FRAG,/float depth=mass\*core>\.018\?1\.0\/\(1\.0\+min\(front,meshDepth\(g\)\)\*\.14\):src\.a/,
    'recorded mesh depth must be exact, while transparent glow preserves the underlying world depth');
  assert.doesNotMatch(PRESSURE_FINISH_FRAG,/sdf|billboard|sourcePressureMask/i);
  assert.match(renderer,/cover=g\.a\*step\(d,front\+\.022\)\*uPressureReady/,'Source door identity can reveal an occluded actor');
  assert.match(renderer, /projection:sourceHushProjection\(\)/,
    'the visibility diagnostic cannot distinguish an active actor from an in-frame body');
});

test('legacy text scenes merge only already acquired Pressure pixels without changing the surrounding text', async()=>{
  const renderer=await readFile(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const text=renderer.slice(renderer.indexOf('function drawTextSpace('),renderer.indexOf('function sourceRoomU('));
  assert.match(text,/pressure\.ready&&pressure\.draws>0\?runPixelMeshPass\(worldState,now\):null/,
    'text-only scenes must still record any physical performer');
  assert.match(text,/acquired\?finishPressure\(sceneTex,\{acquired\}\):sceneTex/,
    'scenes without a performer must retain their original text presentation');
  const merge=PRESSURE_FINISH_FRAG.slice(PRESSURE_FINISH_FRAG.indexOf('if(uAcquiredOnly>.5)'),PRESSURE_FINISH_FRAG.indexOf('vec3 c=src.rgb'));
  assert.match(merge,/support=step\(\.000001,coreMask\+glowLight\)/,
    'the merge must include actual core/glow changes, never an unconditional expanded band');
  assert.match(merge,/mix\(src\.rgb,texture\(uAcquired,uv\)\.rgb,support\)/,
    'the merge must use acquired pixels rather than rebuilding raw fibres');
  assert.match(merge,/return;/,'acquired output must exit before the raw material branch');
  assert.ok(PRESSURE_FINISH_FRAG.indexOf('float core=')<PRESSURE_FINISH_FRAG.indexOf('if(uAcquiredOnly>.5)'),
    'core-only mode must resolve its flags before deciding the material footprint');
});
