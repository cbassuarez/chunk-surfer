import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

// Diagnostic placement establishes the service-field approach only. E/W/R and
// the title's Continue command perform the personal journey and reloads. Every
// image is the live game's r3d canvas; no module or shader is substituted.
const out=resolve('artifacts/bust-route-implementation/live');
const url=process.env.BUST_PERSONAL_URL||'http://127.0.0.1:5296/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1';
const lightingOnly=process.env.BUST_PERSONAL_LIGHTING_ONLY==='1';
const targeted=process.env.BUST_PERSONAL_TARGETED==='1';
const checks=[],captures=[],errors=[],traces=[],pendingImages=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,page,browserProfile,stage='boot',mode='normal',fatal=null;
const check=(pass,name,detail)=>{checks.push({pass:!!pass,mode,name,detail});console.log(pass?'PASS':'FAIL',mode,name,JSON.stringify(detail));};
async function state(){return page.evaluate(()=>{
  const p=window.__probe,personal=p?.towerPersonal?.();
  return {pos:p?.pos?.(),look:p?.lookAngles?.(),source:p?.chunkSurf?.(),personal,
    scene:window.__scenes?.top({includeOverlay:true})?.id,dialogue:window.__scenes?.top()?.view?.(),
    doors:p?.doorFieldDoors?.(),crossing:p?.sourceCrossing?.(),realm:p?.stationRealm?.(),
    land:p?.towerLand?.(),landSpots:p?.landSpots?.(),lighting:p?.r3dLighting?.(),props:p?.sourceProps?.(),
    eye:p?.sourceShoreView?.()?.eye||null,
    settings:p?.settings?.(),tape:p?.tape?.(),cathedral:p?.cathedralState?.(),keys:p?.towerKeyAnswers?.(),
    storedPersonal:JSON.parse(localStorage.getItem('chunk-surfer:save:v4')||'null')?.chunkSurf?.station?.personal||null,
  };
});}
async function shot(name,{fullPage=false}={}){stage=`${mode}:${name}`;const s=await state();
  const data=fullPage?null:await page.evaluate(()=>document.querySelector('canvas.r3d').toDataURL('image/png'));
  const path=join(out,`${targeted?'targeted-':''}${mode}-${name}.webp`);
  const bytes=fullPage?await page.screenshot({type:'webp',quality:84}):await sharp(Buffer.from(data.split(',')[1],'base64')).webp({quality:84}).toBuffer();
  const capture={mode,name,path,surface:fullPage?'full-player-view':'r3d-canvas',...s};
  try{await writeFile(path,bytes);}catch(error){
    if(error.code!=='ENOSPC')throw error;
    capture.path=null;capture.pendingPath=path;pendingImages.push({capture,path,bytes});
    console.warn('CAPTURE DEFERRED UNTIL PROFILE CLEANUP',mode,name);
  }
  captures.push(capture);console.log('CAPTURE',stage,JSON.stringify({pos:s.pos,land:s.land,stage:s.personal?.frame?.stage,scene:s.scene}));return s;
}
async function aim(yaw=0,pitch=0){await page.evaluate(v=>window.__probe.lookAtWorld(v.yaw,v.pitch),{yaw,pitch});await sleep(110);}
async function face(target,pitch=0){const s=await state();await aim(Math.atan2(target.x-s.pos.x,-(target.y-s.pos.y)),pitch);}
async function hold(key,ms){await page.keyboard.down(key);try{await sleep(ms);}finally{await page.keyboard.up(key);}await sleep(100);}
async function torch(on){if(await page.evaluate(()=>!!window.__probe.rec().light)!==on)await page.keyboard.press('f');await sleep(150);}
async function until(predicate,{timeout=20000,interval=200}={}){const stop=Date.now()+timeout;while(Date.now()<stop){const s=await state();if(predicate(s))return s;await sleep(interval);}return state();}
async function walkTo(target,name,{radius=1.5,limit=160}={}){
  stage=`${mode}:walk-${name}`;let stuck=0,last=null;
  for(let i=0;i<limit;i++) {
    const s=await state(),d=Math.hypot(s.pos.x-target.x,s.pos.y-target.y);
    if(d<=radius){traces.push({mode,name,iterations:i,target,final:s.pos});return true;}
    if(last&&Math.hypot(s.pos.x-last.x,s.pos.y-last.y)<.04)stuck++;else stuck=0;
    if(stuck>=7){traces.push({mode,name,stuck:true,target,final:s.pos,d,scene:s.scene,frame:s.personal?.frame});return false;}
    last=s.pos;await face(target);await hold('w',Math.min(420,Math.max(65,d*46)));
  }
  traces.push({mode,name,limit:true,target,final:(await state()).pos});return false;
}
function worldAt(frame,x,z){return {x:frame.pose.x+(x-frame.localPose.x)*2,y:frame.pose.y+(z-frame.localPose.z)*2};}
async function nearDoor(door){await page.evaluate(d=>{
  const p=window.__probe,[a,b]=d.threshold,n=d.normal;p.sourceWarp((a.x+b.x)/2+n[0]*3,(a.y+b.y)/2+n[2]*3);p.hush();
},door);await sleep(350);await aim(Math.atan2(-door.normal[0],door.normal[2]),0);}
async function openAndCross(door,label){
  await until(s=>!s.crossing?.active&&!s.crossing?.frame,{timeout:30000});
  await nearDoor(door);
  // The established first press inspects the physical service door; a later
  // press works its handle. Preserve that player-facing sequence in the test.
  for(let i=0;i<5;i++) {
    await page.keyboard.press('e');await sleep(350);
    if((await state()).doors?.find(d=>d.id===door.id)?.opened)break;
    await page.evaluate(()=>window.__probe.hush());
  }
  const opened=await state();check(opened.doors?.find(d=>d.id===door.id)?.opened,`${label}: ordinary E opens the door`,door.id);
  await hold('w',650);return state();
}
async function verifyKeyVisits(){
  const keys=(await state()).doors.filter(d=>d.key);
  for(let i=0;i<keys.length;i++) {
    await openAndCross(keys[i],`key ${i+1}`);
    const gone=await until(s=>s.doors.find(d=>d.id===keys[i].id)?.erased,{timeout:10000});
    check(gone.doors.find(d=>d.id===keys[i].id)?.erased,`key ${i+1} actual crossing answers its lock`);
    const finished=await until(s=>!s.crossing?.active&&!s.crossing?.frame,{timeout:30000});
    check(!finished.crossing?.active&&!finished.crossing?.frame,`key ${i+1} visit finishes before the next approach`,finished.crossing);
  }
  const keyed=await shot('13-two-lock-answers'),tower=keyed.doors.find(d=>d.route==='tower');
  check(tower?.unlocked,'both distinct key visits unlock the actual tower route',tower);
  if(tower?.unlocked){await nearDoor(tower);await hold('w',1100);await sleep(1500);const belfry=await shot('14-belfry-arrival');check(belfry.cathedral?.here?.level==='belfry'&&belfry.source.finale.route==='tower','ordinary W crosses the unlocked route into belfry',{cathedral:belfry.cathedral,personal:belfry.personal});}
}
async function reloadAndContinue(label){
  stage=`${mode}:reload-${label}`;const before=await state();
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.towerPersonal,{timeout:90000});
  for(let i=0;i<150;i++) {
    const id=await page.evaluate(()=>window.__scenes?.top()?.id);
    if(id==='eula'){await page.keyboard.press('Enter');await sleep(400);continue;}
    if(id==='opening-credits'){await sleep(350);continue;}
    if(id==='title'){await page.keyboard.press('Enter');await sleep(500);break;}
    if(!id&&await page.evaluate(()=>!!window.__probe.towerPersonal()?.frame))break;
    await sleep(350);
  }
  let after=await until(s=>s.source?.phase==='bells'&&s.personal?.frame,{timeout:12000});
  if(after.scene==='title') {
    await page.evaluate(()=>window.__chunkSurferDesktopMenu.dispatch('continue'));await sleep(1200);after=await state();
  }
  await page.waitForFunction(()=>!String(window.__scenes?.top({includeOverlay:true})?.id||'').startsWith('front-end-iris'),{timeout:20000});
  after=await state();
  check(after.personal?.saved?.active===before.personal?.saved?.active&&after.personal?.saved?.stage===before.personal?.saved?.stage,
    `${label}: actual page reload retains the saved journey`,{before:before.personal?.saved,after:after.personal?.saved,scene:after.scene});
  if(before.personal?.frame?.active)check(Math.hypot(after.pos.x-before.pos.x,after.pos.y-before.pos.y)<2,
    `${label}: Continue restores the body to this room`,{before:before.pos,after:after.pos});
  await torch(true);return after;
}
async function run(reduced){
  mode=reduced?'reduced':'normal';stage=`${mode}:boot`;const context=await browser.createBrowserContext();
  try{
    page=await context.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:.575});await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
    const record=error=>{let e=errors.find(e=>e.mode===mode&&e.error===error);if(e)e.count++;else errors.push({mode,stage,error,count:1});};
    page.on('pageerror',e=>record(String(e)));page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(message.text()))record(message.text());});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
    // This is a disposable browser profile; acknowledge the normal initial
    // local licence gate so the subsequent actual reload reaches Continue.
    if(await page.evaluate(()=>window.__scenes?.top()?.id==='eula')){await page.keyboard.press('Enter');await sleep(300);}
    // Let calibration finish its asynchronous credits/title handoff before the
    // review preset; otherwise that handoff can cover an already live world.
    for(let i=0;i<180;i++) {
      const id=await page.evaluate(()=>window.__scenes?.top()?.id);
      if(id==='title')break;
      if(id==='eula')await page.keyboard.press('Enter');
      if(i%30===0)console.log('BOOT',mode,id);
      await sleep(600);
    }
    await page.waitForFunction(()=>window.__scenes?.top()?.id==='title',{timeout:10000});
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();await window.__probe.bellsPreset(440);window.__probe.hush();});
    await sleep(1300);
    await page.evaluate(v=>{
      if(window.__probe.setReduceMotion)return window.__probe.setReduceMotion(v);
      if(window.__chunkSurferDesktopMenu)return window.__chunkSurferDesktopMenu.dispatch({id:'reduce_motion',checked:v});
      if(v)throw new Error('No production reduced-motion setting entry point');
    },reduced);await sleep(350);
    await torch(true);const field=await shot('01-field');
    check((field.settings?.shake!=='full')===reduced,'motion setting applies to the actual game',field.settings?.shake);
    if(targeted&&!reduced){await verifyKeyVisits();return;}
    const entry=field.doors?.find(d=>d.personal)||field.doors?.find(d=>d.lockIn);
    check(!!entry&&!entry.shut&&!entry.barred,'the optional personal door is available',entry);
    if(!entry)throw new Error('No personal entry door');
    await openAndCross(entry,'personal entry');
    const arrived=await until(s=>s.personal?.frame?.active,{timeout:8000});
    check(arrived.personal?.frame?.active&&arrived.land==='school-hall','ordinary W voluntarily enters the school hall',{pos:arrived.pos,frame:arrived.personal?.frame,crossing:arrived.crossing});
    if(!arrived.personal?.frame?.active)throw new Error('Ordinary door crossing did not enter personal hall');
    const back=arrived.personal.frame.returnPose;
    await face(arrived.personal.frame.targets.boy,-.05);const hall=await shot('02-hall');
    check(hall.props.some(p=>p.mesh==='tower_personal_boy')&&hall.props.some(p=>p.mesh==='tower_personal_tape_lead'),'hall has the real child and continuous physical strand');
    const start=hall.pos;await hold('w',350);const advanced=await state();
    check(Math.hypot(advanced.pos.x-start.x,advanced.pos.y-start.y)>.4&&advanced.personal.frame.active,
      'normal movement works without bell-field ejection',{start,after:advanced.pos});
    if(lightingOnly) {
      const frame=advanced.personal.frame;
      await walkTo(worldAt(frame,0,4.3),'child lighting');await face(frame.targets.boy,-.14);await shot('lighting-hall-torch');
      await torch(false);await shot('lighting-hall-practicals');await torch(true);
      await walkTo(worldAt(frame,5,-7),'lighting hall opening');
      await walkTo(worldAt(frame,5,-24),'lighting connector');
      await walkTo(worldAt(frame,6.2,-50.9),'lighting contractor close');
      await face(worldAt(frame,5.04,-52.49),-.27);await shot('lighting-ash-torch');
      await torch(false);await shot('lighting-ash-practicals');
      // Bounded exposure diagnostic. This capture is labelled separately and
      // the override is restored; full route captures use authored values.
      await page.evaluate(()=>window.__probe.captureExposure(1));await sleep(250);
      await shot('lighting-ash-exposure1-practicals');await torch(true);
      await shot('lighting-ash-exposure1-torch');
      await page.evaluate(()=>window.__probe.captureExposure(null));return;
    }
    let frame=advanced.personal.frame;
    check(await walkTo(worldAt(frame,0,4.3),'boy approach'),'walk close enough to see the child and loose lead');
    await face(frame.targets.boy,-.14);await shot('02-boy-lead');
    const aisle=await walkTo(worldAt(frame,0,-4),'clear centre aisle');
    const turn=await walkTo(worldAt(frame,5,-4),'clear aisle right turn');
    const onward=await walkTo(worldAt(frame,5,-7),'hall onward');
    check(aisle&&turn&&onward,'walk through the centre aisle to the voluntary onward opening');
    check(await walkTo(worldAt(frame,5,-8.7),'service threshold'),'the service opening remains voluntarily walkable');
    await face(worldAt(frame,-3.8,-18.5),.03);await shot('03-opening-reels');
    check(await walkTo(worldAt(frame,5,-24),'tape connector'),'walk the tape connector on ordinary safe ground');
    await face(worldAt(frame,-5.8,-28.5),.13);await shot('03-mast-window');
    check(await walkTo(worldAt(frame,5,-47.5),'ash approach'),'walk to the contractor from behind');
    await face(frame.targets.recordist,-.13);
    let ash=await shot('04-ash-before-reload');
    check(ash.personal.frame.canListen&&ash.personal.frame.stage==='ash-room','the visible contractor exposes the recorder action',ash.personal.frame);
    check(await walkTo(worldAt(frame,6.2,-50.9),'contractor close'),'ordinary movement reaches the contractor and machine without crossing the desk');
    await face(worldAt(frame,5.04,-52.49),-.27);await shot('04-contractor-close');
    if(targeted){
      await page.keyboard.press('r');await sleep(700);
      check((await state()).personal.held,'ordinary R raises the recorder for the complete player view');
      await shot('05-monitor-full-player-view',{fullPage:true});
      await page.keyboard.press('r');return;
    }
    ash=await reloadAndContinue('ash before listening');await face(worldAt(frame,5.04,-52.49),-.27);await shot('05-ash-restored');
    await page.keyboard.press('r');await sleep(500);
    check((await state()).personal.held,'ordinary R raises the recorder at the working contractor');
    const quietMeter=await shot('05-monitor-quiet');await sleep(2800);
    const bellMeter=await shot('05-monitor-bell');
    check(quietMeter.props.find(p=>p.id==='land-recorder-level')?.sx!==bellMeter.props.find(p=>p.id==='land-recorder-level')?.sx,
      'the actual physical machine level bar changes while monitoring');
    const heard=await until(s=>s.personal?.saved?.recordingHeard,{timeout:25000});
    check(heard.personal?.saved?.recordingHeard&&heard.personal?.take,'listening archives the authored recording',{personal:heard.personal,tape:heard.tape});
    await shot('06-recording-heard');await page.keyboard.press('r');await sleep(300);
    check(!(await state()).personal.held,'ordinary R lowers the recorder without a modal interruption');
    const earned=await reloadAndContinue('recording earned');
    check(earned.personal?.saved?.recordingHeard&&earned.personal?.take,'the playable authored take survives reload',earned.personal);
    frame=earned.personal.frame;
    check(await walkTo(worldAt(frame,5,-24),'return connector'),'walk the same connector back with the recording');
    check(await walkTo(worldAt(frame,5,-7),'return hall opening'),'return to the same school hall');
    const returned=await shot('07-hall-return');
    check(returned.personal.frame.stage==='return-hall'&&returned.props.some(p=>p.mesh==='tower_personal_handover'),'same hall stages the prior contractor and boy',returned.personal.frame);
    check(await walkTo(worldAt(frame,0,3.8),'handover approach'),'approach the handover using ordinary movement');
    await face(returned.personal.frame.targets.boy,-.13);await shot('08-handover-start');
    await until(s=>s.personal?.frame?.handover>=1,{timeout:10000});await shot('09-handover-finished');
    await until(s=>s.personal?.frame?.collapse>=1,{timeout:12000});const broken=await shot('10-hall-unravels');
    check(broken.personal.frame.exitAvailable&&broken.props.some(p=>p.id==='land-return-door'),'the room breaks down around a persistent lit exit',broken.personal.frame);
    await face(broken.personal.frame.targets.exit);await shot('10-surviving-exit');
    check(await walkTo(worldAt(frame,0,18.2),'lit return door'),'walk the surviving ground to the exit');
    await face(broken.personal.frame.targets.exit);await shot('10-exit-close');await page.keyboard.press('e');await sleep(700);
    const road=await shot('11-road-return');
    check(!road.personal.frame.active&&road.personal.saved.completed&&road.personal.saved.rewardEarned,'ordinary E returns with durable completion',road.personal);
    const yawError=Math.abs(Math.atan2(Math.sin(road.look.yaw-back.yaw),Math.cos(road.look.yaw-back.yaw)));
    check(Math.hypot(road.pos.x-back.x,road.pos.y-back.y)<.05&&yawError<.002&&Math.abs(road.look.pitch-back.pitch)<.002,
      'exit restores the exact pre-entry road position and look',{expected:back,actual:{...road.pos,...road.look}});
    const durable=await reloadAndContinue('completed journey');
    check(durable.personal.saved.completed&&durable.personal.saved.rewardEarned&&durable.personal.take,'completion, reward and authored take survive another reload',durable.personal);
    const clearing=durable.personal.frame.ringClearing;
    // A diagnostic road placement bounds the callback check. The personal
    // journey itself above is entirely ordinary input from the service door.
    await page.evaluate(p=>window.__probe.sourceWarp(p.x,p.y),clearing);await sleep(1300);
    const ring=await shot('12-ring-answer');check(ring.personal.saved.ringAnswered,'the earned recording answers the ring automatically',ring.personal.saved);
    if(!reduced)await verifyKeyVisits();
  }catch(error){
    const failed=await state().catch(()=>null);traces.push({mode,failureState:failed});
    console.error('FAILED STATE',JSON.stringify({pos:failed?.pos,scene:failed?.scene,dialogue:failed?.dialogue,personal:failed?.personal}));
    await shot('failure').catch(()=>{});throw error;
  }finally{await context.close();}
}
await mkdir(out,{recursive:true});
try{
  browserProfile=await mkdtemp(join(tmpdir(),'chunk-surfer-bust-personal-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,protocolTimeout:120000,
    userDataDir:browserProfile,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling',
      '--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache']});
  await run(false);if(!lightingOnly)await run(true);
}catch(error){fatal=String(error.stack||error);console.error(fatal);errors.push({mode,stage,fatal});}
finally{
  if(browser)await browser.close();
  if(browserProfile)await rm(browserProfile,{recursive:true,force:true});
  for(const pending of pendingImages){
    try{await writeFile(pending.path,pending.bytes);pending.capture.path=pending.path;delete pending.capture.pendingPath;}
    catch(error){errors.push({mode:pending.capture.mode,stage:pending.capture.name,artifactError:String(error)});}
  }
  await writeFile(join(out,targeted?'targeted-report.json':lightingOnly?'lighting-report.json':'report.json'),JSON.stringify({generatedAt:new Date().toISOString(),url,
    supersedes:targeted?{report:'report.json',checks:['key 2 actual crossing answers its lock','both distinct key visits unlock the actual tower route','walk through the centre aisle to the voluntary onward opening'],reason:'Wait for each actual field visit to finish; use the clear centre aisle and a target radius compatible with quantized movement.'}:null,
    scope:targeted?'Targeted actual Chromium/Metal final-production follow-up: sequential ordinary key visits, unlocked belfry threshold, reduced clear-aisle walk and complete rendered player view with ordinary R held. Preserves the separate full normal/reduced journey and reload report.':lightingOnly?'Lighting diagnostic: actual Chromium/Metal r3d canvas and ordinary voluntary entry, child approach and contractor walk-up. Torch on/off with real practical lighting. Separately labelled exposure1 diagnostic with override restored; no shader or module substitutions.':
      'Actual Chromium/Metal r3d canvas. Diagnostic service-field approach and bounded ring/key approaches; ordinary E/W/R input performs the optional journey. Actual page reload + Continue tests persistence. Normal and reduced motion; no shader or module substitution. This is local route-mechanism evidence, not a full earned campaign or completed combat.',checks,captures,traces,errors},null,2));
}
process.exit(fatal||errors.length||checks.some(c=>!c.pass)?1:0);
