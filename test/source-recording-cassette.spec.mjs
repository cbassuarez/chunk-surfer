import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {SOURCE_RECORDING_CASSETTE as C,SOURCE_RECORDING_CASSETTE_MESHES as NAMES,
 sourceRecordingCassetteGeometry,sourceRecordingCassetteParts,sourceRecordingCassetteWorldProps,sourceRecordingCassetteIdentity,sourceRecordingCassetteLabelMesh,installSourceRecordingDA1000Geometry,sourceRecordingDA1000Status} from '../src/render/source-recording-cassette-model.js';
import {installSourceRecordingCassetteMeshes,installSourceRecordingCassetteLabels,sourceRecordingCassetteMeshPayload,
 sourceRecordingCassetteInspectionFrame,sourceRecordingCassetteControlRegions,sourceRecordingCassetteResourceStatus,
 prewarmSourceRecordingCassetteMeshes,createSourceRecordingCassetteRenderer,releaseSourceRecordingCassetteLabels,sourceRecordingDA1000Readout} from '../src/render/source-recording-cassette.js';
import {cameraBasis} from '../src/render/camera-basis.js';
const glb=fs.readFileSync(new URL('../public/assets/items/field-recorder.glb',import.meta.url));
const originalDevice=glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength);installSourceRecordingDA1000Geometry(originalDevice);
const recording=(n=3)=>({id:'custody:'+n,takeId:'take:'+n,takeOrdinal:n,roomId:'main_b3',place:'STUDIO B3',durationSeconds:60.173,
 slate:{text:'Studio B3. One minute of room tone. The door is closed.'}}),
 eye={eye:[12,-2.38,24],yaw:.7,pitch:-.2},matrixPoint=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[12+k]),
 dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),geometry=sourceRecordingCassetteGeometry();
function fakeGL(){let serial=0;const deleted=[],textures=[],buffers=[];const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_INT:5,TEXTURE_2D:6,UNPACK_FLIP_Y_WEBGL:7,SRGB8_ALPHA8:8,RGBA:9,UNSIGNED_BYTE:10,TEXTURE_MIN_FILTER:11,LINEAR_MIPMAP_LINEAR:12,TEXTURE_MAG_FILTER:13,LINEAR:14,TEXTURE_WRAP_S:15,TEXTURE_WRAP_T:16,CLAMP_TO_EDGE:17,
 createVertexArray:()=>({vao:++serial}),createBuffer:()=>{const b={buffer:++serial};buffers.push(b);return b;},createTexture:()=>{const t={texture:++serial};textures.push(t);return t;},deleteTexture:t=>deleted.push(t)};
 for(const name of['bindVertexArray','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','vertexAttribDivisor','disableVertexAttribArray','vertexAttrib1f','bindTexture','pixelStorei','texImage2D','generateMipmap','texParameteri'])gl[name]=()=>{};
 return{gl,deleted,textures,buffers};}
function fakeDocument(){const text=[];let canvasNumber=0;return{fonts:{add(){}},text,createElement(name){assert.equal(name,'canvas');const kind=canvasNumber++%2;return{width:0,height:0,getContext(){return new Proxy({globalAlpha:1,getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),createRadialGradient:()=>({addColorStop(){}}),font:'14px mono',scale(){},clearRect(){},fillRect(){},fillText(value){text.push(String(value));},measureText(value){const size=parseFloat(this.font)||14;return{width:String(value).length*size*.58,actualBoundingBoxLeft:0,actualBoundingBoxRight:String(value).length*size*.58,actualBoundingBoxAscent:size*.75,actualBoundingBoxDescent:size*.20};},getImageData(_x,_y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let n=0;n<data.length;n+=4){data[n]=kind?255:198;data[n+1]=kind?255:190;data[n+2]=kind?255:160;data[n+3]=kind?(n===0?255:0):255;}return{data};}},{get:(target,key)=>key in target?target[key]:(()=>{})});}};}};}
function installed(){const gpu=fakeGL(),pack={catalog:new Map()},document=fakeDocument();installSourceRecordingCassetteMeshes(gpu.gl,pack);const props={propMeshCatalog:()=>[...pack.catalog.keys()],installAuthoredPropMeshes:fn=>fn(gpu.gl,pack)};return{...gpu,pack,document,props};}
function rayHits(q,x,y,m){let hits=0;for(let at=0;at<q.i.length;at+=3){const[a,b,c]=q.i.slice(at,at+3).map(k=>matrixPoint(m,q.p.slice(k*3,k*3+3))),d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-12)continue;
 const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d;if(u>=0&&v>=0&&u+v<=1)hits++;}return hits;}

test('original keyed field cartridge is sealed, finite and bounded with the actual DA-1000',()=>{
 const shell=geometry.source_recording_cassette_shell;
 assert.ok(Math.abs(Math.max(...shell.p.filter((_,k)=>k%3===0))-Math.min(...shell.p.filter((_,k)=>k%3===0))-C.width)<1e-8);
 assert.ok(Math.abs(Math.max(...shell.p.filter((_,k)=>k%3===1))-Math.min(...shell.p.filter((_,k)=>k%3===1))-C.height)<1e-8);
 assert.equal(C.format,'AUDIOCORP FIELD CARTRIDGE');assert.equal(C.reelCentres,undefined);
 for(const q of Object.values(geometry)){assert.ok(q.p.every(Number.isFinite));assert.equal(q.i.length%3,0);assert.ok(q.i.every(n=>Number.isInteger(n)&&n>=0&&n<q.p.length/3));const d=sourceRecordingCassetteMeshPayload(q);assert.ok([...d.positions,...d.normals,...d.uvs].every(Number.isFinite));assert.equal(d.indices.length,q.i.length);}
 const parts=sourceRecordingCassetteParts({recording:recording()},undefined,{labelReady:false,includeTransport:true}),triangles=parts.reduce((n,p)=>n+geometry[p.mesh].triangles,0);
 assert.ok(triangles>22000&&triangles<C.triangleBudget);assert.ok(parts.every(p=>p.structural===false&&p.decorative===true));
 assert.ok(!parts.some(p=>/reel|cradle|winding|key-play/.test(p.id)));
});
test('the device is imported from its real GLB, preserving battery cover, side inputs and rear construction',()=>{
 const s=sourceRecordingDA1000Status();assert.equal(s.source,'assets/items/field-recorder.glb');assert.equal(s.ready,true);
 for(const name of['recorder-diecast-body','removable-field-cell-cover','rear-vent-with-ten-open-slots','monitor-level-knob','recessed-XLR-pin','open-strap-bail'])assert.ok(s.sourceNodes.includes(name),name);
 assert.equal(s.sourceNodes.includes('zero-counter-electrode'),false,'the live readout replaces only the old idle display');
 assert.ok(s.triangles>20000);assert.ok(s.meshes.every(name=>geometry[name]));
});
test('protected transport edge and captive shutter replace direct exposed reel manipulation',()=>{
 const a=sourceRecordingCassetteParts({shutterOpen:0},undefined,{labelReady:false}),b=sourceRecordingCassetteParts({shutterOpen:1},undefined,{labelReady:false}),shutter=parts=>parts.find(p=>p.id.endsWith(':shutter'));
 assert.notDeepEqual(Array.from(shutter(a).matrix),Array.from(shutter(b).matrix));assert.equal(shutter(b).matrix[12],Math.fround(.022));
 assert.ok(a.some(p=>p.id.endsWith(':ribbon')));assert.ok(!a.some(p=>/reel|winding/.test(p.id)));
 // A window is geometry, covered by the moving shutter rather than painted ink.
 assert.equal(rayHits(geometry.source_recording_cassette_shell,-.016,-.020,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])),2,'reverse remains sealed behind the front access opening');
});
test('actual receipt identity controls front/back/spine aliases without inventing media, sides or a different recording',()=>{
 const r=recording(),id=sourceRecordingCassetteIdentity(r),before=structuredClone(r);
 assert.equal(id.ordinalLabel,'003');assert.equal(id.room,'STUDIO B3');assert.equal(id.duration,'1:00.1');assert.equal(id.takeId,'take:3');assert.equal(id.slateText,r.slate.text);assert.equal(id.side,'INDEX');
 assert.notEqual(sourceRecordingCassetteLabelMesh(r),sourceRecordingCassetteLabelMesh(recording(4)));assert.notEqual(sourceRecordingCassetteLabelMesh(r),sourceRecordingCassetteLabelMesh({...r,slate:{text:'Different original slate.'}}));assert.deepEqual(r,before);
 const payload=sourceRecordingCassetteMeshPayload(geometry.source_recording_cassette_label);assert.equal(payload.indices.length,18);assert.ok(Array.from(payload.uvs).every(n=>n>=0&&n<=1));
 assert.equal(sourceRecordingCassetteIdentity({}).ordinalLabel,'—');
});
test('world cartridge preserves Source overscale, exact centre height, upright II and face-up III anchors',()=>{
 for(const[width,pitch]of[[.40,0],[1.15,-Math.PI/2]]){const parts=sourceRecordingCassetteWorldProps({id:'return',x:16,y:1.28,z:-22,worldWidth:width,pitch,recording:recording()});
  const shell=parts[0],m=shell.matrix,scale=width/C.width;assert.equal(parts.length,8);assert.ok(Math.abs(Math.hypot(m[0],m[1],m[2])-scale)<1e-5);
  if(pitch===0)assert.ok(Math.abs(matrixPoint(m,[0,-C.height/2,0])[1]-(1.28-C.height/2*scale))<1e-6);
  else assert.ok(m[9]>0,'index face +Z must face upward under negative quarter-turn pitch');
  assert.ok(parts.every(p=>p.sourceRecordingReturn&&p.recordingReceiptId==='custody:3'&&p.structural===false));
 }
 assert.deepEqual(sourceRecordingCassetteWorldProps({x:NaN,y:0,z:0}),[]);
});
test('inspection independently rotates cartridge and actual complete DA-1000 while preserving the borrowed eye',()=>{
 const a=sourceRecordingCassetteInspectionFrame({recording:recording()},eye),b=sourceRecordingCassetteInspectionFrame({recording:recording(),yaw:Math.PI,pitch:.4},eye),c=sourceRecordingCassetteInspectionFrame({recording:recording(),deviceYaw:Math.PI},eye);
 assert.deepEqual(a.camera.eye,eye.eye);assert.equal(a.camera.yaw,eye.yaw);assert.equal(a.camera.pitch,eye.pitch);assert.equal(a.camera.lens.maxBlurPx,0);
 assert.notDeepEqual(Array.from(a.props[0].matrix),Array.from(b.props[0].matrix));assert.deepEqual(Array.from(a.deviceRoot),Array.from(b.deviceRoot));assert.notDeepEqual(Array.from(a.deviceRoot),Array.from(c.deviceRoot));
});
test('complete assembly clears the near plane throughout normal object turns and permitted zoom',()=>{
 for(const zoom of[.65,1,1.8])for(const yaw of[0,.7,Math.PI/2,Math.PI])for(const pitch of[-1.5,0,1.5])for(const deviceYaw of[0,Math.PI/2,Math.PI]){
  const f=sourceRecordingCassetteInspectionFrame({recording:recording(),yaw,pitch,roll:.5,deviceYaw,zoom},eye),basis=cameraBasis(f.camera.yaw,f.camera.pitch);
  for(const p of f.props){const q=geometry[p.mesh]||geometry.source_recording_cassette_label;for(let at=0;at<q.p.length;at+=3){const w=matrixPoint(p.matrix,q.p.slice(at,at+3)),d=w.map((n,k)=>n-f.camera.eye[k]);assert.ok(dot(d,basis.forward)>.05);}}
 }
});
test('the loading path rises clear before alignment and lowers into a genuine supported top pocket',()=>{
 const plain={eye:[0,0,0],yaw:0,pitch:0};
 for(let i=0;i<=100;i++){const dockProgress=i/100,f=sourceRecordingCassetteInspectionFrame({dockProgress},plain),shell=f.props[0],points=[];
  for(let k=0;k<geometry.source_recording_cassette_shell.p.length;k+=3){const w=matrixPoint(shell.matrix,geometry.source_recording_cassette_shell.p.slice(k,k+3)),d=w.map((v,k)=>v-f.deviceRoot[12+k]),local=[0,1,2].map(k=>dot(d,[f.deviceRoot[k*4],f.deviceRoot[k*4+1],f.deviceRoot[k*4+2]]));points.push(local);}
  const lo=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
  assert.ok(lo[1]>.0755,'never insert through the original solid chassis');
  if(dockProgress>.60){assert.ok(lo[0]>-.0435&&hi[0]<.0435);assert.ok(lo[2]>-.0295&&hi[2]<.031);}
  if(dockProgress===1){assert.ok(Math.abs(lo[1]-C.pocket.railY)<1e-6,'case rests on the actual rail tops');}
 }
});
test('actual REC STOP TAKES keys are pickable and depress; the cartridge shutter is unavailable once seated',()=>{
 const a=sourceRecordingCassetteInspectionFrame({recording:recording()},eye),regions=sourceRecordingCassetteControlRegions(a);assert.deepEqual(regions.map(r=>r.id).sort(),['rec','shutter','stop','takes']);
 assert.ok(regions.every(r=>Number.isFinite(r.x+r.y+r.w+r.h)&&r.depth>.05));assert.ok(regions.filter(r=>['rec','stop','takes'].includes(r.id)).every(r=>r.w>45),'the clickable region covers each actual physical key cap');
 const b=sourceRecordingCassetteInspectionFrame({recording:recording(),pressedControl:'takes',pressedAmount:1},eye),key=f=>f.props.find(p=>p.physicalControl==='takes');assert.notDeepEqual(Array.from(key(a).matrix),Array.from(key(b).matrix));
 const docked=sourceRecordingCassetteControlRegions(sourceRecordingCassetteInspectionFrame({dockProgress:1},eye));assert.ok(!docked.some(r=>r.id==='shutter'));
 const pending=sourceRecordingCassetteControlRegions(sourceRecordingCassetteInspectionFrame({deadlinePending:true},eye));assert.deepEqual(pending.filter(r=>r.enabled).map(r=>r.id),['stop']);
});
test('the existing recorder artwork receives only actual interval position and honest availability',()=>{
 const v=sourceRecordingDA1000Readout({positionSeconds:64.5,durationSeconds:100,playing:true});assert.equal(v.counter,'01:04');assert.equal(v.progress,.645);assert.equal(v.locationSeconds,100);assert.equal(v.levels,undefined);
 assert.equal(sourceRecordingDA1000Readout({available:false}).counterLabel,'NO RECORDED SIGNAL');
});
test('runtime mesh installation shares stable resources and label ink retains actual text in the physical pigment contract',()=>{
 const f=installed(),buffers=f.buffers.length;assert.ok([...NAMES,...sourceRecordingDA1000Status().meshes].every(name=>f.props.propMeshCatalog().includes(name)));installSourceRecordingCassetteMeshes(f.gl,f.pack);assert.equal(f.buffers.length,buffers);
 assert.equal(installSourceRecordingCassetteLabels(f.gl,f.pack,[recording()],{ownerDocument:f.document}),true);
 const label=f.pack.catalog.get(sourceRecordingCassetteLabelMesh(recording()));assert.ok(f.document.text.includes('TAKE 003'));assert.ok(f.document.text.includes('STUDIO B3'));assert.ok(f.document.text.includes(recording().slate.text));
 assert.equal(label.primitives[0].vao,f.pack.catalog.get('source_recording_cassette_label').primitives[0].vao);assert.equal(label.primitives[0].printedSurface.coverage,'baseColorAlpha');assert.equal(label.primitives[0].printedSurface.sampling,'area');assert.equal(label.primitives[0].printedSurface.emission,'none');
});
test('owned label LRU stays bounded, pins visible world and inspection labels, and deletes no shared mesh resources',()=>{
 const f=installed(),visible=Array.from({length:16},(_,n)=>recording(n+1)),worldNames=visible.map(sourceRecordingCassetteLabelMesh),inspection=Symbol('inspection');
 installSourceRecordingCassetteLabels(f.gl,f.pack,visible,{ownerDocument:f.document,labelOwner:'world'});
 for(let n=17;n<=47;n++)installSourceRecordingCassetteLabels(f.gl,f.pack,[recording(n)],{ownerDocument:f.document,labelOwner:inspection});
 const status=sourceRecordingCassetteResourceStatus(f.props);assert.equal(status.labelTextures,32);assert.equal(status.pinnedLabels,17);assert.equal(status.labelBytes,32*512*256*4);assert.ok(status.inspectionTriangles<C.triangleBudget);
 assert.ok(f.deleted.length>0);assert.ok(worldNames.every(name=>f.pack.catalog.has(name)));assert.ok(NAMES.every(name=>f.pack.catalog.has(name)));
 const count=f.textures.length;assert.equal(installSourceRecordingCassetteLabels(f.gl,f.pack,Array.from({length:33},(_,n)=>recording(100+n)),{ownerDocument:f.document,labelOwner:'world'}),false);assert.equal(f.textures.length,count);
 releaseSourceRecordingCassetteLabels({props:f.props,labelOwner:inspection});assert.equal(sourceRecordingCassetteResourceStatus(f.props).pinnedLabels,16);
});
test('lost label alias repairs only its owned texture and preserves all original case meshes',()=>{
 const f=installed(),r=recording();installSourceRecordingCassetteLabels(f.gl,f.pack,[r],{ownerDocument:f.document});const name=sourceRecordingCassetteLabelMesh(r),old=f.pack.catalog.get(name),original=f.pack.catalog.get('source_recording_cassette_shell');f.pack.catalog.delete(name);
 installSourceRecordingCassetteLabels(f.gl,f.pack,[r],{ownerDocument:f.document});assert.notEqual(f.pack.catalog.get(name),old);assert.equal(f.pack.catalog.get('source_recording_cassette_shell'),original);assert.equal(sourceRecordingCassetteResourceStatus(f.props).labelTextures,1);assert.equal(f.deleted.length,1);
});
test('borrowed production renderer owns no new light/camera target and refuses a dither bypass',async()=>{
 const f=installed(),calls=[],prior=globalThis.FontFace;globalThis.FontFace=class{constructor(){}async load(){return this;}};
 let bypass=false;const renderer={r3dBasePropsReady:async()=>true,r3dViewCamera:()=>({...eye,width:1280,height:720}),
  r3dPixelMeshStatus:()=>({enabled:true,shaderReady:true,sourceRoomMemoryActive:true,bypassedByTextSpace:bypass}),
  r3dSetProps:p=>calls.push(['props',p]),r3dSetDynamicProps:p=>calls.push(['dynamic',p]),r3dFrame:frame=>{calls.push(['frame',frame]);return true;},
  r3dSetLocalLights(){throw Error('must preserve source lights');},r3dSetLightingContext(){throw Error('must preserve source lighting');},r3dSetLookAngles(){throw Error('must preserve walking camera targets');}};
 try{
  assert.equal(await prewarmSourceRecordingCassetteMeshes({renderer,props:f.props,recordings:[recording()],ownerDocument:f.document}),true);
  let torch={on:false,look:{power:0}};const view=createSourceRecordingCassetteRenderer({renderer,props:f.props,getTorch:()=>torch,ownerDocument:f.document});
  // The fake font document is supplied at prewarm. initialize sees resident
  // resources and the real module-level font loader is tested separately.
  const oldDocument=globalThis.document;globalThis.document=f.document;
  try{assert.equal(await view.initialize(recording()),true);}finally{globalThis.document=oldDocument;}
  assert.equal(view.render({recording:recording(),yaw:0,zoom:1,positionSeconds:4,durationSeconds:60.173}),true);
  const frame=calls.find(c=>c[0]==='frame')[1];assert.deepEqual(frame.authoredCamera.eye,eye.eye);assert.equal(frame.light,0);assert.equal(frame.textSpace,true);assert.equal(frame.hush,null);assert.equal(frame.hushSecondary,null);
  assert.ok(Number.isFinite(frame.tileW)&&frame.tileW>0&&Number.isFinite(frame.tileH)&&frame.tileH>0);assert.equal(frame.worldTints.length,5);assert.equal(frame.worldTints.flat().length,15,'ordinary acquired fallback must not upload an empty tint uniform');
  torch={on:true,look:{power:.4,color:[1,.8,.7]}};view.render({recording:recording()});const dim=calls.filter(c=>c[0]==='frame').at(-1)[1];assert.equal(dim.light,1);assert.equal(dim.torchLook,torch.look);assert.equal(dim.light*dim.torchLook.power,.4,'inherited power must not be squared to .16');
  torch={on:true,look:{power:0}};view.render({recording:recording()});const depleted=calls.filter(c=>c[0]==='frame').at(-1)[1];assert.equal(depleted.light*depleted.torchLook.power,0,'depleted power remains zero');
  const play=view.projectedRegions().find(r=>r.id==='takes');assert.equal(view.hitTest(play.x+play.w/2,play.y+play.h/2),'takes');
  renderer.r3dCanvas=()=>({getBoundingClientRect:()=>({left:80,top:50,width:640,height:360})});
  const css=view.projectedRegions().find(r=>r.id==='takes');assert.equal(css.space,'client-css');
  assert.ok(Math.abs(css.x-(80+play.x*.5))<1e-6&&Math.abs(css.y-(50+play.y*.5))<1e-6);assert.ok(Math.abs(css.w-play.w*.5)<1e-6);
  assert.equal(view.hitTest(css.x+css.w/2,css.y+css.h/2),'takes','absolute CSS client pointer hits the rendered key under offset and backing/CSS scale');
  bypass=true;assert.equal(view.render({recording:recording()}),false);assert.match(view.diagnostics().error,/acquisition/);view.dispose();assert.equal(view.ready(),false);
  assert.ok(NAMES.every(name=>f.pack.catalog.has(name)),'disposing an inspection must not tear down world materials');
 }finally{globalThis.FontFace=prior;}
});


test('missing recorder renders the cartridge alone with no invented device, collar or transport controls',()=>{
 const f=sourceRecordingCassetteInspectionFrame({recording:recording(),recorderAvailable:false,showTransport:true,dockProgress:1,deviceYaw:Math.PI},eye),regions=sourceRecordingCassetteControlRegions(f);
 assert.equal(f.recorderAvailable,false);assert.equal(f.dockProgress,0);assert.equal(f.props.length,8);assert.ok(f.props.every(p=>!p.sourceRecorder&&!p.mesh.startsWith('source_recording_da1000_')));assert.deepEqual(regions.map(r=>r.id),['shutter']);assert.ok(f.distance<.3);
 const basis=cameraBasis(f.camera.yaw,f.camera.pitch);for(const p of f.props){const q=geometry[p.mesh]||geometry.source_recording_cassette_label;for(let at=0;at<q.p.length;at+=3){const w=matrixPoint(p.matrix,q.p.slice(at,at+3)),d=w.map((n,k)=>n-f.camera.eye[k]);assert.ok(dot(d,basis.forward)>.05);}}
});
