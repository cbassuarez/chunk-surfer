// The second Source threshold borrows the normal prop/depth/acquisition renderer.
// Earth, the falling body and its folio catch all use the controller's metres.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_EARTHFALL as C,sourceEarthfallFracturePose,sourceEarthfallCellLayout,sourceEarthfallReleasePlan,sourceEarthfallControlledDrop} from '../data/source-earthfall.js';
import {sourceEarthfallFrame} from '../game/source-earthfall.js';
import {sourceContinuationMeshPayload} from './source-continuation-renderer.js';
import {sourcePrintMaps,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {SOURCE_DEMOLITION_GEOMETRY as DEMO} from '../data/generated/source-demolition-geometry.js';
import {SOURCE_DEMOLITION_MOTION as MOTION} from '../data/generated/source-demolition-motion.js';
import {sourceDemolitionPose} from './source-demolition.js';
import {ST_BRENDANS_PRESENCE_MESH,ST_BRENDANS_PRESENCE_PACK} from '../data/st-brendans-presences.js';

const PREFIX='source-earthfall-',clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const smooth=(a,b,n)=>{const p=clamp((n-a)/(b-a));return p*p*(3-2*p);};
const hash=(i,s=0)=>{let n=Math.imul(i+71,0x45d9f3b)^Math.imul(s+13,0x27d4eb2d);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const matrix=(x=0,y=0,z=0,yaw=0,sx=1,sy=sx,sz=sx)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);};
function rotation(pitch=0,roll=0){const a=Math.cos(pitch),b=Math.sin(pitch),c=Math.cos(roll),d=Math.sin(roll);return new Float32Array([c,d,0,0,-d*a,c*a,b,0,d*b,-c*b,a,0,0,0,0,1]);}
function quaternion(p,q){const[x,y,z,w]=q;return new Float32Array([1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y),0,2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x),0,2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y),0,...p,1]);}
const placed=(id,mesh,m,extra={})=>({id:PREFIX+id,mesh,matrix:m,x:m[12],y:m[13],z:m[14],zone:ZONE.sourceSpace,structural:true,noShadow:true,noReflection:true,sourceStructure:'source-earthfall',...extra});
function prism(points,depth=.8){
  const p=[...points.map(([x,y,z])=>[x,y-depth,z]),...points],i=[],n=points.length;
  for(let k=1;k<n-1;k++)i.push(0,k,k+1,n,n+k+1,n+k);
  for(let k=0;k<n;k++){const j=(k+1)%n;i.push(k,n+k,n+j,k,n+j,j);}
  return{p:p.flat(),i};
}
const box=(x0,x1,y0,y1,z0,z1)=>prism([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],y1-y0);

function earthCells(){
  return sourceEarthfallCellLayout().map(cell=>({...cell,name:PREFIX+cell.id,kind:'earth',material:'source',...prism(cell.points,cell.depth)}));
}
const CELLS=earthCells();
const CRACK_EDGES=(()=>{const edges=new Map();for(const cell of CELLS)for(let k=0;k<cell.points.length;k++){
  const a=cell.points[k],b=cell.points[(k+1)%cell.points.length],key=[a.join(','),b.join(',')].sort().join('|');if(!edges.has(key))edges.set(key,{a,b,cells:[]});edges.get(key).cells.push(cell);
}return[...edges.values()];})();
const SHARED=[
  {id:'catch',name:PREFIX+'catch',kind:'catch',material:'dark-source',...box(C.catch.minX,C.catch.maxX,-C.catch.thickness,0,C.catch.minZ,C.catch.maxZ)},
  {id:'path',name:PREFIX+'path',kind:'path',material:'source',...box(-C.passage.halfWidth,C.passage.halfWidth,-.32,0,C.passage.exitZ-3,C.passage.entryZ)},
  {id:'lamp',name:PREFIX+'lamp',kind:'lamp',material:'dark-metal',...box(-.16,.16,-.07,.07,-.09,.09)},
  {id:'crack',name:PREFIX+'crack',kind:'crack',material:'dark-metal',...box(-.5,.5,0,.005,-.5,.5)},
];
const LIBRARY=[...CELLS,...SHARED],GOODS=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const DOOR_MESHES=[GOODS.frameMesh,GOODS.leafMesh,GOODS.freeStandingHeadMesh].filter(Boolean);
const REQUIRED_BASE=['grand_piano','instrument_case'];
const REQUIRED_DEMO=[DEMO.staticMesh,...DEMO.parts.map(p=>p.mesh)];
export const SOURCE_EARTHFALL_RENDER_BUDGET=Object.freeze({earthCells:120,customTriangles:LIBRARY.reduce((n,p)=>n+p.i.length/3,0),far:240,presences:24});
export function sourceEarthfallGeometry(){return LIBRARY;}

export function installSourceEarthfallMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return false;
  const printed=maps||sourcePrintMaps(gl,'divide');
  for(const piece of LIBRARY){
    if(pack.catalog.has(piece.name))continue;
    const data=sourceContinuationMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    const source=piece.material==='source',quietBacking=piece.kind==='catch',base=piece.kind==='path'?[.52,.57,.50,1]:quietBacking?[.035,.045,.039,1]:source?[.46,.51,.45,1]:[.025,.035,.03,1];
    // The broad support is the folio's matte inked reverse. Its real material
    // uses the existing subdued acquisition ink so practical lights cannot
    // reprint the whole footprint as the same bright stock as the torn earth.
    // It remains an opaque depth-writing mesh outside the narrow paper path.
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sourceEarthfall:true,triangles:data.triangles,bounds:{min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])}},primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,base,emissive:[0,0,0],texture:source?printed.texture:null,normalTexture:source?printed.normalTexture:null,ormTexture:source?printed.ormTexture:null,letteringFinish:source?printed.letteringFinish:null,materialFactors:'gltf',metallic:quietBacking?0:source?1:.7,roughness:quietBacking?1:source?1:.7,aoStrength:0,portrait:false,alphaCut:0,materialName:`earthfall ${piece.kind}`,materialRole:quietBacking?'quiet-metal':null,printedSurface:source?SOURCE_PRINT_SURFACE:null}]});
  }
  gl.bindVertexArray(null);return LIBRARY.map(p=>p.name);
}
const boundsCenter=piece=>{const b=sourceContinuationMeshPayload(piece).bounds;return b.center;};
const CENTERS=new Map(LIBRARY.map(p=>[p.name,boundsCenter(p)]));
const MODEL_STATIONS=[
  {id:0,x:31,z:-11,scale:11,yaw:-.6,mesh:'grand_piano'},
  {id:1,x:42,z:-48,scale:9,yaw:1.8,mesh:'grand_piano'},
  {id:2,x:-48,z:-59,scale:17,yaw:.8,mesh:'instrument_case'},
  {id:3,x:25,z:-72,scale:14,yaw:-1.1,mesh:'instrument_case'},
  {id:4,x:-25,z:19,scale:10,yaw:2.2,mesh:'instrument_case'},
];
// Exact native lower contacts include the bench authored into grand_piano.
// The current rotated contact, rather than a future bounding box, carries
// each complete native assembly throughout its restrained inward lean.
const MODEL_SUPPORT={grand_piano:[
  ...[[-.62,-.7],[.58,-.55],[.42,.72]].flatMap(([x,z])=>Array.from({length:10},(_,i)=>[x+Math.cos(i*Math.PI/5)*.045,.005,z+Math.sin(i*Math.PI/5)*.045])),
  ...[-.275,.275].flatMap(x=>[-1.47,-1.23].flatMap(z=>Array.from({length:8},(_,i)=>[x+Math.cos(i*Math.PI/4)*.025,.02,z+Math.sin(i*Math.PI/4)*.025]))),
],instrument_case:[[-.6,.01,-.21],[.6,.01,-.21],[.6,.01,.21],[-.6,.01,.21]]};
function controlledModel(station,elapsed,reduced){
  const plan=sourceEarthfallReleasePlan(station.id,{x:station.x,y:C.upperFloor,z:station.z}),age=Math.max(0,elapsed-plan.releaseAt),drop=sourceEarthfallControlledDrop(elapsed,plan.releaseAt,100,plan.departureSpeed);
  const distance=Math.hypot(station.x,station.z+21)||1,dx=-station.x/distance,dz=(-21-station.z)/distance,lean=reduced?0:smooth(0,1.25,age)*(station.mesh==='grand_piano'?.13:.095);
  const m=multiply(rotation(dz*lean,-dx*lean),matrix(0,0,0,station.yaw,station.scale));
  const contact=Math.min(...MODEL_SUPPORT[station.mesh].map(p=>m[1]*p[0]+m[5]*p[1]+m[9]*p[2]));
  m[12]=station.x;m[13]=C.upperFloor-drop-contact;m[14]=station.z;
  return{matrix:m,supportY:C.upperFloor-drop,releaseAt:plan.releaseAt,band:plan.band};
}
const facadePlan=sourceEarthfallReleasePlan(0,{x:-18,y:C.upperFloor,z:-35});
const facadeDrop=elapsed=>sourceEarthfallControlledDrop(elapsed,facadePlan.releaseAt,100,facadePlan.departureSpeed);

export function sourceEarthfallRenderFrame(state,presentation={}){
  const frame=sourceEarthfallFrame(state),props=[],lights=[],reduced=presentation.reducedMotion===true||presentation.reduceMotion===true||presentation.shakeMode==='off',effectsOff=presentation.effectsMode==='off'||presentation.flashMode==='off';
  const put=(id,mesh,m,extra={})=>props.push(placed(id,mesh,m,extra));
  for(const cell of CELLS){
    const pose=sourceEarthfallFracturePose(cell.index,frame.elapsed,cell.center),b=CENTERS.get(cell.name);
    // The supporting slab's finite bearing fold is physical geometry in both
    // modes. Removing its attitude while retaining hinge-derived translation
    // produces a detached sheet and covers the lower route again. Reduced
    // presentation removes secondary model lean and halves the wisps below.
    const m=multiply(matrix(pose.x,pose.y,pose.z,pose.yaw),rotation(pose.pitch,pose.roll));
    // Mesh positions are centred on their volume, while the controller's
    // fracture pivot is the supported top. Preserve that exact distinction.
    const local=matrix(b[0]-cell.center.x,b[1]-cell.center.y,b[2]-cell.center.z);
    put(cell.id,cell.name,multiply(m,local),{earthfallRole:'earth',cell:cell.index,sourceBounds:cell.points,upperSupport:frame.upperSupport});
  }
  // Hairline tears first describe the actual shared edges; support remains
  // coplanar until the controller releases it. They yield to open cracks when
  // the prisms themselves depart, rather than hovering over a fallen sheet.
  if(frame.committed&&frame.elapsed>=C.fractureAt&&frame.upperSupport){
    let index=0;
    for(const {a,b,cells}of CRACK_EDGES){
      const plans=cells.map(cell=>sourceEarthfallReleasePlan(cell.index,cell.center)),initiationAt=Math.min(...plans.map(p=>p.initiationAt)),band=Math.min(...plans.map(p=>p.band));
      if(frame.elapsed<initiationAt){index++;continue;}
      const width=.008+.065*smooth(initiationAt,initiationAt+.22,frame.elapsed);
      const dx=b[0]-a[0],dz=b[2]-a[2];
      put('tear-'+index++,PREFIX+'crack',matrix((a[0]+b[0])/2,C.upperFloor+.002,(a[2]+b[2])/2,-Math.atan2(dz,dx),Math.hypot(dx,dz),1,width),{earthfallRole:'tear',initiationAt,supportBand:band});
    }
  }
  const catchCenter=CENTERS.get(PREFIX+'catch');
  put('folio-catch',PREFIX+'catch',matrix(catchCenter[0],catchCenter[1]+frame.catchSurfaceY,catchCenter[2]),{earthfallRole:'catch',supportY:frame.catchSurfaceY,cullRadius:128});
  const pathCenter=CENTERS.get(PREFIX+'path');
  put('lower-path',PREFIX+'path',matrix(pathCenter[0],pathCenter[1]+frame.catchSurfaceY+.004,pathCenter[2]),{earthfallRole:'path',supportY:frame.catchSurfaceY,cullRadius:30});
  for(const door of [frame.entryDoor,frame.exitDoor]){
    const base=matrix(door.x,door.y,door.z,door.kind==='entry'?Math.PI:0,door.width/GOODS.opening.width,door.height/GOODS.opening.height,1);
    put(`door-${door.kind}`,GOODS.frameMesh,base,{earthfallRole:'door',doorId:door.id});
    if(GOODS.freeStandingHeadMesh)put(`door-head-${door.kind}`,GOODS.freeStandingHeadMesh,base,{earthfallRole:'door',doorId:door.id});
    for(let leaf=0;leaf<GOODS.leafCount;leaf++)put(`door-${door.kind}-leaf-${leaf}`,GOODS.leafMesh,multiply(base,doorLeafLocalMatrix(GOODS,leaf,door.progress)),{earthfallRole:'door',doorId:door.id,doorProgress:door.progress});
    put(`door-lamp-${door.kind}`,PREFIX+'lamp',matrix(door.x,door.y+door.height+.22,door.z),{earthfallRole:'lamp'});
    lights.push({id:PREFIX+'door-light-'+door.kind,x:door.x,y:door.y+door.height-.1,z:door.z+(door.kind==='entry'?-1:1),radius:12,intensity:2.3,color:door.kind==='entry'?[.84,.68,.43]:[.54,.73,.71],penetration:1});
  }
  // The actual overworld elevation stands along the passage's west edge.
  // Its original deep projection ends outside the fourteen-metre clear spine.
  const architecture=matrix(-18,C.upperFloor-facadeDrop(frame.elapsed),9,Math.PI);
  put('ellery-retained',DEMO.staticMesh,architecture,{earthfallRole:'ellery'});
  for(const part of DEMO.parts){
    const time=frame.committed?Math.min(DEMO.duration,Math.max(0,frame.elapsed)):0,pose=sourceDemolitionPose(MOTION.tracks[part.mesh],reduced?(time>=(part.releaseTime??part.startTime+.45)+1?DEMO.duration:0):time,DEMO.sampleHz);
    if(pose)put(`ellery-${part.id}`,part.mesh,multiply(architecture,quaternion(pose.translation,pose.rotation)),{earthfallRole:'ellery-fragment'});
  }
  for(const station of MODEL_STATIONS){
    const model=controlledModel(station,frame.elapsed,reduced);
    put('model-'+station.id,station.mesh,model.matrix,{earthfallRole:'model',supportY:model.supportY,releaseAt:model.releaseAt,supportBand:model.band});
  }
  if(frame.committed&&!effectsOff){
    const poses=Object.values(ST_BRENDANS_PRESENCE_MESH),count=reduced?12:24;
    for(let i=0;i<count;i++){
      const age=frame.elapsed-.8-hash(i,21)*2;if(age<0)continue;
      const x=(i%2?-1:1)*(8+hash(i,24)*13),z=-3-hash(i,25)*43,plan=sourceEarthfallReleasePlan(i,{x,y:C.upperFloor,z}),y=C.upperFloor-sourceEarthfallControlledDrop(frame.elapsed,plan.releaseAt,100,plan.departureSpeed)-.7+hash(i,27)*2.5;
      const m=multiply(matrix(x,y,z,hash(i,22)*Math.PI*2,1.8+hash(i,28)*2.8,2+hash(i,29)*3,.13+hash(i,30)*.17),rotation(hash(i,31)-.5,(hash(i,32)-.5)*1.8));
      m[4]+=(hash(i,34)-.5)*2.1;m[6]+=(hash(i,35)-.5)*1.6;
      put('residue-'+i,poses[i%poses.length],m,{earthfallRole:'residue',structural:false,apparitionVariant:14,emissive:[0,0,0,.34+hash(i,33)*.3]});
    }
  }
  lights.push({id:PREFIX+'west-work',x:-10,y:C.upperFloor-facadeDrop(frame.elapsed)+14,z:-19,radius:95,intensity:5,color:[.65,.72,.70],penetration:1});
  lights.push({id:PREFIX+'west-graze',x:-7,y:C.upperFloor-facadeDrop(frame.elapsed)+6.4,z:-44,radius:75,intensity:3.6,color:[.67,.74,.72],penetration:1});
  const eye=[frame.player.x,frame.player.feet+C.eyeHeight,frame.player.z];
  return{source:frame,phase:frame.phase,props,lights,eye,yaw:frame.player.yaw,pitch:frame.player.pitch,authoredCamera:{eye,yaw:frame.player.yaw,pitch:frame.player.pitch},counts:{props:props.length,earth:CELLS.length,presences:props.filter(p=>p.earthfallRole==='residue').length},falling:frame.falling,catchSurfaceY:frame.catchSurfaceY};
}

export function createSourceEarthfallRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},installMeshes=installSourceEarthfallMeshes,transformFrame=null}={}){
  let initialized=false,released=false,loading=null,repair=null,error=null,last=null,releaseRange=null;
  const rangeOwner=Symbol('source-earthfall');
  const required=[...LIBRARY.map(p=>p.name),...REQUIRED_BASE,...REQUIRED_DEMO,...DOOR_MESHES,...Object.values(ST_BRENDANS_PRESENCE_MESH)];
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){for(const name of ['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);for(const name of ['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);for(const name of ['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);props.setPressureInstances?.([]);}
  async function install(){
    if(released)return false;if(props.installAuthoredPropMeshes?.(installMeshes)===false)throw Error('The descending earth mesh context is unavailable.');
    for(const [meshes,url]of [[REQUIRED_DEMO,'assets/source-demolition.glb'],[Object.values(ST_BRENDANS_PRESENCE_MESH),ST_BRENDANS_PRESENCE_PACK],[DOOR_MESHES,'assets/conservatory-doors.glb']]){
      const catalog=new Set(props.propMeshCatalog?.()||[]);if(meshes.some(mesh=>!catalog.has(mesh)))await props.addPropPack(resolveAsset(url));if(released)return false;
    }
    const catalog=new Set(props.propMeshCatalog?.()||[]),missing=required.filter(mesh=>!catalog.has(mesh));if(missing.length)throw Error('Descending Source meshes missing: '+missing.join(', '));return true;
  }
  function initialize(){
    if(loading)return loading;
    loading=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The Source base model catalog is unavailable.');
      if(released||!await install())return false;
      if(typeof props.setAuthoredPropRange!=='function')throw Error('The descending Source far-range lease is unavailable.');
      clearSource();releaseRange=props.setAuthoredPropRange(rangeOwner,SOURCE_EARTHFALL_RENDER_BUDGET.far);
      const size=512,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=3;i<rgba.length;i+=4)rgba[i]=ZONE.sourceSpace;
      renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:earthfall',look:{roomMemoryActive:true,chroma:.68,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
      renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSetLightingContext?.({ambientColor:[.61,.67,.61],ambientIntensity:.095,captureExposure:3.2,whitePointScale:1,screen:'stochastic'});renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(reason=>{error=String(reason?.message||reason);releaseRange?.();releaseRange=null;throw reason;});return loading;
  }
  function render(state,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});renderer.r3dClearScreen?.();return true;}
    const physical=sourceEarthfallRenderFrame(state,presentation);
    last=typeof transformFrame==='function'?transformFrame(state,presentation,physical):physical;
    renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredCamera:last.authoredCamera,authoredPropRange:SOURCE_EARTHFALL_RENDER_BUDGET.far,tileW:512,tileH:512,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{initialize,render,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,error,restoringScenery:!!repair,budget:SOURCE_EARTHFALL_RENDER_BUDGET,frame:last?{phase:last.phase,eye:last.eye,counts:last.counts,catchSurfaceY:last.catchSurfaceY}:null})};
}
