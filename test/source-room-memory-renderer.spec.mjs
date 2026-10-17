import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const section=(start,end)=>renderer.slice(renderer.indexOf(start),renderer.indexOf(end,renderer.indexOf(start)));

test('Source proper hands actual material, depth and current marks to the overworld acquisition',()=>{
  const adapter=section('const SOURCE_ROOM_ACQUISITION_FRAG','const SOURCE_IDENTITY_FRAG');
  assert.match(adapter,/texture\(uProps,uv\)/);
  assert.match(adapter,/clamp\(material\.rgb,0\.0,1\.0\)/,'material values must survive instead of alpha-only paper');
  assert.match(adapter,/texture\(uPropDepth,uv\)/);
  assert.match(adapter,/1\.0\/\(1\.0\+viewMetres\*\.14\)/,'recording reconstruction needs the ordinary view-depth encoding');
  assert.match(adapter,/layout\(location=1\) out vec4 oMark/,'the mark attachment must have a fragment output');
  assert.match(adapter,/oMark=useHull\?texelFetch\(uHullMarks,ivec2\(gl_FragCoord\.xy\),0\):\s*uMarksReady>\.5\?texelFetch\(uPropMarks,ivec2\(gl_FragCoord\.xy\),0\):vec4\(0\.0,\.5,\.5,1\.0\)/,'missing authored marks must use the production sentinel, never stale frame data');
  assert.match(adapter,/hullMetres\+\.015<viewMetres/,'the physical first-lift return must survive and occlude by true depth');
  assert.doesNotMatch(adapter,/sourceHash|fieldDepth|sourceEnergy|screenThreshold|paperScene/,'the implementation must not ship the study recolour or synthetic hatch');
});

test('Source identities resolve after the complete shared recording chain',()=>{
  const pipeline=section('function drawSourceRoomMemory','const DATAMOSH_FRAG');
  const stages=['runPixelMeshPass','runSourceFaultPass','runDatamoshPass','presentThroughPost','drawSourceIdentity'];
  for(let i=1;i<stages.length;i++)assert.ok(pipeline.indexOf(stages[i])>pipeline.indexOf(stages[i-1]),`${stages[i]} must follow ${stages[i-1]}`);
  const identity=section('const SOURCE_IDENTITY_FRAG','const COPY_FRAG');
  assert.match(identity,/texture\(uOpeningMask,uv\)/);
  // The Pressure volume is recorded upstream; here exact absence only yields
  // to its depth-tested coverage.
  assert.match(identity,/float cover=g\.a\*step\(d,front\+\.022\)\*uPressureReady;/);
  assert.match(identity,/o=vec4\(0\.0,0\.0,0\.0,absence\*\(1\.0-cover\)\)/);
  assert.doesNotMatch(identity,/uSourceTorch|uGrade|uSourceEmergency/,'no later grade can recolour exact absence');
});

test('the shared Source path is explicitly scoped and provides on-demand GPU evidence',()=>{
  const textDraw=section('function drawTextSpace','function sourceRoomU');
  assert.match(textDraw,/if\(sourceLook\.roomMemoryActive\)/);
  assert.match(textDraw,/drawSourceRoomMemory/);
  assert.match(renderer,/roomMemoryActive: scene\.look\.roomMemoryActive===true/);
  assert.match(renderer,/sourceRoomLighting:sourceLook\.roomMemoryActive===true/);
  assert.match(renderer,/pixelMeshU\('uRecordingSensitivity'\), textSpaceActive&&sourceLook\.roomMemoryActive\?captureExposure:1/,'sensor calibration must reset to the original acquisition outside proper');
  const evidence=section('export function r3dSourceRoomRender','export function r3dCaptureStageCanvas');
  assert.match(evidence,/if\(!sample\|\|!active/,'readback must remain opt-in');
  assert.match(evidence,/current-prop-material-marks/);
  assert.match(evidence,/exactBlackCore/);
  assert.match(evidence,/finalNonBlackPixels/,'a cleared drawing buffer cannot prove black door cores');
});

test('the Source shore shader is type-compatible with borrowed prop and character VAOs',()=>{
  const shore=readFileSync(new URL('../src/render/source-shore3d.js',import.meta.url),'utf8');
  const character=readFileSync(new URL('../src/render/character-asset.js',import.meta.url),'utf8');
  const integerSlots=[...character.matchAll(/layout\(location=(\d+)\) in [ui]vec\d/g)].map(match=>Number(match[1]));
  const shoreFloatSlots=[...shore.matchAll(/layout\(location=(\d+)\) in (?:vec\d|float)/g)].map(match=>Number(match[1]));
  for(const slot of integerSlots)assert.ok(!shoreFloatSlots.includes(slot),`borrowed integer attribute ${slot} cannot feed a float shader input, even if its value is ignored`);
  for(const name of ['aTint','aGrain','aMoving'])assert.match(shore,new RegExp(`layout\\(location=[789]\\) in (?:vec3|float) ${name}`));
  const importedDraw=shore.slice(shore.indexOf('function drawImportedPrimitive'),shore.indexOf('export function sourceShoreDraw'));
  assert.match(importedDraw,/getVertexAttrib\(location,gl\.VERTEX_ATTRIB_ARRAY_ENABLED\)/,'borrowed VAO state must be retained');
  assert.ok(importedDraw.indexOf('disableVertexAttribArray')<importedDraw.indexOf('gl.drawElements'),'unpopulated instance inputs must be disabled before the imported draw');
  assert.match(importedDraw,/finally\{[^}]*enableVertexAttribArray/,'temporary borrowed-VAO changes must be restored even if drawing throws');
});
