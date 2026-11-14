// Bounded silent browser acceptance. Initial run/room state is explicitly staged;
// the recorder key, dialogue inputs, pause and subsequent frames are real inputs.
import {cp,mkdir,mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const repo=process.cwd(),out=resolve(process.env.GAMEPLAY_REPAIR_OUT||'artifacts/gameplay-repairs-2026-11-08/browser');
const stairsOnly=process.env.GAMEPLAY_REPAIR_SCOPE==='stairs';
const frozen=await mkdtemp(join(tmpdir(),'chunk-gameplay-repairs-')),profile=await mkdtemp(join(tmpdir(),'chunk-gameplay-browser-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
for(const name of ['src','content','LEGAL','index.html','package.json'])await cp(join(repo,name),join(frozen,name),{recursive:true});
for(const name of ['assets','public','node_modules'])await symlink(join(repo,name),join(frozen,name),'dir');
const report={passed:false,scope:'Developer-staged browser check; no earned route, packaged-native, performance, audio-mix or unfamiliar-player acceptance.',
  silence:{browserMuted:true,microphoneDisabled:true,audioCapture:false},sources:{},checks:[],pageErrors:[],consoleErrors:[],failedResponses:[]};
for(const name of ['src/main.js','src/game/get-in-tutorial-scene.js','src/game/setup-handoff.js','src/world/floorplan.js','src/data/floorplan/conservatory.js','src/render/r3d.js'])report.sources[name]=hash(await readFile(join(frozen,name)));
report.sources['public/startup-guard.js']=hash(await readFile(join(repo,'public/startup-guard.js')));
const check=(name,condition,detail=null)=>{report.checks.push({name,pass:!!condition,detail});assert.ok(condition,name);};
let server,browser,page;
async function inspect(){return page.evaluate(()=>{const p=window.__probe,top=window.__scenes?.top?.(),view=top?.view?.()||top?.debugState?.();return{
  scene:top?.id||null,view,stack:window.__scenes?.ids?.()||null,worldHeld:window.__scenes?.blocksWorld?.(),rec:p?.rec?.(),setup:p?.setupHandoff?.(),
  position:p?.pos?.(),dream:p?.dreamFigure?.(),focused:document.hasFocus(),visibility:document.visibilityState,
  startup:{hidden:document.querySelector('#startupRecovery')?.hidden,phase:document.querySelector('#startupRecovery')?.dataset.phase}};});}
async function until(test,label,ms=30000){const started=Date.now();let value;while(Date.now()-started<ms){value=await inspect();if(test(value))return value;await sleep(120);}throw Error(label+' timed out: '+JSON.stringify(value));}
try{
  server=await createServer({root:frozen,configFile:false,cacheDir:join(frozen,'.vite-cache'),base:'./',
    define:{__APP_VERSION__:JSON.stringify(JSON.parse(await readFile(join(frozen,'package.json'),'utf8')).version),__LOCAL_TEXT_REVIEW__:true},
    publicDir:join(repo,'public'),envPrefix:['VITE_','TAURI_ENV_*'],server:{host:'127.0.0.1',port:5607,strictPort:true,hmr:false,watch:null,fs:{allow:[repo,frozen]}}});
  await server.listen();
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:180000,
    args:['--mute-audio','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
  page.on('pageerror',e=>report.pageErrors.push(String(e.stack||e)));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({text:m.text(),location:m.location()});});
  page.on('response',r=>{if(r.status()>=400)report.failedResponses.push({url:r.url(),status:r.status()});});
  await page.setRequestInterception(true);let blockEntry=!stairsOnly;
  page.on('request',req=>{if(blockEntry&&new URL(req.url()).pathname==='/src/main.js')req.abort();else req.continue();});
  const url='http://127.0.0.1:5607/?mode=story&skiptut=1&nomic=1&sam=0&nodisplaynotice=1&skipwarn=1&silentReview=1';
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});await page.bringToFront();
  if(!stairsOnly){
  await page.waitForFunction(()=>document.querySelector('#startupRecovery')?.dataset.phase==='failed',{timeout:15000});
  const failure=await page.evaluate(()=>({text:document.querySelector('#startupRecovery')?.innerText,retry:!document.querySelector('#startupRecoveryRetry')?.hidden,main:!!window.__probe}));
  check('failed entry module exposes readable retry without main running',failure.retry&&!failure.main&&failure.text?.includes('saved game'),failure);
  await page.screenshot({path:join(out,'startup-failure.png')});
  report.expectedBlockedEntryErrors=report.consoleErrors.splice(0);report.expectedBlockedEntryPageErrors=report.pageErrors.splice(0);
  blockEntry=false;await page.reload({waitUntil:'domcontentloaded',timeout:120000});
  }
  await page.waitForFunction(()=>window.__probe?.testRun&&document.querySelector('#startupRecovery')?.hidden,{timeout:180000});
  check('successful boot retires startup surface',true);
  if(!stairsOnly){
  await page.evaluate(async()=>{
    await window.__probe.testRun();await window.__probe.godWarpGetIn();window.__probe.clearDiagnosticScenes();window.__probe.hush();
    const flags=Object.keys(window.__probe.setupHandoff().flags);
    window.__probe.setFlags(['bag.taken','map.taken','kit.fitted','title.shown','prologueDone'],[...flags,'combat.trained','setup.levels','setup.waypoint']);
  });
  const before=await inspect();report.beforeTutorial=before;check('fresh tutorial has no credited job takes',before.rec.takes.length===0,before.rec.takes);
  await page.evaluate(()=>document.querySelector('#map')?.focus());await page.keyboard.press('KeyR');
  const raised=await until(s=>!!s.view?.guide,'first R raises existing recorder lesson');
  report.firstR=raised;check('first R owns the world and marks tutorial request',raised.worldHeld&&raised.setup.flags['setup.tutorial.requested']===true,raised.scene);
  await page.screenshot({path:join(out,'first-r-guide.png')});
  const started=Date.now();
  while(Date.now()-started<50000){
    const value=await inspect();if(value.rec?.recording)break;
    const guide=value.view?.guide?.view;
    if(guide?.pending){const choices=guide.pending.options;let i=choices.findIndex(c=>/roll sound|^roll$|start|continue/i.test(c.text));if(i<0)i=choices.length-1;await page.keyboard.press(String(i+1));}
    else if(guide?.line&&guide.lineAge>=.3)await page.keyboard.press('Space');
    await sleep(180);
  }
  const recording=await until(s=>s.rec?.recording,'actual protected calibration begins');report.calibration=recording;
  await page.evaluate(()=>window.__probe.noise(1));
  await page.keyboard.press('KeyW');await page.keyboard.press('KeyR');
  const protectedState=await inspect();check('noise and stop/movement keys cannot spoil or skip calibration',protectedState.rec.recording&&!protectedState.rec.spoiled&&protectedState.worldHeld,protectedState.rec.takeElapsed);
  await page.keyboard.press('Escape');const paused=await until(s=>s.scene==='pause','tutorial pause');await sleep(500);
  const stillPaused=await inspect();check('pause freezes real calibration',Math.abs(stillPaused.rec.takeElapsed-paused.rec.takeElapsed)<.001);
  await page.keyboard.press('Escape');
  const dream=await until(s=>s.scene==='daydream'||s.scene==='conversation:daydream'||String(s.scene).includes('daydream'),'calibration continues into unchanged imagined sequence',30000);
  report.dream=dream;check('calibration earns levels, leaves combat unearned and keeps world held',dream.setup.flags['setup.levels']&&!dream.setup.flags['combat.trained']&&dream.worldHeld);
  await page.screenshot({path:join(out,'imagined-sequence.png')});
  }
  // Clear the diagnostic attempt without credit, then inspect the repaired
  // floor in the real renderer. This is explicit staging, never progression.
  await page.evaluate(async()=>{
    await window.__probe.testRun();
    window.__probe.clearDiagnosticScenes();window.__probe.setFlags(['combat.trained','setup.levels','setup.waypoint','setup.case.closed','setup.case.skills-closed']);
    const {MAIN_STAIR_LAYOUT}=await import('/src/data/floorplan/conservatory.js'),FP=await import('/src/world/floorplan.js');
    const point=FP.toRuntimePoint(MAIN_STAIR_LAYOUT.practiceMouth);window.__probe.warpRuntime(point.x,point.y,2);window.__probe.lookAtWorld?.(Math.PI,-.1);
    window.__probe.setTorchBattery(1);window.__probe.setTorch(true);
  });
  await sleep(1800);report.secondFloor=await inspect();await page.screenshot({path:join(out,'second-floor-arrival.png')});
  check('no uncaught game errors',report.pageErrors.length===0,report.pageErrors);
  check('no loop faults',!report.consoleErrors.some(e=>/LOOP FAULT|boot failed/i.test(e.text)),report.consoleErrors);
  report.passed=true;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;try{report.final=await inspect();await page.screenshot({path:join(out,'failure.png')});}catch{}}
finally{await browser?.close().catch(()=>{});await server?.close();await rm(profile,{recursive:true,force:true});await rm(frozen,{recursive:true,force:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,out,failure:report.failure||null,failedResponses:report.failedResponses}));}
