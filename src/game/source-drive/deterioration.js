// One pressure front passes from weather into water and then the anatomy.
// Sample at a world placement, never at a mesh ID or the wall clock. The same
// saved programme second therefore means the same strain on return/reload.
import {cutEffort} from './cut/motion.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*t*(10+t*(-15+6*t));};
export const DRIVE_LOAD_FIELD=Object.freeze({version:1,originMetres:640,secondsPerMetre:.055,periodSeconds:61,seed:32452843,innerLagSeconds:5.4,phaseOffsetSeconds:17.3});
function effort(timeSec,distance,lag=0){return cutEffort(timeSec-(distance-DRIVE_LOAD_FIELD.originMetres)*DRIVE_LOAD_FIELD.secondsPerMetre-lag+DRIVE_LOAD_FIELD.phaseOffsetSeconds,DRIVE_LOAD_FIELD.seed,DRIVE_LOAD_FIELD.periodSeconds);}
export function driveLoadAt({timeSec=0,furthest=0,distance=0}={}){
 if(![timeSec,furthest,distance].every(Number.isFinite)||timeSec<0)throw Error('The drive pressure field requires finite simulation seconds and route metres.');
 const e=effort(timeSec,distance),inner=effort(timeSec,distance,DRIVE_LOAD_FIELD.innerLagSeconds),epsilon=.025;
 const velocity=(effort(timeSec+epsilon,distance).value-effort(timeSec-epsilon,distance).value)/(2*epsilon);
 const innerVelocity=(effort(timeSec+epsilon,distance,DRIVE_LOAD_FIELD.innerLagSeconds).value-effort(timeSec-epsilon,distance,DRIVE_LOAD_FIELD.innerLagSeconds).value)/(2*epsilon);
 const storm=smooth(130,650,furthest),waterReveal=smooth(300,680,furthest),anatomyReveal=smooth(570,785,furthest),aftermathReveal=smooth(930,1134,furthest);
 // The domains overlap substantially. There is no weather→water or water→body
 // switch at a waypoint; spatial departure does not undo the remembered form.
 const water=waterReveal*smooth(300,610,distance)*(1-smooth(950,1200,distance));
 const anatomy=anatomyReveal*smooth(600,800,distance)*(1-smooth(955,1175,distance));
 const aftermath=aftermathReveal*smooth(920,1134,distance);
 const squall=clamp(.18+.60*e.value+.22*e.release);
 const releaseStartTimeSec=e.event*DRIVE_LOAD_FIELD.periodSeconds+e.durations.wait+e.durations.load+e.durations.hold+(distance-DRIVE_LOAD_FIELD.originMetres)*DRIVE_LOAD_FIELD.secondsPerMetre-DRIVE_LOAD_FIELD.phaseOffsetSeconds;
 return{schema:1,timeSec,distance,furthest,value:e.value,velocity,release:e.release,phase:e.phase,event:e.event,releaseStartTimeSec,
  innerValue:inner.value,innerVelocity,innerRelease:inner.release,innerPhase:inner.phase,
  storm,water,anatomy,aftermath,squall,waterReveal,anatomyReveal,aftermathReveal};
}
