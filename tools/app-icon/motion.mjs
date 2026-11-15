// Shared authored performance. The Dock retains its settled resident icon;
// the loader can continue forward after game readiness without holding input.
import {VAN_ICON_WEATHER} from './weather.mjs';
import {SPEC,maneuverAt,wheelContact} from './vehicle-maneuver.mjs';
export const VAN_MOTION_VERSION='albion-maneuver-1';
export const VAN_ICON_CAMERA_ZOOM=1.518444697274809;
export const VAN_ICON_LAUNCH=Object.freeze({motionVersion:VAN_MOTION_VERSION,frameCount:84,cell:256,cellSize:256,columns:8,rows:11,durationSeconds:SPEC.duration,
 stages:Object.freeze([{atSeconds:0,name:'arrival'},{atSeconds:SPEC.brakeStart,name:'brake'},
  {atSeconds:SPEC.stop,name:'settle'},{atSeconds:SPEC.depart,name:'departure'},{atSeconds:SPEC.duration,name:'parked'}]),
 stagesSeconds:Object.freeze({brakeStart:SPEC.brakeStart,stop:SPEC.stop,settleEnd:SPEC.depart,departure:SPEC.depart}),
 weather:Object.freeze({...VAN_ICON_WEATHER,thunderAtSeconds:[],lightningAtSeconds:[],flashRanges:[],lightningDurationSeconds:0,
  lightningPolicy:'Shared reduced-flash vehicle performance.'})});
export const VAN_ICON_PHYSICS=Object.freeze({travel:SPEC.reverseDistance,tyreRadius:SPEC.radius,stopAt:SPEC.stop});
export const vanIconPose=time=>maneuverAt(time,{presentation:'dock'});
export const startupVanLoopPose=time=>maneuverAt(time);
export const vanTravelAt=time=>maneuverAt(time).reverseTravel;
export const vanSpeedAt=time=>maneuverAt(time).speed;
export function vanTyreContact(local,time,groundY){const p=maneuverAt(time),c=Math.cos(p.yaw),s=Math.sin(p.yaw);
 return{x:p.x+c*local.x+s*local.z,y:groundY,z:p.z-s*local.x+c*local.z};}
