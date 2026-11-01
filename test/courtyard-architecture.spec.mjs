import test from 'node:test';
import assert from 'node:assert/strict';
import {clipCourtyardPrimitive} from '../tools/chunk_surfer/courtyard-architecture-geometry.mjs';
import {courtyardMeshCuts} from '../src/data/ellery-courtyard-architecture.js';

test('a spanning overhead slab is cut even when every original vertex lies outside the courtyard',()=>{
  const g={positions:[-4,2,-4,4,2,-4,0,2,4],normals:[0,1,0,0,1,0,0,1,0],uvs:[0,0,1,0,.5,1],indices:[0,1,2]};
  assert.equal(clipCourtyardPrimitive(g,[{min:[-1,1,-1],max:[1,3,1]}]),1);
  assert.ok(g.indices.length>3,'keep the surrounding supported slab');
  for(let i=0;i<g.indices.length;i+=3){const p=g.indices.slice(i,i+3).map(k=>g.positions.slice(k*3,k*3+3));
    assert.ok([0,2].some(axis=>p.every(v=>v[axis]<=-1+1e-8)||p.every(v=>v[axis]>=1-1e-8)),'no retained triangle crosses open sky');
  }
});

test('courtyard repair leaves unrelated furniture and protected architecture bytes alone',()=>{
  assert.deepEqual(courtyardMeshCuts('chair'),[]);
  const g={positions:[20,2,20,21,2,20,20,2,21],normals:[0,1,0,0,1,0,0,1,0],uvs:[.1,.2,.3,.4,.5,.6],indices:[0,1,2]},before=structuredClone(g);
  assert.equal(clipCourtyardPrimitive(g,[{min:[-1,1,-1],max:[1,3,1]}]),0);assert.deepEqual(g,before);
});
