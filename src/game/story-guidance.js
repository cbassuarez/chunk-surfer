// Mandatory story guidance, kept separate from the room the player marked.
//
// The field-case room waypoint is a player decision and is serialized by
// objectives.js. Story targets are consequences of already-serialized state:
// prologue flags, the chapel/tower reducer, and the live finale route. Deriving
// them prevents a temporary chapter objective from destroying the player's
// mark, and gives the HUD, map and 3D renderer one shared target contract.

import { CHAPEL_TOWER_PHASE, normalizeChapelTowerState } from './chapel-tower-state.js';

export const STORY_GUIDANCE_ANCHORS = Object.freeze({
  van: Object.freeze({ x:63.6, y:208.0 }),
  lookBench: Object.freeze({ x:53.25, y:205.0 }),
  lodge: Object.freeze({ x:75.7, y:214.0 }),
  page6: Object.freeze({ x:138, y:27 }),
  rekeyLedger: Object.freeze({ x:92.25, y:12.25 }),
  keyCabinet: Object.freeze({ x:96.25, y:9.45 }),
  chapelDoor: Object.freeze({ x:93, y:58 }),
  chapelScreen: Object.freeze({ x:92, y:67 }),
  tenorRope: Object.freeze({ x:25+Math.cos(-Math.PI/2+7*Math.PI/4)*4, y:158+Math.sin(-Math.PI/2+7*Math.PI/4)*4 }),
  naveExit: Object.freeze({ x:105, y:154 }),
});

const target = (id, label, authored, extra={}) => Object.freeze({
  id,
  label,
  coordinateSpace:'authored',
  authored:Object.freeze({ x:Number(authored.x), y:Number(authored.y) }),
  required:true,
  ...extra,
});

export const STORY_TARGET = Object.freeze({
  van: target('story:yard-van','GET THE KIT FROM THE VAN',STORY_GUIDANCE_ANCHORS.van,{kind:'prop',propId:'yard-van'}),
  lookBench: target('story:yard-look-bench','TURN AROUND AND SIT ON THE SHELTER BENCH',STORY_GUIDANCE_ANCHORS.lookBench,{kind:'prop',propId:'yard-look-bench'}),
  lodge: target('story:lodge','CHECK IN WITH THE GUARD',STORY_GUIDANCE_ANCHORS.lodge,{kind:'prop',propId:'yard-booth'}),
  page6: target('story:page-6','FIND PAGE 6',STORY_GUIDANCE_ANCHORS.page6,{kind:'prop',propId:'loose-page:page-6'}),
  readPage6: Object.freeze({id:'story:read-page-6',label:'READ PAGE 6 IN THE BAG',kind:'interface',required:true,point:null}),
  rekeyLedger: target('story:rekey-ledger','READ THE REKEY LEDGER',STORY_GUIDANCE_ANCHORS.rekeyLedger,{kind:'prop',propId:'box-office-ledger'}),
  keyCabinet: target('story:key-cabinet','SELECT THE CHAPEL KEY',STORY_GUIDANCE_ANCHORS.keyCabinet,{kind:'prop',propId:'box-office-key-ring-c17'}),
  chapelDoor: target('story:chapel-c17','OPEN THE C-17 CHAPEL DOOR',STORY_GUIDANCE_ANCHORS.chapelDoor,{kind:'door',doorId:'chapel-c17'}),
  chapelScreen: target('story:chapel-screen','ENTER SOURCE AT THE INNER SCREEN',STORY_GUIDANCE_ANCHORS.chapelScreen,{kind:'prop',propId:'chapel-inner-screen'}),
  followSignal: target('story:follow-signal','FOLLOW THE SIGNAL INTO THE TOWER',STORY_GUIDANCE_ANCHORS.chapelScreen,{kind:'prop',propId:'chapel-inner-screen'}),
  tenor: target('story:tenor-rope','TAKE THE TENOR ROPE',STORY_GUIDANCE_ANCHORS.tenorRope,{kind:'prop',propId:'tower-rope-8'}),
  ringTenor: target('story:ring-tenor','RING STEDMAN ON THE TENOR',STORY_GUIDANCE_ANCHORS.tenorRope,{kind:'prop',propId:'tower-rope-8'}),
  descend: target('story:descend-nave','DESCEND TO THE NAVE',STORY_GUIDANCE_ANCHORS.naveExit,{kind:'position'}),
  fifthTake: target('story:fifth-take','ROLL THE FIFTH TAKE',STORY_GUIDANCE_ANCHORS.chapelScreen,{kind:'prop',propId:'chapel-inner-screen'}),
});

function runtimeTarget(id,label,point,extra={}){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  return Object.freeze({id,label,coordinateSpace:'runtime',point:Object.freeze({x:Number(point.x),y:Number(point.y)}),required:true,...extra});
}

function finaleTarget(escape){
  if(!escape)return null;
  if(escape.kind==='surfaced')return runtimeTarget('story:ending-surfaced','CARRY HIM TO THE MAIN ENTRANCE',escape.exitCell,{kind:'position'});
  if(escape.kind==='stay')return runtimeTarget('story:ending-stay','PUT YOUR HAND ON THE INNER SCREEN',escape.screenCell,{kind:'position',propId:'chapel-inner-screen'});
  if(escape.kind==='inversion'){
    if(escape.stage==='rescue'||escape.stage==='at-door')return runtimeTarget('story:ending-rescue','REACH THE MAIN ENTRANCE',escape.rescueCell,{kind:'position'});
    return runtimeTarget('story:ending-grey-door','REACH THE GREY DOOR',escape.guidanceDoorCell||escape.doorCell,{kind:'position'});
  }
  return null;
}

function selectedRoomTarget(selectedWaypoint,selectedLabel=''){
  if(!selectedWaypoint||!Number.isFinite(selectedWaypoint.x)||!Number.isFinite(selectedWaypoint.y))return null;
  const roomId=String(selectedWaypoint.roomId||'');
  if(!roomId)return null;
  return runtimeTarget(`room:${roomId}`,String(selectedLabel||roomId).toUpperCase(),selectedWaypoint,{kind:'room',roomId,playerSelected:true});
}

export function resolveStoryGuidanceTarget({
  prologueDone=false,
  bagTaken=false,
  benchVisited=false,
  tower=null,
  escape=null,
  readPageIds=[],
  chapelClueLog=false,
  chapelClueLedger=false,
  hasChapelKey=false,
  selectedWaypoint=null,
  selectedLabel='',
}={}){
  if(!prologueDone){
    if(!bagTaken)return STORY_TARGET.van;
    if(!benchVisited)return STORY_TARGET.lookBench;
    return STORY_TARGET.lodge;
  }
  const ending=finaleTarget(escape);if(ending)return ending;

  const state=normalizeChapelTowerState(tower);
  if(state.phase===CHAPEL_TOWER_PHASE.SOURCE_READY){
    if(state.corridorDiscovered)return STORY_TARGET.chapelScreen;
    const read=new Set(Array.isArray(readPageIds)?readPageIds:[]);
    if(!chapelClueLog)return read.has('page-6')?STORY_TARGET.readPage6:STORY_TARGET.page6;
    if(!chapelClueLedger)return STORY_TARGET.rekeyLedger;
    if(!hasChapelKey)return STORY_TARGET.keyCabinet;
    return STORY_TARGET.chapelDoor;
  }
  if(state.phase===CHAPEL_TOWER_PHASE.TRANSITION_READY)return STORY_TARGET.followSignal;
  if(state.phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE){
    if(!state.tenorRopeTaken)return STORY_TARGET.tenor;
    if(!state.pealCompleted)return STORY_TARGET.ringTenor;
    return null;
  }
  if(state.phase===CHAPEL_TOWER_PHASE.TOWER_CLEARED)return state.chapelReached?STORY_TARGET.fifthTake:STORY_TARGET.descend;
  if(state.phase===CHAPEL_TOWER_PHASE.CHAPEL_FINAL)return STORY_TARGET.fifthTake;
  return selectedRoomTarget(selectedWaypoint,selectedLabel);
}

export function storyTargetRuntimePoint(value,toRuntimePoint=(point)=>point){
  if(!value)return null;
  if(value.coordinateSpace==='runtime'&&value.point)return{x:value.point.x,y:value.point.y};
  if(value.coordinateSpace==='authored'&&value.authored){const point=toRuntimePoint(value.authored);return point?{x:point.x,y:point.y}:null;}
  return null;
}

// A prop or door is illuminated by its submitted mesh instance. Once target
// and observer share a render group, a map-floor classification is neither
// necessary nor stable at exterior/interior seams: overlapping ground, dock
// and street spans can legitimately choose different map labels from frame to
// frame while the same object remains in the same rendered world. Positional
// and room targets retain the stricter floor test used by map guidance.
export function storyTargetSharesRenderSpace(target,{
  targetRenderGroup='',observerRenderGroup='',targetFloorId=null,observerFloorId=null,
}={}){
  if(!targetRenderGroup||targetRenderGroup!==observerRenderGroup)return false;
  if(target?.kind==='prop'||target?.kind==='door'||target?.propId||target?.doorId)return true;
  return !!targetFloorId&&targetFloorId===observerFloorId;
}
