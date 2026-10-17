import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SURF_PHASE } from '../src/game/chunk-surf-state.js';
import { sourceShoreOutside } from '../src/game/source-sensory.js';

const renderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const shader = renderer.slice(renderer.indexOf('const SOURCE_VOID_PHYSICAL_FRAG'), renderer.indexOf('export function r3dSourceVoidPhysicalShader'));
const draw = renderer.slice(renderer.indexOf('function drawSourceVoidPhysical'), renderer.indexOf('function drawTextSpace'));
const frame = renderer.slice(renderer.indexOf('export function r3dFrame'));

const physicalExpression = main.slice(main.indexOf('    sourceVoidPhysical:') + '    sourceVoidPhysical:'.length,
  main.indexOf(',\n    sourceVoidDawn:', main.indexOf('    sourceVoidPhysical:')));
const physicalFor = new Function('usingSourceSpace', 'sourceShoreOutside', 'chunkSurfRuntime', 'CHUNK_SURF_PHASE', `return ${physicalExpression};`);
const runtime = (phase, shore = null, preTape = false) => ({ state: () => ({ phase }), sourceShoreFrame: () => shore, horizonFrame: () => ({ preTape }) });
for (const phase of [CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS]) {
  assert.equal(physicalFor(() => true, sourceShoreOutside, runtime(phase), CHUNK_SURF_PHASE), true,
    'the existing bells and outskirts must retain their physical renderer');
}
assert.equal(physicalFor(() => true, sourceShoreOutside, runtime(CHUNK_SURF_PHASE.LANDSCAPE, null, true), CHUNK_SURF_PHASE), true);
assert.equal(physicalFor(() => true, sourceShoreOutside, runtime(CHUNK_SURF_PHASE.LANDSCAPE, { active: true, outside: true, proper: false }), CHUNK_SURF_PHASE), true,
  'the first nothingness must reach its physical shore renderer');
assert.equal(physicalFor(() => true, sourceShoreOutside, runtime(CHUNK_SURF_PHASE.LANDSCAPE), CHUNK_SURF_PHASE), false,
  'Source proper must keep its own text-space renderer');
assert.ok(frame.indexOf('if (horizonState.active)') < frame.indexOf('if(sourceVoidPhysicalActive)'), 'on-tape rendering still owns its video');
assert.ok(frame.indexOf('if(sourceVoidPhysicalActive)') < frame.indexOf('if (textSpaceActive)'), 'physical void is not reinterpreted as glowing text');
assert.match(frame, /if\(sourceVoidPhysicalActive\)\{[\s\S]*?drawSourceVoidPhysical\([^;]+;\s*return;/,
  'the raymarch must not process physical void props');
assert.match(draw, /P3\.renderPropPass\(/, 'reuse real GLB triangles and their materials');
assert.ok(draw.indexOf('gl.depthMask(true)') < draw.indexOf('P3.renderPropPass('), 'horizon cannot leave the prop pass without depth writes');
assert.match(draw, /localLightEmergency:sourceVoidPhysicalLightEmergency,localShadowIndex:-1/, 'Source emergency illumination is not inherited');
assert.match(draw, /planTexture:null/, 'the old corridor cannot occlude void lighting');
assert.match(draw, /gl\.drawBuffers\(\[gl\.COLOR_ATTACHMENT0\]\)/, 'single-output shader draws only to colour');
assert.match(draw, /gl\.drawBuffers\(\[gl\.COLOR_ATTACHMENT0,gl\.COLOR_ATTACHMENT1\]\)/, 'restore the ordinary MRT state');
// The game's own look out there too (2026-09-13): the pixel mesh and the post
// upscale present the physical pass, as they present the building.
assert.match(draw, /presentThroughPost\(runPixelMeshPass\(voidState,now,\{physicalAcquisitionWeight\}\)/, 'the outskirts must use the shared recorder with their physical acquisition weight');
assert.doesNotMatch(draw, /presentTexture\(sceneTex\)/, 'the physical pass is copied straight to the screen again');
assert.doesNotMatch(draw, /runDatamoshPass\(|runSourceFaultPass\(|drawTextSpace\(/, 'no destructive colour or glitch filter follows the physical pass');
assert.match(shader, /clamp\(body\.a,0\.0,1\.0\)/, 'black metal remains opaque: colour is not a coverage test');
assert.match(shader, /texture\(uDepth,uv\)/, 'far fade uses real prop depth');
assert.match(shader, /displayColour\(clamp\(body\.rgb/, 'preserve all material colour channels');
assert.doesNotMatch(shader, /halftone|bayer|fract\(|uSourceEmergency|uSourceTorchMode/);

// Execute the actual ground pass with a stateful GL double. The revealed path
// is drawn after the video/bust pass, so leaking its blend or depth-write state
// breaks both the next frame's depth clear and the next physical prop pass.
const horizon = readFileSync(new URL('../src/render/horizon3d.js', import.meta.url), 'utf8');
const groundSource = horizon.slice(horizon.indexOf('export function horizonGround('), horizon.indexOf('export function horizonRender(')).replace('export ', '');
for (const pathOnly of [false, true]) {
  const state = { writes: false, depth: true, blend: true }, draws = [];
  const gl = new Proxy({
    DEPTH_TEST: 'depth', BLEND: 'blend', LEQUAL: 'lequal',
    enable(key) { state[key] = true; },
    disable(key) { state[key] = false; },
    depthMask(value) { state.writes = value; },
    depthFunc(value) { state.func = value; },
    drawArrays() { draws.push({ ...state }); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const ground = new Function('gl', 'groundProgram', 'vao', 'manifest', 'GU', `${groundSource}\nreturn horizonGround;`)(gl, {}, {}, {}, name => name);
  assert.equal(ground({ view: new Float32Array(16), projection: new Float32Array(16), pathOnly }), true);
  assert.equal(draws.length, 1);
  assert.equal(draws[0].depth, pathOnly, 'only the overlaid path is occluded by the bust');
  assert.equal(draws[0].writes, false, 'transparent ground does not overwrite real geometry depth');
  assert.equal(draws[0].blend, true);
  assert.equal(state.writes, true, 'next frame can clear and write depth');
  assert.equal(state.blend, false, 'next prop pass cannot inherit premultiplied blending');
  assert.equal(state.depth, false, 'fullscreen presentation remains unoccluded');
}

console.log('source physical void compositor specs passed');
