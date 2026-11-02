// Contact is an intentional reach toward the existing supported follower. Its
// proximity/catch controller remains separate; these helpers never award a win,
// change the tape or create a floor beneath an apparent portal image.
import {SOURCE_CONTINUATION as C,continuationSupportAt} from '../data/source-continuation.js';
import {sourceContinuationCanOccupy} from './source-continuation.js';
import {continuationFreeBody} from './source-continuation-physics.js';
import {sourceRestPositionProtected} from './source-rest-seat.js';
import {SOURCE_RECORDING_CASSETTE as CARTRIDGE} from '../render/source-recording-cassette-model.js';

export const SOURCE_CONTINUATION_CONTACT=Object.freeze({minimumDistance:1.05,maximumDistance:2.65,recoveryDistance:1.45});
export const SOURCE_RECORDING_WORLD=Object.freeze({maximumVisible:8,width:.40,centreHeight:1.28});
const cartridgeCentre=(width,cradleY,verticalSize)=>cradleY+.035+.002+verticalSize/2*(width/CARTRIDGE.width);
export const SOURCE_RECORDING_WORLD_CHAPTERS=Object.freeze({
 II:Object.freeze({width:.40,centreHeight:cartridgeCentre(.40,1.116,CARTRIDGE.height),pitch:0,offsetX:.85,offsetZ:0,baseWidth:.50,baseDepth:.22,cradleWidth:.53,cradleDepth:.14,cradleY:1.116,postHeight:1.08}),
 III:Object.freeze({width:1.15,centreHeight:cartridgeCentre(1.15,1.094,CARTRIDGE.depth),pitch:-Math.PI/2,radialOffset:1.45,baseWidth:1.35,baseDepth:.87,cradleWidth:1.35,cradleDepth:.87,cradleY:1.094,postHeight:1.06}),
});
export const SOURCE_CONTINUATION_RECORDING_RETURNS=Object.freeze([
 Object.freeze({chapter:'II',locationId:'source-ii-recording-return',chartId:0,x:16,z:-22,feet:0,phase:'wrong-return',level:0}),
 Object.freeze({chapter:'III',locationId:'source-iii-recording-return',chartId:0,x:-177,z:-85,feet:2.4,phase:'catch',level:1}),
]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),chart=value=>value?.chartId??0;
const finitePose=value=>value&&['x','z','feet'].every(key=>Number.isFinite(value[key]));
export const continuationContactChapter=state=>state?.phase==='wrong-return'?'II':state?.phase==='catch'?'III':null;
export function sourceContinuationRecordingDestination(chapter){
 const row=SOURCE_CONTINUATION_RECORDING_RETURNS.find(row=>row.chapter===chapter);
 return row?{chapter:row.chapter,locationId:row.locationId,chartId:row.chartId,x:row.x,z:row.z,feet:row.feet}:null;
}
function available(state,{protected:held=false}={}){
 return !held&&state?.status==='active'&&!state.fall&&!state.recovery&&!state.reveal&&!state.bodyTransit&&!state.cameraTransit
  &&finitePose(state)&&(!state.sourceRestView||state.sourceRestView.mode==='standing')&&!sourceRestPositionProtected(state);
}
function weightNear(state,at){
 const w=state.counterweight;
 return state.phase==='catch'&&chart(state)===0&&w?.active&&Number.isFinite(w.y)
  &&w.y<at.feet+C.bodyHeight+.4&&w.y+C.catch.hoist.drumHeight>at.feet-.4&&distance(w,at)<2.8;
}
function supported(state,at){
 if(!finitePose(at)||!sourceContinuationCanOccupy(at.x,at.z,{...state,...at})||!continuationFreeBody(at,{...state,...at},{ignoreFloors:true}))return false;
 return [[0,0],[-C.bodyRadius,0],[C.bodyRadius,0],[0,-C.bodyRadius],[0,C.bodyRadius]].every(([dx,dz])=>{
  const p=continuationSupportAt(at.x+dx,at.z+dz,{...state,...at},{minY:at.feet-.06,maxY:at.feet+.06});
  return !!p;
 });
}
function supportedReach(state,at){
 if(chart(state)!==chart(at)||Math.abs(state.feet-at.feet)>.3)return false;
 const metres=distance(state,at),steps=Math.max(1,Math.ceil(metres/.15));
 for(let k=0;k<=steps;k++){
  const t=k/steps,p={x:state.x+(at.x-state.x)*t,z:state.z+(at.z-state.z)*t,feet:state.feet+(at.feet-state.feet)*t,chartId:chart(state)};
  if(!supported(state,p))return false;
 }
 return true;
}
const faces=(state,at)=>state.phase==='catch'||distance(state,at)<.1
 ||(Math.sin(state.yaw||0)*(at.x-state.x)-Math.cos(state.yaw||0)*(at.z-state.z))/distance(state,at)>.25;

export function sourceContinuationHushContactFocus(state,{status,...options}={}){
 const h=state?.hush,chapter=continuationContactChapter(state);
 if(!available(state,options)||!h?.active||!status||status.chapter!==chapter||!(status.battleAvailable||status.repeatAvailable)
  ||status.activeBattleId||h.fall||h.recovery||h.bodyTransit||h.cameraTransit||['yield','recovering','falling'].includes(h.mode)
  ||!finitePose(h)||chart(h)!==chart(state)||weightNear(state,state)||weightNear(state,h))return null;
 const metres=distance(state,h);
 if(metres<SOURCE_CONTINUATION_CONTACT.minimumDistance||metres>SOURCE_CONTINUATION_CONTACT.maximumDistance||!faces(state,h)||!supportedReach(state,h))return null;
 return{id:'source-contact-'+chapter,type:'source-contact',chapter,title:'CONTACT',text:status.repeatAvailable?'It has already yielded here. Contact it again.':'Reach toward the presence.',
  x:h.x,z:h.z,y:h.feet,distance:metres,position:{x:h.x,y:h.feet+1.05,z:h.z},repeatContact:!!status.repeatAvailable};
}
function heldReturns(state,custody,{allChapters=false}={}){
 const chapter=continuationContactChapter(state);
 if(custody?.schema!==1||custody.runId!==state.runId)return[];
 return(Array.isArray(custody.recordings)?custody.recordings:[]).map(row=>({row,anchor:SOURCE_CONTINUATION_RECORDING_RETURNS.find(anchor=>anchor.chapter===row?.destination?.chapter)}))
  .filter(({row,anchor})=>anchor&&(allChapters||anchor.chapter===chapter)&&row?.status==='held'&&typeof row.id==='string'
   &&row.destination?.locationId===anchor.locationId&&row.destination?.chartId===anchor.chartId
   &&['x','z','feet'].every(key=>Math.abs(row.destination[key]-anchor[key])<1e-6));
}
function recordingFixtureSupported(state,anchor){
 const style=SOURCE_RECORDING_WORLD_CHAPTERS[anchor.chapter],base=returnPresentation(anchor),at={...anchor,x:base.x,z:base.z};
 if(!supported({...state,phase:anchor.phase,level:anchor.level},at))return false;
 return[-1,1].every(dx=>[-1,1].every(dz=>!!continuationSupportAt(base.x+dx*style.baseWidth/2,base.z+dz*style.baseDepth/2,anchor,{minY:anchor.feet-.06,maxY:anchor.feet+.06})));
}
export function sourceContinuationRecordingReturnProps(state,custody){
 const groups=new Map(),props=[];
 for(const item of heldReturns(state,custody,{allChapters:true})){
  if(!recordingFixtureSupported(state,item.anchor))continue;
  const rows=groups.get(item.anchor.locationId)||[];rows.push(item);groups.set(item.anchor.locationId,rows);
 }
 for(const rows of groups.values()){
  const {anchor}=rows[0],base=returnPresentation(anchor),style=SOURCE_RECORDING_WORLD_CHAPTERS[anchor.chapter],extra={phase:anchor.phase,region:anchor.phase,chartId:anchor.chartId,level:anchor.level,structural:false,decorative:true,noCollision:true,locationId:anchor.locationId};
  // A conspicuous, supported fixture on the existing main route. Its narrow
  // body is presentation only: neither footing nor collision is changed.
  props.push({id:'source-recording-stand:'+anchor.locationId,mesh:'source-continuation-worn-block',x:base.x,y:anchor.feet+.015,z:base.z,yaw:0,scaleX:style.baseWidth,scaleY:.035,scaleZ:style.baseDepth,...extra,sourceRecordingStand:true},
   {id:'source-recording-post:'+anchor.locationId,mesh:'source-continuation-pin',x:base.x,y:anchor.feet+.05,z:base.z,yaw:0,scaleX:.035,scaleY:style.postHeight,scaleZ:.035,...extra,sourceRecordingStand:true},
   {id:'source-recording-cradle:'+anchor.locationId,mesh:'source-continuation-worn-block',x:base.x,y:anchor.feet+style.cradleY,z:base.z,yaw:0,scaleX:style.cradleWidth,scaleY:.035,scaleZ:style.cradleDepth,...extra,sourceRecordingStand:true});
  for(const[index,{row}]of rows.slice(0,SOURCE_RECORDING_WORLD.maximumVisible).entries()){
   const pose=returnPresentation(anchor,index);
   props.push({id:'source-recording-return:'+row.id,kind:'source-recording-cassette',mesh:'academic_roof_cassette',...pose,
    worldWidth:style.width,recording:JSON.parse(JSON.stringify(row)),...extra,role:'recording-return',
    sourceRecordingReturn:true,recordingReceiptId:row.id,takeId:row.takeId,takeKey:row.takeKey});
  }
  if(rows.length>SOURCE_RECORDING_WORLD.maximumVisible)props.push({id:'source-recording-more:'+anchor.locationId,mesh:'source-continuation-worn-block',
   x:base.x,y:anchor.feet+style.cradleY-.026,z:base.z-.15,yaw:0,scaleX:style.cradleWidth*.83,scaleY:.07,scaleZ:.10,...extra,sourceRecordingStand:true,sourceRecordingSpine:true,remainingCount:rows.length-SOURCE_RECORDING_WORLD.maximumVisible});
 }
 return props;
}
export function sourceRecordingReturnPresentation(anchor,index=0){
 const style=SOURCE_RECORDING_WORLD_CHAPTERS[anchor?.chapter];if(!style)return null;
 const dx=anchor.x-C.catch.center.x,dz=anchor.z-C.catch.center.z,radius=Math.hypot(dx,dz)||1,
  x=anchor.x+(style.radialOffset?dx/radius*style.radialOffset:style.offsetX||0),z=anchor.z+(style.radialOffset?dz/radius*style.radialOffset:style.offsetZ||0);
 return{x:x+index*.035,y:anchor.feet+style.centreHeight+index*.012,z:z-index*.035,yaw:.07-index*.025,pitch:style.pitch,roll:0};
}
const returnPresentation=sourceRecordingReturnPresentation;
export function sourceContinuationRecordingReturnFocus(state,{custody,...options}={}){
 if(!available(state,options)||weightNear(state,state))return null;
 return heldReturns(state,custody).slice(0,SOURCE_RECORDING_WORLD.maximumVisible).map(({row,anchor},index)=>({row,anchor,pose:{...anchor,...returnPresentation(anchor,index)},distance:distance(state,returnPresentation(anchor,index))})).filter(({anchor,pose,distance:metres})=>Math.abs(anchor.feet-state.feet)<.1
  &&metres<=SOURCE_CONTINUATION_CONTACT.recoveryDistance+1e-6&&faces(state,pose)&&supportedReach(state,pose)).map(({row,anchor,pose,distance:metres})=>({
   id:'source-recording-return:'+row.id,type:'source-recording-return',receiptId:row.id,chapter:anchor.chapter,locationId:anchor.locationId,
   title:'HOLD THE CASSETTE',text:row.place||row.roomId||'Your recording.',x:pose.x,z:pose.z,y:pose.y,distance:metres,
   position:{x:pose.x,y:pose.y,z:pose.z},takeId:row.takeId,takeKey:row.takeKey,takeOrdinal:row.takeOrdinal,
  }))[0]||null;
}
export function sourceContinuationContactFocus(state,options={}){
 return sourceContinuationRecordingReturnFocus(state,options)||sourceContinuationHushContactFocus(state,options);
}
