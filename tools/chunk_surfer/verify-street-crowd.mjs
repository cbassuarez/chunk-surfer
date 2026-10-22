// Disposable browser review of the ordinary exterior and the real inversion
// presenter. Placement/look fixtures are recorded; conversations use normal E
// and dialogue keys. A browser capture does not establish native calibration.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {suppressClientHmr} from './source-experience-study/prototype-session-contract.mjs';

const base=process.env.STREET_CROWD_REVIEW_URL||'http://127.0.0.1:5450';
const out=resolve(process.env.STREET_CROWD_REVIEW_OUT||'artifacts/street-crowd-review');
const mode=process.env.STREET_CROWD_REVIEW_MODE||'all',selectedIds=(process.env.STREET_CROWD_REVIEW_IDS||'').split(',').filter(Boolean);
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'review stays on loopback');
assert.ok(['all','inspect'].includes(mode),'review mode is all or inspect');
const report={startedAt:new Date().toISOString(),base,mode,selectedIds,
  method:'Fresh disposable Chrome save; completed opening fixture and diagnostic placement/look at authored exterior actors. Ordinary F torch lights the inspection (unless explicitly disabled); ordinary E and dialogue keys prove local interactions. Real inversion ending presenter exercises demolition worker reuse. Shared game WebGL props/scene/final images are retained. Browser evidence, with lens availability reported; native calibration and human visual acceptance remain separate.',
  checks:[],fixtures:[],inputs:[],captures:[],errors:[],consoleErrors:[],requests:[],failedResources:[]};
let browser,page;
const responseTasks=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(pass,name,detail=null){report.checks.push({pass:!!pass,name,detail});console.log(pass?'PASS':'FAIL',name);assert.ok(pass,name+(detail?' '+JSON.stringify(detail):''));}
async function state(){return page.evaluate(()=>{
  const p=window.__probe,top=window.__scenes?.top({includeOverlay:true}),view=top?.view?.(),modules=window.__streetCrowdReviewModules;
  const characters=modules?.p3.characterStats();
  const crowd=p?.streetCrowd?.(),props=p?.props?.();
  return{scene:top?.id,position:p?.pos?.(),look:p?.lookAngles?.(),camera:modules?.r3.r3dViewCamera?.(),settings:p?.settings?.(),torch:p?.torch?.(),
    crowd:crowd?{...crowd,characterStats:undefined}:null,
    props:props?{pack:props.pack,instances:props.instances?.filter(a=>/^(district-mews-neighbor|district-pub-driver|vigil-crowd-|vigil-part-)/.test(a.id||'')),renderedIds:props.renderedIds?.filter(id=>/^(district-mews-neighbor|district-pub-driver|vigil-crowd-|vigil-part-)/.test(id))}:null,focused:p?.pickProp?.()?.id,
    dialogue:view?{nodeId:view.nodeId,typing:view.typing,text:view.line?.text||'',pending:view.pending?{index:view.pending.index,options:view.pending.options.map(o=>({id:o.id,sourceId:o.sourceId,text:o.text,goto:o.goto}))}:null}:null,
    characters:characters?{loaded:characters.loaded,error:characters.error,frame:characters.frame,poseErrors:characters.poseErrors,packs:characters.packs.filter(p=>/street-crowd/.test(p.url)),meshes:characters.meshes.filter(m=>m.startsWith('district_')||m.startsWith('vigil_crowd_')),assets:characters.assets.filter(m=>m.mesh.startsWith('district_')||m.mesh.startsWith('vigil_crowd_')),poses:characters.poses.filter(p=>/^(district-mews-neighbor|district-pub-driver|vigil-crowd-|ending-demolition-worker-)/.test(p.id||''))}:null,
    lens:window.__chunkSurferPixelMesh?.lookStatus?.()||null,ending:p?.endingCutscene?.()||null};
});}
async function key(key){report.inputs.push({key,at:Date.now()});await page.keyboard.press(key);await sleep(170);}
async function capture(name){
  const snapshot=await state(),file=resolve(out,name+'.png');await page.screenshot({path:file});const stages={};
  for(const stage of['props','scene','vfd']){
    const data=await page.evaluate(stage=>window.__streetCrowdReviewModules?.r3.r3dCaptureStageCanvas?.(stage)?.toDataURL('image/png'),stage);
    if(data?.startsWith('data:image/png;base64,')){const path=resolve(out,name+'-'+stage+'.png');await writeFile(path,Buffer.from(data.split(',')[1],'base64'));stages[stage]=path;}
  }
  report.captures.push({name,file,stages,state:snapshot});console.log('CAPTURE',name);return snapshot;
}
function actors(snapshot){return snapshot.crowd?.actors||snapshot.crowd?.targets||[];}
function actorMesh(actor){return actor.rendered?.mesh||actor.instance?.mesh||actor.mesh;}
async function aimActor(id,{height=1.15}={}){
  const s=await state(),actor=actors(s).find(a=>a.id===id),eye=s.camera?.eye||s.crowd?.listener;
  assert.ok(actor&&eye,'live actor and camera positions available');
  const targetHeight=actor.design?.posture==='seated'?.78:height,dx=actor.x-eye.x,dz=actor.z-eye.z;
  await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw:Math.atan2(dx,-dz),pitch:Math.atan2(actor.y+targetHeight-eye.y,Math.hypot(dx,dz))});await sleep(150);
}
async function stand(id,{back=2.4,height=1.15}={}){
  const fixture=await page.evaluate(({id,back})=>window.__probe.streetCrowdStand(id,{back}),{id,back});
  check(!!fixture,'placement fixture exists for '+id,fixture);report.fixtures.push({id,back,result:fixture});await sleep(450);await aimActor(id,{height});
}
async function orbit(id,offset,back=2.4){
  const fixture=await page.evaluate(async({id,offset,back})=>{
    const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;
    const fp=await import(resource('/src/world/floorplan.js')),props=await import(resource('/src/game/props.js'));
    const crowd=window.__probe.streetCrowd(),actor=crowd.actors.find(a=>a.id===id),position=window.__probe.pos(),angle=actor.yaw+offset;
    const world={x:actor.x+Math.sin(angle)*back,z:actor.z-Math.cos(angle)*back};
    const runtime={x:position.x+(world.x-crowd.listener.x)*2,y:position.y+(world.z-crowd.listener.z)*2};
    if(fp.isSolid(runtime.x,runtime.y)||!props.propCanOccupy(runtime.x,runtime.y))return null;
    window.__probe.warpRuntime(runtime.x,runtime.y);return{id,world,runtime,offset,fixture:true};
  },{id,offset,back});
  if(!fixture)return false;report.fixtures.push(fixture);await sleep(450);await aimActor(id);return true;
}
async function closeDialogue(){
  for(let n=0;n<80;n++){
    const s=await state(),v=s.dialogue;if(!v)return;
    if(v.pending){
      const choices=v.pending.options,leave=choices.findIndex(c=>!c.goto||/leave|thanks|back to|let him|leave him|good night|step away/i.test(c.text));
      assert.ok(leave>=0,'existing local dialogue offers a passive exit');
      for(let i=0;i<(leave-v.pending.index+choices.length)%choices.length;i++)await key('ArrowDown');await key('Enter');
    }else await key('Space');
  }
  throw Error('local dialogue did not close');
}
async function localInteraction(id){
  await stand(id,{back:3.2});await sleep(1600);await aimActor(id,{height:1.4});await sleep(1600);const before=await state();check(before.focused===id,'ordinary focus retains '+id,before.focused);
  await key('e');const opened=await state();check(opened.scene?.startsWith('exterior-lore:')||!!opened.dialogue,'E opens established lore for '+id,{scene:opened.scene,text:opened.dialogue?.text});
  await capture(id+'-conversation');await closeDialogue();check(!(await state()).dialogue,'local conversation closes for '+id);
  await key('e');check(!!(await state()).dialogue,'the same actor remains repeatably talkable '+id);await closeDialogue();
}

try{
  await mkdir(out,{recursive:true});
  browser=await puppeteer.launch({executablePath:process.env.STREET_CROWD_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.evaluateOnNewDocument(suppressClientHmr);
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});page.on('response',r=>{
    if(/street-crowd/.test(r.url())){
      const entry={url:r.url(),status:r.status()};report.requests.push(entry);
      if(/\.glb(?:\?|$)/.test(r.url()))responseTasks.push(r.buffer().then(bytes=>{entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');}).catch(error=>{entry.hashError=String(error);}));
    }
    if(r.status()>=400)report.failedResources.push({url:r.url(),status:r.status()});
  });
  const url=new URL(base);for(const[k,v]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0'}))url.searchParams.set(k,v);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__probe?.streetCrowd&&window.__scenes?.top()?.id,{timeout:90000});
  await page.evaluate(async()=>{
    const p=window.__probe;await p.testRun();p.tutSkip();p.setFlags(['prologueDone','van.closed','opening.vehicle.exited','kit.fitted','bag.taken','setup.levels','combat.trained','setup.waypoint','setup.case.arrived'],['opening.vehicle.pending']);p.clearDiagnosticScenes?.();p.frontEndGrade?.(false);p.hush?.();
    const resource=path=>performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path)?.name||path;
    window.__streetCrowdReviewModules={p3:await import(resource('/src/render/props3d.js')),r3:await import(resource('/src/render/r3d.js'))};
  });
  report.fixtures.push({reason:'standard completed opening/setup controls; no lore choices or ending progression seeded'});await page.bringToFront();await sleep(350);await page.evaluate(()=>window.__probe.clearDiagnosticScenes?.());
  await page.waitForFunction(()=>window.__probe.streetCrowd().ready&&window.__streetCrowdReviewModules?.p3.characterStats().packs.some(p=>/street-crowd-characters/.test(p.url))&&window.__streetCrowdReviewModules.p3.characterStats().meshes.filter(m=>m.startsWith('district_')||m.startsWith('vigil_crowd_')).length===20,{timeout:90000});
  if(process.env.STREET_CROWD_TORCH!=='0'){await key('f');check((await state()).torch?.on,'ordinary F torch illuminates the asset inspection');}
  await stand('district-mews-neighbor');const initial=await state(),inventory=actors(initial);
  check(inventory.length===20&&new Set(inventory.map(a=>a.id)).size===20,'twenty stable target identities exposed',inventory.map(a=>({id:a.id,mesh:actorMesh(a)})));
  check(initial.characters.meshes.length===20,'twenty distinct exterior skins loaded',initial.characters.meshes);
  check(initial.characters.assets.every(a=>a.joints===54),'all twenty targets use the shared anatomical rigs',initial.characters.assets.map(a=>({mesh:a.mesh,joints:a.joints})));
  check(!initial.characters.poseErrors.length,'shared renderer reports no skin pose errors',initial.characters.poseErrors);
  // A close view of each actor catches a missing accessory or collapsed face
  // that a far crowd panorama and a loaded-mesh count cannot establish.
  for(const actor of inventory.filter(actor=>!selectedIds.length||selectedIds.includes(actor.id))){
    // These two stand close to the original street/building shell. A wider
    // front fixture crosses that shell even though its raster cell is free.
    const options=actor.id==='vigil-crowd-knot-2'?{back:1.1,height:1.38}:actor.id==='district-pub-driver'?{back:3.2}:{};
    await stand(actor.id,options);const s=await capture(actor.id);check(s.characters.poses.some(p=>p.id===actor.id),'actual world pose submitted for '+actor.id);
    if(process.env.STREET_CROWD_REVIEW_ORBIT==='1')for(const[offset,label]of[[Math.PI/2,'side-a'],[-Math.PI/2,'side-b'],[Math.PI,'back']])if(await orbit(actor.id,offset))await capture(actor.id+'-'+label);
  }
  if(mode==='all'){
  await localInteraction('district-mews-neighbor');await localInteraction('district-pub-driver');
  await page.evaluate(()=>window.__probe.setReduceMotion(true));await stand('vigil-crowd-east-4');
  const reduced=await capture('reduced-motion-seated'),reducedIds=new Set(reduced.characters.poses.map(p=>p.id));
  check(inventory.every(a=>reducedIds.has(a.id)),'reduced motion retains all twenty skinned anatomical bodies');
  check(!reduced.characters.poseErrors.length,'reduced motion does not fall back to bind poses',reduced.characters.poseErrors);
  await page.evaluate(()=>window.__probe.setReduceMotion(false));
  report.fixtures.push({reason:'God review invokes the existing real inversion ending presenter; route eligibility is outside this asset review'});
  await page.evaluate(()=>window.__probe.reviewEnding('inversion'));
  // The score is tied to presented lines. A timer or direct stage assignment
  // would skip that contract, so advance the existing transcript normally.
  for(let n=0;n<160;n++){
    const current=await state();if(current.characters.poses.filter(p=>p.id?.startsWith('ending-demolition-worker-')).length===3)break;
    await key(current.dialogue?.pending?'Enter':'Space');
  }
  const ending=await capture('inversion-demolition-workers'),workers=ending.characters.poses.filter(p=>p.id?.startsWith('ending-demolition-worker-'));
  check(workers.length===3,'all three ending demolition workers submit anatomical poses',workers);
  check(workers.every(p=>p.mesh==='district_pub_driver'),'ending workers reuse the pub driver skin through the same renderer',workers.map(p=>p.mesh));
  }
  check(report.errors.length===0,'no JavaScript runtime errors during review',report.errors);
  check(report.requests.every(r=>r.status===200||r.status===304),'all requested crowd packs load successfully',report.requests);
  report.finishedAt=new Date().toISOString();
}catch(error){report.failure=String(error.stack||error);console.error(error);process.exitCode=1;if(page)await capture('failure').catch(()=>{});}
finally{
  await Promise.allSettled(responseTasks);
  if(browser)try{await browser.close();report.browserClosed=true;}catch(error){report.browserCloseError=String(error);process.exitCode=1;}
  await mkdir(out,{recursive:true});await writeFile(resolve(out,'live-report.json'),JSON.stringify(report,null,2));
}
