// The second Source threshold borrows the normal prop/depth/acquisition renderer.
// Earth, the falling body and its folio catch all use the controller's metres.
import {createSourceEarthfallElleryAsideRenderer} from './source-earthfall-ellery-aside.js';
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_EARTHFALL as C,sourceEarthfallFracturePose,sourceEarthfallCellLayout,sourceEarthfallReleasePlan,sourceEarthfallControlledDrop,sourceEarthfallUpperHeight,SOURCE_EARTHFALL_STRATA,sourceEarthfallStratumPose,sourceEarthfallPoint,sourceEarthfallStructuralLayout,sourceEarthfallStructuralPose,SOURCE_EARTHFALL_CONSTRUCTION} from '../data/source-earthfall.js';
import {earthfallDitherIntensity} from './source-dither-routing.js';
import {sourceEarthfallFrame} from '../game/source-earthfall.js';
import {sourceContinuationMeshPayload,sourceContinuationRenderFrame,prewarmSourceContinuationAssets,SOURCE_CONTINUATION_ARCHITECTURE} from './source-continuation-renderer.js';
import {freshSourceContinuation} from '../game/source-continuation.js';
import {sourceContinuationEntranceOffset} from '../game/source-continuation-entry.js';
import {SOURCE_PRINT_SURFACE,sourcePrintMaps} from './physical-source-print.js';
import {sourceBlueprintMaps,sourceBlueprintMaterial,sourceBlueprintLighting} from './source-blueprint-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {SOURCE_DEMOLITION_GEOMETRY as DEMO} from '../data/generated/source-demolition-geometry.js';
import {SOURCE_DEMOLITION_MOTION as MOTION} from '../data/generated/source-demolition-motion.js';
import {sourceDemolitionPose} from './source-demolition.js';
import {ST_BRENDANS_PRESENCE_MESH,ST_BRENDANS_PRESENCE_PACK} from '../data/st-brendans-presences.js';
import {SOURCE_EARTHFALL_QUAKE,earthfallGroundMotion,earthfallBuildingSway,earthfallMotionMatrix} from '../data/source-earthfall-quake.js';
import {earthfallCollapseFrame,earthfallCollapseMeshes} from './source-earthfall-collapse.js';
import {sourceEarthfallFaultLayout} from '../data/source-earthfall-faults.js';
import {SOURCE_RIFT} from '../game/source-rift.js';
import {sourceFreedMemoryFrame} from './source-freed-memory.js';
import {sourceReceiptExecutionEvent,sourceExecutionTrailFrame} from './source-execution-trails.js';

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
  {id:'path',name:PREFIX+'path',kind:'path',material:'source',...box(-C.passage.halfWidth,C.passage.halfWidth,-.55,0,C.passage.exitZ-3,C.catch.minZ+.5)},
  {id:'bearing',name:PREFIX+'bearing',kind:'bearing',material:'source',...box(-.5,.5,-.5,.5,-.5,.5)},
  {id:'edge',name:PREFIX+'edge',kind:'edge',material:'source',...box(-.5,.5,-.07,0,-.04,.04)},
  {id:'lamp',name:PREFIX+'lamp',kind:'lamp',material:'dark-metal',...box(-.16,.16,-.07,.07,-.09,.09)},
  {id:'crack',name:PREFIX+'crack',kind:'crack',material:'dark-metal',...box(-.5,.5,0,.005,-.5,.5)},
  // A printed folio page: what the falling building's fragments become.
  {id:'folio-page',name:PREFIX+'folio-page',kind:'folio-page',material:'source',...box(-.55,.55,-.006,0,-.39,.39)},
];
function fractureStone(name,variant){
  const vertices=variant===0?[[-.5,-.3,-.4],[.5,-.3,-.35],[.1,-.3,.5],[-.1,.45,-.03]]:variant===1?[[-.65,-.12,-.24],[.5,-.12,-.4],[.32,-.12,.4],[-.25,.24,.12]]:[[-.24,-.6,-.2],[.3,-.4,-.2],[0,.5,.26],[.12,.2,-.27]];
  const center=vertices[0].map((_,k)=>vertices.reduce((n,p)=>n+p[k],0)/vertices.length),indices=[];
  for(let face of [[0,1,2],[0,3,1],[1,3,2],[2,3,0]]){
    const[a,b,c]=face.map(i=>vertices[i]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],middle=a.map((v,k)=>(v+b[k]+c[k])/3-center[k]);
    if(n.reduce((sum,v,k)=>sum+v*middle[k],0)<0)face=[face[0],face[2],face[1]];indices.push(...face);
  }
  return{id:name,name:PREFIX+name,kind:'fracture-stone',material:'fracture',p:vertices.flat(),i:indices};
}
const RUBBLE=Array.from({length:3},(_,i)=>fractureStone('rubble-'+i,i));
// These are pre-existing broken printed remnants in Source's impossible
// depth, with unequal breaches and finite return edges. No repeated rectangular
// tube and no panels that withdraw just as the body reaches their elevation.
function stratumFragment(layer,piece){
  const profiles=[[[2,7.2,2.5],[1.7,4.7,2.2]],[[1.3,3.2,1.6],[5.1,7.6,2.9]],[[4.1,5.8,1.5],[2.1,4.4,3.1]]];
  const values=profiles[layer.index][piece%2],side=piece%2===0?-1:1;
  let points=[[-4.6,0,-8.5],[values[0],0,-8.5],[values[1],0,0],[values[2],0,8.5],[-4.6,0,8.5]];
  if(side>0)points=points.map(([x,y,z])=>[-x,y,z]).reverse();
  return{id:`${layer.id}-${piece}`,name:PREFIX+`${layer.id}-${piece}`,kind:'stratum',material:'source',layer,piece,...prism(points,layer.thickness)};
}
const STRATA=SOURCE_EARTHFALL_STRATA.flatMap(layer=>Array.from({length:4},(_,piece)=>stratumFragment(layer,piece)));
const LIBRARY=[...CELLS,...SHARED,...STRATA,...RUBBLE],GOODS=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const EXECUTION_MESHES=new Set(LIBRARY.filter(piece=>piece.material==='source').map(piece=>piece.name));
// Torn address-space faults have no thickness and no moving owner. Batch the
// fixed world polygons by stage/material, retaining their individual ranges
// for geometry checks. Nothing here depends on the eye, quake or scene clock.
const FAULT_SHEETS=sourceEarthfallFaultLayout();
const FAULT_LIBRARY=[];
for(const stage of ['walk','fall'])for(const palette of ['silver','black','magenta','cyan','violet','lime']){
  const sheets=FAULT_SHEETS.filter(sheet=>sheet.stage===stage&&sheet.palette===palette);if(!sheets.length)continue;
  const p=[],i=[],sheetRanges=[];
  for(const sheet of sheets){
    const vertexStart=p.length/3,indexStart=i.length;
    p.push(...sheet.vertices.flat());i.push(...sheet.indices.map(index=>index+vertexStart));
    sheetRanges.push({id:sheet.id,vertexStart,vertexCount:sheet.vertices.length,indexStart,indexCount:sheet.indices.length});
  }
  const id=`fault-${stage}-${palette}`;
  FAULT_LIBRARY.push({id,name:PREFIX+id,kind:'chunk-fault',material:'source-error',stage,palette,p,i,sheetRanges});
}
const ALL_LIBRARY=[...LIBRARY,...FAULT_LIBRARY];
const DOOR_MESHES=[GOODS.frameMesh,GOODS.leafMesh,GOODS.freeStandingHeadMesh].filter(Boolean);
const REQUIRED_BASE=['grand_piano','instrument_case'];
const REQUIRED_DEMO=[DEMO.staticMesh,...DEMO.parts.map(p=>p.mesh)];
const REQUIRED_COLLAPSE=earthfallCollapseMeshes();
export const SOURCE_EARTHFALL_RENDER_BUDGET=Object.freeze({earthCells:120,strata:3,sectionPanels:12,sectionModels:6,customTriangles:LIBRARY.reduce((n,p)=>n+p.i.length/3,0),faultSheets:FAULT_SHEETS.length,faultBatches:FAULT_LIBRARY.length,faultTriangles:FAULT_LIBRARY.reduce((n,p)=>n+p.i.length/3,0),far:SOURCE_CONTINUATION_ARCHITECTURE.far,presences:24,fractureDebris:72});
export function sourceEarthfallGeometry(){return LIBRARY;}
export function sourceEarthfallFaultGeometry(){return FAULT_LIBRARY;}

export function installSourceEarthfallMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return false;
  const printed=maps||sourceBlueprintMaps(gl);
  // Pale torn stock keeps the actual engraved source texture. Cut planes use
  // opaque hyperchromatic ink, and absence stays black without material glow.
  let faultPrinted=null;
  const [magenta,cyan,violet,lime]=SOURCE_RIFT.ink,faultColors={silver:[.84,.88,.94],black:[.0002,.0003,.0006],magenta,cyan,violet,lime};
  const upload=(data,material)=>{
    const vao=gl.createVertexArray();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    return{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,nativeReceiverGeometry:Object.freeze({positions:data.positions,normals:data.normals,uvs:data.uvs,indices:data.indices}),...material};
  };
  const subset=(data,top)=>{
    const p=[],n=[],uv=[];
    for(let i=0;i<data.positions.length;i+=9)if((data.normals[i+1]>.99)===top){p.push(...data.positions.slice(i,i+9));n.push(...data.normals.slice(i,i+9));uv.push(...data.uvs.slice(i/3*2,i/3*2+6));}
    return{positions:new Float32Array(p),normals:new Float32Array(n),uvs:new Float32Array(uv),indices:new Uint32Array(Array.from({length:p.length/3},(_,i)=>i))};
  };
  for(const piece of ALL_LIBRARY){
    if(pack.catalog.has(piece.name))continue;
    const data=sourceContinuationMeshPayload(piece),instanceBuffer=gl.createBuffer(),source=piece.material==='source',quietBacking=piece.kind==='catch',raw=piece.material==='fracture';
    const base=piece.kind==='path'?[.52,.57,.50,1]:quietBacking?[.035,.045,.039,1]:source?[.46,.51,.45,1]:raw?[.26,.29,.25,1]:[.025,.035,.03,1];
    const surface={base,emissive:[0,0,0],texture:source?printed.texture:null,normalTexture:source?printed.normalTexture:null,ormTexture:source?printed.ormTexture:null,letteringFinish:source?printed.letteringFinish:null,materialFactors:'gltf',metallic:quietBacking||raw?0:source?1:.7,roughness:quietBacking?1:raw?.94:source?1:.7,aoStrength:0,portrait:false,alphaCut:0,materialName:`earthfall ${piece.kind}`,materialRole:quietBacking?'quiet-metal':null,printedSurface:source?SOURCE_PRINT_SURFACE:null,...(source?sourceBlueprintMaterial(printed,{base}):{})};
    // Only the worn upper finish bears the blueprint. Newly exposed soil and
    // aggregate have substantial dark fracture faces, rather than extending
    // the bright graphic across every side of a paper-thin rectangular card.
    let faultSurface;
    if(piece.kind==='chunk-fault'){
      const silver=piece.palette==='silver',black=piece.palette==='black',rgb=faultColors[piece.palette];
      if(silver)faultPrinted ||= maps||sourcePrintMaps(gl,'divide');
      faultSurface={...surface,base:[...rgb,1],emissive:black||silver?[0,0,0]:rgb.map(channel=>channel*.46),
        texture:silver?faultPrinted.texture:null,normalTexture:silver?faultPrinted.normalTexture:null,
        ormTexture:silver?faultPrinted.ormTexture:null,letteringFinish:silver?faultPrinted.letteringFinish:null,
        metallic:0,roughness:1,sourceCodeStock:silver?faultPrinted.sourceCodeStock:undefined,printedSurface:silver?SOURCE_PRINT_SURFACE:null,
        materialName:`earthfall fixed ${piece.palette} tear`,materialRole:black?'quiet-metal':'source-chunk-error'};
    }
    // The shared opaque prop pass already draws both sides and faces its
    // normals toward the eye. A single flat face needs no reverse duplicate,
    // extrusion, billboard transform or singular zero-scale instance matrix.
    const primitives=faultSurface?[upload(data,faultSurface)]:piece.kind==='earth'?[upload(subset(data,true),surface),upload(subset(data,false),{...surface,base:[.19,.23,.20,1],texture:null,normalTexture:null,ormTexture:null,letteringFinish:null,printedSurface:null,metallic:0,roughness:.98,materialName:'earthfall exposed aggregate',materialRole:'fracture-core'})]:[upload(data,surface)];
    for(const primitive of primitives){
      gl.bindVertexArray(primitive.vao);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
      for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
      for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    }
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sourceEarthfall:true,triangles:data.triangles,bounds:{min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])}},primitives});
  }
  gl.bindVertexArray(null);return ALL_LIBRARY.map(p=>p.name);
}
const boundsCenter=piece=>{const b=sourceContinuationMeshPayload(piece).bounds;return b.center;};
const CENTERS=new Map(ALL_LIBRARY.map(p=>[p.name,boundsCenter(p)]));
// These are authored rest poses, not snapshots taken on the first rendered
// frame. Seeking directly into the fall must leave the same exact code behind.
// Only printed architecture with an explicit failure time belongs here; fixed
// fault sheets, retained bearings, door hardware and incidental debris do not.
const MEMORY_REST_PROPS=(()=>{
  const rest=[];
  const keep=(id,mesh,m,releaseAt,extra)=>rest.push(placed(id,mesh,m,{
    ...extra,releaseAt,sourceMemoryRole:extra.earthfallRole,earthfallRole:'freed-memory'
  }));
  for(const cell of CELLS){
    const pose=sourceEarthfallFracturePose(cell.index,0,cell.center),b=CENTERS.get(cell.name);
    const m=multiply(matrix(pose.x,pose.y,pose.z,pose.yaw),rotation(pose.pitch,pose.roll));
    keep(cell.id,cell.name,multiply(m,matrix(b[0]-cell.center.x,b[1]-cell.center.y,b[2]-cell.center.z)),pose.releaseAt,{earthfallRole:'earth',cell:cell.index});
  }
  for(const member of sourceEarthfallStructuralLayout()){
    if(member.retained||!Number.isFinite(member.failureAt))continue;
    const pose=sourceEarthfallStructuralPose(member,0);
    const m=multiply(matrix(pose.x,pose.y,pose.z,pose.yaw),multiply(rotation(pose.pitch,pose.roll),matrix(0,0,0,0,member.size.x,member.size.y,member.size.z)));
    keep(member.id,PREFIX+'bearing',m,member.failureAt,{earthfallRole:'ground-joist',memberId:member.id,construction:member.type});
  }
  for(const piece of STRATA){
    const layer=piece.layer,pose=sourceEarthfallStratumPose(layer,piece.piece,0),b=CENTERS.get(piece.name);
    const m=multiply(matrix(pose.x,pose.y,pose.z),rotation(pose.pitch,pose.roll));
    const extra={layer:layer.index,construction:layer.construction};
    keep(piece.id,piece.name,multiply(m,matrix(...b)),layer.releaseAt,{...extra,earthfallRole:'stratum',cullRadius:16});
    const support=(suffix,local)=>keep(piece.id+suffix,PREFIX+'bearing',multiply(m,local),layer.releaseAt,{...extra,earthfallRole:'stratum-support'});
    if(layer.construction==='coffer')for(const[z,k]of[[-5.5,0],[0,1],[5.5,2]])support('-coffer-'+k,matrix(0,-layer.thickness-.32,z,0,8.8,.64,.32));
    if(layer.construction==='soundboard')for(let k=0;k<7;k++)support('-rib-'+k,matrix(-4+k*1.33,-layer.thickness-.25,0,0,.16,.5,16.4));
    if(layer.construction==='binding')for(const[z,k]of[[-6.5,0],[6.5,1]])support('-strap-'+k,matrix((piece.piece%2?1:-1)*6.6,-1.5,z,0,.12,3,.18));
  }
  return Object.freeze(rest);
})();
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
// These peripheral loads retain a continuous shallow foundation. Their banks
// no longer chase the load fourteen metres down while unsupported in a void.
function controlledModel(station,elapsed,reduced){
  const plan=sourceEarthfallReleasePlan(station.id,{x:station.x,y:C.upperFloor,z:station.z});
  const settlement=.18*smooth(1.4,3.6,elapsed),lean=(reduced?0:.012)*smooth(1.5,3.8,elapsed);
  const m=multiply(rotation(lean*(station.id%2?1:-1),lean),matrix(0,0,0,station.yaw,station.scale));
  const contact=Math.min(...MODEL_SUPPORT[station.mesh].map(p=>m[1]*p[0]+m[5]*p[1]+m[9]*p[2]));
  m[12]=station.x;m[13]=C.upperFloor-settlement-contact;m[14]=station.z;
  return{matrix:m,supportY:C.upperFloor-settlement,releaseAt:plan.releaseAt,band:plan.band};
}
const facadeDrop=()=>0;
// Only the released infill, coping and roof pieces of the borrowed elevation
// fail. Its retained piers stay on a visible eight-metre foundation. This is
// a local bond/bearing failure, not the shared demolition's hinge performance.
function earthfallFacadePose(part,elapsed){
  const rest=sourceDemolitionPose(MOTION.tracks[part.mesh],0,DEMO.sampleHz);
  if(!rest)return null;
  const delay=part.role.includes('roof')?2.65:part.role.includes('coping')?1.1:1.8;
  const releaseAt=delay+hash(part.id.length+Math.round(part.pivot[2]*13),75)*.8;
  const age=Math.max(0,elapsed-releaseAt),settle=smooth(0,1.6,age);
  const turn=(part.role.includes('roof')?.34:.16)*(part.pivot[2]%2<1?-1:1)*settle;
  const rot=rotation(turn*.32,turn),bounds=part.localBounds;
  const low=Math.min(...[bounds.min[0],bounds.max[0]].flatMap(x=>[bounds.min[1],bounds.max[1]].flatMap(y=>[bounds.min[2],bounds.max[2]].map(z=>rot[1]*x+rot[5]*y+rot[9]*z))));
  const pile=.05+.13*hash(Math.round(part.pivot[2]*100),72);
  const maxDrop=Math.max(0,rest.translation[1]+low-pile);
  const drop=Math.min(maxDrop,.5*C.gravity*age*age);
  const m=multiply(quaternion(rest.translation,rest.rotation),rot);
  m[13]-=drop;
  return{matrix:m,releaseAt,settled:drop>=maxDrop};
}

// How firmly a prop is still on the upper ground: 1 while it stands there,
// easing to 0 over 0.4 s once it breaks loose, 0 for anything below.
const EARTHFALL_GROUND_ROLES=new Set(['ground-joist','ground-bearing','rubble-shelf','upper-ruin','ellery','facade-foundation','upper-bank','model']);
const loosened=(elapsed,releaseAt)=>!Number.isFinite(releaseAt)||elapsed<releaseAt?1:clamp(1-(elapsed-releaseAt)/.4);
const cellReleaseAt=CELLS.map(cell=>sourceEarthfallReleasePlan(cell.index,cell.center).releaseAt);
function earthfallGroundAttachment(prop,elapsed){
  const role=prop.earthfallRole;
  if(role==='earth')return loosened(elapsed,cellReleaseAt[prop.cell]);
  if(role==='tear')return loosened(elapsed,cellReleaseAt[prop.attachedCell]);
  if(role==='ground-joist')return loosened(elapsed,prop.releaseAt);
  if(role==='ellery-fragment')return loosened(elapsed,prop.releaseAt);
  if(role==='door'||role==='lamp')return prop.id.includes('-entry')?1:0;
  return EARTHFALL_GROUND_ROLES.has(role)?1:0;
}
const EARTHFALL_SWAY={ellery:'ellery','ellery-fragment':'ellery',model:'instrument'};
// A shear about the base height: the top moves by (dx, dz), the base stays.
function earthfallShear(sway,baseY,height){
  const sx=sway.dx/(height*.7),sz=sway.dz/(height*.7);
  return new Float32Array([1,0,0,0, sx,1,sz,0, 0,0,1,0, -sx*baseY,0,-sz*baseY,1]);
}
// THE GROUND MOVES. A presentation layer over the exact physical frame: the
// physical frame stays the collision truth its specs prove, and this moves
// what is still on the upper ground with the recorded motion about the
// player's footing, so the plaza, the buildings and their line against the sky
// move together, buildings adding their own lagging sway. Camera and look are
// never touched. Returns the same frame with moved copies of its props.
export function sourceEarthfallShakenFrame(physical){
  const frame=physical.source,quake=earthfallGroundMotion(frame.elapsed,{committed:frame.committed,reducedMotion:physical.reducedMotion});
  const props=physical.props.map(prop=>({...prop}));
  if(!quake.still)applyEarthfallGroundMotion(props,frame,quake);
  return{...physical,props,quake};
}
function applyEarthfallGroundMotion(props,frame,quake){
  const pivot=[frame.player.x,frame.upperSupport?frame.player.feet:C.upperFloor,frame.player.z];
  const full=earthfallMotionMatrix(quake,pivot),sways={};
  for(const prop of props){
    if(prop.sourceCodeOnly)continue;
    const attach=earthfallGroundAttachment(prop,frame.elapsed);
    if(!(attach>0))continue;
    const ground=attach>=1?full:earthfallMotionMatrix({x:quake.x*attach,y:quake.y*attach,z:quake.z*attach,roll:quake.roll*attach,pitch:quake.pitch*attach},pivot);
    const kind=EARTHFALL_SWAY[prop.earthfallRole];
    let m=prop.matrix;
    if(kind){
      sways[kind]||=earthfallBuildingSway(kind,frame.elapsed,{committed:frame.committed});
      m=multiply(earthfallShear({dx:sways[kind].dx*attach,dz:sways[kind].dz*attach},C.upperFloor,SOURCE_EARTHFALL_QUAKE.buildings[kind].height),m);
    }
    m=multiply(ground,m);
    prop.matrix=m;prop.x=m[12];prop.y=m[13];prop.z=m[14];
  }
}

export function sourceEarthfallRenderFrame(state,presentation={}){
  const frame=sourceEarthfallFrame(state),props=[],lights=[],reduced=presentation.reducedMotion===true||presentation.reduceMotion===true||presentation.shakeMode==='off',effectsOff=presentation.effectsMode==='off'||presentation.flashMode==='off';
  const put=(id,mesh,m,extra={})=>props.push(placed(id,mesh,m,extra));
  for(const piece of FAULT_LIBRARY){
    const center=CENTERS.get(piece.name);
    put(piece.id,piece.name,matrix(...center),{earthfallRole:'chunk-fault',worldAnchored:true,
      faultStage:piece.stage,faultPalette:piece.palette,faultSheets:piece.sheetRanges.length});
  }
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
  // attached to their dishing top faces. They yield to open cracks when
  // the prisms themselves depart, rather than hovering over a fallen sheet.
  if(frame.committed&&frame.elapsed>=C.fractureAt&&frame.upperSupport){
    let index=0;
    for(const {a,b,cells}of CRACK_EDGES){
      const plans=cells.map(cell=>sourceEarthfallReleasePlan(cell.index,cell.center)),initiationAt=Math.min(...plans.map(p=>p.initiationAt)),band=Math.min(...plans.map(p=>p.band));
      if(frame.elapsed<initiationAt){index++;continue;}
      const width=.008+.065*smooth(initiationAt,initiationAt+.22,frame.elapsed);
      const owner=cells[0],pose=sourceEarthfallFracturePose(owner.index,frame.elapsed,owner.center),aa=sourceEarthfallPoint(pose,a,owner.center),bb=sourceEarthfallPoint(pose,b,owner.center);
      const dx=bb[0]-aa[0],dy=bb[1]-aa[1],dz=bb[2]-aa[2],horizontal=Math.hypot(dx,dz);
      const m=multiply(matrix((aa[0]+bb[0])/2,(aa[1]+bb[1])/2+.002,(aa[2]+bb[2])/2,-Math.atan2(dz,dx)),multiply(rotation(0,Math.atan2(dy,horizontal)),matrix(0,0,0,0,Math.hypot(horizontal,dy),1,width)));
      put('tear-'+index++,PREFIX+'crack',m,{earthfallRole:'tear',initiationAt,supportBand:band,attachedCell:owner.index});
    }
  }
  // Finite bonded chips leave the actual failing cells. Most of their motion
  // crosses the view obliquely, so the descent has nearby parallax instead of
  // distant geometry translating like a presentation slide.
  if(frame.committed&&!effectsOff){
    const count=reduced?24:SOURCE_EARTHFALL_RENDER_BUDGET.fractureDebris;
    for(let i=0;i<count;i++){
      const row=6+Math.floor(hash(i,41)*4),column=Math.floor(hash(i,42)*12),cell=CELLS[row*12+column],plan=sourceEarthfallReleasePlan(cell.index,cell.center);
      const releaseAt=plan.releaseAt-.28+hash(i,43)*.32,age=frame.elapsed-releaseAt;
      if(age<0)continue;
      const anchor=sourceEarthfallPoint(sourceEarthfallFracturePose(cell.index,releaseAt,cell.center),cell.points[i%4],cell.center);
      const restY=Math.abs(anchor[0])>4.3?92.7:.12,hitAge=Math.sqrt(Math.max(0,anchor[1]-restY)*2/C.gravity),travelAge=Math.min(age,hitAge);
      const x=anchor[0]+(hash(i,44)-.5)*.55*travelAge,z=anchor[2]+(hash(i,45)-.5)*.6*travelAge;
      const y=Math.max(restY,anchor[1]-.12-C.gravity*.5*age*age);
      const scale=.06+hash(i,47)*.17,turn=travelAge*(reduced?0:1.4+hash(i,48)*2.8);
      put('spall-'+i,PREFIX+'rubble-'+i%3,multiply(matrix(x,y,z,hash(i,49)*6.28+turn,scale,scale*(.6+hash(i,50)),scale),rotation(turn*.7,turn*.4)),{earthfallRole:'fracture-debris',releaseAt,attachedCell:cell.index,structural:false,cullRadius:.6});
    }
  }
  // The physical shallow load path is shared with collision/diagnostics:
  // bonded cap -> transverse member -> perimeter bearing -> retained bank.
  // Failed members fall inside their original footprint; none is hinged away
  // to keep a spectator corridor clear.
  for(const member of sourceEarthfallStructuralLayout()){
    const pose=sourceEarthfallStructuralPose(member,frame.elapsed);
    const m=multiply(matrix(pose.x,pose.y,pose.z,pose.yaw),multiply(rotation(pose.pitch,pose.roll),matrix(0,0,0,0,member.size.x,member.size.y,member.size.z)));
    put(member.id,PREFIX+'bearing',m,{earthfallRole:member.type==='rib'?'ground-joist':'ground-bearing',memberId:member.id,releaseAt:member.failureAt,construction:member.type,retained:!!member.retained});
  }
  // Finite shelves retain the perimeter's fallen material above the depth
  // which Source invents. The central broken bay remains a void rather than
  // a full new floor hidden underneath the falling body.
  for(const side of[-1,1])put('rubble-shelf-'+side,PREFIX+'bearing',matrix(side*6.65,92.12,-22,0,4.7,1.05,52),{earthfallRole:'rubble-shelf',supportY:92.645});
  const catchCenter=CENTERS.get(PREFIX+'catch');
  put('folio-catch',PREFIX+'catch',matrix(catchCenter[0],catchCenter[1]+frame.catchSurfaceY,catchCenter[2]),{earthfallRole:'catch',supportY:frame.catchSurfaceY,cullRadius:Math.hypot(C.catch.maxX-C.catch.minX,C.catch.maxZ-C.catch.minZ)/2+1});
  const pathCenter=CENTERS.get(PREFIX+'path');
  put('lower-path',PREFIX+'path',matrix(pathCenter[0],pathCenter[1]+C.lowerFloor,pathCenter[2]),{earthfallRole:'path',supportY:C.lowerFloor,cullRadius:Math.hypot(C.passage.halfWidth,(C.catch.minZ+.5-(C.passage.exitZ-3))/2)+.3});
  const head=C.catch,edgeY=C.lowerFloor+.012;
  for(const[x,z,length,yaw,id]of[
    [head.minX,(head.minZ+head.maxZ)/2,head.maxZ-head.minZ,Math.PI/2,'west'],
    [head.maxX,(head.minZ+head.maxZ)/2,head.maxZ-head.minZ,Math.PI/2,'east'],
    [0,head.maxZ,head.maxX-head.minX,0,'near'],
    [(head.minX-C.passage.halfWidth)/2,head.minZ,-C.passage.halfWidth-head.minX,0,'far-west'],
    [(head.maxX+C.passage.halfWidth)/2,head.minZ,head.maxX-C.passage.halfWidth,0,'far-east'],
  ])put('landing-edge-'+id,PREFIX+'edge',matrix(x,edgeY,z,yaw,length,1,1),{earthfallRole:'landing-edge'});
  for(const piece of STRATA){
    const pose=sourceEarthfallStratumPose(piece.layer,piece.piece,frame.elapsed),b=CENTERS.get(piece.name);
    const m=multiply(matrix(pose.x,pose.y,pose.z),rotation(pose.pitch,pose.roll)),layer=piece.layer;
    put(piece.id,piece.name,multiply(m,matrix(b[0],b[1],b[2])),{earthfallRole:'stratum',layer:layer.index,construction:layer.construction,releaseAt:layer.releaseAt,cullRadius:16});
    // These are sections of this building, not three interchangeable plates.
    // Every rib and borrowed native model follows its actual failing panel.
    if(layer.construction==='coffer')for(const[z,k]of[[-5.5,0],[0,1],[5.5,2]])
      put(piece.id+'-coffer-'+k,PREFIX+'bearing',multiply(m,matrix(0,-layer.thickness-.32,z,0,8.8,.64,.32)),{earthfallRole:'stratum-support',layer:layer.index,construction:layer.construction});
    if(layer.construction==='soundboard'){
      for(let k=0;k<7;k++)put(piece.id+'-rib-'+k,PREFIX+'bearing',multiply(m,matrix(-4+k*1.33,-layer.thickness-.25,0,0,.16,.5,16.4)),{earthfallRole:'stratum-support',layer:layer.index,construction:layer.construction});
      if(piece.piece<2)put(piece.id+'-piano','grand_piano',multiply(m,matrix(piece.piece%2?2:-2,-6.2,0,piece.piece%2?Math.PI:0,5)),{earthfallRole:'stratum-model',layer:layer.index,construction:layer.construction,cullRadius:12});
    }
    if(layer.construction==='binding'){
      const side=piece.piece%2?1:-1;
      put(piece.id+'-case','instrument_case',multiply(m,matrix(side*3,-2.8,0,Math.PI/2,7)),{earthfallRole:'stratum-model',layer:layer.index,construction:layer.construction,cullRadius:12});
      for(const[z,k]of[[-6.5,0],[6.5,1]])put(piece.id+'-strap-'+k,PREFIX+'bearing',multiply(m,matrix(side*6.6,-1.5,z,0,.12,3,.18)),{earthfallRole:'stratum-support',layer:layer.index,construction:layer.construction});
    }
  }
  // This upper threshold belongs to the ruined approach and never falls into
  // the lower door. The player can look back100m to its retained frame.
  const remnant=matrix(0,C.upperFloor,C.passage.upperExitZ,0,C.door.width/GOODS.opening.width,C.door.height/GOODS.opening.height,1);
  put('upper-exit-remnant',GOODS.frameMesh,remnant,{earthfallRole:'upper-ruin'});
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
  // The false Ellery comes down with him (source-earthfall-collapse.js): it
  // leaves with the footing, falls at his rate, and breaks up in order. Until
  // its cracked stage it is still the intact building and its released parts.
  const collapse=earthfallCollapseFrame(frame.committed?frame.elapsed-C.footingLossAt:-1,architecture,{player:frame.player});
  const falling=collapse.stage!=='standing',foundation=matrix(-31.5,C.upperFloor-4,-23,0,44.2,8,94);
  put('ellery-foundation',PREFIX+'bearing',falling?multiply(collapse.world,foundation):foundation,{earthfallRole:falling?'facade-foundation-falling':'facade-foundation',supportY:C.upperFloor,construction:'retained shallow foundation'});
  if(collapse.stage==='standing'||collapse.stage==='whole'){
    put('ellery-retained',DEMO.staticMesh,collapse.building,{earthfallRole:falling?'ellery-falling':'ellery',collapseStage:collapse.stage});
    for(const part of DEMO.parts){
      const pose=earthfallFacadePose(part,frame.committed?frame.elapsed:0);
      if(pose)put(`ellery-${part.id}`,part.mesh,multiply(collapse.building,pose.matrix),{earthfallRole:falling?'ellery-falling':'ellery-fragment',releaseAt:pose.releaseAt,settled:pose.settled});
    }
  }
  for(const piece of collapse.pieces)put('ellery-'+piece.id,piece.mesh,piece.matrix,{earthfallRole:'ellery-collapse',collapseStage:collapse.stage,collapseKind:piece.kind,structural:false,cullRadius:40});
  for(const page of collapse.pages)put('folio-'+page.id,PREFIX+'folio-page',page.matrix,{earthfallRole:'folio-page',settled:page.settled,structural:false,cullRadius:1});
  for(const station of MODEL_STATIONS){
    const model=controlledModel(station,frame.elapsed,reduced);
    const contacts=MODEL_SUPPORT[station.mesh].map(p=>[model.matrix[0]*p[0]+model.matrix[8]*p[2]+model.matrix[12],model.matrix[2]*p[0]+model.matrix[10]*p[2]+model.matrix[14]]),xs=contacts.map(p=>p[0]),zs=contacts.map(p=>p[1]),minX=Math.min(...xs)-.6,maxX=Math.max(...xs)+.6,minZ=Math.min(...zs)-.6,maxZ=Math.max(...zs)+.6;
    put('model-bank-'+station.id,PREFIX+'bearing',matrix((minX+maxX)/2,model.supportY-4,(minZ+maxZ)/2,0,maxX-minX,8,maxZ-minZ),{earthfallRole:'upper-bank',supportY:model.supportY,construction:'retained shallow foundation'});
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
  lights.push({id:PREFIX+'lower-head',x:0,y:3.8,z:-7,radius:22,intensity:2.8,color:[.55,.68,.69],penetration:1});
  lights.push({id:PREFIX+'lower-spine',x:2.2,y:3.2,z:-28,radius:19,intensity:2.1,color:[.52,.64,.65],penetration:1});
  lights.push({id:PREFIX+'west-work',x:-10,y:C.upperFloor-facadeDrop(frame.elapsed)+14,z:-19,radius:95,intensity:5,color:[.65,.72,.70],penetration:1});
  lights.push({id:PREFIX+'west-graze',x:-7,y:C.upperFloor-facadeDrop(frame.elapsed)+6.4,z:-44,radius:75,intensity:3.6,color:[.67,.74,.72],penetration:1});
  const impactAge=frame.phase==='catching'?frame.catchElapsed:frame.phase==='landed'?C.catch.settleSeconds:Infinity;
  const impactDip=Number.isFinite(impactAge)?-.24*Math.sin(Math.PI*Math.min(1,impactAge/C.catch.settleSeconds))*Math.exp(-impactAge*2):0;
  const eye=[frame.player.x,frame.player.feet+C.eyeHeight+(reduced?0:impactDip),frame.player.z];
  const bodyPitch=Number.isFinite(impactAge)&&!reduced?.09*Math.sin(impactAge*22)*Math.exp(-impactAge*7):0;
  const cameraPitch=frame.player.pitch+bodyPitch;
  const freed=sourceFreedMemoryFrame(MEMORY_REST_PROPS,props,{
    clock:frame.elapsed,eligible:rest=>Number.isFinite(rest.releaseAt),
    released:rest=>frame.committed&&frame.elapsed>=rest.releaseAt
  });
  const event=sourceReceiptExecutionEvent(frame.events,frame.clock,{scope:'earthfall'}),
    execution=sourceExecutionTrailFrame(freed.props,event,{clock:frame.clock,reducedMotion:reduced,eligible:part=>EXECUTION_MESHES.has(part.mesh)});
  return{source:frame,phase:frame.phase,props:execution.props.filter(p=>!p.sourceCodeOnly),sourceCodeInstances:execution.props.filter(p=>p.sourceCodeOnly),freedMemory:freed.diagnostics,executionTrail:execution.diagnostics,lights,eye,reducedMotion:reduced,construction:SOURCE_EARTHFALL_CONSTRUCTION,impossibleDepth:frame.player.feet<SOURCE_EARTHFALL_CONSTRUCTION.impossibleBelowY,yaw:frame.player.yaw,pitch:cameraPitch,authoredCamera:{eye,yaw:frame.player.yaw,pitch:cameraPitch},counts:{props:props.length,memories:freed.memories.length,earth:CELLS.length,faultSheets:FAULT_SHEETS.length,faultBatches:FAULT_LIBRARY.length,presences:props.filter(p=>p.earthfallRole==='residue').length},falling:frame.falling,catchSurfaceY:frame.catchSurfaceY};
}

let continuationPreview=null;
// The lower doorway is the same physical plane on both sides. Its destination
// is already present while approaching; no camera or scene owner is borrowed.
export function sourceEarthfallContinuationPreview(){
  if(continuationPreview)return continuationPreview;
  const entry={...freshSourceContinuation(),doorOpen:{'wrong-entry-return':true}};
  const world=sourceContinuationRenderFrame(entry),offset=-sourceContinuationEntranceOffset().z,translation=matrix(0,0,offset),inverseTranslation=matrix(0,0,-offset),
    translatedPlanes=planes=>planes.map(p=>[p[0],p[1],p[2],p[3]-p[2]*offset]),
    previewParts=parts=>(parts||[]).filter(p=>!p.inheritedRuins&&p.role!=='inherited-earthfall'&&p.doorId!=='wrong-entry-return'&&!p.id.includes('wrong-entry-throat')).map(p=>{
    const m=new Float32Array(p.matrix);m[14]+=offset;
    const moved={...p,id:'earthfall-preview-'+p.id,matrix:m,x:p.x,y:p.y,z:p.z+offset,continuationPreview:true};
    if(p.portalClipPlanes)moved.portalClipPlanes=translatedPlanes(p.portalClipPlanes);
    if(p.portalExcludePlanes)moved.portalExcludePlanes=p.portalExcludePlanes.map(translatedPlanes);
    // Gate and pressure origins move into the preview frame below. Conjugate
    // their presentation map so a canonical source point moves only once.
    if(p.sourceWorldMatrix)moved.sourceWorldMatrix=multiply(translation,multiply(p.sourceWorldMatrix,inverseTranslation));
    if(p.physicalBounds)moved.physicalBounds={min:p.physicalBounds.min.map((v,k)=>v+(k===2?offset:0)),max:p.physicalBounds.max.map((v,k)=>v+(k===2?offset:0))};
    return moved;
  });
  continuationPreview={props:previewParts(world.props),sourceCodeInstances:previewParts(world.sourceCodeInstances),lights:world.lights.filter(light=>!light.inheritedEarthfall).map(light=>({...light,id:'earthfall-preview-'+light.id,z:light.z+offset})),
    surroundingsGate:{...world.surroundings.gate,z:world.surroundings.gate.z+offset},
    surroundingsPressure:{...world.surroundings.pressure,gate:{...world.surroundings.gate,z:world.surroundings.gate.z+offset}}};
  return continuationPreview;
}

export function createSourceEarthfallRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},installMeshes=installSourceEarthfallMeshes,transformFrame=null,previewContinuation=false,getTorch=()=>({on:false,look:{power:0}}),asideRenderer=null,diagnostics=false}={}){
  let initialized=false,released=false,loading=null,repair=null,error=null,last=null,releaseRange=null;
  const rangeOwner=Symbol('source-earthfall');
  const aside=asideRenderer||createSourceEarthfallElleryAsideRenderer({renderer,props,resolveAsset,getTorch,diagnostics});let renderingAside=false;
  const cpuSamples=[];
  const cpuSummary=()=>{const sorted=[...cpuSamples].sort((a,b)=>a-b);return{samples:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)]??null,p95Ms:sorted[Math.floor(sorted.length*.95)]??null,scope:'CPU frame construction and WebGL submission; excludes asynchronous GPU completion'};};
  const required=[...ALL_LIBRARY.map(p=>p.name),...REQUIRED_BASE,...REQUIRED_DEMO,...REQUIRED_COLLAPSE,...DOOR_MESHES,...Object.values(ST_BRENDANS_PRESENCE_MESH)];
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){for(const name of ['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);for(const name of ['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);for(const name of ['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);props.setPressureInstances?.([]);props.setSourceSurroundingsGate?.(null);props.setSourceSurroundingsPressure?.(null);}
  async function install(){
    if(released)return false;if(props.installAuthoredPropMeshes?.(installMeshes)===false)throw Error('The descending earth mesh context is unavailable.');
    for(const [meshes,url]of [[REQUIRED_DEMO,'assets/source-demolition.glb'],[REQUIRED_COLLAPSE,'assets/source-earthfall-fracture.glb'],[Object.values(ST_BRENDANS_PRESENCE_MESH),ST_BRENDANS_PRESENCE_PACK],[DOOR_MESHES,'assets/conservatory-doors.glb']]){
      const catalog=new Set(props.propMeshCatalog?.()||[]);if(meshes.some(mesh=>!catalog.has(mesh)))await props.addPropPack(resolveAsset(url));if(released)return false;
    }
    if(previewContinuation)await prewarmSourceContinuationAssets({renderer,props,resolveAsset});
    const catalog=new Set(props.propMeshCatalog?.()||[]),missing=required.filter(mesh=>!catalog.has(mesh));if(missing.length)throw Error('Descending Source meshes missing: '+missing.join(', '));return true;
  }
  function acquireFallView(){
    const size=512,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=3;i<rgba.length;i+=4)rgba[i]=ZONE.sourceSpace;
    renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:earthfall',look:{roomMemoryActive:true,blueprint:true,chroma:.68,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
    renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSetLightingContext?.(sourceBlueprintLighting({ambientColor:[.61,.67,.61],ambientIntensity:.095,captureExposure:3.2,whitePointScale:1,screen:'stochastic'}));renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
  }
  function initialize(){
    if(loading)return loading;
    loading=(async()=>{
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('The Source base model catalog is unavailable.');
      if(released||!await install())return false;
      if(typeof props.setAuthoredPropRange!=='function')throw Error('The descending Source far-range lease is unavailable.');
      await aside.initialize();if(released)return false;
      clearSource();releaseRange=props.setAuthoredPropRange(rangeOwner,SOURCE_EARTHFALL_RENDER_BUDGET.far);
      acquireFallView();if(diagnostics)props.setPropDiagnostics?.(true);initialized=true;return true;
    })().catch(reason=>{error=String(reason?.message||reason);releaseRange?.();releaseRange=null;throw reason;});return loading;
  }
  function restoreResidency(){
    if(repair||released)return repair;
    repair=install().then(ok=>ok===false?false:aside.ensureResident?.()).catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});return repair;
  }
  function render(state,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(renderingAside){aside.release();renderingAside=false;clearSource();acquireFallView();}
    // The scene freezes its clocks through ready(); residency repair must not
    // replace the last descending view with a loading-black frame.
    if(!resident()||!aside.ready()){restoreResidency();return true;}
    const started=diagnostics?performance.now():0;
    const physical=sourceEarthfallShakenFrame(sourceEarthfallRenderFrame(state,presentation));
    if(previewContinuation){
      const preview=sourceEarthfallContinuationPreview();physical.props.push(...preview.props);physical.sourceCodeInstances.push(...preview.sourceCodeInstances);props.setSourceSurroundingsGate?.(preview.surroundingsGate);props.setSourceSurroundingsPressure?.(preview.surroundingsPressure);
      const nearest=l=>(l.x-physical.eye[0])**2+(l.y-physical.eye[1])**2+(l.z-physical.eye[2])**2;
      physical.lights.push(...preview.lights.sort((a,b)=>nearest(a)-nearest(b)).slice(0,4));
      physical.counts={...physical.counts,props:physical.props.length,memories:physical.sourceCodeInstances.length,continuationPreview:preview.props.length};
    }
    last=typeof transformFrame==='function'?transformFrame(state,presentation,physical):physical;
    renderer.r3dSetProps([...last.props,...(last.sourceCodeInstances||[])]);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    const torch=getTorch?.();
    const result=renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredCamera:last.authoredCamera,authoredPropRange:SOURCE_EARTHFALL_RENDER_BUDGET.far,tileW:512,tileH:512,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:torch?.on?1:0,torchLook:torch?.look,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false,sourceDitherIntensity:earthfallDitherIntensity(last.source,{upper:C.upperFloor,lower:C.lowerFloor})})!==false;
    if(diagnostics){cpuSamples.push(performance.now()-started);if(cpuSamples.length>600)cpuSamples.shift();}
    return result;
  }
  function dispose(){if(released)return false;released=true;initialized=false;aside.dispose();if(diagnostics)props.setPropDiagnostics?.(false);clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{initialize,render,renderAside(state,presentation={}){if(!initialized||released)return false;if(!resident()||!aside.ready()){restoreResidency();return true;}renderingAside=true;return aside.render(state,presentation);},ready:()=>initialized&&!released&&resident()&&aside.ready()&&!error,clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,error,restoringScenery:!!repair,budget:SOURCE_EARTHFALL_RENDER_BUDGET,aside:aside.diagnostics(),renderingAside,...(diagnostics?{cpuSubmission:cpuSummary(),props:props.propPackStats?.()||null}:{}),frame:last?{phase:last.phase,eye:last.eye,counts:last.counts,catchSurfaceY:last.catchSurfaceY,construction:SOURCE_EARTHFALL_CONSTRUCTION}:null})};
}
