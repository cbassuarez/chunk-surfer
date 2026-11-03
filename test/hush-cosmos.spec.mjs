import test from 'node:test';
import assert from 'node:assert/strict';
import {HUSH_COSMOS,HUSH_COSMOS_GLSL,hushCosmosCoordinates,hushCosmosField,hushCosmosRecordedInk,installHushCosmosMaterial} from '../src/render/hush-cosmos.js';
import {pressureInstances} from '../src/render/pressure-volume.js';
import {props3dDebugShaders} from '../src/render/props3d.js';
import {MeshBasicMaterial,ShaderLib} from 'three';
import {readFileSync} from 'node:fs';

test('the same screen pixel reveals the same ink as HUSH moves and deforms',()=>{
  const pixel=[600,200],viewport=[1280,800],reference=hushCosmosField(pixel,viewport),poses=[];
  for(const [x,y,heading,time] of [[2,8,0,0],[7,-12,.8,14],[-80,16,-2.7,92]]){
    const [draw]=pressureInstances({id:'hush-screen',x,y,floorH:0,heightM:2.05,strength:1,
      performance:{version:1,role:'live-pressure',heading,clip:'pressure_advance',time,loop:true,seed:17,manifestation:1,motion:'hunt'}});
    poses.push(draw.character);assert.deepEqual(hushCosmosField(pixel,viewport),reference);
  }
  assert.notDeepEqual(poses[0],poses[1]);
  assert.notDeepEqual(hushCosmosField([pixel[0]+90,pixel[1]+35],viewport),reference);
  assert.doesNotMatch(HUSH_COSMOS_GLSL,/\b(?:vWorld|vUv|uTime|uModel|uEye|cameraPosition|skinMatrix)\b/);
  assert.match(props3dDebugShaders().pressureFragment,/hushCosmosField\(gl_FragCoord.xy,uHushViewport\)/);
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  assert.match(source,/uniform2f\(HU\('uHushViewport'\),pressureWidth,pressureHeight\)/);
});

test('render scale leaves the viewport pattern fixed and its dark field contains both arcs and spectral cuts',()=>{
  const a=hushCosmosField([345,228],[1280,800]),b=hushCosmosField([690,456],[2560,1600]);
  assert.deepEqual(a,b);assert.deepEqual(hushCosmosCoordinates([345,228],[1280,800]),hushCosmosCoordinates([690,456],[2560,1600]));
  let dark=0,silver=0,cut=0;
  for(let y=0;y<=200;y++)for(let x=0;x<=320;x++){
    const f=hushCosmosField([x*4,y*4],[1280,800]);
    assert.ok(f.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    if(Math.max(...f.color)<.08)dark++;if(f.band>.5||f.rim>.5)silver++;if(Math.max(f.cyan,f.violet,f.magenta)>.5)cut++;
  }
  assert.ok(dark>40000);assert.ok(silver>100&&cut>100);
  assert.throws(()=>hushCosmosField([NaN,0],[1280,800]),/finite/);
  assert.throws(()=>hushCosmosCoordinates([0,0],[0,800]),/positive/);
  assert.ok(Object.isFrozen(HUSH_COSMOS));
});

test('recorder ink keeps its chosen mark and remains idempotent after later grading',()=>{
  for(const pixel of [[500,350],[640,400],[820,300]])for(const mark of [0,1]){
    const recorded=mark?[.9,.92,.85]:[.0015,.005,.0045],first=hushCosmosRecordedInk(recorded,0,pixel,[1280,800]);
    assert.deepEqual(hushCosmosRecordedInk(first,0,pixel,[1280,800]),first);
    assert.equal(Math.max(...first)>.08,!!mark);
  }
});

test('the real secondary material samples the same viewport field after depth-tested geometry',()=>{
  const material=installHushCosmosMaterial(new MeshBasicMaterial({color:0})),shader={vertexShader:ShaderLib.basic.vertexShader,fragmentShader:ShaderLib.basic.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader,{});
  assert.match(shader.fragmentShader,/hushCosmosField\(gl_FragCoord.xy,uHushViewport\)/);
  assert.equal(shader.uniforms.uHushViewport,material.userData.hushCosmos.viewport);
  assert.equal(material.userData.hushCosmos.space,'screen-viewport');
  assert.equal(material.toneMapped,false);assert.equal(material.fog,false);
  assert.equal(material.customProgramCacheKey(),HUSH_COSMOS.revision);material.dispose();
});
