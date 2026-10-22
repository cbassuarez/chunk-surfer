// Coordinator-controlled, headful, isolated participant trial. No autoplay or
// player-facing instructions are added. Root explicitly authorizes launch.
// SOURCE_PLAYTEST_LAUNCH=1 node .../human-playtest.mjs guidance before P001
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, writeFile, appendFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { sha, fixtureSetupFlags, loadExperiment, installPrototypeInterception, preparePrototypeFixture, installEvidenceReader, suppressClientHmr, productionIdentity } from './prototype-session-contract.mjs';

assert.equal(process.env.SOURCE_PLAYTEST_LAUNCH,'1','No browser launched. Root must explicitly authorize SOURCE_PLAYTEST_LAUNCH=1.');
const id=process.argv[2],condition=process.argv[3],rawParticipant=process.argv[4]||'';
assert.ok(['guidance','bust','chapter'].includes(id),'Choose guidance, bust or chapter');assert.ok(['before','after'].includes(condition),'Choose before or after');
const participant=rawParticipant.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,40);
assert.ok(participant&&/^[a-zA-Z0-9]/.test(participant),'Supply an anonymous participant ID, e.g. P001');
const out=resolve(process.env.SOURCE_PLAYTEST_OUT||'artifacts/source-experience-study/human-trials',`${participant}-${id}-${condition}`);
await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out); // Refuse to overwrite a prior person's trial.
const experiment=await loadExperiment(id);
const verifiedPath=resolve(process.env.SOURCE_PLAYTEST_SNAPSHOT||'artifacts/source-experience-study/prototypes/native/verified-snapshot.json');
let verified;try{verified=JSON.parse(await readFile(verifiedPath,'utf8'));}catch{throw new Error('Verified native snapshot is missing. Run/review the paired comparison and saved-media inspection before preparing this human condition. No browser launched.');}
if(verified.humanReady!==true){
  assert.ok(process.env.SOURCE_PLAYTEST_SMOKE==='1'&&participant.startsWith('SMOKE_ONLY'),
    'This snapshot has not passed the human-readiness gates. Only an explicit technical SMOKE_ONLY trial may launch; no participant condition is advertised as ready. No browser launched.');
}
const currentIdentity=await productionIdentity();
assert.deepEqual(currentIdentity,verified.productionIdentity,'Advertised renderer/source/pack snapshot drifted. Regenerate and review the native comparison; do not silently refresh the human condition. No browser launched.');
for(const manifest of verified.manifests||[])assert.equal(sha(await readFile(manifest.path)),manifest.sha256,'Approved prototype manifest drifted; regenerate/review the comparison before this trial. No browser launched.');
assert.ok(verified.allowedExperiments?.includes(id),'Experiment is not approved in the bound native snapshot');
const profile=await mkdtemp(join(tmpdir(),'chunk-source-participant-'));
const report={kind:'source-experience-unbriefed-human-trial',participant,experiment:id,condition,productionFilesChanged:[],
  scope:id==='chapter'?'Declared chapter-entry fixture with chapel readiness; after applies both bounded prototypes. This does not establish the omitted earlier-night history or an earned Conservatory entry.'
    :'One declared authored encounter fixture. Human behavior and answers must be interpreted with prior-game familiarity recorded separately.',
  manifest:experiment.path,manifestSha256:experiment.manifestSha,sourceSha256:experiment.sourceSha,interceptions:[],errors:[],coordinatorCommands:[],
  declaredSetupFlags:fixtureSetupFlags,
  verifiedSnapshot:{path:verifiedPath,sha256:sha(await readFile(verifiedPath)),status:verified.status},
  validation:{participantObserved:false,independentReadingOrRecallResults:null},startedAt:Date.now()};
report.productionIdentityBefore=currentIdentity;
const browser=await puppeteer.launch({executablePath:process.env.SOURCE_PLAYTEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:false,userDataDir:profile,protocolTimeout:120000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--window-size=1000,720','--disk-cache-size=8388608','--media-cache-size=8388608']});
let page,recording=false,hasRecorded=false,closed=false;
const write=value=>process.stdout.write(`${JSON.stringify(value)}\n`),safeName=value=>String(value||'witness').replace(/[^a-zA-Z0-9_.-]/g,'-').slice(0,80);
const videoPath=join(out,'encounter.webm');
async function snapshot(){return page.evaluate(()=>({now:performance.now(),position:window.__probe.pos(),look:window.__probe.lookAngles(),...window.__sourceExperienceEvidence(),
  scene:window.__scenes?.top?.()?.id||null,view:window.__scenes?.top?.()?.view?.()||null,speech:window.__probe.speech(),recorder:window.__probe.tape?.().machine,
  settings:window.__probe.settings(),audio:window.__probe.audio(),pixelMesh:window.__chunkSurferPixelMesh?.status?.(),
  lens:{active:!!window.__diffusion,stats:window.__diffusion?.stats||null},capture:window.__sourceExperienceCapture?.status?.(),
  setupFlags:Object.fromEntries(['bag.taken','setup.levels','setup.waypoint','combat.trained'].map(flag=>[flag,window.__probe.flagValue(flag)]))}));}
async function stop(){
  if(!recording)return null;
  const value=await page.evaluate(()=>window.__sourceExperienceCapture.stop());recording=false;
  if(value?.videoBase64)await writeFile(videoPath,Buffer.from(value.videoBase64,'base64'));
  if(value?.report){report.capture=value.report;await writeFile(join(out,'encounter.json'),JSON.stringify({...value.report,browserErrors:report.errors},null,2));}
  report.finalState=await snapshot();await writeFile(join(out,'trial.json'),JSON.stringify(report,null,2));
  return{video:videoPath,report:join(out,'trial.json'),bytes:value?.report?.bytes,chunkError:value?.report?.chunkError};
}
try{
  const context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
  await page.exposeFunction('__sourceExperienceWriteChunk',async encoded=>appendFile(videoPath,Buffer.from(encoded,'base64')));
  await page.evaluateOnNewDocument(suppressClientHmr);await installPrototypeInterception(page,experiment,condition,report);
  page.on('pageerror',error=>report.errors.push({type:'pageerror',text:String(error)}));
  page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(message.text()))report.errors.push({type:'console',text:message.text()});});
  const url=new URL(process.env.SOURCE_PLAYTEST_URL||'http://127.0.0.1:5334/');for(const[key,value]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1'}))url.searchParams.set(key,value);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:120000});
  await installEvidenceReader(page);
  await preparePrototypeFixture(page,id);await new Promise(done=>setTimeout(done,1600));await page.bringToFront();
  report.initialState=await snapshot();
  assert.ok(Object.values(report.initialState.setupFlags).every(Boolean),'Carried-recorder/setup fixture flags did not apply');
  if(id==='bust')assert.equal(report.initialState.source.profile.marbleEyes,null,'Shared missing-eyes fixture did not apply');
  if(id==='bust')assert.equal(report.initialState.bust.placement.eyeMode,'untouched','Actual runtime bust presentation is not eye-ineligible');
  await page.screenshot({path:join(out,'initial-fixture.png')});await writeFile(join(out,'trial.json'),JSON.stringify(report,null,2));
  write({ready:true,out,participant,experiment:id,condition,recording:false,coordinatorOnly:'Send record when the participant is ready; no input/autoplay is performed by this tool.'});
  const input=createInterface({input:process.stdin,terminal:false});browser.on('disconnected',()=>input.close());
  for await(const line of input){
    if(!line.trim())continue;let command;
    try{
      command=JSON.parse(line);report.coordinatorCommands.push({at:Date.now(),...command});let result;
      switch(command.op){
        case'record':{
          assert.equal(recording,false,'Already recording');assert.equal(hasRecorded,false,'This participant trial already has a recording; use a fresh anonymous trial ID rather than overwrite it.');await writeFile(videoPath,Buffer.alloc(0));
          result=await page.evaluate(async experimentId=>{const {installSourceExperienceCapture}=await import('/tools/chunk_surfer/source-experience-study/capture-installer.js');return installSourceExperienceCapture({initialFixture:`declared ${experimentId} human trial`,fps:30,sampleHz:10,videoBitsPerSecond:2_000_000});},id);
          recording=true;hasRecorded=true;break;
        }
        case'stop':result=await stop();break;
        case'query':result=await snapshot();break;
        case'mark':result=await page.evaluate(label=>window.__sourceExperienceCapture?.mark(label),command.label);break;
        case'shot':{
          const name=safeName(command.name);await page.screenshot({path:join(out,`${name}.png`)});const state=await snapshot();await writeFile(join(out,`${name}.json`),JSON.stringify(state,null,2));result={path:join(out,`${name}.png`)};break;
        }
        case'participant-observed':report.validation.participantObserved=command.value===true;result=report.validation;break;
        case'close':await stop();closed=true;result={closed:true};break;
        default:throw new Error('Only coordinator record/stop/query/mark/shot/participant-observed/close are supported. The person operates the game.');
      }
      write({id:command.id||null,ok:true,result});if(closed)break;
    }catch(error){write({id:command?.id||null,ok:false,error:String(error?.stack||error)});}
  }
}finally{
  if(recording)await stop().catch(error=>report.errors.push({type:'capture-stop',text:String(error)}));
  report.sourceUnchanged=sha(await readFile(experiment.sourcePath))===experiment.sourceSha;
  report.productionIdentityAfter=await productionIdentity();report.productionIdentityUnchanged=JSON.stringify(report.productionIdentityBefore)===JSON.stringify(report.productionIdentityAfter);
  report.closedAt=Date.now();await writeFile(join(out,'trial.json'),JSON.stringify(report,null,2));await browser.close();await rm(profile,{recursive:true,force:true});
}
