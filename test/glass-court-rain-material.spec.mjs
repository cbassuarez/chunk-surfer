import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setGlassCourtRainFrame} from '../src/render/props3d.js';

test('missing or disabled rain state yields zeroed uniforms across scene branches',()=>{
 const empty={active:0,faces:[[0,0,0,0],[0,0,0,0]],motion:[0,0,0,0]};
 assert.deepEqual(setGlassCourtRainFrame(null),empty);
 setGlassCourtRainFrame({active:1,faces:[[76.6,1.7,28,.8],[89.2,1.7,28,.5]],motion:[12,0,0,1]});
 assert.deepEqual(setGlassCourtRainFrame(null),empty,'leaving the greenhouse cannot retain a prior material frame');
 assert.deepEqual(setGlassCourtRainFrame({active:0,faces:[[76,1,28,1],[89,1,28,1]],motion:[12,0,0,1]}),empty);
});

test('only two finite physical face locations can activate the material',()=>{
 const sample={active:1,faces:[[76.6,1.7,28,.8],[89.2,1.7,28,.5]],motion:[12,-.02,.03,1]};
 const frame=setGlassCourtRainFrame(sample);assert.equal(frame.active,1);
 assert.ok(Math.abs(frame.faces[0][0]-76.6)<.00001);assert.equal(frame.faces[0][2],28);
 assert.ok(Math.abs(frame.faces[0][3]-.8)<.00001);assert.equal(frame.motion[0],12);
 for(const faces of[[],[sample.faces[0]],[[NaN,1,28,1],sample.faces[1]],[[1e300,1,28,1],sample.faces[1]],[[1,1,28,Infinity],sample.faces[1]]]){
  const invalid=setGlassCourtRainFrame({...sample,faces});assert.equal(invalid.active,0);assert.ok(invalid.faces.flat().every(v=>v===0));
 }
});

test('coherence, gaze and flow amplitude remain bounded without inventing a clock',()=>{
 const frame=setGlassCourtRainFrame({active:1,faces:[[76,1.7,28,2],[89,1.7,28,-1]],motion:[NaN,-2,2,4]});
 assert.deepEqual(frame.faces.map(f=>f[3]),[1,0]);assert.equal(frame.motion[0],0);
 assert.ok(Math.abs(frame.motion[1]+.045)<.00001);assert.ok(Math.abs(frame.motion[2]-.045)<.00001);
 assert.equal(frame.motion[3],1);
});

test('new wet pigment and coverage participate in the ordinary material before alpha and lighting',()=>{
 const code=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
 const start=code.indexOf('  vec2 courtWet=glassCourtRainFaceEvidence(vWorld,vNormal);');
 const alpha=code.indexOf('  float sampledAlpha=texel.a*uBaseAlpha;',start);
 assert.ok(start>0&&alpha>start);
 const hook=code.slice(start,alpha);
 assert.ok(hook.includes('vec3(173.0,191.0,172.0)/255.0'));
 assert.ok(hook.indexOf('texel.rgb=mix')<hook.indexOf('texel.a=max'));
 assert.ok(!hook.includes('emissive')&&!hook.includes('return;'));
 assert.ok(code.includes("m.name==='glass_court_glass'&&p.materialName==='court sparse glazed reflection'"));
});
