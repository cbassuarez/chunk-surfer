import {ensureVehicle,stepVehicle,PHYSICS_STEP} from './source-drive/vehicle-dynamics.js';
import {DRIVE_BODY_FOOTPRINT,driveBodyCorners,resolveVehicleContacts} from './source-drive/vehicle-contacts.js';

export const OPENING_ARRIVAL_FOOTPRINT=DRIVE_BODY_FOOTPRINT;
export const OPENING_ARRIVAL_DRIVE=Object.freeze({maxSpeed:5,maxReverse:2,parkingLongitudinal:1.4,parkingLateral:.8,parkingAngle:Math.PI/12,parkingSpeed:.2,settleSeconds:.25,
  arrivalSpeed:1.2,arrivalThrottle:.45,arrivalLeadSeconds:.95,autoApproachMetres:9,autoApproachSide:2,autoCruiseSpeed:2.5,autoBrakeMetres:1.1});
const finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const pose=s=>({x:s.x,y:s.roadHeight,z:s.z,yaw:s.heading,heading:s.heading});
const KEYS=['x','z','heading','speed','lateralSpeed','yawRate','wheelAngle','steeringWheelAngle','wheelRotation','throttle','brakeAmount','engineLoad','bodyRoll','bodyPitch','bodyHeave','rollVelocity','pitchVelocity','heaveVelocity','longitudinalAcceleration','lateralAcceleration','roadHeight','odometer','elapsed','parkSeconds','gear','directionHold','physicsRemainder'];

// A short approach on the existing west street, then a right turn to the van.
// Hosts can override spawn without changing the authored parking destination.
export function openingArrivalStart(target){const f=[Math.sin(target.yaw),-Math.cos(target.yaw)],r=[Math.cos(target.yaw),Math.sin(target.yaw)];return{...target,x:target.x-f[0]*24+r[0]*24,z:target.z-f[1]*24+r[1]*24,yaw:target.yaw-Math.PI/2};}
export function openingArrivalAutoParkStart(target){
  const f=[Math.sin(target.yaw),-Math.cos(target.yaw)],r=[Math.cos(target.yaw),Math.sin(target.yaw)],
    x=target.x-f[0]*OPENING_ARRIVAL_DRIVE.autoApproachMetres+r[0]*OPENING_ARRIVAL_DRIVE.autoApproachSide,
    z=target.z-f[1]*OPENING_ARRIVAL_DRIVE.autoApproachMetres+r[1]*OPENING_ARRIVAL_DRIVE.autoApproachSide;
  return{...target,x,z,yaw:Math.atan2(target.x-x,z-target.z)};
}
export function createOpeningArrivalDrive(target,{spawn=null,checkpoint=null,alreadyDriving=false,autoPark=false}={}){
  spawn=spawn||(autoPark?openingArrivalAutoParkStart(target):openingArrivalStart(target));
  const state=ensureVehicle({schema:1,target:{...target},x:spawn.x,z:spawn.z,heading:spawn.yaw,roadHeight:finite(spawn.y,target.y),speed:0,odometer:0,elapsed:0,programTime:0,parkSeconds:0,parked:false,events:[]});
  const valid=checkpoint?.schema===1&&['x','z','heading'].every(k=>Number.isFinite(checkpoint[k]))&&Math.hypot(checkpoint.x-target.x,checkpoint.z-target.z)<=100,
    // Old free-driving arrivals may be stranded anywhere on the road. Resume
    // a genuine parked cab, otherwise re-enter the short approach under its
    // loading cover rather than inherit a manual driving requirement.
    resumed=valid&&(!autoPark||checkpoint.autoPark?.schema===1||checkpoint.parked&&openingArrivalInBay({...state,...checkpoint}));
  if(resumed){for(const k of KEYS)if(Number.isFinite(checkpoint[k])&&Math.abs(checkpoint[k])<1e8)state[k]=checkpoint[k];state.parked=!!checkpoint.parked;state.brakeHold=!!checkpoint.brakeHold;}
  state.arrivalRestarted=!!(valid&&!resumed);
  state.autoPark=autoPark?{schema:1,stage:state.parked?'parked':checkpoint?.autoPark?.stage==='braking'&&resumed?'braking':'approach'}:null;
  // A resumed picture has no latent pedal or travelling body.
  Object.assign(state,{speed:0,lateralSpeed:0,yawRate:0,throttle:0,physicsRemainder:0,directionHold:0,hillStartDirection:0,brakeAmount:state.brakeHold?1:0});
  // Only the new arrival is already under power. A restored or parked night
  // never acquires a pedal, engine surge or travelling body from presentation.
  if(alreadyDriving&&!resumed)Object.assign(state,{speed:OPENING_ARRIVAL_DRIVE.arrivalSpeed,
    throttle:OPENING_ARRIVAL_DRIVE.arrivalThrottle,engineLoad:OPENING_ARRIVAL_DRIVE.arrivalThrottle,brakeHold:false,brakeAmount:0});
  state.programTime=state.elapsed;state.contactStartX=state.x;state.contactStartZ=state.z;state.contactStartHeading=state.heading;
  return state;
}
export function openingArrivalSnapshot(state){const out={schema:1};for(const k of KEYS)out[k]=finite(state[k]);return{...out,parked:!!state.parked,brakeHold:!!state.brakeHold,...(state.autoPark?{autoPark:{...state.autoPark}}:{})};}
export function openingArrivalAnchor(state){return{...state.target,...pose(state),yaw:state.heading};}
export function openingArrivalInBay(state,parking={}){
  const target=state.target,dx=state.x-target.x,dz=state.z-target.z,c=Math.cos(target.yaw),s=Math.sin(target.yaw);
  return Math.abs(dx*s-dz*c)<finite(parking.longitudinal,OPENING_ARRIVAL_DRIVE.parkingLongitudinal)
    &&Math.abs(dx*c+dz*s)<finite(parking.lateral,OPENING_ARRIVAL_DRIVE.parkingLateral)
    &&Math.abs(angle(state.heading-target.yaw))<finite(parking.angle,OPENING_ARRIVAL_DRIVE.parkingAngle);
}
export function openingArrivalCanExit(state,input={}){return!!state.parked&&openingArrivalInBay(state)&&state.brakeHold&&(state.autoPark||!input.forward&&!input.reverse)&&Math.hypot(state.speed,state.lateralSpeed)<OPENING_ARRIVAL_DRIVE.parkingSpeed;}
function automaticParkingInput(state){
  const a=state.autoPark;if(state.parked||a.stage==='parked'){a.stage='parked';return{brake:true};}
  const dx=state.target.x-state.x,dz=state.target.z-state.z,
    remaining=dx*Math.sin(state.target.yaw)-dz*Math.cos(state.target.yaw),
    heading=Math.atan2(dx,-dz),error=angle(heading-state.heading);
  if(remaining<=OPENING_ARRIVAL_DRIVE.autoBrakeMetres)a.stage='braking';
  if(a.stage==='braking')return{brake:true};
  return{forward:state.speed<OPENING_ARRIVAL_DRIVE.autoCruiseSpeed,left:error<-.025,right:error>.025};
}
function sampler(environment,state){return(x,z)=>({height:finite(state.target.y),heading:state.heading,grade:0,gradientX:0,gradientZ:0,offset:0,kind:'asphalt',grip:.68,rolling:.014,roughness:0,...environment.surfaceAt?.(x,z)});}
function nearby(colliders,state){return colliders.filter(c=>{const x=finite(c.x,((c.minX||0)+(c.maxX||0))/2),z=finite(c.z,((c.minZ||0)+(c.maxZ||0))/2),extent=Math.hypot(c.halfX??c.halfWidth??((c.maxX-c.minX)/2||c.radius||.2),c.halfZ??c.halfLength??((c.maxZ-c.minZ)/2||c.radius||.2));return Math.hypot(x-state.x,z-state.z)<12+extent;});}
function clearPose(state,environment,surfaceAt){
  const p=pose(state);if(environment.isPoseClear?.(p,OPENING_ARRIVAL_FOOTPRINT)===false)return false;
  for(const corner of driveBodyCorners(p)){const q=surfaceAt(corner.x,corner.z);if(q.unsupported||q.drivable===false||!Number.isFinite(q.height)||Math.abs(q.height-state.roadHeight)>.32)return false;}
  return true;
}
// A host clearance predicate is swept too; it is never just an endpoint test.
function resolveHostClearance(state,before,environment,surfaceAt){
  const after={x:state.x,z:state.z,heading:state.heading},distance=Math.hypot(after.x-before.x,after.z-before.z),turn=after.heading-before.heading;
  const count=Math.max(1,Math.ceil(Math.max(distance/.08,Math.abs(turn)/.02))),at=t=>({...state,x:before.x+(after.x-before.x)*t,z:before.z+(after.z-before.z)*t,heading:before.heading+turn*t});
  for(let k=1;k<=count;k++)if(!clearPose(at(k/count),environment,surfaceAt)){
    let lo=(k-1)/count,hi=k/count;for(let j=0;j<12;j++){const mid=(lo+hi)/2;if(clearPose(at(mid),environment,surfaceAt))lo=mid;else hi=mid;}
    const safe=at(lo),impact=Math.hypot(state.speed,state.lateralSpeed),untravelled=Math.hypot(after.x-safe.x,after.z-safe.z);
    state.x=safe.x;state.z=safe.z;state.heading=safe.heading;state.odometer=Math.max(0,state.odometer-untravelled);state.wheelRotation-=Math.sign(state.speed)*untravelled/.34;
    Object.assign(state,{speed:0,lateralSpeed:0,yawRate:0});
    return{id:'opening-host-clearance',impactSpeed:impact,normal:{x:distance?-(after.x-before.x)/distance:0,z:distance?-(after.z-before.z)/distance:0}};
  }
  return null;
}
export function stepOpeningArrivalDrive(state,dt,input={},environment={}){
  const events=[],wasParked=state.parked;
  const surfaceAt=sampler(environment,state),colliders=nearby(environment.colliders||[],state),elapsed=Math.max(0,Math.min(.25,finite(dt)));
  state.physicsRemainder+=elapsed;
  while(state.physicsRemainder>=PHYSICS_STEP-1e-10){
    const controls=state.autoPark?automaticParkingInput(state):input,propulsion=!!(controls.forward||controls.reverse);
    if(propulsion){state.parked=false;state.parkSeconds=0;}
    const before={x:state.x,z:state.z,heading:state.heading},limit=state.speed>=0?finite(environment.maxSpeed,OPENING_ARRIVAL_DRIVE.maxSpeed):finite(environment.maxReverse,OPENING_ARRIVAL_DRIVE.maxReverse);
    // A low-gear governor cuts drive torque; it does not move or park the van.
    const governed={...controls,forward:!!controls.forward&&!(state.speed>limit),reverse:!!controls.reverse&&!(state.speed<-limit),brake:!!controls.brake||Math.abs(state.speed)>limit+.12};
    state.programTime=state.elapsed+=PHYSICS_STEP;state.events=[];stepVehicle(state,PHYSICS_STEP,governed,surfaceAt);
    resolveVehicleContacts(state,colliders);
    const hostHit=resolveHostClearance(state,before,environment,surfaceAt);
    const contacts=[...state.events.filter(e=>e.type==='vehicle-contact'),...(hostHit?[hostHit]:[])];
    for(const hit of contacts)if(!state.lastEmittedContact||state.lastEmittedContact.id!==hit.id||state.elapsed-state.lastEmittedContact.seconds>.5){const event={type:'opening-vehicle-contact',id:hit.id,impactSpeed:hit.impactSpeed,normal:hit.normal||state.lastContact?.normal,seconds:state.elapsed,position:{x:state.x,y:state.roadHeight,z:state.z}};events.push(event);state.lastEmittedContact=event;}
    state.contactStartX=state.x;state.contactStartZ=state.z;state.contactStartHeading=state.heading;
    const stopped=openingArrivalInBay(state,environment.parking)&&Math.hypot(state.speed,state.lateralSpeed)<OPENING_ARRIVAL_DRIVE.parkingSpeed&&!propulsion&&state.brakeHold;
    state.parkSeconds=stopped?state.parkSeconds+PHYSICS_STEP:0;
    if(!stopped)state.parked=false;else if(state.parkSeconds>=OPENING_ARRIVAL_DRIVE.settleSeconds-1e-9)state.parked=true;
    state.physicsRemainder=Math.max(0,state.physicsRemainder-PHYSICS_STEP);
  }
  if(state.autoPark&&state.parked)state.autoPark.stage='parked';
  if(wasParked!==state.parked)events.push({type:state.parked?'opening-vehicle-parked':'opening-vehicle-unparked',seconds:state.elapsed,anchor:openingArrivalAnchor(state)});
  state.events=[];return events;
}
