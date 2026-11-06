// Horizon's renderer. This side is drawn every frame; the world behind the glass
// is drawn once into the tower door's capture and shown through the glass, which
// reprojects it as he moves and fills the screen as he walks in.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {sourceBlueprintLighting} from './source-blueprint-print.js';
import {installProceduralMeshes} from './procedural-mesh-install.js';
import {memoryFieldGeometry} from './memory-field-models.js';
import {horizonMirrorGeometry,HORIZON_MIRROR_MESHES} from './horizon-mirror-models.js';
import {horizonMirrorRenderFrame,horizonMirrorWorldProps,horizonMirrorWorldLights,HORIZON_MIRROR_CHURCH_MESH,HORIZON_MIRROR_ANT_MESH,HORIZON_MIRROR_SLAB_MESHES,HORIZON_MIRROR_FIGURES} from './horizon-mirror-frame.js';
import {horizonMirrorCaptureEye,horizonMirrorWindow} from '../data/horizon-mirror.js';

const FAR=320,CHURCH_PACK='assets/st-brendans-treatment.glb',FIGURE_PACK='assets/conservatory-props.glb';
const FIGURES=Object.freeze(Object.values(HORIZON_MIRROR_FIGURES).map(f=>f.mesh));
const ANT_ROWS=()=>memoryFieldGeometry().filter(row=>row.name===HORIZON_MIRROR_ANT_MESH||HORIZON_MIRROR_SLAB_MESHES.includes(row.name));

export function createHorizonMirrorRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{}}={}){
  let preparing=null,initialized=false,released=false,error=null,releaseRange=null,last=null,captured=null,captures=0;
  const rangeOwner=Symbol('horizon-mirror');
  const required=[...HORIZON_MIRROR_MESHES,HORIZON_MIRROR_ANT_MESH,...HORIZON_MIRROR_SLAB_MESHES,HORIZON_MIRROR_CHURCH_MESH,...FIGURES];
  const catalog=()=>new Set(props.propMeshCatalog?.()||[]),resident=()=>{const c=catalog();return required.every(m=>c.has(m));};
  function clearSource(){
    for(const name of['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
    for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);
    for(const name of['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);
    props.setPressureInstances?.([]);props.setSourceSurroundingsGate?.(null);props.setSourceSurroundingsPressure?.(null);
  }
  function prepare(){
    if(preparing)return preparing;
    preparing=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The base model catalog is unavailable.');
      if(released)return false;
      if(props.installAuthoredPropMeshes?.((gl,pack)=>installProceduralMeshes(gl,pack,[...horizonMirrorGeometry(),...ANT_ROWS()]))===false)throw Error('The mirror meshes have no context.');
      if(!catalog().has(HORIZON_MIRROR_CHURCH_MESH))await props.addPropPack(resolveAsset(CHURCH_PACK));
      if(released)return false;
      if(FIGURES.some(m=>!catalog().has(m)))await props.addPropPack(resolveAsset(FIGURE_PACK));
      const missing=required.filter(m=>!catalog().has(m));
      if(missing.length)throw Error('Mirror meshes missing: '+missing.join(', '));
      return true;
    })().catch(reason=>{error=String(reason?.message||reason);preparing=null;throw reason;});
    return preparing;
  }
  async function initialize(){
    if(initialized)return true;
    if(!await prepare()||released)return false;
    clearSource();releaseRange=props.setAuthoredPropRange?.(rangeOwner,FAR)||null;
    const size=512,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let k=3;k<rgba.length;k+=4)rgba[k]=ZONE.sourceSpace;
    renderer.r3dSetPlan(rgba,size,size,material);
    renderer.r3dSetSourceScene({key:'source:horizon-mirror',look:{roomMemoryActive:true,blueprint:true,chroma:.68,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
    renderer.r3dSetSourceFinish?.('bsod');
    renderer.r3dSetLookProfile?.('explore',{transitionMs:0});
    renderer.r3dSetLightingContext?.(sourceBlueprintLighting({ambientColor:[.61,.67,.72],ambientIntensity:.12,captureExposure:3.2,whitePointScale:1,screen:'stochastic'}));
    renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
    initialized=true;return true;
  }
  const frameState=camera=>({px:camera.eye[0]/CELL-.5,py:camera.eye[2]/CELL-.5,floorH:camera.eye[1]-EYE,authoredCamera:camera,authoredPropRange:FAR,tileW:512,tileH:512,worldCount:0,
    worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false});
  // The world behind the glass, drawn once. Again whenever what is in it changes.
  function capture(occupant,petalsPlucked){
    const key=`${occupant}:${petalsPlucked}`;if(captured===key)return true;
    const{eye,yaw}=horizonMirrorCaptureEye(),camera={eye,yaw,pitch:0};
    renderer.r3dSetSourceTowerView?.(null);
    renderer.r3dSetProps(horizonMirrorWorldProps(occupant,{petalsPlucked}));renderer.r3dSetLocalLights(horizonMirrorWorldLights());
    const shot=renderer.r3dCaptureTowerView?.(frameState(camera),{yaw,pitch:0,sourceEye:eye,sourceYaw:yaw,key:'horizon-mirror:'+key,allowSource:true});
    if(!shot)return false;
    captured=key;captures+=1;
    return renderer.r3dSetSourceTowerView?.(horizonMirrorWindow())!==false;
  }
  function render(state,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    last=horizonMirrorRenderFrame(state);
    renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    const drawn=renderer.r3dFrame(frameState(last.authoredCamera))!==false;
    // The capture needs a frame's worth of scene targets to exist first.
    if(drawn&&captured!==`${state.occupant}:${state.petalsPlucked||0}`)capture(state.occupant,state.petalsPlucked||0);
    return drawn;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{prepare,initialize,render,dispose,ready:()=>initialized&&!released&&resident()&&!error,prepared:()=>!released&&!error&&resident(),
    diagnostics:()=>({ready:initialized&&!released&&!error,error,props:last?.props.length??0,captured,captures,towerView:renderer.r3dSourceTowerViewStats?.()||null})};
}
