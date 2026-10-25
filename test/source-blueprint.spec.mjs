import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {SOURCE_BLUEPRINT as B,SOURCE_BLUEPRINT_PRINT_SURFACE,sourceBlueprintEnabled,
  sourceBlueprintRegistrationMarks,sourceBlueprintDepthContour,sourceBlueprintResolve,
  sourceBlueprintRecordedInk,SOURCE_BLUEPRINT_ACQUISITION_GLSL as shader,
  SOURCE_BLUEPRINT_RECORDING_GLSL as recording} from '../src/render/source-blueprint-contract.js';
import {sourceBlueprintMaterial,sourceBlueprintLighting} from '../src/render/source-blueprint-print.js';
import {sourcePrintRows,SOURCE_PRINT_SURFACE} from '../src/render/physical-source-print.js';
import {printedSurfaceDescriptor} from '../src/render/printed-surface.js';

test('blueprint recovers the actual cyanotype reference while retaining exact Source clauses and placement',()=>{
 assert.ok(fs.existsSync(B.reference));
 const original=sourcePrintRows('divide'),blueprint=sourcePrintRows('blueprint');
 assert.equal(original.length,26);assert.equal(blueprint.length,26);
 for(let i=0;i<original.length;i++)for(const key of['text','x','y','size','height','rule'])assert.equal(blueprint[i][key],original[i][key]);
 assert.notEqual(blueprint[1].ink,original[1].ink);
 assert.deepEqual(printedSurfaceDescriptor(SOURCE_BLUEPRINT_PRINT_SURFACE),SOURCE_BLUEPRINT_PRINT_SURFACE);
 assert.equal(SOURCE_BLUEPRINT_PRINT_SURFACE.emission,'none');
});

test('registration is sparse physical ink at declared metre intervals, with no screen coordinates or clock',()=>{
 const marks=sourceBlueprintRegistrationMarks();assert.deepEqual(marks.map(m=>m.metres),[1,2,3,4,5,6,7]);
 assert.deepEqual(marks.filter(m=>m.major).map(m=>m.metres),[4]);
 assert.ok(marks.every(m=>m.coverage<=.22&&m.widthM<=.025));
 assert.equal(B.metresPerTile,8);
 assert.doesNotMatch(shader,/uTime|random|sourceHash|sourceEnergy|sin\(|fract\(|hue|screenThreshold/);
});

test('material opt-in preserves opaque pigment channels and supports the unchanged control palette',()=>{
 const maps={texture:{id:1},normalTexture:{id:2},ormTexture:{id:3},letteringFinish:{version:1,profile:'paper',localSpecular:true}};
 const base=[.42,.49,.43,1],blueprint=sourceBlueprintMaterial({...maps,blueprint:true},{base}),control=sourceBlueprintMaterial({...maps,blueprint:false},{base});
 assert.deepEqual(blueprint.base,[1,1,1,1]);assert.deepEqual(control.base,base);
 assert.equal(blueprint.texture,maps.texture);assert.equal(blueprint.normalTexture,maps.normalTexture);assert.equal(blueprint.ormTexture,maps.ormTexture);
 assert.deepEqual(blueprint.printedSurface,SOURCE_BLUEPRINT_PRINT_SURFACE);assert.deepEqual(control.printedSurface,SOURCE_PRINT_SURFACE);
 assert.equal(sourceBlueprintEnabled('?sourceBlueprint=0'),false);assert.equal(sourceBlueprintEnabled('?sourceBlueprint=1'),true);assert.equal(sourceBlueprintEnabled(''),true);
 const fallback={captureExposure:4.4,whitePointScale:1,screen:'stochastic',ambientIntensity:.073};
 assert.equal(sourceBlueprintLighting(fallback).captureExposure,4.4);assert.equal(sourceBlueprintLighting(fallback).ambientIntensity,.10);
});

test('real depth contours stay on the nearer supported side and never invent an edge on a flat plane',()=>{
 assert.equal(sourceBlueprintDepthContour(5,[5,5,5,5]),0);
 assert.equal(sourceBlueprintDepthContour(5,[5.015,4.99,5.02,5]),0);
 assert.equal(sourceBlueprintDepthContour(5,[20,5,5,5]),1);
 assert.equal(sourceBlueprintDepthContour(20,[5,20,20,20]),0);
 assert.equal(sourceBlueprintDepthContour(NaN,[2,3,4,5]),0);
 const rgb=[.04,.045,.05],near=sourceBlueprintResolve({rgb,alpha:1,metres:5,contour:1}),far=sourceBlueprintResolve({rgb,alpha:1,metres:145,contour:1});
 assert.ok(near.every((v,i)=>v>rgb[i]&&v-rgb[i]<.021));
 assert.ok(far.every(Number.isFinite));
});

test('absence, black cores, warm objects and authored optical identity survive the Source-only helper',()=>{
 for(const metres of[0,20,80,200])assert.deepEqual(sourceBlueprintResolve({rgb:[0,0,0],alpha:1,metres,contour:1}),[0,0,0]);
 const voidColour=sourceBlueprintResolve({rgb:[0,0,0],alpha:0,metres:90,contour:1});
 assert.ok(voidColour[0]<voidColour[1]&&voidColour[1]<voidColour[2]);
 const warm=[.32,.13,.04],normal=sourceBlueprintResolve({rgb:warm,alpha:1,metres:8,contour:0});assert.deepEqual(normal,warm);
 assert.deepEqual(sourceBlueprintResolve({rgb:warm,alpha:1,metres:80,contour:1,enabled:false}),warm);
 const before=JSON.stringify(warm);assert.deepEqual(sourceBlueprintResolve({rgb:warm,alpha:1,metres:8,contour:0}),normal);assert.equal(JSON.stringify(warm),before);
 assert.ok(!('alpha' in sourceBlueprintMaterial({blueprint:true})), 'physical material cannot replace geometry opacity');
});

test('Source recording ink survives the black-stock reservation without changing the capture decision',()=>{
 const dark=[.0015,.005,.0045],light=[.835,.945,.885],far=1/(1+180*.14);
 const source={enabled:true,pigmentKind:2,packedDepth:.5,packedFar:far,capturedLight:1};
 assert.deepEqual(sourceBlueprintRecordedInk(dark,source),B.recordedDark);
 assert.deepEqual(sourceBlueprintRecordedInk(light,{...source,light:true}),B.recordedLight);
 assert.ok(B.recordedDark[2]>B.recordedDark[1]&&B.recordedDark[1]>B.recordedDark[0]);
 assert.ok(B.recordedDark[2]>=.10&&B.recordedDark[2]<.16,'navy has a recorded blue floor, still distant from pale ink');
 assert.deepEqual(sourceBlueprintRecordedInk(dark,{...source,enabled:false}),dark);
 assert.deepEqual(sourceBlueprintRecordedInk(light,{...source,capturedLight:0,light:true}),light,'zero captured light cannot manufacture cyanotype ink');
 assert.deepEqual(sourceBlueprintRecordedInk(dark,{...source,pigmentKind:0}),dark,'ordinary near materials keep original inks');
 assert.deepEqual(sourceBlueprintRecordedInk(dark,{...source,pigmentKind:0,packedDepth:far}),B.recordedDark,'actual atmosphere shares the Source palette');
 const half=sourceBlueprintRecordedInk(dark,{...source,capturedLight:.5});assert.ok(half.every((v,i)=>v>dark[i]&&v<B.recordedDark[i]));
 assert.doesNotMatch(recording,/captureBit|formTone|threshold|discard|gl_FragDepth|uTime|sampler/);
 const full=fs.readFileSync('src/render/pixel-mesh/shader.js','utf8');
 assert.ok(full.indexOf('float captureBit =')<full.indexOf('vec3 captureDark = sourceBlueprintRecordedInk'));
 assert.ok(full.indexOf('captureLight=sourceBlueprintRecordedInk')<full.indexOf('captureLight=mix(captureLight,vec3(.98,.018,.008),emergencyRed)'));
 assert.match(full,/vec3 oneBitScene = mix\(captureDark, captureLight, captureBit\)/,'the original bit chooses the calibrated inks');
});
