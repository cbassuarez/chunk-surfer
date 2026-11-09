// The same real van and hand rig, on the opening's continuous ordinary road.
// The driver is moving before the first shown frame. Thinking about an answer
// never parks the van or advances into a later flashback encounter.
import {createDrive} from './drive-state.js';
import {stepVehicle,PHYSICS_STEP} from './vehicle-dynamics.js';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame} from './weather.js';
import {makeDriveScene} from './scene.js';
import {programmeFrame} from './radio-programmes.js';
import {resetWheelHands,wheelHandDiagnostics} from './geometry/wheel-hands-pose.js';
import {PROLOGUE_ROAD,prologueWorldAt,prologueRoadSurfaceAt,prologueRoadScene} from './prologue-road.js';

export const PROLOGUE_DRIVE=Object.freeze({lane:-1.35,lookAhead:18,steerGain:9,entryMotionSeconds:.12,seamSeconds:5.4,gripSeconds:.8,releaseSeconds:1.2});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{const t=clamp(v);return t*t*(3-2*t);},clone=v=>structuredClone(v),TAU=Math.PI*2;
const cues=new Set(['neutral','seam','grip','release']);
export function createPrologueDrive(){
 const seed=prologueWorldAt(PROLOGUE_ROAD.spawn,PROLOGUE_DRIVE.lane),drive=createDrive({length:1e9}),weather=createDriveWeather({rain:.68,initialWetness:.38,seed:1947});
 Object.assign(drive,{x:seed.x,z:seed.z,heading:seed.heading,roadHeight:seed.y,speed:13,throttle:.45,engineLoad:.35,furthest:PROLOGUE_ROAD.spawn,paused:true});
 let started=false,disposed=false,paused=false,timeSec=0,remainder=0,clippedSeconds=0,look={yaw:0,pitch:-.035},cue='neutral',cueAt=0,explicitProgress=null,holdWiper=false,heldWiperPhase=null,anchors=null;
 const live=()=>started&&!disposed&&!paused;
 const embodiment=()=>{
  const seconds=cue==='seam'?PROLOGUE_DRIVE.seamSeconds:cue==='release'?PROLOGUE_DRIVE.releaseSeconds:PROLOGUE_DRIVE.gripSeconds,p=cue==='neutral'?0:explicitProgress??clamp((timeSec-cueAt)/seconds),q=smooth(p),base=-drive.steeringWheelAngle;
  const hands=cue==='neutral'?null:Object.fromEntries(['right','left'].map(side=>[side,{theta:anchors?.[side]??0,open:cue==='release'?q:cue==='grip'?-.18*q:0,keepThumb:cue==='release'}]));
  return{cue,progress:p,wheelAngle:base-(cue==='seam'?TAU*q:0),wheelTurn:cue==='seam'?q:0,hands,holdWiper,wiperPhase:weather.wiperPhase};
 };
 function setEmbodiment(value={}){
  if(disposed)return false;
  if(value.cue!==undefined){if(!cues.has(value.cue))throw Error('Unknown prologue body cue.');if(value.cue!==cue){cue=value.cue;cueAt=timeSec;explicitProgress=null;const h=wheelHandDiagnostics()?.hands;anchors=Object.fromEntries(['right','left'].map(side=>[side,Number.isFinite(h?.[side]?.poseTheta)?h[side].poseTheta:h?.[side]?.theta||0]));}}
  if(Object.hasOwn(value,'progress'))explicitProgress=value.progress==null?null:clamp(Number(value.progress)||0);
  if(Object.hasOwn(value,'holdWiper')){const next=!!value.holdWiper;if(next&&!holdWiper)heldWiperPhase=weather.wiperPhase;holdWiper=next;if(!next)heldWiperPhase=null;}
  if(holdWiper&&Number.isFinite(value.wiperPhase))heldWiperPhase=((value.wiperPhase%TAU)+TAU)%TAU;
  if(holdWiper){weather.wiperPhase=heldWiperPhase;weather.wiperMoving=false;weather.wiperRequested=false;}
  return true;
 }
 function step(h){
  const r=prologueRoadSurfaceAt(drive.x,drive.z),p=prologueWorldAt(r.distance+PROLOGUE_DRIVE.lookAhead,PROLOGUE_DRIVE.lane),fx=Math.sin(drive.heading),fz=-Math.cos(drive.heading),score=(fz*(p.x-drive.x)-fx*(p.z-drive.z))/PROLOGUE_DRIVE.lookAhead;
  stepVehicle(drive,h,{forward:true,reverse:false,brake:false,steer:clamp(-score*PROLOGUE_DRIVE.steerGain,-1,1)},prologueRoadSurfaceAt);
  timeSec+=h;drive.programTime=timeSec;drive.furthest=Math.max(drive.furthest,prologueRoadSurfaceAt(drive.x,drive.z).distance);
  drive.journey={schema:1,stationarySeconds:0,returnMetres:0,edgeSeconds:drive.surface==='asphalt'?0:h,maxBacktrackMetres:0,mode:drive.surface==='asphalt'?'moving':'edge'};
  if(holdWiper){weather.wiperPhase=heldWiperPhase;weather.wiperMoving=false;weather.wiperRequested=false;}
  stepDriveWeather(weather,{dt:h,timeSec,rain:.68,fog:.05,extinction:.0055,snow:0,whiteout:0,wipers:!holdWiper,speed:drive.speed});
 }
 function update(dt){if(!live())return;const seconds=Number.isFinite(Number(dt))?Math.max(0,Number(dt)):0;clippedSeconds+=Math.max(0,seconds-.25);remainder+=Math.min(.25,seconds);while(remainder+1e-10>=PHYSICS_STEP){step(PHYSICS_STEP);remainder=Math.max(0,remainder-PHYSICS_STEP);}}
 function snapshot(){const r=prologueRoadSurfaceAt(drive.x,drive.z);return{phase:started?'free-drive':'idle',worldOwner:'drive',timeSec,started,paused,disposed,finished:false,controlsEnabled:false,clippedSeconds,driveState:clone(drive),look:{...look},settings:{wipers:true,headlights:true},weatherClock:weather.timeSec,weatherRevision:weather.revision,wiperPhase:weather.wiperPhase,wiperMoving:weather.wiperMoving,embodiment:embodiment(),commitment:null,vehiclePose:{phase:'free-drive',distance:r.distance,speed:drive.speed,heading:drive.heading,position:{x:drive.x,y:drive.roadHeight,z:drive.z},waterSeconds:0,fallSeconds:0,controlOwner:'opening-autopilot',controlsEnabled:false,worldOwner:'drive',coverAlpha:0}};}
 function frame(metrics){
  if(!started||disposed||!metrics)return null;
  const body=embodiment(),pane=driveWeatherFrame(weather),scene=makeDriveScene(drive,metrics,{headlights:true,wipers:!holdWiper,weather:pane,cabOnly:true,embodiment:body,roadSampler:prologueRoadSurfaceAt}),world=prologueRoadScene({distance:prologueRoadSurfaceAt(drive.x,drive.z).distance,eye:scene.eye,time:timeSec});
  scene.prologueCabIds=scene.props.map(p=>p.id);scene.props.push(...world.props);scene.lamps.push(...world.lamps);scene.driveLand=world.land;
  scene.look={yaw:drive.heading+look.yaw,pitch:scene.roadPitch+look.pitch};scene.vehicleHeading=drive.heading;
  scene.cameraRig={yaw:scene.look.yaw,pitch:scene.look.pitch,roll:0};
  const weatherFrame=driveWeatherFrame(weather,{bodyMatrix:scene.body,cabinMount:metrics.cabinBodyMount,headlamps:scene.lamps.filter(l=>/^drive-headlamp-[01]$/.test(l.id))});weatherFrame.groundY=drive.roadHeight;
  const state=snapshot(),evolution={stage:'ordinary',reveal:0,wave:0,ribcage:0,backtrack:0,hold:0,mode:drive.journey.mode,weather:weatherFrame};
  return{active:true,timeSec,controlsEnabled:false,scene,look:scene.look,driveState:state.driveState,weather:weatherFrame,evolution,coastalMemory:null,radio:programmeFrame(drive,evolution),recording:{active:false,level:0},readout:{counter:'00:00',mode:'idle'},cinematicLook:true,cameraRoll:0,cameraRig:scene.cameraRig,embodiment:body,cinematic:{vehiclePose:{...state.vehiclePose,bodyMatrix:Array.from(scene.body),sceneAnchor:{x:drive.x,y:drive.roadHeight,z:drive.z,heading:drive.heading}},forced:false}};
 }
 return{start(){if(started||disposed)return false;started=true;drive.paused=false;resetWheelHands();update(PROLOGUE_DRIVE.entryMotionSeconds);return true;},update,frame,setEmbodiment,
  setPaused(value){paused=!!value;drive.paused=paused||!started||disposed;},lookAngles:()=>({...look}),lookBy(yaw=0,pitch=0){if(!live())return false;look={yaw:clamp(look.yaw+(Number(yaw)||0),-1.55,1.55),pitch:clamp(look.pitch+(Number(pitch)||0),-.62,.45)};return true;},
  snapshot,dispose(){if(disposed)return false;disposed=true;drive.paused=true;return true;}};
}
