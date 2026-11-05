import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {sourceBlueprintLighting} from './source-blueprint-print.js';
import {THRESHOLD_GAG_MESHES} from '../data/threshold-gag.js';
import {sixNothingnessRenderFrame} from './six-nothingness-frame.js';
import {sixNothingnessGeometry,sixGeometryBounds} from './six-nothingness-models.js';
import {meshForApparitionPose} from '../game/emergency-light-runtime.js';

const GAG_PACK='assets/ellery-threshold-gag.glb',FIGURE_PACK='assets/conservatory-props.glb',FAR=320;
// The bodies a boo or a fault can bring with it. They live in the base pack.
const FIGURES=Object.freeze(['arm_out','head_turn','symmetric'].map(meshForApparitionPose));
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

function meshPayload(piece){
  const positions=[],normals=[],uvs=[];
  for(let at=0;at<piece.i.length;at+=3){
    const[a,b,c]=[0,1,2].map(k=>piece.p.slice(piece.i[at+k]*3,piece.i[at+k]*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),
      n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
    for(const point of[a,b,c]){positions.push(...point);normals.push(n[0]/length,n[1]/length,n[2]/length);uvs.push(point[0],point[2]);}
  }
  return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:Uint32Array.from({length:positions.length/3},(_,k)=>k)};
}
export function installSixNothingnessMeshes(gl,pack){
  if(!gl||!pack?.catalog)return false;
  for(const piece of sixNothingnessGeometry()){
    if(pack.catalog.has(piece.name))continue;
    const d=meshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
    gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sixNothingness:true,triangles:d.indices.length/3,bounds:sixGeometryBounds(piece)},primitives:[{vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:piece.base,emissive:piece.emissive||[0,0,0],materialFactors:'gltf',metallic:piece.metallic||0,roughness:piece.roughness,aoStrength:1,portrait:false,alphaCut:0,materialName:piece.name,materialRole:piece.materialRole,nativeReceiverGeometry:d}]});
  }
  gl.bindVertexArray(null);return true;
}

export function createSixNothingnessRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{}}={}){
  let preparing=null,initialized=false,released=false,error=null,releaseRange=null,last=null;
  const rangeOwner=Symbol('six-nothingness');
  const required=[...sixNothingnessGeometry().map(row=>row.name),...THRESHOLD_GAG_MESHES,...FIGURES],
    resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){
    for(const name of['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
    for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);
    for(const name of['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);
    props.setPressureInstances?.([]);props.setSourceSurroundingsGate?.(null);props.setSourceSurroundingsPressure?.(null);
  }
  // Safe beneath the living world: nothing here takes the camera or the plan.
  function prepare(){
    if(preparing)return preparing;
    preparing=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The base model catalog is unavailable.');
      if(released)return false;
      if(props.installAuthoredPropMeshes?.(installSixNothingnessMeshes)===false)throw Error('The nothingness mesh context is unavailable.');
      const has=name=>new Set(props.propMeshCatalog?.()||[]).has(name);
      if(THRESHOLD_GAG_MESHES.some(name=>!has(name)))await props.addPropPack(resolveAsset(GAG_PACK));
      if(released)return false;
      if(FIGURES.some(name=>!has(name)))await props.addPropPack(resolveAsset(FIGURE_PACK));
      if(released)return false;
      const catalog=new Set(props.propMeshCatalog?.()||[]),missing=required.filter(mesh=>!catalog.has(mesh));
      if(missing.length)throw Error('Nothingness meshes missing: '+missing.join(', '));
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
    renderer.r3dSetSourceScene({key:'source:six-nothingness',look:{roomMemoryActive:true,blueprint:true,chroma:.68,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
    renderer.r3dSetSourceFinish?.('bsod');
    renderer.r3dSetLookProfile?.('explore',{transitionMs:0});
    renderer.r3dSetLightingContext?.(sourceBlueprintLighting({ambientColor:[.61,.67,.72],ambientIntensity:.11,captureExposure:3.2,whitePointScale:1,screen:'stochastic'}));
    renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
    initialized=true;return true;
  }
  function render(state,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    last=sixNothingnessRenderFrame(state,presentation);
    renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredCamera:last.authoredCamera,authoredPropRange:FAR,tileW:512,tileH:512,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{prepare,initialize,render,dispose,ready:()=>initialized&&!released&&resident()&&!error,prepared:()=>!released&&!error&&resident(),diagnostics:()=>({ready:initialized&&!released&&!error,error,lit:last?.lit??null,props:last?.props.length??0})};
}
