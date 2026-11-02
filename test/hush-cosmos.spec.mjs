import test from 'node:test';
import assert from 'node:assert/strict';
import {HUSH_COSMOS,HUSH_COSMOS_GLSL,hushCosmosCoordinates,hushCosmosField,
  hushCosmosRecordedInk,hushCosmosSignalMaterial,installHushCosmosMaterial} from '../src/render/hush-cosmos.js';
import {pressureInstances} from '../src/render/pressure-volume.js';
import {props3dDebugShaders} from '../src/render/props3d.js';
import {MeshBasicMaterial,ShaderLib} from 'three';

const close=(a,b,epsilon=1e-9)=>a.forEach((value,index)=>assert.ok(Math.abs(value-b[index])<=epsilon,`${a} != ${b}`));

test('fixed authored points retain the same cosmos under moving and deforming production Hush roots',()=>{
  const p=[12.3,1.35,-4.7],reference=hushCosmosField(p),samples=[];
  for(const [x,y,heading,time]of [[2,8,0,0],[7,-12,.8,14],[-80,16,-2.7,92]]){
    const [draw]=pressureInstances({id:'cosmos-root',x,y,floorH:0,heightM:2.05,strength:1,
      performance:{version:1,role:'live-pressure',heading,clip:'pressure_advance',time,loop:true,seed:17,manifestation:1,motion:'hunt'}});
    assert.ok(draw.character);samples.push(draw);
    assert.deepEqual(hushCosmosField(p),reference);
    const local=[.15,1.35,.1],c=Math.cos(draw.yaw),s=Math.sin(draw.yaw),
      carried=[draw.x+c*local[0]-s*local[2],draw.y+local[1],draw.z+s*local[0]+c*local[2]];
    assert.notDeepEqual(hushCosmosCoordinates(carried),hushCosmosCoordinates(p),'a mesh-attached local point must not become the field origin');
  }
  assert.notDeepEqual(samples[0].character,samples[1].character,'test exercises distinct captured poses');
  assert.doesNotMatch(HUSH_COSMOS_GLSL,/\b(?:vUv|uTime|uModel|uEye|cameraPosition|skinMatrix)\b/);
  assert.match(HUSH_COSMOS_GLSL,/vec4 hushCosmosField\(vec3 world\)/);
});

test('the actual pressure vertex transports authored world position before camera and coffee presentation',()=>{
  const {pressureVertex:v}=props3dDebugShaders();
  assert.ok(v.indexOf('deformCharacter(local,localNormal)')<v.indexOf('vec4 w=m*vec4(local,1.0)'));
  assert.ok(v.indexOf('vWorld=w.xyz')<v.indexOf('gl_Position=uProj*uView*vec4(natatoriumMetricPoint(w.xyz),w.w)'));
  assert.doesNotMatch(v.slice(v.indexOf('vWorld=w.xyz'),v.indexOf('gl_Position=')),/uView|uProj|uEye/);
});

test('the field contains a dark purple veil, separated stars and bounded supernova cores without a clock',()=>{
  let hot=0,stars=0,burst=0,dark=0;
  for(let y=0;y<=100;y++)for(let x=0;x<=100;x++){
    const f=hushCosmosField([10+x*.025,y*.025,4]);
    assert.ok(f.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    assert.ok(f.color[2]>=f.color[0],'the field must stay purple rather than become white cloud');
    if(f.heat>.8)hot++;if(f.star>.4)stars++;if(f.burst>.7)burst++;if(Math.max(...f.color)<.2)dark++;
  }
  assert.ok(stars>20&&hot>20&&burst>0,'a Hush-sized area must contain actual stellar and supernova detail');
  assert.ok(dark>8000,'the mass must remain an opaque dark threat rather than a luminous television');
  assert.throws(()=>hushCosmosField([NaN,0,0]),/finite/);
  assert.ok(Object.isFrozen(HUSH_COSMOS));
});

test('purple ink preserves the recorder decision and remains idempotent through final glass',()=>{
  for(const heat of[0,.27,1])for(const mark of[0,1]){
    const recorded=mark?[.9,.92,.85]:[.0015,.005,.0045],first=hushCosmosRecordedInk(recorded,heat);
    close(hushCosmosRecordedInk(first,heat),first);
    assert.ok(first[2]>first[0]&&first[0]>first[1]);
    assert.ok(mark?Math.max(...first)>.5:Math.max(...first)<.03);
  }
});

test('five-bit field transport remains bounded and separates stellar heat from dark purple veil',()=>{
  let previous=0;
  for(let packed=0;packed<32;packed++){
    const m=hushCosmosSignalMaterial(packed/31);
    assert.ok(m.color.every(v=>v>=0&&v<=1));assert.ok(m.heat>=previous);previous=m.heat;
    assert.equal(Math.max(...m.color),packed/31);
  }
  assert.equal(hushCosmosSignalMaterial(0).heat,0);
  assert.equal(hushCosmosSignalMaterial(1).heat,1);
});

test('the real Three basic-material hook samples world position after captured morphs and skinning',()=>{
  const material=installHushCosmosMaterial(new MeshBasicMaterial({color:0})),shader={
    vertexShader:ShaderLib.basic.vertexShader,fragmentShader:ShaderLib.basic.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader,{});
  assert.ok(shader.vertexShader.indexOf('vHushCosmosWorld=(modelMatrix*hushWorld).xyz')>shader.vertexShader.indexOf('#include <skinning_vertex>'));
  assert.match(shader.fragmentShader,/diffuseColor.rgb=hushCosmosField\(vHushCosmosWorld\).rgb/);
  assert.equal(material.userData.hushCosmos.space,'authored-world-metres');
  assert.equal(material.toneMapped,false);assert.equal(material.fog,false);
  assert.equal(material.customProgramCacheKey(),HUSH_COSMOS.revision);
  material.dispose();
});
