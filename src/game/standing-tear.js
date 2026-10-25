import { STANDING_TEAR_LAYOUT as LAYOUT } from '../data/standing-tear.js';
import { STANDING_TEAR_MEMORIES as MEMORIES, STANDING_TEAR_PRESSURE as PRESSURE,
  standingTearPressurePanels, standingTearPanelHitsCapsule, standingTearPanelSweepHits } from '../data/standing-tear-pressure.js';
import { standingTearMemoryPulse } from '../data/standing-tear-memory-score.js';

const KIND='standing-tear',VERSION=2;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,finite(value,lo)));
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const wrap=value=>Math.atan2(Math.sin(finite(value)),Math.cos(finite(value)));
const phases=new Set(['arrival','work','reference','ending','returned']);
const poseOf=value=>({x:finite(value?.x,LAYOUT.spawn.x),z:finite(value?.z,LAYOUT.spawn.z),feet:0,
  yaw:wrap(value?.yaw??LAYOUT.spawn.yaw),pitch:clamp(value?.pitch??LAYOUT.spawn.pitch,-1.35,1.3)});
const freshMemories=()=>MEMORIES.map(memory=>({id:memory.id,awake:false,awakeSeconds:0,pressure:0,metres:0}));

/** Owns no ordinary Source, Contact, recorder or inventory authority. */
export function freshStandingTear({runId='',returnPose=null}={}){
  return{kind:KIND,version:VERSION,runId:String(runId),phase:'arrival',elapsed:0,entryFoldingIssued:false,
    pose:poseOf(LAYOUT.spawn),returnPose:clone(returnPose),distance:0,memories:freshMemories(),panelProgress:[0,0,0,0,0,0],
    moving:false,motionIntent:false,liveMemoryId:null,lastMoveYaw:LAYOUT.spawn.yaw,witnessSeconds:0,fullConfinementSeconds:0,
    held:false,holdSeconds:0,performedSeconds:0,bars:0,released:false,
    referenceStarted:false,transportRunning:false,architectureRunning:false,referenceSeconds:0,stoppedSeconds:0,
    endingSeconds:0,completed:false,restoreIssued:false,readyIssued:false,returnReceipt:null};
}
export function normalizeStandingTear(value,{runId,returnPose}={}){
  const base=freshStandingTear({runId:runId??value?.runId,returnPose:returnPose??value?.returnPose});
  if(value?.kind!==KIND||![1,VERSION].includes(value.version)||runId!=null&&String(runId)!==String(value.runId))return base;
  const legacy=value.version===1;
  const state={...base,phase:phases.has(value.phase)?value.phase:'arrival',elapsed:clamp(value.elapsed,0,1e8),
    entryFoldingIssued:typeof value.entryFoldingIssued==='boolean'?value.entryFoldingIssued:finite(value.elapsed)>0,
    pose:poseOf(value.pose),distance:clamp(value.distance,0,1e8),moving:!legacy&&!!value.moving,motionIntent:!legacy&&!!value.motionIntent,
    liveMemoryId:!legacy&&MEMORIES.some(memory=>memory.id===value.liveMemoryId)?value.liveMemoryId:null,
    lastMoveYaw:wrap(value.lastMoveYaw??value.pose?.yaw??LAYOUT.spawn.yaw),witnessSeconds:clamp(value.witnessSeconds,0,PRESSURE.witnessSeconds),
    fullConfinementSeconds:clamp(value.fullConfinementSeconds,0,1e8),
    performedSeconds:clamp(value.performedSeconds,0,1e8),released:!!value.released,
    referenceSeconds:clamp(value.referenceSeconds,0,1e8),stoppedSeconds:clamp(value.stoppedSeconds,0,1e8),
    endingSeconds:clamp(value.endingSeconds,0,LAYOUT.cinematic.agencyAt),completed:!!value.completed,
    restoreIssued:!!value.restoreIssued,readyIssued:!!value.readyIssued,returnReceipt:clone(value.returnReceipt)};
  if(!legacy){
    state.memories=MEMORIES.map(definition=>{const memory=value.memories?.find?.(item=>item.id===definition.id),awake=!!memory?.awake;
      return{id:definition.id,awake,awakeSeconds:awake?clamp(memory.awakeSeconds,0,1e8):0,
        pressure:awake?clamp(memory.pressure,0,1):0,metres:awake?clamp(memory.metres,0,1e8):0};});
    state.panelProgress=base.panelProgress.map((_,index)=>clamp(value.panelProgress?.[index],0,1));
  }
  state.referenceStarted=state.memories.some(memory=>memory.awake);state.architectureRunning=state.referenceStarted;
  if(!state.panelProgress.every(value=>value>=1-1e-7))state.fullConfinementSeconds=0;
  if(!state.returnReceipt||state.returnReceipt.id!==`${state.runId}:${KIND}:return`)state.returnReceipt=null;
  if(state.phase!=='ending'&&state.phase!=='returned'){
    state.endingSeconds=0;state.restoreIssued=false;state.readyIssued=false;state.completed=false;state.returnReceipt=null;
    if(legacy)state.phase=state.elapsed<LAYOUT.entryFoldSeconds?'arrival':'work';
  }
  return state;
}

/** Exact musical course solids, over the original continuous supported basin. */
export function standingTearCanOccupy(x,z,radius=LAYOUT.bodyRadius,state=null){
  if(radius&&typeof radius==='object'){state=radius;radius=LAYOUT.bodyRadius;}
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;radius=clamp(radius,0,2);
  const b=LAYOUT.bounds;if(x<b.minX+radius||x>b.maxX-radius||z<b.minZ+radius||z>b.maxZ-radius)return false;
  const panels=state?.panels||standingTearPressurePanels(state?.panelProgress||[]);
  return!panels.some(panel=>standingTearPanelHitsCapsule(panel,x,z,{radius}));
}
export function standingTearCrossing(from,to,site=LAYOUT.site){
  if(!from||!to||![from.x,from.z,to.x,to.z,site.x,site.z].every(Number.isFinite))return null;
  const length=Math.hypot(site.normalX??0,site.normalZ??1);if(length<1e-8)return null;
  const nx=(site.normalX??0)/length,nz=(site.normalZ??1)/length;
  const signed=p=>(p.x-site.x)*nx+(p.z-site.z)*nz,a=signed(from),b=signed(to);
  if(Math.abs(a)<1e-7||a*b>0||Math.abs(a-b)<1e-7)return null;
  const t=a/(a-b);if(t<0||t>1)return null;
  const x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t,tangent=(x-site.x)*nz-(z-site.z)*nx;
  const radius=finite(site.bodyRadius,LAYOUT.bodyRadius),width=finite(site.width,LAYOUT.site.width),height=finite(site.height,LAYOUT.site.height);
  const fa=finite(from.feet,site.feet),fb=finite(to.feet,site.feet),feet=fa+(fb-fa)*t,base=finite(site.feet,LAYOUT.site.feet);
  if(Math.abs(tangent)>width/2-radius||feet<base-.12||feet+1.8>base+height+.01)return null;
  return{x,z,feet,t,direction:b>a?1:-1};
}
function walk(state,input,dt,events){
  state.pose.yaw=Number.isFinite(input.lookYaw)?wrap(input.lookYaw):state.pose.yaw;
  state.pose.pitch=clamp(input.lookPitch??state.pose.pitch,-1.35,1.3);
  const forward=clamp(finite(input.forward),-1,1),side=clamp(finite(input.side),-1,1),norm=Math.max(1,Math.hypot(forward,side));
  state.motionIntent=Math.hypot(forward,side)>=.1;
  const dx=(Math.sin(state.pose.yaw)*forward+Math.cos(state.pose.yaw)*side)*dt*LAYOUT.walkingSpeed/norm;
  const dz=(-Math.cos(state.pose.yaw)*forward+Math.sin(state.pose.yaw)*side)*dt*LAYOUT.walkingSpeed/norm;
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06)),segments=[],panels=standingTearPressurePanels(state.panelProgress,state.memories);
  const attempt=(x,z)=>{if(!standingTearCanOccupy(x,z,LAYOUT.bodyRadius,{panels}))return false;
    const from={x:state.pose.x,z:state.pose.z},length=Math.hypot(x-from.x,z-from.z);state.pose.x=x;state.pose.z=z;
    if(length>1e-9)segments.push({from,to:{x,z},length});return true;};
  for(let index=0;index<count;index++)if(!attempt(state.pose.x+dx/count,state.pose.z+dz/count)){
    attempt(state.pose.x+dx/count,state.pose.z);attempt(state.pose.x,state.pose.z+dz/count);}
  const distance=segments.reduce((sum,segment)=>sum+segment.length,0);state.distance+=distance;state.moving=distance>.001;
  if(state.moving){state.lastMoveYaw=state.pose.yaw;events.push({type:'move',distance,pose:clone(state.pose),at:state.elapsed});}
  return segments;
}
function memoryMovement(state,segments,dt,events){
  const previousLive=state.liveMemoryId;
  for(const memory of state.memories){
    const definition=MEMORIES.find(item=>item.id===memory.id);
    if(!memory.awake&&segments.length&&Math.hypot(state.pose.x-definition.source.x,state.pose.z-definition.source.z)<=definition.radius){
      memory.awake=true;memory.awakeSeconds=0;events.push({type:'memory-awake',id:memory.id,source:clone(definition.source),at:state.elapsed});
      if(!state.referenceStarted)events.push({type:'reference-start',at:state.elapsed});
      state.referenceStarted=true;state.architectureRunning=true;state.phase='reference';
    }
    if(!memory.awake)continue;memory.awakeSeconds+=dt;
    const distance=segments.reduce((sum,segment)=>{const x=(segment.from.x+segment.to.x)/2,z=(segment.from.z+segment.to.z)/2;
      return sum+(Math.hypot(x-definition.source.x,z-definition.source.z)<=definition.pressureRadius?segment.length:0);},0);
    memory.metres+=distance;const previous=memory.pressure;memory.pressure=Math.max(previous,Math.min(1,memory.metres/PRESSURE.metresPerMemory));
    if(memory.pressure>previous+.02)events.push({type:'memory-pressure',id:memory.id,pressure:memory.pressure,at:state.elapsed});
  }
  const live=state.moving?state.memories.filter(memory=>memory.awake).map(memory=>({memory,definition:MEMORIES.find(item=>item.id===memory.id)}))
    .filter(({definition})=>Math.hypot(state.pose.x-definition.source.x,state.pose.z-definition.source.z)<=definition.pressureRadius)
    .sort((a,b)=>Math.hypot(state.pose.x-a.definition.source.x,state.pose.z-a.definition.source.z)-Math.hypot(state.pose.x-b.definition.source.x,state.pose.z-b.definition.source.z))[0]?.memory.id:null;
  state.liveMemoryId=live||null;
  if(previousLive&&previousLive!==state.liveMemoryId){events.push({type:'live-stop',id:previousLive,reason:'release',at:state.elapsed});state.released=true;}
  if(state.liveMemoryId&&previousLive!==state.liveMemoryId)events.push({type:'live-start',id:state.liveMemoryId,source:'student',at:state.elapsed});
  if(state.liveMemoryId)state.performedSeconds+=dt;if(state.referenceStarted)state.referenceSeconds+=dt;
}
function advancePanels(state,dt,events){
  for(const panel of standingTearPressurePanels(state.panelProgress,state.memories)){
    const before=state.panelProgress[panel.index],next=Math.min(panel.target,before+dt/PRESSURE.foldSeconds);if(next<=before)continue;
    if(standingTearPanelSweepHits(panel.index,before,next,state.pose.x,state.pose.z)){events.push({type:'course-yields',id:panel.id,at:state.elapsed});continue;}
    state.panelProgress[panel.index]=next;
    if(next>=1-1e-8&&before<1-1e-8)events.push({type:'course-made',id:panel.id,memoryId:panel.memoryId,at:state.elapsed});
  }
}
function witnessFrame(state){
  const made=state.panelProgress.every(value=>value>=1-1e-7),released=!state.moving&&!state.motionIntent;
  const panels=standingTearPressurePanels(state.panelProgress,state.memories),cp=Math.cos(state.pose.pitch);
  const look=[Math.sin(state.pose.yaw)*cp,Math.sin(state.pose.pitch),-Math.cos(state.pose.yaw)*cp];
  const visible=panels.filter(panel=>{const d=[panel.position[0]-state.pose.x,panel.position[1]-LAYOUT.eyeHeight,panel.position[2]-state.pose.z],distance=Math.hypot(...d);
    return distance<50&&d.reduce((sum,value,index)=>sum+value*look[index],0)/distance>.2;});
  const close=visible.some(panel=>Math.hypot(panel.position[0]-state.pose.x,panel.position[2]-state.pose.z)<5);
  const lookback=Math.abs(wrap(state.pose.yaw-state.lastMoveYaw))>=.6;
  const retainedLongEnough=state.fullConfinementSeconds>=PRESSURE.minimumConfinementSeconds-1e-8;
  return{made,released,retainedLongEnough,fullConfinementSeconds:state.fullConfinementSeconds,
    minimumConfinementSeconds:PRESSURE.minimumConfinementSeconds,
    eligible:made&&retainedLongEnough&&released&&visible.length>0&&(lookback||close),seconds:state.witnessSeconds,duration:PRESSURE.witnessSeconds,visible:visible.map(panel=>panel.id)};
}
function beginEnding(state,events,complete){
  if(state.liveMemoryId)events.push({type:'live-stop',id:state.liveMemoryId,reason:complete?'witness':'withdraw',at:state.elapsed});
  state.phase='ending';state.completed=complete;state.moving=false;state.motionIntent=false;state.liveMemoryId=null;state.endingSeconds=0;state.stoppedSeconds=0;
  state.returnReceipt={id:`${state.runId}:${KIND}:return`,complete};events.push({type:'ending-start',complete,at:state.elapsed},{type:'phase',phase:'ending',at:state.elapsed});
}
function advanceEnding(state,input,dt,events){
  const c=LAYOUT.cinematic;state.endingSeconds=Math.min(c.agencyAt,state.endingSeconds+dt);
  if(input.renderReady===false&&state.endingSeconds>c.revealAt)state.endingSeconds=c.revealAt;
  state.stoppedSeconds+=dt;for(const memory of state.memories)if(memory.awake)memory.awakeSeconds+=dt;
  if(!state.restoreIssued&&state.endingSeconds>=c.blackAt-1e-8){state.restoreIssued=true;events.push({type:'restore',returnPose:clone(state.returnPose),receipt:clone(state.returnReceipt),at:state.elapsed});}
  if(!state.readyIssued&&state.endingSeconds>=c.agencyAt-1e-8){state.readyIssued=true;state.phase='returned';events.push({type:'return-ready',complete:state.completed,receipt:clone(state.returnReceipt),at:state.elapsed});}
}
export function stepStandingTear(value,input={}){
  const state=normalizeStandingTear(value),events=[],dt=clamp(input.dt,0,.1);if(state.phase==='returned')return{state,events};
  if(input.paused||input.hidden){state.moving=false;state.motionIntent=false;if(state.liveMemoryId)events.push({type:'live-stop',id:state.liveMemoryId,reason:input.paused?'pause':'hidden',at:state.elapsed});state.liveMemoryId=null;return{state,events};}
  if(input.withdraw&&state.phase!=='ending'){beginEnding(state,events,false);return{state,events};}
  if(state.phase==='ending'){state.elapsed+=dt;advanceEnding(state,input,dt,events);return{state,events};}
  if(input.renderReady===false)return{state,events};
  if(!state.entryFoldingIssued){state.entryFoldingIssued=true;events.push({type:'entry-folding',at:state.elapsed});}
  if(dt===0){
    if(Number.isFinite(input.lookYaw))state.pose.yaw=wrap(input.lookYaw);
    state.pose.pitch=clamp(input.lookPitch??state.pose.pitch,-1.35,1.3);
    return{state,events};
  }
  state.elapsed+=dt;const segments=walk(state,input,dt,events);
  if(state.phase==='arrival'&&state.elapsed>=LAYOUT.entryFoldSeconds){state.phase='work';events.push({type:'entry-closed',at:state.elapsed},{type:'phase',phase:'work',at:state.elapsed});}
  memoryMovement(state,segments,dt,events);
  const wasMade=state.panelProgress.every(value=>value>=1-1e-7);
  const retainedBefore=state.fullConfinementSeconds>=PRESSURE.minimumConfinementSeconds-1e-8;
  advancePanels(state,dt,events);
  const made=state.panelProgress.every(value=>value>=1-1e-7);
  if(made&&wasMade)state.fullConfinementSeconds+=dt;
  if(made&&!wasMade)events.push({type:'fully-confined',at:state.elapsed});
  state.witnessSeconds=retainedBefore&&witnessFrame(state).eligible?Math.min(PRESSURE.witnessSeconds,state.witnessSeconds+dt):0;
  if(state.witnessSeconds>=PRESSURE.witnessSeconds-1e-8)beginEnding(state,events,true);return{state,events};
}
export function standingTearFrame(value){
  const state=normalizeStandingTear(value),c=LAYOUT.cinematic,ending=state.phase==='ending'||state.phase==='returned',t=state.endingSeconds;
  const fade=!ending?0:t<c.blackAt?clamp((t-c.fadeOutAt)/(c.blackAt-c.fadeOutAt),0,1):t<c.revealAt?1:1-clamp((t-c.revealAt)/c.revealSeconds,0,1);
  const memories=state.memories.map(memory=>{const d=MEMORIES.find(item=>item.id===memory.id);return{...clone(memory),source:clone(d.source),position:[d.source.x,d.source.y,d.source.z],radius:d.radius,pressureRadius:d.pressureRadius,live:state.liveMemoryId===memory.id,musicSeconds:state.elapsed,pulse:standingTearMemoryPulse(memory.id,state.elapsed),density:memory.pressure};});
  const falseCue={distance:Infinity,facing:0,available:false};
  return{kind:KIND,version:VERSION,phase:state.phase,elapsed:state.elapsed,pose:clone(state.pose),camera:{eye:[state.pose.x,LAYOUT.eyeHeight,state.pose.z],yaw:state.pose.yaw,pitch:state.pose.pitch},feet:0,
    entryFold:clamp(state.elapsed/LAYOUT.entryFoldSeconds,0,1),memories,panels:standingTearPressurePanels(state.panelProgress,memories),assembly:memories.reduce((sum,memory)=>sum+memory.pressure,0)/MEMORIES.length,awakenedCount:memories.filter(memory=>memory.awake).length,
    moving:state.moving,motionIntent:state.motionIntent,liveMemoryId:state.liveMemoryId,fullConfinementSeconds:state.fullConfinementSeconds,held:false,performedSeconds:state.performedSeconds,performancePhase:0,bars:0,released:state.released,
    referenceStarted:state.referenceStarted,referenceSeconds:state.referenceSeconds,transportRunning:false,reelTurn:0,architectureRunning:state.architectureRunning,stoppedSeconds:state.stoppedSeconds,
    body:{held:false,walkPhase:state.distance*6,reach:null},cue:{correction:{...falseCue},reference:{...falseCue}},witness:witnessFrame(state),fade,endingSeconds:t,restored:state.restoreIssued,returnReady:state.readyIssued,completed:state.completed,returnPose:clone(state.returnPose),returnReceipt:clone(state.returnReceipt),gameplayHud:[],caption:null,label:clone(LAYOUT.label),
    audio:{live:!!state.liveMemoryId,memories,liveHz:440,reference:state.referenceStarted,transport:false,referenceHz:444,architecture:state.architectureRunning,architectureSource:{x:0,z:175,y:62},referenceSeconds:state.referenceSeconds,ending,endingSeconds:t}};
}
