// Disposable-profile technical verification of the real grey-door moving cut.
// Only the approach is placed. From film start through its end, game state is
// read-only: the driver uses ordinary keyboard/mouse events, including actual E.
import puppeteer from 'puppeteer-core';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,copyFile,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const baseURL=process.env.SOURCE_DRIVE_BASE_URL||'http://127.0.0.1:5339';
const snapshot=process.env.SOURCE_DRIVE_SNAPSHOT_DIR||null;
const out=process.env.SOURCE_DRIVE_ENTRY_DIR||'artifacts/source-drive-study/entry-cut/native';
await mkdir(out,{recursive:true});
try{await readFile(join(out,'report.json'));const previous=join(out,'previous-'+Date.now());await mkdir(previous);for(const entry of await readdir(out,{withFileTypes:true}))if(entry.isFile())await copyFile(join(out,entry.name),join(previous,entry.name));const outer=dirname(out),delivery=join(previous,'delivery-film');await mkdir(delivery);for(const name of ['film-inspection.json','entry-cut-review.webm','film-frames'])try{await cp(join(outer,name),join(delivery,name),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}catch(error){if(error.code!=='ENOENT')throw error;}
const profile=await mkdtemp(join(tmpdir(),'source-drive-entry-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function filesBelow(dir,accept){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())result.push(...await filesBelow(path,accept));else if(accept(path))result.push(path);}return result;}
const paths=[...new Set(['src/main.js','src/game/save.js','src/game/scenes.js','src/platform/window-choreography.js','src/platform/personalized-window-effects.js','src/source-desktop-surface.js','src/game/source-drive-session.js','src/game/source-drive-renderer.js','src/game/source-space-runtime.js','src/game/playback.js','src/audio/source-drive-recording.js','src/render/r3d.js','src/render/props3d.js','src/render/ui.js','src/render/pixel-mesh/shader.js',...await filesBelow('src/game/source-drive',p=>p.endsWith('.js')),...await filesBelow('public/assets/source-drive',p=>/\.(glb|json|wav)$/.test(p))])].sort();
const identity=()=>Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(snapshot?join(snapshot,path):path))})));
const report={kind:'source-drive-real-door-moving-entry',baseURL,snapshot,scope:'One declared Source approach, then actual E and ordinary held/repeated W through the filmed entry. Separate post-film control/save/focus/return fixtures. Final visible canvas layers and actual monitor output are recorded. No whole-chapter, human fear, hardware smoothness or final voice-performance acceptance.',checks:[],errors:[],fixtures:[],inputs:[],sourceBefore:await identity()};
report.harnessSha256=hash(await readFile(new URL(import.meta.url)));
let browser,page,filmStarted=false;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(name,pass,detail){report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));if(!pass)throw Error(name);}
const state=()=>page.evaluate(()=>__probe.sourceDrive.state());
const log=async(type,key)=>{report.inputs.push({wallMs:Date.now(),pageMs:await page.evaluate(()=>performance.now()),type,key});};
const down=async key=>{await page.keyboard.down(key);await log('keydown',key);};
const up=async key=>{await page.keyboard.up(key);await log('keyup',key);};
const press=async key=>{await page.keyboard.press(key);await log('press',key);};

// Installed before the game creates audio. This adds a passive output fork to
// the existing context, after the actual game's output processing. It creates
// no AudioContext, microphone, replacement programme or audible return path.
function installBootstrap(){
 localStorage.setItem('chunk-surfer:meta:v2',JSON.stringify({version:2,eulaAccepted:'2026-07-16',eulaAcceptedAt:Date.now()}));
 const nativeFocus=document.hasFocus.bind(document);window.__entryFocusOverride=true;
 Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>window.__entryFocusOverride??nativeFocus()});
 window.__entryFocusEvents=[];
 for(const type of ['blur','focus'])window.addEventListener(type,()=>window.__entryFocusEvents.push({type,t:performance.now()}));
 document.addEventListener('visibilitychange',()=>window.__entryFocusEvents.push({type:document.visibilityState,t:performance.now()}));
 const NativeSocket=WebSocket;window.WebSocket=class extends NativeSocket{constructor(url,protocols){if(protocols==='vite-hmr')return new class extends EventTarget{constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}};super(url,protocols);}};
 const nativeConnect=AudioNode.prototype.connect,taps=new WeakMap();window.__entryMonitorTaps=[];
 AudioNode.prototype.connect=function(...args){
  const result=nativeConnect.apply(this,args),context=this.context;
  if(args[0]===context?.destination){
   let tap=taps.get(context);
   if(!tap){const destination=context.createMediaStreamDestination(),analyser=context.createAnalyser();analyser.fftSize=1024;tap={context,destination,analyser,nodes:new WeakSet(),nodeNames:[],samples:new Float32Array(1024)};taps.set(context,tap);window.__entryMonitorTaps.push(tap);}
   if(!tap.nodes.has(this)){tap.nodes.add(this);tap.nodeNames.push(this.constructor.name);nativeConnect.call(this,tap.destination,args[1]??0);nativeConnect.call(this,tap.analyser,args[1]??0);}
  }
  return result;
 };
}

// The detached recording surface is built from the visible map canvases in
// actual stacking order, including the opaque UI blackout. It never paints a
// synthetic blackout, changes a game layer, or substitutes raw R3 for the UI.
function beginCompositeFilm(){
 const map=document.querySelector('#map'),rect=map.getBoundingClientRect(),canvas=document.createElement('canvas');
 canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),thumb=document.createElement('canvas');thumb.width=32;thumb.height=24;
 const small=thumb.getContext('2d',{willReadFrequently:true}),tap=window.__entryMonitorTaps[0];
 // Repeated roughly2:1 reductions integrate the final dither. A single large
 // bilinear reduction selects sparse grain samples and is not an image match.
 const reduction=[];let rw=canvas.width,rh=canvas.height;
 while(rw>32||rh>24){rw=Math.max(32,Math.round(rw/2));rh=Math.max(24,Math.round(rh/2));const c=rw===32&&rh===24?thumb:document.createElement('canvas');c.width=rw;c.height=rh;reduction.push({canvas:c,ctx:c.getContext('2d',{willReadFrequently:true})});}
 if(!tap)throw Error('The existing game monitor-output tap is unavailable.');
 const capture=canvas.captureStream(0),track=capture.getVideoTracks()[0];
 if(typeof track.requestFrame!=='function')throw Error('Explicit composite video frame capture is unavailable.');
 const stream=new MediaStream([...capture.getVideoTracks(),...tap.destination.stream.getAudioTracks()]);
 const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(value=>MediaRecorder.isTypeSupported(value));
 if(!mime)throw Error('A browser WebM video/audio encoder is unavailable.');
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000,audioBitsPerSecond:128000});
 const f=window.__entryFilm={canvas,ctx,thumb,small,tap,track,rec,chunks:[],frames:[],snapshots:{},layers:[],running:true,start:performance.now(),last:-Infinity,inputs:[],captureScope:'Visible #map canvases by CSS z-index/DOM order, plus passive actual monitor-output fork.'};
 rec.ondataavailable=event=>{if(event.data.size)f.chunks.push(event.data);};
 function draw(now){
  if(!f.running)return;
  if(now-f.last>=31.5){
   f.last=now;const host=map.getBoundingClientRect();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
   const layers=[...map.querySelectorAll('canvas')].map((element,index)=>({element,index,style:getComputedStyle(element),rect:element.getBoundingClientRect()})).filter(x=>x.style.display!=='none'&&x.style.visibility!=='hidden'&&Number(x.style.opacity)>0&&x.rect.width>0&&x.rect.height>0).sort((a,b)=>(Number(a.style.zIndex)||0)-(Number(b.style.zIndex)||0)||a.index-b.index);
   f.layers=layers.map(x=>({className:x.element.className,index:x.index,z:x.style.zIndex,opacity:x.style.opacity,filter:x.style.filter,blend:x.style.mixBlendMode,rect:{x:x.rect.x-host.x,y:x.rect.y-host.y,width:x.rect.width,height:x.rect.height},width:x.element.width,height:x.element.height}));
   for(const x of layers){if(x.style.mixBlendMode!=='normal')throw Error('Composite cannot certify a non-normal CSS canvas blend.');ctx.globalAlpha=Number(x.style.opacity);ctx.filter=x.style.filter;ctx.drawImage(x.element,x.rect.x-host.x,x.rect.y-host.y,x.rect.width,x.rect.height);}
   ctx.globalAlpha=1;ctx.filter='none';let reduced=canvas;for(const level of reduction){level.ctx.clearRect(0,0,level.canvas.width,level.canvas.height);level.ctx.drawImage(reduced,0,0,level.canvas.width,level.canvas.height);reduced=level.canvas;}const pixels=small.getImageData(0,0,32,24).data,rgb=[],luma=[];
   for(let i=0;i<pixels.length;i+=4){rgb.push(pixels[i],pixels[i+1],pixels[i+2]);luma.push((pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255);}
   tap.analyser.getFloatTimeDomainData(tap.samples);const outputRms=Math.sqrt(tap.samples.reduce((n,v)=>n+v*v,0)/tap.samples.length);
   const q=window.__probe?.sourceDrive?.state?.(),s=q?.state,radio=window.__probe?.sourceDrive?.frame?.()?.radio;
   const visibleSourceOverlays=[...document.querySelectorAll('.window-choreography-sim-pane')].filter(element=>{
    const r=element.getBoundingClientRect();if(r.width<=0||r.height<=0||r.right<=host.left||r.left>=host.right||r.bottom<=host.top||r.top>=host.bottom)return false;
    for(let node=element;node;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;}return true;
   }).map(element=>({id:element.id,className:element.className}));
   const row={t:now,ms:now-f.start,scene:window.__scenes?.top?.()?.id,visibleSourceOverlays,position:window.__probe?.pos?.(),opening:q?.opening||null,paused:q?.paused??null,speed:s?.speed??null,throttle:s?.throttle??null,wheelAngle:s?.wheelAngle??null,heading:s?.heading??null,x:s?.x??null,z:s?.z??null,programmeTime:s?.programTime??null,radio:radio?{station:radio.station,audible:radio.audible,cueId:radio.cue?.id,caption:radio.caption?.text}:null,recording:q?.tape?.recording??false,outputRms,meanLuma:luma.reduce((a,b)=>a+b,0)/luma.length,brightFraction:luma.filter(v=>v>.04).length/luma.length,thumbnailRGB:rgb};
   f.frames.push(row);
   if(!f.snapshots.door&&!q)f.snapshots.door={t:now,png:canvas.toDataURL('image/png')};
   if(q?.opening?.covered&&q.opening.phase==='sound-before-picture'&&q.opening.elapsed>.12&&!f.snapshots.black)f.snapshots.black={t:now,png:canvas.toDataURL('image/png')};
   if(q?.opening?.phase==='live'&&!q.opening.covered&&!f.snapshots.firstPicture)f.snapshots.firstPicture={t:now,png:canvas.toDataURL('image/png'),state:q,checkpoint:window.__probe.sourceDrive.checkpoint(),source:window.__probe.chunkSurf(),sound:window.__probe.sourceDrive.sound()};
   track.requestFrame();
  }
  requestAnimationFrame(draw);
 }
 rec.start(250);requestAnimationFrame(draw);
 return{start:f.start,width:canvas.width,height:canvas.height,mime,tapNodes:tap.nodeNames,contextCount:window.__entryMonitorTaps.length};
}
async function stopFilm(){
 if(!filmStarted)return;
 const film=await page.evaluate(async()=>{const f=window.__entryFilm;if(!f)return null;f.running=false;await new Promise(resolve=>{f.rec.onstop=resolve;f.rec.stop();});const blob=new Blob(f.chunks,{type:f.rec.mimeType}),bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return{base64:btoa(text),bytes:blob.size,mime:f.rec.mimeType,start:f.start,end:performance.now(),frames:f.frames,snapshots:f.snapshots,layers:f.layers,contextCount:window.__entryMonitorTaps.length,tapNodes:f.tap.nodeNames};});
 filmStarted=false;if(!film)return;
 await writeFile(join(out,'entry-cut.webm'),Buffer.from(film.base64,'base64'));delete film.base64;
 film.mediaProbe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_packets','-show_entries','stream=codec_name,codec_type,width,height,sample_rate,channels,nb_read_packets','-show_entries','format=size,duration','-of','json',join(out,'entry-cut.webm')],{encoding:'utf8',timeout:30000}));
 for(const[key,file]of[['black','black.png'],['firstPicture','first-picture.png']])if(film.snapshots[key]){await writeFile(join(out,file),Buffer.from(film.snapshots[key].png.split(',')[1],'base64'));delete film.snapshots[key].png;}
 if(film.snapshots.door)delete film.snapshots.door.png;
 report.film={bytes:film.bytes,mime:film.mime,seconds:(film.end-film.start)/1000,contextCount:film.contextCount,tapNodes:film.tapNodes,mediaProbe:film.mediaProbe};
 const intervals=film.frames.slice(1).map((r,i)=>r.t-film.frames[i].t).sort((a,b)=>a-b),quantile=p=>intervals[Math.min(intervals.length-1,Math.floor(intervals.length*p))];
 film.captureTiming={scope:'Diagnostic composite/readback/encoder overhead included. Actual observed capture cadence, not GPU timing or human smoothness.',frames:film.frames.length,p50Ms:quantile(.5),p95Ms:quantile(.95),maxMs:intervals.at(-1)};
 film.inputs=report.inputs;film.scope=report.scope;await writeFile(join(out,'entry-trace.json'),JSON.stringify(film,null,2));report.trace=film;return film;
}
async function screenshot(name){const clip=await page.$eval('#map',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});const t0=await page.evaluate(()=>performance.now());const bytes=await page.screenshot({path:join(out,name+'.png'),clip});const t1=await page.evaluate(()=>performance.now());return{name,t0,t1,bytes};}
async function compareScreenshot(shot,film){
 const rgb=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();let reduced=image,rw=image.width,rh=image.height,last=null;while(rw>32||rh>24){rw=Math.max(32,Math.round(rw/2));rh=Math.max(24,Math.round(rh/2));const c=document.createElement('canvas');c.width=rw;c.height=rh;const x=c.getContext('2d');x.drawImage(reduced,0,0,rw,rh);reduced=c;last=x;}const a=last.getImageData(0,0,32,24).data,r=[];for(let i=0;i<a.length;i+=4)r.push(a[i],a[i+1],a[i+2]);return r;},shot.bytes.toString('base64'));
 const candidates=film.frames.filter(row=>row.t>=shot.t0-150&&row.t<=shot.t1+150).map(row=>({t:row.t,mae:row.thumbnailRGB.reduce((n,v,i)=>n+Math.abs(v-rgb[i]),0)/rgb.length})).sort((a,b)=>a.mae-b.mae);
 return{shot:shot.name,window:[shot.t0,shot.t1],best:candidates[0]||null};
}

try{
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
 page=await browser.newPage();await page.setViewport({width:1100,height:760,deviceScaleFactor:1});await page.bringToFront();
 report.snapshotResponses=[];report.assetResponses=[];report.assetFailures=[];report.assetWarnings=[];page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/assets/'))report.assetResponses.push({path,status:response.status()});if(snapshot&&path.startsWith('/src/'))report.snapshotResponses.push({path,fixed:response.headers()['x-source-drive-snapshot']==='fixed'});});
 page.on('requestfailed',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/assets/'))report.assetFailures.push({path,error:request.failure()?.errorText});});
 page.on('pageerror',error=>{report.errors.push(String(error));console.log('PAGEERROR',String(error));});
 page.on('console',m=>{if(m.type()==='error'&&/LOOP FAULT|source-drive|shader|compile|SyntaxError|ReferenceError|Failed to load module script/i.test(m.text()))report.errors.push(m.text());});
 page.on('console',m=>{if(['warning','warn','error'].includes(m.type())&&/prop pack unavailable|GLB|conservatory-doors/i.test(m.text()))report.assetWarnings.push(m.text());});
 await page.evaluateOnNewDocument(installBootstrap);
 await page.goto(baseURL+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&skiptut=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>!!window.__probe?.testRun&&!!window.__scenes?.top?.(),{timeout:120000});
 await page.evaluate(async()=>{await __probe.testRun();__probe.tutSkip();__probe.sourcePreset('normal-exit');});
 await page.waitForFunction(()=>!!__probe.edgeDoor(),{timeout:60000});
 const approach=await page.evaluate(()=>{const door=__probe.edgeDoor(),[a,b]=door.threshold,x=(a.x+b.x)/2,y=(a.y+b.y)/2;__probe.sourceWarp(x,y+6,0);__probe.lookAtWorld(0,0);return{door:__probe.edgeDoor(),position:__probe.pos(),source:__probe.chunkSurf(),standOffMetres:3};});
 report.fixtures.push({kind:'Source approach placement BEFORE recording',approach});
 check('the declared approach starts at the real closed grey door',approach.door?.id==='source-edge-door'&&approach.door.open===false,{id:approach.door?.id,open:approach.door?.open,position:approach.position});
 await page.waitForFunction(()=>window.__entryMonitorTaps?.length>0,{timeout:30000});await wait(900);
 const catalogState=()=>page.evaluate(async()=>{const p=await import('/src/render/props3d.js'),catalog=p.propMeshCatalog();return{count:catalog.length,required:['door_frame_goods','door_leaf_bay_goods'].map(mesh=>({mesh,loaded:catalog.includes(mesh)})),renderedFrames:window.__chunkSurferPixelMesh?.status?.()?.framesRendered||0};});
 report.doorAssetReadiness={before:await catalogState(),startedAt:Date.now()};
 try{await page.waitForFunction(async()=>{const p=await import('/src/render/props3d.js'),catalog=p.propMeshCatalog();return ['door_frame_goods','door_leaf_bay_goods'].every(mesh=>catalog.includes(mesh));},{timeout:90000,polling:250});}
 catch(error){report.doorAssetReadiness.after=await catalogState();report.doorAssetReadiness.waitedMs=Date.now()-report.doorAssetReadiness.startedAt;throw Error('The Source door pack never resolved before filming: '+JSON.stringify({catalog:report.doorAssetReadiness.after,doorPackResponse:report.assetResponses.filter(r=>r.path.endsWith('/conservatory-doors.glb')),assetFailures:report.assetFailures,assetWarnings:report.assetWarnings}));}
 report.doorAssetReadiness.after=await catalogState();report.doorAssetReadiness.waitedMs=Date.now()-report.doorAssetReadiness.startedAt;
 check('both real door meshes resolve in the cached production prop catalog before filming',report.doorAssetReadiness.after.required.every(v=>v.loaded),report.doorAssetReadiness);
 await page.waitForFunction(frames=>(window.__chunkSurferPixelMesh?.status?.()?.framesRendered||0)>=frames+2,{timeout:15000},report.doorAssetReadiness.after.renderedFrames);
 // Runtime interaction eligibility alone does not establish that Source has
 // printed a visible door. Inspect the already-running shared renderer before
 // recording; no renderer setting, exposure or production state is changed.
 await page.waitForFunction(()=>{const r=__probe.sourceRoomRender(),p=window.__chunkSurferPixelMesh?.status?.();return r?.active&&r.finalIdentityPass&&p?.enabled&&p.supported&&p.shaderReady&&p.framesRendered>2;},{timeout:30000});
 report.approachRender=await page.evaluate(async()=>{
  const p=window.__probe,renderer=await import('/src/render/r3d.js'),canvas=document.querySelector('canvas.r3d'),door=p.edgeDoor();
  const projected=door.corners.map(([x,y,z])=>renderer.r3dProjectWorld({x,y,z}));
  const image=document.createElement('canvas');image.width=canvas.width;image.height=canvas.height;const c=image.getContext('2d',{willReadFrequently:true});c.drawImage(canvas,0,0);const data=c.getImageData(0,0,image.width,image.height).data;
  const box={left:Math.max(0,Math.min(...projected.map(v=>v.x))-.04),right:Math.min(1,Math.max(...projected.map(v=>v.x))+.04),top:Math.max(0,Math.min(...projected.map(v=>v.y))-.04),bottom:Math.min(1,Math.max(...projected.map(v=>v.y))+.04)};
  let visiblePixels=0,boxPixels=0;for(let y=Math.floor(box.top*image.height);y<Math.ceil(box.bottom*image.height);y++)for(let x=Math.floor(box.left*image.width);x<Math.ceil(box.right*image.width);x++){const at=(y*image.width+x)*4;boxPixels++;if(Math.max(data[at],data[at+1],data[at+2])>8)visiblePixels++;}
  return{position:p.pos(),camera:p.lookAngles(),eye:renderer.r3dViewCamera(),door,projected,box,visiblePixels,boxPixels,room:p.sourceRoomRender({sample:true}),lighting:p.r3dLighting(),pixelMesh:window.__chunkSurferPixelMesh.status(),pack:p.props().pack,renderedDoorIds:p.props().renderedIds.filter(id=>id==='source-edge-door'||id.startsWith('source-edge-door:')),sourceDoorProps:p.sourceProps().filter(v=>v.id==='source-edge-door'||v.id.startsWith('source-edge-door:')),canvas:{width:canvas.width,height:canvas.height,dataset:{...canvas.dataset}}};
 });
 const ready=report.approachRender,rs=ready.room.samples;
 check('the establishing approach has the complete door inside the actual camera',ready.projected.every(v=>v.depth>0&&v.x>.08&&v.x<.92&&v.y>.08&&v.y<.92)&&ready.renderedDoorIds.includes('source-edge-door')&&ready.renderedDoorIds.includes('source-edge-door:leaf-1')&&ready.renderedDoorIds.includes('source-edge-door:leaf-2'),{position:ready.position,eye:ready.eye,projected:ready.projected,renderedDoorIds:ready.renderedDoorIds});
 check('Source has actually rendered physical door surfaces through final acquisition',ready.room.active&&ready.room.pixelMeshEnabled&&ready.room.finalIdentityPass&&rs?.surfaceDepth>0&&rs.glError===0&&rs.finalNonBlackPixels>1000&&ready.visiblePixels>1000&&rs.doorCore>0&&rs.exactBlackCore===rs.doorCore,{room:ready.room,visiblePixels:ready.visiblePixels,boxPixels:ready.boxPixels,framesRendered:ready.pixelMesh.framesRendered});
 const doorShot=await screenshot('door');report.doorScreenshot={t0:doorShot.t0,t1:doorShot.t1};
 report.capture=await page.evaluate(beginCompositeFilm);filmStarted=true;
 // A second actual screenshot certifies the composite stack at the closed door.
 const comparisonShot=await screenshot('door');
 await down('w');await wait(250);await press('e');
 report.doorOpened=await page.waitForFunction(()=>__probe.edgeDoor()?.open||__probe.chunkSurf()?.edgeDoorOpen||!!__probe.sourceDrive.state(),{timeout:15000}).then(()=>page.evaluate(()=>({door:__probe.edgeDoor(),source:__probe.chunkSurf()})));
 const entryDeadline=Date.now()+120000;let first=null,blackShot=null;
 while(Date.now()<entryDeadline){
  await page.keyboard.down('w');await log('repeat-keydown','w');
  const q=await state();
  if(q?.opening?.covered&&!blackShot){blackShot=await screenshot('black-browser');report.blackBrowserScreenshot={t0:blackShot.t0,t1:blackShot.t1};}
  if(q?.opening?.phase==='live'&&!q.opening.covered){first=q;break;}
  if(q?.error)throw Error(q.error);
  await wait(70);
 }
 if(!first)throw Error('The actual door crossing did not reveal the moving cabin.');
 report.firstObserved=first;
 // Repeats inherited from walking remain quarantined after the picture opens.
 await page.keyboard.down('w');await log('repeat-keydown','w');await wait(160);
 const inherited=await state();await up('w');
 check('actual E and held ordinary W cross the real goods door without ENTER',report.doorOpened&&first.initialized&&!first.paused&&first.opening?.phase==='live'&&!report.inputs.some(i=>i.key==='Enter'),{opening:first.opening,speed:first.state.speed,door:report.doorOpened.door});
 check('walking-key repeats do not become hidden acceleration',first.state.throttle===0&&inherited.state.throttle===0,{first:first.state.throttle,afterRepeats:inherited.state.throttle,speed:inherited.state.speed});
 const controlStart=await state();await down('d');await down(' ');
 await page.waitForFunction(t=>__probe.sourceDrive.state().state.programTime>=t+.16,{timeout:10000},controlStart.state.programTime);
 const controlled=await state();await up('d');
 check('brake and steering respond immediately to the first visible controls',controlled.state.wheelAngle>.015&&controlled.state.speed<controlStart.state.speed-.12,{before:{speed:controlStart.state.speed,wheelAngle:controlStart.state.wheelAngle},after:{speed:controlled.state.speed,wheelAngle:controlled.state.wheelAngle},seconds:controlled.state.programTime-controlStart.state.programTime});
 await page.waitForFunction(()=>__probe.sourceDrive.state()?.state.brakeHold,{timeout:15000});await up(' ');
 const controlShot=await screenshot('controlled');report.controlled=await state();
 await page.waitForFunction(()=>performance.now()-window.__entryFilm.start>=8000,{timeout:120000});
 const film=await stopFilm();
 check('saved movie contains encoded final-picture video and actual stereo monitor audio',film.mediaProbe.streams.some(s=>s.codec_type==='video'&&s.width===report.capture.width&&s.height===report.capture.height&&Number(s.nb_read_packets)>30)&&film.mediaProbe.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='opus'&&s.channels===2&&Number(s.nb_read_packets)>20),film.mediaProbe);
 report.compositeComparison=await compareScreenshot(comparisonShot,film);
 check('recorded visible-layer composite matches the actual browser door view',report.compositeComparison.best?.mae<18,report.compositeComparison);
 if(blackShot){report.blackCompositeComparison=await compareScreenshot(blackShot,film);check('the recorded black cover matches the actual browser UI',report.blackCompositeComparison.best?.mae<5,report.blackCompositeComparison);}
 report.controlledCompositeComparison=await compareScreenshot(controlShot,film);check('the recorded live composite matches the actual controlled browser view',report.controlledCompositeComparison.best?.mae<18,report.controlledCompositeComparison);
 check('no uncaptured Source window overlays survive anywhere over the car entry',film.frames.filter(r=>r.opening).every(r=>r.visibleSourceOverlays.length===0),{offendingFrames:film.frames.filter(r=>r.opening&&r.visibleSourceOverlays.length).map(r=>({t:r.t,phase:r.opening.phase,overlays:r.visibleSourceOverlays}))});
 const firstPicture=film.snapshots.firstPicture,lead=film.frames.filter(r=>r.opening?.phase==='sound-before-picture'),firstLive=film.frames.find(r=>r.opening?.phase==='live');
 report.entryEvidence={firstPicture,leadFrames:lead.length,firstLive,blackFrames:lead.filter(r=>r.meanLuma<.001).length};
 check('first picture is already moving above12m/s with the service bulletin live',firstPicture?.state?.state.speed>12&&firstPicture?.sound?.programme?.audible&&firstPicture?.sound?.programme?.cue?.id==='service-water',{speed:firstPicture?.state?.state.speed,radio:firstPicture?.sound?.programme});
 check('actual audible radio/cabin output runs beneath an opaque UI blackout',lead.length>=3&&lead.some(r=>r.meanLuma<.001&&r.outputRms>1e-5&&r.radio?.audible&&r.radio.cueId==='service-water'),{frames:lead.length,elapsed:firstLive?.opening?.elapsed,maximumRms:Math.max(0,...lead.map(r=>r.outputRms)),blackFrames:lead.filter(r=>r.meanLuma<.001).length});
 check('the sound lead lasts .65 simulation seconds before picture',firstLive?.opening?.elapsed>=.65&&firstLive.opening.elapsed<.76,{elapsed:firstLive?.opening?.elapsed,capture:film.captureTiming});
 check('the cut does not auto-record and the film monitors one existing output context',film.contextCount===1&&film.frames.every(r=>!r.recording)&&!firstPicture?.checkpoint?.tape?.pending,{contextCount:film.contextCount,pending:firstPicture?.checkpoint?.tape?.pending});
 const entryPose=firstPicture.checkpoint.returnPose,sourcePosition=firstPicture.state?film.frames.find(r=>r.opening)?.position:null;
 check('the real Source return is captured before the repeated walk',entryPose?.x===sourcePosition?.x&&entryPose?.y===sourcePosition?.y&&firstPicture.source.phase==='horizon'&&!firstPicture.source.completed,{entryPose,sourcePosition,phase:firstPicture.source.phase,completed:firstPicture.source.completed});
 // The movie has ended. From here the report explicitly separates technical
 // pause/reload/focus/return fixtures from the uninterrupted entry segment.
 await press('2');await page.waitForFunction(()=>__probe.sourceDrive.state().state.station==='company',{timeout:10000});await press('o');await page.waitForFunction(()=>!__probe.sourceDrive.state().state.radioOn,{timeout:10000});
 const refsBefore=await page.evaluate(()=>__probe.sourceDrive.checkpoint().tape.takeRefs.length);
 await press('r');await page.waitForFunction(()=>__probe.sourceDrive.state()?.tape.recording,{timeout:15000});await wait(1600);await press('x');
 await page.waitForFunction(n=>{const c=__probe.sourceDrive.checkpoint();return !__probe.sourceDrive.state()?.tape.recording&&c.tape.takeRefs.length>n&&c.tape.takeRefs.at(-1)?.durable;},{timeout:15000},refsBefore);
 report.fieldTake=await page.evaluate(()=>__probe.sourceDrive.checkpoint().tape.takeRefs.at(-1));
 check('post-film ordinary REC/STOP seals actual cabin audio with the receiver OFF',report.fieldTake.durable&&report.fieldTake.durationSeconds>1&&!!report.fieldTake.sha256&&!(await state()).state.radioOn,report.fieldTake);
 await press('Escape');await wait(250);const paused=await state();await wait(450);const pauseAfter=await state();report.pause={before:paused,after:pauseAfter};
 check('pause freezes the already-started programme and physical vehicle',paused.paused&&pauseAfter.state.programTime===paused.state.programTime&&pauseAfter.state.x===paused.state.x&&pauseAfter.state.z===paused.state.z,{paused:paused.paused,time:paused.state.programTime,after:pauseAfter.state.programTime});
 const saved=await page.evaluate(()=>__probe.sourceDrive.checkpoint());
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__probe?.sourceDrive?.resumeSaved&&['lens-calibration','title','opening-credits'].includes(window.__scenes?.top?.()?.id),{timeout:60000});
 await page.evaluate(()=>__probe.sourceDrive.resumeSaved());report.fixtures.push({kind:'post-film saved-session reload',limitation:'The diagnostic resume bypasses startup calibration only; actual save, enterStory and PB owners execute.'});
 await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:60000});const restored=await state();report.restored=restored;
 check('saved active session restores safely with OFF/programme/return and no fresh moving cut',restored.paused&&restored.state.speed===0&&!restored.opening&&restored.state.radioOn===false&&restored.state.station==='company'&&restored.state.programTime===saved.drive.programTime&&JSON.stringify((await page.evaluate(()=>__probe.sourceDrive.checkpoint())).returnPose)===JSON.stringify(entryPose),{paused:restored.paused,speed:restored.state.speed,opening:restored.opening,time:restored.state.programTime,expectedTime:saved.drive.programTime,on:restored.state.radioOn,station:restored.state.station});
 check('page reload retains the exact durable field-audio identity',(await page.evaluate(()=>__probe.sourceDrive.checkpoint().tape.takeRefs.at(-1)?.sha256))===report.fieldTake.sha256,{expected:report.fieldTake.sha256,actual:await page.evaluate(()=>__probe.sourceDrive.checkpoint().tape.takeRefs.at(-1)?.sha256)});
 await press('Enter');await down('w');await wait(900);await up('w');
 const beforeBlur=await state();await page.evaluate(()=>{window.__entryFocusOverride=null;});const other=await browser.newPage();await other.goto('about:blank');await other.bringToFront();await wait(500);
 const blurred=await state();await wait(400);const stillBlurred=await state();report.blur={before:beforeBlur,after:blurred,held:stillBlurred,events:await page.evaluate(()=>window.__entryFocusEvents)};
 check('real tab blur pauses the moving session and freezes programme time',blurred.paused&&stillBlurred.state.programTime===blurred.state.programTime,report.blur);
 await other.close();await page.bringToFront();await page.evaluate(()=>{window.__entryFocusOverride=true;});const focused=await state();
 check('focus return does not replay or reseed the cinematic',focused.paused&&!focused.opening&&focused.state.x===blurred.state.x&&focused.state.z===blurred.state.z,{paused:focused.paused,opening:focused.opening,position:[focused.state.x,focused.state.z]});
 await page.evaluate(async()=>{const cp=__probe.sourceDrive.checkpoint(),{worldAt}=await import('/src/game/source-drive/road.js'),a=worldAt(1200,-1.35);Object.assign(cp.drive,{x:a.x,z:a.z,heading:a.heading,furthest:1200,roadHeight:a.height,roadOffset:-1.35,speed:0,arrived:true});await __probe.sourceDrive.fixture(cp);});
 report.fixtures.push({kind:'post-film stopped apron return placement',distance:1200});await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:30000});await press('Enter');await page.waitForFunction(()=>!__probe.sourceDrive.state(),{timeout:10000});
 const returned=await page.evaluate(()=>({position:__probe.pos(),checkpoint:__probe.sourceDrive.checkpoint(),source:__probe.chunkSurf()}));report.returned=returned;
 check('explicit dismount preserves the exact real door return and Source incompletion',returned.position.x===entryPose.x&&returned.position.y===entryPose.y&&returned.checkpoint.status==='returned'&&!returned.source.completed&&returned.checkpoint.tape.takeRefs.some(r=>r.sha256===report.fieldTake.sha256),{position:returned.position,expected:entryPose,status:returned.checkpoint.status,completed:returned.source.completed,takeSha256:report.fieldTake.sha256});
 check('shared final rendering has no loop/shader/module faults',!report.errors.length,report.errors);
 if(snapshot){const required=['/src/main.js','/src/game/source-drive-session.js','/src/game/source-drive/entry-cut.js','/src/render/r3d.js'];check('critical entry modules came from the frozen inspection snapshot',required.every(path=>report.snapshotResponses.some(r=>r.path===path&&r.fixed)),{required,responses:report.snapshotResponses.length});}
 report.passed=true;
}catch(error){report.failure=String(error.stack||error);console.log('FAILED',report.failure);process.exitCode=1;if(filmStarted)try{await stopFilm();}catch(captureError){report.captureFailure=String(captureError);}if(page)try{await page.screenshot({path:join(out,'failure.png')});report.failureState=await page.evaluate(()=>({scene:window.__scenes?.top?.()?.id,drive:window.__probe?.sourceDrive?.state?.(),position:window.__probe?.pos?.(),body:document.body.innerText.slice(-2000)}));}catch{}}
finally{
 report.sourceAfter=await identity();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
 if(!report.sourceStable){report.passed=false;process.exitCode=1;report.errors.push('Inspected sources changed during native capture.');}
 // Frame thumbnails belong in the synchronized trace, not twice in the report.
 if(report.trace){report.trace={snapshots:report.trace.snapshots,captureTiming:report.trace.captureTiming,frameCount:report.trace.frames.length};}
 if(report.entryEvidence?.firstLive)delete report.entryEvidence.firstLive.thumbnailRGB;
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 try{await browser?.close();}finally{await rm(profile,{recursive:true,force:true});}
}
process.exit(process.exitCode||0);
