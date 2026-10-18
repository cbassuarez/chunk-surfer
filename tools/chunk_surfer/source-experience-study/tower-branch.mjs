// Assisted developer branch verification. Preparation/import never launches.
// SOURCE_TOWER_BRANCH_LAUNCH=1 node .../tower-branch.mjs
// Authorize the single owned browser after the prototype comparison releases it.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { SOURCE_BELLS } from '../../../src/data/source-level.js';
import { productionIdentity, suppressClientHmr } from './prototype-session-contract.mjs';

assert.equal(process.env.SOURCE_TOWER_BRANCH_LAUNCH,'1','No browser launched: root must authorize SOURCE_TOWER_BRANCH_LAUNCH=1 after the other capture closes.');
const base=process.env.SOURCE_TOWER_BRANCH_URL||'http://127.0.0.1:5334/';
const out=resolve(process.env.SOURCE_TOWER_BRANCH_OUT||'artifacts/source-experience-study/route/tower/native');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const report={kind:'source-tower-ordinary-input-verification',scope:'One declared eligible bust fixture; actual browser keyboard/mouse, serialized checkpoints and real exit. Assisted test uses read-only route/seed/geometry information; not unbriefed discovery or earned whole chapter.',
  productionFilesChanged:[],beganAt:new Date().toISOString(),inputs:[],checks:[],snapshots:[],segments:[],errors:[],limitations:[
    'Prepared but unvalidated runner until the first authorized execution. No outcome is inferred from this script.',
    'Seeded key flags and geometry getters guide the tester, so the test cannot establish player clue comprehension.',
    'Capture keeps actual mixed game audio and browser canvas; native OS choreography is outside this browser proof.',
    'One intentional page reload splits the recording; continuous-input claims apply to each segment separately.']};
let browser,page,profile,chunkPath,activeSegment=null,mouseX=480,mouseY=300;
let failure=null;
await mkdir(out,{recursive:true});
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`);};
const input=(kind,details)=>report.inputs.push({at:Date.now(),kind,...details});
const read=()=>page.evaluate(()=>{
  const raw=JSON.parse(localStorage.getItem('chunk-surfer:save:v4')||'null');
  const envelope=JSON.parse(localStorage.getItem('chunk-surfer:save:autosave:v1')||'null');
  const saved=raw||envelope?.data||{};
  return {position:window.__probe.pos(),look:window.__probe.lookAngles(),source:{...saved.chunkSurf,...window.__probe.chunkSurf()},
  scene:window.__scenes?.top()?.id||null,view:window.__scenes?.top()?.view?.()||null,speech:window.__probe.speech(),
  horizon:window.__probe.horizonFrame(),bust:window.__probe.bustReliquary(),bells:window.__probe.bellsFrame(),
  doors:window.__probe.doorFieldDoors(),crossing:window.__probe.sourceCrossing(),towerView:window.__probe.sourceTowerView(),
  tower:window.__probe.chapelTower(),settings:window.__probe.settings(),audio:window.__probe.audio(),
  pointerLocked:!!document.pointerLockElement,parity:window.__chunkParity?.(),
  persisted:[...Object.keys(localStorage)].filter(k=>/chunk-surfer.*(?:save|autosave)/.test(k)).map(key=>({key,value:JSON.parse(localStorage.getItem(key)||'null')}))};});
async function shot(name){
  const value=await read();report.snapshots.push({name,at:Date.now(),...value});
  await page.screenshot({path:join(out,`${name}.png`)});
  if(activeSegment){const data=await page.evaluate(label=>{window.__sourceExperienceCapture.mark(label);return window.__sourceExperienceCapture.witness();},name);
    await writeFile(join(out,`${name}-canvas.png`),Buffer.from(data.split(',')[1],'base64'));}
  console.log(JSON.stringify({snapshot:name,position:value.position,phase:value.source?.phase,scene:value.scene,bells:value.bells?.depth,route:value.source?.finale?.route}));
  return value;
}
async function press(key){input('press',{key});await page.keyboard.press(key);await sleep(160);}
async function hold(key,ms){input('hold',{key,ms});await page.keyboard.down(key);try{await sleep(ms);}finally{await page.keyboard.up(key);}}
async function until(predicate,label,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){const value=await read();if(predicate(value))return value;await sleep(120);}throw new Error(`Timed out: ${label}`);}
async function finishWorldSpeech(timeout=90000){return until(v=>!v.speech,'world speech finishes naturally',timeout);}
async function captureStart(name){
  assert.equal(activeSegment,null);chunkPath=join(out,`${name}.webm`);await writeFile(chunkPath,Buffer.alloc(0));
  await page.evaluate(async name=>{const {installSourceExperienceCapture}=await import('/tools/chunk_surfer/source-experience-study/capture-installer.js');
    return installSourceExperienceCapture({initialFixture:name,fps:30,sampleHz:10,videoBitsPerSecond:2_000_000});},name);
  activeSegment=name;
}
async function captureStop(reason){
  if(!activeSegment)return;const name=activeSegment;
  const result=await page.evaluate(()=>window.__sourceExperienceCapture.stop());
  if(result.videoBase64)await writeFile(join(out,`${name}.webm`),Buffer.from(result.videoBase64,'base64'));
  const record={...result.report,video:join(out,`${name}.webm`),stopReason:reason};
  await writeFile(join(out,`${name}.json`),JSON.stringify(record,null,2));report.segments.push(record);activeSegment=null;chunkPath=null;
}
async function acquirePointer(){
  if(await page.evaluate(()=>!!document.pointerLockElement))return;
  input('pointer-capture-click',{x:mouseX,y:mouseY});await page.mouse.click(mouseX,mouseY);await sleep(180);
  check('ordinary click acquires mouse pointer capture',await page.evaluate(()=>!!document.pointerLockElement));
}
async function mouseAim(yaw,pitch=0){
  await acquirePointer();
  for(let n=0;n<20;n++){
    const {look,settings}=await read(),dyaw=wrap(yaw-look.yaw),dpitch=pitch-look.pitch;
    if(Math.abs(dyaw)<.035&&Math.abs(dpitch)<.04)return;
    const gain=Math.max(.2,Math.min(10,Number(settings.mouseSensitivity)||2.4))*.0048;
    const dx=Math.max(-100,Math.min(100,dyaw/gain)),dy=Math.max(-55,Math.min(55,-dpitch/gain*(settings.mouseInvertY?-1:1)));
    mouseX+=dx;mouseY+=dy;input('mouse-move',{x:mouseX,y:mouseY,dx,dy});
    await page.mouse.move(mouseX,mouseY,{steps:4});await sleep(110);
  }
  throw new Error(`Ordinary mouse aim did not converge: ${JSON.stringify((await read()).look)}`);
}
// Camera-relative WASD only. A small local graph avoids actual closed geometry;
// there is no synthetic step, position assignment, time advance, or state edit.
async function walk(target,label,{tolerance=.65,budget=180000}={}){
  const begun=Date.now();let stuck=0,last=null;
  while(Date.now()-begun<budget){
    const v=await read();if(!v.source?.active)throw new Error(`Source handoff occurred before target ${label}`);
    if(v.crossing?.frame){await until(s=>!s.crossing?.frame,'actual nested crossing finishes',90000);continue;}
    if(v.scene){await finishDialogue();continue;}
    const p=v.position,dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
    if(d<=tolerance)return v;
    if(last&&Math.hypot(p.x-last.x,p.y-last.y)<.025)stuck++;else stuck=0;last=p;
    if(stuck>18)throw new Error(`No ordinary progress toward ${label}: ${JSON.stringify({p,target,look:v.look,focus:v.source.focus})}`);
    const yaw=v.look.yaw,candidates=[{key:'w',x:Math.sin(yaw),y:-Math.cos(yaw)},{key:'d',x:Math.cos(yaw),y:Math.sin(yaw)},
      {key:'s',x:-Math.sin(yaw),y:Math.cos(yaw)},{key:'a',x:-Math.cos(yaw),y:-Math.sin(yaw)}]
      .map(c=>({...c,score:(c.x*dx+c.y*dy)/d})).sort((a,b)=>b.score-a.score);
    const options=await page.evaluate(({p,candidates})=>candidates.map(c=>({...c,step:window.__probe.canStep(p.x,p.y,p.x+c.x*.7,p.y+c.y*.7)})),{p,candidates});
    const chosen=options.find(c=>c.step.ok&&c.score>.05)||options.find(c=>c.step.ok);
    if(!chosen)throw new Error(`All ordinary directions blocked toward ${label}: ${JSON.stringify(options)}`);
    const interval=await page.evaluate(()=>window.__probe.moveInterval());
    await hold(chosen.key,Math.max(35,Math.min(240,d*interval*.48)));
  }
  throw new Error(`Route budget expired toward ${label}`);
}
async function finishDialogue({choiceText=null,max=140}={}){
  const history=[];
  for(let i=0;i<max;i++){
    const v=await read();if(!v.scene)return history;
    if(v.scene==='title'||v.scene==='eula'||v.scene==='opening-credits')throw new Error(`Unexpected front end during live route: ${v.scene}`);
    const view=v.view;
    if(view?.line?.text&&!history.some(h=>h.lineSerial===view.lineSerial))history.push({at:Date.now(),nodeId:view.nodeId,lineSerial:view.lineSerial,text:view.line.text});
    if(view?.pending?.options?.length){
      if(!choiceText)return history;
      const index=view.pending.options.findIndex(c=>String(c.text||c.label||'').includes(choiceText));
      check(`actual choice ${choiceText} exists`,index>=0,view.pending.options);
      for(let j=0;j<(index-(view.pending.index||0)+view.pending.options.length)%view.pending.options.length;j++)await press('ArrowDown');
      await press('Enter');choiceText=null;
    }else{
      await until(s=>!s.scene||(!s.view?.typing&&!s.view?.voice),'actual text and voice finish',90000);
      await sleep(250);await press('Enter');
    }
  }
  throw new Error('Dialogue did not finish within its bounded inputs');
}
async function actualReload(label){
  const before=await shot(`${label}-before`);await captureStop('Intentional real page reload checkpoint boundary');
  input('browser-reload',{});await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.chunkSurf,{timeout:120000});
  // Opening credits are not skipped by debug. Let their ordinary boot clock run.
  await page.waitForFunction(()=>window.__scenes?.top()?.id!=='opening-credits',{timeout:180000});
  const scene=await page.evaluate(()=>window.__scenes?.top()?.id||null);
  if(scene==='eula')throw new Error('Reload unexpectedly requires EULA; initial ordinary acceptance was not persisted');
  if(scene==='title'){
    const status=await page.$eval('#title-a11y-status',e=>e.textContent);
    check('title selects actual Continue for active saved run',/^continue\./i.test(status),status);await press('Enter');
  }
  await until(v=>v.source?.active&&v.scene!=='title','ordinary Continue restores Source',120000);
  await acquirePointer();
  await captureStart(`${label}-resumed`);const after=await shot(`${label}-after`);
  check('reload retains committed tower route',after.source.finale.route==='tower'&&after.source.finale.bust.decision==='accepted');
  check('reload retains earned bell checkpoint and keys',after.bells.checkpointDepth===before.bells.checkpointDepth
    &&JSON.stringify(after.source.routeDoorsErased)===JSON.stringify(before.source.routeDoorsErased),{before:before.source.bellField,after:after.source.bellField});
  check('reload restores actual saved place',Math.hypot(after.position.x-before.position.x,after.position.y-before.position.y)<2,{before:before.position,after:after.position});
  report.reload={before:{position:before.position,look:before.look},after:{position:after.position,look:after.look},sameLook:Math.abs(wrap(after.look.yaw-before.look.yaw))<.05};
  // Correct a natural resumed facing only through real mouse input, preserving
  // evidence of any camera continuity weakness above.
  await mouseAim(0,-.04);
}

try{
  report.productionIdentityBefore=await productionIdentity();
  profile=await mkdtemp(join(tmpdir(),'chunk-source-tower-'));
  browser=await puppeteer.launch({executablePath:process.env.SOURCE_TOWER_BRANCH_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=8388608','--media-cache-size=8388608']});
  page=await browser.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
  await page.exposeFunction('__sourceExperienceWriteChunk',async data=>{if(!chunkPath)throw new Error('No owned movie sink');await appendFile(chunkPath,Buffer.from(data,'base64'));});
  await page.evaluateOnNewDocument(suppressClientHmr);
  page.on('pageerror',e=>report.errors.push({type:'pageerror',text:String(e)}));
  page.on('console',m=>{if(/shader.*error|GLSL.*error|ERROR: 0:|context.*lost/i.test(m.text()))report.errors.push({type:'console',text:m.text()});});
  const url=new URL(base);for(const[k,v]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1'}))url.searchParams.set(k,v);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id,{timeout:120000});
  if(await page.evaluate(()=>window.__scenes?.top()?.id==='eula')){input('initial-local-test-eula-accept',{key:'Enter'});await page.keyboard.press('Enter');await sleep(500);}
  await page.evaluate(async()=>{
    await window.__probe.testRun();window.__probe.tutSkip();window.__probe.sourceChapelReady();await window.__probe.horizonPreset(168);
    const p=window.__probe,s=p.chunkSurf(),h=p.horizonFrame(),b=p.bustReliquary().placement;
    p.sourceWarp(s.landscapeOrigin.x+b.lateral,h.seamY-b.depth+8,0);p.lookAtWorld(0,-.04);
    await document.fonts.ready;
  });
  await page.bringToFront();await sleep(1600);const initial=await shot('00-declared-eligible-fixture');
  check('initial fixture has returned-eye evidence, no decision and chapel readiness',initial.source.profile.marbleEyes==='returned'&&!initial.source.finale.bust.decision&&initial.tower.phase==='source-ready',initial.source.profile);
  await acquirePointer();await captureStart('tower-from-eligible-bust');
  // Complete the in-world audience one ordinary E at a time; speech is never cleared.
  for(let n=0;n<16;n++){
    await finishWorldSpeech();await press('e');await sleep(200);
    if((await read()).scene==='finale')break;
  }
  check('ordinary bust audience reaches existing proposition',(await read()).scene==='finale');
  report.propositionHistory=await finishDialogue({choiceText:'Enough. Show me the choice.'});
  await finishWorldSpeech();const seal=(await read()).bust.seal;
  await walk({x:seal.x,y:seal.y+1.1},'reachable bronze hand seal',{tolerance:.25});
  check('body actually reaches the hand seal',(await read()).bust.atSeal);await press('e');
  report.commitmentHistory=await finishDialogue({choiceText:'Set your hand in the hollow.'});
  await finishWorldSpeech();const committed=await shot('01-tower-committed-at-seal');
  check('ordinary seal choice commits tower without movement rewrite',committed.source.finale.route==='tower'&&committed.source.finale.bust.decision==='accepted');
  await mouseAim(0,-.04);
  const path=committed.horizon.towerPath;check('committed route exposes four real path points',path?.length===4,path);
  const o=committed.source.landscapeOrigin;
  for(let n=0;n<path.length;n++){
    // horizonFrame reports {x,depth} in the live probe rather than local y.
    const q=path[n],target={x:o.x+q.x,y:committed.horizon.seamY-q.depth};
    await walk(target,`revealed-path-${n}`,{budget:240000});await shot(`02-path-${n}`);
  }
  check('walked revealed path enters BELLS',(await read()).source.phase==='bells');
  // Fixed lateral test lane stays within actual bounds; local blockers can
  // reject it and leave explicit failure evidence, never a corrective warp.
  for(const depth of [70,150]){
    await walk({x:o.x-48,y:o.y+SOURCE_BELLS.from-depth},`bell-lane-${depth}`,{budget:240000});await shot(`03-bell-depth-${depth}`);
  }
  check('ordinary walk earns first quiet clearing',(await read()).bells.checkpointDepth>=148);
  await hold('w',120);await sleep(1500);await actualReload('04-earned-clearing');
  for(const depth of [250,300,400]){
    await walk({x:o.x-48,y:o.y+SOURCE_BELLS.from-depth},`bell-lane-${depth}`,{budget:240000});await shot(`05-bell-depth-${depth}`);
  }
  // The open bell ground narrows into a12-cell-half-width hedge corridor
  // before depth416. Rejoin its centre before entering that actual boundary.
  await walk({x:o.x,y:o.y+SOURCE_BELLS.from-400},'before-hedge lateral return');
  await walk({x:o.x,y:o.y+SOURCE_BELLS.from-426},'actual hedge-corridor entry');
  await shot('05-bell-depth-426');
  const keyDoors=(await read()).doors.filter(d=>d.key).sort((a,b)=>b.threshold[0].y-a.threshold[0].y);
  check('actual seeded field has two usable key doors',keyDoors.length===2&&keyDoors.every(d=>!d.shut),keyDoors);
  report.seededKeyTargets=keyDoors;
  for(const [index,door]of keyDoors.entries()){
    let v=await read();const live=v.doors.find(d=>d.id===door.id),[a,b]=live.threshold,n=live.normal;
    const centre={x:(a.x+b.x)/2,y:(a.y+b.y)/2},approach={x:centre.x+n[0]*3.4,y:centre.y+n[2]*3.4};
    await walk(approach,`key-${index}-approach`);await mouseAim(Math.atan2(-n[0],n[2]),-.04);
    await finishWorldSpeech();await shot(`06-key-${index}-before`);
    // Existing look may precede physical OPEN. Both are real E dispatches.
    for(let tries=0;tries<3;tries++){
      if((await read()).doors.find(d=>d.id===door.id)?.opened)break;
      await press('e');if((await read()).scene)await finishDialogue();await finishWorldSpeech();
    }
    check(`actual E opens ${door.id}`,(await read()).doors.find(d=>d.id===door.id)?.opened);await sleep(1800);
    await walk({x:centre.x-n[0]*2,y:centre.y-n[2]*2},`key-${index}-crossing`,{tolerance:.45});
    await until(s=>!s.crossing?.frame,'actual elsewhere return completes',90000);await finishWorldSpeech();
    const after=await shot(`07-key-${index}-returned`);
    check(`actual crossed ${door.id} is durably erased`,after.doors.find(d=>d.id===door.id)?.erased);
    await mouseAim(0,-.04);
  }
  let v=await read(),door=v.doors.find(d=>d.route==='tower');check('both actual key crossings unlock real tower door',door?.unlocked,door);
  const [a,b]=door.threshold,centre={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  await walk({x:centre.x,y:centre.y+5},'actual tower door approach');await mouseAim(0,-.04);const approach=await shot('08-real-belfry-visible-before-crossing');
  check('door aperture has an actual captured and drawn belfry view',approach.towerView?.door?.id&&approach.towerView?.captured&&approach.towerView?.drawn,approach.towerView);
  input('held-ordinary-tower-threshold-crossing',{key:'w'});await page.keyboard.down('w');
  try{await until(s=>!s.source?.active&&s.tower?.phase!=='source-ready','actual Source-to-belfry handoff',12000);}finally{await page.keyboard.up('w');}
  const arrived=await shot('09-actual-cathedral-arrival');
  check('real handoff closes Source and enters cathedral route',!arrived.source?.active&&arrived.parity?.save?.area==='conservatory',arrived.parity);
  check('saved committed route remains tower',arrived.source?.finale?.route==='tower'||arrived.persisted.some(s=>JSON.stringify(s.value).includes('tower-committed')),arrived.source?.finale);
  check('no JavaScript/shader errors',report.errors.length===0,report.errors);
  report.productionIdentityAfter=await productionIdentity();check('source/render/assets stayed fixed',JSON.stringify(report.productionIdentityBefore)===JSON.stringify(report.productionIdentityAfter));
}catch(error){failure=String(error?.stack||error);report.failure=failure;console.error(failure);if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{
  if(page&&activeSegment)await captureStop(failure?'Failure retained':'Actual branch handoff complete').catch(e=>report.captureStopError=String(e));
  report.passed=!failure&&report.checks.every(c=>c.pass);report.endedAt=new Date().toISOString();
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  await browser?.close();if(profile)await rm(profile,{recursive:true,force:true});
}
