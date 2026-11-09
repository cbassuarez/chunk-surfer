// One explicit front-end fixture, then ordinary extras/menu/scene input.
// This does not claim an earned run or unfamiliar-human aesthetic acceptance.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const out=resolve(process.env.TRANSFER_REPLAY_OUT||'artifacts/interruption-extras-audit/native');
const port=Number(process.env.TRANSFER_REPLAY_PORT)||5408;
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const sha=value=>createHash('sha256').update(value).digest('hex');
await mkdir(out,{recursive:true});
const report={method:'Native Metal. An explicit parked active-run save, seen-first-field flag, fixed night clock and filed-document profile form the initial fixture. Ordinary production title/menu keys open extras; every subsequent choice, walk, reach, look and return uses ordinary input. No live night is advanced and no body/state/camera is assigned inside a field.',checks:[],captures:[],errors:[],servedSources:{},humanAcceptance:'pending'};
let browser,page,server,profile,failure=null;
const check=(name,value,detail=null)=>{report.checks.push({name,pass:!!value,detail});assert.ok(value,name);console.log('PASS',name);};
const state=()=>page.evaluate(()=>({scene:window.__scenes.top()?.id,view:window.__scenes.top()?.view?.(),
  camera:window.__probe.sourceShoreView?.()?.eye||null,pointer:!!document.pointerLockElement,
  gl:document.querySelector('canvas.r3d')?.getContext('webgl2')?.getError(),takeover:window.__probe.windowTakeover?.view?.()}));
async function capture(name){
  const images=await page.evaluate(()=>Object.fromEntries(['scene','vfd'].map(layer=>[layer,window.__probe.sourceShoreCapture?.(layer)])));
  const files={};for(const[layer,data]of Object.entries(images))if(data?.startsWith('data:image/png;base64,')){
    files[layer]=join(out,`${name}-${layer}.png`);await writeFile(files[layer],Buffer.from(data.split(',')[1],'base64'));
  }
  files.screen=join(out,`${name}-screen.png`);await page.screenshot({path:files.screen});
  report.captures.push({name,files,...await state()});
}
async function openVisit(index){
  await page.keyboard.press('2');await page.keyboard.press('1');
  for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes.top()?.id==='transfer-field-replay'&&window.__scenes.top().view()?.ready,{timeout:120000,polling:100});
}
async function back(){await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__scenes.top()?.id==='transfer-room',{timeout:10000});}
async function startRecording(){
  await page.evaluate(()=>{
    const canvas=document.querySelector('canvas.r3d'),stream=canvas.captureStream(20),destinations=[];
    for(const node of window.__replayQA.outputs){const destination=node.context.createMediaStreamDestination();node.connect(destination);destinations.push({node,destination});for(const track of destination.stream.getAudioTracks())stream.addTrack(track);}
    const type=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
    const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:1800000}),chunks=[];
    window.__replayQA.recording={recorder,chunks,stream,destinations,type,startedAt:performance.now(),audioTracks:stream.getAudioTracks().length};
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.start(250);
  });
}
async function stopRecording(){
  const movie=await page.evaluate(()=>new Promise(done=>{
    const q=window.__replayQA.recording;q.recorder.onstop=async()=>{
      const blob=new Blob(q.chunks,{type:q.type}),data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
      for(const{node,destination}of q.destinations)node.disconnect(destination);q.stream.getTracks().forEach(track=>track.stop());
      done({data,bytes:blob.size,mimeType:q.type,audioTracks:q.audioTracks,durationMs:performance.now()-q.startedAt});
    };q.recorder.stop();
  }));
  const marker=movie.data.indexOf(';base64,');assert.ok(marker>=0,'recording must be a base64 data URL');
  const bytes=Buffer.from(movie.data.slice(marker+8),'base64');assert.equal(bytes.length,movie.bytes,'saved movie bytes match the recorder blob');
  const video=join(out,'ordinary-walk-reach-look-return.webm');await writeFile(video,bytes);delete movie.data;
  const media=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name','-show_entries','format=duration,size','-of','json',video],{encoding:'utf8'}));
  assert.ok(media.streams.some(stream=>stream.codec_type==='video'));assert.ok(media.streams.some(stream=>stream.codec_type==='audio'),'game output audio survives encoding');
  movie.savedMedia=media;
  report.movie={...movie,video,scope:'Uncut renderer-canvas video with direct game-output audio. UI menu and prompts are on a separate glyph layer and are evidenced by screenshots/state, not by this canvas track.'};
}
try{
  server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
  profile=await mkdtemp(join(tmpdir(),'chunk-transfer-native-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,
    protocolTimeout:180000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
    window.__replayQA={outputs:[],raf:[],previous:null};
    const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){
      if(destination===this.context.destination&&!window.__replayQA.outputs.includes(this))window.__replayQA.outputs.push(this);
      return connect.call(this,destination,...args);
    };
    const sample=now=>{const q=window.__replayQA;if(q.previous!=null)q.raf.push(now-q.previous);q.previous=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  page.on('pageerror',error=>report.errors.push(String(error.stack||error)));
  page.on('console',message=>{if(/loop error|loop fault|Returning to extras|ERROR: 0:|shader.*error/i.test(message.text()))report.errors.push(message.text());});
  page.on('response',async response=>{
    const path=new URL(response.url()).pathname;if(path.startsWith('/src/')&&response.status()===200&&String(response.headers()['content-type']).includes('javascript')){
      try{const source=await response.text();report.servedSources[path]={sha256:sha(source),bytes:Buffer.byteLength(source)};}catch{}
    }
  });
  await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.returnToTitle&&window.__scenes?.top?.()?.id,{timeout:180000,polling:1000});
  await page.evaluate(async()=>{
    window.__replaySave=await import('/src/game/save.js');
    window.__replaySave.newGame({now:1234567890000});
    const save=window.__replaySave.getSave();
    window.__replaySave.saveCommit({flags:{...save.flags,'memory.field.first':true},nightClock:{...save.nightClock,elapsedSeconds:123}});
    const meta=window.__replaySave.getMeta();
    window.__replaySave.metaCommit({knowledge:{...meta.knowledge,documents:{...meta.knowledge?.documents,
      'work-order':{firstSeenAt:1,firstSeenRunId:'explicit-native-extras-unlock-fixture',count:1}}}});
    window.__probe.returnToTitle();
  });
  for(let i=0;i<10;i++){
    if(await page.evaluate(()=>/^field replays[.]/i.test(document.getElementById('title-a11y-status')?.textContent||'')))break;
    await page.keyboard.press('ArrowDown');
  }
  check('the real unlocked production title row is selectable',await page.evaluate(()=>/^field replays[.]/i.test(document.getElementById('title-a11y-status')?.textContent||'')));
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes.top()?.id==='transfer-room',{timeout:15000});
  report.saveBefore=await page.evaluate(()=>JSON.stringify(window.__replaySave.getSave()));
  await capture('01-extras-scenes');
  report.graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  await startRecording();await openVisit(3);await wait(2000);
  const before=await state();await page.keyboard.down('w');
  const walkStart=Date.now();while(Date.now()-walkStart<10000){await wait(200);if((await state()).view?.near)break;}
  await page.keyboard.up('w');const walked=await state();
  check('ordinary W moves the real borrowed field body',Math.hypot(walked.view.state.x-before.view.state.x,walked.view.state.z-before.view.state.z)>.3,{before:before.view.state,after:walked.view.state});
  check('the actual field door is approachable',walked.view.near);
  await page.keyboard.press('e');await wait(200);const reached=await state();check('ordinary E reaches the real door state',reached.view.state.tries>=1,reached.view.state.tries);
  await page.mouse.move(640,400);await page.mouse.move(650,395,{steps:3});await wait(400);const looked=await state();
  check('ordinary pointer input reaches the field camera',Math.abs(looked.view.state.yaw-reached.view.state.yaw)>.005,{before:reached.view.state.yaw,after:looked.view.state.yaw,pointer:looked.pointer});
  await capture('02-walking-door');await back();await wait(400);await stopRecording();
  for(const[index,name]of [[0,'first-breath'],[1,'ant'],[2,'third-door'],[4,'last-door']]){
    await openVisit(index);await wait(index===0?1200:1900);await capture(`03-${name}`);
    if(index===0){
      await page.waitForFunction(()=>window.__scenes.top()?.view?.()?.state?.elapsed>=3.65,{timeout:15000});
      const held=await state();await page.keyboard.down('w');await wait(800);await page.keyboard.up('w');
      const walking=await state();check('the first replay becomes a genuine walk after its authored breath',
        Math.hypot(walking.view.state.x-held.view.state.x,walking.view.state.z-held.view.state.z)>.3);
      await capture('03-first-after-breath-walk');
    }
    await back();
    check(`${name} opens the actual scene and returns`,(await state()).scene==='transfer-room');
  }
  await page.keyboard.press('2');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes.top()?.id==='transfer-field-replay'&&window.__scenes.top().view()?.ready,{timeout:120000});
  await wait(2800);await capture('04-seep-in-walkable-field');await back();
  await page.keyboard.press('3');await page.keyboard.press('Enter');await wait(500);
  check('a media plate can run under its exact extras owner',!!(await state()).takeover);
  await page.keyboard.press('Escape');await wait(200);check('Escape cancels media immediately',!(await state()).takeover);
  report.saveAfter=await page.evaluate(()=>JSON.stringify(window.__replaySave.getSave()));
  check('all replays preserve the run, flags, takes, clock and body byte for byte',report.saveBefore===report.saveAfter);
  await page.keyboard.press('Escape');check('closing extras returns to the real title',(await state()).scene==='title');await capture('05-returned-title');
  const intervals=await page.evaluate(()=>window.__replayQA.raf);const sorted=intervals.sort((a,b)=>a-b);report.frameIntervals={scope:'Observed browser frame intervals under native recording; not GPU timing or human smoothness acceptance.',count:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};
  check('no JavaScript, field-renderer or shader errors',report.errors.length===0,report.errors);
}catch(error){failure=String(error.stack||error);report.failure=failure;process.exitCode=1;console.error(failure);await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{
  report.pass=!failure;for(const key of['saveBefore','saveAfter'])if(report[key]){report[`${key}Sha256`]=sha(report[key]);delete report[key];}
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  await browser?.close();await server?.close();if(profile)await rm(profile,{recursive:true,force:true});
  console.log(JSON.stringify({pass:report.pass,failure,checks:report.checks,graphics:report.graphics,movie:report.movie},null,2));
}
