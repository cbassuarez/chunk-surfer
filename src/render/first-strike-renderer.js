import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,ZONE} from '../data/floorplan/legend.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {FIRST_STRIKE as C,FIRST_STRIKE_MESHES,normalizeFirstStrikeEntry,firstStrikePieces,firstStrikePiecePose,firstStrikeFooting,firstStrikeCellAt} from '../data/first-strike.js';
import {firstStrikeFrame} from '../game/first-strike-scene.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0)),smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const matrix=(x,y,z,sx=1,sy=1,sz=1,yaw=0,roll=0)=>{const c=Math.cos(yaw),s=Math.sin(yaw),r=Math.cos(roll),t=Math.sin(roll);return new Float32Array([c*r*sx,t*sx,s*r*sx,0,-c*t*sy,r*sy,-s*t*sy,0,-s*sz,0,c*sz,0,x,y,z,1]);};
const placed=(id,mesh,x,y,z,sx,sy,sz,extra={})=>({id:'first-strike:'+id,mesh,x,y,z,matrix:matrix(x,y,z,sx,sy,sz),structural:true,zone:ZONE.sourceSpace,...extra});
const renderFloor=c=>Number.isFinite(c?.renderFloor)?c.renderFloor:c.floor,renderCeil=c=>Number.isFinite(c?.renderCeil)?c.renderCeil:c.ceil;
const FIRST_STRIKE_RENDER_MESHES=Object.freeze([...FIRST_STRIKE_MESHES,'first_strike_sediment','first_strike_dust_trail']);
const hostMotionBounds=new WeakMap();
function fixedHostAngleBound(entry,id,bounds){
 let cache=hostMotionBounds.get(entry);if(!cache){cache=new Map();hostMotionBounds.set(entry,cache);}if(cache.has(id))return cache.get(id);
 const width=Math.max(.1,bounds.max[0]-bounds.min[0]),height=Math.max(.1,bounds.max[1]-bounds.min[1]),depth=Math.max(.1,bounds.max[2]-bounds.min[2]);let clearance=Infinity;
 for(const cell of entry.walkCells){if(!cell.walkable)continue;const dx=Math.max(bounds.min[0]-cell.x,0,cell.x-bounds.max[0]),dz=Math.max(bounds.min[2]-cell.z,0,cell.z-bounds.max[2]);clearance=Math.min(clearance,Math.hypot(dx,dz)-cell.size*Math.SQRT1_2-C.bodyRadius-.45);}
 // Every vertex lies within this radius of the foundation pivot. Its chord
 // movement is <=radius*angle. Reserving the *entire* existing walkable region
 // yields one fixed safe envelope; architecture never unleans when approached.
 const radius=Math.hypot(width,height,depth/2),bound=Math.max(0,Number.isFinite(clearance)?clearance:0)/Math.max(1,radius);cache.set(id,bound);return bound;
}
function boxGeometry(x0=-.5,x1=.5,y0=-.5,y1=.5,z0=-.5,z1=.5){const p=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],i=[];for(const[a,b,c,d]of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])i.push(a,c,b,a,d,c);return{p:p.flat(),i};}
function joinGeometry(parts){const p=[],i=[];for(const part of parts){const at=p.length/3;p.push(...part.p);i.push(...part.i.map(v=>v+at));}return{p,i};}
const poolRadius=n=>.44+.04*Math.sin(n*2.3);
function poolGeometry(){
 const count=13,p=[0,.08,0],i=[];
 // Two shallow rings give liquid a real meniscus and tiny held surface slopes.
 // With the authored .018m Y scale the highest point is under 7mm above the
 // existing floor. The surface never emits light or substitutes a water mask.
 for(let ring=0;ring<2;ring++)for(let n=0;n<count;n++){const a=n/count*Math.PI*2,r=poolRadius(n)*(ring?.99:.80),y=ring?.025:.28+.09*Math.sin(n*1.7);p.push(Math.cos(a)*r,y,Math.sin(a)*r);}
 for(let n=0;n<count;n++){const next=(n+1)%count,a=n+1,b=next+1,c=count+n+1,d=count+next+1;i.push(0,b,a,a,b,d,a,d,c);}
 return{p,i};
}
function sedimentGeometry(){
 const count=13,p=[],i=[];
 // Incomplete silt/deposit arcs make a causal, broken dry edge, rather than a
 // uniform white outline. Its rough ordinary material remains light-dependent.
 for(const n of[0,1,4,7,8,11]){const at=p.length/3;for(const[step,outer]of[[n,0],[n+1,0],[n+1,1],[n,1]]){const k=step%count,a=k/count*Math.PI*2,r=poolRadius(k)*(outer?1.055:1.0);p.push(Math.cos(a)*r,outer?-.08:.035,Math.sin(a)*r);}i.push(at,at+2,at+1,at,at+3,at+2);}
 return{p,i};
}
function dustGeometry(){return{p:[0,.5,0,-.42,0,-.3,.42,0,-.3,0,0,.45,0,-.5,0],i:[0,1,2,0,2,3,0,3,1,4,2,1,4,3,2,4,1,3]};}
function settledDustGeometry(){
 const p=[],i=[];
 // Floor deposits are broken, flat islands, not flattened airborne particles.
 // The gaps expose the original floor; every face has the same +Y normal.
 for(const[cx,cz,rx,rz,count,phase]of[[-.26,-.12,.19,.16,8,.2],[.16,.05,.24,.14,9,1.1],[.05,.30,.14,.06,7,2.4]]){
  const centre=p.length/3;p.push(cx,0,cz);
  for(let n=0;n<count;n++){const a=n/count*Math.PI*2,r=.88+.10*Math.sin(n*2.3+phase);p.push(cx+Math.cos(a)*rx*r,0,cz+Math.sin(a)*rz*r);}
  for(let n=0;n<count;n++)i.push(centre,centre+(n+1)%count+1,centre+n+1);
 }
 return{p,i};
}
const GEOMETRY=[
 {name:FIRST_STRIKE_MESHES[0],...boxGeometry(),base:[.44,.43,.37,1],roughness:.96},
 {name:FIRST_STRIKE_MESHES[1],...boxGeometry(),base:[.19,.205,.18,1],roughness:1},
 {name:FIRST_STRIKE_MESHES[2],...joinGeometry([boxGeometry(-.5,.5,-.5,-.36,-.5,.5),boxGeometry(-.5,.5,.36,.5,-.5,.5),boxGeometry(-.07,.07,-.36,.36,-.5,.5)]),base:[.115,.14,.125,1],roughness:.77,metallic:.45},
 {name:FIRST_STRIKE_MESHES[3],...boxGeometry(-.5,.5,-.025,.025,-.5,.5),base:[.24,.30,.27,1],roughness:.24,metallic:.18},
 {name:FIRST_STRIKE_MESHES[4],...dustGeometry(),base:[.27,.28,.245,1],roughness:1},
 {name:FIRST_STRIKE_MESHES[5],...poolGeometry(),smoothNormals:true,base:[.10,.145,.13,1],roughness:.065,metallic:0},
 {name:FIRST_STRIKE_MESHES[6],...dustGeometry(),base:[.24,.30,.27,1],roughness:.18,metallic:.10},
 {name:FIRST_STRIKE_MESHES[7],...boxGeometry(),base:[.12,.34,.19,1],emissive:[.08,.24,.09],roughness:.27,metallic:.10},
 {name:'first_strike_sediment',...sedimentGeometry(),base:[.24,.25,.205,1],roughness:.96,metallic:0},
 {name:'first_strike_dust_trail',...settledDustGeometry(),base:[.19,.20,.17,1],roughness:1,metallic:0},
];
export function firstStrikeGeometry(){return GEOMETRY;}
export function firstStrikeMeshPayload(piece){
 const positions=[],normals=[],uvs=[],faces=[],shared=piece.smoothNormals?new Float64Array(piece.p.length):null;
 for(let at=0;at<piece.i.length;at+=3){
  const ids=piece.i.slice(at,at+3),points=ids.map(i=>piece.p.slice(i*3,i*3+3)),[a,b,c]=points,u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  // Unnormalized crosses weight every incident face by its actual area. Only
  // liquid opts in: structural faces, grit and broken sediment remain flat.
  if(shared)for(const id of ids)for(let k=0;k<3;k++)shared[id*3+k]+=n[k];
  faces.push({ids,points,n});
 }
 for(const{ids,points,n}of faces)for(let vertex=0;vertex<3;vertex++){
  const point=points[vertex],normal=shared?Array.from(shared.slice(ids[vertex]*3,ids[vertex]*3+3)):n,length=Math.hypot(...normal)||1;
  positions.push(...point);normals.push(...normal.map(v=>v/length));uvs.push(point[0],point[2]);
 }
 return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:Uint32Array.from({length:positions.length/3},(_,i)=>i)};
}
export function installFirstStrikeMeshes(gl,pack){
 if(!gl||!pack?.catalog)return false;
 for(const piece of GEOMETRY){if(pack.catalog.has(piece.name))continue;const d=firstStrikeMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
  for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
  for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
  pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{firstStrike:true,triangles:d.indices.length/3,bounds:{min:[-.5,-.5,-.5],max:[.5,.5,.5]}},primitives:[{vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:piece.base,emissive:piece.emissive||[0,0,0],materialFactors:'gltf',metallic:piece.metallic||0,roughness:piece.roughness,aoStrength:1,portrait:false,alphaCut:0,materialName:piece.name,nativeReceiverGeometry:d}]});
 }gl.bindVertexArray(null);return FIRST_STRIKE_RENDER_MESHES;
}
export async function prewarmFirstStrikeMeshes({renderer=R3,props=P3}={}){if(await renderer.r3dBasePropsReady?.()===false)return false;if(props.installAuthoredPropMeshes?.(installFirstStrikeMeshes)===false)return false;const names=new Set(props.propMeshCatalog?.()||[]);return FIRST_STRIKE_RENDER_MESHES.every(n=>names.has(n));}

// Shared predeadline causes. Steady moisture/pools can remain during protected
// transport; only new moving droplets and dust stop. A sky cell never leaks.
export function firstStrikeWarningFrame(entryValue,progress=0,time=0,{protected:protectedFrame=false,reducedMotion=false}={}){
 const entry=normalizeFirstStrikeEntry(entryValue),level=clamp(progress),props=[],pieces=firstStrikePieces(entry),anchors=pieces.filter(p=>p.cells.length).slice(0,8),late=smooth((level-.72)/.28);
 for(const[pieceIndex,p]of anchors.entries()){
  const cell=p.cells[0],x=cell.x-cell.size*.35,z=cell.z+cell.size*.32,wet=smooth((level-.16)/.50),floor=renderFloor(cell)+.004,ceil=renderCeil(cell);
  if(wet>0){props.push(placed('warning-wet-joint-'+pieceIndex,FIRST_STRIKE_MESHES[1],x,ceil-.008,z,.025,.009,cell.size*.80*wet));}
  if(level>.35){const sx=.30+wet*.60,sz=.22+wet*.42;props.push(placed('warning-pool-'+pieceIndex,FIRST_STRIKE_MESHES[5],x,floor,z,sx,.018,sz,{noShadow:true,cullRadius:1}));props.push(placed('warning-pool-sediment-'+pieceIndex,'first_strike_sediment',x,floor,z,sx,.018,sz,{noShadow:true,cullRadius:1}));}
  const dust=smooth((level-.48)/.52);if(dust>0)props.push(placed('warning-dust-trail-'+pieceIndex,'first_strike_dust_trail',cell.x,renderFloor(cell)+.009,cell.z,.16+dust*.45,.012,.10+dust*.22,{noShadow:true,cullRadius:1}));
  if(!protectedFrame&&!reducedMotion&&late>0){const age=((Math.max(0,time)*(.55+pieceIndex*.015)+pieceIndex*.19)%1),drop=(ceil-renderFloor(cell)-.07)*age*age;props.push(placed('warning-drip-'+pieceIndex,FIRST_STRIKE_MESHES[6],x,ceil-.02-drop,z,.014,.055,.014,{noShadow:true,cullRadius:.2}));}
 }
 if(!anchors.length){const nativeEdges=pieces.filter(p=>p.structuralHost&&entry.hostBounds?.[p.hostId]).map(p=>{const b=entry.hostBounds[p.hostId];return{x:Math.max(b.min[0],Math.min(b.max[0],entry.origin.x)),z:Math.max(b.min[2],Math.min(b.max[2],entry.origin.z)),floor:b.min[1]};}),edges=nativeEdges.length?nativeEdges:entry.warningEdges||[];for(const[index,edge]of edges.slice(0,6).entries())if([edge.x,edge.z,edge.floor].every(Number.isFinite)&&level>.48)props.push(placed('open-edge-dust-'+index,'first_strike_dust_trail',edge.x,renderFloor(edge)+.008,edge.z,.25+level*.4,.015,.18+level*.25,{noShadow:true}));}
 return{props:props.map(p=>({...p,structural:false,decorative:true})),lights:[],level,coolScale:late*.09,causes:{ceilingJoints:anchors.length,openSkyEdges:anchors.length?0:Math.min(6,entry.warningEdges?.length||0)},motionSuppressed:protectedFrame||reducedMotion};
}
export const createFirstStrikeWarnings=({entry,getEntry=()=>entry}={})=>({frame:(progress,time,options)=>firstStrikeWarningFrame(getEntry(),progress,time,options)});

// Low site-clearance lamps mark only the already-supported choices. Their
// entire body is below the normal step height; no new floor or exit is added.
export function firstStrikeClearanceLamps(entryValue){
 const entry=normalizeFirstStrikeEntry(entryValue),props=[],lights=[];
 for(const[targetIndex,t]of[entry.safeEdge,entry.shelter].filter(Boolean).entries()){
  const n=t.normal||{x:0,z:-1},length=Math.hypot(n.x,n.z)||1,offset=Math.min(.55,t.radius*.55);
  let x=t.x+n.z/length*offset,z=t.z-n.x/length*offset,support=firstStrikeFooting(entry,x,z,t.feet);
  if(!support){x=t.x;z=t.z;support=firstStrikeFooting(entry,x,z,t.feet);}if(!support)continue;
  const floor=renderFloor(firstStrikeCellAt(entry,x,z,support.y)||{floor:support.y});
  props.push(placed('clearance-base-'+targetIndex,FIRST_STRIKE_MESHES[2],x,floor+.065,z,.28,.12,.24,{structural:false,decorative:true}));
  props.push(placed('clearance-lens-'+targetIndex,FIRST_STRIKE_MESHES[7],x,floor+.145,z,.16,.10,.12,{structural:false,decorative:true}));
  lights.push({id:'first-strike:clearance-'+targetIndex,x,y:floor+.22,z,radius:4.2,intensity:1.25,color:[.32,.76,.42],penetration:0});
 }
 return{props,lights};
}

export function firstStrikePlan(entryValue,state){const entry=normalizeFirstStrikeEntry(entryValue),source=entry.plan;if(!source)return null;const plan={...source,rgba:new Uint8Array(source.rgba),material:source.material?new Uint8Array(source.material):null,ambient:source.ambient?new Uint8Array(source.ambient):null};
 for(const release of state.released){const piece=firstStrikePieces(entry).find(p=>p.id===release.id);for(const cell of piece?.cells||[]){const ix=Math.floor(cell.x/CELL-(source.originX||0)),iz=Math.floor(cell.z/CELL-(source.originY||0));if(ix<0||iz<0||ix>=source.w||iz>=source.h)continue;plan.rgba[(iz*source.w+ix)*4+2]|=4;}}
 return plan;
}
export function firstStrikeRenderFrame(entryValue,state,presentation={}){
 const entry=normalizeFirstStrikeEntry(entryValue),frame=firstStrikeFrame(state,entry,presentation),props=[...(typeof entry.getProps==='function'?entry.getProps():entry.props)],pieces=firstStrikePieces(entry);
 const warning=firstStrikeWarningFrame(entry,1,state.elapsed,{protected:!!presentation.protected,reducedMotion:!!presentation.reducedMotion});props.push(...warning.props.map(p=>({...p,structural:false,decorative:true})));
 const movedHosts=new Map();
 let slabs=0;
 for(const released of state.released){const p=pieces.find(p=>p.id===released.id);if(!p)continue;const pose=firstStrikePiecePose(p,released.at,state.elapsed,{...presentation,mode:released.mode});
  if(!entry.plan||p.structuralHost){
   const ids=p.hostId?[p.hostId]:[...new Set(p.cells.map(c=>c.ceilingHostId))];
   for(const id of ids){if(!id||movedHosts.has(id))continue;const original=props.find(v=>v.id===id),bounds=entry.hostBounds?.[id];if(!original||!bounds)continue;
    const m=original.matrix?.length===16?new Float32Array(original.matrix):matrix(original.x||0,original.y||0,original.z||0,(original.scaleX??1)*(original.scale??1),(original.scaleY??1)*(original.scale??1),(original.scaleZ??1)*(original.scale??1),original.yaw||0);
    const supportedFloors=entry.walkCells.filter(c=>c.ceilingHostId===id),floor=supportedFloors.length?Math.max(...supportedFloors.map(c=>c.floor)):p.floor,headroom=state.elapsed<35?2.30:2.15;
    const downward=Math.max(0,Math.min(pose.drop,bounds.min[1]-floor-headroom));
    if(downward>0)m[13]-=downward;
    else{
     // A complete host with retained feet rocks on its existing foundation;
     // never translate its base straight through its own support plane.
     const width=Math.max(.1,bounds.max[0]-bounds.min[0]),height=Math.max(.1,bounds.max[1]-bounds.min[1]),
      bodyBound=fixedHostAngleBound(entry,id,bounds),angle=Math.min(presentation.reducedMotion?.018:.065,bodyBound,pose.drop/(height+width+1)),pivotX=bounds.max[0],pivotY=bounds.min[1],pivotZ=(bounds.min[2]+bounds.max[2])/2;
     const a=matrix(pivotX,pivotY,pivotZ,1,1,1,0,-angle),b=matrix(-pivotX,-pivotY,-pivotZ),transform=multiply(a,b);const next=multiply(transform,m);for(let k=0;k<16;k++)m[k]=next[k];
    }
    movedHosts.set(id,{...original,matrix:m,x:m[12],y:m[13],z:m[14],firstStrikeHost:true,releaseAt:released.at});
   }
   continue;
  }
  for(const cell of p.cells){const headroom=2.30-.15*smooth((state.elapsed-35)/6.5),bottom=pose.held?Math.max(cell.floor+headroom,renderCeil(cell)-pose.drop):Math.max(renderFloor(cell),renderCeil(cell)-.5*C.gravity*pose.age*pose.age),role=cell.material===3?'first_strike_girder':'first_strike_plaster',m=matrix(cell.x,bottom+C.slabThickness/2,cell.z,cell.size*.985,C.slabThickness,cell.size*.985,0,pose.roll);props.push({...placed(p.id+'-'+slabs++,role,cell.x,m[13],cell.z,1,1,1),matrix:m,releaseAt:released.at,settled:pose.settled});
   props.push(placed(p.id+'-core-'+slabs,'first_strike_core',cell.x,bottom+C.slabThickness*.38,cell.z,cell.size*.96,C.slabThickness*.24,cell.size*.96));
  }
  if(!presentation.reducedMotion&&pose.age<2.4){const count=Math.min(6,C.maxDust);for(let i=0;i<count;i++){const t=pose.age+i*.031,r=.12+(i*.13)%1,angle=i*2.399;props.push(placed(p.id+'-grit-'+i,'first_strike_dust',p.x+Math.cos(angle)*r,Math.max(p.floor+.03,p.ceil-.5*C.gravity*t*t),p.z+Math.sin(angle)*r,.035,.025,.04,{noShadow:true}));}}
 }
 if(movedHosts.size){for(let i=props.length-1;i>=0;i--)if(movedHosts.has(props[i].id))props.splice(i,1);props.push(...movedHosts.values());}
 const lamps=firstStrikeClearanceLamps(entry);props.push(...lamps.props);
 const dark=frame.darkness,lighting={...(entry.lightingContext||{}),captureExposure:entry.lightingContext?.captureExposure??1.3,ambientIntensity:Math.max(.006,(entry.lightingContext?.ambientIntensity??.06)*(1-dark*.90))};
 return{...frame,props,lights:[...entry.lights.map(l=>({...l,intensity:(l.intensity??1)*(1-dark*.94)})),...lamps.lights],lighting,plan:firstStrikePlan(entry,state),counts:{props:props.length,slabs,released:state.released.length,movedHosts:movedHosts.size},authoredCamera:{eye:frame.eye,yaw:frame.yaw,pitch:frame.pitch}};
}
export function createFirstStrikeRenderer({entry:entryValue,renderer=R3,props=P3,getTorch=()=>({on:false,look:{power:0}}),onRelease=()=>{}}={}){
 const entry=normalizeFirstStrikeEntry(entryValue);let ready=false,closed=false,loading=null,error=null,last=null,planKey=null,releaseRange=null;
 const resident=()=>FIRST_STRIKE_RENDER_MESHES.every(n=>new Set(props.propMeshCatalog?.()||[]).has(n));
 const clear=()=>{for(const name of['r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetIndoorRain'])renderer[name]?.(0);for(const name of['r3dSetLocalLights','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);props.setPressureInstances?.([]);};
 function setPlan(state){const key=state.released.map(v=>v.id).join('|');if(key===planKey)return;const p=firstStrikePlan(entry,state);if(p)renderer.r3dSetPlan(p.rgba,p.w,p.h,p.material,{ambient:p.ambient,originX:p.originX,originY:p.originY,heightOffset:p.heightOffset});else{const rgba=new Uint8Array(16*16*4);renderer.r3dSetPlan(rgba,16,16);}planKey=key;}
 return{initialize(){if(loading)return loading;if(ready&&resident())return Promise.resolve(true);error=null;loading=(async()=>{if(!await prewarmFirstStrikeMeshes({renderer,props}))throw Error('First Strike physical meshes are unavailable.');if(closed)return false;clear();releaseRange=props.setAuthoredPropRange?.(Symbol('first-strike'),C.far);setPlan({released:[]});renderer.r3dSetSourceScene?.({key:'night:first-strike:'+entry.routeHash,look:{roomMemoryActive:entry.region==='source',blueprint:false,chroma:1,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSnapCameraOnNextFrame?.();ready=true;return true;})().catch(e=>{error=String(e?.message||e);throw e;}).finally(()=>{loading=null;});return loading;},
  ready:()=>ready&&!closed&&!error&&resident(),render(state,presentation={}){if(!ready||closed||!resident())return false;setPlan(state);last=firstStrikeRenderFrame(entry,state,presentation);renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);renderer.r3dSetLightingContext?.(last.lighting);const torch=getTorch();return renderer.r3dFrame({px:state.x/CELL-.5,py:state.z/CELL-.5,floorH:state.feet,authoredCamera:last.authoredCamera,authoredPropRange:C.far,tileW:entry.plan?.w||16,tileH:entry.plan?.h||16,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:torch?.on?1:0,torchLook:torch?.look,plan:true,water:{active:false},sensoryProfile:'story',textSpace:entry.region==='source',sourceVoidPhysical:false})!==false;},
  diagnostics:()=>({ready:ready&&!closed&&resident(),error,routeHash:entry.routeHash,existingPlan:!!entry.plan,counts:last?.counts||null}),dispose(){if(closed)return;closed=true;ready=false;clear();releaseRange?.();releaseRange=null;onRelease();},
 };
}
