// An organ inside the same loaded landscape. Its involuntary responses are
// sampled from saved simulation time; no wall clock, camera reaction or timer
// can restart them when the player stops, turns round, pauses or reloads.
import {driveLoadAt} from '../deterioration.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*t*(10+t*(-15+6*t));};
export const COSTAL_PHYSIOLOGY=Object.freeze({periodSeconds:13.6,secondsPerMetre:.032,originMetres:768,inhaleSeconds:3.1,holdSeconds:1.1,exhaleEndSeconds:10.7,secretionLagSeconds:1.4});
function organ(timeSec,distance,load){
 const q=((timeSec-(distance-COSTAL_PHYSIOLOGY.originMetres)*COSTAL_PHYSIOLOGY.secondsPerMetre)%13.6+13.6)%13.6;
 const respiration=q<3.1?smooth(0,3.1,q):q<4.2?1:q<10.7?1-smooth(4.2,10.7,q):0;
 const wince=smooth(.04,.72,load.release)*(.65+.35*(1-load.value));
 return{respiration,wince,phase:q<3.1?'inhale':q<4.2?'held':q<10.7?'exhale':'rest'};
}
export function cageSecretionAt({timeSec=0,furthest=0,distance=850,index=0,load=null}={}){
 load??=driveLoadAt({timeSec,furthest,distance});
 const age=timeSec-load.releaseStartTimeSec-COSTAL_PHYSIOLOGY.secretionLagSeconds-Math.max(0,index)*.37;
 const bead=smooth(0,1.5,age)*(1-smooth(3.1,5.2,age)),extension=smooth(1.0,3.3,age)*(1-smooth(4.8,6.6,age));
 const fall=smooth(3.3,5.2,age),drop=smooth(2.8,3.3,age)*(1-smooth(5.0,5.25,age));
 const secretion=clamp(.20+.32*load.innerValue+.42*bead),drip=drop*fall;
 return{schema:1,age,bead,extension,drop,fall,secretion,drip,residue:load.event>0?1:smooth(4.7,5.2,age),phase:age<0?'well':age<1.5?'swell':age<3.3?'neck':age<5.25?'release':'residue',event:load.event};
}
export function cagePhysiologyAt({timeSec=0,furthest=0,distance=850,load=null}={}){
 load??=driveLoadAt({timeSec,furthest,distance});
 const current=organ(timeSec,distance,load),e=.025,lo=Math.max(0,timeSec-e),hi=timeSec+e;
 const a=organ(lo,distance,driveLoadAt({timeSec:lo,furthest,distance})),b=organ(hi,distance,driveLoadAt({timeSec:hi,furthest,distance})),dt=hi-lo;
 const lagTime=Math.max(0,timeSec-.85),lag=organ(lagTime,distance,driveLoadAt({timeSec:lagTime,furthest,distance}));
 const wet=cageSecretionAt({timeSec,furthest,distance,load});
 return{schema:1,timeSec,distance,activity:load.anatomyReveal,...current,inhaleVelocity:(b.respiration-a.respiration)/dt,winceVelocity:(b.wince-a.wince)/dt,
  secretion:wet.secretion,drip:wet.drip,bead:wet.bead,extension:wet.extension,residue:wet.residue,secretoryPhase:wet.phase,
  recovery:clamp(lag.wince*(1-current.wince)),clock:'saved programme / rooted anatomical response',rootTranslation:[0,0,0]};
}
