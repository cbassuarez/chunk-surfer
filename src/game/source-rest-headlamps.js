import {SOURCE_REST_PERFORMANCE} from '../data/source-rest-performance.js';

// The van's lamps are the listener's last steady light. They fade with the
// conversation and go dark at the authored 96% blackout. Where the performer
// marked mistakes (the Chaconne), each one browns them out for a moment and
// the grueling passages make them stutter. The Couperin has no marked
// mistakes, so its lamps follow the conversation alone; none are invented.
const number=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,number(value)));
const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
const mistakes=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='mistake').map(row=>row.start).sort((a,b)=>a-b);
const passages=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='grueling').map(row=>[row.start,row.endPolicy==='track-end'?SOURCE_REST_PERFORMANCE.duration:row.end]);
export const SOURCE_REST_HEADLAMPS=Object.freeze({blackout:.96,fadeFrom:.2,fadeDepth:.65,brownoutSeconds:.7,brownoutDepth:.78});

export function sourceRestHeadlampPower({time=0,progress=0,marked=true,reducedMotion=false}={}){
  const p=clamp(progress),t=Math.max(0,number(time));
  if(p>=SOURCE_REST_HEADLAMPS.blackout)return 0;
  let power=1-SOURCE_REST_HEADLAMPS.fadeDepth*smooth(SOURCE_REST_HEADLAMPS.fadeFrom,SOURCE_REST_HEADLAMPS.blackout,p);
  if(marked){
    let lo=0,hi=mistakes.length;while(lo<hi){const mid=(lo+hi)>>1;if(mistakes[mid]<=t)lo=mid+1;else hi=mid;}
    for(let i=lo-1;i>=0;i--){const age=t-mistakes[i];if(age>SOURCE_REST_HEADLAMPS.brownoutSeconds)break;
      power*=1-SOURCE_REST_HEADLAMPS.brownoutDepth*Math.exp(-age/.22)*(reducedMotion?.5:1);}
    const inside=passages.some(([a,b])=>t>=a&&t<=b);
    if(inside)power*=reducedMotion?.72:.62+.38*(Math.sin(t*17.3+Math.sin(t*5.1)*2.4)>-.35?1:.25);
  }else if(!reducedMotion&&p>.7){
    // Late in the Catch the dying battery catches without a performer's cue.
    power*=1-.5*smooth(.7,.95,p)*(Math.sin(t*11.7+Math.sin(t*2.3)*3)>.6?1:0);
  }
  return clamp(power);
}
