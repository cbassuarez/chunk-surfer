// One-time compatibility for saves made before the road acquired a finite
// physical perimeter. Legal shoulder/bay stops remain byte-for-byte in place.
import {containsDrivePose} from './route-boundaries.js';
import {worldAt,roadSurfaceAt} from './road.js';

export function recoverDriveCheckpointPosition(drive){
 if(containsDrivePose(drive))return drive;
 const from={x:drive.x,z:drive.z,heading:drive.heading};
 const distance=Math.max(8,Math.min(1200,roadSurfaceAt(drive.x,drive.z).distance));
 let road=worldAt(distance,-1.35),heading=drive.heading;
 // Earlier saves could use the left lane where the authored cliff now has
 // only one van-width lane. Pick an actually clear body pose before resuming;
 // a new road is never permission to place the van inside its visible rail.
 if(!containsDrivePose({x:road.x,z:road.z,heading:road.heading}))road=worldAt(distance,0);
 if(!containsDrivePose({x:road.x,z:road.z,heading}))heading=road.heading;
 const to={x:road.x,z:road.z,heading};
 const recovery={kind:'finite-road-compatibility',reason:'outside-or-obstructed-old-position',from,to,programmeTime:drive.programTime,acknowledged:false};
 Object.assign(drive,to,{speed:0,lateralSpeed:0,yawRate:0,throttle:0,brakeAmount:1,brakeHold:true,physicsRemainder:0,directionHold:0,
  contactStartX:to.x,contactStartZ:to.z,contactStartHeading:heading,roadHeight:road.height,roadOffset:roadSurfaceAt(to.x,to.z).offset,
  arrived:false,inArrivalZone:false,arrivalStopSeconds:0,boundaryRecovery:recovery});
 if(Array.isArray(drive.events))drive.events.push({type:'vehicle-position-recovered',t:drive.programTime,distance:drive.furthest,from,to});
 return drive;
}
