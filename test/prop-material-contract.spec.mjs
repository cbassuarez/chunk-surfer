import test from 'node:test';
import assert from 'node:assert/strict';
import {propMaterialFactors,letteringFinishDescriptor,propTextureWrap} from '../src/render/prop-material-contract.js';

test('new unmapped and mapped glTF materials apply their scalar factors once',()=>{
  for(const hasOrm of [false,true]){
    const factors=propMaterialFactors({roughness:.46,metallic:.7,hasOrm,semantics:'gltf'});
    const map=hasOrm?[.6,.4]:[1,1];
    assert.ok(Math.abs(factors.roughness*map[0]-.46*map[0])<1e-14);
    assert.ok(Math.abs(factors.metallic*map[1]-.7*map[1])<1e-14);
    assert.equal(factors.legacyUnmapped,false);
  }
});

test('legacy imports and generated primitives preserve their effective unmapped finish',()=>{
  for(const roughness of [0,.12,.46,.89,1])for(const metallic of [0,.25,.7,1]){
    const factors=propMaterialFactors({roughness,metallic});
    assert.equal(factors.roughness,roughness*roughness);
    assert.equal(factors.metallic,metallic*metallic);
    assert.equal(factors.legacyUnmapped,true);
    // Street roughness mixed an unmapped fallback with a texture before
    // multiplying. The import conversion must preserve both sides of it.
    for(const texture of [.1,.64,1])for(const mix of [0,.37,1]){
      const previous=((1-mix)*roughness+mix*texture)*roughness;
      const converted=(1-mix)*factors.roughness+mix*texture*factors.streetRoughnessFactor;
      assert.ok(Math.abs(previous-converted)<1e-14);
    }
    const mapped=propMaterialFactors({roughness,metallic,hasOrm:true});
    assert.equal(mapped.roughness,roughness);
    assert.equal(mapped.metallic,metallic);
  }
});

test('finish metadata opts in explicitly and cannot silently enable invalid material behavior',()=>{
  assert.equal(letteringFinishDescriptor(null),null);
  for(const profile of ['enamel','gilt-enamel','paper-print','apparatus-print','carrier-oak']){
    assert.deepEqual(letteringFinishDescriptor({version:1,profile,localSpecular:true}),{version:1,profile,localSpecular:true});
    assert.equal(letteringFinishDescriptor({version:1,profile,localSpecular:false}).localSpecular,false);
  }
  for(const bad of [{version:2,profile:'enamel',localSpecular:true},{version:1,profile:'',localSpecular:true},
    {version:1,profile:'enamel'},{version:1,profile:'enamel',localSpecular:'true'}])
    assert.throws(()=>letteringFinishDescriptor(bad),/contract/);
  assert.throws(()=>propMaterialFactors({semantics:'guess'}),/semantics/);
  for(const roughness of [NaN,Infinity,-.1,1.1])assert.throws(()=>propMaterialFactors({roughness}),/finite/);
});

test('physical repeating carrier textures and clamped lettering atlases retain their authored addressing',()=>{
  assert.deepEqual(propTextureWrap(),{wrapS:10497,wrapT:10497});
  assert.deepEqual(propTextureWrap({wrapS:33071,wrapT:33071}),{wrapS:33071,wrapT:33071});
  assert.deepEqual(propTextureWrap({wrapS:10497,wrapT:33648}),{wrapS:10497,wrapT:33648});
  assert.throws(()=>propTextureWrap({wrapS:9729}),/wrap mode/);
});
