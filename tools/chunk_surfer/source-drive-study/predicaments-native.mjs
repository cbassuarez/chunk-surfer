// Bounded production technical fixtures. One disposable browser/profile, actual
// controls and final dither, no pose/time/weather edits inside either film.
import puppeteer from 'puppeteer-core';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const baseURL=process.env.SOURCE_DRIVE_BASE_URL;
const snapshot=process.env.SOURCE_DRIVE_SNAPSHOT_DIR;
const staticOnly=process.env.SOURCE_DRIVE_STATIC_ONLY==='1';
const skipWhiteout=staticOnly&&process.env.SOURCE_DRIVE_SKIP_WHITEOUT==='1';
const budgetMiB=Number(process.env.SOURCE_DRIVE_NATIVE_BUDGET_MIB??40);
if(!Number.isFinite(budgetMiB)||budgetMiB<=0)throw Error('Native budget must be a positive MiB value.');
if(!baseURL||!snapshot)throw Error('Explicit frozen base URL and source directory required; refusing to inspect mutable production.');
const out=process.env.SOURCE_DRIVE_NATIVE_OUTPUT_DIR||'artifacts/source-drive-study/predicaments/native';
await mkdir(out,{recursive:true});
const disk=await statfs('.'),preflightFreeBytes=disk.bavail*disk.bsize;
if(preflightFreeBytes<200*1024*1024)throw Error(`Native capture requires200MiB free before launch; available${preflightFreeBytes} bytes.`);
const attempt='attempt-'+Date.now(),run=join(out,attempt);await mkdir(run);
const profile=await mkdtemp(join(tmpdir(),'source-drive-predicaments-'));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function filesBelow(dir,accept){const paths=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())paths.push(...await filesBelow(p,accept));else if(accept(p))paths.push(p);}return paths;}
const paths=[...new Set(['src/main.js','src/game/source-drive-session.js','src/game/source-drive-renderer.js','src/game/playback.js','src/audio/source-drive-recording.js','src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js',...await filesBelow('src/game/source-drive',p=>p.endsWith('.js')),...await filesBelow('public/assets/source-drive',p=>/\.(glb|json|wav)$/.test(p))])].sort();
const identity=()=>Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(join(snapshot,path)))})));
const requiredMeshes=['drive_cabin','drive_radio','drive_wheel','dp_wreck_saloon','dp_wreck_estate','dp_wreck_shell','dp_detached_wheel','dp_torn_panel','dp_cliff_mass','dp_cliff_shelf','dp_road_fold','dp_whiteout_pylon','dp_snow_paving','dp_wreck_broken_lamp'];
const report={kind:'source-drive-predicaments-native',staticOnly,skipWhiteout,attempt,snapshot,baseURL,preflightFreeBytes,scope:staticOnly?'Static-only preview through actual complete game geometry/materials/final shader. Declared Source approach and separate paused car fixtures, one real radio reach. No driving films, complete behavior, full chapter, human fear/comfort or smoothness acceptance.':'Actual complete game controls/rendering/audio in two separately declared car placements. Technical keyboard road-follow reads telemetry and presses ordinary keys; not a human driver, uninterrupted chapter traversal, physical WebView/GPU timing or fear/comfort acceptance. No pose, clock, progression, weather or look assignment inside either movie.',checks:[],errors:[],fixtures:[],inputs:[],films:[],screenshots:[],sourceBefore:await identity(),harnessSha256:hash(await readFile(new URL(import.meta.url)))};
let browser,page,filmStarted=false,filmName=null;
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function check(name,pass,detail){report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));if(!pass)throw Error(name);}
const state=()=>page.evaluate(()=>__probe.sourceDrive.state());
async function log(type,key){report.inputs.push({wallMs:Date.now(),pageMs:await page.evaluate(()=>performance.now()),type,key,film:filmName});}
async function down(key){await page.keyboard.down(key);await log('keydown',key);}
async function up(key){await page.keyboard.up(key);await log('keyup',key);}
async function press(key){await page.keyboard.press(key);await log('press',key);}
const sourceBoundary=async()=>page.evaluate(()=>({position:__probe.pos(),source:__probe.chunkSurf(),checkpoint:__probe.sourceDrive.checkpoint()}));

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
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000,audioBitsPerSecond:128000});
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
   const q=window.__probe?.sourceDrive?.state?.(),s=q?.state,frame=window.__probe?.sourceDrive?.frame?.(),radio=frame?.radio;
   const visibleSourceOverlays=[...document.querySelectorAll('.window-choreography-sim-pane')].filter(element=>{
    const r=element.getBoundingClientRect();if(r.width<=0||r.height<=0||r.right<=host.left||r.left>=host.right||r.bottom<=host.top||r.top>=host.bottom)return false;
    for(let node=element;node;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;}return true;
   }).map(element=>({id:element.id,className:element.className}));
   if(f.frames.length%6===0)f.hornSample={sampledAt:now,programmeTime:s?.programTime??null,voices:window.__probe?.sourceDrive?.sound?.()?.wreckHorns||[]};
   const row={wreckHorns:f.hornSample,evolution:frame?.evolution?{stage:frame.evolution.stage,predicament:frame.evolution.predicament,currentDistance:frame.evolution.currentDistance,weather:frame.evolution.weather}:null,t:now,ms:now-f.start,scene:window.__scenes?.top?.()?.id,visibleSourceOverlays,position:window.__probe?.pos?.(),opening:q?.opening||null,paused:q?.paused??null,speed:s?.speed??null,throttle:s?.throttle??null,wheelAngle:s?.wheelAngle??null,heading:s?.heading??null,x:s?.x??null,z:s?.z??null,programmeTime:s?.programTime??null,radio:radio?{station:radio.station,audible:radio.audible,cueId:radio.cue?.id,caption:radio.caption?.text}:null,recording:q?.tape?.recording??false,outputRms,meanLuma:luma.reduce((a,b)=>a+b,0)/luma.length,brightFraction:luma.filter(v=>v>.04).length/luma.length,thumbnailRGB:rgb};
   f.frames.push(row);
   if(!f.snapshots.door&&!q)f.snapshots.door={t:now,png:canvas.toDataURL('image/png')};
   if(q?.opening?.covered&&q.opening.phase==='sound-before-picture'&&q.opening.elapsed>.12&&!f.snapshots.black)f.snapshots.black={t:now,png:canvas.toDataURL('image/png')};
   if(q&&!q.paused&&!f.snapshots.firstPicture)f.snapshots.firstPicture={t:now,png:canvas.toDataURL('image/png'),state:q,checkpoint:window.__probe.sourceDrive.checkpoint(),source:window.__probe.chunkSurf(),sound:window.__probe.sourceDrive.sound()};
   track.requestFrame();
  }
  requestAnimationFrame(draw);
 }
 rec.start(250);requestAnimationFrame(draw);
 return{start:f.start,width:canvas.width,height:canvas.height,mime,tapNodes:tap.nodeNames,contextCount:window.__entryMonitorTaps.length};
}

async function readiness(){
 await page.waitForFunction(async required=>{const p=await import('/src/render/props3d.js'),m=p.propMeshCatalog(),r=window.__chunkSurferPixelMesh?.status?.();return required.every(name=>m.includes(name))&&r?.enabled&&r.shaderReady&&!r.lastError&&!r.lastGlError&&r.framesRendered>2;},{timeout:120000,polling:250},requiredMeshes);
 const r=await page.evaluate(async required=>{const p=await import('/src/render/props3d.js');return{catalog:p.propMeshCatalog().filter(name=>required.includes(name)),renderer:p.driveStudyRendererStatus(),pixelMesh:window.__chunkSurferPixelMesh.status(),frame:__probe.sourceDrive.frame()};},requiredMeshes);
 const before=r.pixelMesh.framesRendered;await page.waitForFunction(n=>window.__chunkSurferPixelMesh.status().framesRendered>=n+3,{timeout:20000},before);return r;
}
async function screenshot(name){
 const clip=await page.$eval('#map',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}),t0=await page.evaluate(()=>performance.now());
 const bytes=await page.screenshot({path:join(run,name+'.png'),clip}),t1=await page.evaluate(()=>performance.now());
 report.screenshots.push({name,path:attempt+'/'+name+'.png',sha256:hash(bytes),bytes:bytes.length,t0,t1});console.log('SCREENSHOT',name,join(run,name+'.png'));return{name,bytes,t0,t1};
}
async function fixture({name,distance,lookYaw=0,lookPitch=-.04,programmeTime=80,furthest=distance,weatherSeconds=18,diagnosticClear=false,station='service'}){
 if(filmStarted)throw Error('Fixture is forbidden during a film.');
 const receipt=await page.evaluate(async q=>{
  const cp=__probe.sourceDrive.checkpoint(),{worldAt}=await import('/src/game/source-drive/road.js'),{driveEvolutionFrame}=await import('/src/game/source-drive/evolution.js'),W=await import('/src/game/source-drive/weather.js'),a=worldAt(q.distance,0);
  Object.assign(cp.drive,{x:a.x,z:a.z,heading:a.heading,roadHeight:a.height,roadOffset:0,furthest:q.furthest,programTime:q.programmeTime,phase:q.furthest>=1056?4:q.furthest>=768?3:q.furthest>=516?2:q.furthest>=288?1:0,speed:0,lateralSpeed:0,yawRate:0,steer:0,wheelAngle:0,throttle:0,brakeHold:true,brakeAmount:1,arrived:false,inArrivalZone:false,arrivalStopSeconds:0,station:q.station,radioOn:true,finished:false,journey:{schema:1,stationarySeconds:0,returnMetres:0,edgeSeconds:0,maxBacktrackMetres:0,mode:'held'}});
  cp.status='active';cp.started=true;cp.look={yaw:q.lookYaw,pitch:q.lookPitch};cp.settings={wipers:true,headlights:true};
  const w=W.createDriveWeather({initialWetness:.18}),e=driveEvolutionFrame(cp.drive),profile=q.diagnosticClear?{...e.weather,rain:0,fog:0,snow:0,whiteout:0,extinction:.001}:e.weather;
  for(let i=0;i<q.weatherSeconds*120;i++)W.stepDriveWeather(w,{dt:1/120,timeSec:q.programmeTime-q.weatherSeconds+(i+1)/120,...profile,wipers:true,speed:0});
  if(q.diagnosticClear){w.grid.fill(0);w.snowGrid.fill(0);w.revision++;}
  w.timeSec=q.programmeTime;cp.weather=JSON.parse(W.serializeDriveWeather(w));await __probe.sourceDrive.fixture(cp);
  return{...q,position:{x:a.x,z:a.z,heading:a.heading},road:{halfWidth:a.halfWidth,leftWidth:a.leftWidth,rightWidth:a.rightWidth,shoulderWidth:a.shoulderWidth,section:a.treatment.section},profile,weatherRevision:w.revision,returnPose:cp.returnPose,qualification:q.diagnosticClear?'Separately declared diagnostic: actual saved weather controls set clear on paused fixture; scene geometry, road snow cover, lighting, position, clock and final shader retained.':'Separate technical approach fixture before film; not claimed travel from previous section.'};
 },{name,distance,lookYaw,lookPitch,programmeTime,furthest,weatherSeconds,diagnosticClear,station});
 report.fixtures.push(receipt);await readiness();await wait(200);return receipt;
}
async function beginFilm(name){
 filmName=name;const prior=await state(),capture=await page.evaluate(beginCompositeFilm);filmStarted=true;
 report.films.push({name,initial:prior,capture,scope:report.scope,fixture:report.fixtures.at(-1)});return capture;
}
async function endFilm(){
 if(!filmStarted)return null;
 const data=await page.evaluate(async()=>{const f=window.__entryFilm;f.running=false;await new Promise(ok=>{f.rec.onstop=ok;f.rec.stop();});f.track.stop();const blob=new Blob(f.chunks,{type:f.rec.mimeType}),bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return{base64:btoa(text),bytes:blob.size,mime:f.rec.mimeType,start:f.start,end:performance.now(),frames:f.frames,layers:f.layers,contextCount:window.__entryMonitorTaps.length,tapNodes:f.tap.nodeNames};});
 filmStarted=false;const name=filmName;filmName=null;const bytes=Buffer.from(data.base64,'base64');delete data.base64;await writeFile(join(run,name+'.webm'),bytes);
 const intervals=data.frames.slice(1).map((r,i)=>r.t-data.frames[i].t).sort((a,b)=>a-b),at=p=>intervals[Math.min(intervals.length-1,Math.floor(intervals.length*p))];
 const mediaProbe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_packets','-show_entries','stream=codec_name,codec_type,width,height,sample_rate,channels,nb_read_packets','-show_entries','format=size,duration','-of','json',join(run,name+'.webm')],{encoding:'utf8',timeout:30000}));
 const fullDecode=execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-copyts','-i',join(run,name+'.webm'),'-fps_mode','passthrough','-enc_time_base:v','1/1000','-f','null','-'],{encoding:'utf8',timeout:60000});
 const selected=report.films.find(f=>f.name===name);Object.assign(selected,{path:attempt+'/'+name+'.webm',sha256:hash(bytes),bytes:bytes.length,wallSeconds:(data.end-data.start)/1000,final:await state(),mediaProbe,fullDecode:fullDecode.length===0,cadence:{frames:data.frames.length,p50Ms:at(.5),p95Ms:at(.95),maximumMs:intervals.at(-1),scope:'Composite readback/encoding included, not GPU timing or human smoothness.'},visibleSourceOverlayFrames:data.frames.filter(r=>r.visibleSourceOverlays.length).length,maximumMonitorRms:Math.max(0,...data.frames.map(r=>r.outputRms)),hornMix:{maximumVoices:Math.max(0,...data.frames.map(r=>r.wreckHorns?.voices.length||0)),maximumGain:Math.max(0,...data.frames.flatMap(r=>r.wreckHorns?.voices.map(v=>v.gain)||[])),framesWithRadioOffAndExteriorVoice:data.frames.filter(r=>r.radio?.audible===false&&r.wreckHorns?.voices.some(v=>v.gain>0)).length,qualification:'Actual source mix diagnostics, not proof of isolated horn audibility; listening acceptance remains pending.'},contextCount:data.contextCount,tapNodes:data.tapNodes});
 selected.weatherEnvelope={minimumWhiteout:Math.min(...data.frames.map(r=>r.evolution?.weather?.whiteout??0)),maximumWhiteout:Math.max(...data.frames.map(r=>r.evolution?.weather?.whiteout??0)),minimumSnow:Math.min(...data.frames.map(r=>r.evolution?.weather?.snow??0)),maximumSnow:Math.max(...data.frames.map(r=>r.evolution?.weather?.snow??0)),firstProgrammeTime:data.frames[0]?.programmeTime,lastProgrammeTime:data.frames.at(-1)?.programmeTime};
 // Keep synchronized state/input traces but avoid duplicating thousands of
 // dither thumbnails in the receipt; frames remain encoded in the movie.
 for(const row of data.frames)delete row.thumbnailRGB;data.inputs=report.inputs.filter(r=>r.film===name);data.scope=report.scope;selected.trace=attempt+'/'+name+'-trace.json';await writeFile(join(run,name+'-trace.json'),JSON.stringify(data,null,2));return selected;
}
async function hold(key,ms){await down(key);try{await wait(ms);}finally{await up(key);}}
async function drag(dx=0,dy=0){await page.mouse.move(560,365);await page.mouse.down();await page.mouse.move(560+dx,365+dy,{steps:9});await page.mouse.up();await log('pointer-drag',JSON.stringify({dx,dy}));}
async function clockWait(seconds){const t=(await state()).state.programTime;await page.waitForFunction(t=>__probe.sourceDrive.state().state.programTime>=t,{timeout:20000},t+seconds);}
async function brake(){await down(' ');try{await page.waitForFunction(()=>__probe.sourceDrive.state().state.brakeHold&&Math.abs(__probe.sourceDrive.state().state.speed)<.015,{timeout:20000});}finally{await up(' ');}}
async function captureBaseline(){return page.evaluate(async()=>{const samples=[],begin=performance.now();let last=begin;await new Promise(ok=>{function frame(t){samples.push(t-last);last=t;if(t-begin>=1100)ok();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});samples.shift();samples.sort((a,b)=>a-b);return{frames:samples.length,p50Ms:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],maximumMs:samples.at(-1),scope:'Held running-car RAF without composite readback/encoder. Compare with captured moving-car cadence; simulation/driver work also differs, so this does not isolate GPU/encoder cost.'};});}

// Technical closed-loop input driver. Queries do not assign any game state.
// Actual steering pulses are logged and the continuous movie includes them.
async function followRoad(destination,{speed=4.6,maximumSeconds=24}={}){
 const began=Date.now(),initial=await state(),samples=[],held=new Set();
 const keys=async wanted=>{for(const key of [...held])if(!wanted.has(key)){await up(key);held.delete(key);}for(const key of wanted)if(!held.has(key)){await down(key);held.add(key);}};
 try{while(Date.now()-began<maximumSeconds*1000){
  const start=Date.now(),q=await page.evaluate(async()=>{const s=__probe.sourceDrive.state().state,{roadAt,roadSurfaceAt}=await import('/src/game/source-drive/road.js'),road=roadSurfaceAt(s.x,s.z),p=roadAt(road.distance+Math.max(6,Math.abs(s.speed)*1.35));return{s,road:{distance:road.distance,offset:road.offset,leftWidth:road.leftWidth,rightWidth:road.rightWidth,halfWidth:road.halfWidth},preview:p};});
  const s=q.s,p=q.preview,remaining=destination-q.road.distance;if(s.paused)throw Error('Unexpected pause during technical input drive.');
  if(remaining<1.2&&Math.abs(s.speed)<.35)break;
  const bearing=Math.atan2(p.x-s.x,-(p.z-s.z)),error=Math.atan2(Math.sin(bearing-s.heading),Math.cos(bearing-s.heading)),range=Math.max(5,Math.hypot(p.x-s.x,p.z-s.z));
  const desired=clamp(Math.atan(2*3.1*Math.sin(error)/range)-Math.atan2(s.lateralSpeed||0,Math.max(3,Math.abs(s.speed)))*.3,-.28,.28),steeringError=desired-s.wheelAngle;
  const target=Math.min(speed,Math.sqrt(Math.max(0,remaining-.6)*2*1.8)),wanted=new Set();if(s.speed<target-.25)wanted.add('w');if(s.speed>target+.4||remaining<.6)wanted.add(' ');
  const pulse=Math.abs(steeringError)>.006?clamp(Math.abs(steeringError)/(.64/(1+Math.abs(s.speed)/30))*1000,12,100):0;if(pulse)wanted.add(steeringError>0?'d':'a');await keys(wanted);
  samples.push({pageMs:await page.evaluate(()=>performance.now()),programmeTime:s.programTime,x:s.x,z:s.z,heading:s.heading,speed:s.speed,wheelAngle:s.wheelAngle,road:q.road,remaining,target,desired,pulseMs:pulse,keys:[...wanted]});
  if(pulse&&pulse<100){await wait(pulse);wanted.delete('a');wanted.delete('d');await keys(wanted);}await wait(Math.max(0,100-(Date.now()-start)));
 }}finally{await keys(new Set());}
 await brake();const final=await state(),distance=-final.state.z+initial.state.z,result={initial:initial.state,final:final.state,destination,elapsedMs:Date.now()-began,distanceAdvanced:distance,samples,qualification:'Telemetry-informed W/A/D/Space technical operator; no analogue injection or state assignment, not fresh-player handling acceptance.'};
 await writeFile(join(run,filmName+'-inputs.json'),JSON.stringify(result,null,2));return result;
}

try{
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
 page=await browser.newPage();await page.setViewport({width:1100,height:760,deviceScaleFactor:1});await page.bringToFront();
 report.snapshotResponses=[];report.assetResponses=[];report.assetFailures=[];
 page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/src/'))report.snapshotResponses.push({path,fixed:r.headers()['x-source-drive-snapshot']==='fixed'});if(path.startsWith('/assets/'))report.assetResponses.push({path,status:r.status()});});
 page.on('requestfailed',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/'))report.assetFailures.push({path,error:r.failure()?.errorText});});
 page.on('pageerror',e=>{report.errors.push(String(e));console.log('PAGEERROR',String(e));});
 page.on('console',m=>{if(m.type()==='error'&&/LOOP FAULT|source-drive|shader|compile|SyntaxError|ReferenceError|Failed to load module script/i.test(m.text())){report.errors.push(m.text());console.log('RENDERERROR',m.text().slice(0,400));}});
 await page.evaluateOnNewDocument(installBootstrap);
 await page.goto(baseURL+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&skiptut=1',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>!!window.__probe?.testRun&&!!window.__scenes?.top?.(),{timeout:120000});
 await page.evaluate(async()=>{await __probe.testRun();__probe.tutSkip();__probe.sourcePreset('normal-exit');});
 await page.waitForFunction(()=>!!__probe.edgeDoor(),{timeout:60000});
 report.entryApproach=await page.evaluate(()=>{const door=__probe.edgeDoor(),[a,b]=door.threshold;__probe.sourceWarp((a.x+b.x)/2,(a.y+b.y)/2+6,0);__probe.lookAtWorld(0,0);return{door,position:__probe.pos()};});
 report.fixtures.push({kind:'Source approach before new-section fixtures',distanceFromDoorM:3,entry:report.entryApproach});await wait(700);
 await down('w');await wait(250);await press('e');
 const until=Date.now()+120000;while(Date.now()<until){const q=await state();if(q?.initialized&&q.opening?.phase==='live')break;if(q?.error)throw Error(q.error);await page.keyboard.down('w');await wait(120);}await up('w');
 await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized&&!__probe.sourceDrive.state().paused,{timeout:15000});await brake();
 report.entry=await sourceBoundary();const returnPose=report.entry.checkpoint.returnPose;
 check('real grey-door entry installs one active Source drive and retains its exact exterior return',await page.evaluate(()=>__scenes.top()?.id==='source-drive')&&!!returnPose&&!report.entry.source.completed,{returnPose,phase:report.entry.source.phase});
 report.assetReadiness=await readiness();
 check('new predicament pack and cabin meshes are loaded, not merely submitted',requiredMeshes.every(n=>report.assetReadiness.catalog.includes(n)),{required:requiredMeshes,catalog:report.assetReadiness.catalog,assetResponses:report.assetResponses.filter(r=>/source-drive\/(drive\.glb|predicaments\/drive-predicaments\.glb)$/.test(r.path))});
 check('shared final acquisition compiles without GL errors',report.assetReadiness.pixelMesh.shaderReady&&!report.assetReadiness.pixelMesh.lastGlError&&!report.assetReadiness.pixelMesh.lastError,report.assetReadiness.pixelMesh);
 const freezeCore=await page.evaluate(async()=>{const response=await fetch('/assets/source-drive/drive.glb'),bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');});report.cabinSha256=freezeCore;
 check('the loaded cabin is the new material/model bake',freezeCore==='5a0f95ea4e5a771f6d060d8bb542cbbe62d063b06d99e771d27535ff7360d5f5',freezeCore);
 report.predicamentAssetSha256=await page.evaluate(async()=>{const r=await fetch('/assets/source-drive/predicaments/drive-predicaments.glb'),b=await r.arrayBuffer(),d=await crypto.subtle.digest('SHA-256',b);return[...new Uint8Array(d)].map(v=>v.toString(16).padStart(2,'0')).join('');});
 check('the resolved predicament mesh pack matches the frozen asset bytes',report.predicamentAssetSha256===report.sourceBefore.find(r=>r.path==='public/assets/source-drive/predicaments/drive-predicaments.glb')?.sha256,{loaded:report.predicamentAssetSha256,frozen:report.sourceBefore.find(r=>r.path==='public/assets/source-drive/predicaments/drive-predicaments.glb')?.sha256});

 await fixture({name:'ordinary-cabin-material-view',distance:55,programmeTime:12,lookYaw:-.23,lookPitch:-.25,weatherSeconds:8});await screenshot('ordinary-cabin');
 await fixture({name:'radio-reach-material-view',distance:55,programmeTime:12,lookYaw:-.42,lookPitch:-.4,weatherSeconds:8});await press('Enter');await press('2');
 await page.waitForFunction(async()=>{const d=await import('/src/game/source-drive/geometry/wheel-hands-pose.js');return d.wheelHandDiagnostics()?.reach?.atContact;},{timeout:15000,polling:25});
 report.radioReach=await page.evaluate(async()=>{const d=await import('/src/game/source-drive/geometry/wheel-hands-pose.js');return d.wheelHandDiagnostics();});await screenshot('radio-contact');
 check('physical radio reach contacts the actual control with an anchored right hand',report.radioReach.reach?.kind==='tune'&&report.radioReach.reach.atContact&&report.radioReach.reach.contactErrorM<.002&&!report.radioReach.hands.right.unreachable,{reach:report.radioReach.reach,right:report.radioReach.hands.right});
 await page.waitForFunction(()=>__probe.sourceDrive.state().state.station==='company',{timeout:15000});
 await fixture({name:'cliff-258-static',distance:258,programmeTime:98,lookPitch:-.015});await screenshot('cliff-258');
 await fixture({name:'cliff-280-static',distance:280,programmeTime:98,lookPitch:-.02});await screenshot('cliff-280');
 await fixture({name:'cliff-350-static',distance:350,programmeTime:114,lookYaw:.08,lookPitch:-.03});await screenshot('cliff-350');
 if(!skipWhiteout){
 const white=await fixture({name:'white-sea-1030-static',distance:1030,programmeTime:238,lookPitch:-.015,weatherSeconds:25});await screenshot('whiteout-1030');
 const actualWeather=await page.evaluate(()=>__probe.sourceDrive.checkpoint().weather);report.whiteoutStatic={fixture:white,snowMean:actualWeather.snowGrid.reduce((a,b)=>a+b,0)/actualWeather.snowGrid.length,snowMaximum:Math.max(...actualWeather.snowGrid),controls:{fog:actualWeather.fog,snow:actualWeather.snow,whiteout:actualWeather.whiteout}};
 check('whiteout is rendered on a physically 54.5m wide deck with snow and packed pane material',Math.abs(white.road.halfWidth*2-54.5)<.01&&actualWeather.snow>.5&&actualWeather.whiteout>.5&&report.whiteoutStatic.snowMean>.1,report.whiteoutStatic);
 await fixture({name:'white-sea-1030-clear-diagnostic',distance:1030,programmeTime:238,lookPitch:-.015,weatherSeconds:25,diagnosticClear:true});await screenshot('whiteout-1030-clear-diagnostic');
 }
 await writeFile(join(out,'static-ready.json'),JSON.stringify({attempt,run,screenshots:report.screenshots,checks:report.checks,errors:report.errors},null,2));console.log('STATIC_READY',run);

 if(!staticOnly){

 // Movie1: the single-lane road. One declared start, then only ordinary input.
 await fixture({name:'cliff-film-approach',distance:258,programmeTime:96,lookPitch:-.015});await press('Enter');report.cliffBaseline=await captureBaseline();await beginFilm('cliff-driving');
 const cliff=await followRoad(308,{speed:4.6,maximumSeconds:30});report.cliffDrive={distanceAdvanced:cliff.distanceAdvanced,elapsedMs:cliff.elapsedMs,maximumOffset:Math.max(...cliff.samples.map(s=>Math.abs(s.road.offset))),sampleCount:cliff.samples.length};
 check('cliff film advances at least25m with actual steering and braking',cliff.distanceAdvanced>=25&&cliff.samples.some(s=>Math.abs(s.wheelAngle)>.015)&&Math.abs(cliff.final.speed)<.015,report.cliffDrive);
 report.cliffHornMix={before:await page.evaluate(()=>__probe.sourceDrive.sound()?.wreckHorns||[]),ownership:'Three fixed dual-tone exterior voices enter the physical cabin mix before recorder capture; radio power operates its receiver branch only. Reported gains/pans/ranges establish configured routing, not individual perceptual audibility.'};
 await press('o');await page.waitForFunction(()=>!__probe.sourceDrive.state().state.radioOn,{timeout:15000});await clockWait(1.1);report.cliffHornMix.radioOff=await page.evaluate(()=>({radioOn:__probe.sourceDrive.state().state.radioOn,voices:__probe.sourceDrive.sound()?.wreckHorns||[]}));
 check('radio OFF retains finite spatial exterior horn sources in the cabin mix',!report.cliffHornMix.radioOff.radioOn&&report.cliffHornMix.radioOff.voices.length>0&&report.cliffHornMix.radioOff.voices.length<=3&&report.cliffHornMix.radioOff.voices.every(v=>[v.gain,v.pan,v.range].every(Number.isFinite)),report.cliffHornMix);
 await drag(110,-110);await clockWait(.7);await screenshot('cliff-overhead-look');await drag(-110,110);const cliffStop=await state();await hold('s',1600);await brake();const cliffReverse=await state();
 check('the driver can hold the cliff stop, look, and deliberately reverse',cliffReverse.state.z>cliffStop.state.z+.25&&Math.abs(cliffReverse.state.speed)<.015,{before:{x:cliffStop.state.x,z:cliffStop.state.z,time:cliffStop.state.programTime},after:{x:cliffReverse.state.x,z:cliffReverse.state.z,time:cliffReverse.state.programTime}});
 await screenshot('cliff-controlled-stop');const cliffFilm=await endFilm();
 check('cliff film encodes the final visible layers and actual stereo output',cliffFilm.fullDecode&&cliffFilm.mediaProbe.streams.some(s=>s.codec_type==='video'&&Number(s.nb_read_packets)>30)&&cliffFilm.mediaProbe.streams.some(s=>s.codec_type==='audio'&&s.channels===2)&&cliffFilm.maximumMonitorRms>1e-5&&cliffFilm.visibleSourceOverlayFrames===0,cliffFilm);

 // Movie2: another declared approach, then only actual controls/recording.
 // The1.1s uncaptured held baseline brings the first movie picture to roughly
 //224s. Starting the fixture at224 would miss the actual saved-clock tear.
 await fixture({name:'white-sea-film-approach',distance:1000,programmeTime:222.8,lookPitch:-.015,weatherSeconds:25});await press('Enter');report.whiteoutBaseline=await captureBaseline();await beginFilm('whiteout-driving');
 await press('r');await page.waitForFunction(()=>__probe.sourceDrive.state()?.tape.recording,{timeout:15000});
 const whiteDrive=await followRoad(1040,{speed:5.7,maximumSeconds:24});report.whiteoutDrive={distanceAdvanced:whiteDrive.distanceAdvanced,elapsedMs:whiteDrive.elapsedMs,sampleCount:whiteDrive.samples.length,maximumOffset:Math.max(...whiteDrive.samples.map(s=>Math.abs(s.road.offset)))};
 check('whiteout film crosses at least25m through actual snow-covered driving',whiteDrive.distanceAdvanced>=25&&Math.abs(whiteDrive.final.speed)<.015,report.whiteoutDrive);
 await press('3');await page.waitForFunction(()=>__probe.sourceDrive.state().state.station==='music',{timeout:15000});await press('o');await page.waitForFunction(()=>!__probe.sourceDrive.state().state.radioOn,{timeout:15000});
 const heldWhite=await state();await clockWait(1);await hold('s',1700);await brake();const reverseWhite=await state();
 check('whiteout still permits a chosen stop, real preset/OFF operation and reversing',reverseWhite.state.z>heldWhite.state.z+.25&&!reverseWhite.state.radioOn&&reverseWhite.state.station==='music',{before:{z:heldWhite.state.z,time:heldWhite.state.programTime},after:{z:reverseWhite.state.z,time:reverseWhite.state.programTime,on:reverseWhite.state.radioOn,station:reverseWhite.state.station}});
 await drag(125,12);await clockWait(.7);await drag(-125,-12);await press('x');
 await page.waitForFunction(()=>{const q=__probe.sourceDrive.state(),c=__probe.sourceDrive.checkpoint();return !q.tape.recording&&c.tape.takeRefs.at(-1)?.durable;},{timeout:20000});
 report.fieldTake=await page.evaluate(()=>__probe.sourceDrive.checkpoint().tape.takeRefs.at(-1));
 check('ordinary REC/STOP seals real durable cabin audio throughout the whiteout film',report.fieldTake.durable&&report.fieldTake.durationSeconds>6&&!!report.fieldTake.sha256,report.fieldTake);
 await screenshot('whiteout-controlled-stop');const whiteFilm=await endFilm();
 check('whiteout film fully decodes final video and stereo monitor sound',whiteFilm.fullDecode&&whiteFilm.mediaProbe.streams.some(s=>s.codec_type==='video'&&Number(s.nb_read_packets)>30)&&whiteFilm.mediaProbe.streams.some(s=>s.codec_type==='audio'&&s.channels===2)&&whiteFilm.visibleSourceOverlayFrames===0,whiteFilm);
 check('the whiteout movie observes a real saved-clock veil tear and closure while snow stays active',!whiteFilm.fixture.diagnosticClear&&whiteFilm.weatherEnvelope.minimumWhiteout<.35&&whiteFilm.weatherEnvelope.maximumWhiteout>.6&&whiteFilm.weatherEnvelope.minimumSnow>.5,whiteFilm.weatherEnvelope);

 // Separate pause/reload/return checks begin after both continuous movies.
 await press('Escape');await wait(250);const paused=await page.evaluate(()=>({state:__probe.sourceDrive.state(),cp:__probe.sourceDrive.checkpoint()}));await wait(500);const still=await page.evaluate(()=>({state:__probe.sourceDrive.state(),cp:__probe.sourceDrive.checkpoint()}));report.pause={programmeTime:paused.state.state.programTime,weather:paused.cp.weather.timeSec};
 check('pause freezes the snow reservoir, wiper phase, programme and vehicle',paused.state.paused&&JSON.stringify(paused.cp.weather)===JSON.stringify(still.cp.weather)&&paused.state.state.programTime===still.state.state.programTime&&paused.state.state.x===still.state.state.x&&paused.state.state.z===still.state.state.z,report.pause);
 const saved=paused.cp;await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__probe?.sourceDrive?.resumeSaved&&['lens-calibration','title','opening-credits'].includes(window.__scenes?.top?.()?.id),{timeout:90000});await page.evaluate(()=>__probe.sourceDrive.resumeSaved());
 report.fixtures.push({kind:'after-film native page reload',qualification:'Actual saved-session/PB/enterStory path; diagnostic resume bypasses startup calibration only.'});await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:90000});await readiness();
 const restored=await page.evaluate(()=>({state:__probe.sourceDrive.state(),cp:__probe.sourceDrive.checkpoint()}));report.reload={state:restored.state,weatherSha256:hash(JSON.stringify(restored.cp.weather)),expectedWeatherSha256:hash(JSON.stringify(saved.weather))};
 check('reload retains exact snow/glass/wipers and safe stationary OFF continuation',restored.state.paused&&restored.state.state.speed===0&&!restored.state.opening&&!restored.state.state.radioOn&&restored.state.state.station==='music'&&JSON.stringify(restored.cp.weather)===JSON.stringify(saved.weather)&&restored.state.state.programTime===saved.drive.programTime,report.reload);
 check('reload retains exact recorded sound and exterior return',restored.cp.tape.takeRefs.some(t=>t.sha256===report.fieldTake.sha256)&&JSON.stringify(restored.cp.returnPose)===JSON.stringify(returnPose),{takeSha:report.fieldTake.sha256,returnPose:restored.cp.returnPose});
 const storedAudio=await page.evaluate(async ref=>{const M=await import('/src/audio/source-drive-recording.js'),context=window.__entryMonitorTaps[0]?.context;if(!context)throw Error('Existing output context is unavailable for stored take integrity check.');const decoded=await M.decodeSourceDriveMedia(context,ref),digest=await M.sourceDriveBlobDigest(decoded.blob),bytes=new Uint8Array(await decoded.blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return{sha256:digest,bytes:bytes.length,mime:decoded.blob.type,durationSeconds:decoded.buffer.duration,frames:decoded.buffer.length,sampleRate:decoded.buffer.sampleRate,channels:decoded.buffer.numberOfChannels,base64:btoa(text)};},report.fieldTake);
 await writeFile(join(run,'reloaded-field-take.webm'),Buffer.from(storedAudio.base64,'base64'));delete storedAudio.base64;report.reloadedStoredAudio={...storedAudio,path:attempt+'/reloaded-field-take.webm'};
 check('actual IndexedDB audio bytes survive reload and decode with exact captured identity',storedAudio.sha256===report.fieldTake.sha256&&storedAudio.bytes===report.fieldTake.bytes&&storedAudio.frames===report.fieldTake.frames&&storedAudio.channels===report.fieldTake.channels,report.reloadedStoredAudio);
 await page.evaluate(async()=>{const cp=__probe.sourceDrive.checkpoint(),{worldAt}=await import('/src/game/source-drive/road.js'),a=worldAt(1200,0);Object.assign(cp.drive,{x:a.x,z:a.z,heading:a.heading,furthest:1200,roadHeight:a.height,roadOffset:0,speed:0,arrived:true,finished:false});await __probe.sourceDrive.fixture(cp);});
 report.fixtures.push({kind:'after-film stopped apron placement for exact Source return',distance:1200});await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:30000});await press('Enter');await page.waitForFunction(()=>!__probe.sourceDrive.state(),{timeout:15000});
 report.returned=await sourceBoundary();await screenshot('returned-before-walk');
 check('explicit dismount returns to the exact Source position and keeps its incomplete walk and recorded evidence',report.returned.position.x===returnPose.x&&report.returned.position.y===returnPose.y&&report.returned.checkpoint.status==='returned'&&!report.returned.source.completed&&report.returned.checkpoint.tape.takeRefs.some(t=>t.sha256===report.fieldTake.sha256),{position:report.returned.position,returnPose,status:report.returned.checkpoint.status,completed:report.returned.source.completed});
 }
 check('no shared shader, GL, repeated-loop or module faults occurred',!report.errors.length,report.errors);
 const critical=['/src/main.js','/src/render/r3d.js','/src/render/props3d.js','/src/game/source-drive-session.js','/src/game/source-drive/route-treatment.js'];
 check('critical modules came from the fixed snapshot',critical.every(path=>report.snapshotResponses.some(r=>r.path===path&&r.fixed)),{critical,responseCount:report.snapshotResponses.length});
 report.passed=true;
}catch(error){report.failure=String(error.stack||error);report.passed=false;console.log('FAILED',report.failure);process.exitCode=1;if(filmStarted)try{await endFilm();}catch(e){report.captureFailure=String(e);}if(page)try{await screenshot('failure');report.failureState=await page.evaluate(()=>({scene:window.__scenes?.top?.()?.id,state:window.__probe?.sourceDrive?.state?.(),frame:window.__probe?.sourceDrive?.frame?.(),body:document.body.innerText.slice(-1500)}));}catch{}}
finally{
 try{
 report.sourceAfter=await identity();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(!report.sourceStable){report.passed=false;process.exitCode=1;report.errors.push('Frozen inspected sources changed during capture.');}
 const files=await filesBelow(run,()=>true);report.outputBytes=(await Promise.all(files.map(async path=>(await stat(path)).size))).reduce((a,b)=>a+b,0);
 report.outputBudgetMiB=budgetMiB;report.outputBudgetBytes=budgetMiB*1024*1024;if(report.outputBytes>report.outputBudgetBytes){report.passed=false;process.exitCode=1;report.errors.push(`Native artifact output exceeded${budgetMiB}MiB budget.`);}
 await writeFile(join(run,'report.json'),JSON.stringify(report,null,2));await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('COMPLETE',JSON.stringify({passed:report.passed,sourceStable:report.sourceStable,checks:report.checks.length,outputBytes:report.outputBytes,run}));
 }finally{try{await browser?.close();}finally{await rm(profile,{recursive:true,force:true});}}
}
process.exit(process.exitCode||0);
