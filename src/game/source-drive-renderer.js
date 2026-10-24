// One temporary owner of the existing world renderer. No extra canvas, context
// or animation loop: Source is held by the calling scene until release.
import * as R3 from '../render/r3d.js';
import * as P3 from '../render/props3d.js';
import * as FP from '../world/floorplan.js';
import {F,CELL,MATERIAL} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {drawRecorderReadoutCanvas} from '../render/recorder-instrument.js';

const DRIVE_ASSET_PACKS=Object.freeze([
 {key:'drive',path:'assets/source-drive/drive.glb',kind:'prop',meshes:['drive_cabin','drive_radio','drive_road','drive_recorder_body']},
 {key:'hands',path:'assets/source-drive/geometry/wheel-hands.glb',kind:'character'},
 {key:'cutStatic',path:'assets/source-drive/cut/cut-static.glb',kind:'prop',meshes:['cut_geology','cut_retaining']},
 {key:'cutLiving',path:'assets/source-drive/cut/cut-living.glb',kind:'character'},
 {key:'cutRoadside',path:'assets/source-drive/cut/cut-roadside.glb',kind:'prop',meshes:['cut_guardrail','drive_plain_paving']},
 {key:'cutLandscape',path:'assets/source-drive/cut/cut-landscape.glb',kind:'character'},
 {key:'predicaments',path:'assets/source-drive/predicaments/drive-predicaments.glb',kind:'prop',meshes:['dp_wreck_saloon','dp_road_fold','dp_whiteout_pylon']},
]);
const COASTAL_ASSET_PACK=Object.freeze({key:'coastalMemory',path:'assets/source-drive/coastal-memory/coastal-memory.glb',kind:'prop',meshes:['cm_limestone_coast','cm_seabed','cm_distant_pier','cm_limestone_outcrop_0','cm_limestone_outcrop_1','cm_limestone_outcrop_2','cm_limestone_outcrop_3']});
const warmedDrivePacks=new Map();
function drivePackUrl(path){return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(String(path))?String(path):assetUrl(path);}
function drivePackInstalled(record){
 if(record.kind==='character')return(P3.characterStats().packs||[]).some(pack=>pack.url===record.url);
 const catalog=new Set(P3.propMeshCatalog());return record.meshes.every(mesh=>catalog.has(mesh));
}

// This installs context-owned P3 packs only. The still-visible Source scene,
// lights, plan, eye, frame loop and canvas remain entirely with their owner.
export async function preloadSourceDriveAssets({assets={},coastalMemory=false}={}){
 // The base loader replaces P3's catalog rather than merging it. A saved
 // journey can resume before that asynchronous install finishes on a cold
 // boot; installing hero packs first let the later building erase the cabin.
 const baseReady=await R3.r3dBasePropsReady?.();
 if(baseReady===false)throw Error('The drive base prop catalog could not be loaded.');
 // P3 reinitialisation disposes character bundles. Forget static ready bits as
 // well, since matching old catalog names alone cannot prove live GPU objects.
 if([...warmedDrivePacks.values()].some(record=>record.ready&&record.kind==='character'&&!drivePackInstalled(record)))warmedDrivePacks.clear();
 const requested=coastalMemory?[...DRIVE_ASSET_PACKS,COASTAL_ASSET_PACK]:DRIVE_ASSET_PACKS;
 for(const spec of requested){
  const url=drivePackUrl(assets[spec.key]??spec.path),key=spec.kind+'\0'+url;
  let record=warmedDrivePacks.get(key);
  if(record?.ready&&!drivePackInstalled(record)){warmedDrivePacks.delete(key);record=null;}
  if(!record){
   for(const[otherKey,other]of warmedDrivePacks)if(other.key===spec.key&&other.url!==url&&other.ready)warmedDrivePacks.delete(otherKey);
   record={...spec,url,ready:false,promise:null};
   record.promise=Promise.resolve().then(()=>spec.kind==='character'?P3.addCharacterPack(url):P3.addPropPack(url)).then(()=>{record.ready=true;return true;}).catch(error=>{if(warmedDrivePacks.get(key)===record)warmedDrivePacks.delete(key);throw error;});
   warmedDrivePacks.set(key,record);
  }
  await record.promise;
 }
 const wanted=new Set(requested.map(spec=>spec.key)),missing=[...warmedDrivePacks.values()].filter(record=>wanted.has(record.key)&&record.ready&&!drivePackInstalled(record));
 if(missing.length)throw Error('The drive prop catalog changed during preparation: '+missing.map(record=>record.key).join(', '));
 return true;
}

export function createSourceDriveRenderer({onRelease=()=>{}}={}){
 let initialized=false,released=false,canvas=null,initPromise=null;
 function clearSource(){R3.r3dSetHorizon?.(null);R3.r3dSetSourceShore?.(null);R3.r3dSetSourceEmergency?.(0);R3.r3dSetSourceWhiteout?.(0);R3.r3dSetSourceFault?.(0);R3.r3dSetLocalLights([]);R3.r3dSetEmergencyShadows?.([]);R3.r3dSetSourcePortals?.([]);R3.r3dSetSourceTowerView?.(null);R3.r3dSetSourceOpenings?.([]);R3.r3dSetSourceDoorLights?.([]);R3.r3dSetSourceCrossing?.(null);R3.r3dSetSourceReflection?.(null);R3.r3dSetIndoorRain?.(0);}
 function initialize({assets={},coastalMemory=false}={}){if(released)return Promise.resolve(false);if(initPromise)return initPromise;initPromise=(async()=>{await preloadSourceDriveAssets({assets,coastalMemory});if(released)return false;clearSource();const w=256,h=256,rgba=new Uint8Array(w*h*4),material=new Uint8Array(w*h).fill(MATERIAL.serviceConcrete);for(let i=0;i<w*h;i++)rgba.set([FP.encodeH(0),FP.encodeH(6),F.SKY,0],i*4);R3.r3dSetPlan(rgba,w,h,material);R3.r3dSetSourceScene({key:'source:the-cut',look:{roomMemoryActive:true},staticInstances:[],dynamicInstances:[],corpus:[]});R3.r3dSetDynamicProps([]);R3.r3dSetLookProfile('explore',{transitionMs:0});R3.r3dSetLightingContext({ambientColor:[.64,.66,.6],ambientIntensity:.065,captureExposure:5.5,whitePointScale:1,screen:'stochastic'});canvas=document.createElement('canvas');canvas.width=666;canvas.height=239;R3.r3dSnapCameraOnNextFrame?.();R3.r3dResetVfdMemory?.();initialized=true;return true;})().catch(error=>{initPromise=null;throw error;});return initPromise;}
 function setRecorderReadout(view){if(!canvas)return;drawRecorderReadoutCanvas(canvas.getContext('2d'),view||{counter:'00:00',mode:'idle',note:'FIELD TAKE · READY'});P3.setDriveStudyCanvas('drive_recorder_readout',canvas);}
 function render(frame){if(!initialized||released||!R3.r3dPresentationReady())return false;const scene=frame.scene,weather=frame.weather,look=frame.look,drive=frame.driveState;if(!scene||!look||!drive)return false;R3.r3dSetProps(scene.props);if(frame.cinematicLook&&R3.r3dSetCinematicLook)R3.r3dSetCinematicLook(look);else R3.r3dSetLookAngles({yaw:look.yaw,pitch:look.pitch,immediate:true});R3.r3dSetLocalLights(scene.lamps);const driveFrame={active:true,heading:drive.heading,lampDip:.020-scene.roadPitch,mirrors:scene.mirrors,inspectionLights:scene.cut.lights,rainShelter:scene.rainShelter,weather};P3.setDriveStudyFrame(driveFrame);const eye=scene.eye,before=R3.r3dPixelMeshStatus().framesRendered,submitted=R3.r3dFrame({px:eye[0]/CELL-.5,py:eye[2]/CELL-.5,floorH:eye[1]-1.62,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:frame.recording?.level||0,light:0,plan:true,water:{active:false},sensoryProfile:'story',sourceVoidPhysical:true,driveStudy:driveFrame,coastalMemory:frame.coastalMemory||null}),final=R3.r3dPixelMeshStatus();return submitted!==false&&R3.r3dPresentationReady()&&final.shaderReady===true&&final.supported===true&&final.framesRendered>before;}
 function dispose(){if(released)return false;released=true;const owned=initialized;initialized=false;if(owned){P3.setDriveStudyFrame?.(null);clearSource();}canvas=null;onRelease();return true;}
 return{initialize,render,setRecorderReadout,project:point=>R3.r3dProjectWorld({x:point[0],y:point[1],z:point[2]}),dispose,ready:()=>initialized&&!released&&R3.r3dPresentationReady()};
}
