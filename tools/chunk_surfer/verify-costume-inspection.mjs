// Disposable local review. Fixtures establish a reachable chair approach;
// ordinary E, keyboard movement/look, Escape and the application pause command
// exercise the real scene. No phase or completion progress is injected.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {suppressClientHmr} from './source-experience-study/prototype-session-contract.mjs';

const base=process.env.COSTUME_REVIEW_URL||'http://127.0.0.1:5452';
const out=resolve(process.env.COSTUME_REVIEW_OUT||'artifacts/costume-inspection-review');
const visualOnly=process.env.COSTUME_REVIEW_VISUAL_ONLY==='1',recordVideo=process.env.COSTUME_REVIEW_RECORD==='1';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const report={startedAt:new Date().toISOString(),base,method:'Fresh isolated Chrome saves. Reachable store fixture only; real E starts the insert. Real-time scene clock, normal keyboard/look, application pause, Escape and reload/Continue verify lifecycle. Captures come from the actual shared props/scene/VFD targets. Browser proof; native calibration and human scare acceptance remain separate.',checks:[],inputs:[],fixtures:[],captures:[],cases:[],errors:[],failedResources:[],assets:[]};
let browser,page,context,recording;const responseTasks=[];
const sourceHashes=()=>Promise.all(['src/main.js','src/game/costume-inspection-scene.js','src/game/conservatory-adversaries.js','src/render/conservatory-adversary-performance.js','src/data/conservatory-props.js'].map(async file=>{const bytes=await readFile(resolve(file));return{file,sha256:createHash('sha256').update(bytes).digest('hex')};}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(pass,name,detail=null){report.checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name);assert.ok(pass,name+(detail?' '+JSON.stringify(detail):''));}
async function key(key){report.inputs.push({key,at:Date.now()});await page.keyboard.press(key);await sleep(80);}
async function state(){return page.evaluate(()=>{
  const p=window.__probe,raw=p.costumeInspection(),top=window.__scenes.top({includeOverlay:true});
  const adversaries=p.conservatoryAdversaries(),actor=raw.actor||raw.costume||adversaries.state.costume;
  return{...raw,actor,view:raw.view||(top?.id==='costume-inspection'?top.view?.():null),active:raw.active??top?.id==='costume-inspection',scene:top?.id,position:p.pos(),look:p.lookAngles(),camera:window.__costumeModules.r3.r3dViewCamera?.(),focus:p.pickProp()?.id,complete:!!p.flag('adversary.costume.exchange.complete'),held:adversaries.state.held,watcher:p.basementWatcher(),motion:window.__chunkSurferMotion?.status?.(),pointer:window.__chunkSurferPointer?.status?.(),lens:window.__chunkSurferPixelMesh?.lookStatus?.()};
});}
async function until(predicate,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const s=await state();if(predicate(s))return s;await sleep(40);}throw Error(label+' timed out: '+JSON.stringify(await state()));}
async function snapshot(name){const file=resolve(out,name+'.png');await page.screenshot({path:file});report.captures.push({name,file,state:await state()});}
async function fresh(label){
  if(context)await context.close();context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.evaluateOnNewDocument(suppressClientHmr);
  page.on('pageerror',e=>report.errors.push({case:label,error:String(e)}));page.on('response',r=>{
    if(r.status()>=400)report.failedResources.push({case:label,url:r.url(),status:r.status()});
    if(/costume-exchange\.glb|conservatory-adversary-scenery\.glb/.test(r.url())){const entry={case:label,url:r.url(),status:r.status()};report.assets.push(entry);responseTasks.push(r.buffer().then(bytes=>{entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');}).catch(error=>{entry.hashError=String(error);}));}
  });
  const url=new URL(base);for(const[k,v]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0'}))url.searchParams.set(k,v);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__probe?.costumeInspectionStand&&window.__scenes?.top()?.id,{timeout:90000});
  await page.evaluate(async()=>{
    const p=window.__probe;await p.testRun();p.tutSkip();p.setFlags(['prologueDone','van.closed','opening.vehicle.exited','kit.fitted','bag.taken','setup.levels','combat.trained','setup.waypoint','setup.case.arrived'],['opening.vehicle.pending']);p.clearDiagnosticScenes?.();p.frontEndGrade?.(false);p.hush?.();
    const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;
    window.__costumeModules={r3:await import(resource('/src/render/r3d.js')),save:await import(resource('/src/game/save.js'))};
    p.costumeInspectionStand({reset:true});p.setTorchBattery(1);p.setTorch(true);
  });
  await page.bringToFront();await sleep(1700);report.fixtures.push({case:label,kind:'fresh disposable opening/setup and reachable store staging',state:await state()});
  await until(s=>s.actor.phase==='work'&&!s.active&&s.assets?.ready,'idle work placement and loaded costume asset',90000);
  await page.mouse.click(640,400);await until(s=>s.pointer?.locked||s.pointer?.nativeCaptured,'ordinary world click captures pointer',8000);
}
async function realStart(){
  const before=await state();check(before.focus==='store-empty-chair','chair is the actual focused inspection target',before.focus);
  await key('e');const start=await until(s=>s.active&&s.scene==='costume-inspection','real E scene entry');
  check(start.actor.phase==='inspect','E starts inspection before the snap',start.actor.phase);return start;
}
async function ordinaryRelease(label){
  const before=await until(s=>!s.active,'scene release');check(!before.motion?.blocksInput&&!before.motion?.blocksWorld,label+' clears body/world locks');
  await page.keyboard.down('s');await sleep(280);await page.keyboard.up('s');await sleep(100);const moved=await state();
  check(Math.hypot(moved.position.x-before.position.x,moved.position.y-before.position.y)>.05,label+' accepts ordinary movement after release',{before:before.position,after:moved.position});
  check(moved.pointer?.locked||moved.pointer?.nativeCaptured,label+' retains the existing pointer lease without a completion click');
  await page.mouse.move(700,420);await sleep(100);const mouseLook=await state();
  check(Math.abs(Math.atan2(Math.sin(mouseLook.look.yaw-moved.look.yaw),Math.cos(mouseLook.look.yaw-moved.look.yaw)))>.02,label+' accepts actual mouse look after release');
  return mouseLook;
}
async function installStageRecorder(){await page.evaluate(()=>{
  window.__costumeReview={timeline:[],frames:[],seen:new Set(),running:true};
  const tick=()=>{
    const r=window.__costumeReview;if(!r.running)return;
    const raw=window.__probe.costumeInspection(),v=raw.view||{},actor=raw.actor||raw.costume||window.__probe.conservatoryAdversaries().state.costume;
    const phase=v.phase||actor.phase,elapsed=v.elapsed??actor.elapsed??0;
    r.timeline.push({at:performance.now(),phase,elapsed,age:v.age,active:raw.active,scene:window.__scenes.top()?.id,position:window.__probe.pos(),look:window.__probe.lookAngles()});
    const name=phase==='inspect'&&elapsed>.35?'inspect':phase==='notice'&&elapsed>.48?'notice':phase==='startle'&&elapsed>.06?'startle':phase==='exchange'&&elapsed>1.1?'crown':phase==='threshold'&&elapsed>.95?'cover-settled':phase==='threshold'&&elapsed>.3?'cover-flight':phase==='done'&&raw.active&&v.recoveryElapsed>.4?'aftermath':null;
    if(name&&!r.seen.has(name)){r.seen.add(name);r.frames.push({name,phase,elapsed,age:v.age,recoveryElapsed:v.recoveryElapsed,at:performance.now(),images:Object.fromEntries(['props','scene','vfd'].map(stage=>[stage,window.__costumeModules.r3.r3dCaptureStageCanvas(stage)?.toDataURL('image/png')]))});}
    requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
});}
async function collectStages(){
  const recorded=await page.evaluate(()=>{window.__costumeReview.running=false;return{timeline:window.__costumeReview.timeline,frames:window.__costumeReview.frames};});
  for(const frame of recorded.frames){const files={};for(const[stage,data]of Object.entries(frame.images)){assert.ok(data?.startsWith('data:image/png;base64,'),'actual '+stage+' stage is available');const file=resolve(out,'full-'+frame.name+'-'+stage+'.png');await writeFile(file,Buffer.from(data.split(',')[1],'base64'));files[stage]=file;}delete frame.images;report.captures.push({...frame,files});}
  report.timeline=recorded.timeline;check(['inspect','notice','startle','crown','cover-flight','cover-settled','aftermath'].every(name=>recorded.frames.some(f=>f.name===name)),'all seven live choreography stages captured',recorded.frames.map(f=>f.name));
}
async function stopRecording(){
  if(!recording)return;await recording.stop();recording=null;report.video.stoppedAt=new Date().toISOString();
  const bytes=await readFile(report.video.file);report.video.bytes=bytes.length;report.video.sha256=createHash('sha256').update(bytes).digest('hex');
}
async function reloadAndContinue(label){
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__probe?.costumeInspection&&window.__scenes?.top()?.id,{timeout:90000});
  await page.evaluate(async()=>{const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;window.__costumeModules={r3:await import(resource('/src/render/r3d.js')),save:await import(resource('/src/game/save.js'))};window.__chunkSurferDesktopMenu.dispatch('continue');});
  await until(s=>s.scene!=='title'&&s.actor.phase==='done'&&!s.active,label+' reload/Continue completion',90000);
  await page.evaluate(()=>window.__probe.costumeInspectionStand({reset:false}));await sleep(1200);await key('e');await sleep(500);
  const after=await state();check(after.complete&&!after.active&&after.actor.phase==='done',label+' completion persists and chair cannot replay the scare');report.cases.push({label,state:after});
}

try{
  await mkdir(out,{recursive:true});report.source=await sourceHashes();
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  await fresh('full');const idle=await state();await sleep(3200);const waited=await state();check(!waited.active&&waited.actor.phase==='work'&&!waited.complete,'entering and waiting cannot spring the scare');await snapshot('full-approach');await installStageRecorder();
  if(recordVideo){report.video={file:resolve(out,'full-live-shader.webm'),startedAt:new Date().toISOString(),method:'Uncut silent Puppeteer browser screencast of actual final game shader, started before real E; no phase injection or reconstructed frames.'};recording=await page.screencast({path:report.video.file,fps:30,ffmpegPath:'/opt/homebrew/bin/ffmpeg'});}
  const start=await realStart();await page.keyboard.down('w');await sleep(100);await page.keyboard.up('w');await page.keyboard.down('ArrowRight');await sleep(100);await page.keyboard.up('ArrowRight');await page.mouse.move(680,410);const held=await state();check(held.position.x===start.position.x&&held.position.y===start.position.y,'inspection holds movement during the insert');check(held.pointer?.locked||held.pointer?.nativeCaptured,'authored camera hold preserves the existing mouse capture');
  if(!visualOnly){await page.evaluate(()=>window.__chunkSurferDesktopMenu.dispatch('pause'));await until(s=>s.scene==='pause','application pause');const paused=await state();await sleep(650);const still=await state();check(Math.abs((still.view?.age||0)-(paused.view?.age||0))<.015,'pause freezes the sole inspection clock');await key('Escape');await page.mouse.click(640,400);await until(s=>s.pointer?.locked||s.pointer?.nativeCaptured,'ordinary resume click restores pause-menu pointer capture');}
  await until(s=>!s.active&&s.complete,'full timed recovery',30000);await collectStages();await stopRecording();const released=await ordinaryRelease('timed recovery');
  check(JSON.stringify(idle.held)===JSON.stringify(released.held),'the third-floor Held Note state is unchanged');check(idle.watcher.roomId===released.watcher.roomId&&idle.watcher.resolved===released.watcher.resolved,'the basement watcher assignment and resolution remain unchanged');
  await snapshot('full-released');if(!visualOnly){await reloadAndContinue('timed');
  await fresh('escape-before-snap');await realStart();await key('Escape');let escaped=await until(s=>!s.active,'early escape');check(!escaped.complete&&escaped.actor.phase==='work','Escape before snap returns to the harmless working pose');await ordinaryRelease('early Escape');
  await fresh('escape-after-snap');await realStart();await until(s=>s.view?.committed||s.actor.committed,'snap commit');await key('Escape');escaped=await until(s=>!s.active,'committed escape');check(escaped.complete&&escaped.actor.phase==='done','Escape after snap consumes the scare exactly once');await ordinaryRelease('committed Escape');await reloadAndContinue('committed Escape');
  await fresh('reload-after-snap');await realStart();await until(s=>s.view?.committed||s.actor.committed,'snap receipt before reload');await reloadAndContinue('mid-scare reload');
  }
  check(report.errors.length===0,'no JavaScript errors during all lifecycle cases',report.errors);report.finishedAt=new Date().toISOString();
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;if(page)await snapshot('failure').catch(()=>{});}
finally{await stopRecording().catch(error=>{report.recordingError=String(error);});await Promise.allSettled(responseTasks);if(browser)await browser.close();report.browserClosed=true;report.sourceAtCompletion=await sourceHashes();await mkdir(out,{recursive:true});await writeFile(resolve(out,'live-report.json'),JSON.stringify(report,null,2));}
