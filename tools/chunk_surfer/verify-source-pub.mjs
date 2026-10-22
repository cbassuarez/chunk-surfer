import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {suppressClientHmr} from './source-experience-study/prototype-session-contract.mjs';
import {SOURCE_PUB,sourcePubStations} from '../../src/data/source-pub.js';
import {sourcePubCanOccupy,focusedSourcePubStation} from '../../src/game/source-pub.js';

const base=process.env.PUB_REVIEW_URL||'http://127.0.0.1:5453';
const out=resolve(process.env.PUB_REVIEW_OUT||'artifacts/source-pub-undone-review/final');
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const report={startedAt:new Date().toISOString(),base,method:'Fresh disposable Chrome save. Declared last-light road fixture with completed ordinary favors; actual E enters the visible optional door. All five rounds use real-time keyboard W/E and diagnostic look only, with a production-collision BFS for reachable approaches. No local pose, service progress, stage or timer injection after the entrance fixture. Real pause and reload/Continue exercise both descents. Actual shared shader targets and camera height are captured. Browser evidence; native perception and human pacing remain separate.',checks:[],inputs:[],steps:[],captures:[],errors:[],assets:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser,page,recording,recordingStart=0,firstFall=false,secondFall=false,releaseHold=null;
process.once('SIGINT',()=>{if(releaseHold)releaseHold();else void browser?.close();});
function check(pass,name,detail){report.checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name);assert.ok(pass,name+(detail?' '+JSON.stringify(detail):''));}
async function state(){return page.evaluate(()=>({scene:window.__scenes.top({includeOverlay:true})?.id,...window.__probe.sourcePub.state(),hospitality:window.__probe.pubHospitality(),camera:window.__sourceReviewModules?.r3.r3dViewCamera?.()}));}
async function until(predicate,label,timeout=90000){const start=Date.now();while(Date.now()-start<timeout){const s=await state();if(predicate(s))return s;await sleep(40);}throw Error(label+' timed out '+JSON.stringify(await state()));}
async function key(key,wait=80){report.inputs.push({key,at:Date.now()});await page.keyboard.press(key);if(wait)await sleep(wait);}
async function acceptDisposableLicence(){
  // Exercise the ordinary consent action in this disposable browser before
  // any developer fixture can replace boot's scene stack.
  await page.waitForFunction(()=>window.__scenes?.has('eula')||window.__probe?.meta?.()?.eulaAccepted,{timeout:90000});
  await sleep(350);
  if(await page.evaluate(()=>window.__scenes.has('eula'))){
    const top=await page.evaluate(()=>({id:window.__scenes.top({includeOverlay:true})?.id,view:window.__scenes.top({includeOverlay:true})?.view?.()}));
    assert.equal(top.id,'eula','licence is handled before entering any live scene');if(top.view.selected!==0)await key('ArrowLeft');await key('Enter',150);
    check(!await page.evaluate(()=>window.__scenes.has('eula')),'disposable browser accepts its boot licence through normal Enter');
  }
}
async function look(yaw,pitch=-.04){await page.evaluate(({yaw,pitch})=>window.__probe.sourcePub.look(yaw,pitch),{yaw,pitch});}
async function modules(){await page.evaluate(async()=>{const entry=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render/r3d.js');if(!entry)throw Error('Live renderer resource URL was not retained');window.__sourceReviewModules={r3:await import(entry.name)};});}
async function capture(name){const s=await state(),files={};await page.screenshot({path:resolve(out,name+'.png')});
  for(const stage of['props','scene','vfd']){const data=await page.evaluate(stage=>window.__probe.sourceShoreCapture(stage),stage);assert.ok(data?.startsWith('data:image/png;base64,'),'actual '+stage+' target');files[stage]=resolve(out,name+'-'+stage+'.png');await writeFile(files[stage],Buffer.from(data.split(',')[1],'base64'));}
  const{data,info}=await sharp(files.props).ensureAlpha().raw().toBuffer({resolveWithObject:true});let covered=0;
  for(let i=3;i<data.length;i+=4)if(data[i]>0)covered++;
  const coverage=covered/(info.width*info.height);report.captures.push({name,files,state:s,propsCoverage:coverage});
  if(s.active)check(coverage>.12,'actual Source geometry covers the live prop target: '+name,{coverage});
  return s;
}
function aim(s,t){const dx=t.x-s.x,dz=t.z-s.z,d=Math.hypot(dx,dz);return{yaw:Math.atan2(dx,-dz),pitch:Math.max(-.8,Math.min(.75,Math.atan2(t.y-(SOURCE_PUB.floor+SOURCE_PUB.eyeHeight),d)))};}
function clearSegment(a,b,s){const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.06);for(let i=0;i<=n;i++){const p=i/Math.max(1,n);if(!sourcePubCanOccupy(a.x+(b.x-a.x)*p,a.z+(b.z-a.z)*p,s))return false;}return true;}
function pathTo(s,target){
  const step=.25,cols=Math.floor((16*sourceScale(s)-.8)/step)+1,rows=19,point=(gx,gz)=>({x:.4+gx*step,z:.4+gz*step}),index=(x,z)=>z*cols+x;
  const valid=new Map(),okay=(x,z)=>{const key=index(x,z);if(!valid.has(key)){const p=point(x,z);valid.set(key,sourcePubCanOccupy(p.x,p.z,s));}return valid.get(key);};
  let start=null,best=Infinity;for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){const p=point(x,z),d=Math.hypot(p.x-s.x,p.z-s.z);if(d<.6&&d<best&&okay(x,z)&&clearSegment(s,p,s)){start={x,z};best=d;}}
  assert.ok(start,'a reachable navigation sample surrounds the actual body');const queue=[start],previous=new Map([[index(start.x,start.z),null]]);let goal=null;
  for(let cursor=0;cursor<queue.length;cursor++){
    const cell=queue[cursor],p=point(cell.x,cell.z),d=Math.hypot(p.x-target.x,p.z-target.z);
    if(d>=.65&&d<=2.32&&focusedSourcePubStation({...s,...p,...aim(p,target)})?.id===target.id){goal=cell;break;}
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const x=cell.x+dx,z=cell.z+dz,key=index(x,z);if(x<0||x>=cols||z<0||z>=rows||previous.has(key)||!okay(x,z))continue;previous.set(key,cell);queue.push({x,z});}
  }
  assert.ok(goal,'a collision-valid approach exists for '+target.id+' '+JSON.stringify({stage:s.stage,task:s.task,layer:s.layer,target}));
  const reverse=[];for(let c=goal;c;c=previous.get(index(c.x,c.z)))reverse.push(point(c.x,c.z));const path=reverse.reverse(),compact=[];
  for(let i=0;i<path.length;i++)if(i===0||i===path.length-1||Math.abs((path[i].x-path[i-1].x)*(path[i+1]?.z-path[i].z)-(path[i].z-path[i-1].z)*(path[i+1]?.x-path[i].x))>.001)compact.push(path[i]);
  return compact;
}
function sourceScale(s){return SOURCE_PUB.rounds[Math.min(s.stage,SOURCE_PUB.rounds.length-1)].stretch;}
async function walkSegment(target){let unchanged=0,last=null;
  for(let n=0;n<1400;n++){
    const s=await state(),dx=target.x-s.x,dz=target.z-s.z,d=Math.hypot(dx,dz);if(d<.105)return;
    if(last&&Math.hypot(s.x-last.x,s.z-last.z)<.008)unchanged++;else unchanged=0;
    assert.ok(unchanged<12,'real WASD movement progresses toward '+JSON.stringify({target,at:{x:s.x,z:s.z},stage:s.stage,task:s.task}));last=s;
    await look(Math.atan2(dx,-dz));const speed=s.carried==='barrel'?SOURCE_PUB.barrelSpeed:SOURCE_PUB.walkSpeed;
    await page.keyboard.down('w');await sleep(Math.max(28,Math.min(350,(d-.06)/speed*780)));await page.keyboard.up('w');
  }throw Error('walking exceeded its real-time bound');
}
async function approach(id){const s=await state(),target=sourcePubStations(s).find(t=>t.id===id);assert.ok(target);const path=pathTo(s,target);
  for(const point of path)await walkSegment(point);
  const at=await state();await look(...Object.values(aim(at,target)));await sleep(50);const focused=await state();check(focused.focus?.id===id,'focused real '+id+' at round '+(s.stage+1),{x:focused.x,z:focused.z,stage:s.stage,task:s.task});return target;
}
async function installRecorder(){await page.evaluate(()=>{
  const r=window.__sourceFallReview={running:true,timeline:[],frames:[],seen:{},last:0};
  function tick(now){if(!r.running)return;const s=window.__probe.sourcePub.state();if(s.active){
    const camera=window.__sourceReviewModules.r3.r3dViewCamera();
    if(now-r.last>=75){r.last=now;r.timeline.push({at:now,stage:s.stage,task:s.task,layer:s.layer,x:s.x,z:s.z,fall:s.fall,itemFall:s.itemFall,camera});}
    for(const[field,label]of[['itemFall','item'],['fall','player']])if(s[field]){const f=s[field],p=f.elapsed/f.duration;
      for(const threshold of[.15,.50,.85]){const name=label+'-layer-'+f.fromLayer+'-'+Math.round(threshold*100);if(p>=threshold&&!r.seen[name]){r.seen[name]=true;r.frames.push({name,at:now,state:{stage:s.stage,task:s.task,layer:s.layer,fall:s.fall,itemFall:s.itemFall,camera},images:Object.fromEntries(['scene','vfd'].map(stage=>[stage,window.__probe.sourceShoreCapture(stage)]))});}}
    }
  }requestAnimationFrame(tick);}requestAnimationFrame(tick);
});}
async function collectRecorder(label){const r=await page.evaluate(()=>{const r=window.__sourceFallReview;if(!r)return null;r.running=false;return r;});if(!r)return;
  for(const frame of r.frames){const files={};for(const[stage,data]of Object.entries(frame.images)){if(!data)continue;files[stage]=resolve(out,label+'-'+frame.name+'-'+stage+'.png');await writeFile(files[stage],Buffer.from(data.split(',')[1],'base64'));}delete frame.images;report.captures.push({...frame,files});}
  report.steps.push({label,timeline:r.timeline});
}
async function stopVideo(){if(!recording)return;await recording.stop();recording=null;const bytes=await readFile(report.video.file);report.video.bytes=bytes.length;report.video.sha256=createHash('sha256').update(bytes).digest('hex');}
async function doAction(){const before=await state(),target=sourcePubStations(before).find(t=>t.id!=='exit');assert.ok(target);await approach(target.id);
  if(before.stage===2&&target.dropItem&&!recording){report.video={file:resolve(out,'first-items-and-descent.webm'),method:'Continuous silent capture of the real final shader from before the tray drop through the chosen first descent; no reconstructed frames.'};recording=await page.screencast({path:report.video.file,fps:30,ffmpegPath:'/opt/homebrew/bin/ffmpeg'});recordingStart=Date.now();}
  await key('e',40);
  if(target.descend){
    await until(s=>!!s.fall,'chosen fall begins');await sleep(260);await key('Escape',60);await until(s=>s.scene==='pause','normal pause during fall');
    const stopped=await state();await sleep(350);const held=await state();check(!!held.fall&&held.fall.elapsed===stopped.fall.elapsed,'pause freezes fall '+before.layer);check(held.hospitality.sourceAudio.voices===0,'pause cuts the cold room bus');
    if(!firstFall){firstFall=true;await capture('03-first-descent-paused');await key('Escape',30);}
    else{
      secondFall=true;const saved=stopped.saved;await collectRecorder('first-session');report.reloadCheckpoint=saved;
      await page.reload({waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__probe?.sourcePub&&window.__scenes?.top()?.id,{timeout:90000});await acceptDisposableLicence();await modules();
      const reloaded=await state();check(JSON.stringify(reloaded.saved.fall)===JSON.stringify(saved.fall),'reload retains the exact paused fall before Continue');
      // Boot calibration is outside this disposable browser route fixture.
      // Remove it before normal Continue so its reconnect plate cannot remain
      // under the resumed Source HUD. The exact checkpoint above is unchanged.
      await page.evaluate(()=>{window.__probe.clearDiagnosticScenes();window.__chunkSurferDesktopMenu.dispatch('continue');});await page.bringToFront();await until(s=>s.ready&&s.active,'Continue resumes the existing Source leg');await installRecorder();
    }
    const landed=await until(s=>!s.fall&&s.layer===before.layer+1,'finite fall lands',10000);check(sourcePubCanOccupy(landed.x,landed.z,landed),'landing is a real supported floor');
    await capture(before.layer===0?'04-first-lower-lyric':'06-second-lower-lyric');
    const x=landed.x,z=landed.z;await page.keyboard.down('d');await sleep(140);await page.keyboard.up('d');const moved=await state();check(Math.hypot(moved.x-x,moved.z-z)>.08,'normal movement releases after fall '+before.layer);
    if(recording){await sleep(Math.max(0,8800-(Date.now()-recordingStart)));await stopVideo();}
  }else if(target.dropItem){await sleep(1200);check(!(await state()).itemFall&&!!(await state()).fallenItem,'real object drops through to the next room');}
  else await sleep(240);
  const after=await state();report.steps.push({action:target.id,before:{stage:before.stage,task:before.task,layer:before.layer},after:{stage:after.stage,task:after.task,layer:after.layer,carried:after.carried}});
  check(after.stage>before.stage||after.task>before.task,'chosen service advances exactly one action');
}
try{
  await mkdir(out,{recursive:true});report.source=await Promise.all(['src/main.js','src/game/source-pub.js','src/data/source-pub.js','src/render/source-pub-renderer.js','src/audio/source-pub.js','public/assets/source-pub-scenography.glb'].map(async file=>({file,sha256:createHash('sha256').update(await readFile(resolve(file))).digest('hex')})));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.evaluateOnNewDocument(()=>performance.setResourceTimingBufferSize(20000));await page.evaluateOnNewDocument(suppressClientHmr);page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('response',res=>{if(/source-pub-scenography.*glb/.test(res.url()))report.assets.push({url:res.url(),status:res.status()});});
  await page.goto(base+'/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.__probe?.sourcePub&&window.__scenes?.top()?.id,{timeout:90000});
  await acceptDisposableLicence();await modules();await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.clearDiagnosticScenes();await window.__probe.sourcePub.entranceFixture();});await page.bringToFront();check(!!await page.evaluate(()=>window.__probe.sourcePub.focused()),'actual optional road doorway is focused');await key('e');
  await until(s=>s.ready&&s.rendering?.sceneryResident||s.error,'Source renderer residency');await sleep(600);const initial=await state();check(initial.ready&&initial.rendering.sceneryResident,'isolated cold Source pack initializes and stays resident');report.returnPose=initial.returnPose;report.walkStartedAt=new Date().toISOString();
  check(!initial.hospitality.active&&!initial.hospitality.audio.active,'ordinary pub audio is absent from Source');await capture('01-cold-entry');
  if(process.env.PUB_REVIEW_ENTRY_HOLD==='1'){console.log('ENTRY_HOLD '+browser.wsEndpoint());await new Promise(resolve=>{releaseHold=resolve;});throw Error('Diagnostic entry hold ended');}
  await installRecorder();
  let actions=0,stage=0;while((await state()).stage<SOURCE_PUB.rounds.length){await doAction();actions++;const s=await state();if(s.stage>stage){stage=s.stage;await look(-Math.PI/2,-.08);await capture('round-'+stage+'-returned');
    const dx=9.4*sourceScale(s)-s.x,dz=6.08-s.z;await look(Math.atan2(dx,-dz),.52);await capture('round-'+stage+'-cask-towers');console.log('ROUND '+stage+' / '+SOURCE_PUB.rounds.length);}}
  report.walkSeconds=(Date.now()-Date.parse(report.walkStartedAt))/1000;check(actions===SOURCE_PUB.rounds.reduce((n,r)=>n+r.tasks.length,0),'all28 chosen actions complete all five rounds');check(firstFall&&secondFall,'both real descents are exercised');await collectRecorder('continued-session');
  const timeline=report.steps.flatMap(step=>step.timeline||[]);for(const layer of[0,1]){const samples=timeline.filter(t=>t.fall?.fromLayer===layer),ys=samples.map(t=>t.camera?.eye?.y).filter(Number.isFinite);check(ys.length>3&&Math.max(...ys)-Math.min(...ys)>5.5,'actual rendered camera descends between strata '+layer,{min:Math.min(...ys),max:Math.max(...ys),samples:ys.length});}
  await approach('exit');await key('e');check((await state()).exitPrompt,'final exit requires explicit confirmation');await key('e',450);const returned=await state();check(!returned.active&&returned.saved.completed,'optional Source leg completes at its real exit');
  check(returned.current.x===initial.returnPose.x&&returned.current.y===initial.returnPose.y,'exact Source road position is restored');check(Math.abs(returned.current.look.yaw-initial.returnPose.yaw)<.00001&&Math.abs(returned.current.look.pitch-initial.returnPose.pitch)<.00001,'exact Source gaze is restored');check(!returned.hospitality.sourceAudio.active&&returned.hospitality.sourceAudio.voices===0,'leaving clears all cold-room tails');await capture('08-road-returned');
  check(report.errors.length===0,'no JavaScript errors in the full optional leg',report.errors);report.finishedAt=new Date().toISOString();
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;if(page)await capture('failure').catch(()=>{});}
finally{await stopVideo().catch(e=>{report.videoError=String(e);});if(page)await collectRecorder('interrupted-session').catch(()=>{});if(browser)await browser.close();report.browserClosed=true;await mkdir(out,{recursive:true});await writeFile(resolve(out,'live-report.json'),JSON.stringify(report,null,2));}
