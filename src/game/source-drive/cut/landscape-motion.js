// Geometry owns the motion envelope and fixed roots. This controller only
// drives the four authored morph targets from the saved simulation clock.
import {driveLoadAt} from '../deterioration.js';
import {cagePhysiologyAt,COSTAL_PHYSIOLOGY} from './physiology.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v);return t*t*t*(10+t*(-15+6*t));};
function value(frame,key,fallback){return Number.isFinite(frame?.[key])?clamp(frame[key]):fallback;}

export function ribPose({timeSec=0,furthest=0,distance=850,id='cut-rib',evolution=null}={}){
 if(![timeSec,furthest,distance].every(Number.isFinite)||timeSec<0)throw Error('Landscape motion needs finite simulation time, maximum distance and placement.');
 const reveal=value(evolution,'reveal',smooth((furthest-590)/220));
 const ribs=value(evolution,'ribcage',smooth((furthest-695)/195)),wave=value(evolution,'wave',smooth((furthest-650)/230));
 // A load travels through the excavation, then the deeper sheet continues
 // slipping after its visible outer attachment has caught. Long, unequal
 // rest/effort windows prevent a landscape-sized breathing loop.
 const load=driveLoadAt({timeSec,furthest,distance}),physiology=cagePhysiologyAt({timeSec,furthest,distance,load});
 const activation=reveal*Math.max(ribs,wave*.72);
 const tension=activation*(.08+.76*physiology.respiration+.12*load.value);
 const shear=activation*(.04+.82*physiology.wince+.10*load.innerValue);
 // Both water and anatomy use breath as an authored, persistent large shape.
 // The load rides in the other channels; the vault cannot refold on a rest.
 const breath=ribs;
 const recoil=activation*(.04+.18*(1-physiology.respiration)+.55*physiology.recovery);
 return{joints:{},morphs:{tension:clamp(tension),shear:clamp(shear),breath:clamp(breath),recoil:clamp(recoil)},
  // Optional scalar hints never translate a root or close the driveable gap.
  ribOpening:clamp(ribs*(.64+.22*load.value)),waveCurl:clamp(wave*(.57+.31*load.value)),sheetShear:clamp(shear),
  motion:{clock:'programTime',timeSec,furthest,distance,id,activation,rootTranslation:[0,0,0],load,physiology,phases:{outer:load.phase,inner:load.innerPhase,wave:load.phase,organ:physiology.phase}}};
}

// Organs share the cage's saved clock and irreversible unfolding. Cardiac
// contraction uses the existing tension target on the heart and its attached
// coronary tree; their shear target is a small respiratory ride authored into
// the asset. Other tissues keep the cage's respiratory/wince target meanings.
export const COSTAL_CARDIAC=Object.freeze({periodSeconds:1.22,contractionSeconds:.11,releaseSeconds:.36,secondaryStartSeconds:.34,secondaryPeakSeconds:.40,secondaryEndSeconds:.60});
export function anatomyOrganPose(mesh,options={}){
 const pose=ribPose(options),cardiac=mesh==='cut_heart'||mesh==='cut_coronary_vessels';
 if(!cardiac)return{...pose,motion:{...pose.motion,anatomyRole:'respiratory'}};
 const phase=((pose.motion.timeSec-(pose.motion.distance-COSTAL_PHYSIOLOGY.originMetres)*COSTAL_PHYSIOLOGY.secondsPerMetre)%COSTAL_CARDIAC.periodSeconds+COSTAL_CARDIAC.periodSeconds)%COSTAL_CARDIAC.periodSeconds;
 const main=smooth(phase/COSTAL_CARDIAC.contractionSeconds)*(1-smooth((phase-COSTAL_CARDIAC.contractionSeconds)/(COSTAL_CARDIAC.releaseSeconds-COSTAL_CARDIAC.contractionSeconds)));
 const secondary=.24*smooth((phase-COSTAL_CARDIAC.secondaryStartSeconds)/(COSTAL_CARDIAC.secondaryPeakSeconds-COSTAL_CARDIAC.secondaryStartSeconds))*(1-smooth((phase-COSTAL_CARDIAC.secondaryPeakSeconds)/(COSTAL_CARDIAC.secondaryEndSeconds-COSTAL_CARDIAC.secondaryPeakSeconds)));
 const pulse=clamp(main+secondary),activation=pose.motion.activation;
 return{...pose,morphs:{...pose.morphs,tension:activation*(.06+.88*pulse),shear:activation*(.08+.78*pose.motion.physiology.respiration)},motion:{...pose.motion,anatomyRole:'cardiac',cardiac:{phase,pulse,periodSeconds:COSTAL_CARDIAC.periodSeconds}}};
}

// Wave breath is its authored, irreversible macro deformation from rolling
// bank to arrested curl. It must never ebb with the short muscle effort.
export function heldWavePose(options={}){
 const pose=ribPose({...options,id:options.id||'cut-held-wave'});
 const wave=value(options.evolution,'wave',smooth(((options.furthest||0)-650)/230));
 pose.morphs.breath=wave;pose.waveCurl=wave;
 const load=pose.motion.load,activation=value(options.evolution,'reveal',smooth(((options.furthest||0)-590)/220))*Math.max(value(options.evolution,'ribcage',smooth(((options.furthest||0)-695)/195)),wave*.72);
 pose.morphs.tension=activation*(.12+.70*load.value)*.72;pose.morphs.shear=activation*(.06+.75*load.innerValue)*.62;pose.morphs.recoil=activation*(.055+.60*Math.max(load.release*(1-.7*load.value),load.innerRelease*.6))*.5;
 delete pose.motion.physiology;
 pose.motion.kind='held-wave';return pose;
}
