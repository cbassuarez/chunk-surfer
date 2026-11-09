// Focused production Ophanim proof. One explicit test-run/prologue entry; all
// dialogue, hold, pause and skip inputs thereafter use ordinary keyboard events.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.OPHANIM_OUT||'artifacts/opening-ophanim-audit/live');
const port=Number(process.env.OPHANIM_PORT)||5419;
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const sources=['src/game/opening-prologue-scene.js','src/data/opening-prologue.js','src/render/opening-omen.js','src/audio/opening-prologue-audio.js','src/game/source-drive/prologue-drive.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,await hash(path)])));
await mkdir(out,{recursive:true});
const report={method:'Explicit test-run/prologue QA entry followed by ordinary keyboard dialogue, waiting, pause and deliberate skip. Native Metal final dither with real audio. This is focused scripted QA, not a complete New Run or unfamiliar human acceptance.',checks:[],captures:[],errors:[],servedSources:{},sourceStart:await hashes()};
let server,browser,page,profile,recording=false;
const state=()=>page.evaluate(()=>({scene:window.__scenes.top()?.id,view:window.__probe.sixLoop.prologue.view(),
  prologue:window.__probe.sixLoop.prologue.state(),audio:window.__probe.openingPrologueAudio(),
  glError:document.querySelector('canvas.r3d')?.getContext('webgl2')?.getError()}));
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));if(!pass)throw Error(name);};
async function capture(name){
  const value=await state(),path=join(out,`${name}.png`);await page.screenshot({path});
  const raw=await page.evaluate(()=>Object.fromEntries(['scene','vfd'].map(layer=>[layer,window.__probe.sourceShoreCapture(layer)])));
  const files={};for(const[layer,data]of Object.entries(raw))if(data?.includes(';base64,')){
    const file=join(out,`${name}-${layer}.png`);await writeFile(file,Buffer.from(data.slice(data.indexOf(';base64,')+8),'base64'));files[layer]=file;
  }
  report.captures.push({name,path,files,...value});console.log('CAPTURE',name,JSON.stringify({node:value.view?.nodeId,stage:value.view?.stageId,beat:value.view?.beat,gl:value.glError}));
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
}
async function settleLine(){
  await page.waitForFunction(()=>{const v=window.__probe.sixLoop.prologue.view();return v?.pending||(!v?.typing&&v?.voice==null&&v?.lineAge>.55);},{timeout:45000,polling:150});
}
async function reachQuestion(id){
  for(let n=0;n<45;n++){
    const view=await page.evaluate(()=>window.__probe.sixLoop.prologue.view());
    if(view?.pending){if(view.nodeId!==id)throw Error(`Expected ${id}, received ${view.nodeId}`);return view;}
    if(!view)throw Error('The prologue ended before its question');
    await settleLine();await page.keyboard.press('Enter');await wait(180);
  }
  throw Error(`Could not reach question ${id}`);
}
async function reachQuestionFast(id){
  for(let n=0;n<100;n++){
    const view=await page.evaluate(()=>window.__probe.sixLoop.prologue.view());
    if(view?.pending){if(view.nodeId!==id)throw Error(`Expected ${id}, received ${view.nodeId}`);return view;}
    await page.keyboard.press('Enter');await wait(180);
  }
  throw Error(`Could not reach accelerated supplementary question ${id}`);
}
async function choose(id){
  const view=await page.evaluate(()=>window.__probe.sixLoop.prologue.view()),options=view.pending?.options||[];
  const at=options.findIndex(row=>row.goto===id);if(at<0)throw Error(`No visible answer ${id}`);
  const current=view.pending.index||0;
  for(let n=0;n<(at-current+options.length)%options.length;n++)await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');await wait(180);
}
async function stopRecording(){
  if(!recording)return;recording=false;
  const data=await page.evaluate(()=>new Promise(resolve=>{
    const q=window.__ophanimRecording;clearInterval(q.timer);cancelAnimationFrame(q.frame);
    q.recorder.onstop=async()=>{const blob=new Blob(q.parts,{type:q.mime}),reader=new FileReader();reader.onload=()=>resolve({data:reader.result,bytes:blob.size,mime:q.mime,samples:q.samples,audioTracks:q.stream.getAudioTracks().length});reader.readAsDataURL(blob);};q.recorder.stop();
  }));
  const path=join(out,'ophanim-ordinary-dialogue.webm'),marker=';base64,',at=data.data.indexOf(marker);
  if(at<0)throw Error('No base64 payload marker in recording');
  const bytes=Buffer.from(data.data.slice(at+marker.length),'base64');
  if(bytes.length!==data.bytes||bytes.readUInt32BE(0)!==0x1a45dfa3)throw Error('The saved recording does not match its real WebM blob');
  await writeFile(path,bytes);delete data.data;
  report.recording={path,...data,actualFileBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};console.log('RECORDING',JSON.stringify({bytes:bytes.length,samples:data.samples.length,audioTracks:data.audioTracks}));
}
try{
  server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
  profile=await mkdtemp(join(tmpdir(),'chunk-ophanim-audit-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:true,defaultViewport:null,protocolTimeout:300000,
    args:['--no-sandbox','--window-size=1280,800','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);
  page.on('pageerror',error=>report.errors.push(String(error.stack||error)));
  page.on('console',message=>{if(/shader.*error|ERROR: 0:|opening-prologue.*Continuing without/i.test(message.text()))report.errors.push(message.text());});
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/src/')&&response.status()===200&&String(response.headers()['content-type']).includes('javascript'))response.text().then(text=>report.servedSources[path]={sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text)}).catch(()=>{});});
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
    window.__ophanimAudioTaps=[];
    const original=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination,...rest){
      if(destination===this.context.destination){let tap=window.__ophanimAudioTaps.find(row=>row.ctx===this.context);if(!tap){tap={ctx:this.context,node:this.context.createMediaStreamDestination()};window.__ophanimAudioTaps.push(tap);}original.call(this,tap.node,...rest);}
      return original.call(this,destination,...rest);
    };
  });
  await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top()?.id,{timeout:300000,polling:1000});
  await page.keyboard.press('Enter');await wait(400);
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.sixLoop.prologue.begin();});
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.phase==='film',{timeout:300000,polling:300});
  const graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)};});
  report.graphics=graphics;console.log('BOOTED',graphics.renderer);
  await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight;
    const painter=canvas.getContext('2d'),stream=canvas.captureStream(24);
    const audio=window.__ophanimAudioTaps.find(row=>row.ctx.state==='running')?.node.stream.getAudioTracks()[0];if(audio)stream.addTrack(audio);
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000}),parts=[],samples=[];
    const q=window.__ophanimRecording={stream,mime,recorder,parts,samples};
    const draw=()=>{painter.fillStyle='#000';painter.fillRect(0,0,canvas.width,canvas.height);
      const layers=[...document.querySelectorAll('canvas')].filter(layer=>{const rect=layer.getBoundingClientRect();return rect.width&&rect.height&&getComputedStyle(layer).display!=='none';})
        .sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
      for(const layer of layers){const rect=layer.getBoundingClientRect();painter.drawImage(layer,rect.left,rect.top,rect.width,rect.height);}
      q.frame=requestAnimationFrame(draw);};draw();
    recorder.ondataavailable=event=>{if(event.data.size)parts.push(event.data);};
    q.timer=setInterval(()=>samples.push({at:performance.now(),view:window.__probe.sixLoop.prologue.view(),audio:window.__probe.openingPrologueAudio(),state:window.__probe.sixLoop.prologue.state()}),250);recorder.start(500);
  });recording=true;
  await wait(5000);await capture('01-first-road-and-narration');
  await wait(12000);await reachQuestion('there');await capture('02-first-answer');
  await choose('who');await reachQuestion('look');await capture('03-interval-and-wheels');
  await choose('interval-eyes');await reachQuestion('interval-eyes');await capture('04-one-eye-left');
  await choose('interval-meet');await reachQuestion('job');await capture('05-chosen-act-retained');
  const acted=(await state()).view;
  check('the chosen gaze leaves a visible eye consequence',acted.openingAct?.id==='gaze'&&acted.stage.shut>=1,{act:acted.openingAct,shut:acted.stage.shut});
  await choose('job-rooms');await reachQuestion('ellery');await capture('06-work-terms-and-school-stakes');
  await choose('hearing-quiet');await reachQuestion('margin');await capture('07-the-road-still-needs-you');
  await choose('margin-next');await reachQuestion('fate');await capture('08-optional-fates');
  await page.keyboard.down('w');await wait(1400);await page.keyboard.up('w');
  check('holding a navigation key does not skip the opening',(await state()).scene==='opening-prologue');
  await page.keyboard.down('e');await wait(450);await page.keyboard.press('Escape');await page.keyboard.up('e');await wait(700);
  check('Escape opens ordinary Pause',await page.evaluate(()=>window.__scenes.top()?.id==='pause'));
  await page.keyboard.press('Escape');await wait(1400);
  check('a partial skip is cancelled across Pause',(await state()).scene==='opening-prologue'&&(await state()).view.skip===0);
  await capture('09-resumed-without-skipping');
  await choose('f-enough');
  for(let n=0;n<30&&(await state()).view?.nodeId!=='card';n++){await settleLine();await page.keyboard.press('Enter');await wait(180);}
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.nodeId==='card',{timeout:30000});
  await capture('10-arrival-time-card');
  await page.waitForFunction(()=>window.__scenes.top()?.id!=='opening-prologue',{timeout:15000});
  check('the middle route completes through ordinary choices and its arrival card',(await state()).scene!=='opening-prologue');
  await stopRecording();
  await page.evaluate(()=>window.__probe.sixLoop.prologue.begin());
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.phase==='film',{timeout:120000});
  // Separate supplementary refusal path, using ordinary accelerated reading.
  await reachQuestionFast('there');await choose('quiet');await reachQuestionFast('look');
  await choose('interval-refuse');await reachQuestionFast('job');await wait(4500);
  await capture('11-explicit-refusal-keeps-its-answer');
  check('refusal remains an acknowledged viable act',(await state()).view.openingAct?.id==='refuse'&&(await state()).view.stage.shut>=1);
  // A separate, explicit pose fixture after the uninterrupted ordinary walk.
  // One renderer/context/camera/clock, changing only the opening eye uniform.
  await page.evaluate(()=>window.__probe.sixLoop.prologue.seekStage('interval'));await wait(700);
  await page.evaluate(()=>{const scene=window.__scenes.top(),pose=scene.view().stage;scene.pause();scene.pose({...pose,eyePresentation:[0,0]});});await wait(600);
  await capture('12-calibration-knots-previous-ink');
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose({...scene.view().stage,eyePresentation:[1,.96]});});await wait(600);
  await capture('13-calibration-watching-eyes');
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose(null);scene.resume();});
  await page.keyboard.down('e');await wait(1400);await page.keyboard.up('e');await wait(600);
  check('a deliberate held skip remains a separate valid exit',(await state()).scene!=='opening-prologue');
  check('the real recording includes game audio',report.recording.audioTracks>0,{audioTracks:report.recording.audioTracks});
  check('no JavaScript or shader error',report.errors.length===0,report.errors);
  // Other task owner's fresh control-strip supplement; after all Ophanim proof.
  await page.evaluate(()=>window.__probe.godRow('transfer-room'));await wait(250);
  await page.keyboard.press('2');await page.keyboard.press('1');
  for(let n=0;n<3;n++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await wait(2500);const supplement=join(out,'14-extras-control-strip.png');await page.screenshot({path:supplement});
  report.extrasControlSupplement={path:supplement,scene:await page.evaluate(()=>window.__scenes.top()?.id)};
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;console.error(report.failure);await capture('failure').catch(()=>{});await stopRecording().catch(()=>{});}
finally{
  report.sourceEnd=await hashes();report.focusedSourcesStable=JSON.stringify(report.sourceStart)===JSON.stringify(report.sourceEnd);
  await browser?.close().catch(()=>{});await server?.close().catch(()=>{});if(profile)await rm(profile,{recursive:true,force:true});
  if(report.recording?.actualFileBytes){
    try{
      report.recording.ffprobe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type,sample_rate,channels','-show_entries','format=duration,size','-of','json',report.recording.path],{encoding:'utf8'}));
      const decoded=execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-i',report.recording.path,'-progress','pipe:1','-f','null','-'],{encoding:'utf8',maxBuffer:8*1024*1024});
      const times=[...decoded.matchAll(/out_time_us=(\d+)/g)].map(row=>Number(row[1]));
      report.recording.decodedSeconds=times.length?Math.max(...times)/1e6:null;report.recording.fullDecodePassed=true;
    }catch(error){report.recording.fullDecodePassed=false;report.recording.decodeError=String(error);process.exitCode=1;}
  }
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log('CLOSED',JSON.stringify({checks:report.checks.length,failure:report.failure||null}));
}
