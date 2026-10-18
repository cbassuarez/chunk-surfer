// Render-only stone performance. Every input is physical metres or seconds;
// no camera, clock, random generator, save, quest or scene state is read here.
// The caller advances once from the real main eye, then reuses the returned
// instances for its shadow, reflection and main acquisitions.
import {ROOF_WATCHERS} from '../data/roof-watchers.js';

const DEG=Math.PI/180,STEP=1/60,MAX_FRAME_GAP=.35;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const copyPoint=value=>Array.isArray(value)?value.slice(0,3):[value?.x,value?.y,value?.z];
const finitePoint=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const frozen=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const mix=(seed,cycle=0)=>{
  let value=(Number(seed)||0)^Math.imul(cycle+1,0x9e3779b9);
  value=Math.imul(value^(value>>>16),0x21f0aaad);value=Math.imul(value^(value>>>15),0x735a2d97);
  return((value^(value>>>15))>>>0)/4294967296;
};
const lerp=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);

export const ROOF_WATCHER_PERFORMANCE_CONTRACT=frozen({
  stateVersion:1,fixedStepSeconds:STEP,maximumFrameGapSeconds:MAX_FRAME_GAP,
  coordinates:'Physical world metres. P3 eyes are already metres; r3dEyePoint values require CELL multiplication.',
  facing:'Ordinary prop +Z, so local desired yaw is atan2(-dx,dz), not the camera yaw convention.',
  reducedMotion:'Freeze the current stone pose and performance clock; no settling and no resume catch-up.',
  inactive:'Submit no dynamic heads and clear performance state; an old unsplit asset keeps its own baked carvings.',
  reuse:'Same timeSec returns the prior frame unchanged, including its eye; a reflected eye cannot drive a second pose.',
});

function profile(watcher){
  const relief=watcher.profile==='relief'||watcher.kind==='foliate',owl=watcher.kind==='owl';
  const individuality=.91+.18*mix(watcher.seed,41);
  return{
    recognition:(relief?.64:owl?.76:.34)+mix(watcher.seed,1)*.36,
    speed:(relief?3.8:owl?5.7:7.3)*DEG*individuality,
    omega:(relief?3.2:owl?3.6:4.2)*individuality,
    trackFor:1.45+mix(watcher.seed,2)*1.65,
    holdFor:.38+mix(watcher.seed,3)*.64,
    settle:(relief?.10:owl?.15:.19)*DEG,
    range:34,deadBand:.32*DEG,
  };
}

function anchorFrame(anchor){
  if(!anchor||![anchor.x,anchor.y,anchor.z].every(Number.isFinite))return null;
  const scale=Number.isFinite(anchor.scale)?anchor.scale:1;
  const frame={x:anchor.x,y:anchor.y,z:anchor.z,yaw:Number(anchor.yaw)||0,scale,
    scaleX:Number.isFinite(anchor.scaleX)?anchor.scaleX:1,
    scaleY:Number.isFinite(anchor.scaleY)?anchor.scaleY:1,
    scaleZ:Number.isFinite(anchor.scaleZ)?anchor.scaleZ:1,
    zone:Number(anchor.zone)||0,noShadow:!!anchor.noShadow};
  if([frame.scale*frame.scaleX,frame.scale*frame.scaleY,frame.scale*frame.scaleZ].some(value=>Math.abs(value)<1e-8))return null;
  return frame;
}

export function roofWatcherWorldPivot(watcher,anchor){
  const a=anchorFrame(anchor),p=watcher?.localPivot;
  if(!a||!finitePoint(p))return null;
  const x=p[0]*a.scale*a.scaleX,y=p[1]*a.scale*a.scaleY,z=p[2]*a.scale*a.scaleZ;
  const c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  return[a.x+x*c-z*s,a.y+y,a.z+x*s+z*c];
}

function targetFrame(watcher,anchor,eye){
  const pivot=roofWatcherWorldPivot(watcher,anchor),dx=eye[0]-pivot[0],dz=eye[2]-pivot[2];
  const c=Math.cos(anchor.yaw),s=Math.sin(anchor.yaw);
  // Undo the parent's yaw and horizontal scale before choosing the local
  // neck angle. This also supports a nonuniformly scaled structure correctly.
  const localX=(dx*c+dz*s)/(anchor.scale*anchor.scaleX);
  const localZ=(-dx*s+dz*c)/(anchor.scale*anchor.scaleZ);
  const raw=wrap(Math.atan2(-localX,localZ)-(Number(watcher.restYaw)||0));
  const range=Math.hypot(dx,eye[1]-pivot[1],dz),p=profile(watcher);
  const noticed=range<=p.range&&Math.abs(raw)<Math.PI*.56;
  const limit=Number.isFinite(watcher.maxYaw)?Math.abs(watcher.maxYaw):20*DEG;
  return{pivot,range,noticed,raw,target:noticed?clamp(raw,-limit,limit):0,limit};
}

export function roofWatcherTargetOffset(watcher,anchor,eye){
  const a=anchorFrame(anchor),point=copyPoint(eye);
  return a&&finitePoint(point)&&finitePoint(watcher?.localPivot)?targetFrame(watcher,a,point).target:null;
}

function initialStone(watcher){
  return{id:watcher.id,yawOffset:0,velocity:0,targetOffset:0,stage:'unaware',
    wakeAt:0,phaseUntil:0,phaseStarted:0,cycle:0,lastRange:Infinity,noticed:false};
}

function advanceStone(stone,watcher,anchor,eye,clock){
  const p=profile(watcher),target=targetFrame(watcher,anchor,eye);
  stone.lastRange=target.range;stone.noticed=target.noticed;
  if(!target.noticed){
    stone.stage='unaware';stone.targetOffset=0;stone.wakeAt=0;
  }else if(stone.stage==='unaware'){
    stone.stage='recognizing';stone.wakeAt=clock+p.recognition;stone.phaseStarted=clock;
  }else if(stone.stage==='recognizing'&&clock+1e-10>=stone.wakeAt){
    stone.stage='tracking';stone.phaseStarted=clock;
    stone.phaseUntil=clock+p.trackFor;stone.targetOffset=target.target;
  }else if(stone.stage==='tracking'){
    if(Math.abs(target.target-stone.targetOffset)>p.deadBand)stone.targetOffset=target.target;
    if(clock+1e-10>=stone.phaseUntil){
      stone.stage='staring';stone.phaseStarted=clock;
      stone.phaseUntil=clock+p.holdFor*(.80+.40*mix(watcher.seed,stone.cycle+11));
    }
  }else if(stone.stage==='staring'&&clock+1e-10>=stone.phaseUntil){
    stone.cycle++;stone.stage='tracking';stone.phaseStarted=clock;
    stone.phaseUntil=clock+p.trackFor*(.78+.44*mix(watcher.seed,stone.cycle+21));
    stone.targetOffset=target.target;
  }
  let aim=stone.targetOffset;
  if(stone.stage==='staring'){
    const age=clock-stone.phaseStarted;
    // A single dying correction after a turn, never idle breathing or a
    // repeating turntable. Each carving's hold timing is independently seeded.
    aim+=p.settle*Math.exp(-age/.42)*Math.sin(age*8.1);
  }
  aim=clamp(aim,-target.limit,target.limit);
  const omega=stone.stage==='unaware'?p.omega*.48:p.omega;
  const error=stone.yawOffset-aim,decay=Math.exp(-omega*STEP);
  const temporary=(stone.velocity+omega*error)*STEP;
  const desired=aim+(error+temporary)*decay;
  let velocity=(stone.velocity-omega*temporary)*decay;
  const change=clamp(desired-stone.yawOffset,-p.speed*STEP,p.speed*STEP);
  if(Math.abs(desired-stone.yawOffset)>p.speed*STEP)velocity=change/STEP;
  stone.yawOffset=clamp(stone.yawOffset+change,-target.limit,target.limit);
  stone.velocity=Math.abs(stone.yawOffset)>=target.limit-1e-12?0:velocity;
}

function instanceFor(watcher,anchor,stone){
  const pivot=roofWatcherWorldPivot(watcher,anchor),localYaw=(Number(watcher.restYaw)||0)+stone.yawOffset;
  const c=Math.cos(anchor.yaw),s=Math.sin(anchor.yaw),h=Math.cos(localYaw),n=Math.sin(localYaw);
  const size=Number.isFinite(watcher.scale)?watcher.scale:1;
  const sx=anchor.scale*anchor.scaleX*size,sy=anchor.scale*anchor.scaleY*size,sz=anchor.scale*anchor.scaleZ*size;
  // Parent * translate(localPivot) * neckYaw. A complete matrix preserves the
  // pivot and inherited nonuniform scale; adding two yaw fields alone cannot.
  const matrix=[c*sx*h-s*sz*n,0,s*sx*h+c*sz*n,0,0,sy,0,0,
    -c*sx*n-s*sz*h,0,-s*sx*n+c*sz*h,0,pivot[0],pivot[1],pivot[2],1];
  return{id:watcher.id,mesh:watcher.mesh,x:pivot[0],y:pivot[1],z:pivot[2],
    yaw:wrap(anchor.yaw+localYaw),scale:anchor.scale*size,
    scaleX:anchor.scaleX,scaleY:anchor.scaleY,scaleZ:anchor.scaleZ,matrix,
    zone:anchor.zone,structural:true,noShadow:anchor.noShadow};
}

/** Pure immutable step; retain result.state and reuse one result per frame.
 * Same-timestamp calls deliberately ignore a second eye (e.g. a reflection).
 * A hidden-tab gap or reversed clock rebases without a snap or catch-up.
 */
export function stepRoofWatcherPerformance(previousState,{watchers=ROOF_WATCHERS,anchor,eye,timeSec,
  reducedMotion=false,active=true}={}){
  if(!active)return{state:null,instances:[],presentation:frozen({active:false,reason:'inactive-geometry',
    timeSec:Number.isFinite(timeSec)?timeSec:null,watchers:[]})};
  const a=anchorFrame(anchor),point=copyPoint(eye);
  if(!a||!finitePoint(point)||!Number.isFinite(timeSec))return{
    state:previousState||null,instances:[],presentation:frozen({active:false,reason:'missing-physical-input',watchers:[]}),
  };
  const definitions=(Array.isArray(watchers)?watchers:[]).filter(w=>w?.id&&w?.mesh&&finitePoint(w.localPivot));
  if(previousState?.version===1&&previousState.lastTimeSec===timeSec&&previousState.frame)
    return{state:previousState,...previousState.frame};
  const prior=previousState?.version===1?previousState:null;
  const state={version:1,lastTimeSec:timeSec,eye:point,anchor:a,clockSec:prior?.clockSec||0,
    accumulator:prior?.accumulator||0,stones:{},frame:null};
  for(const w of definitions)state.stones[w.id]=prior?.stones?.[w.id]?{...prior.stones[w.id]}:initialStone(w);
  const elapsed=prior?timeSec-prior.lastTimeSec:0;
  let reason=!prior?'initial':reducedMotion?'reduced-motion':!active?'inactive':elapsed<0?'clock-rebased':elapsed>MAX_FRAME_GAP?'gap-rebased':'advanced';
  const advance=prior&&active&&!reducedMotion&&elapsed>=0&&elapsed<=MAX_FRAME_GAP;
  if(advance){
    const before=state.accumulator,total=before+elapsed,ticks=Math.floor((total+1e-10)/STEP);
    for(let tick=0;tick<ticks;tick++){
      const offset=STEP-before+tick*STEP;
      const sampledEye=lerp(prior.eye,point,elapsed?clamp(offset/elapsed,0,1):1);
      state.clockSec+=STEP;
      for(const w of definitions)advanceStone(state.stones[w.id],w,a,sampledEye,state.clockSec);
    }
    state.accumulator=Math.max(0,total-ticks*STEP);
  }else{
    state.accumulator=0;
    for(const stone of Object.values(state.stones))stone.velocity=0;
  }
  const instances=definitions.map(w=>instanceFor(w,a,state.stones[w.id]));
  const presentation={active:!!active,reducedMotion:!!reducedMotion,reason,timeSec,clockSec:state.clockSec,
    eye:point,watchers:definitions.map(w=>{
      const stone=state.stones[w.id],target=targetFrame(w,a,point);
      return{id:w.id,mesh:w.mesh,kind:w.kind,pivot:target.pivot,rangeM:target.range,
        noticed:target.noticed,stage:stone.stage,yawOffset:stone.yawOffset,targetOffset:target.target,
        heldTargetOffset:stone.targetOffset,maxYaw:target.limit,yaw:wrap(a.yaw+(Number(w.restYaw)||0)+stone.yawOffset)};
    })};
  state.frame={instances,presentation};
  frozen(state);
  return{state,instances:state.frame.instances,presentation:state.frame.presentation};
}
