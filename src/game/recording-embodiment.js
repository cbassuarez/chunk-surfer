// The recorder and take hunter own elapsed time, STOP, noise and consequences.
// This performance observes their actual state. A rejected STOP is a visible
// counterforce, never a false release or a second input/transport authority.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export const RECORDING_EMBODIMENT=Object.freeze({
  settleProgress:.10,contactProgress:.35,seatedProgress:.55,pullProgress:.55,fullProgress:.72,
  releaseSeconds:.42,maximumStepSeconds:.08,approachRate:1.6,scoreCatchupRate:1.1,
  rejectedPressSeconds:.24,
  asset:'assets/source-rest/seated-hands.glb',sourceLicense:'CC0-1.0',
  additionalLights:0,additionalAudio:0,damage:0,changesStopPermission:false,
});
const transportFrame=value=>({
  phase:['normal','drag','seized'].includes(value?.phase)?value.phase:'normal',
  tries:Math.max(0,Math.floor(Number(value?.tries)||0)),
  needs:Math.max(0,Math.floor(Number(value?.needs)||0)),quietReleased:!!value?.quietReleased,
});
const noPull=()=>({active:false,strength:0,left:{strength:0,traction:0},right:{strength:0,traction:0}});
const empty=()=>({active:false,takeId:null,phase:'absent',progress:0,performanceProgress:0,proximity:0,
  grip:0,pull:0,presence:0,release:0,reducedMotion:false,reducedDread:false,
  transport:transportFrame(),hands:[],viewPull:noPull()});
const identity=value=>value===null||value===undefined?'':String(value);

function handPerformance(side,score,presence,recoil,seized){
  const left=side==='left',seat=smooth((score-(left?.31:.40))/(left?.19:.16)),
    traction=smooth((score-(left?.52:.59))/(left?.18:.13)),
    handPresence=presence*smooth((score-(left?.10:.18))/.16),
    // Different contacts, not two copies of one glove. Only the source's
    // retained brace morph is used; these are pose weights, not new anatomy.
    // Keep the distal phalanges separate. The previous near-closed brace
    // merged four digits into one boot-like toe in the acquired silhouette.
    brace=clamp((left?.10:.06)+seat*(left?.20:.13)+traction*(left?.08:.10)
      +(seized?(left?.02:.04):0)+recoil*(left?.06:.04),0,.52);
  return{side,presence:handPresence,seat,traction,brace,recoil,
    contact:seat>.025,resistance:seized?1:0};
}

export function createRecordingEmbodiment(){
  let state=empty(),released=false,pressPulse=0;
  function snapshot(){return{...state,transport:{...state.transport},hands:state.hands.map(h=>({...h})),
    viewPull:{...state.viewPull,left:{...state.viewPull.left},right:{...state.viewPull.right}}};}
  function reset(){state=empty();released=false;pressPulse=0;return snapshot();}
  function update(dt=0,input={}){
    // Accessibility suppression wins even during suspension. Everything else
    // freezes on foreground simulation time, including a refused press's grip.
    const disabled=input.effectsMode==='off'||input.enabled===false||input.tutorial||input.slating||input.lightOn;
    if(disabled)return reset();
    if(input.suspended||input.stalled)return snapshot();
    const step=clamp(dt,0,RECORDING_EMBODIMENT.maximumStepSeconds),
      id=identity(input.takeId),recording=!!input.recording&&!!id;
    if(recording){
      if(state.takeId!==id||released){state={...empty(),takeId:id};released=false;pressPulse=0;}
      const transport=transportFrame(input.transport),previous=state.transport,
        rejectedPress=transport.phase==='seized'&&transport.tries>previous.tries,
        seized=transport.phase==='seized'&&!transport.quietReleased;
      pressPulse=rejectedPress?1:Math.max(0,pressPulse-step/RECORDING_EMBODIMENT.rejectedPressSeconds);
      const progress=clamp(input.takeProgress),
        // Observing a dragging machine can bring these same hands into contact.
        // It cannot arm a hunter, move the take clock or spend paused time.
        target=Math.max(progress,seized?.66:transport.phase==='drag'?.44:0);
      state.performanceProgress=Math.max(state.performanceProgress,
        Math.min(target,state.performanceProgress+step*RECORDING_EMBODIMENT.scoreCatchupRate));
      const score=state.performanceProgress,
        approach=smooth((score-RECORDING_EMBODIMENT.settleProgress)
          /(RECORDING_EMBODIMENT.fullProgress-RECORDING_EMBODIMENT.settleProgress));
      state.proximity=Math.min(approach,state.proximity+step*RECORDING_EMBODIMENT.approachRate);
      state.progress=progress;state.transport=transport;
      state.reducedMotion=!!input.reducedMotion;state.reducedDread=!!input.reducedDread;
      state.presence=smooth((score-.10)/.16);state.release=0;
      state.hands=['left','right'].map(side=>handPerformance(side,score,state.presence,pressPulse,seized));
      state.grip=Math.max(...state.hands.map(hand=>hand.seat));
      state.pull=Math.max(...state.hands.map(hand=>hand.traction));
      state.active=state.presence>0&&state.proximity>0;
      state.phase=seized?'braced':score<.35?'approach':score<.55?'seat':score<.72?'strain':'draw-back';
      const gain=state.reducedDread?.55:1,
        pullFor=side=>{const hand=state.hands.find(h=>h.side===side);return{
          strength:state.active&&!state.reducedMotion?hand.presence*(.18*hand.seat+.82*hand.traction)*gain:0,
          traction:hand.traction*gain};};
      state.viewPull={active:state.active&&!state.reducedMotion,strength:0,left:pullFor('left'),right:pullFor('right')};
      state.viewPull.strength=Math.max(state.viewPull.left.strength,state.viewPull.right.strength);
      state.viewPull.active=state.viewPull.active&&state.viewPull.strength>0;
      return snapshot();
    }
    if(!state.active||state.reducedMotion)return reset();
    // Only an actual closed/spoiled/interrupted take releases the hands. A
    // resisted STOP still arrives above as recording:true with new try count.
    released=true;state.release=clamp(state.release+step/RECORDING_EMBODIMENT.releaseSeconds);
    state.phase='release';
    if(state.release>=1)return reset();
    return snapshot();
  }
  return{update,snapshot,reset};
}
