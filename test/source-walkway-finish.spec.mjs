import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_SILVER_WALKWAY_SURFACES,SOURCE_SILVER_WALKWAY_PRINT_SURFACE,sourceSilverWalkwaySurface,
  sourceSyntaxHueSaturation,sourceSyntaxRecordedColor,sourceSilverWalkwayInk,sourceWalkwayRecordedInk,
  SOURCE_WALKWAY_MARK_GLSL,SOURCE_WALKWAY_FINISH_GLSL} from '../src/render/source-walkway-finish.js';
import {encodePrintedSurface,printedSurfaceDescriptor} from '../src/render/printed-surface.js';
import {sourceContinuationGeometry} from '../src/render/source-continuation-renderer.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
import {tracePrimitiveMaterialRole} from './helpers/prop-material-role-binding.mjs';

const close=(actual,expected,tolerance=1e-12)=>actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<=tolerance,`${actual} != ${expected}`));
const routeTag=coverage=>encodePrintedSurface(coverage,'light-on-dark',{family:'source-ii-route'});
const propsSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');

test('silver treatment belongs to eight authored ground supports, never inferred height or neighboring architecture',()=>{
  const expected=['wrong-entry','wrong-entry-throat','wrong-ground-cross','wrong-ground-west','wrong-ground-east','wrong-ground-north','wrong-ground-branch','wrong-east-stair-foot'];
  assert.deepEqual(SOURCE_SILVER_WALKWAY_SURFACES,expected);assert.ok(Object.isFrozen(SOURCE_SILVER_WALKWAY_SURFACES));
  assert.deepEqual(printedSurfaceDescriptor(SOURCE_SILVER_WALKWAY_PRINT_SURFACE),SOURCE_SILVER_WALKWAY_PRINT_SURFACE);
  const pieces=sourceContinuationGeometry();
  assert.deepEqual(pieces.filter(sourceSilverWalkwaySurface).map(piece=>piece.id),expected);
  for(const id of ['wrong-upper-west','inherited-earthfall-spine','journey-receiving-2-1']){
    const piece=pieces.find(piece=>piece.id===id);assert.ok(piece,id);assert.equal(sourceSilverWalkwaySurface(piece),false,id);
  }
  const entry=pieces.find(piece=>piece.id==='wrong-entry');
  for(const change of [{kind:'solid'},{region:'catch'},{descriptor:{...entry.descriptor,chartId:1}},{descriptor:{...entry.descriptor,id:'plinth'}}]){
    assert.equal(sourceSilverWalkwaySurface({...entry,...change}),false);
  }
  assert.equal(sourceSilverWalkwaySurface({...entry,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,-29.75,0,1]}),true,'a native void copy retains authored identity rather than being reclassified by world height');
});

test('syntax hue uses the original display color even when its physical albedo sampler is linear',()=>{
  const linear=value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4);
  for(const rgb of [[1,0,0],[0,1,1],[.74,.34,.92],[.25,.77,.46],[1,.68,.17],[.031,.04,.025],[.9,.9,.9]]){
    const displayHS=sourceSyntaxHueSaturation(rgb),sampledHS=sourceSyntaxHueSaturation(rgb.map(linear),{linear:true});
    close(sampledHS,displayHS);
    const storedHS=sampledHS.map(value=>Math.round(value*255)/255);
    close(sourceSyntaxRecordedColor(storedHS),sourceSyntaxRecordedColor(displayHS),.024,'RGBA8 syntax quantization must retain its lexical color');
  }
  close(sourceSyntaxHueSaturation([.5,.5,.5]),[0,0]);
  close(sourceSyntaxRecordedColor([0,0]),[.96,.985,1]);
  close(sourceSyntaxRecordedColor(sourceSyntaxHueSaturation([1,0,0])),[.98,0,0]);
  close(sourceSyntaxRecordedColor(sourceSyntaxHueSaturation([0,1,1])),[0,.98,.98]);
});

test('silver stock and lexical pigment share coverage while shadows remain dark and fixed',()=>{
  const world=[1,99,1],syntaxHS=sourceSyntaxHueSaturation([1,.25,0]);
  close(sourceSilverWalkwayInk({world,pigment:0,syntaxHS}),[.58,.70,.82]);
  close(sourceSilverWalkwayInk({world,pigment:1,syntaxHS}),sourceSyntaxRecordedColor(syntaxHS));
  const stock=sourceSilverWalkwayInk({world,pigment:0}),code=sourceSyntaxRecordedColor(syntaxHS);
  close(sourceSilverWalkwayInk({world,pigment:.5,syntaxHS}),stock.map((value,index)=>(value+code[index])/2));
  close(sourceSilverWalkwayInk({world,pigment:1,syntaxHS,light:false}),[.005,.009,.018]);
  assert.deepEqual(sourceSilverWalkwayInk({world,pigment:.4,syntaxHS}),sourceSilverWalkwayInk({world,pigment:.4,syntaxHS}));
  assert.deepEqual(sourceSilverWalkwayInk({world,pigment:0}),sourceSilverWalkwayInk({world:[1,-29.75,1],pigment:0}),'translated deck stock keeps its X/Z fracture registration');
});

test('the recording override requires a visible route, Source II and acquired light',()=>{
  const original=[.11,.22,.33],context={finish:'silicon',tag:routeTag(1),world:[1,0,1],syntaxHS:[0,1],capturedLight:1};
  close(sourceWalkwayRecordedInk(original,context),[.98,0,0]);
  close(sourceWalkwayRecordedInk(original,{...context,finish:2,capturedLight:.5}),original.map((value,index)=>(value+[.98,0,0][index])/2));
  for(const finish of ['none','bsod','bismuth',0,1,3,undefined])assert.deepEqual(sourceWalkwayRecordedInk(original,{...context,finish}),original);
  for(const tag of [0,79/255,96/255,encodePrintedSurface(1,1),encodePrintedSurface(1,2),249/255])assert.deepEqual(sourceWalkwayRecordedInk(original,{...context,tag}),original);
  for(const changed of [{capturedLight:0},{occluded:true}])assert.deepEqual(sourceWalkwayRecordedInk(original,{...context,...changed}),original);
  close(sourceWalkwayRecordedInk(original,{...context,light:false}),[.005,.009,.018]);
});

test('the real prop binding clears route identity between adjacent ordinary and special primitives',()=>{
  const trace=tracePrimitiveMaterialRole(propsSource,'uSourceWalkway',[
    {p:{printedSurface:SOURCE_SILVER_WALKWAY_PRINT_SURFACE}},
    {p:{printedSurface:{polarity:'light-on-dark'}}},
    {p:{materialRole:'source-chunk-error'}},
    {p:{printedSurface:SOURCE_SILVER_WALKWAY_PRINT_SURFACE}},
    {p:{}},
  ]);
  assert.deepEqual(trace.values,[1,0,0,1,0]);
  assert.match(propsSource,/if\(uSourceRoomLighting>\.5&&uSourceWalkway>\.5\)\{[\s\S]*?oSurfaceMarks=vec4\(0\.0,sourceSyntaxHueSaturation\(texel\.rgb\),printedSourceRouteTag\(printedCoverage\)\)/,'only the Source room path repurposes neutral grain GB; ordinary packed depth survives');
});

test('exact route marks respect occlusion and syntax cannot leak into the filtered grain field',()=>{
  assert.match(PIXEL_MESH_FRAG,/vec4 sourceRouteMark=texelFetch\(uMarks,\s*clamp\(ivec2\(frag\),ivec2\(0\),textureSize\(uMarks,0\)-1\),0\)\*\(1\.0-printedOccluded\)/);
  const guard=PIXEL_MESH_FRAG.match(/if\(sourceRoute>\.5\)markSample=vec4\([^;]+;/)?.[0];
  const density=PIXEL_MESH_FRAG.match(/float markDensity = [^;]+;/)?.[0];
  const grain=PIXEL_MESH_FRAG.match(/vec3 markGrain = [^;]+;/)?.[0];
  assert.ok(guard&&density&&grain);
  assert.ok(PIXEL_MESH_FRAG.indexOf(guard)<PIXEL_MESH_FRAG.indexOf(density));
  const run=new Function('sourceRoute','markSample','sourceRouteMark','vec4','vec3','markGrainWorld',guard+density.replace('float markDensity','const markDensity')+grain.replace('vec3 markGrain','const markGrain')+'return {markDensity,markGrain};');
  const filteredNeighbor={r:.7,g:.1,b:.9,a:routeTag(.5)},exactRoute={r:0,g:.8,b:1,a:routeTag(.5)};
  const vec4=(r,g,b,a)=>({r,g,b,a}),vec3=value=>[value,value,value];
  assert.deepEqual(run(1,filteredNeighbor,exactRoute,vec4,vec3,()=>{throw Error('syntax HS decoded as grain');}),{markDensity:.22,markGrain:[0,0,0]});
  assert.deepEqual(run(0,filteredNeighbor,exactRoute,vec4,vec3,()=>[1,2,3]),{markDensity:.7,markGrain:[1,2,3]},'ordinary derived grain keeps its existing behavior');
});

test('walkway finish uses both existing recording endpoints without another sampler, clock or screen overlay',()=>{
  assert.ok(PIXEL_MESH_FRAG.includes(SOURCE_WALKWAY_FINISH_GLSL));
  assert.ok(propsSource.includes('${SOURCE_WALKWAY_MARK_GLSL}'),'the native prop shader includes the syntax albedo helper');
  assert.ok(PIXEL_MESH_FRAG.indexOf('float printedSurfaceSourceRoute(')<PIXEL_MESH_FRAG.indexOf('vec3 sourceWalkwayRecordedInk('),'GLSL route helpers must be declared before the finish that calls them');
  assert.doesNotMatch(SOURCE_WALKWAY_MARK_GLSL+SOURCE_WALKWAY_FINISH_GLSL,/uniform\s|sampler|uTime|gl_FragCoord|discard|gl_FragDepth|captureBit/);
  for(const endpoint of ['Dark','Light'])assert.match(PIXEL_MESH_FRAG,new RegExp(`capture${endpoint}=sourceWalkwayRecordedInk\\(capture${endpoint},uSourceFinish,sourceRouteMark,worldMetres,captureBlackProtect,`));
  assert.ok(PIXEL_MESH_FRAG.indexOf('captureLight=sourceMaterialRecordedInk')<PIXEL_MESH_FRAG.indexOf('captureLight=sourceWalkwayRecordedInk'));
  assert.ok(PIXEL_MESH_FRAG.indexOf('captureLight=sourceWalkwayRecordedInk')<PIXEL_MESH_FRAG.indexOf('captureLight=sourceFaultRecordedInk'));
  assert.ok(PIXEL_MESH_FRAG.indexOf('captureLight=sourceWalkwayRecordedInk')<PIXEL_MESH_FRAG.indexOf('float finishColourLoss='),'rest perception loss still owns the acquired color');
});
