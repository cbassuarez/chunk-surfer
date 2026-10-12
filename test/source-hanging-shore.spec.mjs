import assert from 'node:assert/strict';
import { SOURCE_HANGING_SHORE as S, SOURCE_SHORE_DIRECT_METRES, SOURCE_SHORE_DIRECT_SECONDS, sourceShoreBounds } from '../src/data/source-hanging-shore.js';
import { createSourceSpaceRuntime, SOURCE_APPROACH_PACE } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET as P } from '../src/game/chunk-surf-god.js';
import { reduceChunkSurf,normalizeChunkSurfState } from '../src/game/chunk-surf-state.js';
import { MOVE_MS } from '../src/config.js';
const make=()=>{const b=buildChunkSurfGodPreset(P.LANDING,{seed:4417});return createSourceSpaceRuntime({initialState:reduceChunkSurf(b.state,{type:'SOURCE_LANDING_DOOR_OPENED'})});};
const point=(r,x,z)=>({x:r.state().landscapeOrigin.x+x/.5,y:r.state().landscapeOrigin.y+z/.5,facing:0});
function walk(r,at,to,dt=1/60){const m=r.geometry.canStep(at.x,at.y,to.x,to.y);if(m.ok){const e=r.onStep(at,to);assert.equal(e?.relocate,undefined,'shore must never relocate the body');if(e?.position)assert.equal(e.position.facing,to.facing,'entering Source must preserve the chosen view direction');r.setPlayerPosition(to);at={...to};}r.tick(dt,{px:at.x,py:at.y,facing:at.facing});return {at,move:m};}
function reach(r,at,x,z){const target=point(r,x,z);for(let i=0;i<1000&&Math.hypot(target.x-at.x,target.y-at.y)>.02;i++){const d=Math.hypot(target.x-at.x,target.y-at.y),step=Math.min(.16,d);const next={...at,x:at.x+(target.x-at.x)/d*step,y:at.y+(target.y-at.y)/d*step};const result=walk(r,at,next);assert.equal(result.move.ok,true,`cleft blocked at ${JSON.stringify(next)}: ${result.move.why}`);at=result.at;assert.equal(r.geometry.renderedFloorAt(),4.2,'the cleft and Source ground must meet without a height snap');}assert.ok(Math.hypot(target.x-at.x,target.y-at.y)<=.02,'the free walk never reached its destination');return at;}
assert.equal(SOURCE_SHORE_DIRECT_METRES,374);
assert.ok(SOURCE_SHORE_DIRECT_SECONDS>=75&&SOURCE_SHORE_DIRECT_SECONDS<=80);
assert.ok(Math.abs(.5/(MOVE_MS*SOURCE_APPROACH_PACE/1000)-4.8)<1e-9);
const bounds=sourceShoreBounds({x:20,y:-252});assert.equal(bounds.lift.minX,10);assert.equal(bounds.bank.frontZ,-516);
// Real held-W travel reaches the receiving deck without a sideways adjustment.
const r=make();let at=point(r,4,-7.75);r.setPlayerPosition(at);
for(let i=0;i<4700;i++)({at}=walk(r,at,{...at,y:at.y-.16}));
assert.equal(r.sourceShoreFrame().lift.boarded,true,'straight W never boarded the deck');
assert.equal(r.state().firstLiftCompleted,false,'a walk quota revealed Source');
assert.equal(r.sourceEmergencyLightingFrame().active,false);
assert.equal(r.sourceFlashlightFrame().profile,'shore');
assert.equal(r.propInstances(at.x,at.y,{reducedMotion:true}).some(p=>p.sourceVoidHorizon||p.sourceStructure),false);
// The rear safety bar keeps held forward on a moving lift, without locking input.
for(let i=0;i<500;i++)({at}=walk(r,at,{...at,y:at.y-.16}));
assert.equal(r.sourceShoreFrame().lift.floor,4.2);
assert.equal(r.sourceShoreFrame().surface,'ledge');
assert.equal(r.state().firstLiftCompleted,false,'the upper ledge itself entered Source');
assert.equal(r.traversalFrame().locksMovement,false);
const upperArrival=structuredClone(r.state());
// Free walk along the ledge and through one offset, open-sky cleft. The baffle
// conceals the field until the actual inner release, without taking the view.
const walkTo=(x,z)=>{at=reach(r,at,x,z);};
at={...at,facing:2};r.setPlayerPosition(at);
walkTo(4,-388);
const cliff=point(r,4,-390.5);
assert.equal(r.geometry.canStep(at.x,at.y,cliff.x,cliff.y).ok,false,'the lift-side cliff is physical, not a transparent shortcut');
walkTo(10,-388);walkTo(10,-392);
assert.equal(r.state().firstLiftCompleted,false,'the outer cleft mouth itself entered Source');
walkTo(9,-392.7);
assert.equal(r.state().firstLiftCompleted,true,'the world stayed hidden after the physical tongue cleared');
walkTo(4,-396);
assert.equal(r.state().firstLiftCompleted,true);
walkTo(4,-399);
assert.equal(r.sourceShoreFrame().proper,true);
assert.equal(r.sourceShoreFrame().visible,true,'bank disappeared at entry');
walkTo(4,-396);walkTo(10,-392);
assert.equal(r.sourceShoreFrame().active,true,'return into the outer cleft did not restore shore');
walkTo(10,-388);walkTo(4,-388);assert.equal(r.sourceShoreFrame().surface,'ledge');
// The west half is freely walkable: its already clear view cannot wait for the
// centreline's turn or an invisible depth quota before Source appears.
for(const [x,z]of [[7,-390.3],[8,-391],[9,-392.2]]){
  const west=createSourceSpaceRuntime({initialState:structuredClone(upperArrival)});
  let w={...point(west,4,-388),facing:3};west.setPlayerPosition(w);
  w=reach(west,w,x,-388);w=reach(west,w,x,z);
  assert.equal(west.state().firstLiftCompleted,true,`the clear west-mouth view at ${x},${z} stayed withheld`);
  assert.equal(west.sourceShoreFrame().proper,true);
  w=reach(west,w,x,-388);
  assert.equal(west.sourceShoreFrame().active,true,'retreat through the mouth must restore the same shore');
}
// Under the hanging hull and deck: dependable lower support, no magical boarding.
const under=make();let u=point(under,4,-384);under.setPlayerPosition(u);
assert.equal(under.geometry.floorAt(u.x,u.y),0);assert.equal(under.sourceShoreFrame().lift.boarded,false);
for(let i=0;i<120;i++)under.tick(1/60,{px:u.x,py:u.y,facing:0});
assert.ok(under.sourceShoreFrame().lift.floor>=2.14,'deck crushed an operator underneath');
const edge=make();const edgeAt=point(edge,S.lift.maxX-.1,(S.lift.minZ+S.lift.maxZ)/2);edge.setPlayerPosition(edgeAt);
edge.tick(8,{px:edgeAt.x,py:edgeAt.y,facing:0});
assert.ok(edge.sourceShoreFrame().lift.floor>=2.14,'deck edge descended through the body');
assert.equal(edge.sourceShoreFrame().lift.boarded,false,'partial edge overlap incorrectly boarded');
const slabBuilt=buildChunkSurfGodPreset(P.LANDING,{seed:4417});
const slab=createSourceSpaceRuntime({initialState:{...slabBuilt.state,sourceShore:{phase:'lowering',floor:1,bodyFloor:0}}});
const slabFrom=point(slab,-1,-384),slabTo=point(slab,.5,-384);slab.setPlayerPosition(slabFrom);
assert.equal(slab.geometry.canStep(slabFrom.x,slabFrom.y,slabTo.x,slabTo.y).ok,false,'body walked through a half-lowered deck edge');
u=point(under,0,-395);under.setPlayerPosition(u);assert.equal(under.geometry.floorAt(u.x,u.y),0);assert.equal(under.state().firstLiftCompleted,false);
// Walking circles has no credit. Looking back changes neither fixed volume.
const circle=make();let c=point(circle,4,-30);circle.setPlayerPosition(c);const fixed=circle.sourceShoreFrame().bank;
for(let i=0;i<1200;i++){const next={...c,x:c.x+(i%2?.8:-.8),facing:i%4};({at:c}=walk(circle,c,next));}
assert.equal(circle.state().firstLiftCompleted,false);assert.deepEqual(circle.sourceShoreFrame().bank,fixed);
// Exposure recovers while stationary and survives reload; no re-entry flash.
const e=make();let v=point(e,4,-8.25);e.setPlayerPosition(v);({at:v}=walk(e,v,{...v,y:v.y-2}));
for(let i=0;i<150;i++)e.tick(1/60,{px:v.x,py:v.y,facing:2});assert.equal(e.sourceShoreFrame().whiteout,1);
const blindReload=createSourceSpaceRuntime({initialState:normalizeChunkSurfState(JSON.parse(JSON.stringify(e.state())))});blindReload.setPlayerPosition(v);
assert.equal(blindReload.sourceShoreFrame().whiteout,1);assert.equal(blindReload.sourceShoreFrame().exposureElapsed,e.sourceShoreFrame().exposureElapsed);
blindReload.tick(30,{px:v.x,py:v.y,facing:2});assert.equal(blindReload.sourceShoreFrame().whiteout,0,'long resumed frame did not recover exposure');
e.tick(10,{px:v.x,py:v.y,facing:2});e.tick(2,{px:v.x,py:v.y,facing:2});assert.equal(e.sourceShoreFrame().whiteout,0);
const reload=createSourceSpaceRuntime({initialState:normalizeChunkSurfState(JSON.parse(JSON.stringify(e.state())))});reload.setPlayerPosition(v);assert.equal(reload.sourceShoreFrame().whiteout,0);
// Save mid-rise preserves body height, deck height, phase and facing.
const riding=make();let q=point(riding,4,-381.5);riding.setPlayerPosition(q);riding.tick(7,{px:q.x,py:q.y,facing:3});({at:q}=walk(riding,q,point(riding,4,-383)));
riding.tick(2,{px:q.x,py:q.y,facing:3});const before=riding.sourceShoreFrame();assert.equal(before.lift.phase,'rising');
const restored=createSourceSpaceRuntime({initialState:JSON.parse(JSON.stringify(riding.state()))});restored.setPlayerPosition({...q,facing:3});assert.equal(restored.sourceShoreFrame().lift.floor,before.lift.floor);assert.equal(restored.geometry.renderedFloorAt(),before.bodyFloor);
// A voluntary step off loses height, then safely recalls the lift without damage.
q=point(riding,-.5,-383);riding.setPlayerPosition(q);riding.tick(2,{px:q.x,py:q.y,facing:3});assert.equal(riding.geometry.renderedFloorAt(),0);riding.tick(8,{px:q.x,py:q.y,facing:3});assert.equal(riding.sourceShoreFrame().lift.floor,0);
console.log('Hanging Shore: real distance, free movement, concealed entry, lift recovery and reload passed');
