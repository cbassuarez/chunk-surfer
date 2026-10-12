import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import { CHURCH_BELFRY,CHURCH_TURRETS } from '../../src/data/st-brendans.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const lightingOnly=process.env.CATHEDRAL_LIGHTING_ONLY==='1';
const torchOnly=process.env.CATHEDRAL_TORCH_ONLY==='1';
const mouthOnly=process.env.CATHEDRAL_MOUTH_ONLY==='1'||torchOnly;
const out=resolve('artifacts/tower-route-implementation/live-descent',lightingOnly?'lighting-study':torchOnly?'torch-views':mouthOnly?'mouth-views':'.');
const url=process.env.CATHEDRAL_URL||'http://127.0.0.1:5299/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],captures=[],pendingImages=[],errors=[],artifactErrors=[],traces=[];
const point=(level,x,y)=>FP.toRuntimePoint({x:{ground:112,loft:140,belfry:170}[level]+x,y:{ground:125,loft:183,belfry:169}[level]+y});
const key=p=>`${Math.floor(p.x)},${Math.floor(p.y)}`;
let browser,profile,page,mode='normal',stage='boot',fatal=null;
function check(pass,name,detail){checks.push({pass:!!pass,mode,name,detail});console.log(pass?'PASS':'FAIL',mode,name,JSON.stringify(detail));}
function route(start,target){
  const a={x:Math.floor(start.x),y:Math.floor(start.y)},goal=key(target),queue=[a],seen=new Map([[key(a),null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(key(p)===goal){const path=[];let k=goal;while(seen.get(k)){const edge=seen.get(k);path.push(edge);k=key(edge.from);}return path.reverse();}
    for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const result=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set()});if(!result.ok)continue;
      const q={x:Math.floor(result.redirect?.x??p.x+dx),y:Math.floor(result.redirect?.y??p.y+dy)};
      if(seen.has(key(q))||!PROPS.propCanOccupy(q.x,q.y))continue;
      seen.set(key(q),{from:p,to:q,dx,dy});queue.push(q);
    }
  }throw new Error(`No compiled collision route ${key(start)} to ${goal}`);
}
async function state(){return page.evaluate(()=>({pos:window.__probe.pos(),floor:window.__probe.floorH(),look:window.__probe.lookAngles(),cathedral:window.__probe.cathedralState(),scene:window.__scenes?.top({includeOverlay:true})?.id,dialogue:window.__scenes?.top()?.view?.(),settings:window.__probe.settings(),lighting:window.__probe.r3dLighting?.(),torch:window.__probe.rec().light}));}
async function aim(yaw,pitch=0){await page.evaluate(v=>window.__probe.lookAtWorld(v.yaw,v.pitch),{yaw,pitch});await sleep(80);}
async function shot(name,pitch=null){
  if(pitch!=null){const s=await state(),physical=FP.logicalToPhysical(s.pos.x,s.pos.y),planYaw=FP.arcYawOffset(s.pos.x,s.pos.y,physical.x,physical.z);await aim((s.look?.yaw||0)+planYaw,pitch);}
  const data=await page.evaluate(()=>document.querySelector('canvas.r3d').toDataURL('image/png'));
  const path=join(out,`${mode}-${name}.webp`);
  const pixels=await sharp(Buffer.from(data.split(',')[1],'base64')).webp({quality:80}).toBuffer();
  const capture={mode,name,path,surface:'actual-r3d-canvas',...(await state())};
  // Keep the actual encoded canvas bytes in memory until Chrome/profilecleanup
  // releases its disk peak. Atomic writes preserve older evidence if diskfills.
  captures.push(capture);pendingImages.push({capture,pixels,stage});console.log('CAPTURE',mode,name);
}
async function torchDepthShot(name){
  const initial=!!(await state()).torch;
  if(!initial){await page.keyboard.press('f');await sleep(300);}
  try{
    if(!(await state()).torch)throw new Error(`Ordinary F did not raise the handlamp at ${name}`);
    await shot(`${name}-torch-on`);
  }finally{
    if(!initial){await page.keyboard.press('f');await sleep(180);}
  }
}
async function faceAuthored(level,x,y,pitch=0){
  // The bell trap deliberately has no floor cell. Derive the target from a
  // valid church reference so looking at it cannot return raw logical-island
  // coordinates and aim into a nearby wall instead.
  const s=await state(),p=FP.logicalToPhysical(s.pos.x,s.pos.y),a=point('ground',16,70),base=FP.logicalToPhysical(a.x,a.y);
  const q={x:base.x-1+(x-16)*2,z:base.z-1+(y-70)*2};await aim(Math.atan2(q.x-p.x,-(q.z-p.z)),pitch);
}
async function firstTreadView(owner,name){
  const run=FP.floorplan().stairRuns.find(r=>r.owner===owner);
  const q=FP.logicalToPhysical(...run.logical1),s=await state(),p=FP.logicalToPhysical(s.pos.x,s.pos.y);
  // Aim at the actual highest tread from the compiled helix, in addition to
  // the unchanged mouth bearing used for the pre/post beam comparison.
  await aim(Math.atan2(q.x-p.x,-(q.z-p.z)),-.62);
  await shot(name);await torchDepthShot(name);
}
async function practice(id){
  stage=`${mode}:practice-${id}`;await page.keyboard.press('e');await sleep(300);
  check((await state()).scene==='finale',`ordinary E opens ${id} apparatus`,(await state()).dialogue?.nodeId);
  for(let i=0;i<80;i++){
    const s=await state();if(s.scene!=='finale')break;
    await page.keyboard.press(s.dialogue?.pending?'1':'Enter');await sleep(220);
  }
  const s=await state();check(s.cathedral.finale.cathedral.lessons.includes(id),`${id} first response is saved`,s.cathedral.finale.cathedral.lessons);
  if(s.scene==='finale')throw new Error(`Practice ${id} did not close through ordinary dialogue input`);
}
async function walk(target,name){
  stage=`${mode}:${name}`;let s=await state(),path=route(s.pos,target);const visited=[],stairShots=new Set();
  for(let i=0;i<path.length;i++){
    let edge=path[i];s=await state();
    if(key(s.pos)!==key(edge.from)){
      const ahead=path.findIndex((e,j)=>j>=i&&key(e.from)===key(s.pos));
      if(ahead>=0){i=ahead;edge=path[i];}else{
        traces.push({mode,name,inputAdjustment:{from:s.pos,expected:edge.from}});
        const remaining=route(s.pos,target);if(!remaining.length)break;
        path=[...path.slice(0,i),...remaining];edge=path[i];
      }
    }
    const actual=await page.evaluate(e=>window.__probe.canStep(e.from.x,e.from.y,e.from.x+e.dx,e.from.y+e.dy),edge);
    if(!actual.ok)throw new Error(`Runtime rejects authored clear step ${name}:${i} ${JSON.stringify(actual)}`);
    const p=FP.logicalToPhysical(s.pos.x,s.pos.y),yaw=Math.atan2(edge.dx,-edge.dy)+FP.arcYawOffset(s.pos.x,s.pos.y,p.x,p.z);
    await aim(yaw,-.09);
    for(let retry=0;retry<4;retry++){
      await page.keyboard.press('w');await sleep(280);
      s=await state();if(key(s.pos)!==key(edge.from))break;
      await page.evaluate(()=>window.__probe.hush());await sleep(180);
    }
    visited.push({from:edge.from,to:s.pos,floor:s.floor,here:s.cathedral.here});
    if(key(s.pos)===key(edge.from))throw new Error(`Ordinary W blocked at ${name}:${i} ${JSON.stringify({edge,state:s})}`);
    const physical=FP.logicalToPhysical(s.pos.x,s.pos.y),run=physical.owner?.startsWith('cathedral-')?FP.floorplan().stairRuns.find(r=>r.owner===physical.owner):null;
    if(run&&Math.abs(s.floor-(run.fromH+run.toH)/2)<.2&&!stairShots.has(run.id)){
      stairShots.add(run.id);await shot(`stair-${run.owner}`,-.16);await torchDepthShot(`stair-${run.owner}`);
      check(s.cathedral.here?.x>7&&s.cathedral.here?.x<26&&s.cathedral.here?.y>55&&s.cathedral.here?.y<85,`${run.owner} guidance uses real church metres`,s.cathedral.here);
    }
  }
  const end=await state(),p=FP.logicalToPhysical(end.pos.x,end.pos.y),q=FP.logicalToPhysical(target.x,target.y);
  const close=Math.hypot(p.x-q.x,p.z-q.z)<=1.01&&Math.abs(end.floor-FP.floorAt(target.x,target.y))<.2;
  traces.push({mode,name,steps:visited.length,visited,final:end});check(close,`ordinary W reaches ${name}`,{target,actual:end.pos,floor:end.floor,physicalDistance:Math.hypot(p.x-q.x,p.z-q.z)*.5});
}
async function run(reduced){
  mode=reduced?'reduced':'normal';stage=`${mode}:boot`;const context=await browser.createBrowserContext();
  try{
    page=await context.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:.6});await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
    page.on('pageerror',e=>errors.push({mode,stage,error:String(e)}));page.on('console',m=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION/i.test(m.text()))errors.push({mode,stage,error:m.text()});});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__probe?.testRun,{timeout:90000});
    for(let i=0;i<24;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);if(i===0)console.log('BOOT SCENE',id);if(id==='title'||id==='world-title'||(i>1&&!id))break;if(id==='eula')await page.keyboard.press('Enter');await sleep(400);}
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();await window.__probe.cathedralPreset('entry');window.__probe.hush();});await sleep(900);
    await page.evaluate(v=>window.__probe.setReduceMotion(v),reduced);await sleep(250);
    if(await page.evaluate(()=>!!window.__probe.rec().light))await page.keyboard.press('f');
    const entry=await state();check(entry.cathedral.here?.level==='belfry'&&entry.floor>10,'diagnostic establishes only the real belfry start',entry.cathedral.here);
    await faceAuthored('belfry',16,73,.18);await shot('01-working-belfry');
    if(lightingOnly){
      for(const exposure of [2,4,6,8]){await page.evaluate(v=>window.__probe.captureExposure(v),exposure);await sleep(350);await shot(`exposure-${exposure}`);}
      await page.evaluate(()=>window.__probe.captureExposure(null));await page.keyboard.press('f');await sleep(350);await shot('torch-on');
      return;
    }
    if(!mouthOnly)for(const bay of CHURCH_BELFRY.serviceBays){await walk(point('belfry',bay.center.x,bay.center.y),`service-${bay.id}`);await faceAuthored('belfry',bay.center.x,bay.center.y-.45,-.12);await shot(`02-service-${bay.id}`);await practice(bay.id);}
    await walk(point('belfry',22,70),'belfry-south-mouth');await faceAuthored('belfry',21.8,72.4,-.62);await shot('03-south-mouth');await torchDepthShot('03-south-mouth');
    if(torchOnly)await firstTreadView('cathedral-south-upper','03-south-first-tread');
    await walk(point('loft',20,71),'south-spiral-to-loft');await faceAuthored('loft',16,72,-.1);await shot('04-loft-arrival');
    await walk(point('loft',16,72),'crossing-walk');await faceAuthored('ground',16,73,-.62);await shot('05-open-trap-crossing');
    await walk(point('loft',10,68),'north-triforium');await faceAuthored('loft',13,63,-.08);await shot('06-north-triforium');
    await walk(point('loft',11,62),'north-lower-landing');await faceAuthored('loft',10.2,63.4,-.62);await shot('07-north-lower-mouth');await torchDepthShot('07-north-lower-mouth');
    if(torchOnly)await firstTreadView('cathedral-north-lower','07-north-first-tread');
    await walk(point('ground',10,63),'north-spiral-to-ground');await faceAuthored('ground',16,62,-.04);await shot('08-west-nave');
    if(mouthOnly)return;
    await walk(point('ground',16,62),'west-nave');await faceAuthored('ground',16,73,.08);await shot('09-remembered-axis');
    await walk(point('ground',16,70),'crossing-approach');await faceAuthored('ground',16,73,.1);await shot('10-crossing-approach');
    const final=await state();
    check(final.cathedral.finale.stage==='cathedral','descent reaches the duel approach without preset skips',final.cathedral.finale.stage);
    check(final.cathedral.finale.cathedral.alarm===0,'protected service/descent route does not ring bells through the guard',final.cathedral.finale.cathedral.alarm);
  }catch(e){await shot('failure').catch(()=>{});throw e;}finally{await context.close();}
}
await mkdir(out,{recursive:true});
try{
  profile=await mkdtemp(join(tmpdir(),'chunk-surfer-cathedral-descent-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check']});
  await run(false);if(!lightingOnly&&(!mouthOnly||torchOnly))await run(true);
}catch(e){fatal=String(e.stack||e);errors.push({mode,stage,fatal});console.error(fatal);}
finally{if(browser)await browser.close();if(profile)await rm(profile,{recursive:true,force:true});
  for(const {capture,pixels,stage:imageStage} of pendingImages){
    const path=capture.path,temporary=`${path}.pending`;
    try{await writeFile(temporary,pixels);await rename(temporary,path);}catch(e){
      artifactErrors.push({mode:capture.mode,stage:imageStage,name:capture.name,path,error:String(e),bytes:pixels.length});
      console.error('ARTIFACT-WRITE-FAIL',capture.mode,capture.name,String(e));capture.path=null;await rm(temporary,{force:true}).catch(()=>{});
    }
  }
  await writeFile(join(out,'report.json'),JSON.stringify({generatedAt:new Date().toISOString(),url,scope:lightingOnly
  ?'Frozen production Chromium/Metal exposure study at one established belfry start. Correct physical aim derives from valid church reference; images are actual r3d canvas. Existing diagnostic exposure override is compared at2/4/6/8, then restored for torch-on. No renderer substitutions, module mocks or screenshot stand-ins. This is lighting evidence only.'
  :mouthOnly?`Frozen production Chromium/Metal targeted ${torchOnly?'normal/reduced physical handlamp':'mouth composition'} pass. One belfry start per motion mode, then only ordinary W presses through both real spiral descents. Explicit physical bearings face each actual turret opening. Actual F raises/restores the normal handlamp at both mouths and midstairs. No exposure overrides, renderer substitutions or warps after the start. Exact actual WebP canvas bytes are buffered in memory until browser/profilecleanup, then atomically saved; a null capture path is not visual evidence. Excludes lessons, combat and endings.`
  :'Frozen production Chromium/Metal. One God-menu belfry establishment per mode, then only actual W body movement through service bays, spiral mouths, crossing walk, north triforium, lower spiral and nave. Local compiled FP/props select a path; every runtime step is checked and ordinary input must traverse it. No warps after start, renderer substitutions, module mocks or screenshot stand-ins. Normal and reduced motion. Waypoint arrival accepts <=.505m on the same floor. Excludes earned route access and combat/ending acceptance. Screenshot filesystem errors are reported separately and do not cancel behavior checks; a null capture path is not visual evidence.',checks,captures,traces,errors,artifactErrors},null,2));}
process.exit(fatal||errors.length||checks.some(c=>!c.pass)?1:0);
