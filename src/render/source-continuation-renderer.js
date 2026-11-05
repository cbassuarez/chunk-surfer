// A temporary owner of the game's prop/depth/acquisition renderer. The
// controller's finite support and solids are the render model, in metres.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {sourceRecordingCassetteWorldProps} from './source-recording-cassette-model.js';
import {SOURCE_CONTINUATION,continuationSurfaces,continuationSolids,continuationDoors,continuationProps,continuationSupportAt} from '../data/source-continuation.js';
import * as continuationData from '../data/source-continuation.js';
import {SOURCE_JOURNEY,JOURNEY_PROPS,JOURNEY_PORTALS} from '../data/source-continuation-journey.js';
import {cameraBasis} from './camera-basis.js';
import {pressureInstances as pressureMeshes} from './pressure-volume.js';
import {portalClipPlanes,transformPortalPlanes,portalMultiply,portalInverse,portalTransformPoint,portalTransformVector} from './source-mesh-portals.js';
import {SOURCE_EARTHFALL} from '../data/source-earthfall.js';
import {sourceContinuationFrame} from '../game/source-continuation.js';
import {sourceRestBenchProps,sourceRestCamera,sourceRestSeatForState,SOURCE_REST_SEATS} from '../game/source-rest-seat.js';
import {sourceRestScenery} from '../game/source-rest-scenery.js';
import {sourceRestGeometryLibrary} from './source-rest-models.js';
import {sourceRestApertureFrame} from './source-rest-aperture-frame.js';
import {sourceRestHarpsichordGeometryLibrary,sourceRestHarpsichordSeatGeometry} from './source-rest-harpsichord-models.js';
import {sourceRestHarpsichordBoardGeometry} from './source-rest-harpsichord-board.js';
import {sourceRestMemoryGeometryLibrary} from '../game/source-rest-memories.js';
import {sourceCoastalEchoGeometry,sourceCoastalEchoFrame} from '../game/source-coastal-echoes.js';
import {sourceRestNoteGeometryLibrary} from './source-rest-note-models.js';
import {sourceRestCubeGeometryLibrary} from './source-rest-cube-models.js';
import {sourceRestDestructionGeometryLibrary} from './source-rest-destruction-models.js';
import {SOURCE_REST_HAND_ASSET,SOURCE_REST_HAND_MESHES} from './source-rest-body.js';
import {applySourceRestDestruction} from './source-rest-destruction.js';
import {sourceFreedMemoryFrame} from './source-freed-memory.js';
import {sourceContinuationExecutionEvent,sourceExecutionTrailFrame} from './source-execution-trails.js';
import {sourceParserGeometryLibrary,sourceParserArchitectureFrame,sourceParserArchitectureImages} from './source-parser-architecture.js';
import {sourceRestImpactInView} from './source-rest-impact-view.js';
import {sourceRestAfflictionCamera} from './source-rest-affliction-view.js';
import {sourceRestFacultyFrame} from '../game/source-rest-vision.js';
import {applySourceRestReturn,sourceRestReturnRoom} from './source-rest-return.js';
import {sourceRestBellGeometryLibrary} from './source-rest-bells.js';
import {SOURCE_REST_FLOOD_MESHES} from '../game/source-rest-flood.js';
import {sourceRestFloodGeometryLibrary} from './source-rest-flood-models.js';
import {sourceRestSeabedGeometryLibrary} from './source-rest-seabed-models.js';
import {sourceConnectorGeometryLibrary,sourceConnectorRenderParts} from './source-connector-corridor.js';
import {createSourceRestNoteAsset} from '../game/source-rest-note-score.js';
import {continuationCameraBasis,continuationCameraEye,continuationBodyBasis} from '../game/source-continuation-portals.js';
import {continuationVoidCameraEye} from '../game/source-continuation-void.js';
import {sourceContinuationVoidViews,sourceContinuationVoidCopies,sourceContinuationVoidInstance,sourceContinuationVoidInFrustum,sourceContinuationVoidAcousticPoint,SOURCE_VOID_VIEW_LIMITS} from './source-continuation-void.js';
import {sourceContinuationIslandProps,sourceContinuationIslandGeometryLibrary} from './source-continuation-islands.js';
import {sourceContinuationBlackSunProps,sourceContinuationBlackSunGeometryLibrary} from './source-continuation-black-sun.js';
import {sourceContinuationLeafFrame} from './source-continuation-leaves.js';
import {SOURCE_RIFT,sourceRiftFaultsFor,sourceRiftLips} from '../game/source-rift.js';
import {sourceContinuationEscherFrame,sourceContinuationEscherGeometryLibrary} from './source-continuation-escher.js';
import {sourceContinuationAmbientFaultGeometry} from './source-continuation-faults.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {sourcePrintUV,sourcePrintMaps,uploadPhysicalPrint,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {sourceBlueprintMaps,sourceBlueprintMaterial,sourceBlueprintLighting} from './source-blueprint-print.js';
import {sourceSilverWalkwaySurface,SOURCE_SILVER_WALKWAY_PRINT_SURFACE} from './source-walkway-finish.js';
import {sourceSurroundingsFrame} from '../game/source-surroundings.js';
import {SOURCE_SURROUNDINGS} from '../data/source-surroundings.js';
import {continuationDitherIntensity} from './source-dither-routing.js';
import {sourceChunkFaultFrame} from '../game/source-chunk-fault.js';
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
const positioned=(id,mesh,m,extra={})=>({id,mesh,x:m[12],y:m[13],z:m[14],matrix:m,chartId:0,zone:ZONE.sourceSpace,structural:true,...extra});
const name=(phase,kind,id)=>`${PREFIX}${phase}-${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
const boxFaces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
const paint={source:[.62,.66,.59],concrete:[.52,.55,.50],stone:[.56,.59,.53],wood:[.37,.31,.23],'cold-stone':[.63,.66,.58],'cold-wall':[.60,.64,.57],'case-lining':[.27,.34,.31],'piano-wood':[.43,.34,.23],'dark-metal':[.18,.23,.22],metal:[.27,.31,.30],steel:[.29,.34,.33],'edge-steel':[.028,.036,.034],'next-edge-steel':[.11,.15,.14],'worn-metal':[.52,.43,.25],'asphalt':[.055,.065,.062],'earthfall-backing':[.035,.045,.039],'linen':[.55,.53,.41],'operator-canvas':[.84,.67,.34],'lip-paint':[.42,.34,.12],dark:[.07,.09,.08],refuge:[.53,.42,.24],warning:[.65,.47,.16]};
const isMetal=material=>/metal|steel|iron/.test(material||'');
const isSource=material=>!isMetal(material)&&!['asphalt','earthfall-backing','wood','piano-wood','case-lining','linen','operator-canvas','lip-paint','dark','refuge','warning','source-error'].includes(material);

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
const chartOf=value=>Math.max(0,Math.round(finite(value?.chartId)));
const dot3=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const basisMatrix=b=>[...b.right,0,...b.up,0,...b.forward.map(v=>-v),0,0,0,0,1];
// The cosmos has one simulation in chart0. These fixed images follow the
// main tree's rigid gluing; cross-links may expose a different image of it.
export const SOURCE_CONTINUATION_BACKDROP_ATLAS=Object.freeze((()=>{
  const rows=[{chartId:0,canonicalChartId:0,matrix:Object.freeze(Array.from(identity()))}];let current=identity();
  for(const edge of JOURNEY_PORTALS.slice(0,4)){current=portalMultiply(edge.matrix,current);rows.push({chartId:edge.toChart,canonicalChartId:0,matrix:Object.freeze(current)});}
  return rows.map(Object.freeze);
})());
function transformBackdropBounds(bounds,m){
  if(!bounds)return bounds;const points=[];for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]])points.push(...portalTransformPoint(m,[x,y,z]));
  return{...bounds,...boundsOf(points)};
}

export function sourceContinuationPresentation(state,camera=sourceContinuationCamera(sourceContinuationFrame(state))){
  if(camera.restOverride)return{eye:[...camera.eye],basis:cameraBasis(camera.yaw,camera.pitch),compensation:identity()};
  const ordinary=cameraBasis(camera.yaw,camera.pitch),basis=camera.strictOverhead?ordinary:continuationCameraBasis(state),
    eye=camera.strictOverhead?[...camera.eye]:continuationVoidCameraEye(state,continuationCameraEye(state)),
    turn=!camera.strictOverhead&&state.cameraTransit&&state.cameraTransit.elapsed<state.cameraTransit.duration?portalMultiply(basisMatrix(ordinary),portalInverse(basisMatrix(basis))):identity(),
    compensation=portalMultiply(matrix(...eye),portalMultiply(turn,matrix(...eye.map(v=>-v))));
  // R3 accepts yaw/pitch. Rotate every submitted world/clip plane about the
  // actual carried eye so the controller's full quaternion basis is exact.
  return{eye,basis,compensation};
}
export function sourceContinuationPortalViews(state,{eye,basis}={}){
  const view=eye&&basis?{eye,basis}:sourceContinuationPresentation(state),chartId=chartOf(state),all=[];
  for(const edge of JOURNEY_PORTALS)for(const side of['a','b']){
    const endpoint=edge[side];if(endpoint.chartId!==chartId)continue;
    const delta=endpoint.center.map((v,k)=>v-view.eye[k]),distance=Math.hypot(...delta),front=dot3(endpoint.normal,view.eye.map((v,k)=>v-endpoint.center[k]));
    if(distance>38||front<-.03||distance>2&&dot3(delta,view.basis.forward)<-.1)continue;
    const toCurrent=side==='a'?edge.inverseMatrix:edge.matrix;
    all.push({id:edge.id+':'+side,edgeId:edge.id,side,endpoint,destinationChart:edge[side==='a'?'b':'a'].chartId,toCurrent,distance,planes:portalClipPlanes(endpoint,view.eye)});
  }
  return all.sort((a,b)=>a.distance-b.distance).slice(0,2);
}
export function sourceContinuationAcousticFrame(state){
  const camera=sourceContinuationCamera(sourceContinuationFrame(state)),view=sourceContinuationPresentation(state,camera),chartId=chartOf(state),
    bodyEye=continuationVoidCameraEye(state,continuationCameraEye(state)),voidViews=sourceContinuationVoidViews(state,view),paths=[];
  // Sound follows physical apertures, including ones behind the listener.
  // Each path is simple and at most four joints; view culling never mutes a
  // continuing ensemble or a previously emitted tail in another chart.
  function visit(chart,seen,map,last,cost,steps){
    if(steps)paths.push({chart,map,last,cost});if(steps===4)return;
    for(const edge of JOURNEY_PORTALS)for(const side of['a','b']){
      const source=edge[side],destination=edge[side==='a'?'b':'a'];
      if(source.chartId!==chart||seen.has(destination.chartId))continue;
      const leg=Math.hypot(...source.center.map((v,k)=>v-last[k])),next=new Set(seen);next.add(destination.chartId);
      visit(destination.chartId,next,portalMultiply(map,side==='a'?edge.inverseMatrix:edge.matrix),destination.center,cost+leg,steps+1);
    }
  }
  visit(chartId,new Set([chartId]),identity(),bodyEye,0,0);
  return{defaultChartId:chartId,listener:{eye:bodyEye,...(camera.strictOverhead?cameraBasis(0,0):view.basis)},projectPoint(sourceChart,p){
    const local=[p.x,p.y,p.z];if(sourceChart===chartId)return sourceContinuationVoidAcousticPoint(voidViews,bodyEye,p);
    let best=null,distance=Infinity;for(const path of paths)if(path.chart===sourceChart){const cost=path.cost+Math.hypot(...local.map((v,k)=>v-path.last[k]));if(cost<distance){best=path;distance=cost;}}
    if(!best)return null;const q=portalTransformPoint(best.map,local);return{x:q[0],y:q[1],z:q[2]};
  }};
}

function boundsOf(points){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<points.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],points[i]);max[axis]=Math.max(max[axis],points[i]);}return{min,max,center:min.map((v,i)=>(v+max[i])/2)};}
function indexedBox(points){return{p:points.flat(),i:boxFaces.flatMap(([a,b,c,d])=>[a,c,b,a,d,c])};}
function solidGeometry(s){return indexedBox([[s.minX,s.minY,s.minZ],[s.maxX,s.minY,s.minZ],[s.maxX,s.minY,s.maxZ],[s.minX,s.minY,s.maxZ],[s.minX,s.maxY,s.minZ],[s.maxX,s.maxY,s.minZ],[s.maxX,s.maxY,s.maxZ],[s.minX,s.maxY,s.maxZ]]);}
function surfaceGeometry(s){
  if(s.kind==='sector'){
    const result={p:[],i:[]},c=s.center,steps=continuationData.continuationSectorSteps(s),thickness=finite(s.thickness,.22);
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
  ...sourceRestGeometryLibrary(),
  ...sourceRestHarpsichordGeometryLibrary(),
  'rest-harpsichord-seat':sourceRestHarpsichordSeatGeometry(),
  'rest-harpsichord-seat-upholstery':sourceRestHarpsichordSeatGeometry().upholstery,
  'rest-harpsichord-soundboard':sourceRestHarpsichordBoardGeometry(),
  ...sourceRestMemoryGeometryLibrary(),
  ...sourceCoastalEchoGeometry(),
  ...sourceRestNoteGeometryLibrary(),
  ...sourceRestCubeGeometryLibrary(),
  ...sourceRestDestructionGeometryLibrary(),
  ...sourceRestBellGeometryLibrary(),
  ...sourceRestFloodGeometryLibrary(),
  ...sourceRestSeabedGeometryLibrary(),
  ...sourceContinuationEscherGeometryLibrary(),
  ...sourceContinuationIslandGeometryLibrary(),
  ...sourceContinuationBlackSunGeometryLibrary(),
  ...sourceConnectorGeometryLibrary(),
  'rest-judgment-lightning':{...cylinderGeometry(6),material:'linen',base:[.82,.89,.94,1],emissive:[1.2,1.4,1.6],roughness:1},
  block:{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:1,minZ:-.5,maxZ:.5}),material:'metal'},
  'rift-slit':{...solidGeometry({minX:-.5,maxX:.5,minY:-.5,maxY:.5,minZ:-.5,maxZ:.5}),material:'dark',base:[.0015,.0015,.003,1],roughness:1},
  ...Object.fromEntries(SOURCE_RIFT.ink.map((rgb,index)=>[
    `chunk-error-${index}`,{...solidGeometry({minX:-.5,maxX:.5,minY:-.5,maxY:.5,minZ:-.5,maxZ:.5}),
      material:'source-error',materialRole:'source-chunk-error',base:[...rgb,1],emissive:rgb.map(channel=>channel*.36),roughness:.22},
  ])),
  counterweight:{...cylinderGeometry(32),material:'metal'},
  pin:{...cylinderGeometry(12),material:'steel'},
  lamp:{...solidGeometry({minX:-.12,maxX:.12,minY:-.08,maxY:.08,minZ:-.10,maxZ:.10}),material:'refuge'},
  'rest-carpet':{...solidGeometry({minX:-.78,maxX:.78,minY:0,maxY:.014,minZ:-1.17,maxZ:1.17}),material:'dark',base:[.25,.075,.052,1]},
  'rest-lamp-post':{...boxesGeometry([[-.15,.15,0,.04,-.15,.15],[-.025,.025,.04,1.15,-.025,.025],[-.11,.11,1.15,1.19,-.11,.11]]),material:'worn-metal'},
  'rest-lamp-light':{...cylinderGeometry(10),material:'linen',base:[.72,.59,.40,1],emissive:[.22,.15,.08]},
  'rest-sky-wire':{...cylinderGeometry(8),material:'linen',base:[.26,.32,.29,1],emissive:[.025,.035,.025]},
  'rest-vault-wire':{...cylinderGeometry(8),material:'linen',base:[.31,.35,.29,1],emissive:[.03,.035,.02]},
  'rest-road-mark':{...cylinderGeometry(8),material:'linen',base:[.57,.55,.44,1],emissive:[.08,.07,.05]},
  'rest-sky-mote':{...cylinderGeometry(8),material:'linen',base:[.72,.69,.57,1],emissive:[.45,.36,.22]},
  shadow:{...cylinderGeometry(32,{disc:true}),material:'dark'},
  warning:{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:.012,minZ:-.5,maxZ:.5}),material:'warning'},
  'lip-tread':{...solidGeometry({minX:-.63,maxX:.63,minY:0,maxY:.023,minZ:-.29,maxZ:.29}),material:'edge-steel'},
  'lip-paint':{...lipPaintGeometry(),material:'lip-paint'},
  'worn-block':{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:1,minZ:-.5,maxZ:.5}),material:'worn-metal'},
  'door-wear':{...boxesGeometry([[1.06,1.40,1.10,1.80,.037,.043],[1.06,1.40,1.10,1.80,-.043,-.037]]),material:'linen'},
  'door-handle':{...boxesGeometry([[1.19,1.25,1.40,1.47,.04,.16],[.96,1.25,1.40,1.47,.13,.18],[1.19,1.25,1.40,1.47,-.16,-.04],[.96,1.25,1.40,1.47,-.18,-.13]]),material:'worn-metal'},
  'operator-yoke':{...boxesGeometry([[-.285,-.09,1.40,1.46,-.12,.13],[.09,.285,1.40,1.46,-.12,.13]]),material:'linen'},
  'operator-jacket':{...boxesGeometry([[-.25,.25,.82,1.42,-.17,.17],[-.32,-.25,1.08,1.36,-.15,.15],[.25,.32,1.08,1.36,-.15,.15]]),material:'operator-canvas'},
  'operator-toes':{...boxesGeometry([[-.18,-.045,.025,.075,-.38,-.13],[.045,.18,.025,.075,-.38,-.13]]),material:'steel'},
  'recovery-sling':{...boxesGeometry([[-.37,.37,.005,.025,-.24,.24],[-.38,-.32,.025,.52,-.24,.24],[.32,.38,.025,.52,-.24,.24]]),material:'linen'},
  'door-lamp-fixture':{...boxesGeometry([[-.035,.035,-.03,.03,0,.85],[-.13,.13,-.08,.08,.75,.95],[-.17,.17,.08,.115,.72,.98]]),material:'refuge'},
  'road-preview':{...solidGeometry({minX:-.5,maxX:.5,minY:-.35,maxY:0,minZ:-.5,maxZ:.5}),material:'asphalt'},
  'road-kerb':{...solidGeometry({minX:-.5,maxX:.5,minY:0,maxY:.15,minZ:-.5,maxZ:.5}),material:'stone'},

};

export function sourceContinuationGeometry(state={phase:'wrong-return'}){
  const phase=phaseOf(state),geometry=[];
  for(const surface of continuationSurfaces())geometry.push({id:surface.id,name:name(regionOf(surface),'surface',surface.id),region:regionOf(surface),kind:'surface',material:surface.material||'source',role:surface.role,level:surface.level,descriptor:surface,...surfaceGeometry(surface)});
  const allSolids=new Map([...continuationSolids(),...continuationSolids({...state,chartId:0})].map(s=>[s.id,s]));
  for(const solid of allSolids.values())if(solid.role!=='furniture')geometry.push({id:solid.id,name:name(regionOf(solid),'solid',solid.id),region:regionOf(solid),kind:'solid',material:solid.material||'source',role:solid.role,level:solid.level,descriptor:solid,...solidGeometry(solid)});
  return geometry;
}
function allGeometry(){const rows=[...sourceContinuationGeometry({phase:'wrong-return'}),...sourceContinuationGeometry({phase:'wrong-return',closure:{mode:'closing',frontZ:0}}),...sourceContinuationGeometry({phase:'catch'}),...sourceContinuationEdgeGeometry()];return[...new Map(rows.map(row=>[row.name,row])).values(),...Object.entries(canonical).map(([id,g])=>({id,name:PREFIX+id,kind:'detail',...g})),...sourceSurroundingsGeometryLibrary(),...sourceContinuationAmbientFaultGeometry(),...sourceParserGeometryLibrary()];}
const meshLibrary=allGeometry(),meshTriangles=meshLibrary.reduce((n,p)=>n+p.i.length/3,0),rimLibrary=meshLibrary.filter(p=>p.kind==='edge').map(p=>({...p,center:boundsOf(p.p).center}));
// Only meshes which already carry actual Source print may leave lettering.
// Imported architecture opts in through its existing source-cut joint faces;
// the glyph pass still checks each primitive, so native wood stays unprinted.
const sourceMemoryMeshes=new Set([...meshLibrary.filter(p=>isSource(p.material)).map(p=>p.name),...SOURCE_CONTINUATION_ARCHITECTURE.meshes]);
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
    for(let k=0;k<3;k++){
      const p=points[k],vertex=piece.i[j+k];positions.push(...p.map((v,axis)=>v-bounds.center[axis]));
      // Authored cloth keeps its smooth crease normals. Masonry and all
      // existing details retain their deliberately flat face normals.
      normals.push(...(piece.n?.length===piece.p.length?piece.n.slice(vertex*3,vertex*3+3):n));
      uvs.push(...(piece.uv?.length===piece.p.length/3*2?piece.uv.slice(vertex*2,vertex*2+2):sourcePrintUV(p,n,isSource(piece.material)?8:2.8)));
    }
  }
  return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:Uint32Array.from({length:positions.length/3},(_,i)=>i),bounds,triangles:positions.length/9};
}

export function installSourceContinuationMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return[];
  installSourceSurroundingsEmitterAliases(gl,pack);
  const pieces=meshLibrary,missing=pieces.filter(piece=>!pack.catalog.has(piece.name));if(!missing.length)return pieces.map(p=>p.name);
  const printed=maps||sourceBlueprintMaps(gl);
  // Semantic Source stock carries light code over the chapter finish. Keep
  // actual paper/notes and native wood/cloth on their own retained materials.
  // The divide control remains dark-on-light for diagnostic comparisons.
  const palePrinted=maps?{...maps,blueprint:false}:{...sourcePrintMaps(gl,'divide'),blueprint:false};
  let silverPrinted=null;
  for(const piece of missing){
    const data=sourceContinuationMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    const source=isSource(piece.material),walkway=source&&printed.blueprint===true&&sourceSilverWalkwaySurface(piece),sourceSurface=piece.kind==='surface'&&printed.blueprint,
      paleStock=piece.paleStock||piece.kind==='surface'&&piece.role!=='inherited-earthfall',
      stock=walkway?(silverPrinted||=(maps?{...maps,blueprint:true}:{...sourcePrintMaps(gl,'silver-fracture'),blueprint:true})):sourceSurface?printed:paleStock?palePrinted:printed,
      base=piece.base||[...(paint[piece.material]||paint.source),1],
      localBounds={min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])};
    const edge=/edge-steel/.test(piece.material);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{sourceContinuation:true,bounds:localBounds,triangles:data.triangles},primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,nativeReceiverGeometry:Object.freeze({positions:data.positions,normals:data.normals,uvs:data.uvs,indices:data.indices}),base,emissive:piece.emissive||[0,0,0],texture:source?stock.texture:finishTexture(gl,piece.material),normalTexture:source?stock.normalTexture:null,ormTexture:source?stock.ormTexture:null,letteringFinish:source?stock.letteringFinish:null,materialFactors:'gltf',metallic:source?1:edge?.22:isMetal(piece.material)?.72:0,roughness:piece.roughness??(piece.material==='earthfall-backing'?1:source?1:edge?.91:isMetal(piece.material)?.58:.91),aoStrength:0,portrait:false,alphaCut:0,materialName:`continuation ${piece.material}`,materialRole:walkway?'source-silver-fracture':piece.materialRole||(piece.material==='earthfall-backing'?'quiet-metal':'source-continuation'),sourceSurroundingsSide:piece.sourceSurroundingsSide||0,sourceSurroundingsPressure:piece.sourceSurroundingsPressure===true,sourceSurroundingsArcRadius:piece.sourceSurroundingsArcRadius||0,printedSurface:source?SOURCE_PRINT_SURFACE:null,...(source?sourceBlueprintMaterial(stock,{base}):{}),...(walkway?{printedSurface:SOURCE_SILVER_WALKWAY_PRINT_SURFACE}:{})}]});
  }
  gl.bindVertexArray(null);return pieces.map(p=>p.name);
}

const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const hoist=SOURCE_CONTINUATION.catch.hoist;
const retained=['grand_piano','open_instrument_case','ending_body_standing','source_demolition_retained','academic_roof_cassette'];
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
    // The opening vehicle is already loaded by the overworld, but a resumed
    // Source can arrive before that optional load. A missing memory must never
    // prevent the Source route itself from opening.
    const vehicleMemory=['opening_drive_cabin','opening_drive_vehicle_body','opening_drive_tyre','opening_drive_cabin_door_r'];
    if(vehicleMemory.some(mesh=>!(props.propMeshCatalog?.()||[]).includes(mesh))){
      try{await props.addPropPack(resolveAsset('assets/source-vehicle-interior.glb'));}catch{/* Leave these images absent. */}
    }
    if(SOURCE_REST_FLOOD_MESHES.some(mesh=>!(props.propMeshCatalog?.()||[]).includes(mesh))){
      try{await props.addPropPack(resolveAsset('assets/source-return/fauna.glb'));}catch{/* Missing fauna must not block the existing route. */}
    }
    if(typeof props.addCharacterPack==='function'&&SOURCE_REST_HAND_MESHES.some(mesh=>!(props.propMeshCatalog?.()||[]).includes(mesh))){
      try{await props.addCharacterPack(resolveAsset(SOURCE_REST_HAND_ASSET),{allowedMeshes:SOURCE_REST_HAND_MESHES});}
      catch{/* A missing optional body falls back to the unobstructed view. */}
    }
    const frontMemory=['ellery_public_front','ellery_public_forecourt'];
    if(frontMemory.some(mesh=>!(props.propMeshCatalog?.()||[]).includes(mesh))){
      try{await props.addPropPack(resolveAsset('assets/ellery-public-front.glb'));}catch{/* An unavailable memory cannot close the Source route. */}
    }
    // Printed construction joints coexist with the authored limestone, wood,
    // iron and case lining. Their broad faces retain native light response.
    props.installAuthoredPropMeshes(finishSourceContinuationArchitecture);
    const ready=new Set(props.propMeshCatalog?.()||[]),missing=requiredMeshes().filter(mesh=>!ready.has(mesh));
    if(missing.length)throw Error('Source continuation meshes missing: '+missing.join(', '));
    if(typeof renderer.r3dPrepareHushBody!=='function'||await renderer.r3dPrepareHushBody()!==true
      ||renderer.r3dHushBodyReady?.()!==true)throw Error('The Source pursuer body is not ready.');
    return true;
  })();
  assetPreparations.set(props,preparing);preparing.then(()=>{if(assetPreparations.get(props)===preparing)assetPreparations.delete(props);},()=>{if(assetPreparations.get(props)===preparing)assetPreparations.delete(props);});return preparing;
}

export function sourceContinuationCamera(frame,{viewportAspect=16/9}={}){
  const player=frame.player||frame,feet=finite(player.y,player.feet);

  return{eye:[finite(player.x),feet+EYE,finite(player.z)],yaw:finite(player.yaw),pitch:finite(player.pitch),strictOverhead:false,revealProgress:null};
}

export function sourceContinuationRenderFrame(state,{anchor={x:0,y:0,z:0},viewportAspect=16/9,viewportTanHalfFov=.95,studyRotation=0,reducedMotion=false,noteScore=null,couperinNoteScore=null,flashMode='full',restBodyReady=true,escherMemory=null,leafMemory=null}={}){
  const frame=sourceContinuationFrame(state),player=frame.player||state.player||state,geometry=frame.geometry||{},surfaces=geometry.surfaces||continuationSurfaces(state),solids=geometry.solids||continuationSolids(state),doors=geometry.doors||continuationDoors(state),memoryProps=geometry.props||continuationProps(state);
  const baseCamera=sourceContinuationCamera(frame,{viewportAspect}),restSeat=state.sourceRestView&&sourceRestSeatForState(state);
  let camera=restSeat&&state.sourceRestView.seatId===restSeat.id
    ?sourceRestCamera(restSeat,baseCamera,state.sourceRestView.progress,state.sourceRestView.look)||baseCamera:baseCamera;
  const affliction=state.sourceRestView?.affliction;
  camera=sourceRestAfflictionCamera(camera,affliction,{reducedMotion});
  const props=[],lights=[],restReturnCanonical=[],shownLevels=new Set(),origin={x:finite(anchor.x),y:finite(anchor.y),z:finite(anchor.z)},focus=frame.focus;
  const center=SOURCE_CONTINUATION.catch.center;
  const put=(id,mesh,x,y,z,yaw=0,sx=1,sy=1,sz=1,extra={})=>{
    const p=positioned(PREFIX+id,mesh,matrix(origin.x+x,origin.y+y,origin.z+z,yaw,sx,sy,sz),extra);props.push(p);return p;
  };
  const putMatrix=(id,mesh,m,extra={})=>{const p=positioned(PREFIX+id,mesh,multiply(matrix(origin.x,origin.y,origin.z),m),extra);props.push(p);return p;};
  const chunkFault=sourceChunkFaultFrame(state,{reducedMotion});
  for(const piece of chunkFault.pieces)put(piece.id,PREFIX+`chunk-error-${piece.palette}`,piece.x,piece.y,piece.z,0,piece.sx,piece.sy,piece.sz,
    {chunkFault:true,chunkFaultStage:chunkFault.stage,chunkFaultProximity:chunkFault.proximity,region:piece.region,chartId:piece.chartId,descriptorId:'wrong-closing-front',cullRadius:1.6});
  const beam=(id,a,b,width=.08,material='pin',extra={})=>{
    const y=b.map((v,k)=>v-a[k]),length=Math.hypot(...y);if(length<.001)return;
    const n=y.map(v=>v/length),seed=Math.abs(n[1])<.9?[0,1,0]:[1,0,0],cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],x=cross(n,seed),xl=Math.hypot(...x);for(let k=0;k<3;k++)x[k]/=xl;const z=cross(x,n);
    putMatrix(id,PREFIX+material,new Float32Array([...x.map(v=>v*width),0,...y,0,...z.map(v=>v*width),0,...a,1]),extra);
  };
  const restScenery=sourceRestScenery(state,{reducedMotion,noteScore,couperinNoteScore,flashMode});
  let restHorizon=null;
  if(restScenery){
    const decoration={chartId:restScenery.carpet.chartId,region:restScenery.region||'wrong-return',structural:false,decorative:true,noShadow:true};
    for(const part of restScenery.bells||[])putMatrix(part.id,PREFIX+part.mesh,part.matrix,{...decoration,restBell:true,bellId:part.bellId,bellPart:part.bellPart,cullRadius:7});
    for(const part of restScenery.flood?.props||[])putMatrix(part.id,part.mesh,part.matrix,{...decoration,restFlood:true,floodKind:part.kind,
      memoryFish:part.memoryFish,memoryWreck:part.memoryWreck,...(part.emissive?{emissive:part.emissive}:{}),cullRadius:part.cullRadius||6});
    // The Catch fills with the floor of the sea instead of water.
    for(const part of restScenery.seabed?.props||[])putMatrix(part.id,part.mesh,part.matrix,{...decoration,restSeabed:true,seabedKind:part.kind,
      seabedCar:part.seabedCar,...(part.emissive?{emissive:part.emissive}:{}),cullRadius:part.cullRadius||4});
    for(const lamp of restScenery.seabed?.lights||[])lights.push({...lamp,x:origin.x+lamp.x,y:origin.y+lamp.y,z:origin.z+lamp.z,region:decoration.region});
    for(const part of restScenery.weather?.lightning||[])beam(part.id,part.a,part.b,part.width,'rest-judgment-lightning',{...decoration,restLightning:true,cullRadius:30});
    for(const part of restScenery.place){
      // The overhead traversal retains sight of its actual refuge and doors;
      // first-person keeps the complete, physically raised instrument lid.
      if(camera.strictOverhead&&part.cutawayOverhead)continue;
      const extra={...decoration,restPlace:!(part.routeComposition||part.routeArchitecture),restTreatment:restScenery.treatment,
        ...(part.routeComposition||part.routeArchitecture?{restRouteComposition:true,routeArchitecture:true,architecturalJoint:true}:{}),
        ...(part.casePart?{restHarpsichordPart:part.casePart,restHarpsichordReactive:part.reactive||null,
          restHarpsichordRegister:part.register||null,restHarpsichordWear:!!part.wear,restHarpsichordCenter:part.localCenter||null,cullRadius:part.cullRadius||12}:{}),
        ...(part.response?{restHarpsichordResponse:part.response}:{}),
        ...(part.exposedEdge?{restExposedSoundboardEdge:true}:{})};
      if(part.matrix)putMatrix(part.id,part.mesh,part.matrix,extra);
      else put(part.id,part.mesh,part.x,part.y,part.z,part.yaw,part.sx,part.sy,part.sz,extra);
    }
    for(const part of restScenery.vista){
      const extra={...decoration,restSky:true,restVista:true,cullRadius:35},wind=restScenery.weather?.gust||0;
      if(part.mesh.endsWith('rest-green')&&!reducedMotion){
        const lean=wind*.038*Math.sin(part.x*.17+part.z*.23),m=multiply(matrix(part.x,part.y,part.z,part.yaw),multiply(rotateZ(lean),matrix(0,0,0,0,part.sx,part.sy,part.sz)));
        putMatrix(part.id,part.mesh,m,{...extra,restWind:lean});
      }else put(part.id,part.mesh,part.x,part.y,part.z,part.yaw,part.sx,part.sy,part.sz,extra);
    }
    // Rain is real geometry beyond the front eave, so look and parallax keep
    // the seat dry and the opening exposed. No extra light or screen overlay.
    for(const part of restScenery.noteArchitecture?.parts||[]){
      const extra={...decoration,restSky:true,restNoteArchitecture:true,noteKind:part.kind,noteIds:part.noteIds,eventCount:part.eventCount,midi:part.midi,cullRadius:5,
        articulation:!!part.articulation,onset:part.onset,noteDuration:part.noteDuration,noteVoice:part.noteVoice,phase:part.phase,articulationRole:part.articulationRole,
        cubieId:part.cubieId,lattice:part.lattice,homeLattice:part.homeLattice,cubePivot:part.cubePivot,
        angelAssemblyId:part.angelAssemblyId,wheelId:part.wheelId,wingSide:part.wingSide,eyeCount:part.eyeCount,
        aperture:part.aperture,notePressure:part.notePressure,irisDepth:part.irisDepth,chamberExcursion:part.chamberExcursion,
        phrasePressure:part.phrasePressure,breathPhase:part.breathPhase,breathTilt:part.breathTilt,
        ...(part.angelAssemblyId?{cullRadius:8}:{}),
        turnIndex:part.turnIndex,turnAxis:part.turnAxis,turnSlice:part.turnSlice,turnAngle:part.turnAngle,turnProgress:part.turnProgress};
      if(part.matrix)putMatrix(part.id,PREFIX+part.mesh,part.matrix,extra);
      else put(part.id,PREFIX+part.mesh,part.x,part.y,part.z,part.yaw,part.sx,part.sy,part.sz,extra);
    }
    // The horizon has no mesh. Its wheels light the vista from the pivot the
    // semiangel used, and the lens pass draws it before the recording.
    const local=restScenery.noteArchitecture?.horizon;
    if(local?.active){
      restHorizon={...local,centre:local.centre.map((v,k)=>v+[origin.x,origin.y,origin.z][k])};
      lights.push({id:PREFIX+'rest-horizon-wheels',x:restHorizon.centre[0],y:restHorizon.centre[1],z:restHorizon.centre[2],radius:32,
        intensity:2.4*restHorizon.light,color:[.86,.88,1],penetration:0,chartId:decoration.chartId,region:decoration.region,restSky:true,focusPractical:true});
    }
    const weather=restScenery.weather;
    for(const drop of [...weather.streaks,...weather.roof])beam(drop.id,drop.a,drop.b,drop.width,'rest-rain',{...decoration,restSky:true,restWeather:true,weatherLayer:drop.layer??drop.kind});
    for(const patch of weather.wet)put(patch.id,PREFIX+'rest-rain-wet',patch.x,patch.y,patch.z,0,patch.sx,1,patch.sz,{...decoration,restSky:true,restWeather:true,weatherLayer:'wet'});
    for(const ripple of weather.ripples)put(ripple.id,PREFIX+'rest-rain-ring',ripple.x,ripple.y,ripple.z,0,ripple.radius,1,ripple.radius,{...decoration,restSky:true,restWeather:true,weatherLayer:'ripple'});
    for(const object of weather.objects){const m=multiply(matrix(object.x,object.y,object.z,object.yaw,object.size,object.size,object.size),rotateX(object.roll));
      putMatrix(object.id,PREFIX+object.mesh,m,{...decoration,restSky:true,restWeather:true,weatherLayer:object.kind});}
    const cloth=restScenery.upholstery;
    if(cloth.enabled!==false)for(const suffix of ['cloth','piping'])put('rest-settle-'+suffix,PREFIX+'rest-settle-'+suffix,cloth.x,cloth.y,cloth.z,cloth.yaw,1,1,cloth.scaleZ||1,{...decoration,restPlace:true,restSeatDetail:true});
    for(const lamp of restScenery.lamps){
      put(lamp.id+'-post',PREFIX+'rest-lamp-post',lamp.x,lamp.y,lamp.z,0,1,1,1,{...decoration,restPlace:true});
      put(lamp.id+'-light',PREFIX+'rest-lamp-light',lamp.x,lamp.y+1.19,lamp.z,0,.20,.15,.20,{...decoration,restPlace:true,practical:true});
      lights.push({id:PREFIX+lamp.id,x:origin.x+lamp.x,y:origin.y+lamp.y+1.31,z:origin.z+lamp.z,radius:lamp.radius||4.5,intensity:lamp.intensity??.68,color:lamp.color||[.86,.66,.40],penetration:0,chartId:lamp.chartId,region:decoration.region,restPlace:true,...(lamp.harpsichord?{level:lamp.level,restHarpsichordLight:true}:{}),...(lamp.focusPractical?{focusPractical:true}:{})});
    }
    // The recording pass needs light on broad faces, not just luminous rims.
    // Each diffuse pool belongs to a visible shade or lantern in this place.
    const place=restScenery.upholstery;
    const sunset=state.sourceRestView?.weatherCue?.sunset;
    const sunOffset=decoration.region==='catch'?{x:Math.sin(restSeat?.view.yaw||0)*18,z:-Math.cos(restSeat?.view.yaw||0)*18}:{x:-18,z:8};
    if(sunset?.amount>0)lights.push({id:PREFIX+'rest-low-sun',x:origin.x+place.x+sunOffset.x,y:origin.y+place.y+6.4,z:origin.z+place.z+sunOffset.z,
      radius:44,intensity:1.15*sunset.amount*(1-.85*(sunset.storm||0)),color:[1,.40,.14],penetration:0,
      chartId:place.chartId,region:decoration.region,focusPractical:true});
    if(cloth.enabled!==false){
      put('rest-canopy-shade',PREFIX+'rest-light-strip',place.x-.72,place.y+2.18,place.z,0,.42,.035,.30,{...decoration,restPlace:true,practical:true});
      lights.push({id:PREFIX+'rest-canopy-pool',x:origin.x+place.x-.72,y:origin.y+place.y+2.08,z:origin.z+place.z,
        radius:5.5,intensity:1.45,color:[.94,.75,.49],penetration:0,chartId:place.chartId,region:decoration.region,restPlace:true});
    }
    for(const [suffix,radius,intensity]of [['near',19,1.15],['far',31,1.10]]){
      const arch=restScenery.vista.find(p=>p.id==='garden-'+suffix+'-arch');
      if(!arch)continue;const scale=suffix==='far'?1.3:1,x=arch.x+.63,y=arch.y+5.15*scale,z=arch.z+2.75*scale;
      put('rest-garden-lantern-'+suffix,PREFIX+'rest-light-strip',x,y,z,0,.16,.32,.18,{...decoration,restSky:true,practical:true});
      lights.push({id:PREFIX+'rest-garden-light-'+suffix,x:origin.x+x+.25,y:origin.y+y,z:origin.z+z,radius,intensity,color:[.83,.76,.58],penetration:1,chartId:place.chartId,region:decoration.region,restSky:true});
    }
    for(const arc of restScenery.arcs)beam(arc.id,arc.a,arc.b,arc.width,'rest-sky-wire',{...decoration,restSky:true});
    for(const mote of restScenery.motes)put(mote.id,PREFIX+'rest-sky-mote',mote.x,mote.y,mote.z,0,mote.size,mote.size*1.8,mote.size,{...decoration,restSky:true});
    for(const vault of restScenery.vaults)beam(vault.id,vault.a,vault.b,vault.width,'rest-vault-wire',{...decoration,restSky:true,restVault:true});
    for(const mote of restScenery.rallyFragments)put(mote.id,PREFIX+'rest-sky-mote',mote.x,mote.y,mote.z,0,mote.size,mote.size*1.8,mote.size,{...decoration,restSky:true,restRally:true});
    const memory={...decoration,restSky:true,restMemory:true};
    for(const part of [...restScenery.memories.road,...restScenery.memories.drive,...restScenery.memories.ellery,...restScenery.memories.tableaux]){
      const extra={...memory,restMemoryKind:part.kind,cullRadius:part.kind==='ellery'?20:part.kind==='drive'?5:12};
      if(part.matrix)putMatrix(part.id,part.mesh,part.matrix,extra);
      else put(part.id,part.mesh,part.x,part.y,part.z,part.yaw,part.sx,part.sy,part.sz,extra);
    }
    // Existing light pools remain bounded. The two active memory fixtures get
    // priority while their complete scene replaces the empty vista.
    for(const light of restScenery.memories.lights){
      if(lights.length>=SOURCE_CONTINUATION_ARCHITECTURE.maxLights)lights.pop();
      lights.unshift({...light,id:PREFIX+light.id,x:origin.x+light.x,y:origin.y+light.y,z:origin.z+light.z,
        chartId:place.chartId,region:decoration.region,restMemory:true,restSky:true});
    }
  }
  // Every support remains in the same physical world. The overhead view makes
  // an explicit cutaway after submission, without changing this geometry.
  for(const piece of sourceContinuationGeometry(state)){
    const row=piece.descriptor;if(row.role==='spindle'||row.role==='arch-pier')continue;const b=boundsOf(piece.p),isSurface=piece.kind==='surface';
    put(piece.id,piece.name,...b.center,0,1,1,1,{continuation:true,physicalKind:piece.kind,descriptorId:row.id,region:regionOf(row),level:row.level,role:row.role,chartId:chartOf(row),...(row.role==='rest-alcove'?{restPlace:true}:{}),
      physicalBounds:{min:b.min,max:b.max},cullRadius:Math.hypot((b.max[0]-b.min[0])/2,(b.max[2]-b.min[2])/2)});
    if(Number.isInteger(row.level))shownLevels.add(row.level);
    if(isSurface&&row.kind!=='sector'&&row.role!=='stair'){
      const y=continuationData.continuationSurfaceY(row,(row.minX+row.maxX)/2,(row.minZ+row.maxZ)/2)-finite(row.thickness,.35)-.11;
      // Bearing courses show a real cut edge without doubling the top surface.
      if(row.maxX-row.minX>2)put('cut-bearing-'+row.id,PREFIX+'worn-block',(row.minX+row.maxX)/2,y,row.minZ+.07,0,row.maxX-row.minX,.12,.14,{architecturalJoint:true,descriptorId:row.id,region:regionOf(row),chartId:chartOf(row)});
    }
  }
  for(const part of sourceConnectorRenderParts(state))put(part.id,PREFIX+part.mesh,part.x,part.y,part.z,0,part.sx,part.sy,part.sz,
    {architecture:true,region:part.region,chartId:part.chartId,connector:true,cabinet:part.cabinet,physicalKind:'solid',descriptorId:part.id,physicalBounds:part.physicalBounds});
  for(const piece of rimLibrary.filter(piece=>piece.material==='edge-steel')){put(piece.id,piece.name,...piece.center,0,1,1,1,{catchRim:true,level:piece.level,elevation:piece.elevation});}
  // The four sectors are framed as four different fabricated objects. All
  // frames are below the exact support mesh, and the spindle is continuous.
  const spindleTop=camera.strictOverhead?camera.aimTarget[1]+2.4:17,spindleScale=(spindleTop+25)/42;
  put('continuous-spindle','source_iii_spindle',center.x,-25+25*spindleScale,center.z,0,1,spindleScale,1,{architecture:true,region:'catch',continuousSpindle:true,cutawayTop:spindleTop,cullRadius:45});
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
  // The narrow stairs have physically open sides. Their treads and stringers
  // remain real, without decorative rails that a jumping body passes through.
  for(const link of continuationData.CONTINUATION_STRUCTURAL_LINKS||[]){
    if(link.kind!=='stair')continue;const width=link.maxX-link.minX,run=link.maxZ-link.minZ,rise=link.y1-link.y0;
    put('stringer-'+link.id,'source_ii_stringer',(link.minX+link.maxX)/2,link.y0,link.maxZ,0,width,rise/4.2,run,{architecture:true,stairStructure:true,region:'wrong-return',stairId:link.id});
  }
  for(const [x,y,z,yaw,id]of[[0,0,-4,0,'entry'],[10,4.2,-22,Math.PI/2,'mid-return'],[0,8.4,-19,0,'upper-refuge']]){
    put('jointed-arch-'+id,'source_ii_arch_voussoirs',x,y,z,yaw,1,1,1,{architecture:true,region:'wrong-return',opening:true,cullRadius:8});
  }
  for(const door of doors){
    const width=finite(door.width,1.8),height=finite(door.height,2.3),base=matrix(origin.x+door.x,origin.y+door.y,origin.z+door.z,finite(door.yaw),width/goods.opening.width,height/goods.opening.height,1),fraction=clamp(door.openFraction??door.fraction??(door.open??state.doorOpen?.[door.id]?1:0),0,1);
    props.push(positioned(PREFIX+'door-'+door.id,goods.frameMesh,base,{continuation:true,doorId:door.id,role:door.role,region:regionOf(door),level:door.level}));
    if(goods.freeStandingHeadMesh)props.push(positioned(PREFIX+'door-head-'+door.id,goods.freeStandingHeadMesh,base,{doorId:door.id,region:regionOf(door),level:door.level}));
    const focused=focus?.id===door.id,reach=focused?clamp(1-Math.hypot(player.x-door.x,player.z-door.z)/1.9,0,1):0;
    for(let k=0;k<goods.leafCount;k++){
      const leaf=multiply(base,doorLeafLocalMatrix(goods,k,fraction));props.push(positioned(`${PREFIX}door-${door.id}-leaf-${k}`,goods.leafMesh,leaf,{continuation:true,doorId:door.id,region:regionOf(door),level:door.level}));
      props.push(positioned(`${PREFIX}door-wear-${door.id}-${k}`,PREFIX+'door-wear',leaf,{doorWear:true,doorId:door.id,level:door.level,region:regionOf(door)}));
      const grip=multiply(multiply(multiply(leaf,matrix(1.22,1.435,0)),rotateZ(-reach*.12*(1-fraction))),matrix(-1.22,-1.435,0));props.push(positioned(`${PREFIX}door-handle-${door.id}-${k}`,PREFIX+'door-handle',grip,{doorHandle:true,doorId:door.id,focused,reach,level:door.level,region:regionOf(door)}));
    }
    const refuge=door.role==='return',side=door.role==='final'?1:-1,nx=-Math.sin(finite(door.yaw))*side,nz=Math.cos(finite(door.yaw))*side,lampY=door.y+height+.18;
    put('door-lamp-'+door.id,PREFIX+'door-lamp-fixture',door.x,lampY,door.z,finite(door.yaw)+(side<0?Math.PI:0),1,1,1,{practical:true,doorId:door.id,region:regionOf(door),level:door.level});
    lights.push({id:PREFIX+'door-light-'+door.id,x:origin.x+door.x+nx*.85,y:origin.y+lampY-.3,z:origin.z+door.z+nz*.85,radius:refuge?4.3:5.2,intensity:(refuge?.65:.78)+reach*.3,color:refuge?[.79,.60,.36]:[.53,.66,.65],penetration:0,focusPractical:focused,level:door.level});
  }
  const remembered=[...memoryProps,...sourceRestBenchProps(),...(state.sourceContactProps||[])],rememberedIds=new Set(remembered.map(p=>p.id));for(const row of JOURNEY_PROPS)if(!rememberedIds.has(row.id))remembered.push(row);
  for(const row of remembered){
    // The seated eye now clears the real back. Retain the occupied bench:
    // looking down or back must show the furniture carrying the body.
    if(row.kind==='release-lip'){
      const yaw=Math.atan2(finite(row.dx),-finite(row.dz));
      put('lip-tread-'+row.id,PREFIX+'lip-tread',row.x,row.y,row.z,yaw,1,1,1,{releaseTread:true,level:row.level,lipId:row.id,dropDirection:[row.dx,row.dz]});
      // Scuffed grip positions, rather than luminous game arrows, face the
      // actual lower catch. Both supported releases carry identical treatment.
      put('lip-paint-'+row.id,PREFIX+'lip-paint',row.x,row.y,row.z,yaw,1,1,1,{releasePaint:true,level:row.level,lipId:row.id});
    }else if(row.kind==='journey-frame'||row.kind==='journey-landmark'){
      const details={journeyJoint:true,foldId:row.foldId,landmarkId:row.kind==='journey-landmark'?row.id:null,region:'wrong-return',chartId:chartOf(row)};
      if(row.frameMatrix)putMatrix('joint-'+row.id,goods.frameMesh,multiply(row.frameMatrix,multiply(matrix(0,-row.height/2,0),matrix(0,0,0,0,row.width/goods.opening.width,row.height/goods.opening.height,1))),details);
      else put('joint-'+row.id,goods.frameMesh,row.x,row.y,row.z,finite(row.yaw),row.width/goods.opening.width,row.height/goods.opening.height,1,details);
      if(row.kind==='journey-landmark'){
        put('joint-lamp-'+row.id,PREFIX+'lamp',row.x+1.08,row.y+1.25,row.z,0,1,1,1,{journeyPractical:true,landmarkId:row.id,region:'wrong-return',chartId:chartOf(row)});
        lights.push({id:row.id+'-light',x:origin.x+row.x+1.04,y:origin.y+row.y+1.25,z:origin.z+row.z-.18,radius:5.5,intensity:1.3,color:[.83,.65,.36],penetration:0,attachedTo:row.id,region:'wrong-return',journeyPractical:true,chartId:chartOf(row)});
      }
    }else if(row.kind==='source-recording-cassette'){
      for(const part of sourceRecordingCassetteWorldProps(row))putMatrix('prop-'+part.id,part.mesh,part.matrix,
        {continuation:true,region:regionOf(row),chartId:chartOf(row),level:row.level,role:'recording-return',structural:false,decorative:true,noCollision:true,noReflection:true,
          sourceRecordingCassette:true,sourceRecordingReturn:true,recordingReceiptId:row.recordingReceiptId,locationId:row.locationId});
    }else if(row.mesh)put('prop-'+row.id,row.mesh,row.x,row.y,row.z,row.id==='source-rest-iii'?-finite(row.yaw):finite(row.yaw),finite(row.scaleX,row.scale??1),finite(row.scaleY,row.scale??1),finite(row.scaleZ,row.scale??1),{continuation:true,region:regionOf(row),chartId:chartOf(row),level:row.level,role:row.role,decorative:true,...(row.sourceRecordingStand?{sourceRecordingStand:true,structural:false,noCollision:true}:{}),...(row.sourceRecordingReturn?{sourceRecordingReturn:true,recordingReceiptId:row.recordingReceiptId,locationId:row.locationId}:{}),...(row.role==='rest-seat'?{restPlace:true,restSeatDetail:true}:{})});
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
  if(camera.strictOverhead){
    const heading=finite(frame.heading,player.yaw);
    put('operator','ending_body_standing',player.x,player.y,player.z,heading,1,1,1,{playerBody:true,physicalOperator:true,heading,feet:player.y});
    put('operator-jacket',PREFIX+'operator-jacket',player.x,player.y,player.z,heading,1,1,1,{operatorClothing:true,physicalCanvas:true});
    put('operator-yoke',PREFIX+'operator-yoke',player.x,player.y,player.z,heading,1,1,1,{operatorClothing:true});
    put('operator-toes',PREFIX+'operator-toes',player.x,player.y,player.z,heading,1,1,1,{operatorHeading:true});
    for(const [id,actor]of[['operator',player],['hush',frame.hush]]){
      if(!actor||id==='hush'&&!actor.active)continue;
      const feet=id==='operator'?actor.y:actor.feet,actorChart=id==='operator'?chartOf(state):chartOf(actor),receiver=continuationSupportAt(actor.x,actor.z,{feet,chartId:actorChart},{minY:SOURCE_CONTINUATION.bounds.minY,maxY:feet+.02});
      if(!receiver)continue;
      const spread=1+Math.min(6,Math.max(0,feet-receiver.y))*.09;
      put(id+'-contact-shadow',PREFIX+'shadow',actor.x,receiver.y+.018,actor.z,finite(actor.heading,heading),.72*spread,1,.92*spread,{contactShadow:true,actorId:id,level:receiver.level,receiverY:receiver.y,chartId:actorChart});
    }
  }
  // Fixed grazing fixtures belong to particular model joints and lower frames.
  // Their sources sit below/along the fabrication, rather than above a pale
  // deck. This lets a carried beam reveal an object already readable as mass.
  for(const [x,y,z,id,radius,intensity,attachment]of[
    [9.4,5.7,-47.8,'piano-key-joint',9,.82,'ii-whole-piano-bank'],
    [-19.9,-.6,-2.5,'case-bank-hinge',7,.70,'ii-whole-case-bank'],
    [-27.97,6.8,-4.38,'case-crescent-brace',10,.84,'fabricated-catch-0'],
    [-47.32,.7,-4.28,'soundboard-rib',10,.78,'fabricated-catch-1'],
    [-46.9,-6.5,-18.62,'counterarc-bearing',9,.72,'fabricated-catch-2'],
  ]){
    const catchJoint=attachment.startsWith('fabricated-catch-'),level=catchJoint?Number(attachment.at(-1)):undefined,region=catchJoint?'catch':'wrong-return';
    put('practical-'+id,PREFIX+'lamp',x,y,z,0,1,1,1,{practical:true,attached:true,level,region});
    lights.push({id:PREFIX+'fixed-'+id,x:origin.x+x,y:origin.y+y-.14,z:origin.z+z,radius,intensity,color:id==='piano-key-joint'?[.74,.58,.38]:[.43,.58,.60],penetration:0,attachedTo:attachment,region,level});
  }
  for(let level=0;level<SOURCE_CONTINUATION.catch.levels;level++){
    const stage=catchStage(level),radius=stage.outerRadius-.45;
    for(let index=0;index<3;index++){
      const a=mix(stage.startAngle,stage.endAngle,.16+index*.34),x=center.x+Math.cos(a)*radius,z=center.z+Math.sin(a)*radius,id=`shelf-bulkhead-${level}-${index}`;
      put(id,PREFIX+'lamp',x,stage.y+.32,z,a,1,1,1,{practical:true,shelfPractical:true,region:'catch',level});
      lights.push({id:PREFIX+id,x:origin.x+x,y:origin.y+stage.y+.45,z:origin.z+z,radius:6.2,intensity:1.65,color:[.83,.68,.42],penetration:0,attachedTo:id,region:'catch',level,shelfPractical:true});
    }
  }
  // A pair of tall, lit gateposts marks the onward island from the stack.
  // Their warm verticals and the lit causeway read even in the overhead view.
  const destination=SOURCE_CONTINUATION.catch.finalDoor;
  for(const side of [-1,1]){
    const z=destination.z+side*3.4;
    beam('door-island-beacon-'+side,[destination.x,destination.y,z],[destination.x,destination.y+7,z],.12,'worn-block',{architecture:true,region:'catch',level:3,islandBeacon:true});
    beam('door-island-light-'+side,[destination.x-.08,destination.y+1,z],[destination.x-.08,destination.y+6.6,z],.055,'rest-sky-wire',{region:'catch',level:3,islandBeacon:true});
    lights.push({id:PREFIX+'island-beacon-light-'+side,x:origin.x+destination.x,y:origin.y+destination.y+5,z:origin.z+z,radius:13,intensity:1.7,color:[.94,.73,.40],penetration:0,region:'catch',level:3});
  }
  beam('door-island-crown',[destination.x,destination.y+7,destination.z-3.4],[destination.x,destination.y+7,destination.z+3.4],.11,'rest-sky-wire',{region:'catch',level:3,islandBeacon:true});
  for(const x of [-158,-153,-148,-143])put('door-route-light-'+x,PREFIX+'rest-lamp-light',x,-12.48,-93,0,.17,.10,.17,{region:'catch',level:3,islandBeacon:true,practical:true});
  // One lit thread rises from the door island through the whole universe,
  // so the right island is legible from any shelf, causeway or seat.
  if(phaseOf(state)==='catch')beam('door-island-thread',[destination.x+.6,destination.y+7,destination.z],[destination.x+.6,destination.y+96,destination.z],.07,'rest-sky-mote',{region:'catch',level:3,islandBeacon:true,cullRadius:92});
  // The Catch is one island among many; only the Catch frame carries them.
  for(const p of sourceContinuationIslandProps(state,{origin,time:finite(state.elapsed),reducedMotion}))props.push(p);
  // Over it the black sun eats the blood moon; its pull is the Catch's tide.
  for(const p of sourceContinuationBlackSunProps(state,{origin,time:finite(state.elapsed),reducedMotion}))props.push(p);
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
  // The false Ellery is not among them: it came down with him in Earthfall.
  // A finite service-road view carries the existing drive's destination
  // language through the final open leaves. It begins beyond the completion
  // plane; this is a preview of that handoff, not a replacement drive route.
  const exit=SOURCE_CONTINUATION.catch.finalDoor;
  put('onward-road-preview',PREFIX+'road-preview',exit.x+7,exit.y,exit.z,0,12,1,6.5,{onwardPreview:true,region:'catch',previewOf:'existing-source-drive',cullRadius:10});
  for(const side of[-1,1])put('onward-road-kerb-'+side,PREFIX+'road-kerb',exit.x+7,exit.y,exit.z+side*3.35,0,12,1,.2,{onwardPreview:true,kerb:true,region:'catch'});
  const worlds=['wrong-return','catch'].map(phase=>sourceSurroundingsFrame({...state,phase},{reducedMotion}));
  for(const world of worlds)props.push(...sourceSurroundingsProps(world,{origin}));
  const canonicalFall=props.filter(p=>p.surroundings&&p.world==='fall'),backdropOrigin=matrix(origin.x,origin.y,origin.z),backdropUnanchor=matrix(-origin.x,-origin.y,-origin.z);
  for(const p of canonicalFall){p.canonicalId=p.id;p.canonicalBodyId=p.bodyId;p.canonicalChartId=0;}
  for(const atlas of SOURCE_CONTINUATION_BACKDROP_ATLAS.slice(1)){
    const map=portalMultiply(backdropOrigin,portalMultiply(atlas.matrix,backdropUnanchor));
    for(const p of canonicalFall){const q=portalTransformPoint(map,[p.x,p.y,p.z]);
      props.push({...p,id:p.id+':atlas:'+atlas.chartId,canonicalId:p.id,canonicalBodyId:p.bodyId,canonicalChartId:0,chartId:atlas.chartId,backdropAtlas:true,
        x:q[0],y:q[1],z:q[2],matrix:multiply(map,p.matrix),sourceWorldMatrix:map,sourceSurroundingsSide:0,
        physicalBounds:transformBackdropBounds(p.physicalBounds,map),worldBounds:transformBackdropBounds(p.worldBounds,map)});
    }
  }

  const activeWorld=worlds[phaseOf(state)==='catch'?1:0];
  const surroundings={world:activeWorld.world,clock:activeWorld.time,reducedMotion:!!reducedMotion,
    score:activeWorld.score,waves:activeWorld.waves,events:activeWorld.impacts,
    persistentWorlds:worlds.map(world=>({world:world.world,...world.diagnostics.counts})),
    props:props.filter(p=>p.surroundings).length,
    gate:{x:origin.x+SOURCE_JOURNEY.gate.x,y:origin.y+SOURCE_JOURNEY.gate.y-.01,z:origin.z+SOURCE_JOURNEY.gate.z,width:2.2,height:2.86,normalX:1,normalZ:0}};
  surroundings.pressure={waves:worlds.flatMap(world=>world.waves),reducedMotion:!!reducedMotion,gate:surroundings.gate};
  const hiddenAbove=camera.strictOverhead?Array.from({length:SOURCE_CONTINUATION.catch.levels},(_,level)=>level)
    .filter(level=>level<state.level||frame.fall&&catchFloor(level)>player.y+.30):[];
  if(camera.strictOverhead){
    // Looking down must not replace the current support with the roof of a
    // departed shelf. Its thin rim remains as a cutaway outline, so a pursuer
    // still arriving from above has a legible route without hiding the catch.
    for(let index=props.length-1;index>=0;index--){const p=props[index];
      if(chartOf(p)!==chartOf(state))continue;
      const oldShelf=hiddenAbove.includes(p.level),aboveWeight=(p.counterweight||p.counterweightHoop)&&p.y>catchFloor(state.level)+2.4,
        overhead=p.hoistRail||p.hoistTrolley||p.counterweightCable||p.recoveryCable||p.closureCable,
        b=p.physicalBounds,h=frame.hush,ownsHushFloor=h?.active&&b&&p.physicalKind==='surface'&&Math.hypot(h.x-player.x,h.z-player.z)<18
          &&h.x>=b.min[0]&&h.x<=b.max[0]&&h.z>=b.min[2]&&h.z<=b.max[2]&&Math.abs(b.max[1]-h.feet)<.05,
        priorWorld=(p.region==='wrong-return'||p.stairId||p.inheritedRuins)&&!ownsHushFloor;
      if(oldShelf&&p.catchRim){p.cutawayOutline=true;continue;}
      if(oldShelf||aboveWeight||overhead||priorWorld)props.splice(index,1);
    }
    for(const level of hiddenAbove)shownLevels.delete(level);
  }
  // The world is still physically present, and movement rules never change.
  // Once the conversation has made staying irreversible, its visible planes
  // slowly slip below the listening place; the nearby floor is the last to
  // leave. Nothing blinks or tracks an invented rhythm.
  const restDegradation=restSeat&&phaseOf(state)===restSeat.phase&&state.sourceRestView?.seatId===restSeat.id
    ?Math.max(0,Math.min(1,finite(state.sourceRestView.degradation))):0;
  // Intact canonical placement is supplied on every frame, before recession
  // mutates these instances. A late seek therefore retains the same address
  // as continuous playback, without a first-visible snapshot or scene cache.
  const codeRestProps=restDegradation>.42||affliction?.active===true
    ?props.filter(p=>sourceMemoryMeshes.has(p.mesh)).map(p=>({...p,matrix:new Float32Array(p.matrix)})):[];
  const restEase=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  if(restDegradation>.42){
    const distant=restEase(.42,.78,restDegradation),ground=restEase(.63,.88,restDegradation),place=restEase(.77,.91,restDegradation);
    for(const p of props){
      // The flood and seabed already own their changing world-space heights.
      // Architectural recession must not sink their ground, animals or wrecks
      // away from their own lamps and surfaces a second time.
      if(chartOf(p)!==chartOf(state)||p.restSky||p.restFlood||p.restSeabed)continue;
      const amount=p.restPlace?place:p.physicalKind==='surface'?ground:(p.surroundings||p.region===phaseOf(state)||p.doorId)?distant:0;
      if(amount<=0)continue;
      const drop=(p.restPlace?3:p.physicalKind==='surface'?7:8)*amount;
      p.matrix=new Float32Array(p.matrix);p.matrix[13]-=drop;p.y-=drop;p.restDrift=drop;
    }
  }
  const destruction=applySourceRestDestruction(props,{cue:affliction,time:state.sourceRestView?.musicTime,
    seat:restSeat||SOURCE_REST_SEATS[0],origin,reducedMotion,canLeave:affliction?.canLeave!==false,horizon:restHorizon,
    effectsMode:state.sourceRestView?.effectsMode||'full',reducedDread:state.sourceRestView?.reducedDread===true});
  if(!restBodyReady){destruction.body=[];destruction.diagnostics.bodyParts=0;}
  destruction.diagnostics.bodyAvailable=!!restBodyReady;
  if(destruction.diagnostics.active)props.splice(0,props.length,...destruction.props,...destruction.debris,...destruction.body);
  const freedMemory=sourceFreedMemoryFrame(codeRestProps,props,{clock:restHorizon?.clock??finite(affliction?.unwrappedTime,state.sourceRestView?.musicTime)});
  props.splice(0,props.length,...freedMemory.props.filter(p=>!p.sourceCodeOnly));
  const parser=sourceParserArchitectureFrame(state,{origin}),localExecution=sourceContinuationExecutionEvent(state),
    executionEvent=localExecution?{...localExecution,origin:localExecution.origin.map((v,k)=>v+[origin.x,origin.y,origin.z][k])}:null,
    executionTrail=sourceExecutionTrailFrame([...props,...freedMemory.memories,...parser.props],executionEvent,{
      clock:state.elapsed,reducedMotion,eligible:p=>sourceMemoryMeshes.has(p.mesh)||p.parserArchitecture===true
    });
  props.splice(0,props.length,...executionTrail.props.filter(p=>!p.sourceCodeOnly&&!p.parserArchitecture));
  const canonicalCode=executionTrail.props.filter(p=>p.sourceCodeOnly),sourceCodeInstances=[],
    canonicalParser={...parser,props:executionTrail.props.filter(p=>p.parserArchitecture===true)};
  const pursuer=frame.hush||state.hush;
  let hush=pursuer?.active?{
    id:pursuer.id||'source-continuation-hush',x:(origin.x+finite(pursuer.x))/CELL-.5,y:(origin.z+finite(pursuer.z))/CELL-.5,
    floorH:origin.y+finite(pursuer.feet),heightM:2.18,widthM:.68,strength:.96,radiusM:5.2,mode:'live',
    performance:{version:1,role:'source-rear',heading:finite(pursuer.heading),clip:pursuer.mode==='follow'?'pressure_approach':'pressure_hold',
      // Live material state comes from the saved continuation actor. Retain
      // the old captured clock only for bounded old-save fallback; the shared
      // density adapter does not turn it into another locomotion authority.
      time:Math.max(0,finite(pursuer.animationClock))/2.36*2.4,loop:true,seed:0,manifestation:1,
      density:pursuer.density||null,
      motion:pursuer.mode==='follow'?'hunt':'idle',cue:null,reducedMotion:!!reducedMotion},
  }:null;
  const presentation=sourceContinuationPresentation({...state,chartId:chartOf(state)},camera),portalViews=sourceContinuationPortalViews(state,presentation),
    voidViews=sourceContinuationVoidViews(state,{...presentation,aspect:viewportAspect}),
    originMatrix=matrix(origin.x,origin.y,origin.z),unanchor=matrix(-origin.x,-origin.y,-origin.z),
    sourceExcludes=[...portalViews.map(v=>v.planes),...voidViews.excludes].map(p=>transformPortalPlanes(p,originMatrix)),allProps=[...props],allLights=[...lights],chartId=chartOf(state);
  props.splice(0,props.length,...allProps.filter(p=>chartOf(p)===chartId).map(p=>({...p,portalExcludePlanes:sourceExcludes.length?sourceExcludes:null})));
  sourceCodeInstances.push(...canonicalCode.filter(p=>chartOf(p)===chartId).map(p=>({...p,portalExcludePlanes:sourceExcludes.length?sourceExcludes:null})));
  lights.splice(0,lights.length,...allLights.filter(l=>chartOf(l)===chartId));
  const submitTransform=(p,m,extra={})=>{const q=transform(m,[p.x,p.y,p.z]);return{...p,...extra,matrix:multiply(m,p.matrix),x:q[0],y:q[1],z:q[2],...(p.surroundings?{sourceWorldMatrix:portalMultiply(m,p.sourceWorldMatrix||identity())}:{})};};
  for(const view of portalViews){const worldMap=portalMultiply(originMatrix,portalMultiply(view.toCurrent,unanchor)),planes=transformPortalPlanes(view.planes,originMatrix);
    for(const p of allProps)if(chartOf(p)===view.destinationChart)props.push(submitTransform(p,worldMap,{id:p.id+':through:'+view.id,canonicalId:p.canonicalId||p.id,portalClipPlanes:planes,portalExcludePlanes:null,portalClipId:view.id,portalDestination:true,noShadow:true}));
    for(const p of canonicalCode)if(chartOf(p)===view.destinationChart)sourceCodeInstances.push(submitTransform(p,worldMap,{id:p.id+':through:'+view.id,canonicalId:p.canonicalId||p.id,portalClipPlanes:planes,portalExcludePlanes:null,portalClipId:view.id,portalDestination:true,noShadow:true}));
    for(const l of allLights)if(chartOf(l)===view.destinationChart){const q=transform(worldMap,[l.x,l.y,l.z]);lights.push({...l,id:l.id+':through:'+view.id,x:q[0],y:q[1],z:q[2],portalClipId:view.id});}
  }
  // Below all real floors, exact frustum rejection releases slots for the
  // receiving world's full visible architecture. This removes no visible
  // canonical mesh and avoids substituting a six-piece floor miniature.
  if(voidViews.domain){
    const retained=props.filter(p=>p.portalDestination||sourceContinuationVoidInFrustum(p,{...presentation,aspect:viewportAspect},origin));
    props.splice(0,props.length,...retained);
  }
  const restReturn=applySourceRestReturn({props,lights,canonicalProps:[...allProps,...restReturnCanonical],canonicalLights:allLights,state,
    eye:presentation.eye.map((v,k)=>v+[origin.x,origin.y,origin.z][k]),forward:presentation.basis.forward,origin,
    portalCount:sourceExcludes.length,maxInstances:SOURCE_CONTINUATION_ARCHITECTURE.maxInstances});
  if(restReturn.diagnostics.active){props.splice(0,props.length,...restReturn.props);lights.splice(0,lights.length,...restReturn.lights);}
  // Code never consumes physical aperture/budget slots. It follows a Return
  // only after the actual room has opened that aperture successfully.
  if(restReturn.planes){
    for(let i=0;i<sourceCodeInstances.length;i++){const p=sourceCodeInstances[i];sourceCodeInstances[i]={...p,portalExcludePlanes:[...(p.portalExcludePlanes||[]),restReturn.planes]};}
    for(const p of sourceRestReturnRoom(canonicalCode,restReturn.frame.seat))sourceCodeInstances.push(submitTransform(p,restReturn.frame.toCurrent,{id:p.id+':through:rest-return:'+restReturn.frame.seatId,canonicalId:p.canonicalId||p.id,restReturnDestination:true,portalDestination:true,portalClipId:'rest-return:'+restReturn.frame.seatId,portalClipPlanes:restReturn.planes,portalExcludePlanes:null,noShadow:true}));
  }
  if(restReturn.planes)sourceExcludes.push(restReturn.planes);
  const parserArchitecture=sourceParserArchitectureImages(canonicalParser,{chartId,origin,portalViews,voidViews,sourceExcludes,restReturn});
  // Exact aperture echoes retain their native budget; the merged fall images
  // have their own fixed instance ceiling and must not displace seam geometry.
  const escher=sourceContinuationEscherFrame(state,{voidViews,origin,memory:escherMemory});
  // The opening's leaves, drawn toward whatever devours this Source's sky.
  const leaves=sourceContinuationLeafFrame(state,{origin,memory:leafMemory,reducedMotion});
  // A fault that opens stands like the practice hall's tear, in the same ink:
  // a black slit between torn lips, kept apart from the architecture budget.
  const riftFaults=[];
  for(const fault of sourceRiftFaultsFor(state)){
    const flags={chartId:fault.chartId,region:fault.phase,level:fault.level,riftFault:fault.id,noShadow:true,noReflection:true,cullRadius:3},
      c=Math.cos(fault.yaw),s=Math.sin(fault.yaw),at=(x,y,z)=>[origin.x+fault.x+x*c-z*s,origin.y+fault.feet+y,origin.z+fault.z+x*s+z*c];
    riftFaults.push(positioned(PREFIX+'rift-slit-'+fault.id,PREFIX+'rift-slit',matrix(...at(0,SOURCE_RIFT.height/2,0),fault.yaw,SOURCE_RIFT.width,SOURCE_RIFT.height,.03),flags));
    for(const lip of sourceRiftLips())riftFaults.push(positioned(PREFIX+`rift-lip-${fault.id}-${lip.id}`,PREFIX+`chunk-error-${lip.ink}`,matrix(...at(lip.x,lip.y,lip.z),fault.yaw,lip.sx,lip.sy,lip.sz),flags));
    const [lx,ly,lz]=at(0,1.9,1.1);
    lights.push({id:PREFIX+'rift-fault-'+fault.id,x:lx,y:ly,z:lz,radius:7,intensity:1.8,color:[.72,.78,.86],penetration:.7,region:fault.phase,level:fault.level,chartId:fault.chartId,riftFault:fault.id});
  }
  const voidCopies=sourceContinuationVoidCopies({views:voidViews,canonicalProps:allProps,canonicalLights:allLights,origin,
    remaining:SOURCE_CONTINUATION_ARCHITECTURE.maxInstances-props.length});
  props.push(...voidCopies.props);lights.push(...voidCopies.lights);
  const codeVoidCopies=sourceContinuationVoidCopies({views:voidViews,canonicalProps:canonicalCode,origin,remaining:SOURCE_VOID_VIEW_LIMITS.props});
  sourceCodeInstances.push(...codeVoidCopies.props);
  // Portal and void echoes copy a pulled prop's tide, but each image would
  // fall toward the one real hole. An echo vanishes once its original is
  // released and is drawn untouched before then.
  if(restHorizon)for(let index=props.length-1;index>=0;index--){
    const p=props[index];if(!p.horizonTide||!String(p.id).includes(':through:'))continue;
    if(restHorizon.clock>=p.horizonTide.release)props.splice(index,1);else{const {horizonTide,...still}=p;props[index]=still;}
  }
  const pressureInstances=[],rawPressure=hush?pressureMeshes(hush,null,{reducedMotion}):[],hushChart=chartOf(pursuer);
  const straddles=endpoint=>{
    if(!pursuer||endpoint.chartId!==hushChart)return false;
    const center=[pursuer.x,pursuer.feet+SOURCE_CONTINUATION.bodyHeight/2,pursuer.z],relative=center.map((v,k)=>v-endpoint.center[k]),up=continuationBodyBasis(pursuer).up,
      extent=SOURCE_CONTINUATION.bodyHeight/2*Math.abs(dot3(up,endpoint.normal))+.46;
    return Math.abs(dot3(relative,endpoint.normal))<extent&&Math.abs(dot3(relative,endpoint.right))<endpoint.halfWidth+.4&&Math.abs(dot3(relative,endpoint.up))<endpoint.halfHeight+.4;
  };
  for(const p of rawPressure){
    const bodyBasis=continuationBodyBasis(pursuer),bodyRotation=basisMatrix(bodyBasis),half=SOURCE_CONTINUATION.bodyHeight/2,
      root=[p.x,p.y+half,p.z].map((v,k)=>v-bodyBasis.up[k]*half),
      body=multiply(matrix(...root),multiply(bodyRotation,matrix(0,0,0,0,p.scale*(p.scaleX??1),p.scale*(p.scaleY??1),p.scale*(p.scaleZ??1)))),
      base={...p,matrix:body,chartId:hushChart,canonicalActorId:pursuer.id||'source-continuation-hush'};
    if(hushChart===chartId){
      pressureInstances.push({...base,portalExcludePlanes:sourceExcludes.length?sourceExcludes:null});
      for(const view of portalViews)if(straddles(view.endpoint)){
        // The leading half already occupies the connected chart before the
        // canonical root crosses. This is the same pose/root, clipped to the
        // aperture's far half; it complements the ordinary source exclusion.
        pressureInstances.push({...base,id:p.id+':straddling:'+view.id,portalFragment:'leading',portalClipPlanes:transformPortalPlanes(view.planes,originMatrix),portalClipId:view.id+':leading',noShadow:true});
      }
    }
    for(const view of portalViews)if(hushChart===view.destinationChart){
      const worldMap=portalMultiply(originMatrix,portalMultiply(view.toCurrent,unanchor)),projected=portalMultiply(worldMap,body),
        sourceEndpoint=JOURNEY_PORTALS.find(edge=>edge.id===view.edgeId)[view.side==='a'?'b':'a'];
      pressureInstances.push({...base,id:p.id+':through:'+view.id,matrix:projected,portalFragment:'destination',portalClipPlanes:transformPortalPlanes(view.planes,originMatrix),portalClipId:view.id,noShadow:true});
      if(straddles(sourceEndpoint)){
        // After the centre changes chart, the trailing mesh still lies on the
        // observer's side. Keep that complementary half until it clears the
        // seam; no extra actor, animation clock, or root is synthesized.
        const e=view.endpoint,n=e.normal,front=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[...n,-dot3(n,e.center)]];
        pressureInstances.push({...base,id:p.id+':trailing:'+view.id,matrix:projected,portalFragment:'trailing',portalClipPlanes:transformPortalPlanes(front,originMatrix),portalClipId:view.id+':trailing',noShadow:true});
      }
    }
    // Portal images share the one actor's exact captured skin and material.
    // The ordinary surface companion is derived downstream from this same
    // descriptor, so neither layer can cross independently of the other.
    if(hushChart===chartId)for(const view of [...voidViews.lower,...voidViews.upper]){
      if(pressureInstances.length>=SOURCE_VOID_VIEW_LIMITS.pressure)break;
      const projected=sourceContinuationVoidInstance({...base,x:body[12],y:body[13],z:body[14]},view,origin),
        at=[projected.matrix[12]-origin.x,projected.matrix[13]-origin.y+1.09,projected.matrix[14]-origin.z];
      if(!view.planes.every(plane=>dot3(plane.slice(0,3),at)+plane[3]>=-1.4))continue;
      pressureInstances.push({...projected,portalFragment:'void-'+view.kind});
    }
  }
  const compensate=portalMultiply(originMatrix,portalMultiply(presentation.compensation,unanchor));
  for(const impact of destruction.diagnostics.mistakeImpacts||[])impact.point=transform(compensate,impact.point);
  for(let i=0;i<props.length;i++){const p=submitTransform(props[i],compensate);if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,compensate);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,compensate));props[i]=p;}
  for(let i=0;i<sourceCodeInstances.length;i++){const p=submitTransform(sourceCodeInstances[i],compensate);if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,compensate);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,compensate));sourceCodeInstances[i]=p;}
  for(let i=0;i<parserArchitecture.props.length;i++){const p=submitTransform(parserArchitecture.props[i],compensate);if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,compensate);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,compensate));parserArchitecture.props[i]=p;}
  for(const l of lights){const q=transform(compensate,[l.x,l.y,l.z]);l.x=q[0];l.y=q[1];l.z=q[2];}
  for(const p of pressureInstances){p.matrix=portalMultiply(compensate,p.matrix);if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,compensate);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,compensate));}
  // Upright house-of-stairs images yield to the exact aperture views.
  const escherApertures=voidViews.domain?[...voidViews.lower,...voidViews.upper].map(v=>transformPortalPlanes(v.planes,originMatrix)):[];
  for(let i=0;i<escher.props.length;i++){const p=submitTransform({...escher.props[i],portalExcludePlanes:escher.props[i].excludeVoidApertures&&escherApertures.length?escherApertures:null},compensate);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,compensate));escher.props[i]=p;}
  for(let i=0;i<riftFaults.length;i++)riftFaults[i]=submitTransform(riftFaults[i],compensate);
  // Leaves ride the same presented world as everything they blow past.
  for(let i=0;i<leaves.props.length;i++)leaves.props[i]=submitTransform(leaves.props[i],compensate);
  // These bounded, non-colliding memories are not aperture copies: preserve
  // every native seam image and submit only the current chart's fragments.
  const coastalEchoes=sourceCoastalEchoFrame(state).filter(p=>chartOf(p)===chartId).map(echo=>{
    const {id,mesh,matrix:m,x,y,z,yaw=0,sx=1,sy=1,sz=1,...flags}=echo;
    const at=m?multiply(originMatrix,m):matrix(origin.x+x,origin.y+y,origin.z+z,yaw,sx,sy,sz);
    return submitTransform(positioned(PREFIX+'coastal-'+id,mesh,at,flags),compensate);
  });
  // Fixed world-space sheets are submitted separately from the bounded native
  // portal images; they cannot consume the receiving world's seam geometry.
  const ambientFaults=sourceContinuationAmbientFaultGeometry().filter(piece=>piece.phase===phaseOf(state)&&piece.chartId===chartId).map(piece=>{
    const [x,y,z]=boundsOf(piece.p).center,p=positioned(piece.id,piece.name,matrix(origin.x+x,origin.y+y,origin.z+z),
      {chartId,region:piece.phase,ambientFault:true,faultPalette:piece.palette,faultSheets:piece.sheetRanges.length,structural:false,collidable:false,noShadow:true,noReflection:true,cullRadius:90,portalExcludePlanes:sourceExcludes.length?sourceExcludes:null});
    const q=submitTransform(p,compensate);if(q.portalExcludePlanes)q.portalExcludePlanes=q.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,compensate));return q;
  });
  let eye=presentation.eye.map((v,k)=>v+[origin.x,origin.y,origin.z][k]),worldYaw=camera.yaw,
    aim=camera.aimTarget?.map((v,k)=>v+[origin.x,origin.y,origin.z][k])||null;
  const rotation=phaseOf(state)==='catch'?finite(studyRotation):0;
  if(rotation){const cx=origin.x+center.x,cz=origin.z+center.z,rigid=multiply(matrix(cx,0,cz,rotation),matrix(-cx,0,-cz));for(const p of props){const q=transform(rigid,[p.x,p.y,p.z]);p.matrix=multiply(rigid,p.matrix);p.x=q[0];p.y=q[1];p.z=q[2];if(p.surroundings&&p.sourceWorldMatrix)p.sourceWorldMatrix=portalMultiply(rigid,portalMultiply(p.sourceWorldMatrix,portalInverse(rigid)));if(p.playerBody)p.heading=angle(p.heading+rotation);}for(const l of lights){const q=transform(rigid,[l.x,l.y,l.z]);l.x=q[0];l.y=q[1];l.z=q[2];}eye=transform(rigid,eye);if(aim)aim=transform(rigid,aim);if(hush){const q=transform(rigid,[(hush.x+.5)*CELL,hush.floorH,(hush.y+.5)*CELL]);hush={...hush,x:q[0]/CELL-.5,y:q[2]/CELL-.5,floorH:q[1],performance:{...hush.performance,heading:angle(hush.performance.heading+rotation)}};}worldYaw=angle(worldYaw+rotation);}
  if(rotation){const gate=surroundings.gate,q=transform(multiply(matrix(origin.x+center.x,0,origin.z+center.z,rotation),matrix(-origin.x-center.x,0,-origin.z-center.z)),[gate.x,gate.y,gate.z]);gate.x=q[0];gate.z=q[2];gate.normalX=Math.cos(rotation);gate.normalZ=Math.sin(rotation);}
  if(rotation){const rigid=multiply(matrix(origin.x+center.x,0,origin.z+center.z,rotation),matrix(-origin.x-center.x,0,-origin.z-center.z));for(let i=0;i<ambientFaults.length;i++){const p=submitTransform(ambientFaults[i],rigid);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,rigid));ambientFaults[i]=p;}}
  if(rotation){const rigid=multiply(matrix(origin.x+center.x,0,origin.z+center.z,rotation),matrix(-origin.x-center.x,0,-origin.z-center.z));
    for(const impact of destruction.diagnostics.mistakeImpacts||[])impact.point=transform(rigid,impact.point);
    for(const p of props){if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,rigid);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,rigid));}
    for(const p of pressureInstances){p.matrix=portalMultiply(rigid,p.matrix);if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,rigid);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,rigid));}
    for(const p of sourceCodeInstances){const q=transform(rigid,[p.x,p.y,p.z]);p.matrix=multiply(rigid,p.matrix);p.x=q[0];p.y=q[1];p.z=q[2];if(p.surroundings&&p.sourceWorldMatrix)p.sourceWorldMatrix=portalMultiply(rigid,portalMultiply(p.sourceWorldMatrix,portalInverse(rigid)));if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,rigid);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,rigid));}
    for(const p of parserArchitecture.props){const q=transform(rigid,[p.x,p.y,p.z]);p.matrix=multiply(rigid,p.matrix);p.x=q[0];p.y=q[1];p.z=q[2];if(p.portalClipPlanes)p.portalClipPlanes=transformPortalPlanes(p.portalClipPlanes,rigid);if(p.portalExcludePlanes)p.portalExcludePlanes=p.portalExcludePlanes.map(planes=>transformPortalPlanes(planes,rigid));}
  }
  surroundings.props=props.filter(p=>p.surroundings).length;
  for(const impact of destruction.diagnostics.mistakeImpacts||[]){
    impact.visible=!!restBodyReady&&sourceRestImpactInView(impact,{eye,yaw:worldYaw,pitch:camera.pitch,aspect:viewportAspect,tanHalfFov:viewportTanHalfFov},props);
  }
  const near=light=>Math.hypot(light.x-eye[0],light.y-eye[1],light.z-eye[2]);
  const lookingBack=phaseOf(state)==='wrong-return'&&-Math.cos(worldYaw)>.45&&Math.abs(Math.sin(worldYaw))<.7;
  const lightPriority=light=>light.voidImage?(presentation.eye[1]<SOURCE_CONTINUATION.bounds.minY+2?4:0):light.focusPractical?4:camera.strictOverhead&&light.shelfPractical?light.level===state.level?3:light.level===state.level+1?2:0:lookingBack&&light.inheritedEarthfall&&!light.voidImage?1:0;
  const selectedLights=lights.filter(light=>!hiddenAbove.includes(light.level)&&(!camera.strictOverhead||!light.inheritedEarthfall&&light.region!=='wrong-return')).sort((a,b)=>lightPriority(b)-lightPriority(a)||near(a)-near(b)).slice(0,SOURCE_CONTINUATION_ARCHITECTURE.maxLights);
  return{phase:phaseOf(state),chartId,canonicalProps:allProps.filter(p=>chartOf(p)===chartId),portals:portalViews.map(v=>({id:v.id,edgeId:v.edgeId,side:v.side,fromChart:chartId,toChart:v.destinationChart,toCurrent:v.toCurrent,aperture:v.endpoint})),pressureInstances:pressureInstances.slice(0,4),props,lights:selectedLights,eye,yaw:worldYaw,pitch:camera.pitch,authoredCamera:{eye,yaw:worldYaw,pitch:camera.pitch},strictOverhead:camera.strictOverhead,cameraAimTarget:aim,studyRotation:rotation,hush,
    revealProgress:null,recovery:frame.recovery?{kind:frame.recovery.kind,elapsed:frame.recovery.elapsed,duration:frame.recovery.duration}:null,floorH:player.y+origin.y,falling:!!frame.fall,activeLevel:state.level,
    shownLevels:[...shownLevels].sort((a,b)=>a-b),hiddenAbove,geometry:{surfaces,solids,doors},source:frame,surroundings,
    counts:{surfaces:props.filter(p=>p.physicalKind==='surface').length,solids:props.filter(p=>p.physicalKind==='solid').length,props:props.length,lights:selectedLights.length,body:props.filter(p=>p.playerBody).length,hush:pressureInstances.length?1:0,hushViews:pressureInstances.length},
    noteArchitecture:restScenery?.noteArchitecture?.diagnostics||null,...(phaseOf(state)==='catch'?{harpsichord:restScenery?.harpsichord||null}:{}),
    restHorizon,horizon:restHorizon?{...restHorizon.diagnostics,centre:restHorizon.centre,tides:destruction.diagnostics.horizonTides??0}:null,
    sourceCodeInstances,parserArchitecture,executionTrail:executionTrail.diagnostics,freedMemory:{...freedMemory.diagnostics,canonicalRetained:canonicalCode.length,submitted:sourceCodeInstances.length,voidCopies:codeVoidCopies.props.length},
    affliction:affliction?{...affliction}:null,destruction:destruction.diagnostics,restReturn:restReturn.diagnostics,voidLoop:voidCopies.diagnostics,escher,leaves,riftFaults,ambientFaults,ambientFaultDiagnostics:{batches:ambientFaults.length,sheets:ambientFaults.reduce((n,p)=>n+p.faultSheets,0)},coastalEchoes,chunkFault:{active:chunkFault.active,stage:chunkFault.stage,frontX:chunkFault.frontX,proximity:chunkFault.proximity,touching:chunkFault.touching,collisionActive:chunkFault.collisionActive,parts:chunkFault.pieces.length},sunset:state.sourceRestView?.weatherCue?.sunset||null,
    flood:restScenery?.flood?{...restScenery.flood,props:undefined,water:{...restScenery.flood.water,
      siteMatrix:multiply(matrix(origin.x,origin.y,origin.z),restScenery.flood.water.siteMatrix),
      lights:(restScenery.flood.water.lights||[]).map(l=>({...l,position:l.position.map((n,k)=>n+[origin.x,origin.y,origin.z][k])}))}}:null,
    architecture:{persistentRegions:[...new Set(surfaces.map(regionOf))],renderedRegions:[...new Set(props.map(p=>p.region).filter(Boolean))],assemblies:props.filter(p=>p.assemblyId).map(p=>({id:p.assemblyId,mesh:p.mesh,orientation:p.orientation,supportId:p.supportId})),catchStages:SOURCE_CONTINUATION.catch.levels,
      stairTreads:surfaces.filter(p=>p.role==='stair').length,spindleContinuous:true,upperRemnantHeight:100,far:SOURCE_CONTINUATION_ARCHITECTURE.far,instances:props.length}};
}

export function createSourceContinuationRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,onRelease=()=>{},anchor={x:0,y:0,z:0},installMeshes=installSourceContinuationMeshes,getViewport=()=>renderer.r3dViewCamera?.(),getTorch=()=>({on:false,look:{power:0}}),getLighting=()=>null,getReducedMotion=()=>false,getFlashMode=()=> 'full',studyRotation=0}={}){
  const rangeOwner=Symbol('source-continuation-range');
  let releaseRange=null,initialized=false,released=false,loading=null,repair=null,error=null,last=null,lastRestState=null,lastViewport=null,lastFalling=false,lastFoldSerial=0,torchFrame={on:false,look:{power:0}},lightingFrame=sourceContinuationLighting(),lightingKey='';
  const customNames=meshLibrary.map(p=>p.name),required=requiredMeshes();
  const noteAsset=createSourceRestNoteAsset({resolveAsset});
  const couperinNoteAsset=createSourceRestNoteAsset({resolveAsset,url:'audio/source-rest/couperin/couperin-revoicing.json'});
  const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return required.every(mesh=>catalog.has(mesh))&&renderer.r3dHushBodyReady?.()===true;};
  function clearSource(){
    renderer.r3dSetSourceRestFaculties?.(null);renderer.r3dSetSourceRestHorizon?.(null);
    renderer.r3dSetStormFlash?.(0);
    renderer.r3dSetSourceWeather?.({rain:0,moon:0,clouds:0});props.setPressureSurfaceInstances?.([]);
    renderer.r3dSetHorizon?.(null);renderer.r3dSetSourceShore?.(null);renderer.r3dSetSourceEmergency?.(0);renderer.r3dSetSourceWhiteout?.(0);renderer.r3dSetSourceFault?.(0);renderer.r3dSetLocalLights?.([]);renderer.r3dSetEmergencyShadows?.([]);renderer.r3dSetSourcePortals?.([]);renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetSourceOpenings?.([]);renderer.r3dSetSourceDoorLights?.([]);renderer.r3dSetSourceCrossing?.(null);renderer.r3dSetSourceReflection?.(null);renderer.r3dSetIndoorRain?.(0);renderer.r3dSetSourceTextInstances?.([]);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetProps?.([]);props.setPressureInstances?.([]);props.setSourceSurroundingsGate?.(null);props.setSourceSurroundingsPressure?.(null);
  }
  async function install(){
    if(released)return false;void noteAsset.load();await prewarmSourceContinuationAssets({renderer,props,resolveAsset,installMeshes});return!released;
  }
  function updateLighting(){const next=sourceContinuationLighting(getLighting?.()),sun=last?.sunset;
    if(sun?.amount>0){const warmth=sun.amount*(1-.75*(sun.storm||0));next.ambientColor=next.ambientColor.map((v,k)=>mix(v,[.87,.52,.30][k],warmth*.70));}
    const key=JSON.stringify(next);if(key!==lightingKey){renderer.r3dSetLightingContext?.(next);lightingFrame=next;lightingKey=key;}return next;}
  function initialize(){
    if(loading)return loading;loading=(async()=>{
      if(released)return false;
      if(!await install()||released)return false;
      if(typeof props.setAuthoredPropRange!=='function')throw Error('The Source continuation far-range lease is unavailable.');
      releaseRange=props.setAuthoredPropRange(rangeOwner,SOURCE_CONTINUATION_ARCHITECTURE.far);
      clearSource();props.setSourceSurroundingsGate?.({x:finite(anchor.x)+SOURCE_JOURNEY.gate.x,y:finite(anchor.y)+SOURCE_JOURNEY.gate.y-.01,z:finite(anchor.z)+SOURCE_JOURNEY.gate.z,width:2.2,height:2.86});const size=256,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=0;i<rgba.length;i+=4)rgba.set([0,0,0,ZONE.sourceSpace],i);
      renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene({key:'source:wrong-return-and-the-catch',look:{roomMemoryActive:true,blueprint:true,chroma:.78,paper:0,finish:'silicon'},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});renderer.r3dSetLookProfile?.('explore',{transitionMs:0});updateLighting();renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(reason=>{releaseRange?.();releaseRange=null;error=String(reason?.message||reason);throw reason;});return loading;
  }
  let escherMemory=null,leafMemory=null;
  function render(state){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){
      // ready() freezes the local body while this catalogue is repaired. Keep
      // its last presented raster instead of flashing a loading-black frame.
      if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});return true;
    }
    const serial=Math.max(0,Math.floor(finite(state.lastFold?.serial,finite(state.foldSerial))));
    if(serial!==lastFoldSerial){renderer.r3dResetVfdMemory?.();renderer.r3dSnapCameraOnNextFrame?.();lastFoldSerial=serial;}
    if(state.phase==='catch'&&couperinNoteAsset.snapshot().state==='unloaded')void couperinNoteAsset.load();
    const viewport=getViewport?.(),bodyCatalog=new Set(props.propMeshCatalog?.()||[]);
    lastViewport=viewport;
    lastRestState={phase:state.phase,chartId:state.chartId??0,sourceRestView:state.sourceRestView};
    last=sourceContinuationRenderFrame(state,{anchor,viewportAspect:viewport?.width&&viewport?.height?viewport.width/viewport.height:16/9,viewportTanHalfFov:viewport?.tanHalfFov||.95,studyRotation,reducedMotion:!!getReducedMotion(),noteScore:noteAsset.snapshot().score,couperinNoteScore:couperinNoteAsset.snapshot().score,flashMode:getFlashMode(),restBodyReady:SOURCE_REST_HAND_MESHES.every(name=>bodyCatalog.has(name)),escherMemory,leafMemory});escherMemory=last.escher?.memory||null;leafMemory=last.leaves?.memory||null;props.setSourceSurroundingsGate?.(last.surroundings.gate);props.setSourceSurroundingsPressure?.(last.surroundings.pressure);renderer.r3dSetProps([...last.props,...last.sourceCodeInstances,...last.parserArchitecture.props,...last.escher.props,...last.riftFaults,...last.ambientFaults,...last.coastalEchoes]);renderer.r3dSetDynamicProps?.(last.leaves?.props||[]);renderer.r3dSetLocalLights(last.lights);
    const restSeat=SOURCE_REST_SEATS.find(seat=>seat.phase===state.phase),distance=restSeat?Math.hypot(state.x-restSeat.x,state.z-restSeat.z):Infinity,near=!!restSeat&&state.chartId===restSeat.chartId&&Math.abs(state.feet-restSeat.feet)<1;
    const weatherPresence=near?Math.max(0,Math.min(1,(16-distance)/10)):0,cue=state.sourceRestView?.weatherCue;
    renderer.r3dSetSourceWeather?.({rain:(cue?.rain||0)*weatherPresence,moon:(cue?.moon||0)*weatherPresence,clouds:(cue?.clouds||0)*weatherPresence,
      horizon:(cue?.horizon||0)*weatherPresence,clock:cue?.clock||0,sunset:cue?.sunset?{...cue.sunset,amount:cue.sunset.amount*weatherPresence}:null});
    const flashMode=getFlashMode(),flash=cue?.judgment?.flash||0;
    renderer.r3dSetStormFlash?.(flashMode==='off'?0:flash*Math.min(flashMode==='reduced'?.12:1,getReducedMotion()?.20:1)*weatherPresence);
    // The body's decline loses acquired colour/form; it is not an NVMe/PS2
    // transmission fault layered over an otherwise intact world.
    renderer.r3dSetSourceFault?.(0);
    last.faculties=sourceRestFacultyFrame(state.sourceRestView?.degradation||0,{
      affliction:last.affliction,reducedMotion:!!getReducedMotion(),
      reducedDread:state.sourceRestView?.reducedDread===true,effectsMode:state.sourceRestView?.effectsMode||'full',
    });renderer.r3dSetSourceRestFaculties?.(last.faculties);
    renderer.r3dSetSourceRestHorizon?.(last.restHorizon||null);
    if(last.falling||lastFalling||last.authoredCamera)renderer.r3dSnapCameraOnNextFrame?.();lastFalling=last.falling;
    renderer.r3dSetSourceFinish?.(phaseOf(state)==='catch'?'bismuth':'silicon');
    updateLighting();const heldTorch=getTorch?.();torchFrame={on:!!heldTorch?.on,look:{...(heldTorch?.look||{})}};
    return renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.floorH,authoredPropRange:SOURCE_CONTINUATION_ARCHITECTURE.far,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:last.hush,hushSecondary:null,sourcePressureInstances:last.pressureInstances,audio:0,light:torchFrame.on?1:0,torchLook:torchFrame.look,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false,sourceDitherIntensity:continuationDitherIntensity(state),coastalMemory:last.flood?.water||null,...(last.authoredCamera?{authoredCamera:last.authoredCamera}:{})})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();releaseRange?.();releaseRange=null;onRelease();return true;}
  return{initialize,render,restApertureFrame:()=>initialized&&!released&&!repair&&!error?sourceRestApertureFrame(last,lastRestState,{anchor,viewport:lastViewport}):null,reducedMotion:()=>!!getReducedMotion(),acousticFrame:sourceContinuationAcousticFrame,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,restoringScenery:!!repair,error,noteScore:{state:noteAsset.snapshot().state,error:noteAsset.snapshot().error,notes:noteAsset.snapshot().score?.notes.length||0},couperinNoteScore:{state:couperinNoteAsset.snapshot().state,error:couperinNoteAsset.snapshot().error,notes:couperinNoteAsset.snapshot().score?.notes.length||0},lighting:{...lightingFrame},meshCount:customNames.length,triangles:meshTriangles,frame:last?{phase:last.phase,chartId:last.chartId,portals:last.portals,pressureInstances:last.pressureInstances,eye:[...last.eye],pitch:last.pitch,yaw:last.yaw,cameraAimTarget:last.cameraAimTarget,strictOverhead:last.strictOverhead,studyRotation:last.studyRotation,revealProgress:last.revealProgress,recovery:last.recovery,activeLevel:last.activeLevel,shownLevels:last.shownLevels,hiddenAbove:last.hiddenAbove,counts:last.counts,hush:last.hush,architecture:last.architecture,surroundings:last.surroundings,noteArchitecture:last.noteArchitecture,horizon:last.horizon,harpsichord:last.harpsichord,affliction:last.affliction,faculties:last.faculties,destruction:last.destruction,restReturn:last.restReturn,voidLoop:last.voidLoop,parserArchitecture:last.parserArchitecture.diagnostics,executionTrail:last.executionTrail,flood:last.flood,torch:torchFrame,lighting:{...lightingFrame}}:null})};
}
