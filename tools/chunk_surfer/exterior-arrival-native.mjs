// One disposable Chromium/Metal lane. Declared placements investigate the
// real main runtime; key actions and recorded segments never assign motion.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';

const output=path.resolve(process.env.EXTERIOR_ARRIVAL_OUTPUT_DIR||'artifacts/exterior-arrival/native');
await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'exterior-arrival-'));
const report={kind:'exterior-arrival-production-check',started:new Date().toISOString(),
  qualification:'Technical operator and declared prerequisite placements. Ordinary physical keys after each placement. Chromium/Metal with the actual final game shader; not native WebView, uninterrupted fresh play or human acceptance.',
  operations:[],errors:[],resources:[],screenshots:[],movies:[]};
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const hash=b=>createHash('sha256').update(b).digest('hex');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
const page=await browser.newPage();await page.setCacheEnabled(false);await page.setViewport({width:1100,height:760,deviceScaleFactor:1});await page.bringToFront();
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('response',async r=>{const u=new URL(r.url());if(u.pathname==='/src/main.js'||/\/(?:exterior-frontages|exterior-stationers|ellery-exterior-roofline|conservatory-main-stair|conservatory-stair-walls|stop-listening|stop-listening-before|street-crowd-characters|street-crowd-props|vigil-characters-ruth-leila|vigil-characters-owen-denise|vigil-characters-malcolm-kit|booth-guard-props|outskirts-characters|bus-woman-character)\.glb$/.test(u.pathname)){
  const receipt={path:u.pathname,status:r.status(),fixed:r.headers()['x-source-drive-snapshot']||r.headers()['x-exterior-arrival-snapshot']};report.resources.push(receipt);
  if(u.pathname.endsWith('.glb'))try{const b=await r.buffer();receipt.bytes=b.length;receipt.sha256=hash(b);}catch(e){receipt.bodyError=String(e);}
}});
await page.evaluateOnNewDocument(()=>{localStorage.setItem('chunk-surfer:meta:v2',JSON.stringify({version:2,eulaAccepted:'2026-07-16',eulaAcceptedAt:Date.now()}));});
async function modules(){await page.evaluate(async()=>{
  const resource=p=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===p)?.name||p;
  window.__arrivalQA={FP:await import(resource('/src/world/floorplan.js')),S:await import(resource('/src/game/save.js')),
    G:await import(resource('/src/game/props.js')),
    R:await import(resource('/src/render/r3d.js')),P:await import(resource('/src/render/props3d.js'))};
});}
async function state(){return page.evaluate(()=>{
  const p=window.__probe,qa=window.__arrivalQA,pos=p?.pos(),q=p?.getInDriveTeaser?.(),v=q?.view;
  return{pos,physical:qa&&pos?qa.FP.logicalToPhysical(pos.x,pos.y):null,camera:qa?.R.r3dViewCamera(),
    scene:window.__scenes?.top()?.id||null,title:window.__scenes?.top()?.id==='world-title',
    tutorial:p?.tut(),focus:p?.interactionFocus(),flags:qa?.S.getSave().flags,light:p?.light?.(),
    door:p?.doors()?.find(d=>d.id==='dock-grey-exterior'),keys:p?.keys(),
    teaser:q?{active:q.active,pending:q.pending,consumed:q.consumed,phase:v?.phase,ready:v?.ready,controlsEnabled:v?.controlsEnabled,timeSec:v?.timeSec,speed:v?.driveState?.speed,cliffCommitted:v?.vehiclePose?.cliffCommitted}:null,
    shader:window.__chunkSurferPixelMesh?.status?.(),catalog:qa?.P.propMeshCatalog().filter(n=>n.startsWith('district_')),
    titleStatus:document.getElementById('title-a11y-status')?.textContent};
});}
async function ready(){await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id==='title'&&/START A NEW NIGHT|CONTINUE|RESUME THE NIGHT/i.test(document.getElementById('title-a11y-status')?.textContent||''),{timeout:150000});}
await page.goto((process.env.EXTERIOR_ARRIVAL_URL||'http://127.0.0.1:5348')+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded'});
await ready();await modules();
const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
write({ready:true,state:await state()});
async function fixture(q){return page.evaluate(async q=>{
  if(window.__arrivalFilm?.running)throw Error('No fixture mutation during movie');
  await __probe.testRun();__probe.clearDiagnosticScenes();__probe.frontEndGrade(false);__probe.hush();__probe.tutSkip();
  const{FP,S,R}=window.__arrivalQA,flags={...S.getSave().flags};
  for(const k of Object.keys(flags))if(k.startsWith('setup.')||k.startsWith('arrival.controls.')||['combat.trained','title.shown','opening.driveTeaser.pending','opening.driveTeaser.consumed','door.grey.retired','dock.departed','opening.vehicle.pending'].includes(k))delete flags[k];
  for(const k of['prologueDone','van.closed','opening.vehicle.exited','kit.fitted','bag.taken','map.taken'])flags[k]=true;
  if(q.progress)for(const k of['title.shown','opening.driveTeaser.consumed','setup.levels','setup.waypoint','combat.trained'])flags[k]=true;
  if(q.early){delete flags.prologueDone;delete flags['bag.taken'];}
  S.saveCommit({flags});
  const door=FP.doorState().find(d=>d.id==='dock-grey-exterior');FP.setDoorOpen(door.id,false);
  let point=q.point;
  if(q.world){
    point=FP.logicalAtPhysical(q.world[0]*2-.5,q.world[1]*2-.5,{floor:q.floor??q.world[2]??null});
    if(!point||point.x<0||point.y<0||FP.isSolid(point.x,point.y)||!window.__arrivalQA.G.propCanOccupy(point.x,point.y))
      throw Error('Requested physical inspection position is not a legal standing body; use an actual clear plan cell');
  }
  point=point||{x:door.cx-(q.offset??4),y:door.cy+(q.leafOffset??0)};
  if(q.cell)__probe.warpCell(...q.cell);else __probe.warpRuntime(point.x,point.y,1);
  __probe.lookAtWorld(q.yaw??Math.PI/2,q.pitch??0);R.r3dSnapCameraOnNextFrame?.();
  if(q.ears){
    __probe.setFlags(['practice.metronomes.quieted','practice.student.heard']);
    __probe.setTakes(['main_b3','the_tub','amplifications','soundnoisemusic','lux_nova'],false);
    __probe.setTakes(['main_b3'],true);__probe.stopListeningReset();__probe.stopListeningEnterHere();
  }
  __probe.setTorch(q.torch!==false);
  const p=__probe.pos();S.saveCommit({px:p.x,py:p.y,area:'conservatory',view:__probe.lookAngles(),doors:FP.saveDoorState(),flags:S.getSave().flags});
  return{point,world:q.world,zone:FP.zoneAt(p.x,p.y),qualification:'Declared inspection prerequisites and camera placement; ordinary input after placement. Not claimed as an earned arrival.'};
},q);}
function startFilm(){
  const map=document.querySelector('#map'),rect=map.getBoundingClientRect(),c=document.createElement('canvas');c.width=Math.round(rect.width);c.height=Math.round(rect.height);
  const ctx=c.getContext('2d'),stream=c.captureStream(30),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:1800000});
  const f=window.__arrivalFilm={running:true,start:performance.now(),chunks:[],samples:[],rec,stream};
  rec.ondataavailable=e=>{if(e.data.size)f.chunks.push(e.data);};
  function tick(now){if(!f.running)return;ctx.globalAlpha=1;ctx.filter='none';ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
    const host=map.getBoundingClientRect();const layers=[...map.querySelectorAll('canvas')].map((e,i)=>({e,i,s:getComputedStyle(e),r:e.getBoundingClientRect()}))
      .filter(x=>x.s.display!=='none'&&x.s.visibility!=='hidden'&&Number(x.s.opacity)>0&&x.r.width>0&&x.r.height>0)
      .sort((a,b)=>(Number(a.s.zIndex)||0)-(Number(b.s.zIndex)||0)||a.i-b.i);
    for(const x of layers){ctx.globalAlpha=Number(x.s.opacity);ctx.filter=x.s.filter;ctx.drawImage(x.e,x.r.x-host.x,x.r.y-host.y,x.r.width,x.r.height);}
    const q=__probe.getInDriveTeaser(),v=q.view,top=__scenes.top(),dialogue=top?.view?.();f.samples.push({ms:now-f.start,scene:top?.id,pos:__probe.pos(),phase:v?.phase,controlsEnabled:v?.controlsEnabled,speed:v?.driveState?.speed,
      people:__probe.exteriorPeople?.(),line:dialogue?.line?{who:dialogue.line.who,sourceId:dialogue.line.sourceId,text:dialogue.line.text}:null});
    requestAnimationFrame(tick);
  }rec.start(500);requestAnimationFrame(tick);return{width:c.width,height:c.height,mime:rec.mimeType};
}
async function endFilm(name){const d=await page.evaluate(async()=>{const f=window.__arrivalFilm;f.running=false;await new Promise(ok=>{f.rec.onstop=ok;f.rec.stop();});for(const t of f.stream.getTracks())t.stop();
  const b=new Uint8Array(await new Blob(f.chunks,{type:f.rec.mimeType}).arrayBuffer());let raw='';for(let i=0;i<b.length;i+=8192)raw+=String.fromCharCode(...b.subarray(i,i+8192));return{base64:btoa(raw),samples:f.samples,seconds:(performance.now()-f.start)/1000};});
  const b=Buffer.from(d.base64,'base64');delete d.base64;await fs.writeFile(path.join(output,name+'.webm'),b);await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(d,null,2));
  const receipt={file:name+'.webm',bytes:b.length,sha256:hash(b),seconds:d.seconds,trace:name+'.json'};report.movies.push(receipt);return receipt;}
try{for await(const line of createInterface({input:process.stdin,terminal:false})){if(!line.trim())continue;let q;try{q=JSON.parse(line);let result;
  switch(q.op){
    case 'fixture':result=await fixture(q);await wait(650);break;
    case 'state':result=await state();break;
    case 'actor':result=await page.evaluate(q=>{
      const p=window.__probe;
      if(q.id.startsWith('vigil-crowd-')||q.id.startsWith('district-'))return p.streetCrowdStand(q.id,{back:q.back??2.4});
      const prop=__arrivalQA.G.propById(q.id);if(!prop)throw Error('Unknown authored actor');
      const target=__arrivalQA.G.renderInstances({group:'ground',inscriptions:false}).find(v=>v.id===q.id);
      if(!target)throw Error('Actor not in ground group');
      for(const distance of[q.back??2.4,1.8,3.2])for(const offset of[0,.3,-.3,.7,-.7]){
        const yaw=target.yaw+offset,x=prop.rx+Math.sin(yaw)*distance/.5,y=prop.ry-Math.cos(yaw)*distance/.5;
        if(__arrivalQA.FP.isSolid(x,y)||!__arrivalQA.G.propCanOccupy(x,y))continue;
        p.clearDiagnosticScenes();p.warpRuntime(x,y,1);p.lookAtWorld(target.yaw+Math.PI,0);
        return{target,runtime:{x,y},fixture:true};
      }
      throw Error('No legal actor approach');
    },q);await wait(750);break;
    case 'aimActor':result=await page.evaluate(q=>{
      const actor=__arrivalQA.G.renderInstances({group:'ground',inscriptions:false}).find(v=>v.id===q.id),eye=__arrivalQA.R.r3dViewCamera().eye;
      if(!actor)throw Error('Unknown actor');const dx=actor.x-eye.x,dz=actor.z-eye.z;
      __probe.lookAtWorld(Math.atan2(dx,-dz),Math.atan2(actor.y+(q.height??1.35)-eye.y,Math.hypot(dx,dz)));
      return{actor,eye};
    },q);await wait(350);break;
    case 'people':result=await page.evaluate(()=>({crowd:__probe.streetCrowd(),characters:__arrivalQA.P.characterStats(),dialogue:__scenes.top()?.view?.(),performance:__probe.exteriorPeople?.()}));break;
    case 'look':await page.evaluate(q=>__probe.lookAtWorld(q.yaw,q.pitch||0),q);await wait(350);result=await state();break;
    case 'torch':result=await page.evaluate(q=>__probe.setTorch(q.on!==false),q);await wait(350);break;
    case 'effects':result=await page.evaluate(q=>__probe.apparitionEffects(q.mode||'full'),q);await wait(700);break;
    case 'pack':{
      const packs={stairBefore:'/artifacts/main-stair-tread-study/before/conservatory-main-stair.glb',stairFinal:'/assets/conservatory-main-stair.glb',earBefore:'/artifacts/exterior-arrival/stop-listening-before.glb',earFinal:'/assets/stop-listening.glb'};
      if(!packs[q.name])throw Error('Unknown comparison pack');
      result=await page.evaluate(async url=>{await __arrivalQA.P.addPropPack(url);return{loaded:url};},packs[q.name]);await wait(650);break;
    }
    case 'crowdPack':{
      const url=q.before?'/artifacts/exterior-people/before/assets/street-crowd-characters.glb':'/assets/street-crowd-characters.glb';
      result=await page.evaluate(async url=>{await __arrivalQA.P.addCharacterPack(url);return{loaded:url};},url);await wait(650);break;
    }
    case 'key':await page.keyboard.press(q.key);await wait(q.ms??150);result=await state();break;
    case 'hold':{const keys=q.keys||[q.key];for(const k of keys)await page.keyboard.down(k);try{await wait(Math.min(30000,q.ms||100));}finally{for(const k of keys)await page.keyboard.up(k);}result=await state();break;}
    case 'wait':await wait(Math.min(30000,q.ms||100));result=await state();break;
    case 'shot':{const file=q.name+'.png',b=await page.screenshot({path:path.join(output,file)});report.screenshots.push({file,bytes:b.length,sha256:hash(b),state:await state()});result={file};break;}
    case 'record':result=await page.evaluate(startFilm);break;
    case 'stop':result=await endFilm(q.name||'motion');break;
    case 'reload':await page.reload({waitUntil:'domcontentloaded'});await ready();await modules();result=await state();break;
    case 'close':result={closed:true};break;
    default:throw Error('Unknown operation');
  }
  report.operations.push({command:q,result,at:new Date().toISOString()});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));write({ok:true,result});if(q.op==='close')break;
 }catch(e){write({ok:false,error:String(e.stack||e)});report.errors.push(String(e));}}
}finally{report.ended=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();await fs.rm(profile,{recursive:true,force:true});}
process.exit(0);
