import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSurfaces,continuationSolids} from '../src/data/source-continuation.js';
import {SOURCE_ISLANDS,sourceContinuationIslandGeometryLibrary,sourceContinuationIslandPlacements,sourceContinuationIslandProps,sourceContinuationIslandDiagnostics} from '../src/render/source-continuation-islands.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';

const points=g=>{const out=[];for(let i=0;i<g.p.length;i+=3)out.push([g.p[i],g.p[i+1],g.p[i+2]]);return out;};

test('the Catch is one island in a universe that fills the void above and below',()=>{
  const d=sourceContinuationIslandDiagnostics();
  assert.ok(d.islands>=100,`${d.islands} islands`);
  assert.ok(d.above>=25&&d.below>=40,'islands stand both over and under the stack');
  assert.ok(d.nearest>=SOURCE_ISLANDS.inner&&d.farthest<=SOURCE_ISLANDS.outer);
  assert.ok(d.shells.every(n=>n>0));
});

test('no unreachable island enters built construction, or the stack view of the door island',()=>{
  const c=SOURCE_ISLANDS.clearance,rows=[...continuationSurfaces({chartId:0}).map(s=>({...s,minY:s.y-(s.thickness??.35),maxY:s.y})),...continuationSolids({chartId:0})];
  for(const isle of sourceContinuationIslandPlacements()){
    const r=isle.size*1.4;
    for(const s of rows)assert.ok(!(isle.x-r<s.maxX+c&&isle.x+r>s.minX-c&&isle.z-r<s.maxZ+c&&isle.z+r>s.minZ-c&&isle.y-isle.depth<s.maxY+c&&isle.y+isle.size*1.2>s.minY-c),
      `island ${isle.id} enters ${s.id}`);
  }
  // Rays from the stack's lowest balcony to the door island's gateposts stay clear of every island.
  const door=C.catch.finalDoor,eye=[-166,-12.6+1.62,-92],library=sourceContinuationIslandGeometryLibrary();
  for(const isle of sourceContinuationIslandPlacements())for(const z of [door.z-3.4,door.z,door.z+3.4])for(const y of [door.y,door.y+7]){
    const target=[door.x,y,z],dir=target.map((v,k)=>v-eye[k]),len=Math.hypot(...dir),u=Math.max(0,Math.min(1,((isle.x-eye[0])*dir[0]+(isle.y-eye[1])*dir[1]+(isle.z-eye[2])*dir[2])/len**2));
    const nearest=dir.map((v,k)=>eye[k]+v*u);
    assert.ok(Math.hypot(nearest[0]-isle.x,nearest[1]-isle.y,nearest[2]-isle.z)>isle.size*1.5+isle.depth,`island ${isle.id} hides the door`);
  }
  // Nor does any island stand in the sky above the door, seen from the stack.
  const doorYaw=Math.atan2(door.z+92,door.x+172);
  for(const isle of sourceContinuationIslandPlacements()){
    const yaw=Math.atan2(isle.z+92,isle.x+172),off=Math.abs(Math.atan2(Math.sin(yaw-doorYaw),Math.cos(yaw-doorYaw)));
    if(off<SOURCE_ISLANDS.doorLane.halfAngle+Math.max(...SOURCE_ISLANDS.shells.map(s=>Math.abs(s.sway))))assert.ok(Math.atan2(isle.y-eye[1],Math.hypot(isle.x+172,isle.z+92))<=SOURCE_ISLANDS.doorLane.floor,`island ${isle.id} rivals the door thread`);
  }
  assert.ok(Object.keys(library).some(k=>k.startsWith('catch-universe-far-')));
});

test('every reachable island hangs on a root beneath its own deck',()=>{
  const roots=points(sourceContinuationIslandGeometryLibrary()['catch-island-roots-stone']);
  for(const s of continuationSurfaces({phase:'catch'}).filter(s=>['island','seat-island','door-island'].includes(s.role))){
    const under=roots.filter(p=>p[0]>=s.minX-1e-6&&p[0]<=s.maxX+1e-6&&p[2]>=s.minZ-1e-6&&p[2]<=s.maxZ+1e-6);
    assert.ok(under.length>=8,s.id);
    assert.ok(Math.max(...under.map(p=>p[1]))<=s.y-(s.thickness??.35)+1e-6,`${s.id} root rises through its deck`);
    assert.ok(Math.min(...under.map(p=>p[1]))<s.y-6,`${s.id} root is too shallow to read`);
  }
  const depth=role=>{const s=continuationSurfaces({phase:'catch'}).find(s=>s.role===role);
    return s.y-Math.min(...roots.filter(p=>p[0]>=s.minX&&p[0]<=s.maxX&&p[2]>=s.minZ&&p[2]<=s.maxZ).map(p=>p[1]));};
  assert.ok(depth('door-island')>depth('island')*1.8,'the door island hangs deepest');
});

test('the universe belongs to the Catch frame only and sways slowly within the native budget',()=>{
  const catchState={...freshSourceContinuation(),phase:'catch',status:'active',level:3,feet:-12.6,x:-166,z:-92,yaw:Math.PI/2,pitch:0,elapsed:120};
  const frame=sourceContinuationRenderFrame(catchState),universe=frame.props.filter(p=>p.catchUniverse);
  assert.equal(universe.length,sourceContinuationIslandProps(catchState).length);
  assert.ok(universe.length>0&&universe.length<=12);
  assert.ok(frame.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
  const ii=sourceContinuationRenderFrame({...freshSourceContinuation(),phase:'wrong-return',status:'active'});
  assert.equal(ii.props.filter(p=>p.catchUniverse).length,0,'Source II keeps its own western view');
  const a=sourceContinuationIslandProps(catchState,{time:0}).find(p=>p.universeShell==='near'),b=sourceContinuationIslandProps(catchState,{time:10}).find(p=>p.universeShell==='near');
  const turn=Math.abs(Math.atan2(b.matrix[8],b.matrix[0])-Math.atan2(a.matrix[8],a.matrix[0]));
  assert.ok(turn>0&&turn<.1,'a perceptible but slow drift');
  for(let time=0;time<2000;time+=7)for(const p of sourceContinuationIslandProps(catchState,{time})){
    const shell=SOURCE_ISLANDS.shells.find(s=>s.id===p.universeShell);
    if(shell)assert.ok(Math.abs(Math.atan2(p.matrix[8],p.matrix[0]))<=Math.abs(shell.sway)+1e-9,'the sway never exceeds its cleared margin');
  }
  assert.equal(sourceContinuationIslandProps(catchState,{time:10,reducedMotion:true})[0].matrix[0],1,'reduced motion holds the universe still');
});
