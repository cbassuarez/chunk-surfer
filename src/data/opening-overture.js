// The approved post-exit edit. Camera, focus and transition time belong to
// presentation, never to the saved walking camera or the vehicle controller.
import { OPENING_OVERTURE_PLAN, OPENING_OVERTURE_PLAN_REVISION, OPENING_OVERTURE_PLAN_SHA256 } from './opening-overture-plan.js';
import {pubPhysicalAt} from './exterior-pub.js';
export { OPENING_OVERTURE_PLAN, OPENING_OVERTURE_PLAN_REVISION, OPENING_OVERTURE_PLAN_SHA256 } from './opening-overture-plan.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(value)||0));
const smooth=value=>{const t=clamp(value);return t*t*t*(10+t*(-15+6*t));};
const mix=(a,b,t)=>a+(b-a)*t;
const vector=(a,b,t)=>a.map((value,k)=>mix(value,b[k],t));
const subtract=(a,b)=>a.map((value,k)=>value-b[k]);
const dot=(a,b)=>a.reduce((sum,value,k)=>sum+value*b[k],0);
const finite3=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const pubPhysicalVector=value=>{const p=pubPhysicalAt({x:value[0],y:value[1],z:value[2]});return[p.x,p.y,p.z];};
const SEMANTIC_IDS=['pub-evening','vigil','ellery-title','service-approach','room-chamber','room-b3','tower','return'];
const CONTEXT={
  pub:{renderGroup:'ground',floorH:.12,observerSpace:'exterior_pub',observerAt:pubPhysicalVector([41,.12,31])},
  vigil:{renderGroup:'ground',floorH:0,observerSpace:'loading_bay',observerAt:[28,0,52]},
  school:{renderGroup:'ground',floorH:0,observerSpace:'exterior_civic_block'},
  // The physical camera crosses the sloped dock apron. Its envelope seed is
  // actual level outdoor yard before that drop, not a fabricated body floor.
  yard:{renderGroup:'ground',floorH:0,observerSpace:'loading_bay',observerAt:[37,0,10]},
  chamber:{renderGroup:'academic',floorH:10,observerSpace:'academic',observerAt:[60,10,4],windowId:'W1-chamber-north'},
  b3:{renderGroup:'basement',floorH:-4,observerSpace:'basement',observerAt:[22,-4,12],windowId:'b3-control-window'},
  tower:{renderGroup:'ground',floorH:0,observerSpace:'exterior_civic_block'},
};
const optics=c=>c?{focalLengthMm:c.focalLengthMm,sensorHeightMm:12.445,apertureFNumber:c.fNumber,maxBlurPx:12}:null;
export const OPENING_OVERTURE_SHOTS=freeze(OPENING_OVERTURE_PLAN.shots.map((approved,index)=>{
  // Retain the approved photography relative to the room after its physical
  // relocation. The immutable reviewed plan remains the source-space record.
  if(approved.set==='pub')approved={...approved,physicalEmbedding:'yard-quarter-turn',camera:{...approved.camera,
    eye:approved.camera.eye.map(pubPhysicalVector),target:approved.camera.target.map(pubPhysicalVector),
    focus:approved.camera.focus?.map(mark=>({...mark,target:pubPhysicalVector(mark.target)}))},
    axisGeometry:approved.axisGeometry?{...approved.axisGeometry,lineXZ:approved.axisGeometry.lineXZ.map(([x,z])=>{const p=pubPhysicalAt({x,z});return[p.x,p.z];})}:undefined};
  const camera=approved.camera,context=CONTEXT[approved.set],dynamicReturn=approved.stage==='return';
  return {...approved,id:SEMANTIC_IDS[index],sourcePlanId:approved.id,index,
    duration:approved.end-approved.start,...context,windowPolicy:'physical',
    ambientPeople:['pub','vigil'].includes(approved.set),dynamicReturn,
    eyeFrom:camera?.eye?.[0]||null,eyeTo:camera?.eye?.at(-1)||null,
    targetFrom:camera?.target?.[0]||null,targetTo:camera?.target?.at(-1)||null,
    lens:optics(camera),propRange:260,
    ...(approved.set==='tower'?{architecture:{propId:'bay-west-elevation',mesh:'conservatory_west_elevation',asset:'assets/ellery-public-front.glb',anchor:[50,0,7.5],landmark:'1908-chapel-bell-tower'}}:{}),
    staging:{sourcePlanId:approved.id,set:approved.set,
      lightingOverride:approved.lightingOverride||null,lightScales:approved.lightScales||null,
      additionalInstances:approved.additionalInstances||[],additionalSetInstances:approved.additionalSetInstances||{}},
  };
}));
export const OPENING_OVERTURE=freeze({version:2,revision:OPENING_OVERTURE_PLAN_REVISION,planSha256:OPENING_OVERTURE_PLAN_SHA256,
  asset:'assets/opening-overture.glb',duration:OPENING_OVERTURE_PLAN.durationSeconds,
  coordinateSpace:'physical-metres',propRange:260,gameVerticalTan:.95,
  sensorMm:[24.89,12.445],readyShotIds:OPENING_OVERTURE_SHOTS.map(shot=>shot.id),
  birdsEnabled:false,
  // Retained as the independent legacy bird utility's lifetime, NOT an active
  // montage visibility instruction. Approved frames always disable birds.
  birdsVisibleUntil:9.4,
  title:{enabled:false,text:'CHUNK SURFER',shotId:'ellery-title'},
  requiredMeshes:['overture_parking_bay','overture_pigeon_body','overture_pigeon_head','overture_pigeon_beak','overture_pigeon_tail','overture_pigeon_wing_inner_l','overture_pigeon_wing_inner_r','overture_pigeon_wing_outer_l','overture_pigeon_wing_outer_r','overture_pigeon_foot_l','overture_pigeon_foot_r'],
});
// Original asset/flight records remain available to independent tools. They
// neither select a shot nor submit a bird during the approved cut.
export const OPENING_OVERTURE_BIRDS=freeze([
  {id:'roof-pigeon-0',perch:[32,8.040350277958836,17],roofRoll:.27175,takeoffAt:.64,heading:-.62,turn:-.13,scale:.90,beat:0},
  {id:'roof-pigeon-1',perch:[33,8.319012613101696,16],roofRoll:.27175,takeoffAt:1.01,heading:.18,turn:.11,scale:.97,beat:.23},
  {id:'roof-pigeon-2',perch:[34.8,8.820604816358842,16],roofRoll:.27175,takeoffAt:1.37,heading:1.06,turn:.18,scale:.86,beat:.49},
  {id:'roof-pigeon-3',perch:[36.7,8.959935983930273,15.7],roofRoll:-.27175,takeoffAt:1.79,heading:-2.26,turn:-.16,scale:1.04,beat:.72},
  {id:'roof-pigeon-4',perch:[39.8,8.096082744987409,15.5],roofRoll:-.27175,takeoffAt:2.13,heading:2.40,turn:.12,scale:.92,beat:.91},
]);
function curve(points,u){
  if(points.length===2)return vector(points[0],points[1],u);
  const [a,b,c,d]=points;
  return a.map((value,k)=>(1-u)**3*value+3*(1-u)**2*u*b[k]+3*(1-u)*u*u*c[k]+u**3*d[k]);
}
function returningView(returnView){
  const raw=returnView?.eye,eye=Array.isArray(raw)?raw:raw&&[raw.x,raw.y,raw.z];
  if(!finite3(eye)||!Number.isFinite(returnView?.yaw)||!Number.isFinite(returnView?.pitch)||Math.abs(returnView.pitch)>Math.PI/2){
    throw new TypeError('Opening return requires the actual saved post-exit eye, yaw and pitch.');
  }
  const {yaw,pitch}=returnView,cp=Math.cos(pitch),forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  return {eye:[...eye],target:eye.map((value,k)=>value+forward[k]*4),yaw,pitch,
    renderGroup:returnView.renderGroup||'ground',floorH:Number.isFinite(returnView.floorH)?returnView.floorH:eye[1]-1.62};
}
function focusAt(camera,eye,target,seconds){
  const direction=subtract(target,eye),length=Math.hypot(...direction)||1,axis=direction.map(value=>value/length);
  const marks=camera.focus?.length?camera.focus:[{at:0,target}],at=marks.findIndex(mark=>mark.at>=seconds),i=at<0?marks.length-1:at;
  const a=marks[Math.max(0,i-1)],b=marks[i],u=b.at>a.at?smooth((seconds-a.at)/(b.at-a.at)):1;
  const distance=mark=>mark.distanceM||Math.max(.10,dot(subtract(mark.target||target,eye),axis));
  const focusDistanceM=1/((1-u)/distance(a)+u/distance(b));
  // A rack interpolates optical vergence. The on-axis point describes its
  // actual focus plane; subject targets remain available separately.
  return {focusDistanceM,focusTarget:eye.map((value,k)=>value+axis[k]*focusDistanceM),
    focusSubjectTarget:vector(a.target||target,b.target||target,u)};
}
function veilAt(shot,localTime){
  if(shot.dynamicReturn)return localTime<.18?1:1-smooth((localTime-.18)/.52);
  let black=shot.index===0?1-smooth(localTime/.38):0;
  if(OPENING_OVERTURE_SHOTS[shot.index+1]?.dynamicReturn)black=Math.max(black,smooth((localTime-(shot.duration-.35))/.35));
  return black;
}
export function openingOvertureFrame(seconds=0,{returnView=null,reducedMotion=false}={}){
  const time=clamp(seconds,0,OPENING_OVERTURE.duration),shot=OPENING_OVERTURE_SHOTS.find(value=>time<value.end)||OPENING_OVERTURE_SHOTS.at(-1);
  const localTime=clamp(time-shot.start,0,shot.duration),progress=localTime/shot.duration;
  let eye,target,yaw,pitch,lens,focusTarget,focusSubjectTarget,renderGroup=shot.renderGroup,floorH=shot.floorH;
  if(shot.dynamicReturn){
    const actual=returningView(returnView);({eye,target,yaw,pitch,renderGroup,floorH}=actual);lens=null;focusTarget=[...target];focusSubjectTarget=[...target];
  }else{
    // The approved move is linear through the cut. Reduced motion keeps a slow
    // drift through that same move and holds the measured midpoint focus: no
    // pump, no rack, and no shot left standing still.
    const cameraTime=reducedMotion?shot.duration*(0.3+0.4*progress):localTime,
      focusTime=reducedMotion?shot.duration*.5:cameraTime,u=cameraTime/shot.duration;
    eye=curve(shot.camera.eye,u);target=curve(shot.camera.target,u);
    const d=subtract(target,eye);yaw=Math.atan2(d[0],-d[2]);pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]));
    // The focus holds the measured midpoint composition even as the eye drifts.
    const focusEyeAt=reducedMotion?curve(shot.camera.eye,.5):eye,focusTargetAt=reducedMotion?curve(shot.camera.target,.5):target;
    const focused=focusAt(shot.camera,focusEyeAt,focusTargetAt,focusTime);({focusTarget,focusSubjectTarget}=focused);
    lens={...shot.lens,focusDistanceM:focused.focusDistanceM};
  }
  const black=veilAt(shot,localTime),nativeReturn=shot.dynamicReturn;
  const observerAt=nativeReturn?[eye[0],floorH,eye[2]]:shot.observerAt||[eye[0],floorH,eye[2]];
  const performanceSeconds=(shot.performanceStartSeconds??shot.start)+localTime;
  return {version:2,revision:OPENING_OVERTURE.revision,time,seconds:time,duration:OPENING_OVERTURE.duration,
    done:Number(seconds)>=OPENING_OVERTURE.duration,shotId:shot.id,sourcePlanId:shot.sourcePlanId,sourceShotId:shot.sourceShotId,
    cutIndex:shot.index,cutSerial:shot.index+1,localTime,localSeconds:localTime,progress,
    eye,target,yaw,pitch,renderGroup,floorH,set:shot.set,renderSetId:shot.set==='tower'?'school':shot.set,
    observer:{x:observerAt[0],z:observerAt[2],feet:observerAt[1],renderGroup,spaceId:nativeReturn?null:shot.observerSpace||null},
    windowPolicy:shot.windowPolicy,windowId:shot.windowId||null,ambientPeople:shot.ambientPeople,
    ambientMotion:'existing-world-performance',performanceSeconds,reducedMotion,
    propRange:shot.propRange,lens,tanHalfFov:lens?lens.sensorHeightMm/(2*lens.focalLengthMm):OPENING_OVERTURE.gameVerticalTan,
    focusTarget,focusSubjectTarget,nativeReturn,black,
    transition:{black,restoreNative:nativeReturn,clearCarriedInput:nativeReturn,requiresFreshPlayerAction:nativeReturn},
    staging:nativeReturn?null:shot.staging,
    lightingOverride:nativeReturn?null:shot.staging.lightingOverride,lightScales:nativeReturn?null:shot.staging.lightScales,
    additionalInstances:nativeReturn?[]:shot.staging.additionalInstances,additionalSetInstances:nativeReturn?{}:shot.staging.additionalSetInstances,
    birdsVisible:false,birdPresentation:false,titleAlpha:0,titleText:null,controlsEnabled:false};
}
