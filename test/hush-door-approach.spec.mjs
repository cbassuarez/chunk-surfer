// Production floorplan, door runtime and prop collision (no native renderer).
import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { createPresenceNavigation } from '../src/game/presence-navigation.js';
import { doorOcclusionSource } from '../src/game/hush-door-hearing.js';
import { createHushAudioRuntime } from '../src/game/hush-audio-runtime.js';
import { emitAcousticEvent,resetAcousticEventsForTest,setAcousticClock } from '../src/audio/acoustic-events.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP);
const keys=new Set();let checks=0;
const nav=createPresenceNavigation({isSolid:FP.isSolid,canOccupy:PROPS.propCanOccupy,
  canStep:(ax,ay,bx,by)=>{checks++;return FP.canStep(ax,ay,bx,by,{keys});},
  planSize:FP.planSize,keys,maxVisited:1000});
const door=FP.doorState().find(d=>d.id==='b3-b2-service');
assert.deepEqual([door.cx,door.cy],[50.5,24.5]);
const source={x:door.cx,y:door.cy},hush={x:52,y:22};
assert.equal(FP.canStep(52,24,51,24,{keys}).why,'closed');
const before=checks,route=nav.findPath(hush,source),firstChecks=checks-before;
assert.deepEqual(route.at(-1),{x:52,y:24},'closed leaf: investigate the reachable side');
assert.equal(route.some(p=>p.x<=51&&p.x>=50&&p.y>=24&&p.y<=25),false,'route never enters the closed door');
assert.deepEqual(nav.reachableSoundTarget(hush,source),{x:52,y:24});
let at={x:52,y:24};
for(let i=0;i<8;i++) at=nav.resolveMove(at,source,.5);
assert.deepEqual(at,{x:52,y:24},'already at the approach, do not move through the shut leaf');
const prior=checks;for(let i=0;i<10;i++)nav.findPath(hush,source);
const repeatChecks=checks-prior;
assert.ok(repeatChecks<firstChecks*10,'cached route avoids repeating the search');

FP.setDoorOpen('b3-b2-service',true);
assert.deepEqual(nav.findPath(hush,source).at(-1),{x:50,y:24},'opening changes the cached goal to the real source');
FP.setDoorOpen('b3-b2-service',false);
assert.deepEqual(nav.findPath(hush,source).at(-1),{x:52,y:24},'closing restores a reachable-side approach');

// Exercise the whole ordinary body, not just the path: the short approach must
// advance past the player's y coordinate instead of declaring arrival early.
globalThis.document ||= {title:'Chunk Surfer',baseURI:'http://localhost/'};
globalThis.window ||= globalThis;
const realPerformance=globalThis.performance,realRandom=Math.random;
let now=3000;globalThis.performance={now:()=>now};Math.random=()=>.05;
const HUSH=await import('../src/game/presence.js');
try {
  HUSH.loadPresenceState({});HUSH.spawnAtCell(hush.x,hush.y,{gaitSeed:418});
  const state=HUSH.presenceState();state.gait.heading=Math.PI;state.gait.startHeading=Math.PI;state.gait.targetHeading=Math.PI;
  HUSH.offerSoundTarget({position:source,level:.6,confidence:.95,priority:.65,expiresAt:now+3840,reason:'ACOUSTIC_EVENT'});
  let crossed=false,contacts=0;const trace=[];
  for(let i=0;i<360;i++){
    now+=50;HUSH.updatePresence(.05,49,23,()=>contacts++,{navigation:nav,deferContact:true});
    assert.ok(nav.isWalkable({x:state.x,y:state.y}));
    if(state.y>23)crossed=true;
    if(i%20===0)trace.push([now,state.x,state.y,state.targetX,state.targetY,state.targetIsApproach,state.behaviorMode,state.gait.phase]);
  }
  assert.equal(crossed,true,`ordinary HUSH must cross the studio opening; trace=${JSON.stringify(trace)}`);
  assert.equal(contacts,0,'the wall separates this selected pass');

  // Keep the raw belief while resolving the sound onto different reachable
  // floor as the same door opens/closes; a new spawn cannot reuse this cache.
  now=3000;HUSH.loadPresenceState({});HUSH.spawnAtCell(hush.x,hush.y,{gaitSeed:418});
  HUSH.offerSoundTarget({position:source,level:.6,confidence:1,priority:.65,expiresAt:now+5000,reason:'ACOUSTIC_EVENT'});
  HUSH.updatePresence(0,49,23,()=>{},{navigation:nav});
  assert.deepEqual({x:state.soundTargetX,y:state.soundTargetY},source);
  assert.deepEqual({x:state.targetX,y:state.targetY},{x:52,y:24});
  FP.setDoorOpen('b3-b2-service',true);now+=1050;
  HUSH.updatePresence(0,49,23,()=>{},{navigation:nav});
  assert.deepEqual({x:state.targetX,y:state.targetY},{x:50,y:24},'opened door re-resolves the original belief');
  FP.setDoorOpen('b3-b2-service',false);now+=1050;
  HUSH.updatePresence(0,49,23,()=>{},{navigation:nav});
  assert.deepEqual({x:state.targetX,y:state.targetY},{x:52,y:24},'closing re-resolves to a safe approach');
  const saved=HUSH.capturePresenceTableauState(now);HUSH.beginPresenceTableau({x:52,y:22,snapshot:saved});
  FP.setDoorOpen('b3-b2-service',true);now+=100;HUSH.endPresenceTableau();
  HUSH.updatePresence(0,49,23,()=>{},{navigation:nav});
  assert.deepEqual({x:state.soundTargetX,y:state.soundTargetY},source,'tableau restores the original sound');
  assert.deepEqual({x:state.targetX,y:state.targetY},{x:50,y:24},'tableau restoration invalidates the cached approach');

  // Real south B3 entrance geometry + real door event + real hearing/runtime.
  // Door close is emitted as the production semantic record; actual leaf/audio
  // presentation and uninstructed visibility need native observation.
  resetAcousticEventsForTest();setAcousticClock(()=>now);
  FP.setDoorOpen('room5-corridor',false);
  HUSH.loadPresenceState({});HUSH.spawnAtCell(31,45,{gaitSeed:418});
  state.gait.heading=-Math.PI/2;state.gait.startHeading=-Math.PI/2;state.gait.targetHeading=-Math.PI/2;
  const portal=FP.doorState().find(d=>d.id==='room5-corridor');
  const sourceSpatial={roomId:'main_b3',floorId:'basement',position:{x:portal.cx,y:portal.cy}};
  const occlusionDb=(from,to)=>{
    const a=from.position,b=to.position,steps=Math.max(2,Math.min(40,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/1.5)));
    let blocked=0;for(let i=1;i<steps;i++){let t=i/steps;if(FP.isSolid(Math.round(a.x+(b.x-a.x)*t),Math.round(a.y+(b.y-a.y)*t)))blocked++;}
    return Math.min(36,blocked*2.8+FP.doorAcousticLossBetween(a,b));
  };
  const runtime=createHushAudioRuntime({presence:{publicSnapshot:()=>({...HUSH.publicSnapshot(),roomId:'main_b3',floorId:'basement'}),offerSoundTarget:HUSH.offerSoundTarget},
    playerSpatial:()=>({roomId:'main_b3',floorId:'basement',position:{x:29,y:37}}),
    occlusionSource:(event,listener)=>doorOcclusionSource(event,listener,id=>FP.doorState().find(d=>d.id===id)),
    occlusionDb,difficulty:()=>({values:{presencePressure:'standard'}}),clock:()=>now,random:()=>.05});
  emitAcousticEvent({kind:'door_close',source:{kind:'environment',id:`door:${portal.id}`},spatial:sourceSpatial,
    semantics:{audibleToHush:true,playerGenerated:false},provenance:{system:'door-runtime',doorId:portal.id}});
  const propagation=runtime.snapshot().lastPropagation;
  assert.ok(propagation.effectiveLevelDb>=-38,`door must actually be heard: ${JSON.stringify(propagation)}`);
  assert.equal(state.targetEventKind,'door_close');assert.equal(state.targetMemorySec,14);
  let seenPass=false;
  for(let i=0;i<280;i++){
    now+=50;HUSH.updatePresence(.05,29,37,()=>{},{navigation:nav,deferContact:true,
      lightSound:{active:true,position:{x:29,y:37},level:.3,confidence:.38,occlusionDb:0}});
    if(state.x<30)seenPass=true;
  }
  assert.ok(seenPass,`the real corridor gait crosses the peek aperture, final position ${state.x},${state.y}`);
  assert.equal(state.caughtCount,0);
  runtime.destroy();
} finally {HUSH.despawn();globalThis.performance=realPerformance;Math.random=realRandom;}
console.log(`production B3 closed-door approach passed; first search ${firstChecks} canStep checks, ten cached calls ${repeatChecks}`);
