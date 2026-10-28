import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE as A} from '../src/render/source-continuation-renderer.js';
import {continuationSurfaces,continuationSolids,continuationDoors} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';

const state=(extra={})=>({...freshSourceContinuation({runId:'pressure-render-proof'}),status:'active',elapsed:15,...extra});
const remote=frame=>frame.props.filter(p=>p.surroundings);
const matrices=rows=>rows.map(p=>({id:p.id,matrix:[...p.matrix]}));

test('the two fixed worlds persist through the actual II–III threshold without a phase scenery pop',()=>{
  const a=sourceContinuationRenderFrame(state({x:-17.5,z:-12,feet:8.4}));
  const b=sourceContinuationRenderFrame(state({phase:'catch',x:-18.5,z:-12,feet:8.4}));
  assert.deepEqual(matrices(remote(a)),matrices(remote(b)));
  assert.deepEqual(new Set(remote(a).map(p=>p.world)),new Set(['fall','centre']));
  assert.equal(a.surroundings.world,'fall');assert.equal(b.surroundings.world,'centre');
  assert.equal(a.surroundings.score.pieceId,'ensemble');assert.equal(b.surroundings.score.pieceId,'couperin');
  assert.equal(new Set(a.props.map(p=>p.id)).size,a.props.length);
  assert.ok(a.props.length<A.maxInstances);assert.ok(a.lights.length<=8);
  assert.equal(a.strictOverhead,false);assert.equal(b.strictOverhead,false);
});

test('remote pressure scenery cannot add support, door destinations, body collisions or mutation to the existing route',()=>{
  for(const phase of ['wrong-return','catch'])for(const elapsed of [0,14.4,35,96,384]){
    const s=state({phase,elapsed}),before=structuredClone(s),frame=sourceContinuationRenderFrame(s);
    assert.deepEqual(s,before);
    assert.deepEqual(frame.geometry.surfaces,continuationSurfaces(s));
    assert.deepEqual(frame.geometry.solids,continuationSolids(s));
    assert.deepEqual(frame.geometry.doors.map(({openFraction,...door})=>door),continuationDoors(s));
    for(const p of remote(frame)){
      assert.equal(p.noCollision,true);assert.equal(p.walkable,false);
      if(p.world==='fall')assert.ok(p.physicalBounds.min[0]>35,p.id);
      if(p.world==='centre')assert.ok(p.physicalBounds.max[0]<-100,p.id);
    }
    assert.equal(frame.geometry.surfaces.some(p=>p.surroundings),false);
  }
});

test('reduced motion holds both remote constructions while music time and the actual camera continue',()=>{
  const a=sourceContinuationRenderFrame(state({elapsed:5}),{reducedMotion:true});
  const b=sourceContinuationRenderFrame(state({elapsed:80,yaw:1,pitch:.4}),{reducedMotion:true});
  assert.deepEqual(matrices(remote(a)),matrices(remote(b)));
  assert.notEqual(a.surroundings.score.phase,b.surroundings.score.phase);
  assert.deepEqual(a.surroundings.waves,[]);assert.deepEqual(b.surroundings.events,[]);
  assert.notEqual(a.yaw,b.yaw);assert.notEqual(a.pitch,b.pitch);
});

test('rotated route studies rotate remote architecture with the body rather than allowing a camera-attached background',()=>{
  const s=state({phase:'catch',x:-28,z:-12,feet:8.4}),a=sourceContinuationRenderFrame(s),b=sourceContinuationRenderFrame(s,{studyRotation:Math.PI/2});
  const rows=remote(a),rotated=remote(b);
  assert.equal(rows.length,rotated.length);
  for(let i=0;i<rows.length;i++){
    const p=rows[i].matrix,q=rotated[i].matrix;
    assert.ok(Math.abs(q[12]-(-38-(p[14]+12)))<.001);
    assert.ok(Math.abs(q[14]-(-12+(p[12]+38)))<.001);
    assert.equal(q[13],p[13]);
    assert.ok(Math.abs(rotated[i].x-(-38-(rows[i].z+12)))<.001,'culling rotates the actual bounds centre');
    assert.ok(Math.abs(rotated[i].z-(-12+(rows[i].x+38)))<.001);
  }
});
