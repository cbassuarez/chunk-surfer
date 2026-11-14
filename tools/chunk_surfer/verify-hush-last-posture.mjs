// Isolated real-game presentation proof. Developer checkpoints are explicit;
// this is neither an earned playthrough nor unfamiliar-player validation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {startRouteFilm,stopRouteFilm} from './route-verification-film.mjs';

const out=path.resolve(process.env.HUSH_POSTURE_OUT||'artifacts/hush-last-posture/game');
const scopes=new Set((process.env.HUSH_POSTURE_SCOPES||'source,ordinary,battle,desktop').split(','));
const battles=(process.env.HUSH_POSTURE_BATTLES||'natatorium,source').split(',');
const port=Number(process.env.HUSH_POSTURE_PORT||5602),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(process.env.HUSH_POSTURE_GPU_LEASE!=='1')throw Error('A coordinated GPU lease is required.');
await fs.mkdir(out,{recursive:true});
const files=['src/render/character-asset.js','src/render/hush-battle-body.js','src/render/encounter-view.js','src/render/combat-view.js','src/data/generated/hush-last-posture-support.js','src/main.js','src/game/hush-density-performance.js','src/game/pressure-performance.js','src/game/hush-clearance.js',
  'src/render/pressure-volume.js','src/render/hush-cosmos.js','src/render/pressure-composite.js','src/render/pixel-mesh/shader.js',
  'src/render/pixel-mesh/transparent.js','src/render/hush-stage-backplane.js','src/render/source-desktop-view.js','src/render/r3d.js','public/assets/hush-density.glb'];
const report={startedAt:new Date().toISOString(),scope:'Actual running game WebGL/Metal, real replacement GLB and final dither. Source first-contact checkpoint, ordinary staged Presence/Last Exposure and developer battle opening. Guided look and staging disclosed. Desktop presenter fixture is separate component evidence. Not earned progression, native detached windows or human acceptance.',
  scopes:[...scopes],checks:[],errors:[],captures:[],films:[],sources:Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(f))])))};
let browser,server,page,profile,context,film=false;
const check=(name,pass,detail=null)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name);assert.ok(pass,`${name}: ${JSON.stringify(detail)}`);};
async function snapshot(){return page.evaluate(()=>({scene:window.__scenes.top()?.id||null,position:window.__probe.pos(),body:window.__probe.hushBody(),source:window.__probe.chunkSurf(),
  look:window.__probe.lookAngles(),recording:window.__probe.rec(),presence:window.__probe.presence()}));}
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});report.captures.push({name,file,state:await snapshot()});}
async function aim(){return page.evaluate(async()=>{
  const p=window.__probe,body=p.hushBody().body,pos=p.pos(),FP=await import('/src/world/floorplan.js');
  const a=p.whereAmI()?.source?{x:pos.x,z:pos.y}:FP.logicalToPhysical(pos.x,pos.y);
  p.lookAtWorld(Math.atan2(body.x-a.x,-(body.y-a.z)),0);
});}
async function pixelProof(name){
 const result=await page.evaluate(async()=>{
  const names=['pressure-material','pressure-identity','pressure-geometry','vfd'],stages={};
  for(const name of names)stages[name]=window.__probe.sourceShoreCapture(name);
  const rows={};for(const[name,url]of Object.entries(stages)){
   if(!url)throw Error('Missing actual render stage: '+name);const image=new Image();image.src=url;await image.decode();
   const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   rows[name]={width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};
  }
  const mask=rows['pressure-geometry'],identity=rows['pressure-identity'],vfd=rows.vfd;
  if([identity,vfd].some(r=>r.width!==mask.width||r.height!==mask.height))throw Error('Diagnostic stages have incompatible pixel frames');
  let samples=0,dark=0,colored=0,marks=0,signal=0;
  for(let i=0;i<mask.data.length;i+=4){
   if(mask.data[i+3]<220||!(Math.floor(mask.data[i+2]/64)%2)||identity.data[i+3]<220)continue;
   samples++;const rgb=Array.from(vfd.data.slice(i,i+3)),hi=Math.max(...rgb),lo=Math.min(...rgb);
   if(hi<35)dark++;if(hi-lo>4)colored++;if(hi>=35)marks++;if(identity.data[i+2]>0)signal++;
  }
  return{stages,pixels:{width:mask.width,height:mask.height,samples,darkFraction:dark/Math.max(1,samples),coloredFraction:colored/Math.max(1,samples),acquiredMarks:marks,transportedStarSamples:signal}};
 });
 for(const[stage,url]of Object.entries(result.stages))await fs.writeFile(path.join(out,name+'-'+stage+'.png'),Buffer.from(url.split(',')[1],'base64'));
 (report.pixels||=[]).push({name,...result.pixels});
 check(name+': actual depth-winning body reaches shared acquisition',result.pixels.samples>100,result.pixels);
 check(name+': acquired interior is predominantly black and neutral',result.pixels.darkFraction>.94&&result.pixels.coloredFraction<.01,result.pixels);
}
async function stage(kind){
 await page.evaluate(async kind=>{
  const p=window.__probe;await p.testRun();p.tutSkip();p.setFlags(['setup.levels','combat.trained','setup.waypoint','kit.fitted','title.shown','prologueDone','opening.driveTeaser.consumed']);
  const {SETUP_HANDOFF}=await import('/src/game/setup-handoff.js');p.setFlags([SETUP_HANDOFF.closed,SETUP_HANDOFF.arrived,SETUP_HANDOFF.skillsDone,SETUP_HANDOFF.skillsClosed]);
  p.godRow('field-ready');
  if(kind==='source')p.sourcePreset('first-contact');
  else{
   p.setTakes(['main_b3'],true);
   if(!await p.godWarpHook('basement-corridor'))throw Error('Basement-corridor test route unavailable');
   p.setPower('sp01',false);p.setTorchBattery(1);p.setTorch(true);
   const at=p.pos(),presence=await import('/src/game/presence.js');
   let chosen=null;
   for(let i=0;i<16&&!chosen;i++){
    const a=i*Math.PI/8;let from=at;
    for(let n=1;n<=12;n++){
     const to={x:at.x+Math.sin(a)*n*.5,y:at.y-Math.cos(a)*n*.5};
     if(!p.canStep(from.x,from.y,to.x,to.y)?.ok)break;
     if(n===12)chosen=to;from=to;
    }
   }
   if(!chosen)throw Error('No genuinely walkable ordinary staging ray');
   if(!presence.spawnAtCell(chosen.x,chosen.y,{sector:'last-posture-review',gaitSeed:4417}))throw Error('Presence staging rejected');
  }
  (await import('/src/game/speech.js')).clearSpeech?.();
 },kind);
 await page.waitForFunction(()=>window.__probe.hushBody()?.ready&&window.__probe.hushBody()?.body,{timeout:20000});
 await aim();await sleep(500);
 await page.waitForFunction(()=>window.__probe.hushBody().geometry.draws>0,{timeout:20000});
 const s=await snapshot();check(kind+': current model is loaded without skin or shader faults',s.body.ready&&!s.body.error&&!s.body.character.poseErrors?.length,{asset:s.body.asset,revision:s.body.revision,character:s.body.character});
 await shot(kind+'-held');await pixelProof(kind);await measure(kind);
 await startRouteFilm(page);film=true;
 await page.keyboard.down('w');await sleep(1300);await page.keyboard.up('w');await sleep(1200);
 await page.keyboard.down('s');await sleep(1000);await page.keyboard.up('s');await sleep(1200);
 report.films.push({kind,...await stopRouteFilm(page,path.join(out,kind+'-walk-stop.webm'))});film=false;
 await shot(kind+'-after-movement');
 if(kind==='ordinary'){
  const state=await snapshot();
  check('ordinary: keyboard travel advances the real player',state.position.x!==s.position.x||state.position.y!==s.position.y,{before:s.position,after:state.position});
  check('ordinary: the tracked rig retains actual distance phase after motion',(state.body.body?.performance?.density?.phase||0)>0);
  await startRouteFilm(page);film=true;
  const started=await page.evaluate(()=>window.__probe.takeMe());
  check('ordinary: Last Exposure starts with the visible world actor',started===true);
  await sleep(500);await shot('ordinary-catch');await sleep(1100);
  report.films.push({kind:'ordinary-last-exposure-dev-trigger',...await stopRouteFilm(page,path.join(out,'ordinary-catch.webm'))});film=false;
 }

}
async function measure(name){
 const sample=await page.evaluate(async()=>{
  const R=await import('/src/render/r3d.js'),before=R.r3dPixelMeshStatus().framesRendered,start=performance.now();
  await new Promise(resolve=>setTimeout(resolve,3800));
  const end=performance.now(),frames=R.r3dPixelMeshStatus().framesRendered-before;
  return{frames,seconds:(end-start)/1000,fps:frames*1000/(end-start)};
 });
 (report.performance||=[]).push({name,...sample});
}
async function verifyBattle(id) {
 const started=await page.evaluate(id=>window.__probe.battleId(id,false),id);
 check(id+' battle: actual game opens the encounter',started===true);
 const bodyState=()=>document.getElementById('wrap')?.dataset.hushBattleBodyState;
 await page.waitForFunction(()=>window.__scenes.top()?.id==='encounter-start'&&document.getElementById('wrap')?.dataset.hushBattleBodyState==='ready',{timeout:20000});
 check(id+' battle: real dither in the encounter splash',await page.evaluate(bodyState)==='ready');
 await shot(id+'-splash');
 await page.waitForFunction(()=>/^(battle:|combat:)/.test(window.__scenes.top()?.id||''),{timeout:12000});
 await sleep(450);
 const next=await page.evaluate(bodyState);
 check(id+' battle: active owner retains actual dither or transfers to its desktop',next==='ready'||id==='source'&&next==='desktop',{state:next});
 await shot(id+'-active');
 if(id==='source'){
  // Advance the real Contact's readiness and dialogue with ordinary input.
  // The source transition is owned by the production battle and its session.
  for(let i=0;i<70;i++){
   const state=await page.evaluate(()=>{
    const view=window.__scenes.top()?.battleView?.();
    const ready=document.querySelector('#battle-preparation')?.shadowRoot?.querySelector('[data-command="ready"]');
    const box=ready?.getBoundingClientRect();
    return {phase:view?.phase,desktop:view?.sourceDesktop,ready:box?.width?{x:box.x+box.width/2,y:box.y+box.height/2}:null};
   });
   if(state.desktop?.breached&&state.desktop.presentation?.ready&&state.phase!=='desktop-breach')break;
   if(state.phase==='prepare'&&state.ready)await page.mouse.click(state.ready.x,state.ready.y);
   else if(state.phase==='talk')await page.keyboard.press('Enter');
   await sleep(450);
  }
  const state=await page.evaluate(()=>window.__scenes.top()?.battleView?.()?.sourceDesktop);
  check('Source Contact: real desktop handoff is ready and playing',state?.breached&&state.presentation?.ready,state);
  await shot('source-breached-desktop');
 }

}
async function boot(){
 context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
 page.on('pageerror',e=>report.errors.push(String(e.stack||e)));page.on('console',m=>{if(/LOOP FAULT|ERROR: 0:|shader.*error|context.*lost|feedback loop/i.test(m.text()))report.errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.testRun,{timeout:180000});
 for(let i=0;i<240;i++){const id=await page.evaluate(()=>window.__scenes.top()?.id);if(id==='title')break;
  if(id==='eula'){assert.equal(process.env.HUSH_POSTURE_ACCEPT_EULA,'1','Existing authorization must be explicitly enabled');await page.keyboard.press('Enter');}await sleep(400);}
 check('actual frontend reaches title',await page.evaluate(()=>window.__scenes.top()?.id==='title'));
}
try{
 server=await createServer({cacheDir:path.join(out,'vite-cache'),optimizeDeps:{noDiscovery:true,include:['three','@tauri-apps/api/core','three/addons/environments/RoomEnvironment.js','three/addons/geometries/RoundedBoxGeometry.js','three/addons/utils/BufferGeometryUtils.js','three/addons/loaders/GLTFLoader.js','three/addons/utils/SkeletonUtils.js']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'hush-last-posture-'));
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,pipe:true,userDataDir:profile,protocolTimeout:45000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1280,840']});
 if(scopes.has('source')||scopes.has('ordinary')){
 await boot();
 report.gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight]};});
 if(scopes.has('source')){
 await stage('source');
 // The real catch presentation at the real actor; explicitly a DEV trigger,
 // not a proven AI capture or earned lasting injury.
 await startRouteFilm(page);film=true;await page.evaluate(()=>window.__probe.hushContact());await sleep(1900);
 report.films.push({kind:'actual-game-catch-dev-trigger',...await stopRouteFilm(page,path.join(out,'source-catch.webm'))});film=false;await shot('source-after-catch');
 }
 if(scopes.has('ordinary')){
 if(scopes.has('source')){await context.close();context=null;page=null;await boot();}
 await stage('ordinary');
 }
 await context.close();context=null;page=null;
 }
 if(scopes.has('battle')){
 for(const id of battles){
  await boot();
  await page.evaluate(async()=>{const p=window.__probe;await p.testRun();p.tutSkip();p.godRow('field-ready');});
  await verifyBattle(id);
  await context.close();context=null;page=null;
 }
 }
 if(scopes.has('desktop')){
 page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e.stack||e)));page.on('console',m=>{if(/ERROR: 0:|shader.*error|context.*lost|feedback loop/i.test(m.text()))report.errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/artifacts/hush-last-posture/desktop-proof.html`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__lastPostureDesktop?.ready||document.querySelector('#status')?.dataset.error==='true',{timeout:120000});
 const desktop=await page.evaluate(()=>window.__lastPostureDesktop?.view.debug());
 check('actual secondary presenter loads the replacement anatomical rig',desktop?.ready&&desktop.bones===43&&!desktop.error,desktop);
 report.desktop={scope:'Actual source-desktop-view component and shared transparent final dither; staged owner frames, not an earned fight or native detached window.',initial:desktop,intents:[]};
 for(const kind of ['broadcast','conceal','overload','loop','silence']){
  const state=await page.evaluate(kind=>window.__lastPostureDesktop.sample(2.2,kind,.5),kind);await sleep(120);
  const file=path.join(out,'desktop-'+kind+'.png');await page.screenshot({path:file});report.desktop.intents.push({kind,state,file});
 }
 await page.evaluate(()=>window.__lastPostureDesktop.view.dispose());
 }
 for(const file of files)check('source stable: '+file,sha(await fs.readFile(file))===report.sources[file]);
 check('no JavaScript or shader faults',report.errors.length===0,report.errors);report.passed=true;
}catch(error){report.passed=false;report.failure=String(error.stack||error);report.lastState=await (page?snapshot().catch(()=>null):null);process.exitCode=1;console.error(report.failure);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 if(film&&page)try{report.films.push({partial:true,...await stopRouteFilm(page,path.join(out,'incomplete.webm'))});}catch{}
 await browser?.close().catch(()=>{});await server?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});
 report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failure:report.failure,errors:report.errors}));
}
