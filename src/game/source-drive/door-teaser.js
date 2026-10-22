// A temporary cinematic owner of the existing drive, never a Source journey.
// The route is queried on the ground; the released vehicle and every attached
// surface then share one rigid, analytically falling transform.
import {createDrive} from './drive-state.js';
import {worldAt,roadSurfaceAt} from './road.js';
import {makeDriveScene,multiply,rotation} from './scene.js';
import {driveEvolutionFrame} from './evolution.js';
import {programmeFrame} from './radio-programmes.js';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame} from './weather.js';
import {applyDriveTeaserScene,DRIVE_TEASER_BREAK} from './teaser-scene.js';

export const DOOR_DRIVE_TEASER=Object.freeze({
 duration:13.8,soundLeadEnd:.65,pictureFadeEnd:1.05,departureStart:5.8,
 fallStart:7.1,impactStart:10.4,returnStart:12.8,impactFadeStart:10.02,
 firstVisibleDistance:258,departureDistance:292,releaseDistance:304,
 releaseLateral:4,commitDistance:292,programmeStart:73.8,skipCoverSeconds:.28,skipReturnSeconds:.7,
});
const C=DOOR_DRIVE_TEASER,STEP=1/120,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
const ease=x=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};
const clone=value=>structuredClone(value);
const approachSpeed=(C.departureDistance-C.firstVisibleDistance)/(C.departureStart-C.soundLeadEnd);
const approachStart=C.firstVisibleDistance-approachSpeed*C.soundLeadEnd;
const release=worldAt(C.releaseDistance,C.releaseLateral),releaseYaw=release.heading+.12;
const releasePitch=release.pitch-.17;
const phaseAt=t=>t<C.soundLeadEnd?'sound-lead':t<C.departureStart?'approach':t<C.fallStart?'departure':t<C.impactStart?'fall':t<C.returnStart?'impact-black':t<C.duration?'return':'complete';

// Cubic distance preserves the incoming and departing velocities, rather than
// jumping from one constant speed to another at the loss of the road.
function departureDistance(u){
 const span=C.fallStart-C.departureStart,a=C.departureDistance,b=C.releaseDistance,m0=approachSpeed*span,m1=9.5*span;
 return (2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*m0+(-2*u**3+3*u*u)*b+(u**3-u*u)*m1;
}
function distanceVelocity(u){
 const span=C.fallStart-C.departureStart,a=C.departureDistance,b=C.releaseDistance,m0=approachSpeed*span,m1=9.5*span;
 return ((6*u*u-6*u)*a+(3*u*u-4*u+1)*m0+(-6*u*u+6*u)*b+(3*u*u-2*u)*m1)/span;
}

export function doorDriveTeaserPoseAt(timeSec=0){
 const t=clamp(finite(timeSec),0,C.duration),flight=clamp(t-C.fallStart,0,C.impactStart-C.fallStart);
 let distance,position,heading,pitch,speed,lateral=0,verticalVelocity=0;
 if(t<C.departureStart){
  distance=approachStart+approachSpeed*t;position=worldAt(distance);heading=position.heading;pitch=position.pitch;speed=approachSpeed;
 }else if(t<C.fallStart){
  const u=(t-C.departureStart)/(C.fallStart-C.departureStart),leave=ease(u);
  distance=departureDistance(u);lateral=C.releaseLateral*leave;
  position=worldAt(distance,lateral,-1.05*leave);heading=position.heading+.12*leave;pitch=position.pitch-.17*leave;speed=distanceVelocity(u);
 }else{
  // Horizontal inertia and gravity continue past the finite ledge. Ground
  // sampling remains at the launch point; no terrain-height snap follows it.
  distance=C.releaseDistance;lateral=C.releaseLateral;
  position={x:release.x+(Math.sin(releaseYaw)*9.5+Math.cos(releaseYaw)*2.7)*flight,
   z:release.z+(-Math.cos(releaseYaw)*9.5+Math.sin(releaseYaw)*2.7)*flight,
   y:release.y-1.05-1.15*flight-4.905*flight*flight};
  heading=releaseYaw+.065*ease(flight/2.7);pitch=releasePitch+(-1.18-releasePitch)*ease(flight/2.6);
  speed=9.5;verticalVelocity=-1.15-9.81*flight;
 }
 const sceneAnchor=worldAt(distance),falling=t>=C.fallStart,lookPitchOffset=falling?-.035:.035+.11*smooth((t-1.1)/1.3)*(1-smooth((t-3.5)/1.6));
 const body=multiply(rotation(0,-heading),rotation(pitch,0,0)),pivot=.85;
 body[12]=32+position.x-body[4]*pivot;body[13]=position.y+pivot-body[5]*pivot;body[14]=32+position.z-body[6]*pivot;
 const phase=phaseAt(t),coverAlpha=t<C.soundLeadEnd?1:t<C.pictureFadeEnd?1-smooth((t-C.soundLeadEnd)/(C.pictureFadeEnd-C.soundLeadEnd)):t<C.impactFadeStart?0:t<C.impactStart?smooth((t-C.impactFadeStart)/(C.impactStart-C.impactFadeStart)):t<C.returnStart?1:1-smooth((t-C.returnStart)/(C.duration-C.returnStart));
 return{timeSec:t,phase,coverAlpha,worldOwner:t<C.impactStart?'drive':'return',distance,lateral,
  cliffCommitted:distance>=C.commitDistance||falling,controlOwner:'opening-cinematic',
  position:{x:position.x,y:position.y,z:position.z},sceneAnchor:{x:sceneAnchor.x,y:sceneAnchor.y,z:sceneAnchor.z,heading:sceneAnchor.heading},
  heading,pitch,roll:0,speed,verticalVelocity,fallSeconds:flight,bodyMatrix:Array.from(body),lookPitchOffset,
  breakEdge:{...DRIVE_TEASER_BREAK}};
}

export function createDoorDriveTeaser({onComplete=()=>{},onCoveredReturn=()=>{}}={}){
 const drive=createDrive(),weather=createDriveWeather({rain:.71,initialWetness:.38,seed:1947});
 let started=false,disposed=false,finished=false,paused=false,hostPaused=false,timeSec=0,weatherElapsed=0,notified=false,returned=false,skip=null;
 drive.station='service';drive.radioOn=true;drive.volume=.65;weather.timeSec=C.programmeStart;
 function view(){
  const pose=doorDriveTeaserPoseAt(timeSec);
  if(!started){pose.phase='idle';pose.coverAlpha=0;pose.worldOwner='return';}
  if(skip){
   const local=skip.elapsed,covered=local<C.skipCoverSeconds;
   pose.phase=covered?'skip-cover':local<C.skipCoverSeconds+C.skipReturnSeconds?'return':'complete';
   pose.coverAlpha=covered?skip.alpha+(1-skip.alpha)*smooth(local/C.skipCoverSeconds):1-smooth((local-C.skipCoverSeconds)/C.skipReturnSeconds);
   pose.worldOwner=covered?skip.owner:'return';
  }
  if(finished){pose.phase='complete';pose.coverAlpha=0;pose.worldOwner='return';}
  return pose;
 }
 function synchronize(){
  const p=doorDriveTeaserPoseAt(timeSec),road=roadSurfaceAt(p.sceneAnchor.x,p.sceneAnchor.z);
  const pull=smooth((timeSec-C.departureStart)/.38)*(1-smooth((timeSec-C.fallStart)/.25));
  const before=doorDriveTeaserPoseAt(Math.max(0,timeSec-.005)),after=doorDriveTeaserPoseAt(Math.min(C.duration,timeSec+.005));
  Object.assign(drive,{x:p.sceneAnchor.x,z:p.sceneAnchor.z,heading:p.sceneAnchor.heading,roadHeight:road.height,
   speed:p.speed,programTime:C.programmeStart+timeSec,furthest:p.distance,odometer:Math.max(0,p.distance-approachStart),
   wheelRotation:(p.distance-approachStart)/.34,wheelAngle:clamp(road.curvature*2.8,-.16,.16),
   steeringWheelAngle:clamp(road.curvature*2.8,-.16,.16)*17,bodyPitch:0,bodyRoll:0,bodyHeave:0,
   throttle:p.fallSeconds>0?.16:.42+.44*pull,engineLoad:.22+.57*pull,
   longitudinalAcceleration:(after.speed-before.speed)/Math.max(.001,after.timeSec-before.timeSec),
   brakeAmount:0,brakeHold:false,cliffCommitted:p.cliffCommitted,
   paused:paused||hostPaused||disposed||finished||!started||view().worldOwner!=='drive',
   arrived:false,inArrivalZone:false,arrivalStopSeconds:0});
  return p;
 }
 function integrateWeather(until){
  // Fixed samples make pane history independent of host frame cadence. A long
  // stalled frame advances a bounded13.8s, rather than losing weather time.
  while(weatherElapsed+STEP<=until+1e-9){
   const at=weatherElapsed+STEP,p=doorDriveTeaserPoseAt(at),state={...drive,x:p.sceneAnchor.x,z:p.sceneAnchor.z,heading:p.sceneAnchor.heading,furthest:p.distance,programTime:C.programmeStart+at,speed:p.speed};
   const evolution=driveEvolutionFrame(state);
   stepDriveWeather(weather,{...evolution.weather,dt:STEP,timeSec:state.programTime,wipers:true,speed:p.speed});weatherElapsed=at;
  }
 }
 function complete(){
  if(finished)return;finished=true;synchronize();
  if(!notified){notified=true;onComplete({skipped:!!skip,timeSec,duration:C.duration});}
 }
 function coveredReturn(){
  if(returned||!started||disposed||view().worldOwner!=='return')return;
  returned=true;onCoveredReturn({skipped:!!skip,timeSec:skip?timeSec:C.impactStart,phase:skip?'return':'impact-black',coverAlpha:1});
 }
 function snapshot(){const pose=view();return{phase:pose.phase,coverAlpha:pose.coverAlpha,worldOwner:pose.worldOwner,timeSec,duration:C.duration,
  started,paused:paused||hostPaused,finished,disposed,skipped:!!skip,coveredReturn:returned,vehiclePose:clone(pose),driveState:clone(drive),
  weatherClock:weather.timeSec,weatherRevision:weather.revision,wiperPhase:weather.wiperPhase};}
 function start(){if(started||disposed||finished)return false;started=true;synchronize();return true;}
 function setPaused(value){if(disposed||finished)return false;paused=!!value;synchronize();return paused;}
 function update(dt,{paused:hostIsPaused=false}={}){
  hostPaused=!!hostIsPaused;synchronize();
  if(!started||disposed||finished||paused||hostPaused)return snapshot();
  const elapsed=Math.max(0,finite(dt));if(!elapsed)return snapshot();
  if(skip){skip.elapsed=Math.min(C.skipCoverSeconds+C.skipReturnSeconds,skip.elapsed+elapsed);synchronize();coveredReturn();if(skip.elapsed>=C.skipCoverSeconds+C.skipReturnSeconds)complete();}
  else{timeSec=Math.min(C.duration,timeSec+elapsed);integrateWeather(Math.min(timeSec,C.impactStart));synchronize();coveredReturn();if(timeSec>=C.duration)complete();}
  synchronize();return snapshot();
 }
 function requestSkip(){
  if(!started||disposed||finished||skip)return false;
  const current=view();skip={elapsed:0,alpha:current.coverAlpha,owner:current.worldOwner};synchronize();return true;
 }
 function frame(metrics){
  synchronize();const state=snapshot();
  if(disposed||!started||finished||state.worldOwner!=='drive')return{...state,renderFrame:null};
  const p=doorDriveTeaserPoseAt(timeSec),evolution=driveEvolutionFrame(drive),pane=driveWeatherFrame(weather);
  const base=makeDriveScene(drive,metrics,{headlights:true,wipers:true,showHands:true,weather:pane});
  const scene=applyDriveTeaserScene(base,{vehicleMatrix:p.bodyMatrix,breakEdge:DRIVE_TEASER_BREAK,look:{yaw:drive.heading,pitch:base.roadPitch+p.lookPitchOffset}});
  const weatherFrame=driveWeatherFrame(weather,{bodyMatrix:scene.body,cabinMount:metrics.cabinBodyMount,headlamps:scene.lamps.filter(l=>/^drive-headlamp-[01]$/.test(l.id))});
  // Atmosphere stays with the fixed launch landscape while the glass and its
  // accumulated water remain attached to the falling cabin.
  weatherFrame.groundY=worldAt(C.releaseDistance).height;
  const renderState={...clone(drive),heading:scene.vehicleHeading};
  return{...state,renderFrame:{active:true,scene,look:scene.look,driveState:renderState,weather:weatherFrame,evolution,
   radio:programmeFrame(renderState,evolution),recording:{active:false,level:0},
   readout:{counter:'00:00',mode:'idle',note:'FIELD TAKE · READY'},cinematicLook:true,cameraRoll:0,cameraRig:scene.cameraRig,
   cinematic:{phase:state.phase,vehiclePose:clone(p),rigRollApplied:false,groundReferenceOnly:true}}};
 }
 function dispose(){if(disposed)return false;disposed=true;drive.paused=true;return true;}
 synchronize();return{start,update,setPaused,skip:requestSkip,snapshot,frame,dispose};
}
