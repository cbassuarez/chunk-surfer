import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRE_ESCAPE_INK_BYTE, FIRE_ESCAPE_INK_TAG, FIRE_ESCAPE_INK_GLSL } from '../src/render/fire-escape-ink.js';
import { ROOF_SURFACE_INK_TAG, ROOF_GLASS_INK_TAG } from '../src/render/roof-surface-ink.js';
import { PIXEL_MESH_FRAG } from '../src/render/pixel-mesh/shader.js';

const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const pack=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const gltf=JSON.parse(pack.subarray(20,20+pack.readUInt32LE(12)).toString());

test('quiet ink is limited to authored escape and roof iron, preserving opaque depth',()=>{
  const tagged=gltf.materials.flatMap((material,index)=>material.extras?.fireEscapeRole==='quiet-metal'?[index]:[]);
  const stairIndex=tagged.find(index=>gltf.materials[index].name==='subdued fire escape iron');
  assert.notEqual(stairIndex,undefined);
  const material=gltf.materials[stairIndex],pbr=material.pbrMetallicRoughness;
  assert.equal(pbr.baseColorFactor[3],1,'the transport tag must not be a translucent GLB material');
  assert.equal(material.alphaMode||'OPAQUE','OPAQUE');
  assert.equal(pbr.metallicFactor,0);assert.equal(pbr.roughnessFactor,1);
  const owners=gltf.meshes.filter(mesh=>mesh.primitives.some(p=>tagged.includes(p.material)));
  assert.ok(owners.every(mesh=>mesh.name.startsWith('academic_roof_')));
  const stair=owners.find(mesh=>mesh.name==='academic_roof_service_stair');
  assert.ok(stair);
  assert.deepEqual(gltf.meshes.filter(mesh=>mesh.primitives.some(p=>p.material===stairIndex))
    .map(mesh=>mesh.name),['academic_roof_service_stair'], 'stair iron stays a separately authored material');
  assert.ok(stair.primitives.some(p=>gltf.materials[p.material]?.name==='matte black fire escape iron'),
    'window mullions, vehicle and lamp keep their original untagged iron');
  assert.ok(stair.primitives.some(p=>gltf.materials[p.material]?.name==='scuffed fire escape nosing'),
    'sparse safety nosings remain a separate material');
  assert.ok(gltf.materials.filter(m=>m.extras?.renRole).every(m=>!m.extras.fireEscapeRole),
    'Ren cannot inherit the foreground treatment');
});

test('quiet ink identity stays separate from grain planes and apparition coverage after RGBA8',()=>{
  assert.equal(FIRE_ESCAPE_INK_BYTE,237);
  assert.equal(Math.round(FIRE_ESCAPE_INK_TAG*255),237);
  const classify=new Function('value','step','abs',FIRE_ESCAPE_INK_GLSL
    .replace('const float','const').replace(/float fireEscapeInkTag\(float value\)\{/,'function fireEscapeInkTag(value){')
    +'\nreturn fireEscapeInkTag(value);');
  const step=(edge,value)=>value<edge?0:1;
  for(let byte=0;byte<=255;byte++){
    const quiet=classify(byte/255,step,Math.abs);
    assert.equal(quiet,Math.abs(byte-237)<1.5?1:0);
    if(byte===0||byte===128||byte===255||(byte>=174&&byte<=219))assert.equal(quiet,0,
      `grain/apparition byte ${byte} cannot be quiet metal`);
  }
});

test('material identity is transported only by the winning prop and controls its final ink',()=>{
  const props=file('../src/render/props3d.js'),world=file('../src/render/r3d.js');
  assert.match(props,/gl\.uniform1f\(U\('uQuietFireEscape'\),p\.materialRole==='quiet-metal'\?1:0\)/,
    'the per-primitive role resets on every draw');
  const expression=props.match(/o=vec4\(col,([^;]+)\);/)[1];
  const outputTag=new Function('uQuietFireEscape','uRoofSurface','uRoofGlass','FIRE_ESCAPE_INK_TAG','ROOF_SURFACE_INK_TAG','ROOF_GLASS_INK_TAG',`return ${expression};`);
  for(const [iron,roof,glass,expected]of[[1,0,0,FIRE_ESCAPE_INK_TAG],[0,1,0,ROOF_SURFACE_INK_TAG],[0,0,1,ROOF_GLASS_INK_TAG],[0,0,0,1],[1,0,1,FIRE_ESCAPE_INK_TAG]])
    assert.equal(outputTag(iron,roof,glass,FIRE_ESCAPE_INK_TAG,ROOF_SURFACE_INK_TAG,ROOF_GLASS_INK_TAG),expected,
      'opaque iron and roof keep their priority while real panes carry separate identity');
  const closer=world.slice(world.indexOf('if(propView < archView + 0.015'),world.indexOf('// Feather the BLACK mesh'));
  assert.match(closer,/gMarkPlane=fireEscapeInkTag\(prop\.a\)>\.5\?FIRE_ESCAPE_INK_TAG:/,
    'hidden iron must not mark the architecture in front of it');
  assert.ok(PIXEL_MESH_FRAG.includes(FIRE_ESCAPE_INK_GLSL));
  assert.match(PIXEL_MESH_FRAG,/captureLight=mix\(captureLight,quietMetalInk,quietMetal\)/);
  assert.match(PIXEL_MESH_FRAG,/finalColor=mix\(finalColor,min\(finalColor,quietMetalInk\),quietMetal\)/,
    'the final cap acts only on the exact material, not its neighbouring facade');
});
