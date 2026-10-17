import test from 'node:test';
import assert from 'node:assert/strict';
import {printedSurfaceDescriptor,encodePrintedSurface,decodePrintedSurface,packPropWorldDepth,unpackPropWorldDepth} from '../src/render/printed-surface.js';
import {FIRE_ESCAPE_INK_BYTE} from '../src/render/fire-escape-ink.js';
import {ROOF_SURFACE_INK_BYTE,ROOF_GLASS_INK_BYTE} from '../src/render/roof-surface-ink.js';

test('authored pigment remains opaque and cannot claim unrelated material tags',()=>{
  for(const kind of [1,2])for(let i=0;i<16;i++){
    const tag=encodePrintedSurface(i/15,kind),stored=Math.round(tag*255)/255;
    assert.deepEqual(decodePrintedSurface(stored),{kind,coverage:i/15});
    assert.ok(Math.round(tag*255)>128&&Math.round(tag*255)<174);
  }
  for(const byte of [0,128,255,FIRE_ESCAPE_INK_BYTE,ROOF_SURFACE_INK_BYTE,ROOF_GLASS_INK_BYTE])
    assert.equal(decodePrintedSurface(byte/255).kind,0);
  for(let byte=174;byte<=219;byte++)assert.equal(decodePrintedSurface(byte/255).kind,0);
  assert.equal(encodePrintedSurface(1,0),0);
  assert.equal(printedSurfaceDescriptor(null),null);
  const contract={version:1,coverage:'baseColorAlpha',polarity:'dark-on-light',process:'vitreous enamel'};
  assert.equal(printedSurfaceDescriptor(contract).emission,'none');
  assert.throws(()=>printedSurfaceDescriptor(contract,{alphaMode:'MASK'}),/OPAQUE/);
  assert.throws(()=>printedSurfaceDescriptor(contract,{hasTexture:false}),/texture/);
  assert.throws(()=>printedSurfaceDescriptor({...contract,polarity:'guess-from-luma'}),/contract/);
});

test('reusing the depth slot preserves the hardware depth quantization',()=>{
  for(let i=0;i<=100000;i++){
    const depth=i/100000,rgb=packPropWorldDepth(depth).map(v=>Math.round(v*255)/255);
    const expected=Math.round(depth*16777215)/16777215;
    assert.ok(Math.abs(unpackPropWorldDepth(rgb)-expected)<1e-14,`depth ${depth}`);
  }
  assert.equal(unpackPropWorldDepth(packPropWorldDepth(0)),0);
  assert.equal(unpackPropWorldDepth(packPropWorldDepth(1)),1);
});
