import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceGlyphMaterialColor } from '../src/render/props3d.js';

test('ordinary Source glyphs are paper material, independent of old neon display colours',()=>{
  const ordinary=sourceGlyphMaterialColor({colorClass:'field',color:[.03,.96,.2,1]});
  assert.deepEqual(ordinary,[.69,.72,.66,1]);
  assert.deepEqual(sourceGlyphMaterialColor({colorClass:'fault',color:[1,.11,.08,1]}),ordinary);
  assert.deepEqual(sourceGlyphMaterialColor({colorClass:'path',color:[.03,.72,1,1]}),ordinary);
});

test('page stock and explicitly authored materials remain distinct',()=>{
  assert.deepEqual(sourceGlyphMaterialColor({colorClass:'page'}),[.82,.80,.69,1]);
  assert.deepEqual(sourceGlyphMaterialColor({materialColor:[.3,.2,.1],color:[1,0,0,.4]}),[.3,.2,.1,.4]);
});

test('material lookup retains transparent coverage and returns independent values',()=>{
  assert.equal(sourceGlyphMaterialColor({color:[1,1,1,0]})[3],0);
  const first=sourceGlyphMaterialColor();first[0]=1;
  assert.deepEqual(sourceGlyphMaterialColor(),[.69,.72,.66,1]);
});
