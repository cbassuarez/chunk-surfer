// Integrated current-game review. Initial placements are disclosed fixtures;
// route edges thereafter use ordinary keyboard movement and real collision.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import * as FP from '../../src/world/floorplan.js';
import * as P from '../../src/game/props.js';
import {conservatory} from '../../src/data/floorplan/conservatory.js';
import {isOutdoorZone} from '../../src/data/floorplan/legend.js';
import {actualBodyRoute,bodyAtWorld} from '../../test/helpers/ellery-garden-body-route.mjs';
const supplement=process.env.ELLERY_QA_SUPPLEMENT==='1',driveOnly=process.env.ELLERY_QA_DRIVE_ONLY==='1';
const out=resolve('artifacts/ellery-construction-source-drive-audit/implementation/'+(driveOnly?'native-drive-final':supplement?'native-final':'native')),port=5584;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(out,{recursive:true});
FP.compile(conservatory.levels,conservatory);P.propsInit(FP);FP.setAllDoorsOpen(false);P.setColliderGroupEnabled('glass-court',true);
const report={method:'Current production main, geometry, WebGL, camera and final dither in isolated Chrome/Metal. Each section begins at a disclosed developer fixture. Public garden paths then use actual keyboard input with live body position checks; no trigger teleport substitutes for those steps. Focus is instrumented true for automation. No microphone, existing user profile or human acceptance. Static captures are actual final world and composite; no claim of a fluid film from canvas MediaRecorder.',checks:[],captures:[],steps:[],errors:[],consoleErrors:[],sources:{},performance:[]};
for(const f of ['src/main.js','src/render/r3d.js','src/render/props3d.js','src/game/source-drive-renderer.js','src/world/building-window-views.js','src/data/floorplan/conservatory.js','public/assets/box-office.glb','public/assets/ellery-garden-approaches.glb','public/assets/glass-court.glb'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
let browser,server,profile,page,stage='boot';
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name);if(!pass)throw Error(name+': '+JSON.stringify(detail));};
async function state(){return page.evaluate(()=>({pos:window.__probe.pos(),floor:window.__probe.floorH(),look:window.__probe.lookAngles(),scene:window.__scenes.top()?.id,storm:window.__probe.storm(),camera:window.__probe.exteriorInspection().camera}));}
async function aim(yaw,pitch=0){await page.evaluate((y,p)=>window.__probe.lookAtWorld(y,p),yaw,pitch);await sleep(180);}
async function capture(name){
 const raw=await page.evaluate(()=>{const c=document.querySelector('canvas.r3d');if(!c)throw Error('No world canvas');return{data:c.toDataURL('image/png'),width:c.width,height:c.height};});
 const filename=name+'.png';await writeFile(join(out,filename),Buffer.from(raw.data.slice(raw.data.indexOf(',')+1),'base64'));
 await page.screenshot({path:join(out,name+'-composite.png')});
 const value={name,file:filename,width:raw.width,height:raw.height,state:await state()};report.captures.push(value);console.log('CAPTURE',name);return value;
}
async function fixture(x,z,yaw,pitch=0,{doors=[]}={}){
 const at=bodyAtWorld(FP,x,z);if(!at)throw Error('No standing fixture');
 await page.evaluate(async(at,doors)=>{window.__scenes.clear();const f=await import('/src/world/floorplan.js');f.setAllDoorsOpen(false);for(const id of doors)f.setDoorOpen(id,true);window.__probe.warpRuntime(at.x,at.y,0);window.__probe.setTorch(true);window.__probe.setTorchBattery(1);},at,doors);
 await aim(yaw,pitch);await sleep(350);return at;
}
async function walk(path,label){
 stage=label;let stalls=0;
 for(let i=0;i<path.length;){const edge=path[i],s=await state();if(s.pos.x!==edge.from.x||s.pos.y!==edge.from.y)throw Error(label+' position diverged '+JSON.stringify({at:s.pos,edge}));
  const dx=edge.requested.x-edge.from.x,dy=edge.requested.y-edge.from.y;await aim(Math.atan2(dx,-dy),-.04);
  await page.keyboard.press('w');await sleep(45);const after=await state();
  if(after.pos.x===s.pos.x&&after.pos.y===s.pos.y){if(++stalls>8)throw Error(label+' blocked '+JSON.stringify({at:s.pos,edge,scene:after.scene}));continue;}
  stalls=0;report.steps.push({label,from:s.pos,to:after.pos,expected:edge.to});check(label+' edge '+i,after.pos.x===edge.to.x&&after.pos.y===edge.to.y,{actual:after.pos,expected:edge.to});i++;
 }
}
async function perf(label,ms=3000){
 const result=await page.evaluate(async ms=>{const R=await import('/src/render/r3d.js'),t=performance.now(),a=R.r3dPixelMeshStatus().framesRendered;await new Promise(r=>setTimeout(r,ms));return{seconds:(performance.now()-t)/1000,presents:R.r3dPixelMeshStatus().framesRendered-a,status:R.r3dPixelMeshStatus()};},ms);
 report.performance.push({label,...result,fps:result.presents/result.seconds,instrumentation:'No recording/readback during this interval; isolated browser focus is instrumented. This is a stationary local sample, not minimum hardware qualification.'});console.log('PERF',label,(result.presents/result.seconds).toFixed(1));
}
try{
 server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
 profile=await mkdtemp(join(tmpdir(),'ellery-construction-qa-'));
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,userDataDir:profile,pipe:true,defaultViewport:null,protocolTimeout:180000,args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1280,840']});
 page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);
 page.on('pageerror',e=>report.errors.push({stage,error:String(e.stack||e)}));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({stage,text:m.text().slice(0,1600)});});
 await page.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__elleryAudioTaps=new Map();const original=AudioNode.prototype.connect,seen=new WeakSet();
  AudioNode.prototype.connect=function(destination,...args){if(destination===this.context.destination&&!seen.has(this)){seen.add(this);let tap=window.__elleryAudioTaps.get(this.context);if(!tap){tap=this.context.createMediaStreamDestination();window.__elleryAudioTaps.set(this.context,tap);}original.call(this,tap);}return original.call(this,destination,...args);};});
 await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__probe?.testRun,{timeout:180000});
 await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','kit.fitted','title.shown','prologueDone','opening.driveTeaser.consumed']);await window.__probe.exteriorAssetsReady();});
 await page.mouse.click(640,400);await sleep(700);
 check('all private actual construction meshes loaded',await page.evaluate(()=>{const names=new Set(window.__probe.exteriorInspection().catalog.map(m=>typeof m==='string'?m:m.name));return['box_office_clerking_hatch','box_office_clerks_desk','ellery_garden_elevation','ellery_garden_dock','ellery_garden_getin_sightline','ellery_garden_hall','ellery_garden_steps'].every(n=>names.has(n));}));
 if(!driveOnly){if(!supplement){for(const side of ['west','east']){
  FP.setAllDoorsOpen(false);const x=side==='west'?72.25:99.25,z=21.25,start=bodyAtWorld(FP,x,-.25),goal=bodyAtWorld(FP,side==='west'?80.25:93.25,z);
  const route=actualBodyRoute(FP,P,start,goal,{accept:p=>isOutdoorZone(FP.zoneAt(p.x,p.y))});check(side+' compiled ordinary route exists',!!route.path);
  await fixture(x,-.25,Math.PI);await capture(side+'-approach');await walk(route.path,side+'-garden');await aim(side==='west'?Math.PI/2:-Math.PI/2,.04);await capture(side+'-glass-reciprocal');
  if(side==='west')await perf('public west garden');
  const back=actualBodyRoute(FP,P,goal,start,{accept:p=>isOutdoorZone(FP.zoneAt(p.x,p.y))});await walk(back.path,side+'-return');
 }
 stage='box office';await fixture(89.75,10.25,Math.PI/2,-.06);await capture('box-office-public-hatch');
 await fixture(93.25,10.75,-.10,-.4,{doors:['foh-office']});await capture('box-office-desk');
 stage='greenhouse';await fixture(84.25,21.25,-Math.PI/2,.08,{doors:['pool-lobby','glasshouse-changing','changing-pool']});await capture('greenhouse-west-outlook');await aim(Math.PI/2,.08);await capture('greenhouse-east-outlook');
 stage='pool roof';await fixture(84.25,30.25,Math.PI,.35,{doors:['pool-lobby','glasshouse-changing','changing-pool']});await capture('pool-entrance-section');await fixture(84.25,38.25,Math.PI,.75);await capture('pool-real-roof-openings');
 stage='hall service';await fixture(102.25,11.25,0,-.15,{doors:['hall-stage-service']});await capture('hall-L-landing');
 stage='storm';await fixture(80.25,21.25,Math.PI/2,.05);await page.evaluate(()=>window.__probe.strike(400));await sleep(70);await capture('garden-storm-directed');await sleep(1500);report.storm=await state();
 }else{
 stage='ordinary D0 crossing';
 const start=await fixture(84.25,13.25,Math.PI,0,{doors:['pool-lobby']});
 const before=await page.evaluate(()=>window.__probe.exteriorInspection().submittedIds);
 const goal=bodyAtWorld(FP,84.25,17.25);FP.setDoorOpen('pool-lobby',true);
 const path=actualBodyRoute(FP,P,start,goal).path;check('D0 crossing has actual body route',!!path);await walk(path,'ordinary-D0-crossing');
 await aim(-Math.PI/2,.05);await capture('earned-greenhouse-west');await aim(Math.PI/2,.05);await capture('earned-greenhouse-east');
 const after=await page.evaluate(()=>window.__probe.exteriorInspection().submittedIds);report.apertureSubmission={before,after};
 check('ordinary D0 crossing rebuilds side portal props',after.some(id=>id.includes(':GH-west'))&&after.some(id=>id.includes(':GH-east'))&&!before.some(id=>id.includes(':GH-west')));
 await perf('greenhouse after ordinary D0 crossing');
 stage='Haystack authored paper';await page.evaluate(()=>window.__probe.sourcePreset('haystack'));
 await page.waitForFunction(()=>document.querySelector('.window-takeover'),{timeout:30000});await sleep(550);await capture('haystack-authored-paper');
 report.paper=await page.evaluate(()=>({state:window.__probe.chunkSurf(),hostCount:document.querySelectorAll('.window-takeover').length}));
 check('one actual in-game paper host',report.paper.hostCount===1);
 await page.keyboard.down('Escape');await sleep(1500);await page.keyboard.up('Escape');await page.waitForFunction(()=>!document.querySelector('.window-takeover'),{timeout:3000});
 report.paperAfter=await page.evaluate(()=>({state:window.__probe.chunkSurf(),hosts:document.querySelectorAll('.window-takeover').length,scene:window.__scenes.top()?.id}));
 check('holding Back exits the actual paper host',report.paperAfter.hosts===0);
 await sleep(150);
 }
 }
 stage='get-in memory';await page.evaluate(()=>window.__probe.beginGetInDriveTeaser());await page.waitForFunction(()=>window.__probe.getInDriveTeaser().view?.ready,{timeout:120000});
 report.firstReadyDrive=await page.evaluate(()=>window.__probe.getInDriveTeaser());
 check('first accepted get-in view is already driving',Math.abs(report.firstReadyDrive.view?.driveState?.speed||0)>0,{speed:report.firstReadyDrive.view?.driveState?.speed,time:report.firstReadyDrive.view?.timeSec});
 await page.evaluate(()=>{const canvas=document.querySelector('canvas.r3d'),stream=canvas.captureStream(20),tap=[...window.__elleryAudioTaps.values()][0];if(tap)for(const track of tap.stream.getAudioTracks())stream.addTrack(track);const chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:2000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);window.__elleryFilm={recorder,chunks,stream};});
 await capture('get-in-moving-road');await page.keyboard.down('w');await sleep(4200);await page.keyboard.up('w');await capture('get-in-storm-front');if(driveOnly)await sleep(16000);report.drive=await page.evaluate(()=>window.__probe.getInDriveTeaser());
 const film=await page.evaluate(()=>new Promise(resolve=>{const f=window.__elleryFilm;f.recorder.onstop=async()=>{const blob=new Blob(f.chunks,{type:f.recorder.mimeType}),reader=new FileReader();reader.onload=()=>resolve({data:reader.result,bytes:blob.size,mimeType:blob.type});reader.readAsDataURL(blob);f.stream.getTracks().forEach(t=>t.stop());};f.recorder.stop();}));
 const marker=film.data.indexOf(';base64,');if(marker<0)throw Error('No explicit media base64 marker');const filmBytes=Buffer.from(film.data.slice(marker+8),'base64');
 check('binary-safe capture export',filmBytes.length===film.bytes&&filmBytes.subarray(0,4).toString('hex')==='1a45dfa3',{originalBytes:film.bytes,exportedBytes:filmBytes.length,mimeType:film.mimeType});
 await writeFile(join(out,'get-in-actual-world-audio.webm'),filmBytes);
 report.film={file:'get-in-actual-world-audio.webm',qualification:'Actual canvas and tapped game output. Capture cadence is not a presentation performance measurement or certified smooth film.'};
 check('no runtime JavaScript errors',report.errors.length===0,report.errors);
 check('final dither remains operational',await page.evaluate(async()=>{const R=await import('/src/render/r3d.js');const s=R.r3dPixelMeshStatus();return s.shaderReady&&s.framesRendered>30&&!s.lastError;}));
}catch(error){report.failure={stage,error:String(error.stack||error)};try{report.failedState=await state();}catch{}console.error('FAIL',stage,String(error));process.exitCode=1;try{await page?.screenshot({path:join(out,'failure.png')});}catch{}}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser?.close().catch(()=>{});await server?.close();if(profile)await rm(profile,{recursive:true,force:true});console.log('DONE',out);}
