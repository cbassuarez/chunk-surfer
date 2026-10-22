// One disposable browser owns a matched comparison of ordinary pub practicals.
// Placement/look fixtures are explicit; torch remains off and exposure is never
// overridden. Real E/dialogue/service inputs exercise the final integration.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {suppressClientHmr} from './source-experience-study/prototype-session-contract.mjs';

const base=process.env.PUB_HOSPITALITY_REVIEW_URL||'http://127.0.0.1:5453';
const phase=process.env.PUB_HOSPITALITY_REVIEW_PHASE||'baseline';
const mode=process.env.PUB_HOSPITALITY_REVIEW_MODE||'all';
const out=resolve(process.env.PUB_HOSPITALITY_REVIEW_OUT||`artifacts/pub-hospitality-review/${phase}`);
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.ok(['baseline','final'].includes(phase));
assert.ok(['all','fallback','hearth','fallback-hearth'].includes(mode));
const cameras=[
  {id:'01-street-windows',world:{x:-6,z:99.25},yaw:Math.PI,pitch:-.06},
  {id:'02-snug-stove-tables',world:{x:-9.7,z:108.3},yaw:-2.4191741526252897,pitch:-.06},
  {id:'03-iona-bar',world:{x:-2.8,z:108.3},yaw:3.112947196160214,pitch:-.06},
];
const report={phase,mode,base,startedAt:new Date().toISOString(),method:'Disposable fresh browser save. Three fixed reachable physical camera/look fixtures, original game exposure and final shader, torch off. Source round zero uses the existing declared last-light/favor entrance fixture and actual E. Final ordinary service uses actual E and chosen dialogue. Browser rendering/input evidence; native calibration, sound listening and human warmth acceptance are separate.',cameras,checks:[],fixtures:[],inputs:[],captures:[],errors:[],failedResources:[],assets:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sourceFiles=['src/main.js','src/render/r3d.js','src/data/conservatory-lights.js','src/data/exterior-pub-furnishings.js','src/data/pub-hospitality.js','src/audio/pub-room.js','src/data/pub-population.js','src/render/source-pub-renderer.js'];
const sourceHashes=()=>Promise.all(sourceFiles.map(async file=>({file,sha256:createHash('sha256').update(await readFile(resolve(file))).digest('hex')})));
let browser,page;const responseTasks=[];
function check(pass,name,detail=null){report.checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name);assert.ok(pass,name+(detail?' '+JSON.stringify(detail):''));}
async function key(key,wait=250){report.inputs.push({key,at:Date.now()});await page.keyboard.press(key);await sleep(wait);}
async function state(){return page.evaluate(()=>{
  const p=window.__probe,m=window.__pubHospitalityModules,top=window.__scenes.top({includeOverlay:true}),view=top?.view?.(),c=m.p3.characterStats(),pub=p.pub(),props=p.props();
  return{scene:top?.id,position:p.pos(),physical:pub.listener,look:p.lookAngles(),camera:m.r3.r3dViewCamera(),torch:p.torch(),pub,hospitality:p.pubHospitality?.()||null,
    source:p.sourcePub.state(),sourceFrame:(()=>{const s=p.sourcePub.state();if(!s.active||!m.sourceRender)return null;const f=m.sourceRender.sourcePubRenderFrame(s);return{copies:f.copies,stretch:f.stretch,props:f.props.map(a=>({id:a.id,mesh:a.mesh,pubActorId:a.pubActorId})),lights:f.lights};})(),
    props:{instances:props.instances?.filter(a=>/pub|vigil-(denise|malcolm)/.test(a.id)),renderedIds:props.renderedIds?.filter(a=>/pub|vigil-(denise|malcolm)/.test(a))},
    characters:{loaded:c.loaded,error:c.error,frame:c.frame,poseErrors:c.poseErrors,packs:c.packs?.filter(a=>/pub-|vigil-characters-(owen|malcolm)/.test(a.url)),poses:c.poses?.filter(a=>/^(pub-|vigil-(denise|malcolm)|source-pub-)/.test(a.id||''))},
    doors:p.doors().filter(d=>d.id.startsWith('pub-')),
    dialogue:view?.line||view?.pending?{nodeId:view.nodeId,text:view.line?.text,typing:view.typing,pending:view.pending?{index:view.pending.index,options:view.pending.options.map(o=>({id:o.id,sourceId:o.sourceId,contentId:o.contentId,text:o.text,goto:o.goto,pubQuestAction:o.pubQuestAction}))}:null}:null,
    lens:window.__chunkSurferPixelMesh?.lookStatus?.(),motion:window.__chunkSurferMotion?.status?.()};
});}
async function until(predicate,label,timeout=20000){const began=Date.now();while(Date.now()-began<timeout){const s=await state();if(predicate(s))return s;await sleep(50);}throw Error(label+' timed out '+JSON.stringify(await state()));}
async function place(camera){
  const result=await page.evaluate(({world,yaw,pitch})=>{
    const p=window.__probe,m=window.__pubHospitalityModules,logical=m.district.districtLogicalAt(world.x,world.z),runtime={x:logical.x*2,y:logical.y*2};
    if(m.fp.isSolid(runtime.x,runtime.y)||!m.props.propCanOccupy(runtime.x,runtime.y))throw Error('Comparison camera is obstructed '+JSON.stringify(runtime));
    p.warpRuntime(runtime.x,runtime.y);p.lookAtWorld(yaw,pitch);p.setTorch(false);p.hush?.();return{world,runtime,yaw,pitch};
  },camera);report.fixtures.push({kind:'physical comparison camera',id:camera.id,...result});await sleep(1800);
  check(!(await state()).torch?.on,camera.id+' uses ordinary practicals with torch off');
}
async function capture(name){
  const snapshot=await state(),file=resolve(out,name+'.png');await page.screenshot({path:file});const stages={};
  for(const stage of['props','scene','vfd']){
    const data=await page.evaluate(stage=>window.__probe.sourceShoreCapture?.(stage)||window.__pubHospitalityModules.r3.r3dCaptureStageCanvas(stage)?.toDataURL('image/png'),stage);
    assert.ok(data?.startsWith('data:image/png;base64,'),'actual '+stage+' is available');const path=resolve(out,name+'-'+stage+'.png');await writeFile(path,Buffer.from(data.split(',')[1],'base64'));stages[stage]=path;
  }
  report.captures.push({name,file,stages,state:snapshot});console.log('CAPTURE',name);return snapshot;
}
async function aimWorld(x,z,pitch=-.04){const s=await state();await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw:Math.atan2(x-s.physical.x,-(z-s.physical.z)),pitch});await sleep(100);}
const rowWorld=(x,z)=>({x:18+z,z:107.05-x});
async function walkWorld(target,{tolerance=.45,maxSteps=180}={}){
  let old=(await state()).physical,stalls=0;
  for(let n=0;n<maxSteps;n++){
    const s=await state(),distance=Math.hypot(s.physical.x-target.x,s.physical.z-target.z);if(distance<tolerance)return;
    const ms=distance<1.7?20:110;
    assert.ok(!s.dialogue,'close dialogue before walking');await aimWorld(target.x,target.z);await page.keyboard.down('w');await sleep(ms);await page.keyboard.up('w');await sleep(90);
    const now=(await state()).physical;report.inputs.push({key:'W',ms,from:s.physical,to:now});stalls=Math.hypot(now.x-old.x,now.z-old.z)<.008?stalls+1:0;old=now;if(stalls>8)throw Error('Ordinary pub route stalled '+JSON.stringify({target,at:now}));
  }throw Error('Ordinary pub route timed out');
}
async function walkRow(x,z){return walkWorld(rowWorld(x,z));}
async function aimRow(x,z,pitch=-.04){const p=rowWorld(x,z);return aimWorld(p.x,p.z,pitch);}
async function choices(){for(let n=0;n<60;n++){const s=await state();if(s.dialogue?.pending)return s.dialogue.pending;assert.ok(s.dialogue,'expected dialogue');await key('Space');}throw Error('dialogue choices timeout');}
async function choose(id){const p=await choices(),index=p.options.findIndex(o=>[o.id,o.sourceId,o.contentId].includes(id));assert.ok(index>=0,'offered dialogue '+id);for(let n=0;n<(index-p.index+p.options.length)%p.options.length;n++)await key('ArrowDown');await key('Enter');}
async function closeDialogue(){for(let n=0;n<80;n++){const s=await state();if(!s.dialogue)return;if(s.dialogue.pending){const p=s.dialogue.pending,leave=p.options.find(o=>/leave|thanks-leave|service-leave/.test(o.id||o.sourceId||'')&&!o.pubQuestAction);if(leave)await choose(leave.id||leave.sourceId);else if(p.options.length===1)await key('Enter');else throw Error('No passive dialogue exit '+JSON.stringify(p));}else await key('Space');}throw Error('dialogue failed to close');}
async function service(){
  await aimRow(-4.74,-20.70);await sleep(1500);check((await state()).pub.focused==='pub-bartender-iona','actual Iona focus survives warm dressing');await key('e');check(!!(await state()).dialogue,'ordinary E addresses Iona');await capture('04-iona-dialogue');await choose('pub-iona.help');await choose('pub-iona.accept');await closeDialogue();
  await walkRow(-1.25,-22.5);await aimRow(-3.19,-22.5);await key('e');await choose('pub-iona.take-tray');await closeDialogue();check((await state()).pub.quest.phase==='carrying-waters','ordinary E collects the water tray');
  await walkRow(-1.25,-30.2);await aimRow(-3.12,-30.2);await key('e');await choose('pub-service.serve-waters');await closeDialogue();check((await state()).pub.quest.phase==='served-waters','public aisle reaches occupied water table');
  await walkRow(-1.25,-28.8);await aimRow(-3.12,-28.8);await key('e');await choose('pub-service.collect-empties');await closeDialogue();check((await state()).pub.quest.phase==='carrying-empties','ordinary E collects the domino table empties');
  await walkRow(-1.25,-20.7);await aimRow(-4.74,-20.7);await key('e');await choose('pub-iona.return-tray');await closeDialogue();check((await state()).pub.quest.complete,'the voluntary first favor still completes normally');
}
async function ordinaryDoorRoute(){
  await walkRow(-1.25,-30.75);await aimWorld(-12.75,107.25,-.04);await sleep(1500);
  if((await state()).doors.find(d=>d.id==='pub-west-entry').openFraction<.8){await key('e');await until(s=>s.doors.find(d=>d.id==='pub-west-entry').openFraction>.8,'ordinary E opens the west pub door');}
  await walkWorld({x:-12.75,z:106.25});check(!(await state()).hospitality.active,'ordinary walking leaves the dry warm room through its real doorway');await aimWorld(-11,110,-.04);await capture('06-outside-open-threshold');
  await walkWorld({x:-12.75,z:108.3});check((await state()).hospitality.active,'ordinary walking reenters without a collision or trigger lock');
}
async function ordinaryAudioPause(){
  const live=await until(s=>s.hospitality.audio?.active,'ordinary pub audio responds to the real interaction gesture');check(live.hospitality.audio.voices<=3,'ordinary pub sound has a bounded live graph');
  await page.evaluate(()=>window.__chunkSurferDesktopMenu.dispatch('pause'));const paused=await until(s=>s.scene==='pause','ordinary pause menu');
  check(!paused.hospitality.audio.active&&paused.hospitality.audio.voices===0&&paused.hospitality.sourceAudio.voices===0,'pause immediately cuts both room sound owners');
  await key('Escape');await until(s=>s.scene!=='pause'&&s.hospitality.audio?.active,'ordinary room audio resumes with the game');
}
async function boot({blockWarm=false}={}){
  const context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.evaluateOnNewDocument(suppressClientHmr);await page.evaluateOnNewDocument(()=>performance.setResourceTimingBufferSize(5000));
  page.on('pageerror',error=>report.errors.push(String(error)));page.on('response',response=>{
    if(response.status()>=400)report.failedResources.push({url:response.url(),status:response.status()});
    if(/\/assets\/.*(?:pub|hospitality).*\.glb/.test(response.url())){const entry={url:response.url(),status:response.status()};report.assets.push(entry);responseTasks.push(response.buffer().then(bytes=>{entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');}).catch(error=>{entry.hashError=String(error);}));}
  });
  if(blockWarm){await page.setRequestInterception(true);page.on('request',request=>{if(new URL(request.url()).pathname==='/assets/pub-hospitality.glb'){report.fixtures.push({kind:'intentional warm-pack decode failure',url:request.url()});void request.abort('failed');}else void request.continue();});}
  await page.goto(base+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__probe?.pub&&window.__probe?.sourcePub&&window.__scenes?.top()?.id,{timeout:90000});
  await page.evaluate(async()=>{
    const p=window.__probe;await p.testRun();p.tutSkip();p.setFlags(['prologueDone','van.closed','opening.vehicle.exited','kit.fitted','bag.taken','setup.levels','combat.trained','setup.waypoint','setup.case.arrived'],['opening.vehicle.pending']);p.clearDiagnosticScenes?.();p.frontEndGrade?.(false);p.hush?.();
    const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;
    window.__pubHospitalityModules={r3:await import(resource('/src/render/r3d.js')),p3:await import(resource('/src/render/props3d.js')),fp:await import(resource('/src/world/floorplan.js')),props:await import(resource('/src/game/props.js')),district:await import(resource('/src/data/exterior-district.js'))};
    p.setTorch(false);window.__pubHospitalityModules.r3.r3dSetNightSeed(.37);
  });await page.bringToFront();await sleep(500);
  await page.waitForFunction(()=>window.__pubHospitalityModules.p3.characterStats().meshes.includes('pub_bartender_iona'),{timeout:90000});return context;
}
async function fallback(){
  const context=await boot({blockWarm:true});
  try{
    await until(s=>!!s.hospitality?.assets?.hospitalityError,'intentional pack failure is recorded',90000);await place(cameras[2]);await until(s=>{const ids=new Set(s.characters.poses.map(a=>a.id));return s.pub.actors.every(a=>ids.has(a.id));},'all nine separately loaded anatomical patrons settle after warm failure',90000);const s=await capture('07-missing-warm-pack-fallback');
    check(!s.hospitality.assets.hospitality&&s.hospitality.meshId==='exterior_pub_interior','failed warm decode keeps the complete original pub mesh');
    const ids=new Set(s.characters.poses.map(a=>a.id));check(s.pub.actors.every(a=>ids.has(a.id)),'failed warm decode retains all nine anatomical patrons');
    check(!s.hospitality.localLightIds.some(id=>/^pub-(hearth|table-lamp|counter-lamp|window)/.test(id)),'missing warm fittings keep the original practical rig');
    await aimRow(-4.74,-20.7);await sleep(1500);check((await state()).pub.focused==='pub-bartender-iona','fallback preserves actual Iona focus');await key('e');check(!!(await state()).dialogue,'fallback Iona remains addressable with ordinary E');await closeDialogue();
  }finally{await context.close();}
}
async function sourceControl(){
  report.fixtures.push({kind:'existing Source last-light entrance fixture with declared favor receipts; actual E enters round zero'});
  await page.evaluate(async()=>{await window.__probe.sourcePub.entranceFixture();});await sleep(600);check(!!await page.evaluate(()=>window.__probe.sourcePub.focused()),'Source road door remains the actual focused threshold');await key('e');
  await until(s=>s.source?.ready||s.source?.error,'Source bar renderer readiness',90000);const s=await state();check(s.source.ready&&s.source.stage===0,'Source round zero is initialized independently');
  await page.evaluate(async()=>{const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;window.__pubHospitalityModules.sourceRender=await import(resource('/src/render/source-pub-renderer.js'));});
  await sleep(1400);const captured=await capture('05-source-round-zero');
  check(captured.sourceFrame.props.filter(a=>a.pubActorId&&!/-photos$|-map$/.test(a.id)).length===9,'Source keeps its nine authored identities');
  check(!captured.sourceFrame.props.some(a=>/hospitality|warm.*pub|pub.*warm/.test(a.mesh)),'Source does not select ordinary hospitality dressing');
  check(!captured.sourceFrame.lights.some(a=>/hospitality|hearth|hospitality/.test(a.id)),'Source does not inherit the new ordinary practicals');
  if(captured.hospitality){check(!captured.hospitality.active,'ordinary hospitality owner is inactive in Source');check(!captured.hospitality.renderedIds.length&&!captured.hospitality.localLightIds.length,'actual Source owner submits no ordinary warm mesh or rig');check(!captured.hospitality.audio.active&&captured.hospitality.audio.voices===0,'Source retains no ordinary room sound voices');}
}
try{
  await mkdir(out,{recursive:true});report.source=await sourceHashes();browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  if(mode==='fallback'||mode==='fallback-hearth'){await fallback();}
  if(mode==='hearth'||mode==='fallback-hearth'){await boot();await until(s=>s.hospitality?.assets?.hospitality,'hearth pack readiness',90000);await place({id:'09-hearth-east-front',world:{x:-12,z:109.1},yaw:-2.34096,pitch:-.4938});await capture('09-hearth-east-front');}
  if(mode==='all'){await boot();
  if(phase==='final'){const ready=await until(s=>s.hospitality?.assets?.hospitality||s.hospitality?.assets?.hospitalityError,'warm pack readiness',90000);check(ready.hospitality.assets.hospitality,'actual optional warm pack is decoded',ready.hospitality.assets);}
  for(const camera of cameras){await place(camera);await capture(camera.id);}
  const s=await state(),poses=new Set(s.characters.poses.map(a=>a.id));check(s.pub.actors.length===9&&s.pub.actors.every(a=>a.present),'all nine pub actors retain their physical interaction bodies');check(s.pub.actors.every(a=>poses.has(a.id)),'all nine pub actors submit actual anatomical skin poses');check(!s.characters.poseErrors?.length,'pub skins have no renderer pose errors',s.characters.poseErrors);
  if(phase==='final'){check(s.hospitality.meshId==='pub_warm_interior','actual ordinary room selects the loaded warm mesh');check(s.hospitality.localLightIds.includes('pub-counter-lamp'),'actual ordinary bar submits its visible counter practical');await service();await ordinaryAudioPause();await ordinaryDoorRoute();
    await place({id:'08-hearth-close',world:{x:-13.5,z:108.3},yaw:3.139370435025969,pitch:-.462});await capture('08-hearth-close');}
  if(phase==='baseline'||process.env.PUB_HOSPITALITY_INCLUDE_SOURCE==='1')await sourceControl();else report.deferredSource='Source v2 is reviewed by the dedicated full five-round harness after its independent pack is frozen.';
  if(phase==='final')await fallback();}
  check(report.errors.length===0,'no JavaScript errors in ordinary or Source pub',report.errors);report.finishedAt=new Date().toISOString();
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;if(page)await capture('failure').catch(()=>{});}
finally{await Promise.allSettled(responseTasks);if(browser)await browser.close();report.browserClosed=true;report.sourceAtCompletion=await sourceHashes();await mkdir(out,{recursive:true});await writeFile(resolve(out,'live-report.json'),JSON.stringify(report,null,2));}
