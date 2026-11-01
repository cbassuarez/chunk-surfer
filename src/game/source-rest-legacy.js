import {SOURCE_REST_SEATS} from './source-rest-seat.js';

// Only a durable, already-earned rest ending can move with the authored seat.
// An ordinary old save stays on its real path and must discover the alcove.
export function migrateSourceRestCommittedCheckpoint(checkpoint,{committed=false}={}){
  if(!committed||checkpoint?.phase!=='wrong-return'||checkpoint.chartId!==1||Math.abs(checkpoint.feet-16.8)>.4
    ||Math.hypot(checkpoint.x+99.35,checkpoint.z+18)>2)return checkpoint;
  const seat=SOURCE_REST_SEATS[0];
  if(seat.chartId===1)return checkpoint;
  const pose={...seat.approach,feet:seat.feet,chartId:seat.chartId,level:seat.level,phase:seat.phase,
    yaw:Math.atan2(seat.x-seat.approach.x,seat.approach.z-seat.z),pitch:0};
  return {...checkpoint,...pose,lastSafe:{...pose},velocity:{x:0,z:0},fall:null,recovery:null,reveal:null,cameraTransit:null,bodyTransit:null};
}
