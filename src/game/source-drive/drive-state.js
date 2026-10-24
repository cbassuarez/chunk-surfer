// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// Reusable vehicle state. The game-owned session owns its save and lifecycle.
import {ensureVehicle,stepVehicle,PHYSICS_STEP} from './vehicle-dynamics.js';
import {resolveVehicleContacts} from './vehicle-contacts.js';
import {roadSurfaceAt} from './road.js';
import {ensureDriveEvolution,stepDriveEvolution} from './evolution.js';
export {applyRoadImpulse} from './vehicle-dynamics.js';
export {resolveVehicleContacts} from './vehicle-contacts.js';
export const PHASES=['ordinary','discrepancy','recognition','contradiction','arrival'];
export const BOUNDS=[0,.24,.43,.64,.88];
export const DRIVE_PARKING=Object.freeze({beforeEnd:6,afterEnd:28,maxLateral:3.1,maxSpeed:.4,settleSeconds:.5});
// Read current geometry rather than trusting a latched arrived/roadOffset from
// an earlier position. The same predicate owns live eligibility and dismount.
export function inDriveArrivalZone(s){
 if(![s?.x,s?.z,s?.length].every(Number.isFinite))return false;
 const distance=-s.z,offset=roadSurfaceAt(s.x,s.z).offset;
 return distance>=s.length-DRIVE_PARKING.beforeEnd&&distance<=s.length+DRIVE_PARKING.afterEnd&&Math.abs(offset)<DRIVE_PARKING.maxLateral;
}
export function canDismountDrive(s){return !!s?.arrived&&inDriveArrivalZone(s)&&Number.isFinite(s.speed)&&Number.isFinite(s.lateralSpeed)&&Math.hypot(s.speed,s.lateralSpeed)<DRIVE_PARKING.maxSpeed;}

function prepareDrive(s){ensureVehicle(s);ensureDriveEvolution(s);return s;}
export function createDrive({length=1200}={}){return prepareDrive({schema:1,length,x:-1.35,z:0,heading:0,speed:0,steer:0,odometer:0,furthest:0,programTime:0,phase:0,phaseStarted:0,station:'service',radioOn:true,volume:.65,paused:true,arrived:false,inArrivalZone:false,arrivalStopSeconds:0,events:[],takes:[],nextTake:1,activeTake:null});}
export function note(s,type,data={}){const e={t:s.programTime,distance:s.furthest,type,...data};s.events.push(e);return e;}
export function selectStation(s,id){if(!['service','company','music'].includes(id))return false;s.station=id;s.radioOn=true;note(s,'station',{id});return true;}
export function power(s){s.radioOn=!s.radioOn;note(s,'radio-power',{on:s.radioOn});return s.radioOn;}
export function stepDrive(s,dt,input={},colliders=[],{roadSampler=roadSurfaceAt}={}){
 if(s.paused)return s;const elapsed=Number.isFinite(Number(dt))?Math.max(0,Number(dt)):0;s.programTime+=elapsed;
 if(s.finished)return s; // Only an explicit dismount ends the journey; parking never locks the controls.
 const propulsion=!!(input.forward||input.reverse);
 // A committed pedal clears the parking latch and its accumulated dwell.
 // Without both resets, the next step immediately re-parks the moving van.
 if(propulsion){s.arrived=false;s.arrivalStopSeconds=0;}
 ensureVehicle(s);s.contactStartX=s.x;s.contactStartZ=s.z;s.contactStartHeading=s.heading;s.physicsRemainder+=elapsed;
 while(s.physicsRemainder>=PHYSICS_STEP-1e-10){
  stepVehicle(s,PHYSICS_STEP,input,roadSampler);if(colliders.length)resolveVehicleContacts(s,colliders);s.physicsRemainder=Math.max(0,s.physicsRemainder-PHYSICS_STEP);
  const physicsTime=s.programTime-s.physicsRemainder;
  s.furthest=Math.max(s.furthest,-s.z);const progress=s.furthest/s.length;
  let p=s.phase;for(let i=0;i<BOUNDS.length;i++)if(progress>=BOUNDS[i])p=i;
  if(p>s.phase){s.phase=p;s.phaseStarted=physicsTime;note(s,'world-phase',{t:physicsTime,phase:PHASES[p]});}
  s.inArrivalZone=inDriveArrivalZone(s);
  const settled=s.inArrivalZone&&Math.hypot(s.speed,s.lateralSpeed)<DRIVE_PARKING.maxSpeed;
  if(s.arrived&&!settled)s.arrived=false;
  s.arrivalStopSeconds=settled&&!propulsion?(s.arrivalStopSeconds||0)+PHYSICS_STEP:0;
  if(!s.arrived&&settled&&!propulsion&&(input.brake||s.arrivalStopSeconds>=DRIVE_PARKING.settleSeconds)){s.arrived=true;s.speed=0;s.lateralSpeed=0;s.yawRate=0;if(input.brake){s.brakeHold=true;s.brakeAmount=1;}s.physicsRemainder=0;note(s,'arrival',{t:physicsTime,recorded:s.takes.length>0||!!s.activeTake});break;}
 }
 stepDriveEvolution(s,elapsed);return s;
}
export function beginTake(s){if(s.activeTake)return null;const start=s.takes.reduce((n,t)=>n+t.duration,0);const take={id:s.nextTake++,start,duration:0,startedAt:s.programTime,eventStart:s.events.length,station:s.station,phase:PHASES[s.phase],events:[],kind:'proposed-cabin-field-capture',counted:false};s.activeTake=take;note(s,'record-start',{take:take.id,tapePosition:start});return take;}
export function endTake(s,{duration,blobKey=null,interrupted=false}={}){if(!s.activeTake)return null;const t=s.activeTake;t.duration=Math.max(0,Number(duration)||0);t.blobKey=blobKey;t.interrupted=interrupted;t.events=s.events.slice(t.eventStart);s.takes.push(t);s.activeTake=null;note(s,'record-stop',{take:t.id,duration:t.duration,interrupted});return t;}
export function saveDrive(s){return JSON.stringify({...s,events:s.events.slice(-3000)});}
export function restoreDrive(text){const value=JSON.parse(text);if(value.schema!==1||!Number.isFinite(value.length)||!PHASES[value.phase])throw Error('Unsupported driving checkpoint');return prepareDrive({...value,paused:true,speed:0,lateralSpeed:0,yawRate:0,steer:0,wheelAngle:0,steeringWheelAngle:0,throttle:0,brakeAmount:value.brakeHold===true?1:0,hillStartDirection:0,directionHold:0,physicsRemainder:0,rollVelocity:0,pitchVelocity:0,heaveVelocity:0,contactStartX:value.x,contactStartZ:value.z,contactStartHeading:value.heading});}
