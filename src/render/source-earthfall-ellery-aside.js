import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,F,ZONE,MATERIAL} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C,asideSmooth} from '../data/source-earthfall-ellery-aside.js';
import {SOURCE_ELLERY_ASIDE_ASSET as ASSET} from '../data/generated/source-earthfall-ellery-aside.js';
import {sourceEarthfallElleryAsideFrame,sourceElleryAsidePieceState,sourceElleryAsideObjectMatrix,multiplyAsideMatrix as mul} from '../game/source-earthfall-ellery-aside.js';
import {SOURCE_ELLERY_ASIDE_DUST as DUST} from '../game/source-earthfall-ellery-aside-dust.js';
import {sourceEarthfallGagRenderFrame,SOURCE_EARTHFALL_GAG_REQUIRED,SOURCE_EARTHFALL_GAG_PACK,SOURCE_EARTHFALL_GAG_APPARITION_MESH} from './source-earthfall-gag.js';
import {EARTHFALL_CHASE,EARTHFALL_CHASE_ARCHITECTURE,EARTHFALL_CHASE_FURNITURE,EARTHFALL_CHASE_OBSTACLES,earthfallChasePropMatrix,earthfallChaseFactors} from '../data/source-earthfall-chase.js';
import {fakeElleryHushActor} from './fake-ellery-hush.js';
const matrix=(x=0,y=0,z=0,yaw=0,sx=1,sy=sx,sz=sx)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return[c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1];};
const transformPoint=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
const rotateZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
const aboutZ=(p,a)=>mul(matrix(...p),mul(rotateZ(a),matrix(-p[0],-p[1],-p[2])));
const placed=(id,mesh,m,extra={})=>({id:'earthfall-ellery:'+id,mesh,matrix:m,x:m[12],y:m[13],z:m[14],zone:ZONE.getIn,structural:true,noReflection:true,...extra});
const DUST_MESHES=[...Array.from({length:DUST.variants},(_,i)=>DUST.mesh(i)),DUST.puffMesh];
export const SOURCE_EARTHFALL_ELLERY_ASIDE_REQUIRED=Object.freeze([...ASSET.panels.map(p=>p.mesh),...new Set(ASSET.props.map(p=>p.mesh)),...new Set(ASSET.doors.flatMap(d=>[d.assembly.frameMesh,d.assembly.leafMesh,d.assembly.freeStandingHeadMesh].filter(Boolean))),...DUST_MESHES,...SOURCE_EARTHFALL_GAG_REQUIRED,...new Set(EARTHFALL_CHASE_OBSTACLES.map(p=>p.mesh))]);
export function sourceEarthfallElleryAsideRenderFrame(value,presentation={}){
 const frame=sourceEarthfallElleryAsideFrame(value),props=[],lights=[],time=frame.elapsed,structuralStates=ASSET.panels.map(p=>sourceElleryAsidePieceState(p.id,time)),gagPresentation=sourceEarthfallGagRenderFrame(frame),world=frame.worldMatrix;
 if(frame.blackoutAlpha<1){
  for(const panel of ASSET.panels){if(frame.chaseEnabled&&panel.kind==='portal')continue;const state=structuralStates.find(s=>s.id===panel.id);let native=state.matrix;
   if(frame.chaseEnabled&&['roof-west:1:1','roof-east:1:0'].includes(panel.id)){const left=panel.id.startsWith('roof-west'),hinge=[left?panel.bounds.min[0]:panel.bounds.max[0],5.5,panel.pivot[2]];native=mul(native,aboutZ(hinge,(left?1:-1)*frame.chase.compression*1.05));}
   props.push(placed('panel:'+panel.id,panel.mesh,mul(world,native),{asideRole:'architecture',panel:panel.id,construction:panel.kind,host:panel.host,releaseAt:state.releaseAt}));}
  for(const p of ASSET.props){
   const native=matrix(p.x,p.y,p.z,p.yaw,p.scaleX??p.scale??1,p.scaleY??p.scale??1,p.scaleZ??p.scale??1),motion=sourceElleryAsideObjectMatrix(p.id,[p.x,p.y,p.z],time);
   props.push(placed(p.id,p.mesh,mul(world,mul(motion,native)),{asideRole:'furnishing',sourcePropId:p.id,originalMesh:p.originalMesh}));
  }
  for(const d of frame.doors){
   const assembly=d.assembly,root=mul(d.panelMatrix,matrix(d.x,d.y,d.z,d.yaw));
   props.push(placed('door:'+d.id+':frame',assembly.frameMesh,root,{asideRole:'door-frame',doorId:d.id}));
   if(assembly.freeStandingHeadMesh)props.push(placed('door:'+d.id+':head',assembly.freeStandingHeadMesh,root,{asideRole:'door-head',doorId:d.id}));
   for(let leaf=0;leaf<assembly.leafCount;leaf++)props.push(placed('door:'+d.id+':leaf:'+leaf,assembly.leafMesh,mul(root,doorLeafLocalMatrix(assembly,leaf,d.fraction)),{asideRole:'door-leaf',doorId:d.id,leafIndex:leaf,openFraction:d.fraction}));
   // The lamps over the doors go with their walls; they dim, never flicker.
   const lightP=transformPoint(d.panelMatrix,[d.x,d.y+2.6,d.z]),gain=(.15+.85*Math.sin(d.light*Math.PI/2))*(1-asideSmooth(C.wallsAt.north,C.fadeStart,time));
   lights.push({id:'earthfall-ellery:door-light:'+d.id,x:lightP[0],y:lightP[1],z:lightP[2],radius:7,intensity:gain*1.3,color:d.host==='west'?[1,.55,.24]:[.72,.73,.62],penetration:1});
  }
  for(const puff of frame.dust.puffs)props.push(placed('dust:'+puff.id,puff.mesh,puff.matrix,{asideRole:'dust',dust:puff.kind,structural:false}));
  props.push(...gagPresentation.props);
  if(frame.chaseEnabled){
   for(const p of EARTHFALL_CHASE_ARCHITECTURE){const m=p.matrix,r=EARTHFALL_CHASE.rooms.find(r=>r.id===p.room),at=[(r.minX+r.maxX)/2,0,(r.minZ+r.maxZ)/2],motion=sourceElleryAsideObjectMatrix(p.id,at,time);props.push(placed('copy:'+p.id,p.mesh,mul(world,mul(motion,m)),{asideRole:'copied-architecture',construction:p.kind,copiedRoom:p.room}));}
   for(const p of EARTHFALL_CHASE_FURNITURE){const native=matrix(p.x,p.y,p.z,p.yaw),motion=sourceElleryAsideObjectMatrix(p.id,[p.x,p.y,p.z],time);props.push(placed('copy:'+p.id,p.mesh,mul(world,mul(motion,native)),{asideRole:'copied-furnishing',sourcePropId:p.sourceId}));}
   for(const p of EARTHFALL_CHASE_OBSTACLES){const native=earthfallChasePropMatrix(p),motion=sourceElleryAsideObjectMatrix(p.id,[p.x,p.y,p.z],time);props.push(placed('obstacle:'+p.id,p.mesh,mul(world,mul(motion,native)),{asideRole:'memory-obstacle',sourcePropId:p.sourceId,sourcePack:p.sourcePack,memoryDomain:p.domain}));}
   // The adjoining practice room returns above the Dock, progressively
   // opposing its own floor. It turns around its construction, never the eye.
   // Its lowest full envelope remains at least2.25m above the physical floor.
   const p=frame.chase.compression,roll=p*Math.PI,q=earthfallChaseFactors(frame.chase),extent=3.61*Math.abs(Math.sin(roll))+1.77*Math.abs(Math.cos(roll)),height=Math.max(9.5-5*p,2.25/q.y+extent),overhead=mul(matrix(65.25,height,9.25),mul(rotateZ(roll),matrix(-65.75,-1.75,-22)));
   for(const part of EARTHFALL_CHASE_ARCHITECTURE.filter(p=>p.room==='practice-copy'))props.push(placed('inversion:'+part.id,part.mesh,mul(world,mul(overhead,part.matrix)),{asideRole:'inverted-room',copiedRoom:part.room,structural:false}));
   for(const p of EARTHFALL_CHASE_FURNITURE.filter(p=>p.id.startsWith('practice-')))props.push(placed('inversion:'+p.id,p.mesh,mul(world,mul(overhead,matrix(p.x,p.y,p.z,p.yaw))),{asideRole:'inverted-furnishing',structural:false}));
   const a=frame.chase.compression;for(const p of [{x:64.75,z:18.6},{x:78,z:16.5}]){const at=transformPoint(world,[p.x,2.5,p.z]);lights.push({id:'earthfall-ellery:copy-light:'+p.x,x:at[0],y:at[1],z:at[2],radius:8,intensity:.85*(1-.7*a),color:[.68,.67,.51],penetration:1});}
  }
 }
 return{...frame,props,lights,structuralStates,gagPresentation,authoredCamera:{eye:frame.eye,yaw:frame.yaw,pitch:frame.pitch},counts:{props:props.length,panels:props.filter(p=>p.asideRole==='architecture').length,doors:frame.doors.length,dust:frame.dust.puffs.length,gag:gagPresentation.props.length}};
}
export function createSourceEarthfallElleryAsideRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,getTorch=()=>({on:false,look:{power:0}}),diagnostics:diagnosticEnabled=false}={}){
 let ready=false,disposed=false,loading=null,last=null,error=null,repair=null,repairAttempts=0,lastDraws=null;
 const submissions=[],now=()=>globalThis.performance?.now?.()??Date.now(),submissionSummary=()=>{const ordered=submissions.slice().sort((a,b)=>a-b);return{kind:'CPU frame construction and render submission; excludes asynchronous GPU duration',samples:ordered.length,medianMs:ordered.length?ordered[Math.floor((ordered.length-1)*.5)]:null,p95Ms:ordered.length?ordered[Math.floor((ordered.length-1)*.95)]:null};};
 const resident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return SOURCE_EARTHFALL_ELLERY_ASIDE_REQUIRED.every(name=>catalog.has(name))&&renderer.r3dHushBodyReady?.()!==false;};
 const clear=()=>{for(const name of['r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetIndoorRain'])renderer[name]?.(0);for(const name of['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);props.setPressureInstances?.([]);props.setPressureSurfaceInstances?.([]);};
 function initialize(){if(loading)return loading;loading=(async()=>{
  if(await(renderer.r3dAuthoredPropsReady||renderer.r3dBasePropsReady)?.call(renderer)===false)throw Error('Ellery has not resolved.');if(disposed)return false;
  if(typeof renderer.r3dPrepareHushBody==='function')await renderer.r3dPrepareHushBody();if(disposed)return false;
  if(!resident()){const before=new Set(props.propMeshCatalog?.()||[]),remembered=[...ASSET.panels.map(p=>p.mesh),...ASSET.props.filter(p=>!p.sourcePack).map(p=>p.mesh)];
   if(remembered.some(name=>!before.has(name)))await props.addPropPack(resolveAsset(C.pack));if(disposed)return false;
   if(DUST_MESHES.some(name=>!new Set(props.propMeshCatalog?.()||[]).has(name)))await props.addPropPack(resolveAsset(C.dustPack));
   const catalogNow=new Set(props.propMeshCatalog?.()||[]);for(const pack of new Set(ASSET.props.filter(p=>p.sourcePack&&!catalogNow.has(p.mesh)).map(p=>p.sourcePack)))await props.addPropPack(resolveAsset('assets/'+pack));if(disposed)return false;const doors=ASSET.doors.flatMap(d=>[d.assembly.frameMesh,d.assembly.leafMesh,d.assembly.freeStandingHeadMesh].filter(Boolean)),catalog=new Set(props.propMeshCatalog?.()||[]);if(doors.some(name=>!catalog.has(name)))await props.addPropPack(resolveAsset('assets/conservatory-doors.glb'));
   if(disposed)return false;if(SOURCE_EARTHFALL_GAG_REQUIRED.filter(name=>name!==SOURCE_EARTHFALL_GAG_APPARITION_MESH).some(name=>!new Set(props.propMeshCatalog?.()||[]).has(name)))await props.addPropPack(resolveAsset(SOURCE_EARTHFALL_GAG_PACK));
   if(disposed)return false;if(!new Set(props.propMeshCatalog?.()||[]).has(SOURCE_EARTHFALL_GAG_APPARITION_MESH))await props.addPropPack(resolveAsset('assets/conservatory-props.glb'));
   for(const pack of new Set(EARTHFALL_CHASE_OBSTACLES.filter(p=>!new Set(props.propMeshCatalog?.()||[]).has(p.mesh)).map(p=>p.sourcePack))){if(disposed)return false;await props.addPropPack(resolveAsset('assets/'+pack));}
  }
  if(disposed)return false;if(!resident())throw Error('The remembered Scene Dock is incomplete.');ready=true;return true;
 })().catch(e=>{error=String(e?.message||e);throw e;});return loading;}
 function acquire(){
  clear();const size=192,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.serviceConcrete);for(let i=0;i<size*size;i++)rgba.set([0,0,F.SKY,ZONE.getIn],i*4);
  renderer.r3dSetPlan(rgba,size,size,material);renderer.r3dSetSourceScene?.({key:'source:earthfall-ellery-aside',look:{roomMemoryActive:false,blueprint:false,chroma:1,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
  renderer.r3dSetLightingContext?.({ambientColor:[.84,.57,.31],ambientIntensity:.055,captureExposure:2.4,whitePointScale:1});renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
 }
 let acquired=false;
 function ensureResident(){
  if(disposed)return Promise.resolve(false);
  if(resident()&&ready){repairAttempts=0;return Promise.resolve(true);}
  if(repair)return repair;if(repairAttempts>=3)return Promise.resolve(false);
  ready=false;loading=null;repairAttempts++;
  repair=initialize().then(ok=>{if(ok&&!disposed){acquired=false;error=null;repairAttempts=0;}return !!ok&&!disposed;}).catch(e=>{error=String(e?.message||e);return false;}).finally(()=>{repair=null;});return repair;
 }
 function render(state,presentation={}){if(disposed)return false;if(!ready||!resident()){void ensureResident();return last!=null;}
 const started=diagnosticEnabled?now():0;
 if(!acquired){acquire();acquired=true;}last=sourceEarthfallElleryAsideRenderFrame(state,presentation);renderer.r3dSetProps(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights(last.lights);renderer.r3dSetSourceWhiteout?.(last.dust.haze);const torch=getTorch();const drawn=renderer.r3dFrame({px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredCamera:last.authoredCamera,tileW:192,tileH:192,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:fakeElleryHushActor(last.localHush,{reducedMotion:!!presentation.reducedMotion}),audio:0,light:torch?.on?1:0,torchLook:torch?.look,plan:true,water:{active:false},sensoryProfile:'story',textSpace:false,sourceVoidPhysical:false})!==false;
 if(diagnosticEnabled){lastDraws=props.propPackStats?.()?.diagnostics??null;submissions.push(now()-started);if(submissions.length>300)submissions.shift();}return drawn;}
 return{initialize,render,ensureResident,ready:()=>ready&&!disposed&&resident(),release(){if(acquired){clear();acquired=false;}},dispose(){if(disposed)return false;disposed=true;ready=false;if(acquired)clear();return true;},diagnostics:()=>({ready:ready&&!disposed&&resident(),error,restoringScenery:!!repair,repairAttempts,...(diagnosticEnabled?{submission:submissionSummary(),actualPropDraws:lastDraws}:{}),frame:last?{elapsed:last.elapsed,phase:last.phase,eye:last.eye,counts:last.counts,blackoutAlpha:last.blackoutAlpha}:null})};
}
