import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_IV as C,SOURCE_IV_GEOMETRY,SOURCE_IV_MODELS,sourceIVModelMatrix} from '../data/source-iv.js';
import {sourceIVFrame} from '../game/source-iv.js';
import {sourceContinuationMeshPayload} from './source-continuation-renderer.js';
import {sourcePrintMaps,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';

const PREFIX='source-IV-',GOODS=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const matrix=(x=0,y=0,z=0,yaw=0,sx=1,sy=sx,sz=sx)=>{
  const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);
};
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const LIBRARY=SOURCE_IV_GEOMETRY.map(piece=>({...piece,name:PREFIX+piece.id}));
const PAYLOADS=new Map(LIBRARY.map(piece=>[piece.name,sourceContinuationMeshPayload(piece)]));
const placed=(id,mesh,m,extra={})=>({id:PREFIX+id,mesh,matrix:m,x:m[12],y:m[13],z:m[14],zone:ZONE.sourceSpace,
  structural:true,noReflection:true,sourceStructure:'source-IV',...extra});
const DOOR_MESHES=[GOODS.frameMesh,GOODS.leafMesh,GOODS.freeStandingHeadMesh].filter(Boolean);
const DEMO_MESHES=[...new Set(SOURCE_IV_MODELS.filter(p=>p.mesh.startsWith('source_demolition')).map(p=>p.mesh))];
export const SOURCE_IV_RENDER_BUDGET=Object.freeze({far:200,customMeshes:LIBRARY.length,
  customTriangles:LIBRARY.reduce((n,p)=>n+p.i.length/3,0),models:SOURCE_IV_MODELS.length,lights:6});

export function installSourceIVMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return false;
  const printed=maps||sourcePrintMaps(gl,'divide');
  for(const piece of LIBRARY){
    if(pack.catalog.has(piece.name))continue;
    const data=PAYLOADS.get(piece.name),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
    gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,
      extras:{sourceIV:true,triangles:data.triangles,bounds:{min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])}},
      primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,base:[.42,.49,.43,1],emissive:[0,0,0],
        texture:printed.texture,normalTexture:printed.normalTexture,ormTexture:printed.ormTexture,
        letteringFinish:printed.letteringFinish,materialFactors:'gltf',metallic:1,roughness:1,aoStrength:0,
        portrait:false,alphaCut:0,materialName:'Source IV printed structure',printedSurface:SOURCE_PRINT_SURFACE}]});
  }
  gl.bindVertexArray(null);return LIBRARY.map(piece=>piece.name);
}
export function sourceIVRenderFrame(state,presentation={}){
  const frame=sourceIVFrame(state),props=[];
  for(const piece of LIBRARY){const center=PAYLOADS.get(piece.name).bounds.center;
    props.push(placed(piece.id,piece.name,matrix(...center),{sourceIVRole:piece.id.startsWith('ground')?'ground':'threshold',supportY:piece.maxY}));}
  for(const model of SOURCE_IV_MODELS)props.push(placed(model.id,model.mesh,sourceIVModelMatrix(model),{
    sourceIVRole:model.id==='high-world'?'lost-world':'model',contactId:model.id}));
  for(const [kind,door]of [['entry',frame.entryDoor],['exit',frame.exitDoor]]){
    const base=matrix(door.x,0,door.z,kind==='entry'?Math.PI:0,door.width/GOODS.opening.width,door.height/GOODS.opening.height,1);
    props.push(placed(kind+'-frame',GOODS.frameMesh,base,{sourceIVRole:'grey-door',doorId:door.id}));
    if(GOODS.freeStandingHeadMesh)props.push(placed(kind+'-head',GOODS.freeStandingHeadMesh,base,{sourceIVRole:'grey-door',doorId:door.id}));
    for(let leaf=0;leaf<GOODS.leafCount;leaf++)props.push(placed(`${kind}-leaf-${leaf}`,GOODS.leafMesh,
      multiply(base,doorLeafLocalMatrix(GOODS,leaf,door.progress)),{sourceIVRole:'grey-door',doorId:door.id,doorProgress:door.progress}));
  }
  // Side and upper light reveal the remembered objects' large planes. Lights
  // buried under/inside their scaled bodies only drew thin specular edges.
  const lights=[
    {id:PREFIX+'entry',x:0,y:3.8,z:-2,radius:17,intensity:2.2,color:[.78,.67,.45],penetration:1},
    {id:PREFIX+'exit',x:0,y:3.8,z:-102,radius:19,intensity:2.5,color:[.58,.75,.70],penetration:1},
    {id:PREFIX+'piano-east',x:1,y:15,z:-19,radius:55,intensity:14,color:[.58,.70,.64],penetration:.6},
    {id:PREFIX+'case-west',x:-6,y:6,z:-13,radius:35,intensity:5.4,color:[.76,.65,.46],penetration:.6},
    {id:PREFIX+'piano-west',x:-5,y:12,z:-61,radius:42,intensity:10,color:[.57,.66,.70],penetration:.6},
    {id:PREFIX+'upper-remains',x:-18,y:25,z:-2,radius:55,intensity:7.2,color:[.60,.65,.63],penetration:1},
  ];
  const eye=[frame.player.x,C.eyeHeight,frame.player.z];
  return{phase:'Source IV',source:frame,props,lights,eye,yaw:frame.player.yaw,pitch:frame.player.pitch,
    authoredCamera:{eye,yaw:frame.player.yaw,pitch:frame.player.pitch},
    counts:{props:props.length,models:SOURCE_IV_MODELS.length,lights:lights.length},presentation};
}

export function createSourceIVRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},installMeshes=installSourceIVMeshes}={}){
  let initialized=false,released=false,loading=null,repair=null,error=null,last=null,releaseRange=null;
  const rangeOwner=Symbol('Source IV'),required=[...LIBRARY.map(p=>p.name),...SOURCE_IV_MODELS.map(p=>p.mesh),...DOOR_MESHES];
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){
    for(const name of ['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
    for(const name of ['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);
    for(const name of ['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);
    props.setPressureInstances?.([]);
  }
  async function install(){
    if(released)return false;
    if(props.installAuthoredPropMeshes?.(installMeshes)===false)throw Error('Source IV mesh context unavailable.');
    for(const[meshes,url]of [[DEMO_MESHES,'assets/source-demolition.glb'],[DOOR_MESHES,'assets/conservatory-doors.glb']]){
      const catalog=new Set(props.propMeshCatalog?.()||[]);if(meshes.some(mesh=>!catalog.has(mesh)))await props.addPropPack(resolveAsset(url));
      if(released)return false;
    }
    const catalog=new Set(props.propMeshCatalog?.()||[]),missing=required.filter(mesh=>!catalog.has(mesh));
    if(missing.length)throw Error('Source IV meshes missing: '+missing.join(', '));return true;
  }
  function initialize(){
    if(loading)return loading;
    loading=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The original model catalog is unavailable.');
      if(released||!await install())return false;
      if(typeof props.setAuthoredPropRange!=='function')throw Error('Source IV range lease unavailable.');
      clearSource();releaseRange=props.setAuthoredPropRange(rangeOwner,SOURCE_IV_RENDER_BUDGET.far);
      const size=512,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);
      for(let i=3;i<rgba.length;i+=4)rgba[i]=ZONE.sourceSpace;
      renderer.r3dSetPlan(rgba,size,size,material);
      renderer.r3dSetSourceScene({key:'source:IV',look:{roomMemoryActive:true,chroma:.65,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
      renderer.r3dSetLookProfile?.('explore',{transitionMs:0});
      renderer.r3dSetLightingContext?.({ambientColor:[.57,.65,.60],ambientIntensity:.11,captureExposure:3.3,whitePointScale:1,screen:'stochastic'});
      renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(reason=>{error=String(reason?.message||reason);releaseRange?.();releaseRange=null;throw reason;});return loading;
  }
  function render(state,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});renderer.r3dClearScreen?.();return true;}
    last=sourceIVRenderFrame(state,presentation);renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredCamera:last.authoredCamera,
      authoredPropRange:SOURCE_IV_RENDER_BUDGET.far,tileW:512,tileH:512,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),
      chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{initialize,render,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>{if(!released)renderer.r3dClearScreen?.();},dispose,
    diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,error,restoringScenery:!!repair,budget:SOURCE_IV_RENDER_BUDGET,
      frame:last?{phase:last.phase,eye:last.eye,counts:last.counts}:null})};
}
