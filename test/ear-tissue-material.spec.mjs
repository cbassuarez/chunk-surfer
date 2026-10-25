import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {tissueSurfaceDescriptor,propMaterialFactors} from '../src/render/prop-material-contract.js';

const contract={version:1,profile:'severed-auricle',preservePigment:true,localSpecular:true};
const bytes=fs.readFileSync(new URL('../public/assets/stop-listening.glb',import.meta.url)),length=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+length)),base=28+length;

test('ear tissue is an explicit immutable opt-in and ordinary material factors remain unchanged',()=>{
  assert.equal(tissueSurfaceDescriptor(),null);assert.equal(tissueSurfaceDescriptor(null),null);
  const descriptor=tissueSurfaceDescriptor(contract);assert.deepEqual(descriptor,contract);assert.ok(Object.isFrozen(descriptor));
  assert.deepEqual(propMaterialFactors({roughness:.8,metallic:.5}),{roughness:.8*.8,metallic:.25,streetRoughnessFactor:.8,legacyUnmapped:true});
});

test('malformed or broadened tissue opt-ins are rejected',()=>{
  for(const value of [{},false,'red',[],{...contract,version:2},{...contract,profile:'any-red-surface'},
    {...contract,preservePigment:false},{...contract,localSpecular:false},{...contract,localSpecular:1}])
    assert.throws(()=>tissueSurfaceDescriptor(value),/Invalid tissue surface/);
});

test('only the three exported flesh materials preserve their pigment and local finish',()=>{
  const opted=gltf.materials.filter(mat=>mat.extras?.tissueSurface);
  assert.deepEqual(opted.map(mat=>mat.name).sort(),['stop listening ear deep','stop listening ear skin','stop listening ear wound']);
  for(const mat of gltf.materials){
    const descriptor=tissueSurfaceDescriptor(mat.extras?.tissueSurface);
    assert.equal(!!descriptor,/^stop listening ear /.test(mat.name),mat.name);
    if(descriptor){assert.deepEqual(descriptor,contract);assert.equal(mat.extras.materialFactors,'gltf');}
  }
});

test('actual packed tissue remains dielectric with bounded roughness, occlusion and small normals',async()=>{
  const mats=gltf.materials.filter(mat=>mat.extras?.tissueSurface),first=mats[0];
  const imageFor=async id=>{
    const image=gltf.images[gltf.textures[id].source],view=gltf.bufferViews[image.bufferView];
    return sharp(bytes.subarray(base+(view.byteOffset||0),base+(view.byteOffset||0)+view.byteLength)).raw().toBuffer({resolveWithObject:true});
  };
  const [orm,normal]=await Promise.all([imageFor(first.pbrMetallicRoughness.metallicRoughnessTexture.index),imageFor(first.normalTexture.index)]);
  assert.deepEqual([orm.info.width,orm.info.height,normal.info.width,normal.info.height],[512,512,512,512]);
  let minRough=1,maxRough=0;
  for(let i=0;i<orm.data.length;i+=orm.info.channels){
    minRough=Math.min(minRough,orm.data[i+1]/255);maxRough=Math.max(maxRough,orm.data[i+1]/255);
    assert.equal(orm.data[i+2],0);assert.ok(orm.data[i]>=210,'AO cannot fabricate a black cavity');
  }
  for(const mat of mats){
    const pbr=mat.pbrMetallicRoughness;
    assert.equal(pbr.metallicFactor,0);assert.equal(mat.occlusionTexture.index,pbr.metallicRoughnessTexture.index);
    assert.equal(mat.occlusionTexture.strength,.5);assert.ok(mat.normalTexture.scale>0&&mat.normalTexture.scale<=.6);
    const factors=propMaterialFactors({roughness:pbr.roughnessFactor,metallic:pbr.metallicFactor,hasOrm:true,semantics:mat.extras.materialFactors});
    assert.equal(factors.legacyUnmapped,false);
    if(mat.name.endsWith('wound'))assert.ok(minRough*factors.roughness>=.18&&maxRough*factors.roughness<=.35);
    else assert.ok(minRough*factors.roughness>=.40&&maxRough*factors.roughness<=.77);
  }
  for(let i=0;i<normal.data.length;i+=normal.info.channels)assert.ok(normal.data[i+2]>230);
});

test('encoded albedo survives exactly one sRGB decode at the runtime import',async()=>{
  const mat=gltf.materials.find(mat=>mat.name==='stop listening ear skin');
  const image=gltf.images[gltf.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source],view=gltf.bufferViews[image.bufferView];
  const raw=await sharp(bytes.subarray(base+(view.byteOffset||0),base+(view.byteOffset||0)+view.byteLength)).raw().toBuffer({resolveWithObject:true});
  const decode=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
  let luminance=0,red=0,green=0,blue=0;
  for(let i=0;i<raw.data.length;i+=raw.info.channels){
    const r=raw.data[i]/255,g=raw.data[i+1]/255,b=raw.data[i+2]/255;
    luminance+=.2126*decode(r)+.7152*decode(g)+.0722*decode(b);red+=r;green+=g;blue+=b;
  }
  const count=raw.info.width*raw.info.height;
  assert.ok(luminance/count>.14&&luminance/count<.24,`encoded tissue decodes to ${luminance/count}; rejected double-linearized map was .0346`);
  assert.ok(red/count>.52&&green/count>.32&&blue/count>.28,'intended sRGB pigment samples must reach the PNG, before the hardware linear decode');
});
