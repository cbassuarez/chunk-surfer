import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalPrintFinish} from '../src/render/physical-print-finish.js';
const bitmap=(width=64,height=32)=>{const pixels=new Uint8Array(width*height*4);for(let i=0;i<pixels.length;i+=4)pixels.set([160,148,120,(i/4)%4*85],i);return{width,height,pixels};};
test('finish preserves exact coverage and opaque pigment cores without inventing edge damage',()=>{
 const b=bitmap(),r=physicalPrintFinish(b,{profile:'paper',widthM:.2,heightM:.1,seed:'test'});
 for(let i=0;i<b.pixels.length;i+=4){assert.equal(r.pixels[i+3],b.pixels[i+3]);if(b.pixels[i+3]===255)assert.deepEqual(r.pixels.slice(i,i+4),b.pixels.slice(i,i+4));assert.equal(r.ormPixels[i],255);assert.equal(r.ormPixels[i+2],0);}
 assert.equal(r.finishEvidence.noPerimeterDamage,true);assert.deepEqual(b.pixels,bitmap().pixels,'source bitmap mutated');
 assert.deepEqual(r,physicalPrintFinish(b,{profile:'paper',widthM:.2,heightM:.1,seed:'test'}));
});
test('metal stock and applied paint have separate physical channels',()=>{
 const b=bitmap(256,48),r=physicalPrintFinish(b,{profile:'satin-metal',widthM:.159,heightM:.018});
 assert.ok(r.finishEvidence.structureResolved);for(let i=0;i<r.pixels.length;i+=4){const a=b.pixels[i+3];assert.equal(r.ormPixels[i+2],Math.round(.7*(1-a/255)*255));if(a===255)assert.equal(r.ormPixels[i+1],Math.round(.85*255));const n=[...r.normalPixels.slice(i,i+3)].map(v=>v/255*2-1);assert.ok(Math.abs(Math.hypot(...n)-1)<.015);}
});
test('large Source print does not inflate unresolved fibres to visible centimetre ridges',()=>{
 const r=physicalPrintFinish(bitmap(),{profile:'paper',widthM:8,heightM:8});assert.equal(r.finishEvidence.structureResolved,false);assert.equal(r.finishEvidence.physicalStructureM,.0012);
 assert.throws(()=>physicalPrintFinish(bitmap(),{widthM:0,heightM:1}),/dimensions/);assert.throws(()=>physicalPrintFinish(bitmap(),{profile:'unknown',widthM:1,heightM:1}),/Unknown/);
});
