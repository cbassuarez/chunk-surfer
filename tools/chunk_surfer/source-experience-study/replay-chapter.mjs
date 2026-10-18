// Prepare a faithful ordinary-input repeat from a COMPLETE saved capture trace.
// --prepare never launches. --run additionally requires explicit launch env.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile, mkdtemp, rm, statfs } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { productionIdentity, suppressClientHmr, installEvidenceReader } from './prototype-session-contract.mjs';

const mode=process.argv[2],file=process.argv[3];
assert.ok(['--prepare','--run'].includes(mode)&&file,'Usage: replay-chapter.mjs --prepare complete-trace.json | --run prepared-plan.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const loaded=await readFile(file,'utf8');
if(mode==='--prepare'){
  const input=JSON.parse(loaded),trace=input.report||input;
  assert.equal(trace.kind,'source-experience-continuous-canvas-capture');
  assert.ok(trace.events?.length&&trace.samples?.length,'Complete state/input trace required, not a screenshot witness or controller tail.');
  assert.equal(trace.events[0].type,'record-start');assert.equal(trace.events.at(-1).type,'record-stop','Do not prepare a partial/in-memory status report.');
  assert.ok(!trace.events.some(e=>e.type==='debug-call'),'Source progression/camera/speech debug calls prevent an ordinary-input repeat claim.');
  const initial=trace.samples[0],last=trace.samples.at(-1);
  assert.equal(initial.phase,'hall');assert.ok(Math.hypot(initial.position.x,initial.position.y)<.1,'The trace must include hall entry, not a later fixture.');
  assert.ok(last.phase==='completed'||last.savedCheckpoint?.area==='conservatory','The complete trace must reach its actual building exit.');
  const events=trace.events.filter(e=>e.type==='input'&&!e.repeat).map(e=>{
    assert.ok(e.trusted!==false,'Untrusted synthetic DOM input is not ordinary browser input.');
    assert.ok(['keydown','keyup','pointerdown','pointerup','pointermove','wheel'].includes(e.event));
    return {tMs:e.tMs,event:e.event,key:e.key,code:e.code,button:e.button,clientX:e.clientX,clientY:e.clientY,movementX:e.movementX,movementY:e.movementY,deltaY:e.deltaY};
  });
  const durationMs=trace.events.at(-1).tMs;
  const milestones=trace.transitions.filter(t=>t.source?.phase).map(t=>({tMs:t.tMs,phase:t.source.phase,scene:t.scene,
    checkpointId:t.source.checkpointId,route:t.source.finale?.route}));
  const dir=resolve(process.env.SOURCE_CHAPTER_REPEAT_OUT||'artifacts/source-experience-study/route/full-repeat');await mkdir(dir,{recursive:true});
  const plan={kind:'source-chapter-faithful-input-repeat',status:'prepared-not-run',sourceTrace:resolve(file),sourceTraceSha256:sha(loaded),
    originalCaptureHadChunkFailure:!!trace.chunkError,originalCaptureBytes:trace.bytes,originalMovieUnverified:true,
    productionIdentity:await productionIdentity(),initialFixture:'Exactly one declared hall-entry + chapel readiness + yaw0 fixture via shared helper; no kit/eyes/takes granted.',
    initial:{position:initial.position,look:initial.look,phase:initial.phase,firstLiftCompleted:initial.firstLiftCompleted,landscapeOrigin:initial.landscapeOrigin,settings:initial.settings},
    expectedTerminal:{phase:last.phase,area:last.savedCheckpoint?.area,route:last.finale?.route,position:last.position},
    durationMs,videoBitsPerSecond:2_000_000,events,milestones,
    controls:{preserveEventTiming:true,skipObservationPauses:false,postStartDebugMutations:false,viewport:[960,600],deviceScaleFactor:1},
    limitations:['Prepared input replay is not proof of completed native route.','Recorded pauses are preserved because pressure, dialogue, playback and unravelling have real clocks.',
      'Frame/collision variability can cause divergence; runner fails and keeps evidence instead of correcting game state.','This is developer-assisted repetition, not unbriefed player understanding or pacing acceptance.']};
  const path=join(dir,'replay-plan.json');await writeFile(path,JSON.stringify(plan,null,2));
  console.log(JSON.stringify({prepared:path,events:events.length,minutes:durationMs/60000,minimumVideoEstimateMiB:durationMs/1000*plan.videoBitsPerSecond/8/1048576,launched:false}));
  process.exit(0);
}

assert.equal(process.env.SOURCE_CHAPTER_REPEAT_LAUNCH,'1','No browser launched: parent must authorize SOURCE_CHAPTER_REPEAT_LAUNCH=1 after single-browser release.');
const plan=JSON.parse(loaded);assert.equal(plan.kind,'source-chapter-faithful-input-repeat');
assert.deepEqual(await productionIdentity(),plan.productionIdentity,'Source/assets drifted since trace preparation; review before repeating.');
assert.equal(sha(await readFile(plan.sourceTrace)),plan.sourceTraceSha256,'Original trace changed.');
const out=resolve(process.env.SOURCE_CHAPTER_REPEAT_RUN_OUT||join(dirname(file),'native'));await mkdir(out,{recursive:true});
const fs=await statfs(out),available=fs.bavail*fs.bsize;
const estimated=plan.durationMs/1000*plan.videoBitsPerSecond/8;
const minimum=Math.ceil(estimated*1.35+Buffer.byteLength(loaded)*2+128*1024*1024);
assert.ok(available>minimum,`No browser launched: faithful repeat needs about${(minimum/1073741824).toFixed(2)}GiB free; available${(available/1073741824).toFixed(2)}GiB. Preserve evidence and free authorized space first.`);
let browser,page,profile,recording=false,failure=null,mouseX=480,mouseY=300;
const report={kind:'source-chapter-input-repeat-result',plan:resolve(file),planSha256:sha(loaded),scope:plan.limitations,eventsApplied:0,snapshots:[],errors:[],checks:[]};
const check=(name,pass,details)=>{report.checks.push({name,pass:!!pass,details});if(!pass)throw new Error(`${name}: ${JSON.stringify(details)}`);};
try{
  profile=await mkdtemp(join(tmpdir(),'chunk-source-repeat-'));
  browser=await puppeteer.launch({executablePath:process.env.SOURCE_CHAPTER_REPEAT_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=8388608','--media-cache-size=8388608']});
  page=await browser.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
  const movie=join(out,'chapter-repeat.webm');await writeFile(movie,Buffer.alloc(0));
  await page.exposeFunction('__sourceExperienceWriteChunk',async data=>appendFile(movie,Buffer.from(data,'base64')));
  await page.evaluateOnNewDocument(suppressClientHmr);
  page.on('pageerror',e=>report.errors.push(String(e)));
  const url=new URL(process.env.SOURCE_CHAPTER_REPEAT_URL||'http://127.0.0.1:5334/');for(const[k,v]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1'}))url.searchParams.set(k,v);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id,{timeout:120000});
  // Match the original baseline's deliberately un-kitted fixture. The shared
  // prototype fixture now grants bag/setup/training for recorder comparisons.
  await page.evaluate(async()=>{await __probe.testRun();__probe.tutSkip();__probe.sourceChapelReady();__probe.sourcePreset('hall-entry');__probe.lookAtWorld(0,0);await document.fonts.ready;});
  await installEvidenceReader(page);await page.bringToFront();await sleep(1600);
  const initial=await page.evaluate(()=>({e:window.__sourceExperienceEvidence(),look:__probe.lookAngles(),settings:__probe.settings(),position:__probe.pos()}));
  check('initial body and heading match the complete original trace',Math.hypot(initial.position.x-plan.initial.position.x,initial.position.y-plan.initial.position.y)<.1
    &&Math.abs(initial.look.yaw-plan.initial.look.yaw)<.02&&Math.abs(initial.look.pitch-plan.initial.look.pitch)<.02,initial);
  check('ordinary motion/flash settings agree',initial.settings.shake===plan.initial.settings.shake&&initial.settings.flash===plan.initial.settings.flash,initial.settings);
  await page.screenshot({path:join(out,'00-initial-fixture.png')});report.snapshots.push({name:'initial',...initial});
  await page.evaluate(async()=>{const {installSourceExperienceCapture}=await import('/tools/chunk_surfer/source-experience-study/capture-installer.js');return installSourceExperienceCapture({initialFixture:'Faithful full-input repeat from declared hall entry; all original waits retained',fps:30,sampleHz:10,videoBitsPerSecond:2_000_000});});recording=true;
  const begun=performance.now();let lastProgress=-1;
  for(const event of plan.events){
    let remaining=event.tMs-(performance.now()-begun);while(remaining>0){await sleep(Math.min(500,remaining));remaining=event.tMs-(performance.now()-begun);}
    switch(event.event){
      case'keydown':await page.keyboard.down(event.key);break;
      case'keyup':await page.keyboard.up(event.key);break;
      case'pointerdown':await page.mouse.move(event.clientX,event.clientY);mouseX=event.clientX;mouseY=event.clientY;await page.mouse.down({button:event.button===2?'right':'left'});break;
      case'pointerup':await page.mouse.up({button:event.button===2?'right':'left'});break;
      case'pointermove':mouseX+=event.movementX||0;mouseY+=event.movementY||0;await page.mouse.move(mouseX,mouseY);break;
      case'wheel':await page.mouse.wheel({deltaY:event.deltaY||0});break;
    }
    report.eventsApplied++;
    const minute=Math.floor((performance.now()-begun)/60000);
    if(minute>lastProgress){lastProgress=minute;const state=await page.evaluate(()=>({position:__probe.pos(),source:__sourceExperienceEvidence().source,capture:__sourceExperienceCapture.status()}));report.snapshots.push({name:`minute-${minute}`,...state});console.log(JSON.stringify({minute,event:report.eventsApplied,phase:state.source?.phase,position:state.position}));
      check('streamed chunks are retained',!state.capture.chunkError,state.capture.chunkError);
      check('no later debug mutations',!state.capture.debugCalls.length,state.capture.debugCalls);}
  }
  while(performance.now()-begun<plan.durationMs)await sleep(100);
  const terminal=await page.evaluate(()=>({source:__probe.chunkSurf(),save:__chunkParity().save,position:__probe.pos()}));report.snapshots.push({name:'terminal',...terminal});
  check('ordinary input replay reaches the actual expected branch exit',terminal.source?.phase===plan.expectedTerminal.phase&&terminal.save.area===plan.expectedTerminal.area
    &&terminal.source?.finale?.route===plan.expectedTerminal.route,terminal);
  await page.screenshot({path:join(out,'99-terminal.png')});check('source/assets remain frozen',JSON.stringify(await productionIdentity())===JSON.stringify(plan.productionIdentity));
}catch(error){failure=String(error?.stack||error);report.failure=failure;console.error(failure);process.exitCode=1;if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{
  if(page&&recording){const result=await page.evaluate(()=>window.__sourceExperienceCapture.stop()).catch(error=>({error:String(error)}));
    if(result?.report){await writeFile(join(out,'chapter-repeat.json'),JSON.stringify(result.report));report.capture={bytes:result.report.bytes,chunkError:result.report.chunkError,continuousAfterInitialFixture:result.report.continuousAfterInitialFixture};}
    else report.captureError=result?.error||'No saved recorder report';}
  report.passed=!failure&&report.checks.every(c=>c.pass);await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  await browser?.close();if(profile)await rm(profile,{recursive:true,force:true});
}
