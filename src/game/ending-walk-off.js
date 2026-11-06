// How The Other Recordist closes. Ruled by Seb: you and Alan walk to the van as the
// game fades out, and you fade out before him. Every other ending drives off.
//
// First person, then third, then black, the same as the drive, but on foot and with
// someone beside you. The van stands on the road with its lamps on, facing you. Nothing
// says why, and nothing says which of you was ever going to get there.
//
// It can't fail or stall. You can stop, and he stops with you, but the walk picks up by
// itself, the road only goes one way, and there is a limit under all of it.
import {createDrive} from './source-drive/drive-state.js';
import {createDriveWeather,stepDriveWeather} from './source-drive/weather.js';
import {openingWorldAt} from './source-drive/opening-road.js';
import {driveEvolutionFrame} from './source-drive/evolution.js';
import {RECORDIST_WALK_SPEED} from '../render/recordist-release.js';

export const ENDING_WALK_OFF=Object.freeze({
  endings:Object.freeze(['surfaced']),
  // A straight stretch with nothing else standing on it.
  startDistance:-112,vanDistance:-72,
  youLateral:-1.2,alanLateral:.2,alanAhead:1.8,
  darkSeconds:1.4,pictureSeconds:1.6,
  // Let go and you stop, and then you find you have started walking again.
  handsOffSeconds:4,walkMetres:13,walkLimitSeconds:30,
  releaseSeconds:6,youSeconds:6.5,himSeconds:8.5,himFadeSeconds:4,
  coverSeconds:2.2,holdSeconds:2.5,skipSeconds:1.1,skipCoverSeconds:.5,
});
const C=ENDING_WALK_OFF,STEP=1/120,LEAN=.0024;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),finite=(v,f=0)=>Number.isFinite(v)?v:f;
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);},ease=x=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};

export const endingWalkOffOwed=id=>C.endings.includes(id);

export function createEndingWalkOff({reducedMotion=false}={}){
  // The van is a parked drive state turned to face back along the road.
  const seat=openingWorldAt(C.vanDistance,-1.2),drive=createDrive(),weather=createDriveWeather({rain:.62,initialWetness:.38,seed:1947});
  Object.assign(drive,{x:seat.x,z:seat.z,heading:seat.heading+Math.PI,roadHeight:seat.y||0,speed:0,throttle:0,engineLoad:.08,station:'service',radioOn:false,volume:.65,programTime:0,paused:false,parked:true,brakeHold:true});
  let phase='dark',time=0,phaseTime=0,remainder=0,walked=0,gaitTime=0,handsOff=0,walkTime=0,walking=false,paused=false,skipping=false,skipTime=0,skipCover=0,look={yaw:0,pitch:-.05},forward=false;
  const enter=next=>{phase=next;phaseTime=0;};
  const controls=()=>phase==='walk'&&!skipping&&!paused;
  function step(h){
    time+=h;phaseTime+=h;
    if(skipping){skipCover=Math.min(1,skipCover+h/C.skipCoverSeconds);if(skipCover>=1)enter('done');return;}
    if(phase==='hold'){if(phaseTime>=C.holdSeconds)enter('done');return;}
    if(phase==='walk'){
      walkTime+=h;handsOff=forward?0:handsOff+h;
      walking=forward||handsOff>=C.handsOffSeconds;
      if(walked>=C.walkMetres||walkTime>=C.walkLimitSeconds)enter('release');
    }else walking=phase==='release'||phase==='you'||phase==='him'||phase==='out';
    if(phase==='dark'&&phaseTime>=C.darkSeconds)enter('walk');
    if(phase==='release'&&phaseTime>=C.releaseSeconds)enter('you');
    if(phase==='you'&&phaseTime>=C.youSeconds)enter('him');
    if(phase==='him'&&phaseTime>=C.himSeconds)enter('out');
    if(phase==='out'&&phaseTime>=C.coverSeconds)enter('hold');
    if(walking){walked+=RECORDIST_WALK_SPEED*h;gaitTime+=h;}
    drive.programTime=finite(drive.programTime)+h;
    stepDriveWeather(weather,{...driveEvolutionFrame(drive).weather,rain:.68,fog:.05,snow:0,whiteout:0,dt:h,timeSec:drive.programTime,wipers:false,speed:0});
  }
  function view(){
    const release=phase==='release'?phaseTime/C.releaseSeconds:['you','him','out','hold','done'].includes(phase)?1:0,
      youFade=phase==='you'?smooth(phaseTime/C.youSeconds):['him','out','hold','done'].includes(phase)?1:0,
      alanFade=phase==='him'?smooth((phaseTime-(C.himSeconds-C.himFadeSeconds))/C.himFadeSeconds):['out','hold','done'].includes(phase)?1:0,
      total=C.walkMetres+RECORDIST_WALK_SPEED*(C.releaseSeconds+C.youSeconds+C.himSeconds),
      coverIn=phase==='dark'?1:phase==='walk'?1-smooth(phaseTime/C.pictureSeconds):0,coverOut=phase==='out'?smooth(phaseTime/C.coverSeconds):phase==='hold'||phase==='done'?1:0;
    return{phase,time,phaseTime,done:phase==='done',walked,gaitTime,walking,handsOff,controlsEnabled:controls(),
      // The world goes as you walk it, and coming to a stop doesn't bring it back.
      gone:smooth(walked/(total*.72)),youFade,alanFade,
      dolly:reducedMotion?(release<.5?0:1):ease(release),
      youDistance:C.startDistance+walked,alanDistance:C.startDistance+walked+C.alanAhead,
      cover:Math.max(coverIn,coverOut,skipCover),look:{...look},reducedMotion,skipping,skipTime};
  }
  return{
    drive,weather,view,
    update(dt,{held=false,skipHeld=false}={}){
      paused=!!held;if(paused||phase==='done')return view();
      const elapsed=Math.max(0,finite(dt));
      if(!skipping){skipTime=skipHeld?skipTime+elapsed:0;if(skipTime>=C.skipSeconds){skipping=true;forward=false;}}
      remainder+=Math.min(.25,elapsed);
      while(remainder+1e-10>=STEP&&phase!=='done'){step(STEP);remainder=Math.max(0,remainder-STEP);}
      return view();
    },
    input(action,pressed=true){
      if(action!=='forward')return ['reverse','left','right','brake'].includes(action);
      if(!pressed){forward=false;return true;}
      if(!controls())return false;
      forward=true;handsOff=0;return true;
    },
    lookDelta(dx=0,dy=0){if(!controls())return false;look={yaw:clamp(look.yaw+finite(dx)*LEAN,-1.1,1.1),pitch:clamp(look.pitch-finite(dy)*LEAN,-.6,.4)};return true;},
    releaseInput(){forward=false;},
    snapshot(){return view();},
    finish(){if(phase!=='done')enter('done');},
  };
}
