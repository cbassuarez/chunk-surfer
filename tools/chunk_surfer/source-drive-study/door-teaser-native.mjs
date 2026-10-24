// One real E-owned outside entry, full title and intact transient drive film.
// Fixture mutations are forbidden while capturing. Ordinary S/Space attempts
// begin at the observed cliff commitment. Pause/reload is a separately
// declared second approach, never spliced into the primary cinematic movie.
import puppeteer from 'puppeteer-core';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const baseURL=process.env.SOURCE_DRIVE_BASE_URL,snapshot=process.env.SOURCE_DRIVE_SNAPSHOT_DIR;
const budgetMiB=Number(process.env.SOURCE_DRIVE_NATIVE_BUDGET_MIB??64),out='artifacts/source-drive-study/door-teaser/native';
if(!baseURL||!snapshot)throw Error('An explicit frozen server and source directory are required.');
if(!Number.isFinite(budgetMiB)||budgetMiB<=0)throw Error('A positive output budget is required.');
const disk=await statfs('.'),preflightFreeBytes=disk.bavail*disk.bsize;
if(preflightFreeBytes<200*1024*1024)throw Error('At least200MiB free is required before opening the capture browser.');
await mkdir(out,{recursive:true});const attempt='attempt-'+Date.now(),run=join(out,attempt);await mkdir(run);
const profile=await mkdtemp(join(tmpdir(),'source-door-teaser-'));
const hash=b=>createHash('sha256').update(b).digest('hex'),wait=ms=>new Promise(ok=>setTimeout(ok,ms));
async function filesBelow(dir){const list=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())list.push(...await filesBelow(p));else list.push(p);}return list;}
const sourcePaths=(await filesBelow(snapshot)).sort(),identity=()=>Promise.all(sourcePaths.map(async path=>({path:path.slice(snapshot.length+1),sha256:hash(await readFile(path))})));
const requiredMeshes=['drive_cabin','drive_radio','drive_wheel','drive_vehicle_body','dp_wreck_saloon','dp_wreck_estate','dp_wreck_shell','dp_cliff_mass','dp_cliff_shelf','dp_wreck_broken_lamp'];
const report={kind:'opening-door-drive-teaser-native',mode:'full',staticOnly:false,attempt,baseURL,snapshot,preflightFreeBytes,budgetMiB,
 scope:'One declared pre-title outside-goods-door fixture followed by ordinary E and uninterrupted title/drive/fall/door return, ordinary S+Space attempts from observed cliff commitment into the fall, actual monitor sound and final visible canvas layers. A separate repeated outside fixture tests Escape after cliff commitment and cold reload. This is technical browser evidence, not a fresh-player pacing, headphone mix, fear, comfort, physical WebView/GPU or human smoothness acceptance.',
 checks:[],errors:[],fixtures:[],inputs:[],screenshots:[],sourceBefore:await identity(),harnessSha256:hash(await readFile(new URL(import.meta.url)))};
let browser,page,filmStarted=false;
await writeFile(join(run,'harness.mjs'),await readFile(new URL(import.meta.url)));
function check(name,pass,detail,fatal=true){report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail).slice(0,1200));if(!pass&&fatal)throw Error(name);}
async function press(key){await page.keyboard.press(key);report.inputs.push({key,pageMs:await page.evaluate(()=>performance.now()),film:filmStarted});}
async function down(key){await page.keyboard.down(key);report.inputs.push({type:'keydown',key,pageMs:await page.evaluate(()=>performance.now()),film:filmStarted});}
async function up(key){await page.keyboard.up(key);report.inputs.push({type:'keyup',key,pageMs:await page.evaluate(()=>performance.now()),film:filmStarted});}
function installBootstrap(){
 localStorage.setItem('chunk-surfer:meta:v2',JSON.stringify({version:2,eulaAccepted:'2026-07-16',eulaAcceptedAt:Date.now()}));
 window.__doorActualHasFocus=document.hasFocus.bind(document);
 Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
 window.__doorLifecycle=[];
 window.__doorContext=(q=window.__probe?.getInDriveTeaser?.())=>{const top=window.__scenes?.top?.(),motion=window.__chunkSurferMotion?.status?.();return{scene:top?.id||null,topWorldPresentation:top?.worldPresentation??null,worldPresentation:window.__scenes?.worldPresentation?.()||null,title:top?.id==='world-title'?top.view?.()||null:null,hidden:document.hidden,visibility:document.visibilityState,reportedFocus:document.hasFocus(),actualFocus:window.__doorActualHasFocus(),motion:motion?{paused:motion.paused,motionResetReason:motion.motionResetReason,lastLoopMs:motion.lastLoopMs}:null,teaser:q?{active:q.active,ready:q.view?.ready,phase:q.view?.phase,timeSec:q.view?.timeSec,paused:q.view?.paused,audioPaused:q.audio?.paused,cliffCommitted:q.view?.vehiclePose?.cliffCommitted}:null};};
 for(const type of ['focus','blur'])window.addEventListener(type,()=>window.__doorLifecycle.push({event:type,pageMs:performance.now(),context:window.__doorContext()}));
 document.addEventListener('visibilitychange',()=>window.__doorLifecycle.push({event:'visibilitychange',pageMs:performance.now(),context:window.__doorContext()}));
 window.__doorKeyEvents=[];for(const type of ['keydown','keyup'])document.addEventListener(type,event=>{if(!window.__doorFilm?.running)return;const q=window.__probe?.getInDriveTeaser?.(),v=q?.view;window.__doorKeyEvents.push({type,key:event.key,code:event.code,t:performance.now(),phase:v?.phase,timeSec:v?.timeSec,cliffCommitted:v?.vehiclePose?.cliffCommitted??false});},{capture:true});
 const NativeSocket=WebSocket;window.WebSocket=class extends NativeSocket{constructor(url,protocols){if(protocols==='vite-hmr')return new class extends EventTarget{constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}};super(url,protocols);}};
 const connect=AudioNode.prototype.connect,taps=new WeakMap();window.__doorMonitorTaps=[];
 AudioNode.prototype.connect=function(...args){const result=connect.apply(this,args),context=this.context;if(args[0]===context?.destination){let tap=taps.get(context);if(!tap){const destination=context.createMediaStreamDestination(),analyser=context.createAnalyser();analyser.fftSize=1024;tap={context,destination,analyser,nodes:new WeakSet(),nodeNames:[],samples:new Float32Array(1024)};taps.set(context,tap);window.__doorMonitorTaps.push(tap);}if(!tap.nodes.has(this)){tap.nodes.add(this);tap.nodeNames.push(this.constructor.name);connect.call(this,tap.destination,args[1]??0);connect.call(this,tap.analyser,args[1]??0);}}return result;};
}
async function boundary(){return page.evaluate(()=>({teaser:__probe.getInDriveTeaser(),position:__probe.pos(),look:__probe.lookAngles(),scene:__scenes.top()?.id||null,context:window.__doorContext(),tutorial:__probe.tut(),door:__probe.doors().find(d=>d.id==='dock-grey-exterior'),sourceDrive:structuredClone(window.__doorSave.getSave().sourceDrive),takes:__probe.tape().takes,saved:{px:window.__doorSave.getSave().px,py:window.__doorSave.getSave().py,view:window.__doorSave.getSave().view}}));}
async function screenshot(name){const clip=await page.$eval('#map',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}),bytes=await page.screenshot({path:join(run,name+'.png'),clip});report.screenshots.push({name,path:attempt+'/'+name+'.png',sha256:hash(bytes),bytes:bytes.length});console.log('SCREENSHOT',join(run,name+'.png'));}
async function outsideFixture(name){
 if(filmStarted)throw Error('Fixture mutations are forbidden inside the cinematic movie.');
 const receipt=await page.evaluate(async name=>{
  window.__doorObservationLabel=name;
  await __probe.testRun();__probe.tutSkip();__probe.hush();__probe.clearDiagnosticScenes?.();__probe.frontEndGrade?.(false);
  const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;
  const S=window.__doorSave=await import(resource('/src/game/save.js')),F=await import(resource('/src/world/floorplan.js'));window.__doorProps=await import(resource('/src/render/props3d.js'));
  const flags={...S.getSave().flags};for(const key of Object.keys(flags))if(key.startsWith('setup.')||['combat.trained','title.shown','opening.driveTeaser.pending','opening.driveTeaser.consumed','opening.postDoor.started','opening.postDoor.completed','dock.departed'].includes(key))delete flags[key];
  for(const key of ['prologueDone','van.closed','opening.vehicle.exited','kit.fitted','bag.taken','map.taken'])flags[key]=true;
  S.saveCommit({flags});F.setDoorOpen('dock-grey-exterior',false);
  const door=__probe.doors().find(d=>d.id==='dock-grey-exterior');if(!door)throw Error('The actual outside goods door is absent.');
  __probe.warpRuntime(door.cx-4,door.cy,1);__probe.lookAtWorld(Math.PI/2,0);__probe.tutSkip();__probe.hush();
  const position=__probe.pos();S.saveCommit({px:position.x,py:position.y,view:__probe.lookAngles(),facing:1,area:'conservatory',flags:S.getSave().flags,doors:F.saveDoorState()});
  return{name,door,position,look:__probe.lookAngles(),keys:__probe.keys(),tutorial:__probe.tut(),focus:__probe.interactionFocus(),setup:__probe.setupHandoff(),sourceDrive:structuredClone(S.getSave().sourceDrive),takes:__probe.tape().takes,
   qualification:'Separate technical pre-title approach, derived from the actual runtime goods portal; lodge handover, equipment selection and earlier exterior walking are fixture prerequisites.'};
 },name);report.fixtures.push(receipt);await wait(600);return receipt;
}

function beginCompositeFilm(){
 const map=document.querySelector('#map'),rect=map.getBoundingClientRect(),canvas=document.createElement('canvas');canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),tap=window.__doorMonitorTaps[0];if(!tap)throw Error('The existing game monitor-output fork is unavailable.');
 const reduction=[];let rw=canvas.width,rh=canvas.height;while(rw>32||rh>24){rw=Math.max(32,Math.round(rw/2));rh=Math.max(24,Math.round(rh/2));const c=document.createElement('canvas');c.width=rw;c.height=rh;reduction.push({canvas:c,ctx:c.getContext('2d',{willReadFrequently:true})});}
 const capture=canvas.captureStream(0),track=capture.getVideoTracks()[0];if(typeof track.requestFrame!=='function')throw Error('Explicit composite frame capture is unavailable.');
 const stream=new MediaStream([...capture.getVideoTracks(),...tap.destination.stream.getAudioTracks()]),mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(m=>MediaRecorder.isTypeSupported(m));
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000,audioBitsPerSecond:128000}),f=window.__doorFilm={canvas,ctx,tap,track,rec,chunks:[],frames:[],layers:[],start:performance.now(),last:-Infinity,running:true,firstReadiness:null};
 for(const key of ['testRun','tutSkip','setFlags','warpRuntime','warpCell','sourceWarp','sourcePreset','sourceStep','lookAtWorld','faceYaw']){const original=__probe[key];if(typeof original==='function')__probe[key]=function(...args){if(window.__doorFilm?.running)throw Error('Forbidden movie fixture mutation: '+key);return original.apply(this,args);};}
 rec.ondataavailable=e=>{if(e.data.size)f.chunks.push(e.data);};
 function draw(now){
  if(!f.running)return;
  if(now-f.last>=31.5){f.last=now;const host=map.getBoundingClientRect();ctx.globalAlpha=1;ctx.filter='none';ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
   const layers=[...map.querySelectorAll('canvas')].map((element,index)=>({element,index,style:getComputedStyle(element),rect:element.getBoundingClientRect()})).filter(x=>x.style.display!=='none'&&x.style.visibility!=='hidden'&&Number(x.style.opacity)>0&&x.rect.width>0&&x.rect.height>0).sort((a,b)=>(Number(a.style.zIndex)||0)-(Number(b.style.zIndex)||0)||a.index-b.index);
   f.layers=layers.map(x=>({className:x.element.className,z:x.style.zIndex,opacity:x.style.opacity,filter:x.style.filter,blend:x.style.mixBlendMode,width:x.element.width,height:x.element.height}));
   for(const x of layers){if(x.style.mixBlendMode!=='normal')throw Error('Unsupported non-normal canvas blend in movie capture.');ctx.globalAlpha=Number(x.style.opacity);ctx.filter=x.style.filter;ctx.drawImage(x.element,x.rect.x-host.x,x.rect.y-host.y,x.rect.width,x.rect.height);}ctx.globalAlpha=1;ctx.filter='none';
   let reduced=canvas;for(const level of reduction){level.ctx.clearRect(0,0,level.canvas.width,level.canvas.height);level.ctx.drawImage(reduced,0,0,level.canvas.width,level.canvas.height);reduced=level.canvas;}const pixels=reduction.at(-1).ctx.getImageData(0,0,32,24).data;let sumLuma=0,maximumChannel=0;for(let i=0;i<pixels.length;i+=4){sumLuma+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;maximumChannel=Math.max(maximumChannel,pixels[i],pixels[i+1],pixels[i+2]);}
   tap.analyser.getFloatTimeDomainData(tap.samples);const outputRms=Math.sqrt(tap.samples.reduce((n,v)=>n+v*v,0)/tap.samples.length);
   const q=__probe.getInDriveTeaser(),v=q.view,p=v?.vehiclePose,r=v?.renderFrame,door=__probe.doors().find(d=>d.id==='dock-grey-exterior'),saved=window.__doorSave.getSave(),shader=window.__chunkSurferPixelMesh.status();
   if(v?.ready&&!f.firstReadiness)f.firstReadiness={t:now,meshCatalog:window.__doorProps.propMeshCatalog(),characters:window.__doorProps.characterStats(),shader};
   f.frames.push({t:now,ms:now-f.start,scene:__scenes.top()?.id||null,context:window.__doorContext(q),position:__probe.pos(),tutorial:__probe.tut(),active:q.active,consumed:q.consumed,pending:q.pending,
    teaser:v?{prelude:v.prelude,ready:v.ready,restored:v.restored,phase:v.phase,timeSec:v.timeSec,coverAlpha:v.coverAlpha,worldOwner:v.worldOwner,vehicleY:p?.position.y,vehicleX:p?.position.x,vehicleZ:p?.position.z,distance:p?.distance,cliffCommitted:p?.cliffCommitted??false,controlOwner:p?.controlOwner,fallSeconds:p?.fallSeconds,pitch:p?.pitch,lookPitch:r?.look.pitch,bodyY:r?.scene.body[13],weatherRevision:v.weatherRevision,wiperPhase:v.wiperPhase,programmeTime:v.driveState?.programTime,throttle:v.driveState?.throttle,engineLoad:v.driveState?.engineLoad,speed:v.driveState?.speed,acceleration:v.driveState?.longitudinalAcceleration,engine:q.audio?.engine||null,paused:v.paused}:null,
    door:{state:door?.state,openFraction:door?.openFraction},savedPose:{x:saved.px,y:saved.py,yaw:saved.view?.yaw,pitch:saved.view?.pitch},
    sourceDriveUnchanged:JSON.stringify(saved.sourceDrive)===window.__doorSourceBaseline,takeCount:__probe.tape().takes.length,
    shader:{ready:shader.shaderReady,error:shader.lastError,glError:shader.lastGlError,framesRendered:shader.framesRendered},meanLuma:sumLuma/(32*24*255),maximumChannel:maximumChannel/255,outputRms});track.requestFrame();
  }requestAnimationFrame(draw);
 }
 rec.start(250);requestAnimationFrame(draw);return{start:f.start,width:canvas.width,height:canvas.height,mime,tapNodes:tap.nodeNames,contextCount:window.__doorMonitorTaps.length,scope:'Actual #map canvases by CSS z-index/DOM order, including title/cover/HUD, plus passive actual monitor-output fork; no audio replacement.'};
}
async function finishFilm(){
 if(!filmStarted)return;
 const data=await page.evaluate(async()=>{const f=window.__doorFilm;f.running=false;await new Promise(ok=>{f.rec.onstop=ok;f.rec.stop();});f.track.stop();const blob=new Blob(f.chunks,{type:f.rec.mimeType}),b=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<b.length;i+=8192)raw+=String.fromCharCode(...b.subarray(i,i+8192));return{base64:btoa(raw),bytes:blob.size,mime:f.rec.mimeType,start:f.start,end:performance.now(),frames:f.frames,layers:f.layers,inputs:window.__doorKeyEvents,firstReadiness:f.firstReadiness,contextCount:window.__doorMonitorTaps.length,tapNodes:f.tap.nodeNames};});filmStarted=false;
 const bytes=Buffer.from(data.base64,'base64');delete data.base64;const movie=join(run,'outside-title-drive-return.webm');await writeFile(movie,bytes);
 const mediaProbe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_packets','-show_entries','stream=codec_type,codec_name,width,height,channels,sample_rate,nb_read_packets','-show_entries','format=size,duration','-of','json',movie],{encoding:'utf8',timeout:30000}));
 const packets=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_packets','-show_entries','packet=stream_index,pts_time,dts_time','-of','json',movie],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024})).packets;
 const streamTiming=mediaProbe.streams.map((stream,index)=>{const p=packets.filter(p=>p.stream_index===index),nonMonotonicDts=p.slice(1).filter((r,i)=>Number.isFinite(Number(r.dts_time))&&Number.isFinite(Number(p[i].dts_time))&&Number(r.dts_time)<Number(p[i].dts_time)).length;return{type:stream.codec_type,packets:p.length,nonMonotonicDts,firstPts:p[0]?.pts_time,lastPts:p.at(-1)?.pts_time};});
 let decoded=true,decodeError='';try{execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-copyts','-i',movie,'-fps_mode','passthrough','-enc_time_base:v','1/1000','-f','null','-'],{encoding:'utf8',timeout:60000});}catch(e){decoded=false;decodeError=String(e.stderr||e.message);}
 const intervals=data.frames.slice(1).map((r,i)=>r.t-data.frames[i].t).sort((a,b)=>a-b),at=q=>intervals[Math.min(intervals.length-1,Math.floor(intervals.length*q))];
 report.film={path:attempt+'/outside-title-drive-return.webm',sha256:hash(bytes),bytes:bytes.length,capture:report.capture,mediaProbe,decoded,decodeError,streamTiming,
  wallSeconds:(data.end-data.start)/1000,cadence:{frames:data.frames.length,p50Ms:at(.5),p95Ms:at(.95),maximumMs:intervals.at(-1),qualification:'Includes composite readback, encoder, telemetry and game work; not isolated GPU timing or human smoothness.'},
  maximumMonitorRms:Math.max(...data.frames.map(f=>f.outputRms)),layers:data.layers,contextCount:data.contextCount,tapNodes:data.tapNodes};
 await writeFile(join(run,'outside-title-drive-return-trace.json'),JSON.stringify(data,null,2));report.film.trace=attempt+'/outside-title-drive-return-trace.json';
 for(const [name,predicate]of [['title',f=>f.scene==='world-title'],['climbing-queue',f=>f.teaser?.phase==='approach'&&f.teaser.timeSec>2.8],['departure',f=>f.teaser?.phase==='departure'&&f.teaser.timeSec>6.4],['fall-reference',f=>f.teaser?.phase==='fall'&&f.teaser.fallSeconds>=.65&&f.teaser.fallSeconds<=.85],['fall',f=>f.teaser?.phase==='fall'&&f.teaser.vehicleY< -25],['returned',f=>!f.active&&f.tutorial.active]]){
  const f=data.frames.find(predicate);if(!f)continue;const target=join(run,name+'.png');execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-ss',String(f.ms/1000),'-i',movie,'-frames:v','1','-update','1',target],{timeout:30000});const b=await readFile(target);report.screenshots.push({name,path:attempt+'/'+name+'.png',sha256:hash(b),bytes:b.length,fromMovieMs:f.ms,qualification:'Extracted from intact encoded movie, nearest video timestamp; no altered game fixture.'});console.log('KEYFRAME',target);
 }
 return data;
}

try{
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
 page=await browser.newPage();await page.setViewport({width:1100,height:760,deviceScaleFactor:1});await page.bringToFront();report.responses=[];report.assetFailures=[];
 page.on('response',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/src/'))report.responses.push({path:p,fixed:r.headers()['x-source-drive-snapshot']==='fixed'});});
 page.on('requestfailed',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/assets/source-drive/'))report.assetFailures.push({path:p,error:r.failure()?.errorText});});
 page.on('pageerror',e=>{report.errors.push(String(e));console.log('PAGEERROR',String(e));});
 page.on('console',m=>{if(m.type()==='error'&&/get-in-drive-teaser|LOOP FAULT|shader|compile|SyntaxError|ReferenceError|Failed to load module script/i.test(m.text())){report.errors.push(m.text());console.log('RENDERERROR',m.text().slice(0,400));}});
 await page.evaluateOnNewDocument(installBootstrap);await page.goto(baseURL+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:60000});
 // bootScenes installs __probe before its awaited calibration/credits chain.
 // A fixture at that earlier point can clear the current scene and still be
 // covered later by afterCredits. Wait for the terminal startup title first;
 // these launch credits are outside the actual world-title movie under test.
 await page.waitForFunction(()=>!!window.__probe?.testRun&&window.__scenes?.top?.()?.id==='title'&&document.getElementById('title-a11y-status')?.textContent?.includes('START A NEW NIGHT.'),{timeout:120000});
 report.startupBoundary=await page.evaluate(()=>({context:window.__doorContext(),a11y:document.getElementById('title-a11y-status').textContent,pageMs:performance.now(),qualification:'Natural startup calibration and opening credits reached the terminal title and its START A NEW NIGHT accessibility text before the declared outside-door fixture; no startup callback is bypassed mid-flight.'}));
 await page.evaluate(()=>{window.__doorObservations=[];window.__doorObserver=setInterval(()=>{if(window.__doorObservations.length>=2400)return;const shader=window.__chunkSurferPixelMesh?.status?.();window.__doorObservations.push({pageMs:performance.now(),label:window.__doorObservationLabel||'startup',context:window.__doorContext(),shader:shader?{ready:shader.shaderReady,error:shader.lastError,glError:shader.lastGlError,framesRendered:shader.framesRendered}:null});},250);});
 const fixture=await outsideFixture('primary-real-outside-E');report.before=await boundary();
 check('fixture is outside the actual locked goods pair, with key, title unseen and setup incomplete',fixture.keys.includes('master')&&!fixture.tutorial.active&&fixture.door.state==='closed'&&!report.before.teaser.consumed&&fixture.focus.doorWins,{position:fixture.position,door:fixture.door.id,focus:fixture.focus,setup:fixture.setup});
 await screenshot('outside-before-E');await page.evaluate(()=>{window.__doorSourceBaseline=JSON.stringify(window.__doorSave.getSave().sourceDrive);});
 report.capture=await page.evaluate(beginCompositeFilm);filmStarted=true;await press('e');
 await page.waitForFunction(()=>{const q=__probe.getInDriveTeaser();return q.active&&q.view?.vehiclePose?.cliffCommitted;},{timeout:120000,polling:'raf'});
 report.controlAttempts={observed:await page.evaluate(()=>{const v=__probe.getInDriveTeaser().view;return{pageMs:performance.now(),phase:v.phase,timeSec:v.timeSec,pose:v.vehiclePose,drive:{speed:v.driveState.speed,throttle:v.driveState.throttle,engineLoad:v.driveState.engineLoad}};}),keys:['s',' '],qualification:'First RAF observation of commitment followed by ordinary native S and Space keydown; delivery timing is recorded, not claimed frame-perfect injection.'};
 await down('s');await down(' ');
 try{await page.waitForFunction(()=>{const v=__probe.getInDriveTeaser().view;return v?.phase==='fall'&&v.vehiclePose.fallSeconds>=2.7;},{timeout:20000,polling:'raf'});report.controlAttempts.after=await page.evaluate(()=>{const v=__probe.getInDriveTeaser().view;return{pageMs:performance.now(),phase:v.phase,timeSec:v.timeSec,pose:v.vehiclePose,drive:{speed:v.driveState.speed,throttle:v.driveState.throttle,engineLoad:v.driveState.engineLoad}};});}finally{await up(' ');await up('s');}
 await page.waitForFunction(()=>__probe.getInDriveTeaser().receipt?.returned,{timeout:120000,polling:100});await wait(900);report.returned=await boundary();const film=await finishFilm();
 const frames=film.frames,title=frames.filter(f=>f.scene==='world-title'),drive=frames.filter(f=>f.active&&f.teaser?.ready),fall=drive.filter(f=>f.teaser.phase==='fall');
 report.progression={titleFirstMs:title[0]?.ms,titleLastMs:title.at(-1)?.ms,titleObservedSeconds:((title.at(-1)?.ms||0)-(title[0]?.ms||0))/1000,
  driveFirstMs:drive[0]?.ms,minimumFallY:Math.min(...fall.map(f=>f.teaser.vehicleY)),minimumFallPitch:Math.min(...fall.map(f=>f.teaser.lookPitch??0)),drivePhases:[...new Set(drive.map(f=>f.teaser.phase))]};
 check('one real E crosses the goods pair and the complete14.9s title precedes the car',frames.some(f=>f.scene==='get-in-door-entry')&&report.progression.titleObservedSeconds>14.45&&report.progression.driveFirstMs>report.progression.titleLastMs,report.progression);
 const acquiring=frames.filter(f=>f.active&&(!f.teaser?.ready||f.teaser.prelude<.28));
 check('title-to-car acquisition stays completely covered with no intervening room flash',acquiring.length>0&&acquiring.every(f=>f.maximumChannel<.004),{samples:acquiring.length,maximumChannel:Math.max(...acquiring.map(f=>f.maximumChannel)),meanLuma:Math.max(...acquiring.map(f=>f.meanLuma)),qualification:'Progressively reduced actual composite pixels; confirms the opaque acquisition interval, not human edit pacing.'});
 check('actual final camera and vehicle fall below -30m with a downward pitch beyond -1rad',report.progression.minimumFallY< -30&&report.progression.minimumFallPitch< -1&&fall.some(f=>f.shader.ready&&!f.shader.error&&!f.shader.glError),report.progression);
 const heldEvents=film.inputs.filter(e=>['s',' '].includes(e.key)),start=report.controlAttempts.observed,end=report.controlAttempts.after,heldFrames=drive.filter(f=>f.t>=Math.max(...heldEvents.filter(e=>e.type==='keydown').map(e=>e.t))&&f.t<=Math.min(...heldEvents.filter(e=>e.type==='keyup').map(e=>e.t)));
 report.controlAttempts.delivered=heldEvents;report.controlAttempts.firstCommittedFrame=drive.find(f=>f.teaser.cliffCommitted)?.teaser;report.controlAttempts.heldFrames=heldFrames.length;
 check('ordinary reverse and brake attempts cannot arrest the committed opening plunge',start.pose.cliffCommitted&&start.pose.distance>=292&&start.timeSec<6.05&&end.pose.fallSeconds>=2.7&&end.pose.position.y< -30&&end.pose.position.z<start.pose.position.z-10&&heldEvents.filter(e=>e.type==='keydown').length===2&&heldEvents.filter(e=>e.type==='keyup').length===2&&heldFrames.some(f=>f.teaser.phase==='departure'&&f.teaser.speed>6.5)&&heldFrames.some(f=>f.teaser.phase==='fall'&&f.teaser.vehicleY< -25)&&drive.every(f=>f.teaser.controlOwner==='opening-cinematic'),report.controlAttempts);
 const approach=drive.filter(f=>f.teaser.phase==='approach'&&f.teaser.timeSec>4.5),departure=drive.filter(f=>f.teaser.phase==='departure'&&f.teaser.timeSec>6.25&&f.teaser.timeSec<6.9),average=(rows,key)=>rows.reduce((n,f)=>n+Number(f.teaser[key]||0),0)/Math.max(1,rows.length),engineAverage=(rows,key)=>rows.reduce((n,f)=>n+Number(f.teaser.engine?.[key]||0),0)/Math.max(1,rows.length);
 report.enginePull={approach:{samples:approach.length,load:average(approach,'engineLoad'),throttle:average(approach,'throttle'),speed:average(approach,'speed'),hz:engineAverage(approach,'hz'),gain:engineAverage(approach,'gain')},departure:{samples:departure.length,load:average(departure,'engineLoad'),throttle:average(departure,'throttle'),speed:average(departure,'speed'),hz:engineAverage(departure,'hz'),gain:engineAverage(departure,'gain')},qualification:'Actual controller load plus existing Web Audio engine diagnostics in the captured mix; isolated engine audibility and perceptual force still require listening approval.'};
 check('the visible cliff departure increases configured engine load, speed and actual engine excitation',approach.length>5&&departure.length>5&&report.enginePull.departure.load>report.enginePull.approach.load+.3&&report.enginePull.departure.throttle>report.enginePull.approach.throttle+.25&&report.enginePull.departure.speed>report.enginePull.approach.speed+1&&report.enginePull.departure.hz>report.enginePull.approach.hz+5&&report.enginePull.departure.gain>report.enginePull.approach.gain+.005,report.enginePull);
 check('the tutorial stays absent throughout the borrowed car and begins after the completed return',drive.every(f=>!f.tutorial.active)&&report.returned.tutorial.active&&report.returned.teaser.receipt?.returned,{during:drive.filter(f=>f.tutorial.active).length,returned:report.returned.tutorial,receipt:report.returned.teaser.receipt});
 const ready=film.firstReadiness;report.readiness=ready;
 check('actual loaded cabin, queue and skinned hands use the compiled final acquisition',requiredMeshes.every(n=>ready?.meshCatalog.includes(n))&&ready?.characters.packs.some(p=>/wheel-hands\.glb/.test(p.url))&&ready.shader.shaderReady&&!ready.shader.lastGlError&&!ready.shader.lastError,{required:requiredMeshes,catalog:ready?.meshCatalog.filter(n=>requiredMeshes.includes(n)),characters:ready?.characters,shader:ready?.shader});
 check('return restores the exact borrowed room view and closes one selected real door',report.returned.teaser.receipt.doorCloseCount===1&&report.returned.door.state==='closed'&&report.returned.door.openFraction===0&&report.returned.position.x===report.returned.teaser.receipt.origin.x&&report.returned.position.y===report.returned.teaser.receipt.origin.y&&Math.abs(report.returned.look.yaw-report.returned.teaser.receipt.origin.yaw)<1e-7&&Math.abs(report.returned.look.pitch-report.returned.teaser.receipt.origin.pitch)<1e-7,{door:report.returned.door,origin:report.returned.teaser.receipt.origin,position:report.returned.position,look:report.returned.look});
 check('the teaser neither changes Source driving progress nor creates physical or Source takes',frames.every(f=>f.sourceDriveUnchanged&&f.takeCount===report.before.takes.length)&&JSON.stringify(report.returned.sourceDrive)===JSON.stringify(report.before.sourceDrive)&&JSON.stringify(report.returned.takes)===JSON.stringify(report.before.takes),{before:report.before.sourceDrive,after:report.returned.sourceDrive,takesBefore:report.before.takes.length,takesAfter:report.returned.takes.length});
 const borrowed=frames.filter(f=>f.active&&f.teaser?.ready&&!f.teaser.restored),origin=report.returned.teaser.receipt.origin;
 check('autosave retains the room pose while the cinematic camera is outside the map',borrowed.every(f=>f.savedPose.x===origin.x&&f.savedPose.y===origin.y&&Math.abs((f.savedPose.pitch??0)-origin.pitch)<1e-7),{origin,savedSamples:borrowed.length});
 check('the intact movie decodes final canvas layers with actual stereo monitor audio',report.film.decoded&&report.film.mediaProbe.streams.some(s=>s.codec_type==='video'&&Number(s.nb_read_packets)>200)&&report.film.mediaProbe.streams.some(s=>s.codec_type==='audio'&&s.channels===2)&&report.film.maximumMonitorRms>1e-5&&report.film.streamTiming.every(s=>s.nonMonotonicDts===0),report.film);
 await screenshot('returned-room');

 // Separate behavioral fixture: a real repeated entry/title, then Escape only.
 await outsideFixture('separate-pause-and-interruption');await press('e');
 await page.waitForFunction(()=>{const q=__probe.getInDriveTeaser();return q.active&&q.view?.vehiclePose?.cliffCommitted&&q.view.timeSec>6.2;},{timeout:120000,polling:50});await press('Escape');await wait(250);
 const paused=await boundary();await wait(650);const still=await boundary();report.pause={before:paused.teaser.view,after:still.teaser.view,audioBefore:paused.teaser.audio,audioAfter:still.teaser.audio,scene:still.scene};
 const separateSamples=await page.evaluate(()=>window.__doorObservations.filter(s=>s.label==='separate-pause-and-interruption')),separateReady=separateSamples.find(s=>s.context.teaser?.ready),separateCommit=separateSamples.find(s=>s.context.teaser?.cliffCommitted),separateTitle=separateSamples.filter(s=>s.context.scene==='world-title');
 report.separateTiming={readyFirstPageMs:separateReady?.pageMs,commitFirstPageMs:separateCommit?.pageMs,readyToCommitWallMs:separateReady&&separateCommit?separateCommit.pageMs-separateReady.pageMs:null,titleFirst:separateTitle[0],titleLast:separateTitle.at(-1),qualification:'Separate uncaptured repeat approach; passive250ms timer observations, not frame-perfect timing or isolated performance. Scene clocks and camera are unchanged.'};
 check('Escape freezes the actual teaser clock, vehicle, water, blades and sound under the pause menu',paused.teaser.view?.paused&&paused.teaser.audio?.paused&&still.teaser.audio?.paused&&still.teaser.view.timeSec===paused.teaser.view.timeSec&&still.teaser.view.weatherRevision===paused.teaser.view.weatherRevision&&still.teaser.view.wiperPhase===paused.teaser.view.wiperPhase&&JSON.stringify(still.teaser.view.vehiclePose)===JSON.stringify(paused.teaser.view.vehiclePose),{scene:still.scene,paused:still.teaser.view.paused,audioPaused:still.teaser.audio?.paused,time:still.teaser.view.timeSec,weatherRevision:still.teaser.view.weatherRevision,wiperPhase:still.teaser.view.wiperPhase},false);
 await press('Escape');await page.waitForFunction(t=>__probe.getInDriveTeaser().view?.timeSec>t+.2,{timeout:15000},still.teaser.view.timeSec);
 const interrupted=await boundary();report.interrupted={position:interrupted.position,origin:interrupted.teaser.origin,saved:interrupted.saved,consumed:interrupted.teaser.consumed,pending:interrupted.teaser.pending,sourceDrive:interrupted.sourceDrive,takes:interrupted.takes};
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__probe?.sourceDrive?.resumeSaved&&window.__scenes?.top?.()?.id==='title',{timeout:120000});
 await page.evaluate(async()=>{await __probe.sourceDrive.resumeSaved();const p=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/game/save.js')?.name||'/src/game/save.js';window.__doorSave=await import(p);});await wait(800);report.reloaded=await boundary();
 report.reloadQualification='Actual cold page reload of an already-consumed active teaser after the natural startup calibration/credits reach title; existing saved-session diagnostic resumes normal enterStory and bypasses only menu selection. No fixture flags, position, look, Source state or tape is assigned after reload.';
 check('cold reload returns consumed vision to the saved room view and tutorial, with no car replay',!report.reloaded.teaser.active&&report.reloaded.teaser.consumed&&!report.reloaded.teaser.pending&&report.reloaded.position.x===interrupted.teaser.origin.x&&report.reloaded.position.y===interrupted.teaser.origin.y&&Math.abs(report.reloaded.look.yaw-interrupted.teaser.origin.yaw)<1e-7&&Math.abs(report.reloaded.look.pitch-interrupted.teaser.origin.pitch)<1e-7&&report.reloaded.tutorial.active&&report.reloaded.door.state==='closed',report.reloaded);
 check('cold interrupted reload preserves exact Source progress and all physical takes',JSON.stringify(report.reloaded.sourceDrive)===JSON.stringify(interrupted.sourceDrive)&&JSON.stringify(report.reloaded.takes)===JSON.stringify(interrupted.takes),{before:interrupted.sourceDrive,after:report.reloaded.sourceDrive,takeCount:report.reloaded.takes.length});
 await screenshot('cold-reloaded-room');
 const critical=['/src/main.js','/src/game/get-in-drive-teaser-scene.js','/src/game/source-drive/door-teaser.js','/src/game/source-drive/teaser-scene.js','/src/render/r3d.js','/src/render/props3d.js'];
 check('critical native paths were served from the exact frozen production sources',critical.every(p=>report.responses.some(r=>r.path===p&&r.fixed)),{critical,responseCount:report.responses.length});
 check('no final shader, GL, teaser, module or page faults occurred',report.errors.length===0&&report.assetFailures.length===0,{errors:report.errors,assetFailures:report.assetFailures});report.passed=report.checks.every(c=>c.pass);if(!report.passed)process.exitCode=1;
}catch(error){report.passed=false;report.failure=String(error.stack||error);process.exitCode=1;console.log('FAILED',report.failure);if(filmStarted)try{await finishFilm();}catch(e){report.captureFailure=String(e);}if(page)try{report.failureState=await boundary();await screenshot('failure');}catch{}}
finally{
 try{if(page)try{report.observations=await page.evaluate(()=>({samples:window.__doorObservations||[],lifecycle:window.__doorLifecycle||[],qualification:'Read-only top-scene/view/presentation, native and harness-reported focus, visibility, actual shader frame count and main motion status; no update wrapper or scene-clock assignment.'}));}catch(e){report.observationFailure=String(e);}
  report.sourceAfter=await identity();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(!report.sourceStable){report.passed=false;process.exitCode=1;report.errors.push('The inspected frozen source tree changed.');}
  report.outputBytesBeforeManifest=(await Promise.all((await filesBelow(run)).map(async p=>(await stat(p)).size))).reduce((a,b)=>a+b,0);report.outputBudgetBytes=budgetMiB*1024*1024;
  report.outputBytes=report.outputBytesBeforeManifest+Buffer.byteLength(JSON.stringify(report,null,2))+1024;
  if(report.outputBytes>report.outputBudgetBytes){report.passed=false;process.exitCode=1;report.errors.push('The declared output budget was exceeded.');}
  await writeFile(join(run,'report.json'),JSON.stringify(report,null,2));if(report.passed)await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log('COMPLETE',JSON.stringify({passed:report.passed,sourceStable:report.sourceStable,checks:report.checks.length,outputBytes:report.outputBytes,run,latestAcceptedUpdated:report.passed}));
 }finally{try{await browser?.close();}finally{await rm(profile,{recursive:true,force:true});}}
}
process.exit(process.exitCode||0);
