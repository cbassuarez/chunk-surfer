// A temporary owner of the game's prop/depth/acquisition renderer. The
// controller's finite support and solids are the render model, in metres.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_CONTINUATION,continuationSurfaces,continuationSolids,continuationDoors,continuationProps,continuationSupportAt} from '../data/source-continuation.js';
import {sourceContinuationFrame} from '../game/source-continuation.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {sourcePrintUV,uploadPhysicalPrint,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {sourceBlueprintMaps,sourceBlueprintMaterial,sourceBlueprintLighting} from './source-blueprint-print.js';

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
const paint={source:[.62,.66,.59],concrete:[.52,.55,.50],stone:[.56,.59,.53],wood:[.37,.31,.23],'cold-stone':[.63,.66,.58],'cold-wall':[.60,.64,.57],'case-lining':[.27,.34,.31],'piano-wood':[.43,.34,.23],'dark-metal':[.18,.23,.22],metal:[.27,.31,.30],steel:[.29,.34,.33],'edge-steel':[.028,.036,.034],'next-edge-steel':[.11,.15,.14],'worn-metal':[.52,.43,.25],'linen':[.55,.53,.41],'lip-paint':[.42,.34,.12],dark:[.07,.09,.08],refuge:[.53,.42,.24],warning:[.65,.47,.16]};
const isMetal=material=>/metal|steel|iron/.test(material||'');
const isSource=material=>!isMetal(material)&&!['wood','piano-wood','case-lining','linen','lip-paint','dark','refuge','warning'].includes(material);

function boundsOf(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<points.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],points[i]);max[axis]=Math.max(max[axis],points[i]);}return{min,max,center:min.map((v,i)=>(v+max[i])/2)};}
function indexedBox(points){return{p:points.flat(),i:boxFaces.flatMap(([a,b,c,d])=>[a,c,b,a,d,c])};}
function solidGeometry(s){return indexedBox([[s.minX,s.minY,s.minZ],[s.maxX,s.minY,s.minZ],[s.maxX,s.minY,s.maxZ],[s.minX,s.minY,s.maxZ],[s.minX,s.maxY,s.minZ],[s.maxX,s.maxY,s.minZ],[s.maxX,s.maxY,s.maxZ],[s.minX,s.maxY,s.maxZ]]);}
function surfaceGeometry(s){
  const bottom=finite(s.thickness,.22),low=s.kind==='ramp'?finite(s.y0,s.y):finite(s.y),high=s.kind==='ramp'?finite(s.y1,s.y):finite(s.y);
  return indexedBox([[s.minX,low-bottom,s.minZ],[s.maxX,low-bottom,s.minZ],[s.maxX,high-bottom,s.maxZ],[s.minX,high-bottom,s.maxZ],[s.minX,low,s.minZ],[s.maxX,low,s.minZ],[s.maxX,high,s.maxZ],[s.minX,high,s.maxZ]]);
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
};

export function sourceContinuationGeometry(state={phase:'wrong-return'}){
  const phase=phaseOf(state),geometry=[];
  for(const surface of continuationSurfaces(state))geometry.push({id:surface.id,name:name(phase,'surface',surface.id),kind:'surface',material:surface.material||'source',role:surface.role,level:surface.level,descriptor:surface,...surfaceGeometry(surface)});
  for(const solid of continuationSolids(state))if(solid.role!=='furniture')geometry.push({id:solid.id,name:name(phase,'solid',solid.id),kind:'solid',material:solid.material||'source',role:solid.role,level:solid.level,descriptor:solid,...solidGeometry(solid)});
  return geometry;
}
function allGeometry(){const rows=[...sourceContinuationGeometry({phase:'wrong-return'}),...sourceContinuationGeometry({phase:'wrong-return',closure:{mode:'closing',frontZ:0}}),...sourceContinuationGeometry({phase:'catch'}),...sourceContinuationEdgeGeometry()];return[...new Map(rows.map(row=>[row.name,row])).values(),...Object.entries(canonical).map(([id,g])=>({id,name:PREFIX+id,kind:'detail',...g}))];}
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
  const pieces=meshLibrary,missing=pieces.filter(piece=>!pack.catalog.has(piece.name));if(!missing.length)return pieces.map(p=>p.name);
  const printed=maps||sourceBlueprintMaps(gl);
  for(const piece of missing){
    const data=sourceContinuationMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    const source=isSource(piece.material),base=paint[piece.material]||paint.source,localBounds={min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])};
    const edge=/edge-steel/.test(piece.material);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sourceContinuation:true,bounds:localBounds,triangles:data.triangles},primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,base:[...base,1],emissive:[0,0,0],texture:source?printed.texture:finishTexture(gl,piece.material),normalTexture:source?printed.normalTexture:null,ormTexture:source?printed.ormTexture:null,letteringFinish:source?printed.letteringFinish:null,materialFactors:'gltf',metallic:source?1:edge?.22:isMetal(piece.material)?.72:0,roughness:source?1:edge?.91:isMetal(piece.material)?.58:.91,aoStrength:0,portrait:false,alphaCut:0,materialName:`continuation ${piece.material}`,materialRole:'source-continuation',printedSurface:source?SOURCE_PRINT_SURFACE:null,...(source?sourceBlueprintMaterial(printed,{base:[...base,1]}):{})}]});
  }
  gl.bindVertexArray(null);return pieces.map(p=>p.name);
}

const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const hoist=SOURCE_CONTINUATION.catch.hoist;
const retained=['instrument_case','grand_piano','ending_body_standing'];
const retainedDoor=[goods.frameMesh,goods.leafMesh,goods.freeStandingHeadMesh].filter(Boolean);
const propKindMesh={case:'instrument_case','case-hinge':'instrument_case',piano:'grand_piano',body:'ending_body_standing'};
const levelOf=row=>Number.isInteger(row.level)?row.level:Number.isInteger(row.descriptor?.level)?row.descriptor.level:null;
const assetPreparations=new WeakMap();

// The original Source can prepare this bounded catalog while it still owns
// the view. Preparing assets never borrows a plan, light, camera or prop list.
export function prewarmSourceContinuationAssets({renderer=R3,props=P3,resolveAsset=assetUrl,installMeshes=installSourceContinuationMeshes}={}){
  const pending=assetPreparations.get(props);if(pending)return pending;
  const preparing=(async()=>{
    const base=await renderer.r3dBasePropsReady?.();if(base===false)throw Error('The Source continuation base prop catalog could not be loaded.');
    if(typeof props.installAuthoredPropMeshes!=='function')throw Error('The Source continuation mesh installer is unavailable.');
    const installed=props.installAuthoredPropMeshes(installMeshes);if(installed===false)throw Error('The Source continuation prop context is unavailable.');
    const catalog=new Set(props.propMeshCatalog?.()||[]);if(retainedDoor.some(mesh=>!catalog.has(mesh)))await props.addPropPack(resolveAsset('assets/conservatory-doors.glb'));
    const ready=new Set(props.propMeshCatalog?.()||[]),missing=[...meshLibrary.map(p=>p.name),...retained,...retainedDoor].filter(mesh=>!ready.has(mesh));
    if(missing.length)throw Error('Source continuation meshes missing: '+missing.join(', '));return true;
  })();
  assetPreparations.set(props,preparing);preparing.then(()=>{if(assetPreparations.get(props)===preparing)assetPreparations.delete(props);},()=>{if(assetPreparations.get(props)===preparing)assetPreparations.delete(props);});return preparing;
}

export function sourceContinuationCamera(frame,{viewportAspect=16/9}={}){
  const player=frame.player||frame,feet=finite(player.y,player.feet),catchMode=phaseOf(frame)==='catch',eye=[...(frame.camera?.eye||[finite(player.x),feet+EYE,finite(player.z)])];
  if(!catchMode)return{eye,yaw:finite(player.yaw),pitch:finite(player.pitch),strictOverhead:false,revealProgress:null};
  const aspect=clamp(viewportAspect,.35,3.5),clearance=Math.max((Math.abs(player.x-eye[0])+.8)/(.95*aspect)+1.9,(Math.abs(player.z-eye[2])+.8)/.95+1.9);eye[1]=Math.max(eye[1],feet+clearance);
  const reveal=frame.reveal,p=reveal?clamp(reveal.elapsed/Math.max(.01,finite(reveal.duration,1.2)),0,1):1;
  if(p>=1||!reveal?.from)return{eye,yaw:0,pitch:-Math.PI/2,aimTarget:[eye[0],feet,eye[2]],strictOverhead:true,revealProgress:reveal?1:null};
  const from=reveal.from,start=[finite(from.x,player.x),finite(from.feet,feet)+SOURCE_CONTINUATION.eyeHeight,finite(from.z,player.z)],rise=smooth(p/.52),slide=smooth((p-.18)/.82),turn=smooth(p/.90);
  const craneEye=[mix(start[0],eye[0],slide),mix(start[1],eye[1],rise),mix(start[2],eye[2],slide)],aimTarget=[mix(finite(player.x),eye[0],slide),mix(feet+.85,feet,slide),mix(finite(player.z),eye[2],slide)],dx=aimTarget[0]-craneEye[0],dy=aimTarget[1]-craneEye[1],dz=aimTarget[2]-craneEye[2],horizontal=Math.hypot(dx,dz);
  // Acquire the bodily/floor anchor before the eye has risen far. Interpolating
  // pitch across the whole crane leaves the bridge below a blank sky midpoint.
  // A directly downward target leaves yaw free to settle smoothly to north.
  const trackedPitch=Math.atan2(dy,horizontal),authoredYaw=finite(from.yaw)+angle(-finite(from.yaw))*turn,trackedYaw=horizontal>1e-5?Math.atan2(dx,-dz):authoredYaw,gaze=smooth(p/.12);
  return{eye:craneEye,yaw:finite(from.yaw)+angle(trackedYaw-finite(from.yaw))*gaze,pitch:mix(finite(from.pitch),trackedPitch,gaze),aimTarget,strictOverhead:false,revealProgress:p};
}

export function sourceContinuationRenderFrame(state,{anchor={x:0,y:0,z:0},viewportAspect=16/9,studyRotation=0}={}){
  const frame=sourceContinuationFrame(state),phase=phaseOf(frame),player=frame.player||state.player||state,geometry=frame.geometry||{},surfaces=geometry.surfaces||continuationSurfaces(state),solids=geometry.solids||continuationSolids(state),doors=geometry.doors||continuationDoors(state),memoryProps=geometry.props||continuationProps(state);
  const floor=finite(player.y),catchMode=phase==='catch',props=[],lights=[],hiddenAbove=[],shownLevels=new Set(),origin={x:finite(anchor.x),y:finite(anchor.y),z:finite(anchor.z)},camera=sourceContinuationCamera(frame,{viewportAspect}),focus=frame.focus;
  const put=(id,mesh,x,y,z,yaw=0,sx=1,sy=1,sz=1,extra={})=>{const p=positioned(PREFIX+id,mesh,matrix(origin.x+x,origin.y+y,origin.z+z,yaw,sx,sy,sz),extra);props.push(p);return p;};
  const activeLevel=catchMode?surfaces.filter(s=>Number.isInteger(s.level)&&finite(s.y)<=floor+.45).sort((a,b)=>finite(b.y)-finite(a.y))[0]?.level:undefined;
  const visible=row=>{if(!catchMode)return true;const level=levelOf(row);if(level!=null&&Number.isInteger(activeLevel)&&level<activeLevel){hiddenAbove.push(row.id);return false;}const top=finite(row.y1,row.y??row.maxY);if(row.kind!=='solid'&&row.role!=='shaft-wall'&&top>floor+.48){hiddenAbove.push(row.id);return false;}return true;};
  for(const[kind,rows]of[['surface',surfaces],['solid',solids]])for(const row of rows){
    if(row.role==='furniture'||!visible({...row,kind}))continue;const geom=kind==='surface'?surfaceGeometry(row):solidGeometry(row),bounds=boundsOf(geom.p),center=bounds.center;
    put(`${phase}-${kind}-${row.id}`,name(phase,kind,row.id),...center,0,1,1,1,{continuation:true,physicalKind:kind,descriptorId:row.id,level:row.level,role:row.role,physicalBounds:{min:[row.minX,kind==='surface'?Math.min(finite(row.y0,row.y),finite(row.y1,row.y))-finite(row.thickness,.22):row.minY,row.minZ],max:[row.maxX,kind==='surface'?Math.max(finite(row.y0,row.y),finite(row.y1,row.y)):row.maxY,row.maxZ]},cullRadius:Math.hypot((row.maxX-row.minX)/2,(row.maxZ-row.minZ)/2)});
    if(Number.isInteger(row.level))shownLevels.add(row.level);
    // Exposed slab edges carry narrow steel bearings underneath the deck.
    // They cannot cover the gap or add an obstacle on the walking surface.
    if(!catchMode&&kind==='surface'&&(row.maxX-row.minX)>1&&(row.maxZ-row.minZ)>1){const y=Math.min(finite(row.y0,row.y),finite(row.y1,row.y))-.25;
      put(`bearing-${phase}-${row.id}`,PREFIX+'block',(row.minX+row.maxX)/2,y,row.minZ+.06,0,row.maxX-row.minX,.10,.10,{decorative:true,level:row.level});}
  }
  if(catchMode)for(const piece of rimLibrary){
    const current=piece.elevation>=floor-.45;
    if(piece.level<activeLevel||piece.elevation>floor+.48||piece.material!==(current?'edge-steel':'next-edge-steel'))continue;
    put(piece.id,piece.name,...piece.center,0,1,1,1,{catchRim:true,level:piece.level,elevation:piece.elevation,currentFootprint:current,undersideDepth:.265});
  }
  if(catchMode&&floor>=SOURCE_CONTINUATION.catch.top-.45)for(const piece of sourceContinuationGeometry({...frame,phase:'wrong-return'})){
    put('backdrop-'+piece.id,piece.name,...boundsOf(piece.p).center,0,1,1,1,{priorRoom:true,studyFixed:true});
  }
  for(const door of doors){
    if(!visible(door))continue;const width=finite(door.width,1.8),height=finite(door.height,2.3),base=matrix(origin.x+door.x,origin.y+door.y,origin.z+door.z,finite(door.yaw),width/goods.opening.width,height/goods.opening.height,1),fraction=clamp(door.openFraction??door.fraction??(door.open??state.doorOpen?.[door.id]?1:0),0,1);
    props.push(positioned(PREFIX+'door-'+door.id,goods.frameMesh,base,{continuation:true,doorId:door.id,role:door.role,level:door.level}));
    if(goods.freeStandingHeadMesh)props.push(positioned(PREFIX+'door-head-'+door.id,goods.freeStandingHeadMesh,base,{doorId:door.id}));
    const focused=focus?.id===door.id,reach=focused?clamp(1-Math.hypot(player.x-door.x,player.z-door.z)/1.9,0,1):0,hardware=!catchMode||door.level===activeLevel;
    for(let k=0;k<goods.leafCount;k++){
      const leaf=multiply(base,doorLeafLocalMatrix(goods,k,fraction));props.push(positioned(`${PREFIX}door-${door.id}-leaf-${k}`,goods.leafMesh,leaf,{continuation:true,doorId:door.id,level:door.level}));
      if(hardware){props.push(positioned(`${PREFIX}door-wear-${door.id}-${k}`,PREFIX+'door-wear',leaf,{doorWear:true,doorId:door.id,level:door.level}));
        const grip=multiply(multiply(multiply(leaf,matrix(1.22,1.435,0)),rotateZ(-reach*.12*(1-fraction))),matrix(-1.22,-1.435,0));props.push(positioned(`${PREFIX}door-handle-${door.id}-${k}`,PREFIX+'door-handle',grip,{doorHandle:true,doorId:door.id,focused,reach,level:door.level}));}
    }
    const refuge=/return|refuge|entrance|entry/.test(door.role||door.id),lampY=door.y+Math.min(height+.18,2.45),colour=refuge?[.91,.66,.35]:[.55,.72,.76];
    const side=catchMode&&door.role==='return'||door.role==='false-return'?-1:1,nx=-Math.sin(finite(door.yaw))*side,nz=Math.cos(finite(door.yaw))*side,lampX=door.x+nx*.85,lampZ=door.z+nz*.85;
    put('door-lamp-'+door.id,PREFIX+'door-lamp-fixture',door.x,lampY,door.z,finite(door.yaw)+(side<0?Math.PI:0),1,1,1,{practical:true,doorId:door.id,level:door.level});
    lights.push({id:PREFIX+'door-light-'+door.id,x:origin.x+lampX,y:origin.y+lampY-.3,z:origin.z+lampZ,radius:refuge?5:6.5,intensity:(refuge?2.3:2.0)+reach*1.1,color:colour,penetration:1,focusPractical:focused});
    put('door-foot-'+door.id,PREFIX+'warning',door.x,door.y+.006,door.z,finite(door.yaw),width+.16,1,.26,{threshold:true,doorId:door.id,level:door.level});
  }
  for(const p of memoryProps){
    if(p.kind==='release-lip'){
      if(!visible(p))continue;const yaw=Math.atan2(finite(p.dx),-finite(p.dz)),x=finite(p.x),y=finite(p.y),z=finite(p.z);
      put('lip-tread-'+p.id,PREFIX+'lip-tread',x,y,z,yaw,1,1,1,{releaseTread:true,level:p.level,lipId:p.id,dropDirection:[p.dx,p.dz]});
      put('lip-paint-'+p.id,PREFIX+'lip-paint',x,y,z,yaw,1,1,1,{releasePaint:true,level:p.level,lipId:p.id});
      const rx=x+finite(p.dx)*.9,rz=z+finite(p.dz)*.9,receiver=continuationSupportAt(rx,rz,state,{maxY:y-.5,minY:y-SOURCE_CONTINUATION.catch.layerDrop*1.6});
      if(receiver){const r=receiver.surface,sx=Math.min(Math.abs(p.dx)>.5?.52:1.02,r.maxX-r.minX-.08),sz=Math.min(Math.abs(p.dz)>.5?.52:1.02,r.maxZ-r.minZ-.08);
        if(sx>.1&&sz>.1)put('lip-shadow-'+p.id,PREFIX+'shadow',clamp(rx,r.minX+sx/2+.02,r.maxX-sx/2-.02),receiver.y+.006,clamp(rz,r.minZ+sz/2+.02,r.maxZ-sz/2-.02),0,sx,1,sz,{landingShadow:true,receiverLevel:receiver.level,receiverId:r.id,lipId:p.id});}
      continue;
    }
    if(!visible(p))continue;let mesh=p.mesh||propKindMesh[p.kind];if(!mesh){if(/counterweight|weight/.test(p.kind))mesh=PREFIX+'counterweight';else if(/rope|cable|pin/.test(p.kind))mesh=PREFIX+'pin';else if(/shadow/.test(p.kind))mesh=PREFIX+'shadow';else if(p.kind==='release-lip')mesh=PREFIX+'warning';else mesh=PREFIX+'block';}
    const seam=p.kind==='seam',lip=p.kind==='release-lip';
    put('prop-'+p.id,mesh,finite(p.x),finite(p.y),finite(p.z),finite(p.yaw),finite(p.scaleX,p.scale??(seam?.026:lip?.55:1)),finite(p.scaleY,p.scale??(seam?1.1:1)),finite(p.scaleZ,p.scale??(seam?.09:lip?.16:1)),{continuation:true,decorative:true,role:p.role,level:p.level,kind:p.kind});
    if(seam){const yaw=p.role==='matching-clue'?-Math.PI/2:0;for(const[y,k]of[[.17,0],[.47,1],[.72,2]])put(`seam-nick-${p.id}-${k}`,PREFIX+'worn-block',p.x,p.y+y,p.z,yaw,.18,.032,.12,{matchingSeam:true,role:p.role});}
  }
  if(!catchMode&&['warning','closing'].includes(frame.closure?.mode)){
    const z=frame.closure.frontZ,bottom=frame.closure.mode==='warning'?5.4:3;put('closing-front-warning',PREFIX+'warning',5.15,3.008,z,0,7.7,1,.12,{closureWarning:true});
    if(frame.closure.mode==='warning'){
      // The announced front is visibly suspended clear of a standing head.
      // It occupies its real blocking height only when the controller arms it.
      const row=continuationSolids({...state,closure:{...frame.closure,mode:'closing'}}).find(s=>s.role==='closure');
      if(row){const b=boundsOf(solidGeometry(row).p);put('suspended-closing-front',name('wrong-return','solid',row.id),b.center[0],b.center[1]+2.4,b.center[2],0,1,1,1,{closureSuspended:true,warning:true});
        for(const[x,k]of[[row.minX+.2,0],[row.maxX-.2,1]])put('closing-front-cable-'+k,PREFIX+'pin',x,row.maxY+2.4,z,0,.04,2,.04,{closureCable:true});}
    }
    for(const[y,k]of[[bottom+.16,0],[bottom+2.9,1]])put('closing-front-bearing-'+k,PREFIX+'worn-block',5.15,y,z+.193,0,7.6,.075,.022,{closureBearing:true});
    for(const[x,k]of[[1.6,0],[8.7,1]]){put('closing-front-lamp-'+k,PREFIX+'door-lamp-fixture',x,bottom+2.5,z+.18,0,1,1,1,{practical:true,closurePractical:true});lights.push({id:PREFIX+'closing-front-light-'+k,x:origin.x+x,y:origin.y+bottom+2.2,z:origin.z+z+1.03,radius:7.5,intensity:2.8,color:[.88,.66,.38],penetration:1,closurePractical:true});}
  }
  // First person leaves the body with the viewer. The Catch is an actual
  // overhead camera over the same world, so its small clothed body is visible.
  if(catchMode){
    const atLip=focus?.type==='drop',bodyYaw=atLip?Math.atan2(finite(focus.dx),-finite(focus.dz)):finite(player.yaw),lean=atLip?-.065:frame.fall?-.045*(1-clamp(frame.fall.elapsed/.7,0,1)):0,bodyBase=matrix(origin.x+finite(player.x),origin.y+floor,origin.z+finite(player.z),bodyYaw,.85,1.10,.85),bodyMatrix=multiply(bodyBase,rotateX(lean)),bodyVisible=camera.eye[1]-floor>2.5;
    if(bodyVisible){props.push(positioned(PREFIX+'operator','ending_body_standing',bodyMatrix,{continuation:true,playerBody:true,level:activeLevel,bodyYaw,lean}));
      props.push(positioned(PREFIX+'operator-yoke',PREFIX+'operator-yoke',bodyMatrix,{playerGarment:true,level:activeLevel}));
      props.push(positioned(PREFIX+'operator-toes',PREFIX+'operator-toes',bodyBase,{playerToes:true,level:activeLevel,readyToDrop:atLip}));
      const kit=multiply(bodyBase,matrix(.22,.83,.08,0,.22/.85,.22/1.10,.22/.85));props.push(positioned(PREFIX+'operator-case','instrument_case',kit,{playerKit:true}));}
    if(frame.recovery?.kind==='sling'){
      put('operator-recovery-sling',PREFIX+'recovery-sling',player.x,floor,player.z,bodyYaw,1,1,1,{recoverySling:true});
      for(const[dx,k]of[[-.35,0],[.35,1]])put('operator-recovery-cable-'+k,PREFIX+'pin',player.x+Math.cos(bodyYaw)*dx,floor+.5,player.z+Math.sin(bodyYaw)*dx,0,.018,Math.max(.1,hoist.railY-floor-.5),.018,{recoveryCable:true});
    }
    const bodyReceiver=continuationSupportAt(player.x,player.z,state,{maxY:floor+.05,minY:-30});
    if(bodyReceiver)put('operator-contact',PREFIX+'shadow',finite(player.x),bodyReceiver.y+.008,finite(player.z),0,.65,1,.48,{contactShadow:true,receiverLevel:bodyReceiver.level});
    const ringBounds=surfaces.filter(s=>Number.isInteger(s.level)).reduce((b,s)=>({minX:Math.min(b.minX,s.minX),maxX:Math.max(b.maxX,s.maxX),minZ:Math.min(b.minZ,s.minZ),maxZ:Math.max(b.maxZ,s.maxZ)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
    const bottom=Math.min(...surfaces.map(s=>finite(s.y)))-.4;
    if(Number.isFinite(ringBounds.minX))for(const[x,z,k]of[[ringBounds.minX-.12,ringBounds.minZ-.12,0],[ringBounds.maxX+.12,ringBounds.minZ-.12,1],[ringBounds.minX-.12,ringBounds.maxZ+.12,2],[ringBounds.maxX+.12,ringBounds.maxZ+.12,3]]){
      put('shaft-column-'+k,PREFIX+'block',x,bottom,z,0,.24,Math.max(.5,floor+1.5-bottom),.24,{shaftDepth:true});
    }
    const weight=frame.counterweight;if(weight){
      const radius=SOURCE_CONTINUATION.catch.counterweightRadius,top=weight.y+1.4,repeating=['returning','rewinding','hoisting','traversing','lowering-warning','lowering'].includes(weight.mode),visibleWeight=weight.y<=floor+SOURCE_CONTINUATION.catch.layerDrop+.5||repeating&&top<camera.eye[1]-.5;
      if(visibleWeight){
        put('counterweight',PREFIX+'counterweight',weight.x,weight.y,weight.z,0,radius*2,1.4,radius*2,{counterweight:true,mode:weight.mode,level:weight.level,collisionRadius:radius});
        for(const[y,k]of[[.12,0],[.67,1],[1.26,2]])put('counterweight-hoop-'+k,PREFIX+'counterweight',weight.x,weight.y+y,weight.z,0,radius*2+.02,.075,radius*2+.02,{counterweightHoop:true});
        for(let k=0;k<8;k++){const a=k/8*Math.PI*2;put('counterweight-rivet-'+k,PREFIX+'pin',weight.x+Math.cos(a)*(radius-.025),top+.006,weight.z+Math.sin(a)*(radius-.025),0,.045,.045,.045,{counterweightRivet:true});}
        const cableTop=Math.max(top+.4,hoist.railY);put('counterweight-cable',PREFIX+'pin',weight.x,top,weight.z,0,.035,cableTop-top,.035,{counterweightCable:true});
      }
      if(repeating){
        put('hoist-rail-x',PREFIX+'block',(hoist.shaft.x+hoist.start.x)/2,hoist.railY,hoist.shaft.z,0,Math.abs(hoist.shaft.x-hoist.start.x)+.15,.075,.075,{hoistRail:true});
        put('hoist-rail-z',PREFIX+'block',hoist.start.x,hoist.railY,(hoist.shaft.z+hoist.start.z)/2,0,.075,.075,Math.abs(hoist.shaft.z-hoist.start.z)+.15,{hoistRail:true});
        if(['hoisting','traversing','lowering-warning','lowering'].includes(weight.mode))put('hoist-trolley',PREFIX+'worn-block',weight.x,hoist.railY-.14,weight.z,0,.24,.14,.24,{hoistTrolley:true});
      }
      // The actual weight casts a dark contact at its support. A second broad
      // return on the occupied shelf announces its approach from above.
      if(weight.y>=floor-.2){const receiver=continuationSupportAt(weight.x,weight.z,state,{maxY:floor+.05,minY:-30});if(receiver)put('counterweight-shadow',PREFIX+'shadow',weight.x,receiver.y+.012,weight.z,0,radius*2+.25,1,radius*2+.25,{threatShadow:true,mode:weight.mode,receiverLevel:receiver.level});
        if(weight.active&&weight.mode==='warning')put('counterweight-warning',PREFIX+'warning',weight.x,weight.y+.008,weight.z,0,radius*2+.38,1,radius*2+.38,{counterweightWarning:true});}
      if(weight.active&&weight.mode==='lowering-warning'){const receiver=continuationSupportAt(weight.x,weight.z,{phase:'catch',feet:SOURCE_CONTINUATION.catch.top},{maxY:SOURCE_CONTINUATION.catch.top+.05,minY:SOURCE_CONTINUATION.catch.top-.05});
        if(receiver)put('lowering-footprint-warning',PREFIX+'warning',weight.x,receiver.y+.008,weight.z,0,radius*2+.38,1,radius*2+.38,{counterweightWarning:true,loweringWarning:true,receiverLevel:receiver.level});}
      if(!repeating){const lampX=weight.x+1.3,lampZ=weight.z-.65;put('counterweight-lamp',PREFIX+'lamp',lampX,weight.y+2.1,lampZ,0,1,1,1,{practical:true,counterweightPractical:true});lights.push({id:PREFIX+'counterweight-light',x:origin.x+lampX,y:origin.y+weight.y+2,z:origin.z+lampZ,radius:6,intensity:weight.active?2.1:.7,color:[.88,.59,.24],penetration:1});}
      else lights.push({id:PREFIX+'hoist-light',x:origin.x+hoist.start.x,y:origin.y+hoist.railY-.7,z:origin.z+hoist.start.z,radius:9,intensity:1.8,color:[.78,.66,.43],penetration:1});
    }
    for(const[dx,dz,k]of[[-5,-5,0],[5,5,1],[-5,5,2]])lights.push({id:PREFIX+'shaft-light-'+k,x:origin.x-23+dx,y:origin.y+floor+3.8,z:origin.z+dz,radius:18,intensity:k===0?2.4:1.7,color:k===0?[.63,.73,.72]:[.44,.58,.64],penetration:1});
  }else{
    for(const[x,z,k]of[[-9,1,0],[8,-11,1],[-3,-20,2]]){put('wrong-return-lamp-'+k,PREFIX+'lamp',x,3.9,z,0,1.2,1,1,{practical:true});lights.push({id:PREFIX+'wrong-return-light-'+k,x:origin.x+x,y:origin.y+3.8,z:origin.z+z,radius:14,intensity:k===0?1.8:1.4,color:k===0?[.79,.67,.45]:[.52,.67,.70],penetration:1});}
  }
  let worldEye=camera.eye.map((v,k)=>finite(v)+[origin.x,origin.y,origin.z][k]),cameraAimTarget=camera.aimTarget?.map((v,k)=>finite(v)+[origin.x,origin.y,origin.z][k])||null;const rotation=catchMode?angle(finite(studyRotation)):0;
  if(Math.abs(rotation)>1e-8){const cx=origin.x+SOURCE_CONTINUATION.catch.center.x,cz=origin.z+SOURCE_CONTINUATION.catch.center.z,rigid=multiply(matrix(cx,0,cz,rotation),matrix(-cx,0,-cz));
    for(const p of props){if(p.studyFixed)continue;p.matrix=multiply(rigid,p.matrix);p.x=p.matrix[12];p.y=p.matrix[13];p.z=p.matrix[14];
      if(p.dropDirection){const d=transform(rigid,[p.dropDirection[0],0,p.dropDirection[1]]);p.dropDirection=[d[0]-rigid[12],d[2]-rigid[14]];}if(Number.isFinite(p.bodyYaw))p.bodyYaw=angle(p.bodyYaw+rotation);
      if(p.physicalBounds){const b=p.physicalBounds,points=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])points.push(...transform(rigid,[x+origin.x,y+origin.y,z+origin.z]));const bounds=boundsOf(points);p.physicalBounds={min:bounds.min,max:bounds.max};}}
    for(const light of lights){const p=transform(rigid,[light.x,light.y,light.z]);[light.x,light.y,light.z]=p;}worldEye=transform(rigid,worldEye);if(cameraAimTarget)cameraAimTarget=transform(rigid,cameraAimTarget);
  }
  const nearest=l=>(l.x-worldEye[0])**2+(l.y-worldEye[1])**2+(l.z-worldEye[2])**2;
  return{phase,props,lights:lights.sort((a,b)=>Number(!!b.focusPractical)-Number(!!a.focusPractical)||nearest(a)-nearest(b)).slice(0,8),eye:worldEye,yaw:camera.yaw,pitch:camera.pitch,cameraAimTarget,authoredCamera:{eye:worldEye,yaw:camera.yaw,pitch:camera.pitch},strictOverhead:camera.strictOverhead,studyRotation:rotation,revealProgress:camera.revealProgress,recovery:frame.recovery?{kind:frame.recovery.kind,elapsed:frame.recovery.elapsed,duration:frame.recovery.duration}:null,floorH:floor+origin.y,falling:!!frame.fall,activeLevel,shownLevels:[...shownLevels].sort((a,b)=>a-b),hiddenAbove,geometry:{surfaces,solids,doors},counts:{surfaces:props.filter(p=>p.physicalKind==='surface').length,solids:props.filter(p=>p.physicalKind==='solid').length,props:props.length,lights:Math.min(8,lights.length),body:props.filter(p=>p.playerBody).length},source:frame};
}

export function createSourceContinuationRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},anchor={x:0,y:0,z:0},installMeshes=installSourceContinuationMeshes,getViewport=()=>renderer.r3dViewCamera?.(),studyRotation=0}={}){
  let initialized=false,released=false,loading=null,repair=null,error=null,last=null,lastFalling=false;
  const customNames=meshLibrary.map(p=>p.name),required=[...customNames,...retained,...retainedDoor];
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){
    renderer.r3dSetHorizon?.(null);renderer.r3dSetSourceShore?.(null);renderer.r3dSetSourceEmergency?.(0);renderer.r3dSetSourceWhiteout?.(0);renderer.r3dSetSourceFault?.(0);renderer.r3dSetLocalLights?.([]);renderer.r3dSetEmergencyShadows?.([]);renderer.r3dSetSourcePortals?.([]);renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetSourceOpenings?.([]);renderer.r3dSetSourceDoorLights?.([]);renderer.r3dSetSourceCrossing?.(null);renderer.r3dSetSourceReflection?.(null);renderer.r3dSetIndoorRain?.(0);renderer.r3dSetSourceTextInstances?.([]);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetProps?.([]);props.setPressureInstances?.([]);
  }
  async function install(){
    if(released)return false;await prewarmSourceContinuationAssets({renderer,props,resolveAsset,installMeshes});return!released;
  }
  function initialize(){
    if(loading)return loading;loading=(async()=>{
      if(released)return false;
      if(!await install()||released)return false;clearSource();const size=256,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=0;i<rgba.length;i+=4)rgba.set([0,0,0,ZONE.sourceSpace],i);
      renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:wrong-return-and-the-catch',look:{roomMemoryActive:true,blueprint:true,chroma:.78,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSetLightingContext?.(sourceBlueprintLighting({ambientColor:[.57,.65,.62],ambientIntensity:.073,captureExposure:4.4,whitePointScale:1,screen:'stochastic'}));renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(reason=>{error=String(reason?.message||reason);throw reason;});return loading;
  }
  function render(state){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){
      // ready() freezes the local body while this catalogue is repaired. Keep
      // its last presented raster instead of flashing a loading-black frame.
      if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});return true;
    }
    const viewport=getViewport?.();last=sourceContinuationRenderFrame(state,{anchor,viewportAspect:viewport?.width&&viewport?.height?viewport.width/viewport.height:16/9,studyRotation});renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    if(last.falling||lastFalling||last.authoredCamera)renderer.r3dSnapCameraOnNextFrame?.();lastFalling=last.falling;
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false,...(last.authoredCamera?{authoredCamera:last.authoredCamera}:{})})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();onRelease();return true;}
  return{initialize,render,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,restoringScenery:!!repair,error,meshCount:customNames.length,triangles:meshTriangles,frame:last?{phase:last.phase,eye:[...last.eye],pitch:last.pitch,yaw:last.yaw,cameraAimTarget:last.cameraAimTarget,strictOverhead:last.strictOverhead,studyRotation:last.studyRotation,revealProgress:last.revealProgress,recovery:last.recovery,activeLevel:last.activeLevel,shownLevels:last.shownLevels,hiddenAbove:last.hiddenAbove,counts:last.counts}:null})};
}
