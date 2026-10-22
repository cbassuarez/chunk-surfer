// Bounded native experiment, never an earned/unbriefed chapter playthrough.
// Root explicitly enables launch after the continuous baseline is complete.
// SOURCE_PROTOTYPE_LAUNCH=1 node .../compare-prototypes.mjs [guidance|bust|all]
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { sha, fixtureMainSearch, fixtureMainReplace, fixtureSetupFlags, loadExperiment, installPrototypeInterception, preparePrototypeFixture, installEvidenceReader, suppressClientHmr, productionIdentity } from './prototype-session-contract.mjs';

assert.equal(process.env.SOURCE_PROTOTYPE_LAUNCH,'1','No browser launched. Root must explicitly set SOURCE_PROTOTYPE_LAUNCH=1 after granting go.');
const requested=process.argv[2]||'all';assert.ok(['all','guidance','bust'].includes(requested));
const experiments=requested==='all'?['guidance','bust']:[requested];
const conditions=(process.env.SOURCE_PROTOTYPE_CONDITIONS||'before,after').split(',');assert.ok(conditions.every(value=>['before','after'].includes(value)));
const base=process.env.SOURCE_PROTOTYPE_URL||'http://127.0.0.1:5334/';
const captureStills=process.env.SOURCE_PROTOTYPE_CAPTURE_STILLS!=='0';
const root=process.cwd(),out=resolve(process.env.SOURCE_PROTOTYPE_OUT||'artifacts/source-experience-study/prototypes/native');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
await mkdir(out,{recursive:true});

function simplifySnapshot(value){return {position:value.position,look:value.look,phase:value.source?.phase,focus:value.source?.focus?.kind,
  objective:value.source?.objective?.id,checkpointId:value.source?.checkpointId,route:value.source?.finale?.route,decision:value.source?.finale?.bust?.decision,
  scene:value.scene,recorderNote:value.recorder?.note,recorderSignal:value.recorder?.face?.meterLabel};}

async function run(experiment,condition,browser){
  const dir=join(out,experiment.id,condition);await mkdir(dir,{recursive:true});
  const report={experiment:experiment.id,condition,scope:'Declared authored fixture; ordinary inputs after recording starts. Native browser canvas/audio evidence, not an earned or unbriefed chapter playthrough.',
    manifest:experiment.path,manifestSha256:experiment.manifestSha,productionRuntimeSha256:experiment.sourceSha,captureStills,
    fixtureMainSha256:experiment.mainSha,interceptions:[],snapshots:[],inputs:[],checks:[],errors:[]};
  let context,page,recording=false,failure=null;
  const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`);};
  try{
    report.productionIdentityBefore=await productionIdentity();
    context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
    const videoPath=join(dir,'encounter.webm');await writeFile(videoPath,Buffer.alloc(0));
    await page.exposeFunction('__sourceExperienceWriteChunk',async encoded=>appendFile(videoPath,Buffer.from(encoded,'base64')));
    await page.evaluateOnNewDocument(suppressClientHmr);
    page.on('pageerror',error=>report.errors.push({type:'pageerror',text:String(error)}));
    page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(message.text()))report.errors.push({type:'console',text:message.text()});});
    await installPrototypeInterception(page,experiment,condition,report);
    const url=new URL(base);for(const[key,value]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1'}))url.searchParams.set(key,value);
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:120000});
    await installEvidenceReader(page);
    await page.bringToFront();
    await preparePrototypeFixture(page,experiment.id);
    await sleep(1600);
    const snapshot=async name=>{
      const began=Date.now();
      const value=await page.evaluate(()=>({at:performance.now(),...window.__sourceExperienceEvidence(),position:window.__probe.pos(),look:window.__probe.lookAngles(),
        scene:window.__scenes?.top()?.id||null,view:window.__scenes?.top()?.view?.()||null,sceneBlocksInput:window.__scenes?.top()?.blocksInput??false,speech:window.__probe.speech(),recorder:window.__probe.tape?.().machine,
        edgeDoor:window.__probe.edgeDoor(),horizon:window.__probe.horizonFrame(),bust:window.__probe.bustReliquary(),audio:window.__probe.audio(),
        settings:window.__probe.settings(),pixelMesh:window.__chunkSurferPixelMesh?.status?.(),roomRender:window.__probe.sourceRoomRender?.(),
        lens:{active:!!window.__diffusion,stats:window.__diffusion?.stats||null},capture:window.__sourceExperienceCapture?.status?.()}));
      value.fixtureSetupFlags=await page.evaluate(()=>Object.fromEntries(['bag.taken','setup.levels','setup.waypoint','combat.trained'].map(flag=>[flag,window.__probe.flagValue(flag)])));
      report.snapshots.push({name,...value});
      if(!recording||captureStills)await page.screenshot({path:join(dir,`${name}.png`)});
      if(recording&&captureStills){const encoded=await page.evaluate(()=>window.__sourceExperienceCapture.witness());await writeFile(join(dir,`${name}-canvas.png`),Buffer.from(encoded.split(',')[1],'base64'));}
      (report.snapshotInstrumentation||=[]).push({name,milliseconds:Date.now()-began,recording,stills:!recording||captureStills});
      console.log(JSON.stringify({experiment:experiment.id,condition,snapshot:name,...simplifySnapshot(value)}));return value;
    };
    const initial=await snapshot('00-initial-fixture');
    check('the fixture has the carried recorder and completed equipment setup',Object.values(initial.fixtureSetupFlags).every(Boolean),initial.fixtureSetupFlags);
    check('the fixture uses ordinary full motion/flash settings',initial.settings.shake==='full'&&initial.settings.flash==='full',initial.settings);
    if(experiment.id==='guidance'){
      check('guidance fixture begins on the real final rise with first lift completed',initial.source.firstLiftCompleted&&initial.source.phase==='landscape'&&Math.abs(initial.source.divide.body.feet-13.6285714286)<.5,
        {phase:initial.source.phase,floor:initial.source.divide.body.feet,position:initial.position});
    }else check('bust fixture is eye-ineligible before interaction',initial.source.profile?.marbleEyes==null&&initial.sourceEvidence.persistedProfile!=null&&initial.bust.placement.eyeMode==='untouched'&&!initial.source.finale.bust.decision,
      {profile:initial.source.profile,liveEyeMode:initial.bust.placement.eyeMode,sourceEvidence:initial.sourceEvidence});
    const captureOptions={initialFixture:experiment.id==='guidance'?'first-contact + declared pre-record actual-terrain final-rise warp':'horizon168 + identical ineligible-review fixture +8cells south of actual bust',fps:30,sampleHz:10,videoBitsPerSecond:2_000_000};
    await page.evaluate(async options=>{const {installSourceExperienceCapture}=await import('/tools/chunk_surfer/source-experience-study/capture-installer.js');return installSourceExperienceCapture(options);},captureOptions);recording=true;
    const press=async key=>{report.inputs.push({at:Date.now(),kind:'press',key});await page.keyboard.press(key);await sleep(180);};
    const hold=async(key,ms)=>{report.inputs.push({at:Date.now(),kind:'hold',key,ms});await page.keyboard.down(key);try{await sleep(ms);}finally{await page.keyboard.up(key);}};
    const waitFor=async(predicate,label,timeout=20000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await page.evaluate(predicate))return;await sleep(120);}throw new Error(`Timed out waiting for ${label}`);};
    if(experiment.id==='guidance'){
      await page.keyboard.down('w');report.inputs.push({at:Date.now(),kind:'down',key:'w'});
      try{await waitFor(()=>{const p=window.__probe,s=p.chunkSurf(),at=p.pos();return(at.y-s.landscapeOrigin.y)*.5<=-538.8;},'ordinary final approach',18000);}finally{await page.keyboard.up('w');report.inputs.push({at:Date.now(),kind:'up',key:'w'});}
      // Let ordinary collision establish the same closed-leaf stopping plane,
      // rather than making a polling interval choose the comparison camera.
      await hold('w',500);
      await sleep(400);const approach=await snapshot('01-grey-door-approach');
      check('ordinary approach acquires the assembled goods-door interaction',approach.source.focus?.kind==='source-edge-door',approach.source.focus);
      await press('r');await sleep(700);const recorder=await snapshot('02-raised-recorder');
      check('R opens the real recorder scene',recorder.scene==='recorder',recorder.scene);
      const expected=condition==='after'?'THE GREY DOORS, AT THE EDGE.':'THE LAST PAGE, AT THE EDGE.';
      check('native recorder receives expected source trace',recorder.recorder.note===expected,{expected,actual:recorder.recorder.note,face:recorder.recorder.face});
      const expectedSignal=condition==='after'?'SIGNAL · AHEAD':'SIGNAL · RIGHT';
      check('native recorder signal agrees with the measured controlled bearing',recorder.recorder.face.meterLabel===expectedSignal,{expected:expectedSignal,actual:recorder.recorder.face.meterLabel});
      await sleep(1800);await press('r');await sleep(300);
      check('R lowers the recorder back to ordinary world controls',await page.evaluate(()=>window.__scenes?.top()?.id==null),await page.evaluate(()=>window.__scenes?.top()?.id||null));
      await press('e');await sleep(1500);
      const open=await snapshot('03-real-door-open');check('ordinary E opens the actual goods pair',open.edgeDoor.passable,open.edgeDoor);
      await page.keyboard.down('w');report.inputs.push({at:Date.now(),kind:'down',key:'w'});
      try{await waitFor(()=>window.__probe.chunkSurf().phase==='horizon','ordinary body crossing into the walk out',8000);}finally{await page.keyboard.up('w');report.inputs.push({at:Date.now(),kind:'up',key:'w'});}
      await hold('w',650);await sleep(600);const departed=await snapshot('04-departed');
      check('departure preserves the existing normal-exit branch',departed.source.phase==='horizon'&&departed.source.horizon.reason==='walked-away'&&departed.source.finale.route==null,
        {horizon:departed.source.horizon,finale:departed.source.finale});
    }else{
      await hold('w',350);await sleep(250);await snapshot('01-bust-approach');
      const afterInteraction=[];
      for(let n=1;n<=3;n++){
        await waitFor(()=>!window.__probe.speech(),'previous ambient speech to finish',30000);
        await press('e');await sleep(1100);afterInteraction.push(await snapshot(`0${n+1}-interaction-${n}`));
        if(n<3)await waitFor(()=>!window.__probe.speech(),'world bust line to finish',30000);
      }
      check('first ordinary interaction commits the same chapel refusal',afterInteraction[0].source.finale.bust.decision==='declined'&&afterInteraction[0].source.finale.route==='chapel',afterInteraction[0].source.finale);
      const third=afterInteraction[2];
      if(condition==='before')check('control reproduces inaccessible existing refusal tree',third.scene!=='finale'&&third.speech?.text==='The chapel is still ahead.',{scene:third.scene,speech:third.speech});
      else{
        check('prototype exposes the existing refusal tree through ordinary E',third.scene==='finale',third.scene);
        // Availability restores an existing modal conversation. It does not
        // silently redesign that presenter into a freely escapable world line.
        await press('Escape');
        const escapeView=await snapshot('05-escape-control');
        if(escapeView.scene==='pause')await press('Escape');
        await hold('w',250);const modal=await snapshot('05-existing-modal-control');
        report.inheritedAudienceLimit={blocksInput:modal.sceneBlocksInput,escapeTopScene:escapeView.scene,conversationRetainedAfterEscape:modal.scene==='finale',ordinaryMovementStayedInPlace:JSON.stringify(modal.position)===JSON.stringify(third.position)};
        check('existing audience remains modal; Escape pauses or is consumed without cancelling it',modal.sceneBlocksInput===true&&modal.scene==='finale'&&JSON.stringify(modal.position)===JSON.stringify(third.position),report.inheritedAudienceLimit);
        const lineHistory=[];let chosenKind=false,chosenAccount=false,done=false;
        for(let n=0;n<80;n++){
          const view=await page.evaluate(()=>window.__scenes?.top()?.id==='finale'?window.__scenes.top().view():null);
          if(!view){done=true;break;}
          if(view.line?.text&&!lineHistory.some(entry=>entry.lineSerial===view.lineSerial)){
            lineHistory.push({at:Date.now(),nodeId:view.nodeId,lineSerial:view.lineSerial,who:view.who,text:view.line.text});
          }
          if(view.pending?.options?.length){
            const text=!chosenKind?'What kind of eyes?':'Then what CAN you do?';
            const index=view.pending.options.findIndex(option=>String(option.text||'')===text);
            check(`existing ${text} choice is present`,index>=0,view.pending.options);
            for(let j=0;j<(index-(view.pending.index||0)+view.pending.options.length)%view.pending.options.length;j++)await press('ArrowDown');
            await press('Enter');if(!chosenKind)chosenKind=true;else chosenAccount=true;
          }else{
            await waitFor(()=>{const v=window.__scenes?.top()?.view?.();return !v||(!v.typing&&!v.voice);},'current real dialogue text and voice',35000);
            if(/recording|ground stays|chapel is ahead|eyeballs/i.test(view.line?.text||''))await snapshot(`dialogue-${String(n).padStart(2,'0')}-${view.nodeId}`);
            await sleep(350);await press('Enter');
          }
        }
        report.dialogueHistory=lineHistory;
        check('existing practical account is actually presented',done&&chosenKind&&chosenAccount&&lineHistory.some(line=>line.text.includes('The ground stays under your feet.'))&&lineHistory.some(line=>line.text.includes('The chapel is ahead.')),lineHistory);
        await snapshot('06-refusal-account-finished');await press('e');await sleep(1100);const terminal=await snapshot('07-terminal-response');
        check('completed audience returns to concise chapel response',terminal.speech?.text==='The chapel is still ahead.'&&terminal.source.finale.bust.decision==='declined'&&terminal.source.finale.route==='chapel',terminal.source.finale);
      }
      await waitFor(()=>!window.__probe.speech(),'terminal world line',30000);
      await hold('d',950);await hold('w',950);await sleep(300);const departure=await snapshot('08-free-departure');
      check('ordinary departure retains declined chapel route without a tower offer',departure.source.finale.route==='chapel'&&departure.source.finale.bust.decision==='declined'&&departure.source.phase==='horizon',departure.source.finale);
    }
    check('no JavaScript, shader or interception errors',report.errors.length===0,report.errors);
    const end=await snapshot('09-final-state');report.finalState=end.source;
    const finalRuntimeSha=sha(await readFile(experiment.sourcePath)),finalMainSha=sha(await readFile('src/main.js'));
    check('production runtime source remained unchanged',finalRuntimeSha===experiment.sourceSha,{expected:experiment.sourceSha,actual:finalRuntimeSha});
    check('fixture main source remained unchanged',finalMainSha===experiment.mainSha,{expected:experiment.mainSha,actual:finalMainSha});
    report.productionIdentityAfter=await productionIdentity();
    check('production renderer and visible asset identities stayed fixed throughout this condition',JSON.stringify(report.productionIdentityBefore)===JSON.stringify(report.productionIdentityAfter));
  }catch(error){failure=String(error?.stack||error);report.failure=failure;console.error(failure);if(page)await page.screenshot({path:join(dir,'failure.png')}).catch(()=>{});}
  finally{
    if(page&&recording){
      const capture=await page.evaluate(()=>window.__sourceExperienceCapture.stop()).catch(error=>({error:String(error)}));
      if(capture?.report){report.capture={...capture.report,video:join(dir,'encounter.webm')};await writeFile(join(dir,'encounter.json'),JSON.stringify({...capture.report,browserErrors:report.errors},null,2));if(capture.videoBase64)await writeFile(join(dir,'encounter.webm'),Buffer.from(capture.videoBase64,'base64'));}
      else report.captureError=capture?.error||'No recorder result';
    }
    if(page)report.resourceUrls=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name)).catch(()=>[]);
    report.passed=!failure&&report.checks.every(check=>check.pass);await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));
    await context?.close();
  }
  return report;
}
const results=[];
const prepared=[];for(const id of experiments)prepared.push(await loadExperiment(id));
await writeFile(join(out,'fixture-manifest.json'),JSON.stringify({kind:'declared-native-comparison-fixtures',productionFilesChanged:[],
  setupFlagsIdenticalInAllConditions:fixtureSetupFlags,
  bust:{requestPath:'/src/main.js',sourceSha256:prepared.find(entry=>entry.id==='bust')?.mainSha||null,search:fixtureMainSearch,replace:fixtureMainReplace,expectedCount:1,
    appliesIdenticallyTo:['before','after'],reason:'The existing review shortcut hardcodes eligible returned eyes. This changes only the test fixture to the missing-eyes condition being investigated.'},
  guidance:{preset:'first-contact',localMetres:[0,-532],facing:0,worldYaw:0,pitch:-.04},
  bustCamera:{preset:'horizon168',position:'actual bust x, actual bust y+8 cells',facing:0,worldYaw:0,pitch:-.04}},null,2));
const profile=await mkdtemp(join(tmpdir(),'chunk-source-prototypes-'));
const browser=await puppeteer.launch({executablePath:process.env.SOURCE_PROTOTYPE_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=8388608','--media-cache-size=8388608']});
try{for(const experiment of prepared)for(const condition of conditions)results.push(await run(experiment,condition,browser));}
finally{await browser.close();await rm(profile,{recursive:true,force:true});}
const summary={kind:'source-experience-native-bounded-prototypes',results:results.map(report=>({experiment:report.experiment,condition:report.condition,passed:report.passed,failure:report.failure,
  checks:report.checks,capture:report.capture?{bytes:report.capture.bytes,width:report.capture.width,height:report.capture.height,video:report.capture.video,continuousAfterInitialFixture:report.capture.continuousAfterInitialFixture,limitations:report.capture.limitations}:null})),
  limitations:['Authored fixtures isolate the cause; these are not first-entry, unbriefed or earned full-route evidence.','Browser canvas recording excludes native/HTML window choreography; matched viewport screenshots preserve browser DOM evidence.','No emotional/readability acceptance is inferred from scripted interaction.']};
summary.pairedInitialConditions=experiments.map(id=>{
  const pair=results.filter(result=>result.experiment===id),before=pair.find(result=>result.condition==='before')?.snapshots[0],after=pair.find(result=>result.condition==='after')?.snapshots[0];
  if(!before||!after)return{experiment:id,paired:false};
  const control=value=>({position:value.position,look:value.look,profile:value.source.profile,seed:value.source.seed,phase:value.source.phase,landscapeOrigin:value.source.landscapeOrigin,
    checkpointId:value.source.checkpointId,settings:value.settings,setupFlags:value.fixtureSetupFlags,firstLiftCompleted:value.source.firstLiftCompleted,finaleRoute:value.source.finale.route,decision:value.source.finale.bust.decision});
  const a=control(before),b=control(after),assetBefore=pair.find(result=>result.condition==='before').productionIdentityBefore,assetAfter=pair.find(result=>result.condition==='after').productionIdentityBefore;
  return{experiment:id,paired:true,equal:JSON.stringify(a)===JSON.stringify(b),productionIdentityEqual:JSON.stringify(assetBefore)===JSON.stringify(assetAfter),before:a,after:b};
});
summary.pairedEncounterCameras=experiments.map(id=>{
  const before=results.find(result=>result.experiment===id&&result.condition==='before'),after=results.find(result=>result.experiment===id&&result.condition==='after');
  if(!before||!after)return{experiment:id,paired:false};
  const names=id==='guidance'?['00-initial-fixture','01-grey-door-approach','02-raised-recorder']:['00-initial-fixture','01-bust-approach'];
  return{experiment:id,paired:true,views:names.map(name=>{const a=before.snapshots.find(snapshot=>snapshot.name===name),b=after.snapshots.find(snapshot=>snapshot.name===name),camera=value=>value?{position:value.position,look:value.look}:null;
    return{name,equal:!!a&&!!b&&JSON.stringify(camera(a))===JSON.stringify(camera(b)),before:camera(a),after:camera(b)};}),
    limitation:'Only views whose measured body position and look match exactly are labelled identical cameras. Departure timing/noise are live ordinary input and are not bit-identical controls.'};
});
await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({summary:join(out,'summary.json'),results:summary.results.map(result=>({experiment:result.experiment,condition:result.condition,passed:result.passed,failure:result.failure})),
  pairedInitialConditions:summary.pairedInitialConditions.map(pair=>({experiment:pair.experiment,equal:pair.equal,productionIdentityEqual:pair.productionIdentityEqual})),
  pairedEncounterCameras:summary.pairedEncounterCameras.map(pair=>({experiment:pair.experiment,equal:pair.views?.every(view=>view.equal)}))},null,2));
const allPassed=!results.some(report=>!report.passed)&&!summary.pairedInitialConditions.some(pair=>pair.paired&&(!pair.equal||!pair.productionIdentityEqual))&&!summary.pairedEncounterCameras.some(pair=>pair.paired&&pair.views.some(view=>!view.equal));
if(allPassed&&experiments.length===2&&conditions.length===2){
  await writeFile(join(out,'verified-snapshot.json'),JSON.stringify({schema:1,kind:'source-experience-native-verified-snapshot',verifiedAt:Date.now(),
    summary:join(out,'summary.json'),productionIdentity:results[0].productionIdentityBefore,manifests:prepared.map(experiment=>({id:experiment.id,path:experiment.path,sha256:experiment.manifestSha})),
    status:'native-interaction-verified-human-launcher-smoke-pending',allowedExperiments:['guidance','bust','chapter'],
    limitations:['Saved encoded media still require decoder inspection.','Human launcher and unbriefed participant acceptance are separate pending gates.']},null,2));
}
if(!allPassed)process.exitCode=1;
