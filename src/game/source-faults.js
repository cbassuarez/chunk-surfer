const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));

function hash(value=''){
  let out=0x811c9dc5;
  for(const char of String(value))out=Math.imul(out^char.charCodeAt(0),16777619)>>>0;
  return out/0xffffffff;
}

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
  const nvme=clamp(.34+transition*.48);
  const ps2=clamp(.22+transition*.66);
  const now=Math.max(0,Number(timeMs)||0);
  const slot=reducedMotion?0:Math.floor(now/(transition>.01?170:420));

  // Constant random sector replacement reads as texture. A bad-sector RUN is
  // a scored event: one coherent train of failed blocks crosses a lane, holds
  // pieces of the previous frame behind its head, and reassembles. It begins
  // only in Source proper—not on the page, Scene Dock, or white approach—and
  // recurs quickly enough that a player cannot finish the space without seeing
  // one. Seeded phase/lane/direction keep capture and tests reproducible.
  const runPeriodMs=4600;
  const runDurationMs=1450;
  const offset=hash(`overflow:${seed}`)*runPeriodMs;
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
  const overflowLane=Math.min(3,Math.floor(hash(`${seed}:${overflowRun}:lane`)*4));
  const overflowDirection=hash(`${seed}:${overflowRun}:direction`)<.5?-1:1;
  return Object.freeze({
    active:true,nvme,ps2,transition,geometry:clamp(.12+transition*.44),slot,seed,
    overflow:envelope*.96,overflowActive,overflowHead,overflowLane,overflowDirection,overflowRun,
    reduceMotion:!!reducedMotion,flashMode:['full','reduced','off'].includes(flashMode)?flashMode:'full',
  });
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
