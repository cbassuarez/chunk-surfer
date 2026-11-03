import test from 'node:test';
import assert from 'node:assert/strict';
import {FINAL_INK, FINAL_LOOK_GLSL, MATERIAL_INK_RESPONSE, finalMaterialLightInk} from '../src/render/pixel-mesh/final-look.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';

const near=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} differs from ${b}`);
const nearRGB=(a,b)=>a.forEach((value,index)=>near(value,b[index]));

test('ordinary-world ink uses the approved neutral endpoint and moderate color strength',()=>{
  assert.deepEqual(FINAL_INK.light,[.9,.9,.9]);
  assert.equal(MATERIAL_INK_RESPONSE.strength,.34);
  assert.deepEqual(FINAL_INK.dark,[.003,.0042,.007]);
  for(const grey of [0,.0001,.01,.1,.5,1,4])nearRGB(finalMaterialLightInk([grey,grey,grey]),FINAL_INK.light);
});

test('dim colored material retains the same hue as the same material under brighter light',()=>{
  for(const color of [[.12,.3,.62],[.08,.32,.12],[.5,.28,.07],[.44,.16,.38]]){
    const bright=finalMaterialLightInk(color);
    for(const exposure of [.001,.01,.1,2,12])nearRGB(finalMaterialLightInk(color.map(channel=>channel*exposure)),bright);
  }
  const blue=finalMaterialLightInk([.0002,.0004,.0012]);
  assert.ok(blue[2]>blue[1]&&blue[1]>blue[0],'low-light blue does not fall back to limestone');
  const green=finalMaterialLightInk([.0002,.0012,.0004]);
  assert.ok(green[1]>green[2]&&green[2]>green[0]);
});

test('ink gamut mapping keeps RGB ratios instead of clipping two bright channels together',()=>{
  for(const color of [[1,.8,.1],[.2,1,.6],[.1,.3,1],[1,.1,.7],[.8,1,.05]]){
    const ink=finalMaterialLightInk(color);
    assert.ok(ink.every(channel=>Number.isFinite(channel)&&channel>=0&&channel<=MATERIAL_INK_RESPONSE.maximum+1e-10));
    const y=color[0]*.2126+color[1]*.7152+color[2]*.0722;
    const hue=color.map(channel=>channel-y),length=Math.max(...hue.map(Math.abs));
    const gain=Math.min(1,.98/(.9+.34*Math.max(...hue)/length));
    const reconstructed=ink.map(channel=>(channel/gain-.9)/.34);
    nearRGB(reconstructed,hue.map(channel=>channel/length));
  }
  const warm=finalMaterialLightInk([1,.8,.1]);
  near(Math.max(...warm),.98);
  assert.ok(warm[0]>warm[1]&&warm[1]>warm[2],'warm material retains three distinct channels instead of a yellow clip');
});

test('existing black protection attenuates hue without altering capture decisions',()=>{
  const color=[.02,.07,.18];
  nearRGB(finalMaterialLightInk(color,0),FINAL_INK.light);
  const half=finalMaterialLightInk(color,.5),full=finalMaterialLightInk(color,1);
  assert.ok(Math.max(...half)-Math.min(...half)<Math.max(...full)-Math.min(...full));
  assert.ok(PIXEL_MESH_FRAG.includes(FINAL_LOOK_GLSL));
  const bit=PIXEL_MESH_FRAG.indexOf('float captureBit ='),ink=PIXEL_MESH_FRAG.indexOf('vec3 captureLight = finalMaterialLightInk');
  assert.ok(bit>=0&&ink>bit,'the existing acquisition chooses marks before color is resolved');
  for(const special of ['captureLight=sourceBlueprintRecordedInk','captureLight=mix(captureLight,vec3(.98,.018,.008),emergencyRed)',
    'captureLight=mix(captureLight,quietMetalInk,quietMetal)','captureLight=mix(captureLight,roofSurfaceInk,roofSurface)']){
    assert.ok(PIXEL_MESH_FRAG.indexOf(special)>ink,`${special} retains final material authority`);
  }
});
