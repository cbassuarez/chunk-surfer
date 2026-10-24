// The explorable return uses the same physical coast, van and final acquisition
// as the opening. This owner never changes Source's body or save camera.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import * as FP from '../world/floorplan.js';
import {CELL,MATERIAL,F} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {COASTAL_MEMORY_LAYOUT as L,COASTAL_WORLD_FROM_LOCAL,COASTAL_NOTE_COPY,coastalWorldPoint} from '../data/coastal-memory.js';
import {makeCoastalMemoryScene,COASTAL_MEMORY_ASSETS} from '../game/coastal-memory/scene.js';
import {ensureWorldLetteringFonts,worldLetteringFont} from './world-lettering-fonts.js';
import {physicalPrintPixels,uploadPhysicalPrint} from './physical-source-print.js';

const coastMeshes=['cm_limestone_coast','cm_grass_bank','cm_soil_cap','cm_seabed','cm_wreck_seat','cm_limestone_block','cm_limestone_outcrop_0','cm_limestone_outcrop_1','cm_limestone_outcrop_2','cm_limestone_outcrop_3','cm_foam_lace','cm_music_box_plinth','cm_broken_music_box','cm_damp_note','cm_distant_pier','cm_music_box_cylinder','cm_music_box_gear','cm_music_box_live_tine'];
const vanMeshes=['drive_vehicle_body','drive_cabin'];
const required=[...coastMeshes,...vanMeshes];
const finite=(n,d=0)=>Number.isFinite(n)?n:d;
const clamp=n=>Math.max(0,Math.min(1,finite(n)));
export function coastalMemoryRenderFrame(frame,{vehicleMetrics=null,reducedMotion=false}={}){
 const pose=frame.localPose||frame.pose||L.spawn,time=finite(frame.elapsed),eye=coastalWorldPoint([pose.x,pose.feet+1.62,pose.z]);
 const scene=makeCoastalMemoryScene({timeSec:reducedMotion?0:time,musicBoxTime:finite(frame.recordingOffset,time),includeWreck:true,mode:'foot',vehicleMetrics});
 const level=clamp(frame.wreckLightLevel??0),lights=[],pierShadow=pose.z>=68;
 for(const prop of scene.props)if(prop.id==='coastal-sunken-same-van')prop.fixturePower=level;
 const marker=scene.lamps.find(lamp=>lamp.id==='coastal-pier-near-marker');if(marker)marker.castsShadow=pierShadow;
 for(const lamp of scene.water.realHeadlamps){lamp.intensity*=level;if(level<.001||pierShadow)lamp.castsShadow=false;const m=lamp.vehicleBody;lights.push({position:[lamp.x,lamp.y,lamp.z],direction:[-m[8],-m[9],-m[10]],intensity:lamp.intensity});}
 const yaw=finite(pose.yaw)+Math.atan2(COASTAL_WORLD_FROM_LOCAL[2],COASTAL_WORLD_FROM_LOCAL[0]);
 return{scene,eye,yaw,pitch:finite(pose.pitch),coastalMemory:{active:true,siteMatrix:COASTAL_WORLD_FROM_LOCAL,waterY:0,time:reducedMotion?0:time,lights,flood:0},noteCopy:COASTAL_NOTE_COPY};
}
function installNoteInk(gl,pack){
 const mesh=pack.catalog.get('cm_damp_note');if(!mesh)return false;
 if(mesh.coastalInkRevision===1)return true;
 const bitmap=physicalPrintPixels({width:768,height:548,ground:'#c3baa0',finish:{profile:'paper',widthM:.14,heightM:.10,seed:'coastal-anonymous-note',repeat:false},draw(c,m){
  c.font=m.font=worldLetteringFont(40,'serif');c.textBaseline=m.textBaseline='alphabetic';m.fillStyle='#fff';c.fillStyle='#28261f';
  for(const[text,y]of[['For the part',238],['that wouldn’t play.',299]]){const x=(768-c.measureText(text).width)/2;c.fillText(text,x,y);m.fillText(text,x,y);}
 }});
 const texture=uploadPhysicalPrint(gl,bitmap,{repeat:false}),normalTexture=uploadPhysicalPrint(gl,{...bitmap,pixels:bitmap.normalPixels},{repeat:false,srgb:false}),ormTexture=uploadPhysicalPrint(gl,{...bitmap,pixels:bitmap.ormPixels},{repeat:false,srgb:false});
 for(const primitive of mesh.primitives)Object.assign(primitive,{texture,normalTexture,ormTexture,base:[1,1,1,1],roughness:1,metallic:0,alphaCut:0,printedSurface:{version:1,coverage:'baseColorAlpha',polarity:'dark-on-light',process:'personal-ink',emission:'none'}});
 mesh.coastalInkRevision=1;
 return true;
}
export function createCoastalMemoryRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,fetcher=globalThis.fetch,reducedMotion=false,onRelease=()=>{},ensureFonts=ensureWorldLetteringFonts,installInk=installNoteInk,getTorch=()=>({on:false})}={}){
 let initialized=false,released=false,pending=null,error=null,vehicleMetrics=null,last=null,releaseRange=null;
 const resident=()=>{const names=new Set(props.propMeshCatalog());return required.every(n=>names.has(n));};
 function clear(){
  for(const name of ['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
  for(const name of ['r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetEmergencyShadows','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps','r3dSetLocalLights'])renderer[name]?.([]);
  for(const name of ['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);
  props.setDriveStudyFrame?.(null);props.setPressureInstances?.([]);
 }
 function initialize(){
  if(pending)return pending;
  pending=(async()=>{
   if(await renderer.r3dBasePropsReady?.()===false)throw Error('The coastal prop context could not be prepared.');
   for(const[path,names]of [['assets/source-drive/drive.glb',vanMeshes],[COASTAL_MEMORY_ASSETS.geometry.replace(/^\//,''),coastMeshes]]){
    const catalog=new Set(props.propMeshCatalog());if(names.some(name=>!catalog.has(name)))await props.addPropPack(resolveAsset(path));
   }
   const response=await fetcher(resolveAsset('assets/source-drive/geometry/metrics.json'));if(!response?.ok)throw Error('The actual van metrics are unavailable.');vehicleMetrics=await response.json();
   await ensureFonts();if(released)return false;
   if(!resident())throw Error('The shared coastal catalog is incomplete.');
   props.installAuthoredPropMeshes(installInk);releaseRange=props.setAuthoredPropRange('coastal-memory',320);clear();
   const size=256,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.serviceConcrete);
   for(let i=0;i<size*size;i++)rgba.set([FP.encodeH(0),FP.encodeH(6),F.SKY,0],i*4);
   renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:coastal-memory',look:{roomMemoryActive:true},staticInstances:[],dynamicInstances:[],corpus:[]});
   renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSetLightingContext({ambientColor:[.62,.69,.77],ambientIntensity:.14,captureExposure:2.4,whitePointScale:1,screen:'stochastic'});
   renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
  })().catch(reason=>{error=String(reason?.message||reason);throw reason;});return pending;
 }
 function render(frame){
  if(!initialized||released||!renderer.r3dPresentationReady())return false;
  if(!resident())throw Error('The coastal catalog was replaced during exploration.');
  last=coastalMemoryRenderFrame(frame,{vehicleMetrics,reducedMotion});renderer.r3dSetProps(last.scene.props);renderer.r3dSetLocalLights(last.scene.lamps);
  const camera={eye:last.eye,yaw:last.yaw,pitch:last.pitch},torch=getTorch()||{on:false};
  return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-1.62,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:!!torch.on,torchLook:torch.look||{power:1},plan:true,water:{active:false},sensoryProfile:'story',sourceVoidPhysical:true,coastalMemory:last.coastalMemory,authoredCamera:camera})!==false;
 }
 function dispose(){if(released)return false;released=true;const owned=initialized;initialized=false;if(owned)clear();releaseRange?.();releaseRange=null;onRelease();return true;}
 return{initialize,render,dispose,clear:()=>renderer.r3dClearScreen?.(),ready:()=>initialized&&!released&&!error&&resident(),diagnostics:()=>({ready:initialized&&!released&&!error,error,scene:last?{eye:last.eye,yaw:last.yaw,pitch:last.pitch,props:last.scene.props.length,headlights:last.coastalMemory.lights,noteCopy:last.noteCopy,samePlace:true}:null})};
}
