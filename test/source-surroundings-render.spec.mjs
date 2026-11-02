import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE as A} from '../src/render/source-continuation-renderer.js';
import {continuationSurfaces,continuationSolids,continuationDoors,SOURCE_CONTINUATION} from '../src/data/source-continuation.js';
import {SOURCE_SURROUNDINGS as C} from '../src/data/source-surroundings.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';

const state=(extra={})=>({...freshSourceContinuation({runId:'pressure-render-proof'}),status:'active',elapsed:15,...extra});
const remote=frame=>frame.props.filter(p=>p.surroundings);
const canonicalRemote=frame=>frame.canonicalProps.filter(p=>p.surroundings);
// An identity portal multiplication can turn -0 into +0 without changing a
// coordinate. All nonzero matrix components still require exact equality.
const matrices=rows=>rows.map(p=>({id:p.canonicalId||p.id,matrix:Array.from(p.matrix,v=>v===0?0:v)})).sort((a,b)=>a.id.localeCompare(b.id)||JSON.stringify(a.matrix).localeCompare(JSON.stringify(b.matrix)));

test('the two fixed worlds persist through the actual II–III threshold without a phase scenery pop',()=>{
  const a=sourceContinuationRenderFrame(state({chartId:4,x:C.thresholdX+.5,z:C.thresholdZ,feet:8.4,yaw:-Math.PI/2}));
  const b=sourceContinuationRenderFrame(state({phase:'catch',chartId:0,x:C.thresholdX-.5,z:C.thresholdZ,feet:8.4,yaw:-Math.PI/2,pitch:.2}));
  // The final real portal joins chart 4 to chart 0. Its destination image and
  // the newly occupied stock must agree; the separate chart-4 backdrop atlas
  // is deliberately not another copy of that destination construction.
  const through=remote(a).filter(p=>p.portalDestination&&!p.backdropAtlas);
  const occupied=canonicalRemote(b).filter(p=>!p.backdropAtlas);
  assert.equal(through.length,58);assert.equal(occupied.length,58);
  assert.deepEqual(matrices(through),matrices(occupied));
  assert.deepEqual(a.surroundings.pressure,b.surroundings.pressure,'crossing does not restart either canonical pressure front');
  assert.deepEqual(new Set(remote(a).map(p=>p.world)),new Set(['fall','centre']));
  assert.equal(a.surroundings.world,'fall');assert.equal(b.surroundings.world,'centre');
  assert.equal(a.surroundings.score.pieceId,'ensemble');assert.equal(b.surroundings.score.pieceId,'couperin');
  assert.equal(new Set(a.props.map(p=>p.id)).size,a.props.length);
  assert.ok(a.props.length<A.maxInstances);assert.ok(a.lights.length<=8);
  for(const f of [a,b]){
    assert.equal(f.strictOverhead,false);assert.equal(f.counts.body,0);
    assert.equal(new Set(f.props.map(p=>p.id)).size,f.props.length);
    assert.ok(f.props.length<A.maxInstances);assert.ok(f.lights.length<=8);
  }
  assert.equal(b.yaw,-Math.PI/2);assert.equal(b.pitch,.2);
  assert.deepEqual(b.eye,[C.thresholdX-.5,8.4+SOURCE_CONTINUATION.eyeHeight,C.thresholdZ]);
});

test('remote pressure scenery cannot add support, door destinations, body collisions or mutation to the existing route',()=>{
  for(const phase of ['wrong-return','catch'])for(const elapsed of [0,14.4,35,96,384]){
    const s=state({phase,elapsed}),before=structuredClone(s),frame=sourceContinuationRenderFrame(s);
    assert.deepEqual(s,before);
    assert.deepEqual(frame.geometry.surfaces,continuationSurfaces());
    assert.deepEqual(frame.geometry.solids,continuationSolids(s));
    assert.deepEqual(frame.geometry.doors.map(({openFraction,...door})=>door),continuationDoors(s));
    for(const p of remote(frame)){
      assert.equal(p.noCollision,true);assert.equal(p.walkable,false);
      // Atlas images have a different local frame; the canonical bounds keep
      // their original relation to the route. Every image remains nonphysical.
      if(!p.backdropAtlas&&!p.portalDestination){
        if(p.world==='fall')assert.ok(p.physicalBounds.min[0]>C.fallMinimumX,p.id);
        if(p.world==='centre')assert.ok(p.physicalBounds.max[1]<C.centreMaximumY,p.id+' stays below the local Catch floors');
      }
    }
    assert.equal(frame.geometry.surfaces.some(p=>p.surroundings),false);
  }
});

test('reduced motion holds both remote constructions while music time and the actual camera continue',()=>{
  const a=sourceContinuationRenderFrame(state({elapsed:5}),{reducedMotion:true});
  const b=sourceContinuationRenderFrame(state({elapsed:80,yaw:1,pitch:.4}),{reducedMotion:true});
  assert.equal(canonicalRemote(a).length,58);assert.equal(canonicalRemote(b).length,58);
  assert.deepEqual(matrices(canonicalRemote(a)),matrices(canonicalRemote(b)),
    'camera-dependent portal/frustum submission does not move the canonical construction');
  assert.notEqual(a.surroundings.score.phase,b.surroundings.score.phase);
  assert.deepEqual(a.surroundings.waves,[]);assert.deepEqual(b.surroundings.events,[]);
  assert.notEqual(a.yaw,b.yaw);assert.notEqual(a.pitch,b.pitch);
});

test('rotated route studies rotate remote architecture with the body rather than allowing a camera-attached background',()=>{
  const centre=SOURCE_CONTINUATION.catch.center;
  const s=state({phase:'catch',chartId:0,x:centre.x+10,z:centre.z,feet:8.4});
  assert.equal(sourceContinuationRenderFrame(s).pressureInstances.length,0,'a fresh inactive pursuer must not be invented for the study');
  s.hush={...s.hush,active:true,chartId:0,x:centre.x+8,z:centre.z,feet:8.4,heading:.4,mode:'follow',animationClock:2};
  const a=sourceContinuationRenderFrame(s),b=sourceContinuationRenderFrame(s,{studyRotation:Math.PI/2});
  const rows=remote(a),rotated=remote(b);
  assert.equal(rows.length,rotated.length);
  for(let i=0;i<rows.length;i++){
    const p=rows[i].matrix,q=rotated[i].matrix;
    assert.ok(Math.abs(q[12]-(centre.x-(p[14]-centre.z)))<.001);
    assert.ok(Math.abs(q[14]-(centre.z+(p[12]-centre.x)))<.001);
    assert.equal(q[13],p[13]);
    assert.ok(Math.abs(rotated[i].x-(centre.x-(rows[i].z-centre.z)))<.001,'culling rotates the actual bounds centre');
    assert.ok(Math.abs(rotated[i].z-(centre.z+(rows[i].x-centre.x)))<.001);
  }
  assert.ok(a.pressureInstances.length>0);
  assert.equal(a.pressureInstances.length,b.pressureInstances.length);assert.ok(a.pressureInstances.length<=4);
  for(let i=0;i<a.pressureInstances.length;i++){
    const p=a.pressureInstances[i].matrix,q=b.pressureInstances[i].matrix;
    assert.ok(Math.abs(q[12]-(centre.x-(p[14]-centre.z)))<.001,'the actual skinned pressure root rotates with the world');
    assert.ok(Math.abs(q[14]-(centre.z+(p[12]-centre.x)))<.001);
  }
});
