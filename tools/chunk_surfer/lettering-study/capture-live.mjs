// Default-motion supplementary evidence. Unlike the controlled A/B movie,
// one after-only camera traverses each scene without alternating variants.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334';
const output='artifacts/lettering-study/evidence';mkdirSync(output,{recursive:true});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sourcePaths=['src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js',
 'artifacts/lettering-study/review.js','public/assets/lettering-study/signs.glb'];
const errors=[];
const report={date:new Date().toISOString(),sourceHashes:Object.fromEntries(sourcePaths.map(p=>[p,sha(p)])),
 videos:[],protocolQA:null,errors,humanReading:'Not performed. Browser protocol checks are synthetic UI tests, not human transcription evidence.'};
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 headless:'new',args:['--use-angle=metal','--no-sandbox']});
async function bootstrap(blind=false){
 const page=await browser.newPage();await page.setViewport({width:1200,height:900,deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  send(){}close(){this.readyState=3;}
 };});
 await page.goto(`${base}/artifacts/lettering-study/review.html${blind?'?blind=1':''}`,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.letteringStudy?.ready,{timeout:90000});
 await page.waitForNetworkIdle({idleTime:800,timeout:60000});return page;
}
function save(){writeFileSync(`${output}/live-report.json`,JSON.stringify(report,null,2));}
try{
 const page=await bootstrap();
 for(const id of ['services','placard']){
  const result=await page.evaluate(async id=>{
   const S=window.letteringStudy;S.stop();const encounter=await S.configure(id,960,600,1);
   S.R.r3dSetPixelMesh({reduceMotion:false,reduceFlash:false,memory:true});
   const from=id==='placard'?5:8;
   // The absolute starting camera and its reset happen once, before recording.
   const first=S.renderSample({variant:'fabricated',light:'torch',distance:from,reset:false});
   const heldLook={yaw:first.evidence.camera.yaw,pitch:first.evidence.camera.pitch||0};
   const resetPolicy='Absolute starting look setter resets once before clip; fixed heading and pitch, no per-frame look call or reset';
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;
   const ctx=canvas.getContext('2d'),stream=canvas.captureStream(15);
   const mimeType=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
   const chunks=[],recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3000000});
   recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>recorder.onstop=r);
   const path=[],settingsBefore=S.R.r3dPixelMeshSettings(),start=performance.now();
   let finalEvidence=first.evidence;recorder.start();let t=0;
   do{
    t=Math.min(1,(performance.now()-start)/8000);const distance=from-(from-1.5)*t;
    const camera={...encounter.camera(distance),...heldLook};
    const sample=S.renderSample({variant:'fabricated',light:'torch',distance,camera,reset:false,live:true});
    ctx.drawImage(sample.frame,0,0);finalEvidence=sample.evidence;
    path.push({elapsedMs:performance.now()-start,distance,camera:sample.evidence.camera,
     eye:sample.evidence.eye,worldYaw:S.R.r3dWorldYaw(),targetLook:S.R.r3dLookAngles(),
     capHeightPx:sample.evidence.capHeightPx,strokePx:sample.evidence.strokePx,glError:sample.evidence.glError});
    await new Promise(r=>requestAnimationFrame(r));
   }while(t<1);
   recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const blob=new Blob(chunks,{type:mimeType});
   const url=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob);});
   return{id,url,path,mimeType,bytes:blob.size,elapsedMs:performance.now()-start,frames:path.length,
    acquisition:{width:960,height:600,scale:1},settingsBefore,settingsAfter:S.R.r3dPixelMeshSettings(),
    resetPolicy,heldLook,initialEvidence:first.evidence,finalEvidence,
    note:'After only; full default acquisition with head held steady, actual production final output, full motion, flashes permitted and memory enabled. Initial absolute camera/reset occurs before recording. Physical translation follows the same validated path; the target naturally drifts because heading and pitch remain fixed. Production r3dLook clears memory when called; this clip performs no per-frame look calls.'};
  },id);
  writeFileSync(`${output}/${id}-live-approach.webm`,Buffer.from(result.url.split(',')[1],'base64'));
  result.renderedFrames=result.frames;
  try{result.encodedVideo=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames',
   '-show_entries','stream=width,height,codec_name,avg_frame_rate,nb_read_frames','-show_entries','format=duration,size',
   '-of','json',`${output}/${id}-live-approach.webm`],{encoding:'utf8'}));}
  catch{result.encodedVideo=null;}
  delete result.url;report.videos.push(result);save();
  assert.ok(result.frames>=20&&result.bytes>1000,`${id}: incomplete live recording`);
  assert.equal(result.settingsBefore.reduceMotion,false);assert.equal(result.settingsBefore.reduceFlash,false);assert.equal(result.settingsBefore.memory,true);
  assert.ok(result.path.every(p=>p.glError===0),`${id}: GPU error during live traversal`);
  console.log(JSON.stringify({id,frames:result.frames,elapsedMs:result.elapsedMs,bytes:result.bytes,resetPolicy:result.resetPolicy}));
 }
 await page.close();
 const blind=await bootstrap(true);
 report.protocolQA=await blind.evaluate(async()=>{
  const visible=element=>!!element&&getComputedStyle(element).display!=='none'&&element.getBoundingClientRect().height>0;
  const header=document.querySelector('header'),nav=document.querySelector('nav'),study=document.querySelector('#study'),begin=document.querySelector('#trialBegin'),fresh=document.querySelector('#freshReader'),input=document.querySelector('#transcription'),next=document.querySelector('#trialNext'),canvas=document.querySelector('#blindCanvas');
  const visibleCopy=document.body.innerText,hidden={header:!visible(header),nav:!visible(nav),study:!visible(study)};
  const answersVisible=/STUDIOS\s*\/\s*PLANT|SAVE\s+ELLERY/.test(visibleCopy);
  const before={beginDisabled:begin.disabled,freshnessUnchecked:!fresh.checked,inputDisabled:input.disabled,nextDisabled:next.disabled,storedAnswers:localStorage.getItem('ellery-lettering-trials')};
  // This program declares a synthetic fresh test subject only to exercise the
  // protocol. It neither enters nor submits a transcription.
  fresh.checked=true;fresh.dispatchEvent(new Event('change'));
  const enabledAfterFreshness=!begin.disabled,start=performance.now();begin.click();
  while(document.querySelector('#trialStatus').textContent!=='View 1 / 2'&&performance.now()-start<10000)await new Promise(r=>setTimeout(r,10));
  const begun=performance.now();
  const pixels=()=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let nonblack=0;for(let i=0;i<data.length;i+=4)if(data[i]||data[i+1]||data[i+2])nonblack++;return nonblack;};
  const initialNonblackPixels=pixels(),disabledDuringExposure=input.disabled&&next.disabled;
  await new Promise(r=>setTimeout(r,2500));const at2500ms={nonblackPixels:pixels(),inputDisabled:input.disabled,nextDisabled:next.disabled};
  while(input.disabled&&performance.now()-begun<6000)await new Promise(r=>setTimeout(r,5));
  const after={elapsedSinceViewMs:performance.now()-begun,nonblackPixels:pixels(),inputEnabled:!input.disabled,nextEnabled:!next.disabled,inputValue:input.value,storedAnswers:localStorage.getItem('ellery-lettering-trials')};
  return{hidden,answersVisible,before,enabledAfterFreshness,initialNonblackPixels,disabledDuringExposure,at2500ms,after,
   noResponseSubmitted:true,resultType:'Synthetic protocol UI check; not an unbriefed reading test or a scored participant.'};
 });
 await blind.screenshot({path:`${output}/blind-protocol-after.png`,fullPage:true});await blind.close();save();
 const p=report.protocolQA;
 assert.ok(Object.values(p.hidden).every(Boolean)&&!p.answersVisible,'Blind entry exposes the study or answer');
 assert.ok(p.before.beginDisabled&&p.before.freshnessUnchecked&&p.before.inputDisabled&&p.before.nextDisabled,'Freshness/response gates are absent');
 assert.ok(p.enabledAfterFreshness&&p.initialNonblackPixels>100&&p.disabledDuringExposure,'Trial did not expose a gated image');
 assert.ok(p.at2500ms.nonblackPixels>100&&p.at2500ms.inputDisabled&&p.at2500ms.nextDisabled,'Trial disappeared or accepted a response before three seconds');
 assert.ok(p.after.elapsedSinceViewMs>=2850&&p.after.elapsedSinceViewMs<4500,'Exposure duration differs materially from three seconds');
 assert.ok(p.after.nonblackPixels===0&&p.after.inputEnabled&&p.after.nextEnabled,'Exposure did not end with an opaque black field and enabled transcription');
 assert.equal(p.after.inputValue,'');assert.equal(p.after.storedAnswers,p.before.storedAnswers,'Protocol QA persisted a synthetic answer');
 report.sourceHashesAfter=Object.fromEntries(sourcePaths.map(p=>[p,sha(p)]));
 report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();
 assert.ok(report.sourcesUnchanged,'Capture inputs changed during the live evidence run');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({videos:report.videos.length,protocolQA:'passed',sourcesUnchanged:report.sourcesUnchanged,errors}));
}catch(error){report.failure=error.message;save();throw error;}finally{
 // macOS's Metal-backed headless process can stall after its final context is
 // destroyed. Bound cleanup to this exact browser child, never other browsers.
 const process=browser.process();let timer;
 try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(()=>{process?.kill('SIGTERM');resolve();},10000);})]);}
 finally{clearTimeout(timer);}
}
