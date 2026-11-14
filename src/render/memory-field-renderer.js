// The field through the game's own look: the same print, a different sky. It borrows
// the renderer for as long as it lasts and owes the world nothing on the way out.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import * as FP from '../world/floorplan.js';
import {CELL,MATERIAL,F,EYE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {memoryFieldGeometry,memoryGeometryBounds,theBagGeometry} from './memory-field-models.js';
import {memoryFieldRenderFrame,memoryFieldSunDirection} from './memory-field-frame.js';

const FAR=320,WHEEL_PACK='assets/source-drive/predicaments/drive-predicaments.glb',WHEEL='dp_detached_wheel';
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function meshPayload(row){
  const count=row.i.length,positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);
  for(let k=0;k<count;k+=3){
    const a=row.i[k]*3,b=row.i[k+1]*3,c=row.i[k+2]*3,p=row.p;
    const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
    for(let j=0;j<3;j++){
      const q=row.i[k+j]*3,at=(k+j)*3;
      positions[at]=p[q];positions[at+1]=p[q+1];positions[at+2]=p[q+2];
      normals[at]=nx/l;normals[at+1]=ny/l;normals[at+2]=nz/l;
      uvs[(k+j)*2]=p[q];uvs[(k+j)*2+1]=p[q+2];
    }
  }
  return{positions,normals,uvs,indices:Uint32Array.from({length:count},(_,k)=>k)};
}
export function installMemoryMeshes(rows){
  return(gl,pack)=>{
    if(!gl||!pack?.catalog)return false;
    for(const row of rows){
      if(pack.catalog.has(row.name))continue;
      const d=meshPayload(row),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
      for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
      for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}
      for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
      gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
      pack.catalog.set(row.name,{name:row.name,nodeMatrix:identity(),instanceBuffer,extras:{memoryField:true,triangles:d.indices.length/3,bounds:memoryGeometryBounds(row)},primitives:[{vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:row.base,emissive:row.emissive||[0,0,0],materialFactors:'gltf',metallic:row.metallic||0,roughness:row.roughness,aoStrength:1,portrait:false,alphaCut:0,materialName:row.name,materialRole:row.materialRole,vegetationClass:row.vegetationClass,vegetationTransmission:row.vegetationTransmission,vegetationWetness:row.vegetationWetness,nativeReceiverGeometry:d}]});
    }
    gl.bindVertexArray(null);return true;
  };
}
export const installTheBag=()=>P3.installAuthoredPropMeshes?.(installMemoryMeshes(theBagGeometry()));

export function createMemoryFieldRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},transformFrame=null}={}){
  let preparing=null,initialized=false,released=false,error=null,releaseRange=null,last=null,hasWheel=false,visit=null;
  function clearSource(){
    for(const name of['r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
    for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetIndoorRain'])renderer[name]?.(0);
    for(const name of['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);
    props.setPressureInstances?.([]);props.setDriveStudyFrame?.(null);
  }
  // Safe beneath the living world: nothing here takes the camera or the plan.
  function prepare(){
    if(preparing)return preparing;
    preparing=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The base model catalog is unavailable.');
      if(released)return false;
      if(props.installAuthoredPropMeshes?.(installMemoryMeshes(memoryFieldGeometry()))===false)throw Error('The field could not be prepared.');
      // A wheel is the one thing here that came from somewhere else. It isn't worth
      // failing over: without it the field is only a field.
      const has=()=>new Set(props.propMeshCatalog?.()||[]).has(WHEEL);
      if(!has())try{await props.addPropPack(resolveAsset(WHEEL_PACK));}catch(reason){console.warn('[memory-field] No wheel:',reason);}
      hasWheel=has();
      return!released;
    })().catch(reason=>{error=String(reason?.message||reason);preparing=null;throw reason;});
    return preparing;
  }
  async function initialize(forVisit){
    visit=forVisit||visit;
    if(initialized)return true;
    if(!await prepare()||released)return false;
    clearSource();releaseRange=props.setAuthoredPropRange?.('memory-field',FAR)||null;
    const size=256,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.wetGrass);
    for(let k=0;k<size*size;k++)rgba.set([FP.encodeH(-1),FP.encodeH(6),F.SKY,0],k*4);
    renderer.r3dSetPlan(rgba,size,size,material);
    renderer.r3dSetSourceScene({key:'source:memory-field',look:{roomMemoryActive:true},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
    renderer.r3dSetLookProfile?.('explore',{transitionMs:0});
    renderer.r3dSetLightingContext?.({ambientColor:[.96,.97,1],ambientIntensity:.36,captureExposure:1.15,whitePointScale:1,screen:'stochastic'});
    renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
    initialized=true;return true;
  }
  function render(state,look={}){
    if(!initialized||released||!visit)return false;if(error)throw Error(error);
    last=memoryFieldRenderFrame(state,visit,{...look,hasWheel});
    if(transformFrame)last=transformFrame(last,{state,visit,look})||last;
    const sun=memoryFieldSunDirection(visit);
    renderer.r3dSetMemorySky?.({sun,day:visit.day,sunScale:look.sunScale??visit.sunScale,fault:look.skyFault||0,cloud:visit.cloud,edge:look.edge??1});
    // The closing field closes on the sun, wherever that is on the screen.
    let centre=[.5,.5];
    const neural=look.neural||null;
    if(look.narrowing>0||neural?.waveRadius>0){
      const at=renderer.r3dProjectWorld?.({x:last.eye[0]+sun[0]*200,y:last.eye[1]+sun[1]*200,z:last.eye[2]+sun[2]*200});
      if(at&&at.depth>0)centre=[Math.max(-.6,Math.min(1.6,at.x)),Math.max(-.6,Math.min(1.6,1-at.y))];
      else centre=[.5,-1.4];
    }
    renderer.r3dSetPerception?.({chroma:look.chroma??1,contrast:look.contrast??1,narrowing:look.narrowing||0,lift:look.lift||0,lids:look.lids||0,centre,
      ...(neural?{leak:neural.leak,white:neural.white,time:neural.time,seed:look.seed||0,origin:centre,waveRadius:neural.waveRadius,waveBand:neural.waveBand,lens:neural.lens,after:neural.after,shimmer:neural.shimmer}:{})});
    renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights([]);
    const{eye}=last;
    return renderer.r3dFrame({px:eye[0]/CELL-.5,py:eye[2]/CELL-.5,floorH:eye[1]-EYE,authoredCamera:last.authoredCamera,authoredPropRange:FAR,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',rainAmount:0})!==false;
  }
  function dispose(){if(released)return false;released=true;const owned=initialized;initialized=false;renderer.r3dSetMemorySky?.(null);if(owned)clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{prepare,initialize,render,dispose,ready:()=>initialized&&!released&&!error,diagnostics:()=>({ready:initialized&&!released&&!error,error,props:last?.props.length??0,hasWheel}),review:()=>({props:last?.props||[],project:point=>renderer.r3dProjectWorld?.(point)})};
}
