// Short production-input proof plus explicitly staged, matched source comparisons.
// No browser is launched unless --run is supplied. --self-test is CPU only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {transformSync} from 'esbuild';
import {mkdir,mkdtemp,readFile,writeFile,rm,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';

const root=process.cwd(),out=resolve(process.env.CINEMATIC_OUT||'artifacts/opening-access-audit/2026-11-08/cinematic-implementation');
const originals=resolve(process.env.CINEMATIC_BEFORE||join(out,'before'));
const port=Number(process.env.CINEMATIC_PORT)||5436,headless=process.env.CINEMATIC_HEADLESS==='1';
const shortMode=process.env.CINEMATIC_QUICK_ONLY==='1';
const wait=ms=>new Promise(done=>setTimeout(done,ms)),sha=value=>createHash('sha256').update(value).digest('hex');
const beforePaths=['src/game/opening-prologue-scene.js','src/game/opening-prologue-direction.js','src/game/coldopen.js','src/render/source-rest-subtitle.js'];
async function graphFiles(dir){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())files.push(...await graphFiles(path));else if(entry.isFile())files.push(relative(root,path));}return files.sort();}
async function pool(items,run,concurrency=24){let at=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{for(;;){const k=at++;if(k>=items.length)return;await run(items[k]);}}));}
function payload(data,expectedBytes,signature){
  const at=data.indexOf(';base64,');assert.ok(at>=0,'explicit base64 payload marker');
  const bytes=Buffer.from(data.slice(at+8),'base64');assert.equal(bytes.length,expectedBytes,'encoded bytes match original Blob');
  if(signature)assert.equal(bytes.subarray(0,signature.length).toString('hex'),signature.toString('hex'),'expected file signature');
  return bytes;
}
if(process.argv.includes('--self-test')){
  const ebml=Buffer.from([0x1a,0x45,0xdf,0xa3,0x80,0x00,0xfe]);
  assert.deepEqual(payload(`data:video/webm;codecs=vp9,opus;base64,${ebml.toString('base64')}`,ebml.length,ebml.subarray(0,4)),ebml);
  assert.throws(()=>payload('data:video/webm;base64,eA==',7),/Blob/);
  assert.throws(()=>payload('data:video/webm,not-base64',0),/marker/);
  console.log('PASS CPU-only media integrity checks; no browser or server launched.');
  process.exit(0);
}
if(!process.argv.includes('--run')){
  console.log('Prepared. Run with --run only after the coordinated native/GPU window is released. --self-test launches no browser.');
  process.exit(0);
}

await mkdir(out,{recursive:true});
const sourcePaths=await graphFiles(resolve(root,'src')),snapshot=new Map();
await pool(sourcePaths,async path=>snapshot.set(path,await readFile(resolve(root,path))));
await pool([...snapshot],async([path,bytes])=>{const file=join(out,'source-snapshot',path);await mkdir(resolve(file,'..'),{recursive:true});await writeFile(file,bytes);});
const graphManifest={copiedAt:new Date().toISOString(),files:Object.fromEntries([...snapshot].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>[path,{sha256:sha(bytes),bytes:bytes.length}]))};
await writeFile(join(out,'source-manifest.json'),JSON.stringify(graphManifest,null,2));
console.log('SOURCE GRAPH FROZEN',JSON.stringify({files:snapshot.size,bytes:[...snapshot.values()].reduce((sum,bytes)=>sum+bytes.length,0),copiedAt:graphManifest.copiedAt}));
const report={method:'One fresh-profile ordinary title New Run, then normal narrated/voiced first exchange, actual reply selection and the authored hand act. Later dialogue is deliberately accelerated with ordinary Enter input to reach the nine-reply file hub. Review, pause, partial skip and deliberate held skip use ordinary input. Separate BEFORE/AFTER camera-stage fixtures are labelled; they are not progression proof.',
  scope:{runtime:'Chrome on native Metal, current source and current generated assets; not packaged Tauri acceptance',foreground:!headless,
    humanComprehension:'pending',humanListening:'pending; real mixed game-output audio is recorded and objectively checked, not aesthetically certified',
    stageComparison:'Same authored stage, shader clock 42, frozen main/current renderer/assets. Camera framing intentionally differs. Each paused autopilot/embodiment clock is recorded, not assigned; not bitwise weather/animation subtraction.'},
  sourceSnapshot:graphManifest.files,sourceGraph:{scope:'Entire src/ tree copied before any native context; all loaded original module IDs use this immutable graph.',copiedAt:graphManifest.copiedAt,manifest:join(out,'source-manifest.json')},
  checks:[],captures:[],errors:[],passes:{},recordings:[],teardown:[]};
let browser,profile,page,server,context,activePass,recording=false,liveDeadline=0,responseJobs=[];
const check=(name,pass,detail=null,{fatal=true}={})=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name);if(fatal)assert.ok(pass,name);else if(!pass)process.exitCode=1;};
if(shortMode)report.method='Short final-source control supplement: fresh ordinary title New Run; natural first exchange, actual Space reply, accelerated keys to the hand act; actual Space/KeyZ/Enter while the camera establishes, a real earned Digit1 reply, ordinary pause/pointer reacquisition, partial/held skip into the real arrival. Separate explicitly staged AFTER stills. Existing full-route nine-reply, review and audio evidence remains in the prior clean receipt rather than being falsely rerun here.';
const saveReport=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
const compactState=()=>page.evaluate(()=>window.__cinematicQA.state());
async function persistBlob(file,item,signature){
  const bytes=payload(item.data,item.bytes,signature);await writeFile(file,bytes);
  const disk=await readFile(file);assert.equal(disk.length,item.bytes);assert.equal(sha(disk),sha(bytes));
  return{file,bytes:disk.length,sha256:sha(disk)};
}
async function capture(name,{stageFixture=false,comparisonPair=true}={}){
  const images=await page.evaluate(()=>new Promise((done,reject)=>requestAnimationFrame(async()=>{
    try{
      // Read sources afresh at every capture; renderer reacquisition can replace a canvas.
      const layers=window.__cinematicQA.layers(),world=document.querySelector('canvas.r3d');
      const ui=layers.findLast(layer=>layer.z>=8&&layer.canvas!==world)?.canvas;
      if(!world||!ui)throw Error('Separate current world and glyph canvases are required');
      const copy=source=>{const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);return canvas;};
      const captureState=window.__cinematicQA.state(),sources={world:copy(world),ui:copy(ui)};
      const composite=document.createElement('canvas');composite.width=innerWidth;composite.height=innerHeight;const painter=composite.getContext('2d');painter.fillStyle='#000';painter.fillRect(0,0,composite.width,composite.height);
      for(const layer of layers){const{rect}=layer;painter.globalAlpha=Number(getComputedStyle(layer.canvas).opacity);painter.drawImage(layer.canvas===world?sources.world:layer.canvas===ui?sources.ui:copy(layer.canvas),rect.left,rect.top,rect.width,rect.height);}painter.globalAlpha=1;
      sources.composite=composite;sources.scene=window.__cinematicQA.R3.r3dCaptureStageCanvas('scene');sources.post=window.__cinematicQA.R3.r3dCaptureStageCanvas('vfd');
      const pixels=sources.ui.getContext('2d').getImageData(0,0,sources.ui.width,sources.ui.height).data;
      let samples=0,opaqueDark=0,alpha=0;
      for(let y=Math.floor(ui.height*.1);y<ui.height*.52;y++)for(let x=Math.floor(ui.width*.65);x<ui.width*.95;x++){
        const at=(y*ui.width+x)*4;samples++;alpha+=pixels[at+3];
        if(pixels[at+3]>=250&&pixels[at]<16&&pixels[at+1]<16&&pixels[at+2]<16)opaqueDark++;
      }
      const encode=canvas=>new Promise((resolve,reject)=>canvas.toBlob(async blob=>{if(!blob)return reject(Error('Empty PNG Blob'));const reader=new FileReader();reader.onload=()=>resolve({data:reader.result,bytes:blob.size,width:canvas.width,height:canvas.height});reader.onerror=reject;reader.readAsDataURL(blob);},'image/png'));
      done({captureState,images:Object.fromEntries(await Promise.all(Object.entries(sources).map(async([key,canvas])=>[key,await encode(canvas)]))),
        layers:layers.map(({canvas,z,rect})=>({id:canvas.id,className:canvas.className,z,rect,width:canvas.width,height:canvas.height})),
        upperRightUi:{scope:'65–95% width, 10–52% height of separate glyph canvas; excludes letterbox and lower transcript',samples,opaqueDarkFraction:opaqueDark/samples,meanAlpha:alpha/samples/255}});
    }catch(error){reject(error);}
  })));
  const folder=join(out,activePass);await mkdir(folder,{recursive:true});const files={};
  for(const[layer,item]of Object.entries(images.images))files[layer]=await persistBlob(join(folder,`${name}-${layer}.png`),item,Buffer.from('89504e470d0a1a0a','hex'));
  const screen=join(folder,`${name}-screen.png`);await page.screenshot({path:screen});
  const value=images.captureState;report.captures.push({name,pass:activePass,stageFixture,comparisonPair,screen,screenScope:'Browser screenshot is later than the atomic rAF world/UI/composite/metadata capture; use files.composite for exact matched state.',files,layers:images.layers,upperRightUi:images.upperRightUi,...value});
  await saveReport();console.log('CAPTURE',activePass,name,value.node,value.stageId);
  return report.captures.at(-1);
}
async function newPass(name,overrides=new Map()){
  activePass=name;report.passes[name]={loads:{},served:{}};await mkdir(join(out,name),{recursive:true});
  server=await createServer({configFile:'vite.config.js',plugins:[{name:'cinematic-fixed-inputs',enforce:'pre',
    async load(id){const[pathId,query='']=id.split('?'),path=relative(root,pathId);const bytes=overrides.get(path)||snapshot.get(path);if(!bytes)return null;
      report.passes[name].loads[path]={origin:overrides.has(path)?'saved-before':'frozen-current',sha256:sha(bytes),bytes:bytes.length};
      if(/(?:^|&)raw(?:&|$)/.test(query))return`export default ${JSON.stringify(bytes.toString('utf8'))};`;
      return bytes.toString('utf8');}}],
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
  context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);await page.bringToFront();
  let rejectBoot;const bootFailure=new Promise((_,reject)=>{rejectBoot=reject;});bootFailure.catch(()=>{});
  page.on('pageerror',error=>{report.errors.push({pass:name,error:String(error.stack||error)});rejectBoot(error);});
  page.on('console',message=>{if(/ERROR: 0:|shader.*error|opening-prologue.*Continuing without|loop error|loop fault/i.test(message.text()))report.errors.push({pass:name,error:message.text()});});
  page.on('console',message=>{if(/pointer.?lock|pointer capture|user gesture/i.test(message.text())){report.inputDiagnostics??=[];report.inputDiagnostics.push({pass:name,type:message.type(),message:message.text()});}});
  responseJobs=[];page.on('response',response=>{const path=new URL(response.url()).pathname.slice(1);if(!snapshot.has(path))return;
    responseJobs.push(response.text().then(async source=>{report.passes[name].served[path]={sha256:sha(source),bytes:Buffer.byteLength(source)};
      if(path==='src/main.js'){await mkdir(join(out,name),{recursive:true});await writeFile(join(out,name,'served-main.js'),source);}}).catch(()=>{}));});
  await page.evaluateOnNewDocument(()=>{
    const q=window.__cinematicQA={outputs:[],samples:[],frameIntervals:[],previous:null,pointerEvents:[]};
    for(const type of['pointerlockchange','pointerlockerror'])document.addEventListener(type,()=>q.pointerEvents.push({type,at:performance.now(),locked:!!document.pointerLockElement,focused:document.hasFocus()}));
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination,...args){if(destination===this.context.destination&&!q.outputs.includes(this))q.outputs.push(this);return connect.call(this,destination,...args);};
    q.layers=()=>[...document.querySelectorAll('canvas')].map(canvas=>({canvas,z:Number(getComputedStyle(canvas).zIndex)||0,rect:canvas.getBoundingClientRect()}))
      .filter(layer=>layer.rect.width&&layer.rect.height&&Number(getComputedStyle(layer.canvas).opacity)>0&&getComputedStyle(layer.canvas).display!=='none'&&getComputedStyle(layer.canvas).visibility!=='hidden')
      .sort((a,b)=>a.z-b.z);
    const frame=now=>{if(q.previous!=null)q.frameIntervals.push(now-q.previous);q.previous=now;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  });
  await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await Promise.race([page.waitForFunction(()=>window.__probe?.sixLoop?.prologue&&window.__scenes?.top()?.id,{timeout:300000,polling:500}),bootFailure]);
  if(await page.evaluate(()=>window.__scenes.top()?.id==='eula'))await page.keyboard.press('Enter');
  await Promise.race([page.waitForFunction(()=>window.__scenes.top()?.id==='title',{timeout:300000,polling:500}),bootFailure]);
  // Establish Puppeteer's absolute pointer position while the title owns it;
  // the later small camera delta must not include a synthetic corner-to-centre jump.
  await page.mouse.move(640,400);
  await page.evaluate(async()=>{
    const q=window.__cinematicQA;q.R3=await import('/src/render/r3d.js');q.UI=await import('/src/render/ui.js');
    q.state=()=>{const v=window.__probe?.sixLoop?.prologue?.view(),s=window.__probe?.sixLoop?.prologue?.state(),d=v?.drive;
      return{scene:window.__scenes?.top()?.id,node:v?.nodeId,phase:v?.phase,paused:v?.paused,reviewActive:v?.reviewActive,skip:v?.skip,
        pointer:{focused:document.hasFocus(),visibility:document.visibilityState,locked:!!document.pointerLockElement,lockTarget:document.pointerLockElement?.id||document.pointerLockElement?.className||null,events:q.pointerEvents.slice(-8)},
        line:v?{who:v.who,text:v.line?.text,typed:v.typed,typing:v.typing,age:v.lineAge,serial:v.lineSerial,voice:v.voice}:null,
        pending:v?.pending,openingAct:v?.openingAct,stageId:v?.stageId,stage:v?.stage,journey:v?.journey,presentationLayout:v?.presentationLayout,ui:q.UI.uiSize(),
        inputOwner:{inRogue:window.__probe.why?.().inRogue,lookOwner:window.__scenes.lookOwner?.()?.id,allowsLook:window.__scenes.top()?.allowsLook},
        drive:d?{phase:d.phase,timeSec:d.timeSec,elapsed:d.elapsed,look:d.look,driveState:d.driveState,embodiment:d.embodiment}:null,
        camera:q.R3.r3dViewCamera?.(),holeProjection:v?.journey?.hole?q.R3.r3dProjectWorld?.({x:v.journey.hole[0],y:v.journey.hole[1],z:v.journey.hole[2]}):null,
        audio:window.__probe?.openingPrologueAudio?.(),music:s?.music,gl:document.querySelector('canvas.r3d')?.getContext('webgl2')?.getError()};};
  });
}
async function closePass(){
  if(page)await page.keyboard.up('e').catch(()=>{});
  if(recording)await stopRecording().catch(error=>{report.recordingFailure=String(error);});
  if(!context&&!server)return;
  await Promise.allSettled(responseJobs);responseJobs=[];
  await context?.close();context=null;page=null;await server?.close();server=null;report.teardown.push({pass:activePass,pageAndContextClosed:true,serverClosed:true});
}
async function startRecording(){
  await page.evaluate(()=>{
    const q=window.__cinematicQA,canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight;
    q.frameIntervals=[];q.previous=null;
    const painter=canvas.getContext('2d'),stream=canvas.captureStream(24),ctx=q.outputs.find(node=>node.context.state==='running')?.context;
    if(!ctx)throw Error('No running game-output AudioContext');
    const destination=ctx.createMediaStreamDestination(),analyser=ctx.createAnalyser();analyser.fftSize=2048;
    const nodes=q.outputs.filter(node=>node.context===ctx);for(const node of nodes){node.connect(destination);node.connect(analyser);}
    for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
    const r=q.recording={stream,mime,recorder,parts:[],nodes,destination,analyser,samples:[],startedAt:performance.now(),audioTracks:stream.getAudioTracks().length};
    const draw=()=>{painter.fillStyle='#000';painter.fillRect(0,0,canvas.width,canvas.height);
      for(const layer of q.layers()){const {rect}=layer;painter.globalAlpha=Number(getComputedStyle(layer.canvas).opacity);painter.drawImage(layer.canvas,rect.left,rect.top,rect.width,rect.height);}painter.globalAlpha=1;r.frame=requestAnimationFrame(draw);};draw();
    r.timer=setInterval(()=>{const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);let power=0,peak=0;for(const n of data){power+=n*n;peak=Math.max(peak,Math.abs(n));}
      const v=window.__probe.sixLoop.prologue.view();r.samples.push({at:performance.now()-r.startedAt,rms:Math.sqrt(power/data.length),peak,node:v?.nodeId,who:v?.who,voice:v?.voice,paused:v?.paused,reviewActive:v?.reviewActive});},100);
    recorder.ondataavailable=event=>{if(event.data.size)r.parts.push(event.data);};recorder.start(250);
  });recording=true;
}
async function stopRecording(){
  if(!recording)return;recording=false;
  const movie=await page.evaluate(()=>new Promise(done=>{const r=window.__cinematicQA.recording;clearInterval(r.timer);cancelAnimationFrame(r.frame);
    r.recorder.onstop=()=>{const blob=new Blob(r.parts,{type:r.mime}),reader=new FileReader();reader.onload=()=>{
      for(const node of r.nodes){node.disconnect(r.destination);node.disconnect(r.analyser);}r.stream.getTracks().forEach(track=>track.stop());
      const frames=window.__cinematicQA.frameIntervals.slice().sort((a,b)=>a-b);
      done({data:reader.result,bytes:blob.size,mime:r.mime,audioTracks:r.audioTracks,samples:r.samples,durationMs:performance.now()-r.startedAt,
        frameIntervals:{scope:'Live route only, including screenshot/readback/recording overhead; observed frame spacing, not GPU timings or human smoothness acceptance.',count:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1)}});};reader.readAsDataURL(blob);};r.recorder.stop();}));
  const file=join(out,activePass,'ordinary-controls-with-game-output.webm');const integrity=await persistBlob(file,movie,Buffer.from('1a45dfa3','hex'));delete movie.data;
  report.recordings.push({...movie,...integrity,scope:'Uncut live composite of freshly queried current world/glyph canvases; direct game-output audio, no microphone.'});
}
function withinBudget(){assert.ok(Date.now()<liveDeadline,'bounded ordinary route completed within its 100-second budget');}
async function question(id,{natural=false}={}){
  for(let n=0;n<260;n++){
    withinBudget();const v=await compactState();if(v.pending){assert.equal(v.node,id,`expected ${id}, received ${v.node}`);return v;}
    assert.equal(v.scene,'opening-prologue','conversation remains under its real owner');
    if(!natural||(!v.line?.typing&&v.line?.voice==null&&v.line?.age>.55))await page.keyboard.press('Enter');
    await wait(natural?150:100);
  }throw Error(`Question ${id} unreachable within bounded inputs`);
}
async function choose(goto,key='Enter'){
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.presentationLayout?.visibleChoices?.length>0,{timeout:20000,polling:100});
  const v=await compactState(),options=v.pending?.options||[],at=options.findIndex(option=>option.goto===goto);assert.ok(at>=0,`available reply ${goto}`);
  for(let n=0;n<(at-(v.pending.index||0)+options.length)%options.length;n++)await page.keyboard.press('ArrowDown');await page.keyboard.press(key);await wait(120);}
function heldIdentity(v){return{node:v.node,line:v.line,stageTime:v.stage?.time,journeyClock:v.journey?.clock,drive:v.drive};}
async function fixtureStages(passName){
  // Same complete first utterance for both UI comparisons; this is ordinary
  // reveal input, followed by explicit paused camera fixtures, never progression.
  await page.keyboard.press('Enter');await wait(100);
  for(const[stage,label]of [['grip','hand-and-cab'],['interval','sky-and-apparition'],['ellery','school']]){
    await page.evaluate(stage=>{const scene=window.__scenes.top();scene.pause();scene.seekStage(stage);scene.pose({time:42});},stage);await wait(300);
    await capture(`${passName}-${label}`,{stageFixture:true});
  }
  if(passName==='after'){
    await page.evaluate(()=>{const scene=window.__scenes.top();scene.seekStage('fate0');scene.pose({time:42});});await wait(300);
    const appendix=await capture('appendix-fate0-geometry-only',{stageFixture:true,comparisonPair:false});appendix.scope='Explicit native fate0 geometry fixture with the existing first utterance; NOT an actual eight-reply fate hub or route traversal.';
    await saveReport();
  }
}
async function verifyLayoutAndSelection(scale){
  await page.evaluate(scale=>window.__chunkSurferDisplay.setUiScale(scale),scale);await wait(200);
  for(let n=0;n<9;n++){
    const value=await compactState(),layout=value.presentationLayout;assert.equal(value.pending.options.length,9);assert.ok(layout,'live presentationLayout must be exposed');
    check(`${Math.round(scale*100)}% reply ${value.pending.index+1} is complete, selected and within the viewport`,
      layout.selectedChoiceComplete===true&&layout.selectedIndex===value.pending.index&&layout.visibleChoices.includes(value.pending.index)
      &&layout.bounds.x>=0&&layout.bounds.y>=0&&layout.bounds.x+layout.bounds.w<=value.ui.cols+.01&&layout.bounds.y+layout.bounds.h<=value.ui.rows+.01,
      {bounds:layout.bounds,ui:value.ui,selected:layout.selectedIndex,visible:layout.visibleChoices,bodyPages:layout.bodyPages});
    if(n===0||n===8)await capture(`file-${Math.round(scale*100)}-selected-${value.pending.index+1}`);
    await page.keyboard.press('ArrowDown');await wait(55);
  }
}
async function pointerLeaseSupplement(){
  const acquire=async label=>{const attempts=[];for(const delay of[250,1400,1400]){await page.mouse.click(640,400);await wait(delay);const v=await compactState();attempts.push({pointer:v.pointer,owner:v.inputOwner,head:v.drive.look});if(v.pointer.locked)break;}report.pointerAttempts??={};report.pointerAttempts[label]=attempts;return attempts.at(-1);};
  const initial=await acquire('before-pause');check('ordinary click acquires the camera before pause',initial.pointer.locked,initial,{fatal:false});
  if(initial.pointer.locked){const before=await compactState();await page.mouse.move(8,-2);await wait(150);const after=await compactState();check('actual locked mouse movement changes the driver head look',JSON.stringify(before.drive.look)!==JSON.stringify(after.drive.look),{before:before.drive.look,after:after.drive.look},{fatal:false});}
  await page.keyboard.press('Escape');await wait(150);check('short supplement opens the actual pause',await page.evaluate(()=>window.__scenes.top()?.id==='pause'));
  await page.keyboard.press('Escape');await wait(1600);const returned=await acquire('after-pause');check('ordinary click can reacquire camera after actual pause',returned.pointer.locked,returned,{fatal:false});
}
async function shortControlRoute(){
  await question('there',{natural:true});await capture('02-final-first-replies');await choose('quiet','Space');
  await question('look');const sky=await capture('03-final-default-sky');
  check('the actual optical centre sits above the five-reply exchange',sky.holeProjection?.visible===true&&sky.holeProjection.y<=.30,sky.holeProjection,{fatal:false});
  await choose('interval-wheel');
  await page.keyboard.press('Space');await wait(50);const travelling=await compactState();
  check('the actual hand camera is still establishing for the readiness test',travelling.journey.established===false);
  for(const key of['Space','z','Enter']){await page.keyboard.press(key);await wait(50);const held=await compactState();check(`actual ${key} cannot skip a travelling hand shot`,held.line.serial===travelling.line.serial&&held.node===travelling.node,{before:travelling.line,after:held.line,age:held.journey.age});}
  await question('interval-wheel');const working=await compactState();
  check('the real hand action completes before the authored reply boundary',working.drive.embodiment.progress===1,working.drive.embodiment);
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view().presentationLayout.visibleChoices.length>0,{timeout:15000,polling:100});
  await capture('04-final-default-hands');await page.keyboard.press('1');await wait(200);check('actual Digit1 selects a valid earned hand act',(await compactState()).openingAct?.id==='grip');
  await pointerLeaseSupplement();
  await page.keyboard.down('e');await wait(400);const partial=await compactState();await page.keyboard.up('e');await wait(100);check('short partial E release preserves the scene',partial.skip>.1&&partial.skip<1.1&&(await compactState()).scene==='opening-prologue'&&(await compactState()).skip===0);
}
try{
  // One local parser checks the complete immutable source graph before Chrome.
  // Keep the original bytes for serving; the transformed output is discarded.
  report.syntaxPreflight={method:'esbuild transformSync syntax parse, no execution; original frozen bytes served by original module ID',checked:0};
  for(const[path,bytes]of snapshot){const extension=path.split('.').at(-1);if(['js','jsx','ts','tsx'].includes(extension)){transformSync(bytes.toString('utf8'),{loader:extension,format:'esm',target:'esnext',sourcefile:path,logLevel:'silent'});report.syntaxPreflight.checked++;}else if(extension==='json'){JSON.parse(bytes.toString('utf8'));report.syntaxPreflight.checked++;}}
  console.log('SOURCE SYNTAX PASS',report.syntaxPreflight.checked);
  profile=await mkdtemp(join(tmpdir(),'chunk-cinematic-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless,userDataDir:profile,pipe:true,dumpio:process.env.CINEMATIC_CHROME_STDERR==='1',defaultViewport:null,protocolTimeout:180000,
    args:['--no-sandbox','--window-size=1280,800','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
  const before=new Map();for(const path of beforePaths){
    for(const file of[join(originals,path),join(originals,path.split('/').at(-1))]){
      try{before.set(path,await readFile(file));break;}catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  report.beforeFixtureSources=Object.fromEntries([...before].map(([path,bytes])=>[path,{sha256:sha(bytes),bytes:bytes.length}]));
  if(process.env.CINEMATIC_BASELINE_REPORT){
    const file=resolve(process.env.CINEMATIC_BASELINE_REPORT),retained=JSON.parse(await readFile(file,'utf8'));
    for(const path of['src/main.js','src/render/r3d.js','src/data/opening-prologue.js'])assert.equal(retained.sourceSnapshot[path].sha256,report.sourceSnapshot[path].sha256,`retained baseline still uses current ${path}`);
    for(const[path,bytes]of before)assert.equal(retained.beforeFixtureSources[path].sha256,sha(bytes),`retained original ${path} is unchanged`);
    const frames=retained.captures.filter(frame=>frame.pass==='before-staged'&&frame.stageFixture);assert.equal(frames.length,3);assert.ok(frames.every(frame=>frame.gl===0));
    for(const frame of frames)for(const image of Object.values(frame.files))assert.equal(sha(await readFile(image.file)),image.sha256,'retained baseline PNG stays exact');
    report.captures.push(...frames);report.passes['before-staged']={...retained.passes['before-staged'],reusedFrom:file};report.baselineReuse={report:file,hostRendererDataHashesMatch:true,originalPresentationModulesMatch:true,retainedPngHashesMatch:true,
      assets:'Root explicitly confirmed installed generated assets stayed frozen across the Escape/caption changes. Host/R3D/data and PNG bytes are independently rehashed here; no older-renderer screenshot is substituted.'};
    check('the retained BEFORE capture sources and exact PNG bytes still match the current comparison',true,report.baselineReuse);
  }else if(before.size===beforePaths.length){
    await newPass('before-staged',before);
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.sixLoop.prologue.begin();});
    await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.phase==='film',{timeout:300000,polling:250});
    await fixtureStages('before');await closePass();
  }else report.beforeUnavailable={missing:beforePaths.filter(path=>!before.has(path)),note:'No fabricated before rendering; saved original modules must be supplied under before/<repository path>.'};
  await newPass('after-live');
  for(let n=0;n<10;n++){if(await page.evaluate(()=>/^new run\./i.test(document.getElementById('title-a11y-status')?.textContent||'')))break;await page.keyboard.press('ArrowDown');}
  check('production title exposes the ordinary New Run action',await page.evaluate(()=>/^new run\./i.test(document.getElementById('title-a11y-status')?.textContent||'')));
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.phase==='film',{timeout:300000,polling:250});
  report.graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  check('the real renderer uses native Metal',/Metal/.test(report.graphics.renderer),report.graphics);
  liveDeadline=Date.now()+100000;await startRecording();await wait(1200);const cab=await capture('01-real-cab-arrival');
  check('upper-right world is not covered by an opaque UI mask',cab.upperRightUi.opaqueDarkFraction<.02,cab.upperRightUi);
  if(shortMode)await shortControlRoute();else{
  await question('there',{natural:true});await capture('02-real-first-three-replies');await choose('quiet');
  await question('look');await capture('03-real-sky-and-apparition');await choose('interval-wheel');
  await question('interval-wheel');await capture('04-real-hands-and-cab');await choose('interval-hold');
  await question('job');check('the authored hand act is retained', (await compactState()).openingAct?.id==='grip');await choose('job-rooms');
  await question('ellery');await capture('05-real-school');await choose('school');await question('notice');await choose('file');await question('file');
  check('the actual optional file hub has nine replies',(await compactState()).pending.options.length===9);
  await verifyLayoutAndSelection(1);await verifyLayoutAndSelection(1.25);await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1));
  await page.keyboard.press('q');await wait(150);const reviewBefore=await compactState();await capture('06-review-open');
  if(reviewBefore.presentationLayout.bodyPages>1){await page.keyboard.press('ArrowRight');await wait(100);check('review reads another page through the shared Left/Right action',(await compactState()).presentationLayout.bodyPage===1);}
  await wait(700);const reviewAfter=await compactState();
  check('Q opens a real review with exact exchange and camera held',reviewBefore.reviewActive===true&&reviewBefore.paused===true&&JSON.stringify(heldIdentity(reviewBefore))===JSON.stringify(heldIdentity(reviewAfter)),{before:heldIdentity(reviewBefore),after:heldIdentity(reviewAfter)});
  await page.keyboard.press('q');await wait(150);check('Q returns to the same exchange',(await compactState()).reviewActive===false&&(await compactState()).node==='file');
  await page.keyboard.press('q');await wait(100);await page.keyboard.press('Escape');await wait(150);
  check('Escape closes review without opening global pause',(await compactState()).reviewActive===false&&(await compactState()).scene==='opening-prologue'&&(await compactState()).node==='file');
  await page.keyboard.down('e');await wait(350);await page.keyboard.press('Escape');await page.keyboard.up('e');await wait(150);
  check('Escape opens the real pause menu',await page.evaluate(()=>window.__scenes.top()?.id==='pause'));await capture('07-real-pause');
  const paused=await compactState();await wait(600);check('pause holds the exact exchange and camera',JSON.stringify(heldIdentity(paused))===JSON.stringify(heldIdentity(await compactState())));
  await page.keyboard.press('Escape');await wait(200);check('resume cancels the partial skip',(await compactState()).scene==='opening-prologue'&&(await compactState()).skip===0);await capture('08-resumed');
  await page.keyboard.down('e');await wait(400);const partial=await compactState();await page.keyboard.up('e');await wait(200);
  check('partial skip has a real held fraction and release cancels it',partial.skip>.1&&partial.skip<1.1&&(await compactState()).skip===0);
  await capture('09-partial-skip-released');
  const compositionFrames=report.captures.filter(frame=>frame.pass==='after-live');
  check('every decisive ordinary-route image retains the actual neutral head look',compositionFrames.every(frame=>frame.drive?.look&&Math.abs(frame.drive.look.yaw)<1e-8&&Math.abs(frame.drive.look.pitch+.035)<1e-8));
  // Deliberate free-look is last. CDP absolute coordinates under pointer lock
  // can produce a large turn; do not carry this into composition acceptance.
  await page.mouse.click(640,400);await wait(250);const lookBefore=await compactState();await page.mouse.move(658,396,{steps:3});await wait(180);const lookAfter=await compactState();
  check('ordinary mouse input reaches the real opening camera',Math.abs(lookAfter.drive.look.yaw-lookBefore.drive.look.yaw)>.002,
    {before:lookBefore.drive.look,after:lookAfter.drive.look,pointerBefore:lookBefore.pointer,pointerAfter:lookAfter.pointer,owner:lookAfter.inputOwner,scope:'Deliberate end-only free-look proof; subsequent off-axis frames are not composition acceptance.'},{fatal:false});
  }
  await page.keyboard.down('e');await wait(1350);await page.keyboard.up('e');await wait(200);
  check('deliberate held skip hands off into the real arrival',(await compactState()).scene!=='opening-prologue'&&await page.evaluate(()=>!!window.__probe.openingArrival()?.vehicle));
  await stopRecording();await closePass();
  await newPass('after-staged');await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.sixLoop.prologue.begin();});
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.phase==='film',{timeout:300000,polling:250});await fixtureStages('after');await closePass();
  check('every pass actually loads the same frozen host and current renderer',Object.values(report.passes).every(pass=>
    pass.loads['src/main.js']?.sha256===report.sourceSnapshot['src/main.js'].sha256
    &&pass.loads['src/render/r3d.js']?.sha256===report.sourceSnapshot['src/render/r3d.js'].sha256
    &&!!pass.served['src/main.js']));
  if(before.size===beforePaths.length){
    check('the BEFORE pass actually loads every saved original presentation module',beforePaths.every(path=>
      report.passes['before-staged'].loads[path]?.origin==='saved-before'
      &&report.passes['before-staged'].loads[path]?.sha256===report.beforeFixtureSources[path].sha256));
    const staged=report.captures.filter(frame=>frame.stageFixture&&frame.comparisonPair!==false);
    check('the six comparison stills use the same named stages and fixed authored clock',staged.length===6&&staged.every(frame=>frame.stage.time===42)
      &&['grip','interval','ellery'].every(stage=>staged.filter(frame=>frame.stageId===stage).length===2));
  }
  check('no page, shader or renderer fallback errors',report.errors.length===0,report.errors);
  check('all captured rendering passes report no GL error',report.captures.every(frame=>frame.gl===0));
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;console.error(report.failure);if(page)await capture('failure').catch(()=>{});}
finally{
  await closePass().catch(error=>{report.teardown.push({error:String(error)});process.exitCode=1;});
  await browser?.close().catch(error=>{report.teardown.push({browserError:String(error)});process.exitCode=1;});
  if(profile)await rm(profile,{recursive:true,force:true}).catch(error=>{report.teardown.push({profileError:String(error)});});
  report.teardown.push({browserClosed:true,ownedProfileRemoved:!!profile});
  for(const movie of report.recordings){try{
    movie.ffprobe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,sample_rate,channels','-show_entries','format=duration,size','-of','json',movie.file],{encoding:'utf8'}));
    assert.equal(Number(movie.ffprobe.format.size),(await stat(movie.file)).size);assert.ok(movie.ffprobe.streams.some(s=>s.codec_type==='video'));assert.ok(movie.ffprobe.streams.some(s=>s.codec_type==='audio'));
    const packets=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-select_streams','v:0','-show_entries','packet=pts_time,dts_time,duration_time','-of','json',movie.file],{encoding:'utf8',maxBuffer:8*1024*1024})).packets;
    const pts=packets.map(packet=>Number(packet.pts_time));assert.ok(pts.length>10&&pts.every(Number.isFinite));let regressions=0,equalities=0;
    for(let n=1;n<pts.length;n++){if(pts[n]<pts[n-1])regressions++;if(pts[n]===pts[n-1])equalities++;}assert.equal(regressions,0);assert.equal(equalities,0);
    // MediaRecorder uses variable frame times. Preserve its millisecond time
    // base instead of rounding them through the null encoder's guessed CFR.
    const decoded=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-i',movie.file,'-map','0:v:0','-an','-fps_mode','passthrough','-enc_time_base','1:1000','-f','null','-'],{encoding:'utf8',maxBuffer:8*1024*1024});
    const decodedAudio=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-i',movie.file,'-map','0:a:0','-vn','-f','null','-'],{encoding:'utf8',maxBuffer:8*1024*1024});
    movie.timestampValidation={inputVideoPackets:pts.length,firstPts:pts[0],lastPts:pts.at(-1),regressions,equalities,videoDecodeExit:decoded.status,videoDecodeStderr:decoded.stderr,audioDecodeExit:decodedAudio.status,audioDecodeStderr:decodedAudio.stderr};
    assert.equal(decoded.status,0);assert.equal(decoded.stderr.trim(),'');assert.equal(decodedAudio.status,0);assert.equal(decodedAudio.stderr.trim(),'');movie.fullDecodePassed=true;
    movie.audioFile=join(out,'after-live','actual-game-output.wav');execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-y','-i',movie.file,'-vn','-c:a','pcm_s16le',movie.audioFile]);
    movie.audibleSamples=movie.samples.filter(sample=>sample.rms>1e-4).length;movie.voicedSamples=movie.samples.filter(sample=>sample.voice!=null&&sample.rms>1e-4).length;
    check('saved movie retains non-silent game output during actual voiced lines',movie.audioTracks>0&&movie.audibleSamples>5&&movie.voicedSamples>0,
      {audibleSamples:movie.audibleSamples,voicedSamples:movie.voicedSamples,scope:'Voice-event alignment with the mixed game output; voice intelligibility and aesthetic balance require audition.'});
  }catch(error){movie.validationFailure=String(error.stack||error);process.exitCode=1;}}
  report.diskEnd={};for(const[path]of snapshot){try{const bytes=await readFile(resolve(root,path));report.diskEnd[path]={sha256:sha(bytes),bytes:bytes.length};}catch(error){report.diskEnd[path]={error:String(error)};}}
  report.diskDriftPaths=[...snapshot].map(([path])=>path).filter(path=>report.diskEnd[path].sha256!==report.sourceSnapshot[path].sha256);
  report.sourceGuard='Both passes served frozen main/module input bytes. Served transformed module hashes and original loader receipts are separate from any concurrent raw-disk drift.';
  report.pass=!report.failure&&report.checks.every(row=>row.pass)&&report.recordings.length>0&&report.recordings.every(movie=>movie.fullDecodePassed&&!movie.validationFailure);
  await saveReport();console.log('CLOSED',JSON.stringify({pass:report.pass,checks:report.checks.length,errors:report.errors.length,diskDriftPaths:report.diskDriftPaths,failure:report.failure||null}));
}
