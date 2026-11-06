// DRIVING OFF. What closes every ending: first person, then third, then black,
// then credits. The same van and road as the opening, and it says nothing. A man
// driving home, a man leaving his body, and a van going nowhere are all the same
// shot, and nothing on screen chooses. See docs/plans/last-minutes.md.
//
// No rendering, no audio and no save: the return is already filed by the time this
// runs, so a reload simply lands on the queued report.
import {createDrive,stepDrive} from './source-drive/drive-state.js';
import {driveEvolutionFrame} from './source-drive/evolution.js';
import {createDriveWeather,stepDriveWeather} from './source-drive/weather.js';
import {openingRoadAt,openingRoadSurfaceAt,openingWorldAt,openingDriveColliders} from './source-drive/opening-road.js';
import {multiply,rotation} from './source-drive/scene.js';
import {resetWheelHands} from './source-drive/geometry/wheel-hands-pose.js';

export const ENDING_DRIVE_OFF=Object.freeze({
  // All of them. In the first four he is physically out when the last line is said.
  // In the rest his body stays behind or the text says so, and he drives off anyway,
  // unchanged and unexplained: endings do not sublate this, and the player has to
  // hold both. The century stay and the bench arrive under `sacrifice` and
  // `contact-lost`. See docs/plans/last-minutes.md, stage 2.
  endings:Object.freeze(['inversion','drugged','surfaced','tower-won','sacrifice','helped','contact-won','contact-lost','tower-lost']),
  // On the opening's own approach road. It stops long before the break at d297.
  startDistance:-600,startSpeed:11,cruise:13,
  engineSeconds:1.4,pictureSeconds:1.4,
  // The world goes with distance, and coming back doesn't return it.
  goneFrom:-500,goneTo:-270,releaseAt:-205,
  // Nobody can be left driving forever, however slowly they go.
  roadLimit:75,goneByTime:Object.freeze([55,67]),
  // Let go, and the van carries on along the road.
  handsOffSeconds:7,
  releaseSeconds:6.5,awaySeconds:9,coverSeconds:2.2,holdSeconds:2.5,
  skipSeconds:1.1,skipCoverSeconds:.5,
});
const C=ENDING_DRIVE_OFF,STEP=1/120,PIVOT=.85;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),finite=(v,f=0)=>Number.isFinite(v)?v:f;
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);},ease=x=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const INPUTS=Object.freeze(['forward','reverse','left','right','brake']);

export const endingDriveOffOwed=id=>C.endings.includes(id);

function bodyAt(position,heading,pitch,roll=0){
  const m=multiply(rotation(0,-heading),rotation(pitch,0,roll));
  m[12]=32+position.x-m[4]*PIVOT;m[13]=position.y+PIVOT-m[5]*PIVOT;m[14]=32+position.z-m[6]*PIVOT;
  return Array.from(m);
}
export function createEndingDriveOff({reducedMotion=false}={}){
  const drive=createDrive(),weather=createDriveWeather({rain:.62,initialWetness:.38,seed:1947}),seed=openingRoadAt(C.startDistance),keys=new Set();
  Object.assign(drive,{x:seed.x,z:seed.z,heading:seed.heading,roadHeight:seed.height,speed:C.startSpeed,throttle:.45,engineLoad:.35,station:'service',radioOn:false,volume:.65,programTime:0,paused:false});
  let phase='engine',time=0,phaseTime=0,remainder=0,reach=C.startDistance,handsOff=0,roadTime=0,paused=false,skipping=false,skipTime=0,skipCover=0;
  let look={yaw:0,pitch:-.035};
  resetWheelHands();
  const enter=next=>{phase=next;phaseTime=0;keys.clear();};
  const surface=()=>openingRoadSurfaceAt(drive.x,drive.z);
  const controls=()=>phase==='road'&&!skipping&&!paused;
  const lateralAt=r=>{const a=openingWorldAt(r.distance,0);return{road:a,lateral:(drive.x-a.x)*Math.cos(a.heading)+(drive.z-a.z)*Math.sin(a.heading)};};
  // While nobody is steering, the road quietly does. A closing beat cannot be lost
  // on a guardrail, and the moment a hand turns the wheel this lets go.
  function assist(h){
    const{road,lateral}=lateralAt(surface()),target=road.heading-clamp(lateral*.22,-.4,.4);
    drive.heading+=angleDelta(target,drive.heading)*Math.min(1,h*2.4);
  }
  // Along the road without a driver: drifts back to the middle, holds its speed.
  function carry(h){
    const r=surface(),{road:a,lateral}=lateralAt(r);
    drive.speed+=(C.cruise-drive.speed)*Math.min(1,h*.7);
    const next=openingWorldAt(r.distance+drive.speed*h,lateral*(1-Math.min(1,h*.55)));
    drive.heading+=angleDelta(next.heading,drive.heading)*Math.min(1,h*5);
    Object.assign(drive,{x:next.x,z:next.z,roadHeight:next.y,lateralSpeed:0,yawRate:0,throttle:.42,engineLoad:.34,brakeAmount:0,brakeHold:false,gear:1});
    drive.wheelRotation=finite(drive.wheelRotation)+drive.speed/.34*h;
    drive.wheelAngle=finite(drive.wheelAngle)*(1-Math.min(1,h*2));drive.steeringWheelAngle=finite(drive.steeringWheelAngle)*(1-Math.min(1,h*2));
    drive.bodyRoll=finite(drive.bodyRoll)*(1-Math.min(1,h*2));drive.bodyPitch=finite(drive.bodyPitch)*(1-Math.min(1,h*2));
    drive.programTime=finite(drive.programTime)+h;
  }
  function step(h){
    time+=h;phaseTime+=h;
    if(skipping){skipCover=Math.min(1,skipCover+h/C.skipCoverSeconds);if(skipCover>=1)enter('done');return;}
    if(phase==='engine'){carry(h);if(phaseTime>=C.engineSeconds)enter('road');}
    else if(phase==='road'){
      roadTime+=h;handsOff=keys.size?0:handsOff+h;
      if(handsOff>=C.handsOffSeconds)carry(h);
      else{
        stepDrive(drive,h,Object.fromEntries([...keys].map(k=>[k,true])),openingDriveColliders(drive),{roadSampler:openingRoadSurfaceAt});
        if(!keys.has('left')&&!keys.has('right'))assist(h);
      }
      if(surface().distance>=C.releaseAt||roadTime>=C.roadLimit)enter('release');
    }
    else if(phase==='release'){carry(h);if(phaseTime>=C.releaseSeconds)enter('away');}
    else if(phase==='away'){carry(h);if(phaseTime>=C.awaySeconds)enter('hold');}
    else if(phase==='hold'){if(phaseTime>=C.holdSeconds)enter('done');return;}
    reach=Math.max(reach,surface().distance);
    stepDriveWeather(weather,{...driveEvolutionFrame(drive).weather,rain:.68,fog:.05,snow:0,whiteout:0,dt:h,timeSec:drive.programTime,wipers:true,speed:drive.speed});
  }
  function pose(){
    const r=surface(),delta=drive.heading-r.heading,n=r.surfaceNormal,
      grade=n?-(n[0]*Math.sin(drive.heading)-n[2]*Math.cos(drive.heading))/Math.max(.05,n[1]):r.grade*Math.cos(delta),
      cross=n?-(n[0]*Math.cos(drive.heading)+n[2]*Math.sin(drive.heading))/Math.max(.05,n[1]):-r.grade*Math.sin(delta),
      pitch=Math.atan(grade)+finite(drive.bodyPitch),roll=Math.atan(cross)+finite(drive.bodyRoll),
      position={x:drive.x,y:finite(drive.roadHeight)+finite(drive.bodyHeave),z:drive.z};
    return{position,heading:drive.heading,pitch,roll,distance:r.distance,bodyMatrix:bodyAt(position,drive.heading,pitch,roll)};
  }
  function view(){
    const coverIn=phase==='engine'?1:phase==='road'?1-smooth(phaseTime/C.pictureSeconds):0,
      coverOut=phase==='away'?smooth((phaseTime-(C.awaySeconds-C.coverSeconds))/C.coverSeconds):phase==='hold'||phase==='done'?1:0;
    const release=phase==='release'?phaseTime/C.releaseSeconds:phase==='away'||phase==='hold'||phase==='done'?1:0,
      gone=Math.max(smooth((reach-C.goneFrom)/(C.goneTo-C.goneFrom)),smooth((roadTime-C.goneByTime[0])/(C.goneByTime[1]-C.goneByTime[0])),phase==='road'||phase==='engine'?0:1);
    return{phase,time,phaseTime,reach,gone,done:phase==='done',handsOff,carried:phase!=='road'||handsOff>=C.handsOffSeconds,controlsEnabled:controls(),
      // With reduced motion the camera cuts at the middle of its move.
      dolly:reducedMotion?(release<.5?0:1):ease(release),away:phase==='away'||phase==='hold'||phase==='done',
      cover:Math.max(coverIn,coverOut,skipCover),look:{...look},reducedMotion,skipping,skipTime};
  }
  return{
    drive,weather,pose,view,
    update(dt,{held=false,skipHeld=false}={}){
      paused=!!held;if(paused||phase==='done')return view();
      const elapsed=Math.max(0,finite(dt));
      if(!skipping){skipTime=skipHeld?skipTime+elapsed:0;if(skipTime>=C.skipSeconds){skipping=true;keys.clear();}}
      remainder+=Math.min(.25,elapsed);
      while(remainder+1e-10>=STEP&&phase!=='done'){step(STEP);remainder=Math.max(0,remainder-STEP);}
      return view();
    },
    input(action,pressed=true){
      if(!INPUTS.includes(action))return false;
      if(!pressed){keys.delete(action);return true;}
      if(!controls())return false;
      keys.add(action);handsOff=0;return true;
    },
    lookDelta(dx=0,dy=0){if(!controls())return false;look={yaw:clamp(look.yaw+finite(dx)*.0024,-.9,.9),pitch:clamp(look.pitch-finite(dy)*.0024,-.5,.4)};return true;},
    releaseInput(){keys.clear();},
    // Mirrors the world's fate at the wheel, for the review harness and the specs.
    snapshot(){const p=pose();return{...view(),distance:p.distance,speed:drive.speed};},
    finish(){if(phase!=='done')enter('done');},
  };
}
