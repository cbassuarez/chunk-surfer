import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {physicalPrintFinish} from '../src/render/physical-print-finish.js';
import {threePhysicalPrintPixels,createThreePhysicalPrint} from '../src/render/three-physical-print.js';

const fixture=()=>{
  const width=24,height=16,colour=new Uint8Array(width*height*4),coverage=new Uint8Array(colour.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,a=x<6?0:x<9?128:255;
    colour.set([47+x,62+y,81,a],i);coverage.set([255,255,255,a],i);
  }
  return{width,height,colour,coverage};
};
test('physical Three print keeps visibility, opaque stock and pigment separate',()=>{
  const input=fixture(),before=new Uint8Array(input.colour),options={...input,profile:'painted-metal',widthM:.06,heightM:.02,seed:'test-field-label'};
  const decal=threePhysicalPrintPixels(options),carrier=threePhysicalPrintPixels({...options,opaque:true});
  assert.deepEqual(input.colour,before,'A finish must not mutate the original canvas bytes');
  for(let i=0;i<input.colour.length;i+=4){
    assert.equal(decal.pixels[i+3],input.colour[i+3]);assert.equal(carrier.pixels[i+3],255);
    if(input.coverage[i+3]===255)assert.deepEqual([...decal.pixels.slice(i,i+3)],[...input.colour.slice(i,i+3)],'Solid painted cores remain exact, not hollowed or weathered away');
  }
  const intermediate=new Uint8Array(input.colour);for(let i=3;i<intermediate.length;i+=4)intermediate[i]=input.coverage[i];
  const common=physicalPrintFinish({width:input.width,height:input.height,pixels:intermediate},{profile:'painted-metal',widthM:.06,heightM:.02,seed:'test-field-label'});
  for(let i=0;i<input.colour.length;i+=4){assert.equal(decal.normalPixels[i],common.normalPixels[i]);assert.equal(decal.normalPixels[i+1],255-common.normalPixels[i+1]);assert.equal(decal.normalPixels[i+2],common.normalPixels[i+2]);}
});
test('deferred print updates reuse owned texture objects and physically lit materials',()=>{
  const input=fixture(),print=createThreePhysicalPrint(THREE,{width:input.width,height:input.height,widthM:.06,heightM:.02,profile:'painted-metal',seed:'owned-textures'});
  const owned=[...print.textures],canvas=data=>({getContext:()=>({getImageData:()=>({data})})});
  assert.equal(print.material.isMeshStandardMaterial,true);assert.equal(print.material.emissive.getHex(),0);
  assert.equal(print.material.transparent,true);assert.equal(print.material.depthWrite,false);assert.equal(print.material.polygonOffset,true);
  for(let bake=0;bake<2;bake++)print.update(canvas(input.colour),canvas(input.coverage));
  assert.deepEqual(print.textures,owned,'Font readiness must update textures owned before tool disposal, rather than leak new ones');
  assert.equal(print.material.map,owned[0]);assert.equal(print.material.normalMap,owned[1]);assert.equal(print.material.roughnessMap,owned[2]);assert.equal(print.material.metalnessMap,owned[2]);
  assert.equal(owned[0].colorSpace,THREE.SRGBColorSpace);assert.equal(owned[1].colorSpace,THREE.NoColorSpace);assert.equal(owned[2].colorSpace,THREE.NoColorSpace);
  assert.ok(owned.every(map=>!map.flipY&&map.generateMipmaps&&map.minFilter===THREE.LinearMipmapLinearFilter));
  const reference=threePhysicalPrintPixels({...input,profile:'painted-metal',widthM:.06,heightM:.02,seed:'owned-textures'});
  const stride=input.width*4;assert.deepEqual(owned[0].image.data.slice(0,stride),reference.pixels.slice(-stride),'Raw upload rows must match the old Canvas top=V1 convention');
  assert.equal(print.material.userData.physicalPrint.pending,false);assert.equal(print.material.userData.physicalPrint.widthM,.06);
  for(const map of owned)map.dispose();print.material.dispose();
});
