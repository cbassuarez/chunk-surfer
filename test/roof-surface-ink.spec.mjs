import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOF_SURFACE_INK_BYTE, ROOF_SURFACE_INK_TAG, ROOF_SURFACE_INK_GLSL, ROOF_GLASS_INK_BYTE, ROOF_GLASS_INK_TAG, ROOF_GLASS_INK_GLSL } from '../src/render/roof-surface-ink.js';
import { FIRE_ESCAPE_INK_BYTE } from '../src/render/fire-escape-ink.js';
import { PIXEL_MESH_FRAG } from '../src/render/pixel-mesh/shader.js';

test('subdued roof ink survives RGBA8 without claiming iron, grain or apparitions',()=>{
  assert.equal(Math.round(ROOF_SURFACE_INK_TAG*255),ROOF_SURFACE_INK_BYTE);
  assert.ok(Math.abs(FIRE_ESCAPE_INK_BYTE-ROOF_SURFACE_INK_BYTE)>3);
  assert.equal(Math.round(ROOF_GLASS_INK_TAG*255),ROOF_GLASS_INK_BYTE);
  assert.ok(Math.abs(ROOF_GLASS_INK_BYTE-ROOF_SURFACE_INK_BYTE)>3);
  const classify=new Function('value','step','abs',ROOF_SURFACE_INK_GLSL
    .replace('const float','const').replace(/float roofSurfaceInkTag\(float value\)\{/,'function roofSurfaceInkTag(value){')
    +'\nreturn roofSurfaceInkTag(value);');
  const step=(edge,value)=>value<edge?0:1;
  for(let byte=0;byte<=255;byte++){
    const tagged=classify(byte/255,step,Math.abs);
    assert.equal(tagged,Math.abs(byte-ROOF_SURFACE_INK_BYTE)<1.5?1:0);
    if(byte===0||byte===128||byte===255||byte===FIRE_ESCAPE_INK_BYTE||(byte>=174&&byte<=219))
      assert.equal(tagged,0,`unrelated material byte ${byte} remains unchanged`);
  }
});

test('only real supported panes retain reflection and depth, with charcoal support ink',()=>{
  const world=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const glassBlock=world.slice(world.indexOf('if(uRoofView > 0.5 && hitMat == MAT_ROOF_GLASS && surf == 2)'),world.indexOf('// HUSH does not carry a lamp'));
  assert.match(glassBlock,/gMarkPlane=support>\.40\?FIRE_ESCAPE_INK_TAG:ROOF_GLASS_INK_TAG/);
  assert.ok(PIXEL_MESH_FRAG.includes(ROOF_GLASS_INK_GLSL));
  assert.match(PIXEL_MESH_FRAG,/finalColor=mix\(finalColor,clamp\(c\*1\.35,0\.0,1\.0\),roofGlass\*\.38\)/,
    'continuous reflection recovery is confined to actual pane pixels');
});

test('roof ink belongs to real winning materials and does not dim their neighbours',()=>{
  const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const props=source('../src/render/props3d.js'),world=source('../src/render/r3d.js');
  assert.match(props,/U\('uRoofSurface'\),p\.materialRole==='weathered-surface'\?1:0/,
    'every draw resets the role, including Ren and glass');
  const winning=world.slice(world.indexOf('if(propView < archView + 0.015'),world.indexOf('// Feather the BLACK mesh'));
  assert.match(winning,/roofSurfaceInkTag\(prop\.a\)>\.5\?ROOF_SURFACE_INK_TAG:0\.0/);
  assert.match(world,/bool wiredPane=roofGlassInkTag\(prop\.a\)>\.5/,
    'pane ownership survives lighting and never relies on the colour of opaque neighbours');
  assert.ok(PIXEL_MESH_FRAG.includes(ROOF_SURFACE_INK_GLSL));
  assert.match(PIXEL_MESH_FRAG,/roofSurfaceInkTag\(texelFetch\(uMarks/,'categorical identity uses exact texels');
  assert.match(PIXEL_MESH_FRAG,/finalColor=mix\(finalColor,min\(finalColor,roofSurfaceInk\),roofSurface\)/,
    'only the material pixels get the dimmer ink, not adjacent glass or city');
  assert.match(PIXEL_MESH_FRAG,/finalColor=mix\(finalColor,clamp\(c\*1\.65,0\.0,1\.0\),roofSurface\*\.38\)/,
    'broad wet roof shade survives only on its authored surface');
});

test('only real academic roof panes receive glass identity, regardless of torch colour',()=>{
  const props=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const world=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const binding=props.match(/U\('uRoofGlass'\),([^;]+)\);/);
  assert.ok(binding,'every primitive draw explicitly resets glass ownership');
  const owned=new Function('name','p',`return ${binding[1]};`);
  const bytes=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
  const glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
  const owners=new Set();let sharedElsewhere=0;
  for(const mesh of glb.meshes)for(const primitive of mesh.primitives){
    const materialName=glb.materials[primitive.material||0].name;
    const expected=['academic_roof_glazing','academic_roof_seat'].includes(mesh.name)&&materialName==='wired roof glass';
    assert.equal(!!owned(mesh.name,{materialName}),expected,`${mesh.name}: ${materialName}`);
    if(expected)owners.add(mesh.name);
    if(materialName==='wired roof glass'&&!expected)sharedElsewhere++;
  }
  assert.equal(owners.size,2,'both the main panes and supported seat panel are actual glass');
  assert.ok(sharedElsewhere>10,'shared car, booth and other panes must remain unchanged');
  const classify=new Function('value','step','abs',ROOF_GLASS_INK_GLSL
    .replace('const float','const').replace(/float roofGlassInkTag\(float value\)\{/,'function roofGlassInkTag(value){')
    +'\nreturn roofGlassInkTag(value);');
  const expression=world.match(/bool wiredPane=([^;]+);/)[1];
  const pane=new Function('prop','roofGlassInkTag',`return ${expression};`);
  const tagged=value=>classify(value,(edge,v)=>v<edge?0:1,Math.abs);
  for(const rgb of[[.29,.49,.54],[.60,.95,.96],[1,1,1],[0,0,0]]){
    const [r,g,b]=rgb;
    assert.equal(pane({r,g,b,a:ROOF_GLASS_INK_TAG},tagged),true,'bright and dark panes stay transparent');
    for(const byte of[255,FIRE_ESCAPE_INK_BYTE,ROOF_SURFACE_INK_BYTE,194])
      assert.equal(pane({r,g,b,a:byte/255},tagged),false,'identical RGB never claims an opaque object or apparition');
  }
});
