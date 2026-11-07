// The remembered drive under the opening ophanim talk: the branch of the
// superposition where he has not crashed. The prologue host drives the picture
// with this while the conversation runs; the same van, road, weather and
// cabin as the door teaser, with no skips, hazards or cliff. An autopilot
// holds the left lane so the player never has to; past a modest ceiling the
// van brakes and waits, because the talk can idle for as long as a person
// spends choosing what to say.
import {createDoorDriveTeaser} from './door-teaser.js';
import {openingRoadSurfaceAt,openingWorldAt} from './opening-road.js';

export const PROLOGUE_DRIVE=Object.freeze({
  lane:-1.35,lookAhead:18,maxDistance:60,holdBrakeAt:40,
});

export function createPrologueDrive({timeSkips=null}={}){
  const teaser=createDoorDriveTeaser({timeSkips});
  let started=false;
  const autopilot=()=>{
    const drive=teaser.snapshot().driveState,here=openingRoadSurfaceAt(drive.x,drive.z);
    if(here.distance>=PROLOGUE_DRIVE.maxDistance)return{brake:true};
    const p=openingWorldAt(here.distance+PROLOGUE_DRIVE.lookAhead,PROLOGUE_DRIVE.lane);
    const fx=Math.sin(drive.heading),fz=-Math.cos(drive.heading),dx=p.x-drive.x,dz=p.z-drive.z;
    const score=(fz*dx-fx*dz)/PROLOGUE_DRIVE.lookAhead;
    return{forward:true,left:score>.012,right:score<-.012};
  };
  return{
    start(){if(started)return true;started=teaser.start();return started;},
    update(dt){teaser.update(dt,{input:autopilot()});},
    frame(metrics){if(!started||!metrics)return null;return teaser.frame(metrics)?.renderFrame||null;},
    snapshot(){return teaser.snapshot();},
    dispose(){teaser.dispose();},
  };
}
