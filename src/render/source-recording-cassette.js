// Borrowed world renderer: the same P3 material/depth targets and the game's
// final acquisition. No additional canvas, animation loop or graphics context.
import {SOURCE_RECORDING_CASSETTE as C,SOURCE_RECORDING_CASSETTE_MESHES as MESHES,
  SOURCE_RECORDING_CASSETTE_CONTROLS,sourceRecordingCassetteGeometry,sourceRecordingCassetteIdentity,
  sourceRecordingCassetteLabelMesh,sourceRecordingCassetteParts,sourceRecordingCassetteRotation,installSourceRecordingDA1000Geometry,sourceRecordingDA1000Status} from './source-recording-cassette-model.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {cameraBasis} from './camera-basis.js';
import {ensureWorldLetteringFonts} from './world-lettering-fonts.js';
import {fitWorldLetteringLine} from './world-lettering-layout.js';
import {sourceSurfaceInkRGBA} from './source-surface-lettering.js';
import {uiSize,uiText} from './ui.js';
import {drawRecorderReadoutCanvas} from './recorder-instrument.js';
export * from './source-recording-cassette-model.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0)),identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
 mul=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;},
 point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[12+k]),
 vector=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const pending=new WeakMap(),labels=new WeakMap(),displays=new WeakMap();let recorderLoad=null;
const labelState=pack=>{let state=labels.get(pack);if(!state){state={entries:new Map(),pins:new Map(),serial:0,evictions:0};labels.set(pack,state);}return state;};
export function sourceRecordingCassetteMeshPayload(piece){
 const positions=[],normals=[],uvs=[];
 for(let at=0;at<piece.i.length;at+=3){const vertices=piece.i.slice(at,at+3).map(i=>piece.p.slice(i*3,i*3+3)),[a,b,c]=vertices,
  u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]),raw=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...raw)||1,n=raw.map(v=>v/length);
  for(const p of vertices){positions.push(...p);normals.push(...n);
   if(piece.label){const face=at<6?'front':at<12?'back':'spine',x=clamp((p[0]+(face==='front'?.030:.034))/(face==='front'?.060:face==='back'?.066:.064));
    if(face==='front')uvs.push(x,.57+.43*clamp((p[1]+.008)/.030));
    else if(face==='back')uvs.push(1-x,.12+.43*clamp((p[1]+.007)/.029));
    else uvs.push(x,.10*clamp((p[2]+.004)/.008));
   }else if(piece.display){const sc=C.recorderScale;uvs.push(clamp((p[0]/sc+333/300)/(666/300)),clamp((p[1]/sc-(202.5-195.5-119.5)/300)/(239/300)));}
   else uvs.push(p[0]*25,p[1]*25);
  }
 }
 return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:Uint32Array.from({length:positions.length/3},(_,k)=>k)};
}
export function installSourceRecordingCassetteMeshes(gl,pack){
 if(!gl||!pack?.catalog)return false;
 for(const[name,piece]of Object.entries(sourceRecordingCassetteGeometry())){
  if(pack.catalog.has(name))continue;const d=sourceRecordingCassetteMeshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
  for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
  for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
  const bounds={min:[0,1,2].map(k=>Math.min(...piece.p.filter((_,i)=>i%3===k))),max:[0,1,2].map(k=>Math.max(...piece.p.filter((_,i)=>i%3===k)))};
  pack.catalog.set(name,{name,nodeMatrix:identity(),instanceBuffer,cullBounds:bounds,cullBoundsValid:true,extras:{sourceRecordingCassette:true,bounds,triangles:piece.triangles},
   primitives:[{vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:piece.base,emissive:[0,0,0],materialFactors:'gltf',metallic:piece.metallic,roughness:piece.roughness,aoStrength:1,portrait:false,alphaCut:0,materialName:name,nativeReceiverGeometry:d}]});
 }
 gl.bindVertexArray(null);return MESHES;
}
function labelBitmap(recording,{ownerDocument=globalThis.document,identityOnly=false,stock=null}={}){
 const data=sourceRecordingCassetteIdentity(recording),colour=ownerDocument.createElement('canvas'),mask=ownerDocument.createElement('canvas');
 colour.width=mask.width=C.labelWidth;colour.height=mask.height=C.labelHeight;
 const c=colour.getContext('2d',{willReadFrequently:true}),m=mask.getContext('2d',{willReadFrequently:true}),rows=[];
 c.scale(C.labelWidth/1024,C.labelHeight/512);m.scale(C.labelWidth/1024,C.labelHeight/512);
 c.fillStyle='#c6bea0';c.fillRect(0,0,1024,512);m.clearRect(0,0,1024,512);
 const ink=(text,x,y,w,h,role='mono',maxFont=40)=>{const fit=fitWorldLetteringLine(c,text,{width:w,height:h,maxFont,minFont:3,role});if(!fit.fits)throw Error('Cassette label does not fit its physical row.');
  m.font=fit.font;m.textBaseline='alphabetic';m.textAlign='left';m.fillStyle='#fff';c.fillStyle='#22251d';const baseline=y+fit.ascent;c.fillText(fit.text,x+fit.left,baseline);m.fillText(fit.text,x+fit.left,baseline);rows.push({...fit,x,y,baseline});};
 ink('AUDIOCORP / FIELD CARTRIDGE',28,12,950,35,'sansBold',30);
 if(stock){
  const number=Number(stock.cassetteNumber),ordinal=Number.isSafeInteger(number)&&number>0?String(number).padStart(3,'0'):data.ordinalLabel;
  const content=stock.content,room=content?.roomId?sourceRecordingCassetteIdentity({roomId:content.roomId}).room:'';
  const status=content===null?'UNRECORDED':content?.kind==='take'?'RECORDED':'';
  ink(`CASSETTE ${ordinal}`,28,62,950,63,'monoBold',64);
  if(status)ink(status,28,130,950,45,'sansBold',41);
  if(room)ink(room,28,183,950,30,'sansBold',27);
  ink(`CASSETTE ${ordinal}`,28,238,950,43,'monoBold',38);
  if(content?.takeId)ink(content.takeId,28,294,950,32,'mono',28);
  if(room)ink(room,28,335,950,32,'sansBold',28);
  ink(`CASSETTE ${ordinal}${status?'  /  '+status:''}`,18,465,985,34,'monoBold',31);
 }else if(identityOnly){
  // Stock can have a number without a take. Do not invent a place, duration,
  // slate or an UNRECORDED claim when only its inventory identity is known.
  ink(`CASSETTE ${data.ordinalLabel}`,28,62,950,63,'monoBold',64);
  ink(`CASSETTE ${data.ordinalLabel}`,28,238,950,43,'monoBold',38);
  ink(`CASSETTE ${data.ordinalLabel}`,18,465,985,34,'monoBold',31);
 }else{
 ink(`TAKE ${data.ordinalLabel}`,28,62,950,63,'monoBold',64);ink(data.room,28,130,950,45,'sansBold',41);
 ink(`${data.duration}  /  ${data.takeId||'NO TAPE ID'}`,28,183,950,30,'mono',27);
 ink(`TAKE ${data.ordinalLabel}  ·  ${data.room}`,28,238,950,43,'monoBold',38);
 const slate=data.slateText||'No slate text retained.',chunks=slate.match(/.{1,74}(?:\s|$)|.{1,74}/g)||[slate],pitch=Math.min(34,138/Math.max(1,chunks.length));
 chunks.forEach((text,n)=>ink(text,28,294+n*pitch,950,pitch-2,'mono',Math.min(28,pitch-3)));
 ink(`${data.ordinalLabel}  ${data.room}  ${data.duration}`,18,465,985,34,'monoBold',31);
 }
 // Causal label-edge rub: on stock margins only; exact printed letters survive.
 c.fillStyle='#a9a28b';for(let n=0;n<12;n++)c.fillRect(3+n*83,n%2?209:2,30+n%5,2);
 const rgb=c.getImageData(0,0,C.labelWidth,C.labelHeight).data,coverage=m.getImageData(0,0,C.labelWidth,C.labelHeight).data;
 return{pixels:sourceSurfaceInkRGBA(rgb,coverage,{width:C.labelWidth,flipY:true}),width:C.labelWidth,height:C.labelHeight,identity:data,rows};
}
// The carried cartridge borrows the same authored front/back/spine raster.
export { labelBitmap as sourceRecordingCassetteLabelBitmap };
export function installSourceRecordingCassetteLabels(gl,pack,recordings=[],options={}){
 if(!gl||!pack?.catalog?.has('source_recording_cassette_label'))return false;
 const state=labelState(pack),cache=state.entries,owner=options.labelOwner??'world',requested=new Set(recordings.map(sourceRecordingCassetteLabelMesh)),pins=new Map(state.pins);pins.set(owner,requested);
 const pinned=new Set([...pins.values()].flatMap(set=>[...set]));if(pinned.size>C.labelTextureBudget)return false;
 state.pins=pins;
 for(const recording of recordings){const name=sourceRecordingCassetteLabelMesh(recording),key=sourceRecordingCassetteIdentity(recording).key,existing=cache.get(name);
  if(existing?.key===key&&pack.catalog.get(name)===existing.mesh){existing.used=++state.serial;continue;}
  if(existing){if(pack.catalog.get(name)===existing.mesh)pack.catalog.delete(name);gl.deleteTexture(existing.texture);cache.delete(name);}
  while(cache.size>=C.labelTextureBudget){const old=[...cache].filter(([name])=>!pinned.has(name)).sort((a,b)=>a[1].used-b[1].used)[0];if(!old)return false;
   const[name,entry]=old;if(pack.catalog.get(name)===entry.mesh)pack.catalog.delete(name);gl.deleteTexture(entry.texture);cache.delete(name);state.evictions++;
  }
  const bitmap=labelBitmap(recording,options),texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,bitmap.width,bitmap.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bitmap.pixels);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const source=pack.catalog.get('source_recording_cassette_label'),mesh={...source,name,extras:{...source.extras,labelKey:key,identity:bitmap.identity,physicalLabelRows:bitmap.rows},
   primitives:source.primitives.map(p=>({...p,base:[1,1,1,1],texture,materialName:'cassette actual take paper label',roughness:.91,
    printedSurface:{version:1,coverage:'baseColorAlpha',polarity:'dark-on-light',process:'physical recorder paper label',emission:'none',sampling:'area'}}))};
  pack.catalog.set(name,mesh);cache.set(name,{key,texture,mesh,used:++state.serial,bytes:bitmap.pixels.length});
 }return true;
}
// The Source base pack has already loaded these world fonts. A newly withheld
// interval can therefore gain its real label without reloading any asset pack.
export function ensureSourceRecordingCassetteLabels({props,recordings=[],ownerDocument,labelOwner='world'}={}){
 if(typeof props?.installAuthoredPropMeshes!=='function')return false;
 return props.installAuthoredPropMeshes?.((gl,pack)=>installSourceRecordingCassetteLabels(gl,pack,recordings,{ownerDocument,labelOwner}))!==false;
}
export function releaseSourceRecordingCassetteLabels({props,labelOwner='world'}={}){return props?.installAuthoredPropMeshes?.((_gl,pack)=>{labels.get(pack)?.pins.delete(labelOwner);return true;})!==false;}
export function sourceRecordingCassetteResourceStatus(props){let result={resident:false,labelTextures:0,labelBytes:0,labelBudget:C.labelTextureBudget,evictions:0};props?.installAuthoredPropMeshes?.((_gl,pack)=>{const s=labels.get(pack),g=sourceRecordingCassetteGeometry();result={...result,resident:MESHES.every(name=>pack.catalog.has(name)),baseMeshes:MESHES.length,labelTextures:s?.entries.size||0,labelBytes:s?[...s.entries.values()].reduce((n,e)=>n+e.bytes,0):0,pinnedLabels:s?new Set([...s.pins.values()].flatMap(v=>[...v])).size:0,evictions:s?.evictions||0,
  inspectionTriangles:sourceRecordingCassetteParts({tapeFraction:.5},identity(),{labelReady:false,includeTransport:true}).reduce((n,p)=>n+(g[p.mesh]?.triangles||g[p.mesh.replace('-disabled','')]?.triangles||0),0),
  worldCaseTriangles:sourceRecordingCassetteParts({tapeFraction:.5},identity(),{labelReady:false}).reduce((n,p)=>n+(g[p.mesh]?.triangles||0),0)};result.estimatedLabelMipBytes=Math.ceil(result.labelBytes*4/3);return true;});return result;}
export async function prewarmSourceRecordingCassetteMeshes({renderer,props,recordings=[],ownerDocument,labelOwner='world',recorderBuffer}={}){
 if(!renderer||!props){const parts=await Promise.all([import('./r3d.js'),import('./props3d.js')]);renderer||=parts[0];props||=parts[1];}
 if(pending.has(props)){await pending.get(props);return prewarmSourceRecordingCassetteMeshes({renderer,props,recordings,ownerDocument,labelOwner,recorderBuffer});}
 const task=(async()=>{if(await renderer.r3dBasePropsReady?.()===false)return false;
  await ensureWorldLetteringFonts(ownerDocument?{ownerDocument}:{});
  if(!sourceRecordingDA1000Status().ready){
   if(recorderBuffer)installSourceRecordingDA1000Geometry(recorderBuffer);
   else{if(!recorderLoad)recorderLoad=fetch(new URL('/assets/items/field-recorder.glb',globalThis.location?.href||'http://localhost/')).then(r=>{if(!r.ok)throw Error('DA-1000 original geometry unavailable.');return r.arrayBuffer();}).then(installSourceRecordingDA1000Geometry).catch(error=>{recorderLoad=null;throw error;});await recorderLoad;}
  }
  if(props.installAuthoredPropMeshes?.(installSourceRecordingCassetteMeshes)===false)return false;
  if(props.installAuthoredPropMeshes?.((gl,pack)=>installSourceRecordingCassetteLabels(gl,pack,recordings,{ownerDocument,labelOwner}))===false)return false;
  const names=new Set(props.propMeshCatalog?.()||[]);return MESHES.every(name=>names.has(name))&&recordings.every(row=>names.has(sourceRecordingCassetteLabelMesh(row)));
 })().finally(()=>pending.delete(props));pending.set(props,task);return task;
}

export function sourceRecordingCassetteInspectionFrame(frame={},entryCamera={eye:[0,1.62,0],yaw:0,pitch:0},{width=1280,height=720}={}){
 const eye=Array.isArray(entryCamera.eye)?[...entryCamera.eye]:[entryCamera.eye?.x,entryCamera.eye?.y,entryCamera.eye?.z];if(!eye.every(Number.isFinite))return{props:[],targets:[],error:'Invalid cartridge inspection eye.'};
 const recorderAvailable=frame.recorderAvailable!==false,showTransport=recorderAvailable&&frame.showTransport!==false;
 const yaw=Number.isFinite(entryCamera.yaw)?entryCamera.yaw:0,pitch=Number.isFinite(entryCamera.pitch)?entryCamera.pitch:0,basis=cameraBasis(yaw,pitch),zoom=clamp(frame.zoom||1,.65,1.8),distance=recorderAvailable?clamp(.58/zoom,.37,.80):clamp(.23/zoom,.15,.35),
  position=eye.map((n,k)=>n+basis.forward[k]*distance),
  base=new Float32Array([...basis.right,0,...basis.up,0,...basis.forward.map(n=>-n),0,...position,1]),
  devRotation=sourceRecordingCassetteRotation(frame.deviceYaw||0,frame.devicePitch||0,frame.deviceRoll||0),
  deviceRoot=recorderAvailable?mul(mul(base,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,.020,-.054,0,1])),devRotation):base,
  dock=recorderAvailable?clamp(frame.dockProgress):0,orient=clamp(dock/.60),lower=clamp((dock-.60)/.40),loose=recorderAvailable?[-.104,.140,.052]:[0,.015,0],raised=[0,.150,.001],seated=C.pocket.centre,
  offset=loose.map((v,k)=>v+(raised[k]-v)*orient+(seated[k]-raised[k])*lower),cartridgePosition=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,...offset,1]),
  rotation=sourceRecordingCassetteRotation((frame.yaw||0)*(1-orient),(frame.pitch||0)*(1-orient)-Math.PI/2*orient,(frame.roll||0)*(1-orient)),
  root=mul(mul(deviceRoot,cartridgePosition),rotation),
  props=sourceRecordingCassetteParts(frame,root,{includeTransport:showTransport,transportRoot:deviceRoot}),targets=[];
 for(const[id,control]of Object.entries(SOURCE_RECORDING_CASSETTE_CONTROLS)){
  if(control.device&&!showTransport||!control.device&&dock>.03)continue;
  const matrix=control.device?deviceRoot:root,scale=control.device?C.recorderScale:1,p=control.position.map(n=>n*scale),
   normal=vector(matrix,[0,0,1]),at=point(matrix,p),toEye=eye.map((n,k)=>n-at[k]);if(dot(normal,toEye)<=Math.hypot(...toEye)*.15)continue;
  targets.push({id,position:at,normal,radius:control.radius*scale,enabled:!frame.deadlinePending||id==='stop',matrix});
 }
 return{props,targets,root,base,deviceRoot,dockProgress:dock,identity:sourceRecordingCassetteIdentity(frame.recording),camera:{eye,yaw,pitch,lens:{focalLengthMm:35,sensorHeightMm:24,focusDistanceM:distance,apertureFNumber:16,maxBlurPx:0}},
  width,height,tanHalfFov:24/70,distance,recorderAvailable,additionalLights:0};
}
export function sourceRecordingDA1000Readout(frame={}){
 const seconds=Math.max(0,Number(frame.positionSeconds)||0),duration=Math.max(0,Number(frame.durationSeconds)||0);
 return{mode:'play',counter:`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`,
 counterLabel:frame.available===false?'NO RECORDED SIGNAL':frame.loadingAudio?'CUEING':frame.playing?'TAPE RETURN':'TIME COUNTER',
 locationSeconds:duration||1,progress:duration?seconds/duration:0,levels:frame.levels||undefined};
}
export function updateSourceRecordingDA1000Display(gl,pack,frame={},ownerDocument=globalThis.document){
 const mesh=pack?.catalog?.get('source_recording_cassette_display');if(!mesh||!ownerDocument?.createElement)return false;
 let state=displays.get(pack);if(!state){const canvas=ownerDocument.createElement('canvas');canvas.width=666;canvas.height=239;
  state={canvas,texture:gl.createTexture(),signature:null};displays.set(pack,state);
  mesh.primitives=mesh.primitives.map(p=>({...p,texture:state.texture,emissive:[.10,.16,.11],materialName:'DA-1000 actual live VFD substrate'}));}
 const readout=sourceRecordingDA1000Readout(frame),signature=JSON.stringify(readout);if(signature===state.signature)return true;
 drawRecorderReadoutCanvas(state.canvas.getContext('2d'),readout);gl.bindTexture(gl.TEXTURE_2D,state.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,state.canvas);gl.generateMipmap(gl.TEXTURE_2D);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);state.signature=signature;return true;
}
export function sourceRecordingCassetteControlRegions(renderFrame){
 if(!renderFrame?.camera)return[];const {width,height,tanHalfFov,camera}=renderFrame,basis=cameraBasis(camera.yaw,camera.pitch),aspect=width/height,
  project=p=>{const d=p.map((n,k)=>n-camera.eye[k]),z=dot(d,basis.forward);return{x:(1+dot(d,basis.right)/(z*tanHalfFov*aspect))*width/2,y:(1-dot(d,basis.up)/(z*tanHalfFov))*height/2,z};};
 return renderFrame.targets.map(t=>{const centre=project(t.position),r=t.radius/centre.z/tanHalfFov*height/2,size=Math.max(18,r*2);
  if(centre.z<=.05||centre.x<-size||centre.x>width+size||centre.y<-size||centre.y>height+size)return null;
  return{id:t.id,x:centre.x-size/2,y:centre.y-size/2,w:size,h:size,enabled:t.enabled,depth:centre.z};
 }).filter(Boolean).sort((a,b)=>a.depth-b.depth);
}

export function createSourceRecordingCassetteRenderer({renderer,props,getTorch=()=>null,ownerDocument=globalThis.document,recorderBuffer}={}){
 let ready=false,closed=false,pendingInit=null,error=null,recording=null,entryCamera=null,last=null,frames=0,output=null;const labelOwner=Symbol('cassette-inspection');
 async function initialize(value){recording=value||recording||{};if(pendingInit)return pendingInit;
  pendingInit=(async()=>{if(!renderer||!props){const parts=await Promise.all([import('./r3d.js'),import('./props3d.js')]);renderer||=parts[0];props||=parts[1];}
   entryCamera=renderer.r3dViewCamera?.()||{eye:[0,1.62,0],yaw:0,pitch:0};
   ready=await prewarmSourceRecordingCassetteMeshes({renderer,props,recordings:[recording],labelOwner,ownerDocument,recorderBuffer});if(closed){releaseSourceRecordingCassetteLabels({props,labelOwner});return false;}if(!ready)throw Error('The physical recording cassette is not ready.');return true;
  })().catch(cause=>{error=String(cause?.message||cause);ready=false;return false;}).finally(()=>{pendingInit=null;});return pendingInit;
 }
 function render(frame={}){
  if(!ready||closed)return false;const camera=renderer.r3dViewCamera?.()||entryCamera,width=camera.width||1280,height=camera.height||720;
  last=sourceRecordingCassetteInspectionFrame({...frame,recording:frame.recording||recording},entryCamera,{width,height});if(last.error){error=last.error;return false;}
  props.installAuthoredPropMeshes?.((gl,pack)=>updateSourceRecordingDA1000Display(gl,pack,frame,ownerDocument));
  renderer.r3dSetProps?.(last.props);renderer.r3dSetDynamicProps?.([]);
  const prior=renderer.r3dPixelMeshStatus?.(),sourceMemory=prior?.sourceRoomMemoryActive===true,torch=getTorch()||{};
  const result=renderer.r3dFrame?.({px:0,py:0,floorH:0,authoredCamera:last.camera,authoredPropRange:4,
   tileW:1,tileH:1,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,hushSecondary:null,audio:0,
   // The world light owner applies look.power exactly once. Multiplying light
   // by it here as well would square battery/eligibility degradation.
   light:torch.on?1:0,torchLook:torch.look,plan:true,textSpace:sourceMemory,sourceVoidPhysical:false,water:{active:false},sensoryProfile:'story'});
  output=renderer.r3dPixelMeshStatus?.()||null;frames++;
  if(output&&(output.bypassedByTextSpace||output.enabled===false||output.shaderReady===false)){error='Cassette inspection final acquisition is unavailable or bypassed.';return false;}return result!==false;
 }
 function drawUI(frame={}){
  const {cols,rows}=uiSize();if(!cols||!rows)return;
  const narrow=cols<70,missing=frame.recorderAvailable===false,a=frame.deadlinePending?'06:00 — PUT THE CARTRIDGE BACK.':missing?'DRAG / ARROWS TURN   F REVERSE   WHEEL CLOSER':narrow?'DRAG TURN · F REVERSE · V DEVICE':'DRAG / ARROWS TURN   F REVERSE   V CARTRIDGE / RECORDER   WHEEL CLOSER',
   b=frame.deadlinePending?'S STOP · ESC PUT BACK':missing?'E KEEP RECORDING   ESC PUT BACK':narrow?'SPACE LISTEN · E KEEP · ESC PUT BACK':'SPACE / TAKES LISTEN   S STOP   R / T CUE   E KEEP RECORDING   ESC PUT BACK',
   status=frame.recorderAvailable===false?'RECORDER MISSING — E KEEP RECORDING · ESC PUT BACK':frame.notice||'';
  if(status)uiText(Math.max(1,(cols-status.length)/2),rows-4,status,'t-muted',1,cols-2);
  uiText(Math.max(1,(cols-a.length)/2),rows-2.5,a,'t-muted',1,cols-2);uiText(Math.max(1,(cols-b.length)/2),rows-1.3,b,'t-chunk',1,cols-2);
 }
 function projectedRegions(){
  const regions=sourceRecordingCassetteControlRegions(last),rect=renderer?.r3dCanvas?.()?.getBoundingClientRect?.();
  if(!rect||!(rect.width>0&&rect.height>0)||!last)return regions;
  const sx=rect.width/last.width,sy=rect.height/last.height;
  return regions.map(r=>({...r,x:rect.left+r.x*sx,y:rect.top+r.y*sy,w:r.w*sx,h:r.h*sy,space:'client-css'}));
 }
 return{initialize,ready:()=>ready&&!closed&&!error,render,drawUI,
  hitTest(x,y){return projectedRegions().find(r=>r.enabled&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)?.id||null;},
  projectedRegions,diagnostics:()=>({ready:ready&&!closed,error,frames,identity:last?.identity,camera:last?.camera,parts:last?.props.length||0,output,additionalLights:0,resources:sourceRecordingCassetteResourceStatus(props),device:sourceRecordingDA1000Status(),dockProgress:last?.dockProgress}),
  dispose(){closed=true;ready=false;last=null;releaseSourceRecordingCassetteLabels({props,labelOwner});/* Source redraws its props; shared materials stay resident. */}};
}
