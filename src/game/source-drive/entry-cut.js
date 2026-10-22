// Only a new, real grey-door crossing may install this remembered moving
// moment. Restores retain the normal safe stationary continuation.
import {worldAt,roadSurfaceAt} from './road.js';
import {driveEvolutionFrame} from './evolution.js';
import {stepDriveWeather} from './weather.js';

export const SOURCE_DRIVE_OPENING=Object.freeze({distanceMetres:24,lateralMetres:-1.35,speedMps:13.2,programmeSecond:3.2,audioLeadSeconds:.65,lookPitch:-.04});

export function seedMovingDriveEntry(state,weather){
 const o=SOURCE_DRIVE_OPENING,p=worldAt(o.distanceMetres,o.lateralMetres),surface=roadSurfaceAt(p.x,p.z);
 Object.assign(state,{x:p.x,z:p.z,heading:p.heading,roadHeight:p.height,roadOffset:surface.offset,
  speed:o.speedMps,lateralSpeed:0,yawRate:0,steer:0,wheelAngle:0,steeringWheelAngle:0,
  gear:1,throttle:0,engineLoad:0,brakeAmount:0,brakeHold:false,directionHold:0,physicsRemainder:0,
  odometer:o.distanceMetres,wheelRotation:o.distanceMetres/.34,furthest:-p.z,
  programTime:o.programmeSecond,phase:0,phaseStarted:0,station:'service',radioOn:true,volume:.65,
  arrived:false,inArrivalZone:false,arrivalStopSeconds:0,cutEnabled:true});
 // Prime actual wet glass and blade travel, without moving the car, fabricating
 // route events or advancing any heard programme during asset loading.
 for(let time=.2;time<o.programmeSecond+.1;time+=.2){
  const t=Math.min(time,o.programmeSecond),e=driveEvolutionFrame({...state,programTime:t});
  stepDriveWeather(weather,{dt:.2,timeSec:t,...e.weather,wipers:true,speed:state.speed});
 }
 return state;
}

export function driveOpeningView(opening,state){
 if(!opening)return null;
 const elapsed=opening.soundStartedAt==null?0:Math.max(0,state.programTime-opening.soundStartedAt);
 return{kind:'moving-cut',phase:opening.picture?'live':opening.soundStartedAt==null?'preparing':'sound-before-picture',
  covered:!opening.picture,renderPrimed:!!opening.renderPrimed,interrupted:!!opening.interrupted,
  elapsed,audioLeadSeconds:SOURCE_DRIVE_OPENING.audioLeadSeconds,seed:{...SOURCE_DRIVE_OPENING}};
}
