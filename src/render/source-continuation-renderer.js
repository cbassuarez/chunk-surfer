// A temporary owner of the game's prop/depth/acquisition renderer. The
// controller's finite support and solids are the render model, in metres.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_CONTINUATION,continuationSurfaces,continuationSolids,continuationDoors,continuationProps,continuationSupportAt} from '../data/source-continuation.js';
import {sourceContinuationFrame} from '../game/source-continuation.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {sourcePrintMaps,sourcePrintUV,uploadPhysicalPrint,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';

const PREFIX='source-continuation-';
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,finite(n)));
const phaseOf=state=>state?.phase==='catch'?'catch':'wrong-return';
const matrix=(x,y,z,yaw=0,sx=1,sy=1,sz=1)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]);};
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const positioned=(id,mesh,m,extra={})=>({id,mesh,x:m[12],y:m[13],z:m[14],matrix:m,zone:ZONE.sourceSpace,structural:true,...extra});
const name=(phase,kind,id)=>`${PREFIX}${phase}-${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
const boxFaces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
const paint={source:[.62,.66,.59],concrete:[.52,.55,.50],stone:[.56,.59,.53],wood:[.37,.31,.23],'cold-stone':[.63,.66,.58],'cold-wall':[.60,.64,.57],'case-lining':[.27,.34,.31],'piano-wood':[.43,.34,.23],'dark-metal':[.18,.23,.22],metal:[.27,.31,.30],steel:[.29,.34,.33],dark:[.07,.09,.08],refuge:[.53,.42,.24],warning:[.65,.47,.16]};
const isMetal=material=>/metal|steel|iron/.test(material||'');
const isSource=material=>!isMetal(material)&&!['wood','piano-wood','case-lining','dark','refuge','warning'].includes(material);

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
const canonical={
  block:{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:1,minZ:-.5,maxZ:.5}),material:'metal'},
  counterweight:{...cylinderGeometry(32),material:'metal'},
  pin:{...cylinderGeometry(12),material:'steel'},
  lamp:{...solidGeometry({minX:-.12,maxX:.12,minY:-.08,maxY:.08,minZ:-.10,maxZ:.10}),material:'refuge'},
  shadow:{...cylinderGeometry(32,{disc:true}),material:'dark'},
  warning:{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:.012,minZ:-.5,maxZ:.5}),material:'warning'},
};

export function sourceContinuationGeometry(state={phase:'wrong-return'}){
  const phase=phaseOf(state),geometry=[];
  for(const surface of continuationSurfaces(state))geometry.push({id:surface.id,name:name(phase,'surface',surface.id),kind:'surface',material:surface.material||'source',role:surface.role,level:surface.level,descriptor:surface,...surfaceGeometry(surface)});
  for(const solid of continuationSolids(state))if(solid.role!=='furniture')geometry.push({id:solid.id,name:name(phase,'solid',solid.id),kind:'solid',material:solid.material||'source',role:solid.role,level:solid.level,descriptor:solid,...solidGeometry(solid)});
  return geometry;
}
function allGeometry(){const rows=[...sourceContinuationGeometry({phase:'wrong-return'}),...sourceContinuationGeometry({phase:'wrong-return',closure:{mode:'closing',frontZ:0}}),...sourceContinuationGeometry({phase:'catch'})];return[...new Map(rows.map(row=>[row.name,row])).values(),...Object.entries(canonical).map(([id,g])=>({id,name:PREFIX+id,kind:'detail',...g}))];}
const meshLibrary=allGeometry(),meshTriangles=meshLibrary.reduce((n,p)=>n+p.i.length/3,0);
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
  const printed=maps||sourcePrintMaps(gl,'divide');
  for(const piece of missing){
    const data=sourceContinuationMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    const source=isSource(piece.material),base=paint[piece.material]||paint.source,localBounds={min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])};
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sourceContinuation:true,bounds:localBounds,triangles:data.triangles},primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,base:[...base,1],emissive:[0,0,0],texture:source?printed.texture:finishTexture(gl,piece.material),normalTexture:source?printed.normalTexture:null,ormTexture:source?printed.ormTexture:null,letteringFinish:source?printed.letteringFinish:null,materialFactors:'gltf',metallic:source?1:isMetal(piece.material)?.72:0,roughness:source?1:isMetal(piece.material)?.58:.91,aoStrength:0,portrait:false,alphaCut:0,materialName:`continuation ${piece.material}`,materialRole:'source-continuation',printedSurface:source?SOURCE_PRINT_SURFACE:null}]});
  }
  gl.bindVertexArray(null);return pieces.map(p=>p.name);
}

const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const retained=['instrument_case','grand_piano','ending_body_standing'];
const retainedDoor=[goods.frameMesh,goods.leafMesh,goods.freeStandingHeadMesh].filter(Boolean);
const propKindMesh={case:'instrument_case','case-hinge':'instrument_case',piano:'grand_piano',body:'ending_body_standing'};
const levelOf=row=>Number.isInteger(row.level)?row.level:Number.isInteger(row.descriptor?.level)?row.descriptor.level:null;

export function sourceContinuationRenderFrame(state,{anchor={x:0,y:0,z:0},viewportAspect=16/9}={}){
  const frame=sourceContinuationFrame(state),phase=phaseOf(frame),player=frame.player||state.player||state,geometry=frame.geometry||{},surfaces=geometry.surfaces||continuationSurfaces(state),solids=geometry.solids||continuationSolids(state),doors=geometry.doors||continuationDoors(state),memoryProps=geometry.props||continuationProps(state);
  const floor=finite(player.y),catchMode=phase==='catch',props=[],lights=[],hiddenAbove=[],shownLevels=new Set(),origin={x:finite(anchor.x),y:finite(anchor.y),z:finite(anchor.z)};
  const put=(id,mesh,x,y,z,yaw=0,sx=1,sy=1,sz=1,extra={})=>{const p=positioned(PREFIX+id,mesh,matrix(origin.x+x,origin.y+y,origin.z+z,yaw,sx,sy,sz),extra);props.push(p);return p;};
  const activeLevel=catchMode?surfaces.filter(s=>Number.isInteger(s.level)&&finite(s.y)<=floor+.45).sort((a,b)=>finite(b.y)-finite(a.y))[0]?.level:undefined;
  const visible=row=>{if(!catchMode)return true;const level=levelOf(row);if(level!=null&&Number.isInteger(activeLevel)&&level<activeLevel){hiddenAbove.push(row.id);return false;}const top=finite(row.y1,row.y??row.maxY);if(row.kind!=='solid'&&row.role!=='shaft-wall'&&top>floor+.48){hiddenAbove.push(row.id);return false;}return true;};
  for(const[kind,rows]of[['surface',surfaces],['solid',solids]])for(const row of rows){
    if(row.role==='furniture'||!visible({...row,kind}))continue;const geom=kind==='surface'?surfaceGeometry(row):solidGeometry(row),bounds=boundsOf(geom.p),center=bounds.center;
    put(`${phase}-${kind}-${row.id}`,name(phase,kind,row.id),...center,0,1,1,1,{continuation:true,physicalKind:kind,descriptorId:row.id,level:row.level,role:row.role,physicalBounds:{min:[row.minX,kind==='surface'?Math.min(finite(row.y0,row.y),finite(row.y1,row.y))-finite(row.thickness,.22):row.minY,row.minZ],max:[row.maxX,kind==='surface'?Math.max(finite(row.y0,row.y),finite(row.y1,row.y)):row.maxY,row.maxZ]},cullRadius:Math.hypot((row.maxX-row.minX)/2,(row.maxZ-row.minZ)/2)});
    if(Number.isInteger(row.level))shownLevels.add(row.level);
    // Exposed slab edges carry narrow steel bearings underneath the deck.
    // They cannot cover the gap or add an obstacle on the walking surface.
    if(kind==='surface'&&(row.maxX-row.minX)>1&&(row.maxZ-row.minZ)>1){const y=Math.min(finite(row.y0,row.y),finite(row.y1,row.y))-.25;
      put(`bearing-${phase}-${row.id}`,PREFIX+'block',(row.minX+row.maxX)/2,y,row.minZ+.06,0,row.maxX-row.minX,.10,.10,{decorative:true,level:row.level});}
  }
  for(const door of doors){
    if(!visible(door))continue;const width=finite(door.width,1.8),height=finite(door.height,2.3),base=matrix(origin.x+door.x,origin.y+door.y,origin.z+door.z,finite(door.yaw),width/goods.opening.width,height/goods.opening.height,1),fraction=clamp(door.openFraction??door.fraction??(door.open??state.doorOpen?.[door.id]?1:0),0,1);
    props.push(positioned(PREFIX+'door-'+door.id,goods.frameMesh,base,{continuation:true,doorId:door.id,role:door.role,level:door.level}));
    if(goods.freeStandingHeadMesh)props.push(positioned(PREFIX+'door-head-'+door.id,goods.freeStandingHeadMesh,base,{doorId:door.id}));
    for(let k=0;k<goods.leafCount;k++)props.push(positioned(`${PREFIX}door-${door.id}-leaf-${k}`,goods.leafMesh,multiply(base,doorLeafLocalMatrix(goods,k,fraction)),{continuation:true,doorId:door.id,level:door.level}));
    const refuge=/return|refuge|entrance|entry/.test(door.role||door.id),lampY=door.y+Math.min(height+.18,2.45),colour=refuge?[.91,.66,.35]:[.55,.72,.76];
    put('door-lamp-'+door.id,PREFIX+'lamp',door.x,lampY,door.z,finite(door.yaw),1,1,1,{practical:true,doorId:door.id,level:door.level});
    lights.push({id:PREFIX+'door-light-'+door.id,x:origin.x+door.x,y:origin.y+lampY-.08,z:origin.z+door.z,radius:refuge?5:6.5,intensity:refuge?1.8:1.4,color:colour,penetration:1});
    put('door-foot-'+door.id,PREFIX+'warning',door.x,door.y+.006,door.z,finite(door.yaw),width+.16,1,.26,{threshold:true,doorId:door.id,level:door.level});
  }
  for(const p of memoryProps){
    if(!visible(p))continue;let mesh=p.mesh||propKindMesh[p.kind];if(!mesh){if(/counterweight|weight/.test(p.kind))mesh=PREFIX+'counterweight';else if(/rope|cable|pin/.test(p.kind))mesh=PREFIX+'pin';else if(/shadow/.test(p.kind))mesh=PREFIX+'shadow';else if(p.kind==='release-lip')mesh=PREFIX+'warning';else mesh=PREFIX+'block';}
    const seam=p.kind==='seam',lip=p.kind==='release-lip';
    put('prop-'+p.id,mesh,finite(p.x),finite(p.y),finite(p.z),finite(p.yaw),finite(p.scaleX,p.scale??(seam?.026:lip?.55:1)),finite(p.scaleY,p.scale??(seam?1.1:1)),finite(p.scaleZ,p.scale??(seam?.09:lip?.16:1)),{continuation:true,decorative:true,role:p.role,level:p.level,kind:p.kind});
    if(seam){const yaw=p.role==='matching-clue'?-Math.PI/2:0;for(const[y,k]of[[.17,0],[.47,1],[.72,2]])put(`seam-nick-${p.id}-${k}`,PREFIX+'block',p.x,p.y+y,p.z,yaw,.16,.025,.10,{matchingSeam:true,role:p.role});}
  }
  if(!catchMode&&['warning','closing'].includes(frame.closure?.mode)){
    const z=frame.closure.frontZ;put('closing-front-warning',PREFIX+'warning',5.15,3.008,z,0,7.7,1,.12,{closureWarning:true});
    if(frame.closure.mode==='warning'){
      // The announced front is visibly suspended clear of a standing head.
      // It occupies its real blocking height only when the controller arms it.
      const row=continuationSolids({...state,closure:{...frame.closure,mode:'closing'}}).find(s=>s.role==='closure');
      if(row){const b=boundsOf(solidGeometry(row).p);put('suspended-closing-front',name('wrong-return','solid',row.id),b.center[0],b.center[1]+2.4,b.center[2],0,1,1,1,{closureSuspended:true,warning:true});
        for(const[x,k]of[[row.minX+.2,0],[row.maxX-.2,1]])put('closing-front-cable-'+k,PREFIX+'pin',x,row.maxY+2.4,z,0,.04,2,.04,{closureCable:true});}
    }
    for(const[x,k]of[[1.6,0],[8.7,1]]){put('closing-front-lamp-'+k,PREFIX+'lamp',x,5.5,z-.35,0,1,1,1,{practical:true,closurePractical:true});lights.push({id:PREFIX+'closing-front-light-'+k,x:origin.x+x,y:origin.y+5.4,z:origin.z+z-.35,radius:7.5,intensity:1.9,color:[.88,.58,.25],penetration:1});}
  }
  // First person leaves the body with the viewer. The Catch is an actual
  // overhead camera over the same world, so its small clothed body is visible.
  if(catchMode){
    put('operator','ending_body_standing',finite(player.x),floor,finite(player.z),finite(player.yaw),.85,1.10,.85,{continuation:true,playerBody:true,level:activeLevel});
    put('operator-case','instrument_case',finite(player.x)+.19,floor+.83,finite(player.z)+.08,finite(player.yaw),.22,.22,.22,{playerKit:true});
    const bodyReceiver=continuationSupportAt(player.x,player.z,state,{maxY:floor+.05,minY:-30});
    if(bodyReceiver)put('operator-contact',PREFIX+'shadow',finite(player.x),bodyReceiver.y+.008,finite(player.z),0,.65,1,.48,{contactShadow:true,receiverLevel:bodyReceiver.level});
    const ringBounds=surfaces.filter(s=>Number.isInteger(s.level)).reduce((b,s)=>({minX:Math.min(b.minX,s.minX),maxX:Math.max(b.maxX,s.maxX),minZ:Math.min(b.minZ,s.minZ),maxZ:Math.max(b.maxZ,s.maxZ)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
    const bottom=Math.min(...surfaces.map(s=>finite(s.y)))-.4;
    if(Number.isFinite(ringBounds.minX))for(const[x,z,k]of[[ringBounds.minX-.12,ringBounds.minZ-.12,0],[ringBounds.maxX+.12,ringBounds.minZ-.12,1],[ringBounds.minX-.12,ringBounds.maxZ+.12,2],[ringBounds.maxX+.12,ringBounds.maxZ+.12,3]]){
      put('shaft-column-'+k,PREFIX+'block',x,bottom,z,0,.24,Math.max(.5,floor+1.5-bottom),.24,{shaftDepth:true});
    }
    const weight=frame.counterweight;if(weight){
      const radius=SOURCE_CONTINUATION.catch.counterweightRadius,top=weight.y+1.4,visibleWeight=weight.y<=floor+SOURCE_CONTINUATION.catch.layerDrop+.5;
      if(visibleWeight){
        put('counterweight',PREFIX+'counterweight',weight.x,weight.y,weight.z,0,radius*2,1.4,radius*2,{counterweight:true,mode:weight.mode,level:weight.level,collisionRadius:radius});
        for(const[y,k]of[[.12,0],[.67,1],[1.26,2]])put('counterweight-hoop-'+k,PREFIX+'counterweight',weight.x,weight.y+y,weight.z,0,radius*2+.02,.075,radius*2+.02,{counterweightHoop:true});
        for(let k=0;k<8;k++){const a=k/8*Math.PI*2;put('counterweight-rivet-'+k,PREFIX+'pin',weight.x+Math.cos(a)*(radius-.025),top+.006,weight.z+Math.sin(a)*(radius-.025),0,.045,.045,.045,{counterweightRivet:true});}
        const cableTop=Math.max(top+.4,SOURCE_CONTINUATION.catch.top+4);put('counterweight-cable',PREFIX+'pin',weight.x,top,weight.z,0,.035,cableTop-top,.035,{counterweightCable:true});
      }
      // The actual weight casts a dark contact at its support. A second broad
      // return on the occupied shelf announces its approach from above.
      if(weight.y>=floor-.2){const receiver=continuationSupportAt(weight.x,weight.z,state,{maxY:floor+.05,minY:-30});if(receiver)put('counterweight-shadow',PREFIX+'shadow',weight.x,receiver.y+.012,weight.z,0,radius*2+.25,1,radius*2+.25,{threatShadow:true,mode:weight.mode,receiverLevel:receiver.level});
        if(weight.active&&weight.mode==='warning')put('counterweight-warning',PREFIX+'warning',weight.x,weight.y+.008,weight.z,0,radius*2+.38,1,radius*2+.38,{counterweightWarning:true});}
      const lampX=weight.x+1.3,lampZ=weight.z-.65;put('counterweight-lamp',PREFIX+'lamp',lampX,weight.y+2.1,lampZ,0,1,1,1,{practical:true,counterweightPractical:true});lights.push({id:PREFIX+'counterweight-light',x:origin.x+lampX,y:origin.y+weight.y+2,z:origin.z+lampZ,radius:6,intensity:weight.active?2.1:.7,color:[.88,.59,.24],penetration:1});
    }
    for(const[dx,dz,k]of[[-5,-5,0],[5,5,1],[-5,5,2]])lights.push({id:PREFIX+'shaft-light-'+k,x:origin.x-23+dx,y:origin.y+floor+3.8,z:origin.z+dz,radius:18,intensity:k===0?2.4:1.7,color:k===0?[.63,.73,.72]:[.44,.58,.64],penetration:1});
  }else{
    for(const[x,z,k]of[[-9,1,0],[8,-11,1],[-3,-20,2]]){put('wrong-return-lamp-'+k,PREFIX+'lamp',x,3.9,z,0,1.2,1,1,{practical:true});lights.push({id:PREFIX+'wrong-return-light-'+k,x:origin.x+x,y:origin.y+3.8,z:origin.z+z,radius:14,intensity:k===0?1.8:1.4,color:k===0?[.79,.67,.45]:[.52,.67,.70],penetration:1});}
  }
  const eye=[...(frame.camera?.eye||[finite(player.x),floor+EYE,finite(player.z)])];
  if(catchMode){const aspect=clamp(viewportAspect,.35,3.5),clearance=Math.max((Math.abs(player.x-eye[0])+.8)/(.95*aspect)+1.9,(Math.abs(player.z-eye[2])+.8)/.95+1.9);eye[1]=Math.max(eye[1],floor+clearance);}
  const worldEye=eye.map((v,k)=>finite(v)+[origin.x,origin.y,origin.z][k]);
  const nearest=l=>(l.x-worldEye[0])**2+(l.y-worldEye[1])**2+(l.z-worldEye[2])**2;
  return{phase,props,lights:lights.sort((a,b)=>nearest(a)-nearest(b)).slice(0,8),eye:worldEye,yaw:catchMode?0:finite(player.yaw),pitch:catchMode?-Math.PI/2:finite(player.pitch),authoredCamera:{eye:worldEye,yaw:catchMode?0:finite(player.yaw),pitch:catchMode?-Math.PI/2:finite(player.pitch)},strictOverhead:catchMode,floorH:floor+origin.y,falling:!!frame.fall,activeLevel,shownLevels:[...shownLevels].sort((a,b)=>a-b),hiddenAbove,geometry:{surfaces,solids,doors},counts:{surfaces:props.filter(p=>p.physicalKind==='surface').length,solids:props.filter(p=>p.physicalKind==='solid').length,props:props.length,lights:Math.min(8,lights.length),body:catchMode?1:0},source:frame};
}

export function createSourceContinuationRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},anchor={x:0,y:0,z:0},installMeshes=installSourceContinuationMeshes,getViewport=()=>renderer.r3dViewCamera?.()}={}){
  let initialized=false,released=false,loading=null,repair=null,error=null,last=null,lastFalling=false;
  const customNames=meshLibrary.map(p=>p.name),required=[...customNames,...retained,...retainedDoor];
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh));};
  function clearSource(){
    renderer.r3dSetHorizon?.(null);renderer.r3dSetSourceShore?.(null);renderer.r3dSetSourceEmergency?.(0);renderer.r3dSetSourceWhiteout?.(0);renderer.r3dSetSourceFault?.(0);renderer.r3dSetLocalLights?.([]);renderer.r3dSetEmergencyShadows?.([]);renderer.r3dSetSourcePortals?.([]);renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetSourceOpenings?.([]);renderer.r3dSetSourceDoorLights?.([]);renderer.r3dSetSourceCrossing?.(null);renderer.r3dSetSourceReflection?.(null);renderer.r3dSetIndoorRain?.(0);renderer.r3dSetSourceTextInstances?.([]);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetProps?.([]);props.setPressureInstances?.([]);
  }
  async function install(){
    if(released)return false;if(typeof props.installAuthoredPropMeshes!=='function')throw Error('The Source continuation mesh installer is unavailable.');
    const names=props.installAuthoredPropMeshes(installMeshes);if(names===false)throw Error('The Source continuation prop context is unavailable.');
    const catalog=new Set(props.propMeshCatalog?.()||[]);if(retainedDoor.some(mesh=>!catalog.has(mesh)))await props.addPropPack(resolveAsset('assets/conservatory-doors.glb'));
    if(released)return false;const installed=new Set(props.propMeshCatalog?.()||[]),missing=required.filter(mesh=>!installed.has(mesh));if(missing.length)throw Error('Source continuation meshes missing: '+missing.join(', '));return true;
  }
  function initialize(){
    if(loading)return loading;loading=(async()=>{
      if(released)return false;const base=await renderer.r3dBasePropsReady?.();if(released)return false;if(base===false)throw Error('The Source continuation base prop catalog could not be loaded.');
      if(!await install()||released)return false;clearSource();const size=256,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=0;i<rgba.length;i+=4)rgba.set([0,0,0,ZONE.sourceSpace],i);
      renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:wrong-return-and-the-catch',look:{roomMemoryActive:true,chroma:.78,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSetLightingContext?.({ambientColor:[.57,.65,.62],ambientIntensity:.073,captureExposure:4.4,whitePointScale:1,screen:'stochastic'});renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(reason=>{error=String(reason?.message||reason);throw reason;});return loading;
  }
  function render(state){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){
      if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});renderer.r3dClearScreen?.();return true;
    }
    const viewport=getViewport?.();last=sourceContinuationRenderFrame(state,{anchor,viewportAspect:viewport?.width&&viewport?.height?viewport.width/viewport.height:16/9});renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);
    if(last.falling||lastFalling||last.authoredCamera)renderer.r3dSnapCameraOnNextFrame?.();lastFalling=last.falling;
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false,...(last.authoredCamera?{authoredCamera:last.authoredCamera}:{})})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();onRelease();return true;}
  return{initialize,render,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,restoringScenery:!!repair,error,meshCount:customNames.length,triangles:meshTriangles,frame:last?{phase:last.phase,eye:[...last.eye],pitch:last.pitch,yaw:last.yaw,strictOverhead:last.strictOverhead,activeLevel:last.activeLevel,shownLevels:last.shownLevels,hiddenAbove:last.hiddenAbove,counts:last.counts}:null})};
}
