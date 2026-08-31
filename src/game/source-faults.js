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
  reducedMotion=false,flashMode='full',seed=193,
}={}){
  if(!sourcePhase||horizon)return Object.freeze({active:false,nvme:0,ps2:0,transition:0,geometry:0,slot:0,seed,reduceMotion:!!reducedMotion,flashMode});
  const transition=Number.isFinite(transitionElapsedMs)?1-clamp(transitionElapsedMs/2200):0;
  const nvme=clamp(.34+transition*.48);
  const ps2=clamp(.22+transition*.66);
  const slot=reducedMotion?0:Math.floor(Math.max(0,Number(timeMs)||0)/(transition>.01?170:420));
  return Object.freeze({
    active:true,nvme,ps2,transition,geometry:clamp(.12+transition*.44),slot,seed,
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
