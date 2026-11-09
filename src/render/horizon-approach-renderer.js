// Horizon's renderer. The ground is procedural, everything on it is the game's own,
// and the space is curved for as long as this scene is on screen and no longer.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {sourceBlueprintLighting,sourceBlueprintMaps} from './source-blueprint-print.js';
import {installProceduralMeshes} from './procedural-mesh-install.js';
import {memoryFieldGeometry} from './memory-field-models.js';
import {finishSourceContinuationArchitecture,SOURCE_CONTINUATION_ARCHITECTURE} from './source-continuation-renderer.js';
import {horizonApproachGeometry,HORIZON_APPROACH_MESHES} from './horizon-approach-models.js';
import {horizonDebrisMeshes} from '../data/horizon-approach.js';
import {OPENING_CAB_ASSET} from '../data/opening-cab-objects.js';
import {STOP_LISTENING_ASSET} from '../data/stop-listening.js';
import {horizonApproachRenderFrame,HORIZON_CHURCH_MESH,HORIZON_ANT_MESH,HORIZON_SLAB_MESHES,HORIZON_DAISY_MESHES,HORIZON_FIGURES,HORIZON_MASONRY} from './horizon-approach-frame.js';

const FAR=320;
const FIGURES=Object.freeze(Object.values(HORIZON_FIGURES).map(f=>f.mesh)),MASONRY=Object.freeze(Object.values(HORIZON_MASONRY));
const OWN=new Set(HORIZON_APPROACH_MESHES),DEBRIS=Object.freeze(horizonDebrisMeshes().filter(m=>!OWN.has(m)));
const FIELD_NAMES=new Set(memoryFieldGeometry().map(row=>row.name));
const FIELD=Object.freeze([...new Set([HORIZON_ANT_MESH,...HORIZON_SLAB_MESHES,...HORIZON_DAISY_MESHES,...DEBRIS.filter(m=>FIELD_NAMES.has(m))])]);
const FIELD_ROWS=()=>memoryFieldGeometry().filter(row=>FIELD.includes(row.name));
// Where everything comes from, in the order it is looked for. Packs already resident
// from the rest of the night are not fetched again.
const PACKS=Object.freeze(['assets/st-brendans-treatment.glb','assets/conservatory-props.glb',SOURCE_CONTINUATION_ARCHITECTURE.asset,OPENING_CAB_ASSET,'assets/source-vehicle-interior.glb','assets/street-pilot.glb',STOP_LISTENING_ASSET]);

export function createHorizonApproachRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{}}={}){
  let preparing=null,initialized=false,released=false,error=null,releaseRange=null,last=null,finish='bsod';
  let prepareMs=null;const packTimings=[],clock=()=>globalThis.performance?.now?.()??Date.now();
  const rangeOwner=Symbol('horizon-approach');
  const required=[...new Set([...HORIZON_APPROACH_MESHES,...FIELD,HORIZON_CHURCH_MESH,...FIGURES,...MASONRY,...DEBRIS])];
  const catalog=()=>new Set(props.propMeshCatalog?.()||[]),resident=()=>{const c=catalog();return required.every(m=>c.has(m));};
  function clearSource(){
    for(const name of['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
    for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);
    for(const name of['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);
    props.setPressureInstances?.([]);props.setSourceSurroundingsGate?.(null);props.setSourceSurroundingsPressure?.(null);
  }
  function prepare(){
    if(preparing)return preparing;
    const began=clock();
    preparing=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The base model catalog is unavailable.');
      if(released)return false;
      if(props.installAuthoredPropMeshes?.((gl,pack)=>installProceduralMeshes(gl,pack,[...horizonApproachGeometry(),...FIELD_ROWS()]))===false)throw Error('The approach meshes have no context.');
      for(const pack of PACKS){
        if(required.every(m=>catalog().has(m)))break;
        const at=clock();await props.addPropPack(resolveAsset(pack));packTimings.push({pack,ms:clock()-at});
        if(released)return false;
      }
      props.installAuthoredPropMeshes?.((gl,pack)=>finishSourceContinuationArchitecture(gl,pack,{maps:sourceBlueprintMaps(gl)}));
      const missing=required.filter(m=>!catalog().has(m));
      if(missing.length)throw Error('Approach meshes missing: '+missing.join(', '));
      return true;
    })().catch(reason=>{error=String(reason?.message||reason);preparing=null;throw reason;}).finally(()=>{prepareMs=clock()-began;});
    return preparing;
  }
  async function initialize(){
    if(initialized)return true;
    if(!await prepare()||released)return false;
    clearSource();releaseRange=props.setAuthoredPropRange?.(rangeOwner,FAR)||null;
    const size=512,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let k=3;k<rgba.length;k+=4)rgba[k]=ZONE.sourceSpace;
    renderer.r3dSetPlan(rgba,size,size,material);
    renderer.r3dSetSourceScene({key:'source:horizon-approach',look:{roomMemoryActive:true,blueprint:true,chroma:.68,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
    renderer.r3dSetSourceFinish?.(finish);
    renderer.r3dSetLookProfile?.('explore',{transitionMs:0});
    renderer.r3dSetLightingContext?.(sourceBlueprintLighting({ambientColor:[.61,.67,.72],ambientIntensity:.12,captureExposure:3.2,whitePointScale:1,screen:'stochastic'}));
    renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
    initialized=true;return true;
  }
  const frameState=camera=>({px:camera.eye[0]/CELL-.5,py:camera.eye[2]/CELL-.5,floorH:camera.eye[1]-EYE,authoredCamera:camera,authoredPropRange:FAR,tileW:512,tileH:512,worldCount:0,
    worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false});
  function render(state,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    last=horizonApproachRenderFrame(state,presentation);
    props.setCurvedSpaceFrame?.(last.space);
    renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    return renderer.r3dFrame(frameState(last.authoredCamera))!==false;
  }
  function setFinish(next){finish=next;if(initialized)renderer.r3dSetSourceFinish?.(finish);return finish;}
  function dispose(){if(released)return false;released=true;initialized=false;props.setCurvedSpaceFrame?.(null);clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{prepare,initialize,render,dispose,setFinish,ready:()=>initialized&&!released&&resident()&&!error,prepared:()=>!released&&!error&&resident(),
    diagnostics:()=>({ready:initialized&&!released&&!error,error,props:last?.props.length??0,finish,prepareMs,packTimings:packTimings.map(row=>({...row}))})};
}
