// THE QUIET VIGIL, AS STATE.
//
// At most two observations persist across a run. Small bodily actions are a
// separate clock and only ever produce visual offsets, never moved collision.

import { VIGIL_CLUSTERS, VIGIL_OBSERVATIONS, VIGIL_OVERHEARDS } from '../data/exterior-vigil.js';

export const EXTERIOR_VIGIL_SCHEMA=1;
export const VIGIL_OBSERVATION_BUDGET=2;
export const VIGIL_ACTION_CONCURRENCY=2;
export const VIGIL_ACTION_MIN_WAIT_MS=9_000;
export const VIGIL_ACTION_MAX_WAIT_MS=24_000;
export const VIGIL_YARD_LOGICAL_ORIGIN=Object.freeze({x:50,y:200});

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,finite(value)));
const list=(value)=>Array.isArray(value)?[...new Set(value.map(String).filter(Boolean))]:[];
const hash=(value)=>{let h=2166136261;for(const char of String(value??'')){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const unit=(...parts)=>hash(parts.join('|'))/0x100000000;
const delay=(seed,key,min,max)=>Math.round(min+unit(seed,key)*(max-min));
const distance=(a,b)=>Math.hypot(finite(a?.x)-finite(b?.x),finite(a?.y)-finite(b?.y));

export function exteriorVigilSeed(runId=0){return hash(`quiet-vigil:${String(runId??0)}`);}

export function freshExteriorVigilState(runId=0){
  const seed=exteriorVigilSeed(runId);
  return{schema:EXTERIOR_VIGIL_SCHEMA,seed,seen:[],emitted:0,lastCluster:null,dwellMs:0,travelMetres:0,
    ambientWaitMs:delay(seed,'ambient:first',18_000,42_000),ambientCursor:0};
}

export function normalizeExteriorVigilState(value,{runId=0}={}){
  const fresh=freshExteriorVigilState(runId),source=value&&typeof value==='object'?value:{};
  const seen=list(source.seen).filter((id)=>VIGIL_OBSERVATIONS.some((entry)=>entry.id===id));
  return{schema:EXTERIOR_VIGIL_SCHEMA,
    seed:Number.isFinite(Number(source.seed))?Number(source.seed)>>>0:fresh.seed,
    seen,emitted:Math.min(VIGIL_OBSERVATION_BUDGET,Math.max(seen.length,Math.floor(finite(source.emitted,seen.length)))),
    lastCluster:VIGIL_CLUSTERS[String(source.lastCluster||'')]?String(source.lastCluster):null,
    dwellMs:Math.max(0,finite(source.dwellMs)),travelMetres:Math.max(0,finite(source.travelMetres)),
    ambientWaitMs:Math.max(0,finite(source.ambientWaitMs,fresh.ambientWaitMs)),ambientCursor:Math.max(0,Math.floor(finite(source.ambientCursor)))};
}

export function vigilContextAt(x,y,{visibleTags=null}={}){
  const point={x:finite(x,Infinity),y:finite(y,Infinity)};let found=null;
  for(const [id,cluster] of Object.entries(VIGIL_CLUSTERS)){
    const d=distance(point,cluster);
    if(d>cluster.radius||d>finite(found?.distance,Infinity))continue;
    found={cluster:id,distance:d,tags:list(visibleTags).length?list(visibleTags):[...cluster.tags]};
  }
  return found;
}

function observationCandidates(state,context){
  return VIGIL_OBSERVATIONS.filter((entry)=>!state.seen.includes(entry.id)&&entry.clusters.includes(context.cluster)
    &&(!entry.tags.length||entry.tags.some((tag)=>context.tags.includes(tag))));
}

export function reduceExteriorVigilObservation(value,input={}){
  const state=normalizeExteriorVigilState(value,{runId:input.runId}),dtMs=Math.max(0,finite(input.dtMs));
  if(input.blocked)return{state:{...state,dwellMs:0},observation:null,ambient:null};
  const context=input.context||vigilContextAt(input.x,input.y,{visibleTags:input.visibleTags});
  if(!context)return{state:{...state,dwellMs:0,travelMetres:state.travelMetres+Math.max(0,finite(input.movedMetres))},observation:null,ambient:null};
  let next={...state,dwellMs:state.dwellMs+dtMs,travelMetres:state.travelMetres+Math.max(0,finite(input.movedMetres)),ambientWaitMs:state.ambientWaitMs-dtMs};
  let ambient=null;
  if(next.ambientWaitMs<=0){
    const eligible=VIGIL_OVERHEARDS.filter((entry)=>entry.cluster===context.cluster);
    if(eligible.length){ambient=eligible[hash(`${next.seed}|ambient|${next.ambientCursor}|${context.cluster}`)%eligible.length];next.ambientCursor+=1;}
    next.ambientWaitMs=delay(next.seed,`ambient:${next.ambientCursor}`,18_000,42_000);
  }
  if(next.emitted>=VIGIL_OBSERVATION_BUDGET)return{state:next,observation:null,ambient};
  if(next.lastCluster&&next.lastCluster===context.cluster)return{state:next,observation:null,ambient};
  const requiredDwell=delay(next.seed,`dwell:${next.emitted}:${context.cluster}`,6_000,14_000);
  if(next.dwellMs<requiredDwell||(next.emitted>0&&next.travelMetres<12))return{state:next,observation:null,ambient};
  const candidates=observationCandidates(next,context);
  if(!candidates.length)return{state:next,observation:null,ambient};
  const observation=[...candidates].sort((a,b)=>hash(`${next.seed}|${next.emitted}|${a.id}`)-hash(`${next.seed}|${next.emitted}|${b.id}`))[0];
  next={...next,seen:[...next.seen,observation.id],emitted:next.emitted+1,lastCluster:context.cluster,dwellMs:0,travelMetres:0};
  return{state:next,observation,ambient};
}

export function freshVigilActionState(runId=0){
  const seed=exteriorVigilSeed(runId);
  return{schema:1,seed,serial:0,waitMs:delay(seed,'action:first',VIGIL_ACTION_MIN_WAIT_MS,VIGIL_ACTION_MAX_WAIT_MS),active:[],lastActors:[]};
}

export function normalizeVigilActionState(value,{runId=0}={}){
  const fresh=freshVigilActionState(runId),source=value&&typeof value==='object'?value:{};
  return{schema:1,seed:Number.isFinite(Number(source.seed))?Number(source.seed)>>>0:fresh.seed,
    serial:Math.max(0,Math.floor(finite(source.serial))),waitMs:Math.max(0,finite(source.waitMs,fresh.waitMs)),
    active:(Array.isArray(source.active)?source.active:[]).slice(0,VIGIL_ACTION_CONCURRENCY).map((entry)=>({actorId:String(entry.actorId||''),action:String(entry.action||''),elapsedMs:Math.max(0,finite(entry.elapsedMs)),durationMs:Math.max(500,finite(entry.durationMs,2400))})).filter((entry)=>entry.actorId&&entry.action),
    lastActors:list(source.lastActors).slice(-4)};
}

const ACTION_POSES=Object.freeze({
  'weight-shift':{body:{dx:.018,dz:.012,dy:-.008,dyaw:.022}},
  'binder-page':{body:{dyaw:-.012},part:{dy:.018,dz:-.018,dyaw:-.10}},
  'page-turn':{body:{dyaw:.012},part:{dy:.012,dyaw:.08}},
  'flask-check':{body:{dyaw:.022},part:{dy:.035,dz:-.025,dyaw:.07}},
  'cup-handoff':{body:{dyaw:-.035},part:{dx:-.08,dz:-.05,dy:.025,dyaw:-.06}},
  'window-look':{body:{dyaw:.075}},
  'umbrella-settle':{body:{dyaw:.016},part:{dy:-.055,dx:.025,dyaw:.045}},
  'key-check':{body:{dyaw:-.025},part:{dy:.025,dz:-.02,dyaw:.05}},
  'photos-sort':{body:{dyaw:.018},part:{dy:.018,dx:.04,dyaw:.10}},
  'map-fold':{body:{dyaw:-.018},part:{dy:-.015,dx:-.035,dyaw:.13}},
  'camera-check':{body:{dyaw:.025},part:{dy:.012,dyaw:-.045}},
  'placard-lower':{body:{dy:-.006},part:{dy:-.12,dz:.02,dyaw:.055}},
  'chair-settle':{body:{dy:-.018,dz:.018,dyaw:.012}},
});

export function vigilActionFrame(action,elapsedMs,{reducedMotion=false}={}){
  if(!action)return{body:null,part:null,done:true,progress:1};
  const raw=clamp(finite(elapsedMs)/Math.max(1,finite(action.durationMs,1)));
  const pulse=reducedMotion?(raw>0&&raw<1?1:0):Math.sin(raw*Math.PI),pose=ACTION_POSES[action.action]||ACTION_POSES['weight-shift'];
  const scaled=(source)=>source?Object.fromEntries(Object.entries(source).map(([key,value])=>[key,value*pulse])):null;
  return{body:scaled(pose.body),part:scaled(pose.part),done:raw>=1,progress:raw};
}

export function scheduleVigilActions(value,input={}){
  const dtMs=Math.max(0,finite(input.dtMs));let state=normalizeVigilActionState(value,{runId:input.runId});
  const actors=(Array.isArray(input.actors)?input.actors:[]).filter((actor)=>actor?.id&&actor.id!==input.lockedActorId&&Array.isArray(actor.actionSet)&&actor.actionSet.length&&(!input.listener||distance(actor,input.listener)<=18));
  const active=state.active.map((entry)=>({...entry,elapsedMs:entry.elapsedMs+dtMs}))
    .filter((entry)=>entry.elapsedMs<entry.durationMs&&entry.actorId!==input.lockedActorId);
  let waitMs=state.waitMs-dtMs,serial=state.serial,lastActors=state.lastActors;
  if(!input.blocked&&waitMs<=0&&active.length<VIGIL_ACTION_CONCURRENCY&&actors.length){
    const busy=new Set(active.map((entry)=>entry.actorId));
    const pool=actors.filter((actor)=>!busy.has(actor.id)&&!lastActors.slice(-2).includes(actor.id));
    const available=pool.length?pool:actors.filter((actor)=>!busy.has(actor.id));
    if(available.length){
      const actor=available[hash(`${state.seed}|actor|${serial}`)%available.length];
      const action=actor.actionSet[hash(`${state.seed}|action|${serial}|${actor.id}`)%actor.actionSet.length];
      active.push({actorId:actor.id,action,elapsedMs:0,durationMs:delay(state.seed,`duration:${serial}:${action}`,1800,4200)});
      lastActors=[...lastActors,actor.id].slice(-4);serial+=1;
    }
    waitMs=delay(state.seed,`action:${serial}`,VIGIL_ACTION_MIN_WAIT_MS,VIGIL_ACTION_MAX_WAIT_MS);
  }
  state={...state,active,waitMs:Math.max(0,waitMs),serial,lastActors};
  return{state,frames:active.map((entry)=>({...entry,...vigilActionFrame(entry,entry.elapsedMs,{reducedMotion:!!input.reducedMotion})}))};
}

export function createVigilAmbientDirector({state=null,runId=0,createDispatch,isBlocked=()=>false,onState=()=>{}}={}){
  if(typeof createDispatch!=='function')throw new TypeError('createVigilAmbientDirector needs createDispatch');
  let current=normalizeExteriorVigilState(state,{runId}),active=null;const position={x:Infinity,y:Infinity};
  const stop=()=>{if(!active)return false;active.cancel?.();active=null;return true;};
  return{update(input={}){
    position.x=finite(input.x,Infinity);position.y=finite(input.y,Infinity);const blocked=!!isBlocked();if(blocked)stop();
    const step=reduceExteriorVigilObservation(current,{...input,x:position.x,y:position.y,blocked,runId});current=step.state;onState(current,step);
    const line=step.observation?{who:'you',text:step.observation.text}:step.ambient?{who:'nearby',text:step.ambient.text}:null;
    if(line&&!blocked){stop();const dispatch=createDispatch({id:step.observation?.id||step.ambient.id,context:'auto',maxWaitMs:4_000,replace:false,interrupt:false,escapable:true,valid:()=>!isBlocked()&&!!vigilContextAt(position.x,position.y)});dispatch.say(line);active=dispatch;}
    return step;
  },cancel:stop,snapshot:()=>({state:{...current,seen:[...current.seen]},active:!!active})};
}

export function vigilYardPhysical(logicalX,logicalY){return{x:Number(logicalX)-VIGIL_YARD_LOGICAL_ORIGIN.x,y:Number(logicalY)-VIGIL_YARD_LOGICAL_ORIGIN.y};}
