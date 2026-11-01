import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const post=source.slice(source.indexOf('const POST_FRAG ='),source.indexOf('// Source Space is a deliberately separate proof'));
const clamp=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,t)=>a*(1-t)+b*t;

test('the ordinary full-screen post guards the unused unravelling texture read',()=>{
  assert.match(post,/float unravellingAmount=clamp\(uUnravellingColour,0\.0,1\.0\);\s*if\(unravellingAmount>0\.0\)\s*\{\s*c=mix\(c,texture\(uUnravellingScene,uv\)\.rgb,unravellingAmount\*\(1\.0-pressureIdentityMask\(uv\)\)\);\s*\}/);
  assert.match(source,/function presentThroughPost\(sourceTex,\{torchPower=0,sourceTorchMode=0,unravellingColour=0/);
  assert.match(source,/gl\.uniform1f\(postU\('uUnravellingColour'\),unravellingColour\)/);
});

test('guarded blend preserves zero, transitions, saturation and the pressure mask',()=>{
  for(const colour of [-1,0,.001,.25,1,2])for(const mask of [0,.2,1])for(const a of [0,.2,1])for(const b of [0,.7,1]){
    const amount=clamp(colour),before=mix(a,b,amount*(1-mask));
    const after=amount>0?mix(a,b,amount*(1-mask)):a;
    assert.equal(after,before,JSON.stringify({colour,mask,a,b}));
  }
});
