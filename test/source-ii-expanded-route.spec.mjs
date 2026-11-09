import test from 'node:test';
import assert from 'node:assert/strict';
import {JOURNEY_PLACES,JOURNEY_ROUTES,JOURNEY_JOINT_SOLIDS,JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';
import {SOURCE_CONTINUATION as C,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation,stepSourceContinuation,sourceContinuationCanOccupy} from '../src/game/source-continuation.js';
import {continuationFreeBody} from '../src/game/source-continuation-physics.js';
import {continuationSupportedPath,continuationWalkSegment} from '../src/game/source-continuation-hush.js';
import {sceneWalkSpeed} from '../src/game/locomotion.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const at=(x,z,feet,chartId)=>({x,z,feet,chartId,phase:'wrong-return',level:0});
function localState(p){
 const state=freshSourceContinuation({runId:'expanded-ii-route'});
 Object.assign(state,p,{status:'active',lastSafe:{...p},recoveryAnchor:{...p,kind:'landing',supportId:'focused-local-start',earnedAt:0}});
 state.hush.active=false;state.hush.arrival=null;
 return state;
}
function walk(state,target,events){
 const dt=1/30,speed=sceneWalkSpeed(C.place,true);
 for(let frame=0;frame<2400;frame++){
  const dx=target.x-state.x,dz=target.z-state.z,d=Math.hypot(dx,dz);
  if(d<.025)return state;
  const result=stepSourceContinuation(state,{dt,forward:Math.min(1,d/(speed*dt)),run:true,look:{yaw:Math.atan2(dx,-dz)}});
  state=result.state;events.push(...result.events);
  assert.equal(state.fall,null,`route lost footing in chart ${state.chartId} at ${state.x},${state.z}`);
  assert.equal(state.recovery,null,'an ordinary route cannot depend on rescue');
  assert.equal(state.chartId,target.chartId,'the court walk cannot touch an unrelated fold');
 }
 assert.fail(`walk stopped at ${state.x},${state.z}; target ${target.x},${target.z}`);
}
function segmentContains(a,b,p){
 return a.chartId===p.chartId&&b.chartId===p.chartId&&Math.abs(distance(a,p)+distance(p,b)-distance(a,b))<1e-6;
}
function mainBetween(a,b){
 const route=JOURNEY_ROUTES.main;
 const first=route.findIndex((p,i)=>i+1<route.length&&segmentContains(p,route[i+1],a));
 const last=route.findIndex((p,i)=>i+1<route.length&&segmentContains(p,route[i+1],b));
 assert.ok(first>=0&&last>=first,'both branch ends must belong to the same forward main walk');
 return[a,...route.slice(first+1,last+1),b];
}

test('each outward chart has a complete optional court loop that ordinary running can walk in both directions',()=>{
 assert.deepEqual(JOURNEY_PLACES.map(p=>p.chartId),[1,2,3,4]);
 for(const place of JOURNEY_PLACES){
  const branch=JOURNEY_ROUTES[place.id],main=mainBetween(branch[0],branch.at(-1));
  // Start at this local junction to isolate map traversal. This is not an
  // assertion about discovering the route from the chapter entrance.
  const closed=[...branch,...main.toReversed().slice(1)];
  assert.ok(branch.slice(1).reduce((m,p,i)=>m+distance(branch[i],p),0)>40,'the alternative crosses an actual court');
  for(const route of[closed,closed.toReversed()]){
   let state=localState(route[0]);const events=[];
   for(const target of route.slice(1))state=walk(state,target,events);
   assert.ok(distance(state,route[0])<.025,place.name);
   assert.equal(events.some(e=>['capture','fold','space-wrap'].includes(e.type)),false,'the complete loop stays in its own supported chart');
  }
 }
});

test('running shoulders have useful room on the former thin routes and both sides of every new branch',()=>{
 for(const p of[at(-107,-30,16.8,1),at(-151,-50,8.4,2),at(-177,-65,0,3),at(-146,-85,8.4,4)]){
  const state=localState(p);
  for(const dx of[-1.7,0,1.7]){
   const q={...p,x:p.x+dx};
   assert.ok(continuationSupportAt(q.x,q.z,q),`main floor shoulder chart ${q.chartId}`);
   assert.ok(continuationFreeBody(q,state),'a main shoulder must fit the standing body');
  }
 }
 for(const place of JOURNEY_PLACES)for(let i=1;i<place.loop.length;i++){
  const a=place.loop[i-1],b=place.loop[i],length=distance(a,b),nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
  const steps=Math.ceil(length/.7);
  for(let k=0;k<=steps;k++)for(const offset of[-1.25,0,1.25]){
   const p={...a,x:a.x+(b.x-a.x)*k/steps+nx*offset,z:a.z+(b.z-a.z)*k/steps+nz*offset};
   assert.ok(continuationSupportAt(p.x,p.z,p),`${place.name}: supported branch shoulder`);
   assert.ok(continuationFreeBody(p,localState(p)),`${place.name}: standing capsule clearance`);
  }
 }
});

test('every shelter is reachable and its physical architecture is actually submitted around a clear lookout',()=>{
 for(const place of JOURNEY_PLACES){
  const state=localState(place.refuge),frame=sourceContinuationRenderFrame({...state,pitch:-.1});
  assert.ok(sourceContinuationCanOccupy(state.x,state.z,state));
  assert.ok(continuationFreeBody(state,state),'the refuge centre fits the full body beneath any canopy');
  for(let i=1;i<place.neck.length;i++)assert.ok(continuationWalkSegment(place.neck[i-1],place.neck[i]),'the shelter has a real broad approach');
  const path=continuationSupportedPath(place.refuge,place.loop[0],state);
  assert.ok(path?.length>1,'HUSH/recovery navigation can reconnect the refuge to the real walk');
  const structure=JOURNEY_JOINT_SOLIDS.filter(s=>s.role==='journey-architecture'&&s.chartId===place.chartId);
  assert.ok(structure.length>=6);
  for(const solid of structure){
   assert.ok(frame.canonicalProps.some(p=>p.physicalKind==='solid'&&p.descriptorId===solid.id),`${solid.id}: visible mesh shares collision geometry`);
  }
 }
});

test('expanded courts retain the exact four reciprocal folds, cross-links and Catch threshold',()=>{
 assert.deepEqual(JOURNEY_PORTALS.map(p=>[p.id,p.fromChart,p.toChart]),[
  ['first-return',0,1],['upper-walk',1,2],['under-return',2,3],['last-return',3,4],['catch-closure',4,0],['twisted-shortcut',3,1],['earlier-upper-return',2,0],
 ]);
 assert.deepEqual(JOURNEY_PORTALS[4].a.center,[-152,10,-92]);
 for(const z of[-94.2,-89.8])assert.equal(continuationSupportAt(-152.1,z,at(-152.1,z,8.4,4)),null,'the broad corridor must taper before its fold instead of providing a walk around the frame');
 for(const place of JOURNEY_PLACES){
  assert.ok(continuationSupportAt(place.arrival.x,place.arrival.z,place.arrival),'the previous fold still arrives onto actual floor');
  if(place.chartId===4)assert.ok(place.loop.every(p=>p.z>=-61),'the optional court rejoins before the moving corridor');
 }
});
