import {sourceRiftBarsMs} from './source-rift.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));

function hash(value=''){
  let out=0x811c9dc5;
  for(const char of String(value))out=Math.imul(out^char.charCodeAt(0),16777619)>>>0;
  return out/0xffffffff;
}

// One bad-sector run every four bars, a bar and a half long, in one of four
// lanes. The desktop terminals fail on the same score (window-choreography
// sourceFault), so these are shared rather than restated there.
export const SOURCE_FAULT_RUN_MS=sourceRiftBarsMs(1.5);
export const SOURCE_FAULT_RUN_PERIOD_MS=sourceRiftBarsMs(4);
export const SOURCE_FAULT_LANES=4;

// Source corruption is presentation state. The body, collision plan and every
// interaction probe keep using the unmodified runtime geometry.
export function sourceFaultFrame({
  sourcePhase=false,horizon=false,transitionElapsedMs=Infinity,timeMs=0,
  reducedMotion=false,flashMode='full',seed=193,proper=true,
}={}){
  if(!sourcePhase||horizon)return Object.freeze({
    active:false,nvme:0,ps2:0,transition:0,geometry:0,slot:0,seed,
    overflow:0,overflowActive:false,overflowHead:0,overflowLane:0,overflowDirection:1,overflowRun:0,
    reduceMotion:!!reducedMotion,flashMode,
  });
  const transition=Number.isFinite(transitionElapsedMs)?1-clamp(transitionElapsedMs/2200):0;
  const nvme=clamp(.065+transition*.32);
  const ps2=clamp(.045+transition*.28);
  const now=Math.max(0,Number(timeMs)||0);
  const slot=reducedMotion?0:Math.floor(now/(transition>.01?170:420));

  // The object faults and terminal read errors share the practice wing's bar.
  // Seeded phase and lane keep each run repeatable.
  const runPeriodMs=SOURCE_FAULT_RUN_PERIOD_MS;
  const runDurationMs=SOURCE_FAULT_RUN_MS;
  const offset=sourceRiftBarsMs(Math.floor(hash(`overflow:${seed}`)*4));
  const scoredTime=now+offset;
  const overflowRun=Math.floor(scoredTime/runPeriodMs);
  const runTime=scoredTime-overflowRun*runPeriodMs;
  const runProgress=clamp(runTime/runDurationMs);
  const overflowActive=!!proper&&runTime<runDurationMs;
  const envelope=overflowActive
    ? clamp(Math.min(runProgress/.10,(1-runProgress)/.16))
    : 0;
  const rawHead=overflowActive?runProgress:0;
  const overflowHead=reducedMotion?Math.round(rawHead*6)/6:rawHead;
  const overflowLane=Math.min(SOURCE_FAULT_LANES-1,Math.floor(hash(`${seed}:${overflowRun}:lane`)*SOURCE_FAULT_LANES));
  const overflowDirection=hash(`${seed}:${overflowRun}:direction`)<.5?-1:1;
  return Object.freeze({
    active:true,nvme,ps2,transition,geometry:clamp(.025+transition*.22),slot,seed,
    overflow:envelope*.96,overflowActive,overflowHead,overflowLane,overflowDirection,overflowRun,
    reduceMotion:!!reducedMotion,flashMode:['full','reduced','off'].includes(flashMode)?flashMode:'full',
  });
}

function objectGlitchCandidate(instance){
  if(!instance?.id||!instance.mesh||instance.matrix?.length!==16||instance.sourceGlitchEligible===false
    ||instance.sourceFaultExempt||instance.character||instance.apparitionVariant||instance.paperIndex>=0
    ||instance.sourceMemoryFixture||instance.sourceDoorId||instance.sourceConnector||instance.sourceCodeOnly
    ||instance.portalClipPlanes||instance.reflectionOnly||instance.shadowOnly)return false;
  return instance.sourceGlitchEligible===true||(!instance.structural&&instance.roomMemory?.role==='survivor');
}

function objectGlitchTarget(instances,run,seed,eye,centre,previousTarget){
  let target=null,best=Infinity;
  for(const instance of instances){
    if(!objectGlitchCandidate(instance))continue;
    const x=instance.matrix[12],y=instance.matrix[13],z=instance.matrix[14];
    const rank=hash(`object:${seed}:${run}:${instance.id}`);
    let score=rank;
    if(centre){
      score=Math.hypot(x-centre.x,y-centre.y,z-centre.z)+rank*.001;
    }else if(eye){
      const dx=x-eye.x,dz=z-eye.z;
      const distance=Math.hypot(dx,y-eye.y,dz);
      if(distance>28)continue;
      const ahead=(dx*eye.forwardX+dz*eye.forwardZ)/Math.max(1,Math.hypot(dx,dz));
      if(ahead<.35)continue;
      score=distance+rank*5+(1-ahead)*8;
    }
    if(instance.id===previousTarget)score+=6;
    if(score<best||(score===best&&target&&instance.id<target.id)){
      best=score;
      target=instance;
    }
  }
  return target;
}

function objectGlitchDonor(instances,target,run,seed){
  let donor=null,best=Infinity;
  for(const instance of instances){
    if(instance.mesh===target.mesh||!objectGlitchCandidate(instance))continue;
    const distance=Math.hypot(instance.matrix[12]-target.matrix[12],
      instance.matrix[13]-target.matrix[13],instance.matrix[14]-target.matrix[14]);
    const score=distance+hash(`donor:${seed}:${run}:${target.id}:${instance.id}`)*.001;
    if(score<best||(score===best&&donor&&instance.id<donor.id)){
      best=score;
      donor=instance;
    }
  }
  return donor?.mesh??null;
}

const OBJECT_MIX_PERIOD=8;
const OBJECT_ACQUIRE_UNTIL=.45;
const MAX_COMMON_GLITCH_STREAK=2;

function naturalObjectGlitch(target,run,seed){
  const mixPhase=Math.floor(hash(`mix-phase:${seed}`)*OBJECT_MIX_PERIOD)%OBJECT_MIX_PERIOD;
  if((run+mixPhase)%OBJECT_MIX_PERIOD===0)return 3;
  return ordinaryObjectGlitch(target,run,seed);
}

function ordinaryObjectGlitch(target,run,seed){
  const objectPhase=hash(`object-mode:${seed}:${target.id}`)<.5?0:1;
  return 1+(run+objectPhase)%2;
}

// The camera can discover a target near the start of a scored read. Once a
// read has a target, both it and its donor stay fixed through culling and look.
export function applySourceObjectGlitch(instances,frame,{mode,eye=null,centre=null,selection={},objectSeed=frame?.seed}={}){
  const natural=mode===undefined;
  if(!frame?.active||(!natural&&![1,2,3].includes(mode))||frame.flashMode==='off'){
    selection.run=null;
    selection.targetId=null;
    selection.donorMesh=null;
    selection.mode=null;
    selection.previousTarget=null;
    selection.lastCommonMode=null;
    selection.commonStreak=0;
    return instances;
  }
  if(!frame.overflowActive)return instances;
  const run=frame.overflowRun;
  if(selection.run!==run||selection.seed!==objectSeed){
    if(selection.seed!==objectSeed){
      selection.previousTarget=null;
      selection.lastCommonMode=null;
      selection.commonStreak=0;
    }
    selection.run=run;
    selection.seed=objectSeed;
    selection.targetId=null;
    selection.donorMesh=null;
    selection.mode=null;
    selection.countedCommon=false;
  }

  if(!selection.targetId){
    if(natural&&frame.overflowHead>OBJECT_ACQUIRE_UNTIL)return instances;
    const previous=natural?selection.previousTarget:null;
    const target=objectGlitchTarget(instances,run,objectSeed,eye,centre,previous);
    if(!target)return instances;
    selection.targetId=target.id;
    if(natural)selection.previousTarget=target.id;
    selection.mode=mode??naturalObjectGlitch(target,run,objectSeed);
    if(selection.mode===3){
      selection.donorMesh=objectGlitchDonor(instances,target,run,objectSeed);
      if(natural&&!selection.donorMesh)selection.mode=ordinaryObjectGlitch(target,run,objectSeed);
    }
    if(natural&&selection.mode===selection.lastCommonMode&&selection.commonStreak>=MAX_COMMON_GLITCH_STREAK){
      selection.mode=3-selection.mode;
    }
  }

  const index=instances.findIndex(instance=>instance.id===selection.targetId&&objectGlitchCandidate(instance));
  if(index<0)return instances;
  if(!natural&&selection.mode!==mode){
    selection.mode=mode;
    if(mode===3)selection.donorMesh=objectGlitchDonor(instances,instances[index],run,objectSeed);
  }
  const strength=clamp(frame.overflow)*(frame.reduceMotion||frame.flashMode==='reduced'?.58:1);
  if(natural&&strength>0&&selection.mode!==3&&!selection.countedCommon){
    selection.commonStreak=selection.mode===selection.lastCommonMode?selection.commonStreak+1:1;
    selection.lastCommonMode=selection.mode;
    selection.countedCommon=true;
  }
  const seed=hash(`pattern:${objectSeed}:${run}:${selection.targetId}`);
  const result=instances.slice();
  result[index]={...instances[index],sourceFaultExempt:true,
    sourceObjectGlitch:[selection.mode,clamp(frame.overflowHead),strength,seed],
    ...(selection.mode===3&&selection.donorMesh?{sourceObjectGlitchDonor:selection.donorMesh}:{})};
  return result;
}

export function applySourcePs2GeometryFault(instances=[],frame={}){
  if(!frame?.active||!(frame.geometry>0))return instances;
  const strength=clamp(frame.geometry);
  return instances.map((instance,index)=>{
    const matrix=instance?.matrix;
    if((!Array.isArray(matrix)&&!ArrayBuffer.isView(matrix))||matrix.length!==16||instance.sourceFaultExempt)return instance;
    const pick=hash(`${frame.seed}:${frame.slot}:${instance.id||index}`);
    if(pick>.18+strength*.38)return instance;
    const phase=hash(`${instance.id||index}:${frame.slot}:axis`);
    const scale=.84+hash(`${instance.id||index}:${frame.slot}:scale`)*.46;
    const shifted=(hash(`${frame.slot}:${instance.id||index}:shift`)-.5)*.42*strength;
    const next=[...matrix];
    const axis=phase<.5?0:phase<.82?2:1;
    for(let row=0;row<3;row+=1)next[axis*4+row]*=1+(scale-1)*strength;
    if(axis===0)next[4]+=shifted*.42;
    else next[0]+=shifted*.42;
    next[12]+=shifted;
    next[14]-=shifted*.63;
    return{...instance,matrix:next,sourceFaulted:true};
  });
}
