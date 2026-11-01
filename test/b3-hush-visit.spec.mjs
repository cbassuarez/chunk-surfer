// Production plan, collision, ordinary HUSH gait, and the real hearing runtime.
// This is source proof; rendered, audible native perception remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {createPresenceNavigation} from '../src/game/presence-navigation.js';
import {createHushAudioRuntime} from '../src/game/hush-audio-runtime.js';
import {doorOcclusionSource} from '../src/game/hush-door-hearing.js';
import {emitAcousticEvent,resetAcousticEventsForTest,setAcousticClock,normalizeAcousticEvent} from '../src/audio/acoustic-events.js';
import {propagateNoise,isAudibleToHush} from '../src/audio/acoustic-propagation.js';
import {b3ClearRay} from '../src/render/studio-b3-glass.js';
import {B3_HUSH_VISIT,createB3HushVisit} from '../src/game/b3-hush-visit.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP);
const nav=createPresenceNavigation({isSolid:FP.isSolid,canOccupy:PROPS.propCanOccupy,
  canStep:(x,y,xx,yy)=>FP.canStep(x,y,xx,yy,{keys:new Set()}),planSize:FP.planSize,maxVisited:4000});
const realPerformance=globalThis.performance,realRandom=Math.random;
let now=3000;globalThis.performance={now:()=>now};Math.random=()=>.05;
globalThis.document||={title:'Chunk Surfer',baseURI:'http://localhost/'};globalThis.window||=globalThis;
const H=await import('../src/game/presence.js');
const viewer={x:38,y:18};
const eye=[19.25,-2.38,9.25];
const slice=FP.physicalRenderPlanFor(viewer.x,viewer.y);
const sight=p=>b3ClearRay(slice,eye,[(p.x+.5)*.5,-2.38,(p.y+.5)*.5],{propBlocks:(x,y,z)=>{
  const q=FP.logicalAtPhysical(x/.5,z/.5,{group:'basement',floor:-4});
  return !!q&&PROPS.tallBlockingPropAt(q.x,q.y,Math.max(0,y+4));
}});
const sourceSpatial=position=>({roomId:'main_b3',floorId:'b1',position});
const occlusionDb=(from,to)=>{
  const a=from.position,b=to.position,steps=Math.max(2,Math.min(40,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/1.5)));
  let blocked=0;for(let i=1;i<steps;i++){const t=i/steps;if(FP.isSolid(Math.round(a.x+(b.x-a.x)*t),Math.round(a.y+(b.y-a.y)*t)))blocked++;}
  return Math.min(36,blocked*2.8+FP.doorAcousticLossBetween(a,b));
};
const bleedInput=(position,intensity)=>({kind:'handling_noise',source:{kind:'environment',id:'b3-speaker-transmission'},
  spatial:sourceSpatial(position),acoustic:{levelDb:-52+64*.45*intensity},semantics:{audibleToHush:true,audibleToMonitor:false,playerGenerated:false},
  provenance:{system:'b3-speaker-bleed',physicalSource:'b3-control-speakers'}});
const doorInput=(portal,kind)=>({kind,source:{kind:'environment',id:`door:${portal.id}`},spatial:sourceSpatial({x:portal.cx,y:portal.cy}),
  acoustic:kind==='door_rattle'?{levelDb:-18}:undefined,semantics:{audibleToHush:true,playerGenerated:false},
  provenance:{system:'door-runtime',doorId:portal.id}});
const door=id=>FP.doorState().find(d=>d.id===id);
function canHearBleed(pos,intensity,point){
  const event=normalizeAcousticEvent(bleedInput(point,intensity));
  const listener=sourceSpatial(pos),propagation=propagateNoise({event,listener,occlusionDb:occlusionDb(event.spatial,listener)});
  return isAudibleToHush(propagation,{hearingThresholdDb:-38});
}
function setup({closed=false,wedge=false}={}){
  now=3000;H.despawn();H.loadPresenceState({});resetAcousticEventsForTest();setAcousticClock(()=>now);
  FP.setDoorOpen('room5-corridor',!closed);
  let controller,starts=0,completed=0,closedCount=0,rattleCount=0,realAudioCount=0,heard=[],startSources=[],insideEntry=null;
  const hearing=createHushAudioRuntime({presence:{publicSnapshot:()=>({...H.publicSnapshot(),roomId:'main_b3',floorId:'b1'}),offerSoundTarget:H.offerSoundTarget},
    playerSpatial:()=>sourceSpatial(viewer),occlusionSource:(event,listener)=>doorOcclusionSource(event,listener,door),
    occlusionDb,difficulty:()=>({values:{presencePressure:'standard'}}),clock:()=>now,random:()=>.05,
    onHeard:payload=>{heard.push(payload.event.kind);controller?.heard(payload);}});
  controller=createB3HushVisit({presence:H,navigation:nav,canSpawnHidden:point=>!sight(point),canHearBleed,
    emitBleed:({position,intensity})=>emitAcousticEvent(bleedInput(position,intensity)),doorState:id=>{
      const found=door(id);return wedge?{...found,wedge:true}:found;
    },
    closeDoor:id=>{closedCount++;return FP.runDoorCloserCycle(id)},
    // Production integration must play a real positional rattle and emit the
    // matching event together. Here the recorded callback proves both requests.
    rattleDoor:portal=>{rattleCount++;realAudioCount++;emitAcousticEvent(doorInput(portal,'door_rattle'));},
    onStarted:({spawned})=>{starts++;startSources.push(spawned);},onCompleted:()=>{completed++;}});
  function tick(seconds,{signal=1,eligible=true,suspended=false,inBooth=true}={}){
    let entrySeen=false,exitSeen=false,previous=null,entered=false;
    for(let i=0;i<Math.round(seconds/.05);i++){
      now+=50;
      controller.step({dt:.05,eligible,suspended,inBooth,signal,player:viewer});
      for(const e of FP.tickDoors(.05,{playerX:viewer.x,playerY:viewer.y}))if(e.type==='closed'){
        const portal=door(e.id);realAudioCount++;emitAcousticEvent(doorInput(portal,'door_close'));
      }
      if(!suspended)H.updatePresence(.05,viewer.x,viewer.y,()=>{},{navigation:controller.navigation(),deferContact:true});
      if(!H.isActive())continue;
      const p=H.presenceState();assert.ok(nav.isWalkable(p),'HUSH remains in valid navigable cells');
      if(controller.snapshot().phase==='inside'&&!insideEntry)insideEntry={x:p.x,y:p.y};
      if(previous&&previous.y>=38&&p.y<38){entered=true;entrySeen ||= sight(p);}
      if(entered&&previous&&previous.y<38&&p.y>=38)exitSeen ||= sight(p);
      previous={x:p.x,y:p.y};
    }
    return{entrySeen,exitSeen,entered};
  }
  return{controller,hearing,tick,get starts(){return starts},get completed(){return completed},get closedCount(){return closedCount},
    get rattleCount(){return rattleCount},get realAudioCount(){return realAudioCount},get insideEntry(){return insideEntry},heard,startSources};
}

function waitForDoor(f,kind){
  for(let seconds=0;seconds<75&&H.presenceState().targetEventKind!==kind;seconds++)f.tick(1);
  assert.equal(H.presenceState().targetEventKind,kind,'ordinary hearing accepts the real door cue');
}

test('ordinary HUSH hears speaker transmission, enters and exits through the visible B3 mouth after the real closer',()=>{
  const f=setup();try{
    const result=f.tick(50);
    assert.ok(result.entrySeen,'the entering body crosses a clear north-window sightline');
    assert.ok(result.exitSeen,'the returning body crosses that same real aperture');
    assert.equal(f.starts,1);assert.deepEqual(f.startSources,[true],'newly spawned body is identified');assert.equal(f.completed,1,'persist only after the actual passage');assert.equal(f.closedCount,1);assert.equal(f.rattleCount,0);assert.equal(f.realAudioCount,1);
    assert.ok(f.heard.includes('door_close'),'ordinary hearing receives the real door-close event');
    assert.equal(f.controller.snapshot().phase,'done');
  }finally{f.hearing.destroy();H.despawn();}
});

test('an already shut or wedged door rattles audibly without being opened',()=>{
  for(const options of [{closed:true},{wedge:true}]){
    const f=setup(options);try{
      const before=door('room5-corridor').state,result=f.tick(50);
      assert.ok(result.entrySeen&&result.exitSeen,'real HUSH follows the heard rattle in and out');
      assert.equal(f.closedCount,0);assert.equal(f.rattleCount,1);assert.equal(f.realAudioCount,1);
      assert.equal(door('room5-corridor').state,before,'no door endpoint was changed');
      assert.ok(f.heard.includes('door_rattle'));
    }finally{f.hearing.destroy();H.despawn();}
  }
});

test('no spawn is forced through silence, blocked hearing, pause, detached scenes or a visible spawn',()=>{
  const h={isActive:()=>false,spawnAtCell:()=>{throw Error('must not spawn');}};
  const c=createB3HushVisit({presence:h,navigation:nav,canSpawnHidden:()=>true,canHearBleed:()=>false});
  for(const frame of [{eligible:true,inBooth:true,signal:0},{eligible:true,inBooth:true,signal:1,suspended:true},
    {eligible:false,inBooth:true,signal:1},{eligible:true,inBooth:true,signal:1}])assert.equal(c.step(frame).phase,'idle');
  const visible=createB3HushVisit({presence:h,navigation:nav,canSpawnHidden:()=>false,canHearBleed:()=>true});
  assert.equal(visible.step({eligible:true,inBooth:true,signal:1}).phase,'idle');
});

test('a pre-existing HUSH is never repositioned and stronger real sound still replaces the door belief',()=>{
  const f=setup();try{
    H.spawnAtCell(31,40,{gaitSeed:418});const original={x:H.presenceState().x,y:H.presenceState().y};
    f.controller.step({dt:.05,eligible:true,inBooth:true,signal:1,player:viewer});
    assert.deepEqual(f.startSources,[false],'existing body is not reported as a spawn');
    assert.deepEqual({x:H.presenceState().x,y:H.presenceState().y},original,'startup does not move an existing actor');
    waitForDoor(f,'door_close');const h=H.presenceState();
    assert.equal(h.targetMemorySec,35);
    now+=4000;
    assert.equal(H.offerSoundTarget({position:{x:28,y:44},level:.9,confidence:.9,priority:1,expiresAt:now+2500,reason:'NEW_SOUND'}),true);
    assert.equal(h.targetReason,'NEW_SOUND');assert.equal(h.targetMemorySec,0,'the sound does not inherit the door extension');
  }finally{f.hearing.destroy();H.despawn();}
});

test('a dropped Room 5 latch belief may be heard once again without a forced target',()=>{
  const f=setup({closed:true});try{
    waitForDoor(f,'door_rattle');
    assert.equal(f.rattleCount,1,'the original rattle is a physical world cue');
    H.setDirectorIntent('PLAY');
    f.tick(6);
    assert.equal(f.rattleCount,2,'one further physical rattle follows a dropped belief');
    assert.ok(f.heard.filter(kind=>kind==='door_rattle').length>=2,'ordinary hearing evaluates the retry');
    f.tick(45);
    assert.equal(f.rattleCount,2,'the retry is bounded');
  }finally{f.hearing.destroy();H.despawn();}
});

test('a later sound or contact prevents a latch retry',()=>{
  for(const interference of ['sound','contact']){
    const f=setup({closed:true});try{
      waitForDoor(f,'door_rattle');const state=H.presenceState();
      now+=4000;
      if(interference==='sound'){
        assert.equal(H.offerSoundTarget({position:{x:28,y:44},level:.9,confidence:.9,priority:1,expiresAt:now+2500,reason:'NEW_SOUND'}),true);
        H.setDirectorIntent('PLAY');
      }else{
        state.lastCatchAt=now;state.hasTarget=false;state.pendingContact=null;
      }
      f.tick(6);
      assert.equal(f.rattleCount,1,`${interference} cannot be overwritten by the encounter`);
    }finally{f.hearing.destroy();H.despawn();}
  }
});

test.after(()=>{H.despawn();globalThis.performance=realPerformance;Math.random=realRandom;});

test('a distant existing body is never recruited before it can hear and reach the bleed',()=>{
  let offered=0,started=0;
  const presence={isActive:()=>true,presenceState:()=>({x:5,y:5})};
  const navigation={isWalkable:()=>true,findPath:()=>[{}],resolveMove:()=>null};
  const c=createB3HushVisit({presence,navigation,canHearBleed:()=>false,
    emitBleed:()=>offered++,onStarted:()=>started++});
  assert.equal(c.step({dt:.1,eligible:true,inBooth:true,signal:1}).phase,'idle');
  assert.equal(offered,0);assert.equal(started,0);
});

test('an expired investigation can retry later without relocating an existing body',()=>{
  let started=0;
  const state={x:31,y:40};
  const presence={isActive:()=>true,presenceState:()=>state,spawnAtCell:()=>{throw Error('an active actor must not respawn');}};
  const navigation={isWalkable:()=>true,findPath:()=>[{}],resolveMove:()=>null};
  const c=createB3HushVisit({presence,navigation,canHearBleed:()=>true,emitBleed:()=>{},onStarted:()=>started++});
  for(let i=0;i<363;i++)c.step({dt:.25,eligible:true,inBooth:true,signal:1});
  assert.equal(started,2,'after timeout the live speaker can provoke a fresh ordinary hearing');
  assert.deepEqual(state,{x:31,y:40},'neither attempt moves the actor');
});
