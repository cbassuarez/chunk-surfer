// A transient return through the SAME opening coast. This module only samples
// staged vehicle/camera transforms from an explicitly advanced saved clock.
// The host retains the real Source body, destination, renderer and audio.
import {COASTAL_MEMORY_LAYOUT,COASTAL_WORLD_FROM_LOCAL,coastalWorldPoint} from '../data/coastal-memory.js';
import {doorDriveTeaserPoseAt,DOOR_DRIVE_TEASER} from './source-drive/door-teaser.js';
import {worldAt} from './source-drive/road.js';
import {multiply,rotation} from './source-drive/scene.js';

export const SOURCE_RETURN_FLASHBACK=Object.freeze({kind:'source-return-flashback',version:1,durationSeconds:55,
 seaEnd:8,reverseEnd:23,hydroplaneEnd:29,forwardEnd:44,dollyEnd:51,fadeStart:52,
 entryFadeSeconds:2,seaDepthMetres:42,deepLiftEnd:12,reverseFallEnd:18,
 reverseRoadEndDistance:250,hydroplaneEndDistance:225,forwardEndDistance:90,dollyEndDistance:35,endDistance:20});
const C=SOURCE_RETURN_FLASHBACK,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),finite=(v,f=0)=>Number.isFinite(v)?v:f;
const ease=v=>{const t=clamp(v);return t*t*t*(10+t*(-15+6*t));},mix=(a,b,t)=>a+(b-a)*t;
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const vector=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
const unit=p=>{const n=Math.hypot(...p)||1;return p.map(x=>x/n);};
const angularMix=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
function destination(value){if(value!=='chapel'&&value!=='tower')throw new TypeError('The Source return destination must be the existing chapel or tower entrance.');return value;}
function returnPose(value){if(value==null)return null;if(!value||!['x','y','yaw','pitch','facing'].every(k=>Number.isFinite(value[k])))throw new TypeError('A captured return pose needs finite Source position and view.');return structuredClone(value);}
function vehicleMetrics(value){
 const vec=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 if(!vec(value?.eye)||!vec(value?.cabinBodyMount)||!vec(value?.body?.min)||!vec(value?.body?.max)||!Array.isArray(value?.body?.headlamps)||value.body.headlamps.length!==2||!value.body.headlamps.every(vec))throw new TypeError('The return camera and lights need the actual loaded vehicle metrics.');
 return{eye:[...value.eye],cabinBodyMount:[...value.cabinBodyMount],body:{min:[...value.body.min],max:[...value.body.max],headlamps:value.body.headlamps.map(p=>[...p]),wheelRadius:finite(value.body.wheelRadius,.33)}};
}
function bodyAt(position,heading,pitch=0,roll=0){const m=Array.from(multiply(rotation(0,-heading),rotation(pitch,0,roll)));m[12]=32+position.x-.85*m[4];m[13]=position.y+.85-.85*m[5];m[14]=32+position.z-.85*m[6];return m;}
function pose(position,heading,pitch=0,roll=0,distance=304,lateral=0){return{position,heading,pitch,roll,distance,lateral,bodyMatrix:bodyAt(position,heading,pitch,roll)};}
function roadPose(distance,{lateral=0,turn=0,roll=0}={}){const p=worldAt(distance,lateral),heading=p.heading+turn,pitch=p.pitch*Math.cos(turn);return pose({x:p.x,y:p.y,z:p.z},heading,pitch,roll,distance,lateral);}
const releaseRoad=worldAt(DOOR_DRIVE_TEASER.releaseDistance);
const deepWorld=coastalWorldPoint([COASTAL_MEMORY_LAYOUT.settledPose.position[0]+24,-C.seaDepthMetres,COASTAL_MEMORY_LAYOUT.settledPose.position[2]]);
const deep=pose({x:deepWorld[0]-32,y:deepWorld[1],z:deepWorld[2]-32},releaseRoad.heading+COASTAL_MEMORY_LAYOUT.settledPose.heading,1.15);
const settled=doorDriveTeaserPoseAt(DOOR_DRIVE_TEASER.settledStart);
function blendPose(a,b,u){const f=ease(u),position=Object.fromEntries(['x','y','z'].map(k=>[k,mix(a.position[k],b.position[k],f)]));return pose(position,angularMix(a.heading,b.heading,f),mix(a.pitch,b.pitch,f),mix(a.roll||0,b.roll||0,f),mix(a.distance??304,b.distance??304,f),mix(a.lateral||0,b.lateral||0,f));}
function vehicleAt(t){
 if(t<=C.seaEnd){const drift=.30*Math.sin(clamp(t/C.seaEnd)*Math.PI)**4,offset=vector(deep.bodyMatrix,[0,0,drift]);return pose(Object.fromEntries(['x','y','z'].map((k,i)=>[k,deep.position[k]+offset[i]])),deep.heading,deep.pitch,0,deep.distance,deep.lateral);}
 if(t<C.deepLiftEnd)return blendPose(deep,settled,(t-C.seaEnd)/(C.deepLiftEnd-C.seaEnd));
 if(t<C.reverseFallEnd){const s=mix(DOOR_DRIVE_TEASER.settledStart,DOOR_DRIVE_TEASER.fallStart,ease((t-C.deepLiftEnd)/(C.reverseFallEnd-C.deepLiftEnd)));return doorDriveTeaserPoseAt(s);}
 if(t<C.reverseEnd){const s=mix(DOOR_DRIVE_TEASER.fallStart,DOOR_DRIVE_TEASER.climbStart,ease((t-C.reverseFallEnd)/(C.reverseEnd-C.reverseFallEnd)));return doorDriveTeaserPoseAt(s);}
 if(t<C.hydroplaneEnd){const u=(t-C.reverseEnd)/(C.hydroplaneEnd-C.reverseEnd),f=ease(u),distance=mix(C.reverseRoadEndDistance,C.hydroplaneEndDistance,f);return roadPose(distance,{lateral:1.65*Math.sin(u*Math.PI)**2,turn:Math.PI*f,roll:.09*Math.sin(u*Math.PI*2)*Math.sin(u*Math.PI)});}
 if(t<C.forwardEnd)return roadPose(mix(C.hydroplaneEndDistance,C.forwardEndDistance,ease((t-C.hydroplaneEnd)/(C.forwardEnd-C.hydroplaneEnd))),{turn:Math.PI});
 if(t<C.dollyEnd)return roadPose(mix(C.forwardEndDistance,C.dollyEndDistance,ease((t-C.forwardEnd)/(C.dollyEnd-C.forwardEnd))),{turn:Math.PI});
 return roadPose(mix(C.dollyEndDistance,C.endDistance,ease((t-C.dollyEnd)/(C.durationSeconds-C.dollyEnd))),{turn:Math.PI});
}
function dollyLocal(progress,metrics){
 const seat=metrics.eye.map((x,k)=>x+metrics.cabinBodyMount[k]),body=metrics.body;
 // Leave through the driver's side glazing before rising and retreating;
 // a straight backwards lerp would pass through the real rear bulkhead.
 const keys=[[0,seat],[.27,[body.max[0]+.55,seat[1],seat[2]]],[.56,[body.max[0]+1.45,body.max[1]+1.5,1.4]],[1,[0,body.max[1]+2.5,body.max[2]+6]]];let i=0;while(i<keys.length-2&&progress>keys[i+1][0])i++;const[a,b]=[keys[i],keys[i+1]],f=ease((progress-a[0])/(b[0]-a[0]));return a[1].map((v,k)=>mix(v,b[1][k],f));
}
const phaseAt=t=>t<C.seaEnd?'seabed':t<C.reverseEnd?'reverse-bluffs':t<C.hydroplaneEnd?'hydroplane':t<C.forwardEnd?'forward-bluffs':t<C.dollyEnd?'camera-release':t<C.durationSeconds?'source-black':'handoff';

/** JSON-safe checkpoint. Metrics are a small copy of the real loaded mounts. */
export function createSourceReturnFlashback({destination:target,reducedMotion=false,metrics,checkpoint=null,returnPose:capturedReturnPose=null}={}){
 const captured=destination(target),actualMetrics=vehicleMetrics(metrics??checkpoint?.vehicleMetrics),restored=normalizeSourceReturnFlashbackCheckpoint(checkpoint,{destination:captured,reducedMotion,metrics:actualMetrics});
 if(restored){restored.returnPose??=returnPose(capturedReturnPose);return restored;}
 return{kind:C.kind,version:C.version,elapsed:0,reducedMotion:reducedMotion===true,destination:captured,returnPose:returnPose(capturedReturnPose),vehicleMetrics:actualMetrics,clippedSeconds:0};
}
/** Invalid or cross-route saves cannot silently become a different exit. */
export function normalizeSourceReturnFlashbackCheckpoint(value,{destination:target=value?.destination,reducedMotion=value?.reducedMotion,metrics=value?.vehicleMetrics}={}){
 try{if(value?.kind!==C.kind||value.version!==C.version||!Number.isFinite(value.elapsed)||value.elapsed<0||value.elapsed>C.durationSeconds||!Number.isFinite(value.clippedSeconds)||value.clippedSeconds<0||value.destination!==target)return null;return{kind:C.kind,version:C.version,elapsed:value.elapsed,reducedMotion:reducedMotion===true,destination:destination(target),returnPose:returnPose(value.returnPose),vehicleMetrics:vehicleMetrics(metrics),clippedSeconds:value.clippedSeconds};}catch{return null;}
}
/** Advance only active simulation time; blur, pause and missing picture hold. */
export function stepSourceReturnFlashback(state,dt=0,{paused=false,hidden=false,interrupted=false,renderReady=true}={}){
 if(state?.kind!==C.kind||state.version!==C.version)throw new TypeError('Invalid Source return flashback state.');
 if(paused||hidden||interrupted||renderReady===false)return state;
 const incoming=Math.max(0,finite(dt)),seconds=Math.min(.25,incoming);state.clippedSeconds+=incoming-seconds;state.elapsed=Math.min(C.durationSeconds,state.elapsed+seconds);return state;
}
/** Pure frame sampler, also usable for matched authoring captures. */
export function sampleSourceReturnFlashback(timeSec=0,{destination:target,reducedMotion=false,metrics}={}){
 const captured=destination(target),actualMetrics=vehicleMetrics(metrics),t=clamp(finite(timeSec),0,C.durationSeconds),vehicle=vehicleAt(t),body=vehicle.bodyMatrix,phase=phaseAt(t),dolly=ease((t-C.forwardEnd)/(C.dollyEnd-C.forwardEnd)),localEye=dollyLocal(dolly,actualMetrics),eye=point(body,localEye);
 // Keep the seat looking through its actual windscreen. The submerged body
 // supplies the upward view; extra seat pitch would point into its roof.
 const lookPitch=-.035;
 const cp=Math.cos(lookPitch),forward=unit(vector(body,[0,Math.sin(lookPitch),-cp]));let yaw=Math.atan2(forward[0],-forward[2]),pitch=Math.asin(clamp(forward[1],-1,1));
 const spin=(t-C.reverseEnd)/(C.hydroplaneEnd-C.reverseEnd),reducedCover=reducedMotion&&spin>0&&spin<1?ease((spin-.34)/.10)*(1-ease((spin-.56)/.10)):0;
 if(reducedMotion&&spin>=0&&spin<=1){const road=worldAt(vehicle.distance),before=road.heading,after=road.heading+Math.PI;yaw=spin<.5?before:after;pitch=road.pitch*Math.cos(spin<.5?0:Math.PI)-.035;}
 if(dolly>0){const targetEye=point(body,[0,1.1,-.4]),direction=targetEye.map((x,k)=>x-eye[k]),targetYaw=Math.atan2(direction[0],-direction[2]),targetPitch=Math.atan2(direction[1],Math.hypot(direction[0],direction[2])),aim=ease(dolly/.5);yaw=angularMix(yaw,targetYaw,aim);pitch=mix(pitch,targetPitch,aim);}
 const entryCover=1-ease(t/C.entryFadeSeconds),exitCover=ease((t-C.fadeStart)/(C.durationSeconds-C.fadeStart)),coverAlpha=Math.max(entryCover,exitCover,reducedCover),local=vehicle.position,waterY=COASTAL_WORLD_FROM_LOCAL[13],underwater=1-ease((local.y-waterY+1.4)/2.8),before=vehicleAt(Math.max(0,t-.005)),after=vehicleAt(Math.min(C.durationSeconds,t+.005)),span=Math.min(C.durationSeconds,t+.005)-Math.max(0,t-.005),velocity=['x','y','z'].map(k=>(after.position[k]-before.position[k])/Math.max(.0001,span)),speed=velocity[0]*Math.sin(vehicle.heading)-velocity[2]*Math.cos(vehicle.heading),direction=unit(vector(body,[0,-.02,-1]));
 const lamps=actualMetrics.body.headlamps.map((p,i)=>({id:'drive-headlamp-'+i,position:point(body,p),direction:[...direction],intensity:5}));
 const sourceBlack=ease((t-36)/8);
 return{kind:C.kind,version:C.version,timeSec:t,phase,durationSeconds:C.durationSeconds,controlsEnabled:false,controlOwner:'source-return-cinematic',worldOwner:'source-return-flashback',
  vehicle:{...vehicle,speed,velocity,gear:t<C.hydroplaneEnd?-1:1},camera:{eye,yaw,pitch,roll:0,mode:dolly>0?'physical-dolly':'first-person',dolly},lamps,
  coverAlpha,sourceBlack,underwater,coastalMemory:{active:true,siteMatrix:[...COASTAL_WORLD_FROM_LOCAL],waterY:0,time:t,lights:lamps,flood:underwater},
  cinematic:{schema:1,phase,timeSec:t,controlsLocked:true,audio:{submerged:underwater,enginePower:1,radioPower:.35,roadContact:t<C.reverseFallEnd?0:1-sourceBlack,waterImpact:0,bodyGrind:0,metalStrain:phase==='reverse-bluffs'?.2:0,windOpen:1-underwater},cues:[]},
  handoffReady:t>=C.durationSeconds,destination:t>=C.durationSeconds?captured:null,
  geometryContract:{coast:'existing canonical COASTAL_WORLD_FROM_LOCAL',openingRoad:'reverse of the actual d304 cliff release and d250 bluff road',seabed:'return scene must lower or replace the shallow cm_seabed while preserving this coast frame',bodyIsPresentationOnly:true}};
}
export function sourceReturnFlashbackFrame(state,{metrics=state?.vehicleMetrics}={}){
 if(state?.kind!==C.kind||state.version!==C.version)throw new TypeError('Invalid Source return flashback state.');
 const frame=sampleSourceReturnFlashback(state.elapsed,{destination:state.destination,reducedMotion:state.reducedMotion,metrics});return{...frame,returnPose:frame.handoffReady?returnPose(state.returnPose):null};
}
