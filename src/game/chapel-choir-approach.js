import { chapelChoirVocalEnergy } from './chapel-choir-performance.js';

export const CHAPEL_CHOIR_APPROACH=Object.freeze({
  triggerDistanceM:15,releaseDistanceM:20,holdSeconds:1.4,fadeSeconds:8,
  fervourSeconds:24,maxOcclusionDb:30,
});
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};

// A local performance begins in response to a nearby living visitor. Its
// phrase and accumulated vocal effort follow AudioContext time, not render dt.
// Protection holds that clock. A distant/other-floor visit starts quietly anew.
export function createChapelChoirApproach({duration=88,phaseOffset=0}={}){
  let lastTime=null,lastPresented=false,nearSeconds=0,engaged=false,elapsed=0,fervour=0;
  const snapshot=(extra={})=>({engaged,elapsed,phase:engaged?((elapsed+phaseOffset)%duration+duration)%duration:0,
    arrivalEnvelope:engaged?smooth(elapsed/CHAPEL_CHOIR_APPROACH.fadeSeconds):0,fervour,
    stage:engaged?(elapsed<8?'gathering':fervour<.7?'singing':'fervent'):'waiting',...extra});
  function reset(){lastTime=null;lastPresented=false;nearSeconds=0;engaged=false;elapsed=0;fervour=0;return snapshot();}
  function update({now,active=false,muted=false,distance=Infinity}={}){
    if(!Number.isFinite(now))return snapshot({held:true});
    const delta=lastTime==null?0:Math.max(0,now-lastTime);lastTime=now;
    if(!active||!Number.isFinite(distance)||distance>CHAPEL_CHOIR_APPROACH.releaseDistanceM){
      nearSeconds=0;engaged=false;elapsed=0;fervour=0;lastPresented=false;return snapshot();
    }
    const presented=!muted;
    const step=presented&&lastPresented?delta:0;lastPresented=presented;
    if(!engaged){
      nearSeconds=distance<=CHAPEL_CHOIR_APPROACH.triggerDistanceM?nearSeconds+step:0;
      if(nearSeconds>=CHAPEL_CHOIR_APPROACH.holdSeconds){engaged=true;elapsed=0;fervour=0;}
      return snapshot({held:!presented});
    }
    if(step>0){
      // Integrate the raw human vocal energy, never PWM/electronic gain. This
      // makes sustained singing the cause of ascent rather than wall-clock age.
      const samples=Math.min(400,Math.max(1,Math.ceil(step*20))),dt=step/samples;
      for(let i=0;i<samples;i++){
        const phase=((elapsed+phaseOffset)%duration+duration)%duration,energy=chapelChoirVocalEnergy(phase);
        const voice=smooth((energy-.045)/.26),envelope=smooth(elapsed/CHAPEL_CHOIR_APPROACH.fadeSeconds);
        fervour=clamp(fervour+dt*(voice*envelope/CHAPEL_CHOIR_APPROACH.fervourSeconds-(voice<.06?1/9:0)));
        elapsed+=dt;
      }
    }
    return snapshot({held:!presented});
  }
  return{update,snapshot,reset};
}
