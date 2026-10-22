import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PRINTED_SURFACE_GLSL } from '../src/render/printed-surface.js';
import { UNRAVELLING_GLSL, horizonEntryDiffusion } from '../src/render/horizon3d.js';

// Assemble the actual accessor and template with their actual dependencies.
// Importing all of r3d in Node would initialize unrelated browser subsystems.
const renderer = readFileSync(process.env.HORIZON_VOID_RENDERER_SOURCE || new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const section = (from, to) => {
  const start = renderer.indexOf(from), end = renderer.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `production section ${from} remains discoverable`);
  return renderer.slice(start, end);
};
const accessor = renderer.match(/export function r3dSourceVoidPhysicalShader\(\)\{[^\n]+\}/)?.[0];
assert.ok(accessor, 'use the production shader accessor');
const shader = runInNewContext([
  section('const COMMON_GLSL =', 'const VERT ='),
  section('const RAIN_GLSL =', 'const MARCH_FRAG ='),
  section('const SOURCE_VOID_PHYSICAL_FRAG =', 'export function r3dSourceVoidPhysicalShader'),
  accessor.replace('export ', ''), 'r3dSourceVoidPhysicalShader();',
].join('\n'), { PRINTED_SURFACE_GLSL, HZ: { UNRAVELLING_GLSL } });
const executableShader = shader.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('the physical void contains no screen-fixed entry cloud layer', () => {
  assert.ok(shader.startsWith('#version 300 es'));
  assert.ok(shader.includes(PRINTED_SURFACE_GLSL) && shader.includes(UNRAVELLING_GLSL));
  assert.equal(/\bfogArrival\b|\bfogP\b|\bvapour\b/.test(executableShader), false,
    'the former screen cloud must not tint empty air across the entry');
  assert.equal(/vnoise\([^;\n]*screen|empty\s*=\s*mix\([^;\n]*vapour/.test(executableShader), false);
});

test('street dissolution still samples physical depth and world-anchored damage', () => {
  assert.match(shader, /texture\(uDepth,uv\)/);
  assert.match(shader, /hit=uEyeCells\*\.5\+wd\*\(distanceM\/max\(\.001,dot\(wd,fwd\)\)\)/);
  assert.match(shader, /keep=unravelKeep\(hit-uUnravelOrigin,uUnravelling\.x\)/);
  assert.match(shader, /coverage\*=keep\*\(1\.0-smoothstep\(-10\.0,50\.0,uEntryMetres\)\)/);
  assert.match(shader, /road=uEyeCells\.xz\*\.5\+wd\.xz\*roadT/);
});

test('existing overcast and world-anchored rain remain weather, independent of the removed entry mask', () => {
  assert.match(shader, /empty=mix\(empty,vec3\(\.050,\.057,\.072\)[^;]+clamp\(uOvercast,0\.0,1\.0\)\*\(1\.0-below\)\)/);
  assert.match(shader, /rainVolume\(uEyeCells,wd,distanceM\)\*uRain/);
  assert.match(shader, /vec2 pos = ro\.xz \/ RAIN_CELL_M/);
});

test('the tape still arrives over lived metres and uses the physical camera', () => {
  const draw = section('function drawUnravelling(', 'function drawHorizon(');
  assert.match(draw, /entryMetres=horizonState\.worldOriginM\[2\]-camZ\*CELL/);
  assert.match(draw, /entryReveal=HZ\.horizonEntryDiffusion\(entryMetres\)/);
  assert.match(draw, /camX:camX\*CELL,camY:camY\*CELL,camZ:camZ\*CELL/);
  assert.match(draw, /HZ\.horizonRender\(\{[\s\S]*?entryReveal,/);
  assert.equal(horizonEntryDiffusion(-12), 0);
  assert.ok(horizonEntryDiffusion(60) > horizonEntryDiffusion(0));
  assert.equal(horizonEntryDiffusion(160), 1);
});
