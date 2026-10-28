// A temporary owner of the game's prop/depth/acquisition renderer. The
// controller's finite support and solids are the render model, in metres.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_CONTINUATION,continuationSurfaces,continuationSolids,continuationDoors,continuationProps,continuationSupportAt} from '../data/source-continuation.js';
import * as continuationData from '../data/source-continuation.js';
import {SOURCE_EARTHFALL} from '../data/source-earthfall.js';
import {sourceContinuationFrame} from '../game/source-continuation.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {sourcePrintUV,sourcePrintMaps,uploadPhysicalPrint,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {sourceBlueprintMaps,sourceBlueprintMaterial,sourceBlueprintLighting} from './source-blueprint-print.js';
import {sourceSurroundingsFrame} from '../game/source-surroundings.js';
import {SOURCE_SURROUNDINGS} from '../data/source-surroundings.js';
import {sourceSurroundingsGeometryLibrary,sourceSurroundingsMeshPayload,sourceSurroundingsProps,installSourceSurroundingsEmitterAliases,SOURCE_SURROUNDINGS_REQUIRED_MESHES} from './source-surroundings-geometry.js';

const PREFIX='source-continuation-';
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,finite(n)));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const phaseOf=state=>state?.phase==='catch'?'catch':'wrong-return';
const matrix=(x,y,z,yaw=0,sx=1,sy=1,sz=1)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]);};
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const rotateX=a=>new Float32Array([1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1]);
const rotateZ=a=>new Float32Array([Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1]);
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
const positioned=(id,mesh,m,extra={})=>({id,mesh,x:m[12],y:m[13],z:m[14],matrix:m,zone:ZONE.sourceSpace,structural:true,...extra});
const name=(phase,kind,id)=>`${PREFIX}${phase}-${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
const boxFaces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
const paint={source:[.62,.66,.59],concrete:[.52,.55,.50],stone:[.56,.59,.53],wood:[.37,.31,.23],'cold-stone':[.63,.66,.58],'cold-wall':[.60,.64,.57],'case-lining':[.27,.34,.31],'piano-wood':[.43,.34,.23],'dark-metal':[.18,.23,.22],metal:[.27,.31,.30],steel:[.29,.34,.33],'edge-steel':[.028,.036,.034],'next-edge-steel':[.11,.15,.14],'worn-metal':[.52,.43,.25],'asphalt':[.055,.065,.062],'earthfall-backing':[.035,.045,.039],'linen':[.55,.53,.41],'lip-paint':[.42,.34,.12],dark:[.07,.09,.08],refuge:[.53,.42,.24],warning:[.65,.47,.16]};
const isMetal=material=>/metal|steel|iron/.test(material||'');
const isSource=material=>!isMetal(material)&&!['asphalt','earthfall-backing','wood','piano-wood','case-lining','linen','lip-paint','dark','refuge','warning'].includes(material);

export const SOURCE_CONTINUATION_ARCHITECTURE=Object.freeze({
  asset:'assets/source-continuation-architecture.glb',far:SOURCE_SURROUNDINGS.farClip,maxInstances:760,maxLights:8,
  meshes:Object.freeze(['source_ii_ellery_bay','source_ii_ellery_corner','source_ii_chapel_buttress','source_iii_spindle','source_iii_bearing',
    'source_iii_catch_frame_0','source_iii_catch_frame_1','source_iii_catch_frame_2','source_iii_catch_frame_3','source_ii_arch_voussoirs','source_ii_stringer','source_ii_case_hinge',
    'source_ii_case_floor','source_ii_case_lid','source_ii_piano_soundboard','source_ii_tower_cap']),
});
export const SOURCE_CONTINUATION_LIGHTING=Object.freeze({ambientIntensity:.45,captureExposure:1.6,whitePointScale:1});
export function sourceContinuationLighting(value=null){
  const settings=value&&typeof value==='object'?value:{};
  return{...sourceBlueprintLighting({ambientColor:[.57,.65,.62],whitePointScale:1,screen:'stochastic'}),
    ambientIntensity:clamp(finite(settings.ambientIntensity,SOURCE_CONTINUATION_LIGHTING.ambientIntensity),0,1),
    captureExposure:clamp(finite(settings.captureExposure,SOURCE_CONTINUATION_LIGHTING.captureExposure),.25,6),
    whitePointScale:1};
}
const assemblies=()=>continuationData.CONTINUATION_ASSEMBLIES||[];
const catchFloor=level=>continuationData.continuationCatchFloor(level);
const catchStage=level=>continuationData.CONTINUATION_CATCH_STAGES?.[level]||{level,y:catchFloor(level),center:SOURCE_CONTINUATION.catch.center};
const regionOf=row=>row.region||row.phase||'wrong-return';

function boundsOf(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<points.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],points[i]);max[axis]=Math.max(max[axis],points[i]);}return{min,max,center:min.map((v,i)=>(v+max[i])/2)};}
function indexedBox(points){return{p:points.flat(),i:boxFaces.flatMap(([a,b,c,d])=>[a,c,b,a,d,c])};}
function solidGeometry(s){return indexedBox([[s.minX,s.minY,s.minZ],[s.maxX,s.minY,s.minZ],[s.maxX,s.minY,s.maxZ],[s.minX,s.minY,s.maxZ],[s.minX,s.maxY,s.minZ],[s.maxX,s.maxY,s.minZ],[s.maxX,s.maxY,s.maxZ],[s.minX,s.maxY,s.maxZ]]);}
function surfaceGeometry(s){
  if(s.kind==='sector'){
    const result={p:[],i:[]},c=s.center,steps=Math.max(16,Math.ceil((s.endAngle-s.startAngle)/.055)),thickness=finite(s.thickness,.22);
    for(let k=0;k<steps;k++){
      const a=s.startAngle+(s.endAngle-s.startAngle)*k/steps,b=s.startAngle+(s.endAngle-s.startAngle)*(k+1)/steps;
      const ring=[...[[s.innerRadius,a],[s.outerRadius,a],[s.outerRadius,b],[s.innerRadius,b]].map(([r,t])=>[c.x+Math.cos(t)*r,finite(s.y)-thickness,c.z+Math.sin(t)*r]),
        ...[[s.innerRadius,a],[s.outerRadius,a],[s.outerRadius,b],[s.innerRadius,b]].map(([r,t])=>[c.x+Math.cos(t)*r,finite(s.y),c.z+Math.sin(t)*r])];
      // Each annular slice is a closed convex prism. The opening remains real.
      const o=result.p.length/3;result.p.push(...ring.flat());
      for(const f of[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]])result.i.push(o+f[0],o+f[1],o+f[2],o+f[0],o+f[2],o+f[3]);
    }
    return result;
  }
  const bottom=finite(s.thickness,.22),points=[[s.minX,s.minZ],[s.maxX,s.minZ],[s.maxX,s.maxZ],[s.minX,s.maxZ]],top=points.map(([x,z])=>[x,continuationData.continuationSurfaceY(s,x,z),z]);
  return indexedBox([...top.map(([x,y,z])=>[x,y-bottom,z]),...top]);
}
function cylinderGeometry(sides=24,{disc=false}={}){
  const p=[],i=[];for(let k=0;k<sides;k++){const angle=k/sides*Math.PI*2;p.push(Math.cos(angle)*.5,0,Math.sin(angle)*.5,Math.cos(angle)*.5,disc?.005:1,Math.sin(angle)*.5);}
  p.push(0,0,0,0,disc?.005:1,0);const lo=sides*2,hi=lo+1;
  for(let k=0;k<sides;k++){const a=k*2,b=(k+1)%sides*2;i.push(a,b+1,b,a,a+1,b+1,lo,a,b,hi,b+1,a+1);}return{p,i};
}
function appendGeometry(target,geometry,transformPoint=p=>p){const offset=target.p.length/3;for(let k=0;k<geometry.p.length;k+=3)target.p.push(...transformPoint(geometry.p.slice(k,k+3)));target.i.push(...geometry.i.map(index=>index+offset));return target;}
function lipPaintGeometry(){
  const result={p:[],i:[]};
  for(const x of[-.49,-.30,.30,.49])appendGeometry(result,solidGeometry({minX:x-.055,maxX:x+.055,minY:.025,maxY:.031,minZ:-.21,maxZ:.21}));
  for(const sign of[-1,1]){const a=[sign*.20,.045],b=[0,-.18],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),c=dx/length,s=dz/length;
    appendGeometry(result,solidGeometry({minX:0,maxX:length,minY:.025,maxY:.031,minZ:-.038,maxZ:.038}),p=>[a[0]+p[0]*c-p[2]*s,p[1],a[1]+p[0]*s+p[2]*c]);}
  return result;
}
function boxesGeometry(boxes){return boxes.reduce((g,b)=>appendGeometry(g,solidGeometry({minX:b[0],maxX:b[1],minY:b[2],maxY:b[3],minZ:b[4],maxZ:b[5]})),{p:[],i:[]});}

// Only exposed edges of the support union get a rim. Internal rectangle joins
// must not look like gaps, and the cap stays wholly inside the real footprint.
export function sourceContinuationEdges(state={phase:'catch'}){
  const rows=continuationSurfaces(state).filter(s=>s.kind==='rect'&&Number.isInteger(s.level)),segments=new Map(),epsilon=1e-5;
  for(const row of rows)for(const[axis,at,lo,hi,normal]of[['z',row.minX,row.minZ,row.maxZ,[-1,0]],['z',row.maxX,row.minZ,row.maxZ,[1,0]],['x',row.minZ,row.minX,row.maxX,[0,-1]],['x',row.maxZ,row.minX,row.maxX,[0,1]]]){
    const peers=rows.filter(p=>Math.abs(p.y-row.y)<epsilon),cuts=[lo,hi];
    for(const p of peers)for(const v of axis==='x'?[p.minX,p.maxX]:[p.minZ,p.maxZ])if(v>lo+epsilon&&v<hi-epsilon)cuts.push(v);
    cuts.sort((a,b)=>a-b);
    for(let k=0;k<cuts.length-1;k++){const start=cuts[k],end=cuts[k+1];if(end-start<epsilon)continue;const mid=(start+end)/2,x=(axis==='x'?mid:at)+normal[0]*epsilon,z=(axis==='z'?mid:at)+normal[1]*epsilon;
      if(peers.some(p=>x>p.minX&&x<p.maxX&&z>p.minZ&&z<p.maxZ))continue;
      const key=[row.level,row.y,axis,at,...normal,start,end].join(':');segments.set(key,{axis,at,start,end,normal,y:row.y,level:row.level,thickness:finite(row.thickness,.22)});
    }
  }
  const groups=new Map();for(const edge of segments.values()){const key=[edge.level,edge.y,edge.axis,edge.at,...edge.normal].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(edge);}
  const result=[];for(const group of groups.values()){group.sort((a,b)=>a.start-b.start);for(const edge of group){const prior=result.at(-1);if(prior&&prior.axis===edge.axis&&prior.at===edge.at&&prior.y===edge.y&&prior.level===edge.level&&prior.normal[0]===edge.normal[0]&&prior.normal[1]===edge.normal[1]&&Math.abs(prior.end-edge.start)<epsilon)prior.end=edge.end;else result.push({...edge});}}
  return result;
}
export function sourceContinuationEdgeGeometry(state={phase:'catch'}){
  const groups=new Map();for(const edge of sourceContinuationEdges(state)){const key=`${edge.level}:${edge.y}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(edge);}
  return[...groups.values()].flatMap(edges=>{
    const {level,y}=edges[0],suffix=y<SOURCE_CONTINUATION.catch.top-level*SOURCE_CONTINUATION.catch.layerDrop-.5?'-lining':'';
    const geometry={p:[],i:[]};for(const e of edges){const cross=e.axis==='x'?e.normal[1]:e.normal[0],lo=Math.min(e.at,e.at-cross*.12),hi=Math.max(e.at,e.at-cross*.12);
      appendGeometry(geometry,solidGeometry({minX:e.axis==='x'?e.start:lo,maxX:e.axis==='x'?e.end:hi,minZ:e.axis==='z'?e.start:lo,maxZ:e.axis==='z'?e.end:hi,minY:e.y-e.thickness-.045,maxY:e.y+.008}));}
    return['edge-steel','next-edge-steel'].map((material,k)=>({id:`catch-rim-${level}${suffix}${k?'-next':''}`,name:PREFIX+`catch-rim-${level}${suffix}${k?'-next':''}`,kind:'edge',level,elevation:y,material,edges,...geometry}));
  });
}
const canonical={
  block:{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:1,minZ:-.5,maxZ:.5}),material:'metal'},
  counterweight:{...cylinderGeometry(32),material:'metal'},
  pin:{...cylinderGeometry(12),material:'steel'},
  lamp:{...solidGeometry({minX:-.12,maxX:.12,minY:-.08,maxY:.08,minZ:-.10,maxZ:.10}),material:'refuge'},
  shadow:{...cylinderGeometry(32,{disc:true}),material:'dark'},
  warning:{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:.012,minZ:-.5,maxZ:.5}),material:'warning'},
  'lip-tread':{...solidGeometry({minX:-.63,maxX:.63,minY:0,maxY:.023,minZ:-.29,maxZ:.29}),material:'edge-steel'},
  'lip-paint':{...lipPaintGeometry(),material:'lip-paint'},
  'worn-block':{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:1,minZ:-.5,maxZ:.5}),material:'worn-metal'},
  'door-wear':{...boxesGeometry([[1.06,1.40,1.10,1.80,.037,.043],[1.06,1.40,1.10,1.80,-.043,-.037]]),material:'linen'},
  'door-handle':{...boxesGeometry([[1.19,1.25,1.40,1.47,.04,.16],[.96,1.25,1.40,1.47,.13,.18],[1.19,1.25,1.40,1.47,-.16,-.04],[.96,1.25,1.40,1.47,-.18,-.13]]),material:'worn-metal'},
  'operator-yoke':{...boxesGeometry([[-.285,-.09,1.40,1.46,-.12,.13],[.09,.285,1.40,1.46,-.12,.13]]),material:'linen'},
  'operator-toes':{...boxesGeometry([[-.18,-.045,.025,.075,-.38,-.13],[.045,.18,.025,.075,-.38,-.13]]),material:'steel'},
  'recovery-sling':{...boxesGeometry([[-.37,.37,.005,.025,-.24,.24],[-.38,-.32,.025,.52,-.24,.24],[.32,.38,.025,.52,-.24,.24]]),material:'linen'},
  'door-lamp-fixture':{...boxesGeometry([[-.035,.035,-.03,.03,0,.85],[-.13,.13,-.08,.08,.75,.95],[-.17,.17,.08,.115,.72,.98]]),material:'refuge'},
  'road-preview':{...solidGeometry({minX:-.5,maxX:.5,minY:-.35,maxY:0,minZ:-.5,maxZ:.5}),material:'asphalt'},
  'road-kerb':{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:.15,minZ:-.5,maxZ:.5}),material:'stone'},

};

export function sourceContinuationGeometry(state={phase:'wrong-return'}){
  const phase=phaseOf(state),geometry=[];
  for(const surface of continuationSurfaces(state))geometry.push({id:surface.id,name:name(regionOf(surface),'surface',surface.id),region:regionOf(surface),kind:'surface',material:surface.material||'source',role:surface.role,level:surface.level,descriptor:surface,...surfaceGeometry(surface)});
  for(const solid of continuationSolids(state))if(solid.role!=='furniture')geometry.push({id:solid.id,name:name(regionOf(solid),'solid',solid.id),region:regionOf(solid),kind:'solid',material:solid.material||'source',role:solid.role,level:solid.level,descriptor:solid,...solidGeometry(solid)});
  return geometry;
}
function allGeometry(){const rows=[...sourceContinuationGeometry({phase:'wrong-return'}),...sourceContinuationGeometry({phase:'wrong-return',closure:{mode:'closing',frontZ:0}}),...sourceContinuationGeometry({phase:'catch'}),...sourceContinuationEdgeGeometry()];return[...new Map(rows.map(row=>[row.name,row])).values(),...Object.entries(canonical).map(([id,g])=>({id,name:PREFIX+id,kind:'detail',...g})),...sourceSurroundingsGeometryLibrary()];}
const meshLibrary=allGeometry(),meshTriangles=meshLibrary.reduce((n,p)=>n+p.i.length/3,0),rimLibrary=meshLibrary.filter(p=>p.kind==='edge').map(p=>({...p,center:boundsOf(p.p).center}));
const finishTextures=new WeakMap();
function finishTexture(gl,material){
  if(!['wood','piano-wood','case-lining'].includes(material))return null;let cache=finishTextures.get(gl);if(!cache){cache=new Map();finishTextures.set(gl,cache);}if(cache.has(material))return cache.get(material);
  const width=128,height=128,pixels=new Uint8Array(width*height*4),cloth=material==='case-lining';
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4,grain=cloth?((x+y)%2?.90:1.0):.86+.09*Math.sin(x*.67+Math.sin(y*.05)*2.3)+.05*Math.sin(x*2.3+y*.02);pixels[at]=Math.round(255*grain);pixels[at+1]=Math.round(250*grain);pixels[at+2]=Math.round(239*grain);pixels[at+3]=255;}
  const texture=uploadPhysicalPrint(gl,{width,height,pixels},{repeat:true});cache.set(material,texture);return texture;
}

// Exported separately so geometry proofs can inspect the actual uploaded
// triangles. Source print UVs are authored in physical metres before recentering.
export function sourceContinuationMeshPayload(piece){
  if(piece.name?.startsWith('source-surroundings-'))return sourceSurroundingsMeshPayload(piece);
  const bounds=boundsOf(piece.p),positions=[],normals=[],uvs=[];
  // Reusable details are authored around a meaningful local anchor (the base
  // of a cylinder/cable, or the centre of a lamp). Only world geometry recentres.
  if(piece.kind==='detail')bounds.center=[0,0,0];
  for(let j=0;j<piece.i.length;j+=3){
    const points=piece.i.slice(j,j+3).map(index=>piece.p.slice(index*3,index*3+3));
    const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]);
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1;for(let k=0;k<3;k++)n[k]/=length;
    for(const p of points){positions.push(...p.map((v,k)=>v-bounds.center[k]));normals.push(...n);uvs.push(...sourcePrintUV(p,n,isSource(piece.material)?8:2.8));}
  }
  return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:Uint32Array.from({length:positions.length/3},(_,i)=>i),bounds,triangles:positions.length/9};
}

export function installSourceContinuationMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return[];
  installSourceSurroundingsEmitterAliases(gl,pack);
  const pieces=meshLibrary,missing=pieces.filter(piece=>!pack.catalog.has(piece.name));if(!missing.length)return pieces.map(p=>p.name);
  const printed=maps||sourceBlueprintMaps(gl);
  // Broad load-bearing sheets need a visible substrate. Keep the existing
  // pale physical Source paper there; cyanotype belongs to cut joints and the
  // former Earthfall path, whose material continuity is already established.
  const palePrinted=maps?{...maps,blueprint:false}:{...sourcePrintMaps(gl,'divide'),blueprint:false};
  for(const piece of missing){
    const data=sourceContinuationMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    const source=isSource(piece.material),stock=piece.paleStock||piece.kind==='surface'&&piece.role!=='inherited-earthfall'?palePrinted:printed,base=piece.base||[...(paint[piece.material]||paint.source),1],localBounds={min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])};
    const edge=/edge-steel/.test(piece.material);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sourceContinuation:true,bounds:localBounds,triangles:data.triangles},primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,base,emissive:piece.emissive||[0,0,0],texture:source?stock.texture:finishTexture(gl,piece.material),normalTexture:source?stock.normalTexture:null,ormTexture:source?stock.ormTexture:null,letteringFinish:source?stock.letteringFinish:null,materialFactors:'gltf',metallic:source?1:edge?.22:isMetal(piece.material)?.72:0,roughness:piece.material==='earthfall-backing'?1:source?1:edge?.91:isMetal(piece.material)?.58:.91,aoStrength:0,portrait:false,alphaCut:0,materialName:`continuation ${piece.material}`,materialRole:piece.materialRole||(piece.material==='earthfall-backing'?'quiet-metal':'source-continuation'),sourceSurroundingsSide:piece.sourceSurroundingsSide||0,printedSurface:source?SOURCE_PRINT_SURFACE:null,...(source?sourceBlueprintMaterial(stock,{base}):{})}]});
  }
  gl.bindVertexArray(null);return pieces.map(p=>p.name);
}

const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const hoist=SOURCE_CONTINUATION.catch.hoist;
const retained=['grand_piano','open_instrument_case','source_demolition_retained'];
const requiredMeshes=()=>[...new Set([...meshLibrary.map(p=>p.name),...retained,...retainedDoor,...SOURCE_CONTINUATION_ARCHITECTURE.meshes,...assemblies().map(p=>p.mesh),...SOURCE_SURROUNDINGS_REQUIRED_MESHES])];
const retainedDoor=[goods.frameMesh,goods.leafMesh,goods.freeStandingHeadMesh].filter(Boolean);
const propKindMesh={case:'instrument_case','case-hinge':'instrument_case',piano:'grand_piano',body:'ending_body_standing'};
const levelOf=row=>Number.isInteger(row.level)?row.level:Number.isInteger(row.descriptor?.level)?row.descriptor.level:null;
const assetPreparations=new WeakMap();

export function finishSourceContinuationArchitecture(gl,pack,{maps=null}={}){
  let printed=maps;
  for(const name of SOURCE_CONTINUATION_ARCHITECTURE.meshes)for(const primitive of pack.catalog.get(name)?.primitives||[])
    if(/source-cut joint stock/.test(primitive.materialName||'')){
      printed ||= sourceBlueprintMaps(gl);
      Object.assign(primitive,sourceBlueprintMaterial(printed,{base:[1,1,1,1]}),{texture:printed.texture,normalTexture:printed.normalTexture,ormTexture:printed.ormTexture,letteringFinish:printed.letteringFinish});
      // Imported factors were cached before this explicit material mapping.
      // Invalidate only the changed joint, so the actual physical channels win.
      delete primitive.mainFactors;
    }
  return SOURCE_CONTINUATION_ARCHITECTURE.meshes;
}

// The original Source can prepare this bounded catalog while it still owns
// the view. Preparing assets never borrows a plan, light, camera or prop list.
export function prewarmSourceContinuationAssets({renderer=R3,props=P3,resolveAsset=assetUrl,installMeshes=installSourceContinuationMeshes}={}){
  const pending=assetPreparations.get(props);if(pending)return pending;
  const preparing=(async()=>{
    const base=await renderer.r3dBasePropsReady?.();if(base===false)throw Error('The Source continuation base prop catalog could not be loaded.');
    if(typeof props.installAuthoredPropMeshes!=='function')throw Error('The Source continuation mesh installer is unavailable.');
    const installed=props.installAuthoredPropMeshes(installMeshes);if(installed===false)throw Error('The Source continuation prop context is unavailable.');
    if(await renderer.r3dAuthoredPropsReady?.()===false)throw Error('The authored Source catalog could not be prepared.');
    for(const [meshes,path]of[[SOURCE_CONTINUATION_ARCHITECTURE.meshes,SOURCE_CONTINUATION_ARCHITECTURE.asset],[retainedDoor,'assets/conservatory-doors.glb'],[['source_demolition_retained'],'assets/source-demolition.glb']]){
      const catalog=new Set(props.propMeshCatalog?.()||[]);if(meshes.some(mesh=>!catalog.has(mesh)))await props.addPropPack(resolveAsset(path));
    }
    // Printed construction joints coexist with the authored limestone, wood,
    // iron and case lining. Their broad faces retain native light response.
    props.installAuthoredPropMeshes(finishSourceContinuationArchitecture);
    const ready=new Set(props.propMeshCatalog?.()||[]),missing=requiredMeshes().filter(mesh=>!ready.has(mesh));
    if(missing.length)throw Error('Source continuation meshes missing: '+missing.join(', '));return true;
  })();
  assetPreparations.set(props,preparing);preparing.then(()=>{if(assetPreparations.get(props)===preparing)assetPreparations.delete(props);},()=>{if(assetPreparations.get(props)===preparing)assetPreparations.delete(props);});return preparing;
}

export function sourceContinuationCamera(frame){
  const player=frame.player||frame,feet=finite(player.y,player.feet);
  return{eye:[finite(player.x),feet+EYE,finite(player.z)],yaw:finite(player.yaw),pitch:finite(player.pitch),strictOverhead:false,revealProgress:null};
}

export function sourceContinuationRenderFrame(state,{anchor={x:0,y:0,z:0},viewportAspect=16/9,studyRotation=0,reducedMotion=false}={}){
  const frame=sourceContinuationFrame(state),player=frame.player||state.player||state,geometry=frame.geometry||{},surfaces=geometry.surfaces||continuationSurfaces(state),solids=geometry.solids||continuationSolids(state),doors=geometry.doors||continuationDoors(state),memoryProps=geometry.props||continuationProps(state);
  const props=[],lights=[],shownLevels=new Set(),origin={x:finite(anchor.x),y:finite(anchor.y),z:finite(anchor.z)},camera=sourceContinuationCamera(frame),focus=frame.focus;
  const center=SOURCE_CONTINUATION.catch.center;
  const put=(id,mesh,x,y,z,yaw=0,sx=1,sy=1,sz=1,extra={})=>{
    const p=positioned(PREFIX+id,mesh,matrix(origin.x+x,origin.y+y,origin.z+z,yaw,sx,sy,sz),extra);props.push(p);return p;
  };
  const putMatrix=(id,mesh,m,extra={})=>{const p=positioned(PREFIX+id,mesh,multiply(matrix(origin.x,origin.y,origin.z),m),extra);props.push(p);return p;};
  const beam=(id,a,b,width=.08,material='pin',extra={})=>{
    const y=b.map((v,k)=>v-a[k]),length=Math.hypot(...y);if(length<.001)return;
    const n=y.map(v=>v/length),seed=Math.abs(n[1])<.9?[0,1,0]:[1,0,0],cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],x=cross(n,seed),xl=Math.hypot(...x);for(let k=0;k<3;k++)x[k]/=xl;const z=cross(x,n);
    putMatrix(id,PREFIX+material,new Float32Array([...x.map(v=>v*width),0,...y,0,...z.map(v=>v*width),0,...a,1]),extra);
  };
  // Every support remains in the same world before and after the threshold.
  // Region identifies its construction; it never removes a floor from view.
  for(const piece of sourceContinuationGeometry(state)){
    const row=piece.descriptor;if(row.role==='spindle'||row.role==='arch-pier')continue;const b=boundsOf(piece.p),isSurface=piece.kind==='surface';
    put(piece.id,piece.name,...b.center,0,1,1,1,{continuation:true,physicalKind:piece.kind,descriptorId:row.id,region:regionOf(row),level:row.level,role:row.role,
      physicalBounds:{min:b.min,max:b.max},cullRadius:Math.hypot((b.max[0]-b.min[0])/2,(b.max[2]-b.min[2])/2)});
    if(Number.isInteger(row.level))shownLevels.add(row.level);
    if(isSurface&&row.kind!=='sector'&&row.role!=='stair'){
      const y=continuationData.continuationSurfaceY(row,(row.minX+row.maxX)/2,(row.minZ+row.maxZ)/2)-finite(row.thickness,.35)-.11;
      // Bearing courses show a real cut edge without doubling the top surface.
      if(row.maxX-row.minX>2)put('cut-bearing-'+row.id,PREFIX+'worn-block',(row.minX+row.maxX)/2,y,row.minZ+.07,0,row.maxX-row.minX,.12,.14,{architecturalJoint:true,descriptorId:row.id,region:regionOf(row)});
    }
  }
  for(const piece of rimLibrary.filter(piece=>piece.material==='edge-steel')){put(piece.id,piece.name,...piece.center,0,1,1,1,{catchRim:true,level:piece.level,elevation:piece.elevation});}
  // The four sectors are framed as four different fabricated objects. All
  // frames are below the exact support mesh, and the spindle is continuous.
  put('continuous-spindle','source_iii_spindle',center.x,0,center.z,0,1,1,1,{architecture:true,region:'catch',continuousSpindle:true,cullRadius:45});
  for(let level=0;level<SOURCE_CONTINUATION.catch.levels;level++){
    const stage=catchStage(level),y=catchFloor(level);
    put('radial-bearing-'+level,'source_iii_bearing',center.x,y,center.z,0,1,1,1,{architecture:true,region:'catch',bearing:true,level});
    put('fabricated-catch-'+level,'source_iii_catch_frame_'+level,center.x,y-.20,center.z,0,1,1,1,{architecture:true,region:'catch',catchConstruction:stage.construction,level,cullRadius:16});
    const r=stage.outerRadius||13,t=stage.refugeAngle||0,rx=center.x+Math.cos(t)*(r+1.25),rz=center.z+Math.sin(t)*(r+1.25);
    put('refuge-rib-'+level,PREFIX+'worn-block',rx,y-.85,rz,0,2.7,.65,2.7,{architecture:true,region:'catch',refugeStructure:true,level});
    // A remote load brace bears each partial shelf without filling its hole.
    for(const a of[stage.startAngle+.20,stage.endAngle-.20]){
      const bx=center.x+Math.cos(a)*(r-.3),bz=center.z+Math.sin(a)*(r-.3);
      beam('radial-tie-'+level+'-'+a,[center.x+Math.cos(a)*.82,y-1.05,center.z+Math.sin(a)*.82],[bx,y-1.8,bz],.12,'pin',{architecture:true,region:'catch',tensionMember:true,level});
    }
  }
  // Native models and clipped original building fabric supply their own
  // proportions. Sideways/inverted fragments demonstrate another gravity
  // domain while the player's feet and camera retain one stable up direction.
  for(const row of assemblies()){
    let m=multiply(matrix(row.x,row.y,row.z,finite(row.yaw)),multiply(rotateX(finite(row.pitch)),rotateZ(finite(row.roll))));
    m=multiply(m,matrix(0,0,0,0,finite(row.scaleX,row.scale??1),finite(row.scaleY,row.scale??1),finite(row.scaleZ,row.scale??1)));
    putMatrix('assembly-'+row.id,row.mesh,m,{architecture:true,region:row.region||'wrong-return',assemblyId:row.id,supportId:row.supportId,orientation:row.orientation||'upright',originalModel:row.mesh,cullRadius:32});
  }
  // Joined stairs have exact individual treads, continuous offset rails and
  // stringers below their underside. Opposed flights share a readable landing.
  for(const link of continuationData.CONTINUATION_STRUCTURAL_LINKS||[]){
    if(link.kind!=='stair')continue;const width=link.maxX-link.minX,run=link.maxZ-link.minZ,rise=link.y1-link.y0;
    put('stringer-'+link.id,'source_ii_stringer',(link.minX+link.maxX)/2,link.y0,link.maxZ,0,width,rise/4.2,run,{architecture:true,stairStructure:true,region:'wrong-return',stairId:link.id});
    for(const side of[-1,1]){
      const x=(link.minX+link.maxX)/2+side*(width/2+.07);
      const a=[x,link.y0+1.05,link.maxZ],b=[x,link.y1+1.05,link.minZ];
      beam('stair-handrail-'+link.id+'-'+side,a,b,.09,'pin',{architecture:true,handrail:true,stairId:link.id});
      for(let k=0;k<=7;k++){const t=k/7,z=link.maxZ-run*t,y=link.y0+rise*t;beam('stair-baluster-'+link.id+'-'+side+'-'+k,[x,y-.10,z],[x,y+1.05,z],.055,'pin',{architecture:true,baluster:true,stairId:link.id});}
    }
  }
  for(const [x,y,z,yaw,id]of[[0,0,-4,0,'entry'],[10,4.2,-22,Math.PI/2,'mid-return'],[0,8.4,-19,0,'upper-refuge']]){
    put('jointed-arch-'+id,'source_ii_arch_voussoirs',x,y,z,yaw,1,1,1,{architecture:true,region:'wrong-return',opening:true,cullRadius:8});
  }
  for(const door of doors){
    const width=finite(door.width,1.8),height=finite(door.height,2.3),base=matrix(origin.x+door.x,origin.y+door.y,origin.z+door.z,finite(door.yaw),width/goods.opening.width,height/goods.opening.height,1),fraction=clamp(door.openFraction??door.fraction??(door.open??state.doorOpen?.[door.id]?1:0),0,1);
    props.push(positioned(PREFIX+'door-'+door.id,goods.frameMesh,base,{continuation:true,doorId:door.id,role:door.role,region:regionOf(door),level:door.level}));
    if(goods.freeStandingHeadMesh)props.push(positioned(PREFIX+'door-head-'+door.id,goods.freeStandingHeadMesh,base,{doorId:door.id,region:regionOf(door)}));
    const focused=focus?.id===door.id,reach=focused?clamp(1-Math.hypot(player.x-door.x,player.z-door.z)/1.9,0,1):0;
    for(let k=0;k<goods.leafCount;k++){
      const leaf=multiply(base,doorLeafLocalMatrix(goods,k,fraction));props.push(positioned(`${PREFIX}door-${door.id}-leaf-${k}`,goods.leafMesh,leaf,{continuation:true,doorId:door.id,region:regionOf(door),level:door.level}));
      props.push(positioned(`${PREFIX}door-wear-${door.id}-${k}`,PREFIX+'door-wear',leaf,{doorWear:true,doorId:door.id,level:door.level}));
      const grip=multiply(multiply(multiply(leaf,matrix(1.22,1.435,0)),rotateZ(-reach*.12*(1-fraction))),matrix(-1.22,-1.435,0));props.push(positioned(`${PREFIX}door-handle-${door.id}-${k}`,PREFIX+'door-handle',grip,{doorHandle:true,doorId:door.id,focused,reach,level:door.level}));
    }
    const refuge=door.role==='return',side=door.role==='final'?1:-1,nx=-Math.sin(finite(door.yaw))*side,nz=Math.cos(finite(door.yaw))*side,lampY=door.y+height+.18;
    put('door-lamp-'+door.id,PREFIX+'door-lamp-fixture',door.x,lampY,door.z,finite(door.yaw)+(side<0?Math.PI:0),1,1,1,{practical:true,doorId:door.id,region:regionOf(door),level:door.level});
    lights.push({id:PREFIX+'door-light-'+door.id,x:origin.x+door.x+nx*.85,y:origin.y+lampY-.3,z:origin.z+door.z+nz*.85,radius:refuge?4.3:5.2,intensity:(refuge?.65:.78)+reach*.3,color:refuge?[.79,.60,.36]:[.53,.66,.65],penetration:0,focusPractical:focused});
  }
  for(const row of memoryProps){
    if(row.kind==='release-lip'){
      const yaw=Math.atan2(finite(row.dx),-finite(row.dz));
      put('lip-tread-'+row.id,PREFIX+'lip-tread',row.x,row.y,row.z,yaw,1,1,1,{releaseTread:true,level:row.level,lipId:row.id,dropDirection:[row.dx,row.dz]});
      // Scuffed grip positions, rather than luminous game arrows, face the
      // actual lower catch. Both supported releases carry identical treatment.
      put('lip-paint-'+row.id,PREFIX+'lip-paint',row.x,row.y,row.z,yaw,1,1,1,{releasePaint:true,level:row.level,lipId:row.id});
    }else if(row.mesh)put('prop-'+row.id,row.mesh,row.x,row.y,row.z,finite(row.yaw),finite(row.scaleX,row.scale??1),finite(row.scaleY,row.scale??1),finite(row.scaleZ,row.scale??1),{continuation:true,region:regionOf(row),role:row.role,decorative:true});
    else if(row.kind==='seam')for(let k=0;k<3;k++)put('seam-'+row.id+'-'+k,PREFIX+'worn-block',row.x,row.y+k*.28,row.z,finite(row.yaw),.18,.032,.12,{matchingSeam:true,role:row.role,region:regionOf(row)});
  }
  const closure=frame.closure||{};
  if(['warning','closing'].includes(closure.mode)){
    const x=finite(closure.frontX,SOURCE_CONTINUATION.wrongReturn.closureStartX),y=closure.mode==='warning'?12.3:9.9;
    if(closure.mode==='warning')put('suspended-closing-front',PREFIX+'worn-block',x,y,-12,0,.32,3,4,{closureSuspended:true,warning:true,region:'wrong-return'});
    for(const z of[-13.7,-10.3])beam('closure-cable-'+z,[x,y+1.5,z],[x,17,z],.04,'pin',{closureCable:true,region:'wrong-return'});
    put('closing-front-bearing',PREFIX+'worn-block',x,y-1.55,-12,0,.44,.12,4.2,{closureBearing:true,region:'wrong-return'});
  }
  const weight=frame.counterweight;
  if(weight){
    const radius=SOURCE_CONTINUATION.catch.counterweightRadius,top=weight.y+1.4;
    put('counterweight',PREFIX+'counterweight',weight.x,weight.y,weight.z,0,radius*2,1.4,radius*2,{counterweight:true,mode:weight.mode,level:weight.level,collisionRadius:radius});
    for(const [y,k]of[[.12,0],[.67,1],[1.26,2]])put('counterweight-hoop-'+k,PREFIX+'counterweight',weight.x,weight.y+y,weight.z,0,radius*2+.025,.075,radius*2+.025,{counterweightHoop:true,region:'catch'});
    beam('weight-tension-cable',[weight.x,top,weight.z],[weight.x,hoist.railY,weight.z],.045,'pin',{counterweightCable:true,region:'catch'});
    const h=SOURCE_CONTINUATION.catch.hoist;
    beam('hoist-rail-long',[h.shaft.x,h.railY,h.shaft.z],[h.start.x,h.railY,h.shaft.z],.16,'pin',{hoistRail:true,region:'catch'});
    beam('hoist-rail-return',[h.start.x,h.railY,h.shaft.z],[h.start.x,h.railY,h.start.z],.16,'pin',{hoistRail:true,region:'catch'});
    put('hoist-trolley',PREFIX+'worn-block',weight.x,h.railY-.14,weight.z,0,.38,.20,.38,{hoistTrolley:true,region:'catch'});
    const receiver=continuationSupportAt(weight.x,weight.z,state,{maxY:weight.y+.08,minY:weight.y-.35});
    if(receiver)put('counterweight-shadow',PREFIX+'shadow',weight.x,receiver.y+.012,weight.z,0,radius*2+.2,1,radius*2+.2,{threatShadow:true,receiverLevel:receiver.level});
    if(frame.recovery?.kind==='sling'){
      put('operator-recovery-sling',PREFIX+'recovery-sling',player.x,player.y,player.z,player.yaw,1,1,1,{recoverySling:true});
      for(const dx of[-.35,.35])beam('recovery-line-'+dx,[player.x+dx,player.y+.5,player.z],[player.x+dx,h.railY,player.z],.025,'pin',{recoveryCable:true});
    }
  }
  // Fixed grazing fixtures belong to particular model joints and lower frames.
  // Their sources sit below/along the fabrication, rather than above a pale
  // deck. This lets a carried beam reveal an object already readable as mass.
  for(const [x,y,z,id,radius,intensity,attachment]of[
    [9.4,5.7,-35.8,'piano-key-joint',9,.82,'ii-whole-piano-bank'],
    [-19.9,-.6,-2.5,'case-bank-hinge',7,.70,'ii-whole-case-bank'],
    [-27.97,6.8,-4.38,'case-crescent-brace',10,.84,'fabricated-catch-0'],
    [-47.32,.7,-4.28,'soundboard-rib',10,.78,'fabricated-catch-1'],
    [-46.9,-6.5,-18.62,'counterarc-bearing',9,.72,'fabricated-catch-2'],
  ]){
    put('practical-'+id,PREFIX+'lamp',x,y,z,0,1,1,1,{practical:true,attached:true});
    lights.push({id:PREFIX+'fixed-'+id,x:origin.x+x,y:origin.y+y-.14,z:origin.z+z,radius,intensity,color:id==='piano-key-joint'?[.74,.58,.38]:[.43,.58,.60],penetration:0,attachedTo:attachment});
  }
  // The landing and narrow spine behind the entry are the floor just crossed,
  // with their original lower fixtures translated through the shared door.
  // They stay fixed in this world; architectural visibility still occludes them.
  const priorDoor=continuationDoors(state).find(door=>door.id==='wrong-entry-return');
  const earthfallOffset=finite(priorDoor?.z,3.5)-SOURCE_EARTHFALL.passage.exitZ;
  for(const row of[
    {id:'lower-spine',x:2.2,y:3.2,z:-28,radius:19,intensity:2.1,color:[.52,.64,.65]},
    {id:'lower-head',x:0,y:3.8,z:-7,radius:22,intensity:2.8,color:[.55,.68,.69]},
  ])lights.push({...row,id:PREFIX+'inherited-'+row.id,x:origin.x+row.x,y:origin.y+row.y,z:origin.z+row.z+earthfallOffset,penetration:0,inheritedEarthfall:true});
  // These are the retained Earthfall anchors, translated by the real lower
  // doorway alignment: the current Earthfall exit becomes Source II entry z=3.5.
  put('upper-exit-remnant',goods.frameMesh,0,100,SOURCE_EARTHFALL.passage.upperExitZ+earthfallOffset,0,3/goods.opening.width,3.05/goods.opening.height,1,{architecture:true,inheritedRuins:true,upperRemnant:true,cullRadius:8});
  put('upper-ellery-retained','source_demolition_retained',-18,100,9+earthfallOffset,Math.PI,1,1,1,{architecture:true,inheritedRuins:true,upperRemnant:true,sourceAnchor:'earthfall-ellery',cullRadius:90});
  // A finite service-road view carries the existing drive's destination
  // language through the final open leaves. It begins beyond the completion
  // plane; this is a preview of that handoff, not a replacement drive route.
  const exit=SOURCE_CONTINUATION.catch.finalDoor;
  put('onward-road-preview',PREFIX+'road-preview',exit.x+7,exit.y,exit.z,0,12,1,6.5,{onwardPreview:true,region:'catch',previewOf:'existing-source-drive',cullRadius:10});
  for(const side of[-1,1])put('onward-road-kerb-'+side,PREFIX+'road-kerb',exit.x+7,exit.y,exit.z+side*3.35,0,12,1,.2,{onwardPreview:true,kerb:true,region:'catch'});
  const worlds=['wrong-return','catch'].map(phase=>sourceSurroundingsFrame({...state,phase},{reducedMotion}));
  for(const world of worlds)props.push(...sourceSurroundingsProps(world,{origin}));
  const activeWorld=worlds[phaseOf(state)==='catch'?1:0];
  const surroundings={world:activeWorld.world,clock:activeWorld.time,reducedMotion:!!reducedMotion,
    score:activeWorld.score,waves:activeWorld.waves,events:activeWorld.impacts,
    persistentWorlds:worlds.map(world=>({world:world.world,...world.diagnostics.counts})),
    props:props.filter(p=>p.surroundings).length,
    gate:{x:origin.x-18,y:origin.y+8.39,z:origin.z-12,width:2.2,height:2.86,normalX:1,normalZ:0}};
  let eye=camera.eye.map((v,k)=>v+[origin.x,origin.y,origin.z][k]),worldYaw=camera.yaw;
  const rotation=phaseOf(state)==='catch'?finite(studyRotation):0;
  if(rotation){const cx=origin.x+center.x,cz=origin.z+center.z,rigid=multiply(matrix(cx,0,cz,rotation),matrix(-cx,0,-cz));for(const p of props){const q=transform(rigid,[p.x,p.y,p.z]);p.matrix=multiply(rigid,p.matrix);p.x=q[0];p.y=q[1];p.z=q[2];}for(const l of lights){const q=transform(rigid,[l.x,l.y,l.z]);l.x=q[0];l.y=q[1];l.z=q[2];}eye=transform(rigid,eye);worldYaw=angle(worldYaw+rotation);}
  if(rotation){const gate=surroundings.gate,q=transform(multiply(matrix(origin.x+center.x,0,origin.z+center.z,rotation),matrix(-origin.x-center.x,0,-origin.z-center.z)),[gate.x,gate.y,gate.z]);gate.x=q[0];gate.z=q[2];gate.normalX=Math.cos(rotation);gate.normalZ=Math.sin(rotation);}
  const near=light=>Math.hypot(light.x-eye[0],light.y-eye[1],light.z-eye[2]);
  const lookingBack=phaseOf(state)==='wrong-return'&&-Math.cos(worldYaw)>.45&&Math.abs(Math.sin(worldYaw))<.7;
  const lightPriority=light=>light.focusPractical?2:lookingBack&&light.inheritedEarthfall?1:0;
  const selectedLights=lights.sort((a,b)=>lightPriority(b)-lightPriority(a)||near(a)-near(b)).slice(0,SOURCE_CONTINUATION_ARCHITECTURE.maxLights);
  return{phase:phaseOf(state),props,lights:selectedLights,eye,yaw:worldYaw,pitch:camera.pitch,authoredCamera:{eye,yaw:worldYaw,pitch:camera.pitch},strictOverhead:false,cameraAimTarget:null,
    revealProgress:null,recovery:frame.recovery?{kind:frame.recovery.kind,elapsed:frame.recovery.elapsed,duration:frame.recovery.duration}:null,floorH:player.y+origin.y,falling:!!frame.fall,activeLevel:state.level,
    shownLevels:[...shownLevels].sort((a,b)=>a-b),hiddenAbove:[],geometry:{surfaces,solids,doors},source:frame,surroundings,
    counts:{surfaces:props.filter(p=>p.physicalKind==='surface').length,solids:props.filter(p=>p.physicalKind==='solid').length,props:props.length,lights:selectedLights.length,body:0},
    architecture:{persistentRegions:[...new Set(props.map(p=>p.region).filter(Boolean))],assemblies:props.filter(p=>p.assemblyId).map(p=>({id:p.assemblyId,mesh:p.mesh,orientation:p.orientation,supportId:p.supportId})),catchStages:SOURCE_CONTINUATION.catch.levels,
      stairTreads:surfaces.filter(p=>p.role==='stair').length,spindleContinuous:true,upperRemnantHeight:100,far:SOURCE_CONTINUATION_ARCHITECTURE.far,instances:props.length}};
}

export function createSourceContinuationRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},anchor={x:0,y:0,z:0},installMeshes=installSourceContinuationMeshes,getViewport=()=>renderer.r3dViewCamera?.(),getTorch=()=>({on:false,look:{power:0}}),getLighting=()=>null,getReducedMotion=()=>false,studyRotation=0}={}){
  const rangeOwner=Symbol('source-continuation-range');
  let releaseRange=null,initialized=false,released=false,loading=null,repair=null,error=null,last=null,lastFalling=false,torchFrame={on:false,look:{power:0}},lightingFrame=sourceContinuationLighting(),lightingKey='';
  const customNames=meshLibrary.map(p=>p.name),required=requiredMeshes();
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){
    renderer.r3dSetHorizon?.(null);renderer.r3dSetSourceShore?.(null);renderer.r3dSetSourceEmergency?.(0);renderer.r3dSetSourceWhiteout?.(0);renderer.r3dSetSourceFault?.(0);renderer.r3dSetLocalLights?.([]);renderer.r3dSetEmergencyShadows?.([]);renderer.r3dSetSourcePortals?.([]);renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetSourceOpenings?.([]);renderer.r3dSetSourceDoorLights?.([]);renderer.r3dSetSourceCrossing?.(null);renderer.r3dSetSourceReflection?.(null);renderer.r3dSetIndoorRain?.(0);renderer.r3dSetSourceTextInstances?.([]);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetProps?.([]);props.setPressureInstances?.([]);props.setSourceSurroundingsGate?.(null);
  }
  async function install(){
    if(released)return false;await prewarmSourceContinuationAssets({renderer,props,resolveAsset,installMeshes});return!released;
  }
  function updateLighting(){const next=sourceContinuationLighting(getLighting?.()),key=JSON.stringify(next);if(key!==lightingKey){renderer.r3dSetLightingContext?.(next);lightingFrame=next;lightingKey=key;}return next;}
  function initialize(){
    if(loading)return loading;loading=(async()=>{
      if(released)return false;
      if(!await install()||released)return false;
      if(typeof props.setAuthoredPropRange!=='function')throw Error('The Source continuation far-range lease is unavailable.');
      releaseRange=props.setAuthoredPropRange(rangeOwner,SOURCE_CONTINUATION_ARCHITECTURE.far);
      clearSource();props.setSourceSurroundingsGate?.({x:finite(anchor.x)-18,y:finite(anchor.y)+8.39,z:finite(anchor.z)-12,width:2.2,height:2.86});const size=256,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=0;i<rgba.length;i+=4)rgba.set([0,0,0,ZONE.sourceSpace],i);
      renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:wrong-return-and-the-catch',look:{roomMemoryActive:true,blueprint:true,chroma:.78,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});renderer.r3dSetLookProfile?.('explore',{transitionMs:0});updateLighting();renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(reason=>{releaseRange?.();releaseRange=null;error=String(reason?.message||reason);throw reason;});return loading;
  }
  function render(state){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){
      // ready() freezes the local body while this catalogue is repaired. Keep
      // its last presented raster instead of flashing a loading-black frame.
      if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});return true;
    }
    const viewport=getViewport?.();last=sourceContinuationRenderFrame(state,{anchor,viewportAspect:viewport?.width&&viewport?.height?viewport.width/viewport.height:16/9,studyRotation,reducedMotion:!!getReducedMotion()});props.setSourceSurroundingsGate?.(last.surroundings.gate);renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    if(last.falling||lastFalling||last.authoredCamera)renderer.r3dSnapCameraOnNextFrame?.();lastFalling=last.falling;
    updateLighting();const heldTorch=getTorch?.();torchFrame={on:!!heldTorch?.on,look:{...(heldTorch?.look||{})}};
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredPropRange:SOURCE_CONTINUATION_ARCHITECTURE.far,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:torchFrame.on?1:0,torchLook:torchFrame.look,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false,...(last.authoredCamera?{authoredCamera:last.authoredCamera}:{})})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{initialize,render,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,restoringScenery:!!repair,error,lighting:{...lightingFrame},meshCount:customNames.length,triangles:meshTriangles,frame:last?{phase:last.phase,eye:[...last.eye],pitch:last.pitch,yaw:last.yaw,cameraAimTarget:last.cameraAimTarget,strictOverhead:last.strictOverhead,studyRotation:last.studyRotation,revealProgress:last.revealProgress,recovery:last.recovery,activeLevel:last.activeLevel,shownLevels:last.shownLevels,hiddenAbove:last.hiddenAbove,counts:last.counts,architecture:last.architecture,surroundings:last.surroundings,torch:torchFrame,lighting:{...lightingFrame}}:null})};
}
