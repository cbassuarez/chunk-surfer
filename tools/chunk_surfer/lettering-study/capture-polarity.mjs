// Controlled credible material-polarity comparison; same copy and glyph mask.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const output='artifacts/lettering-study/evidence';mkdirSync(output,{recursive:true});
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sources=['src/render/lettering-study.js','src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js',
 'artifacts/lettering-study/review.js','public/assets/lettering-study/signs.glb','public/assets/lettering-study/manifest.json',
 'public/assets/lettering-study/polarity.glb','public/assets/lettering-study/polarity-manifest.json'];
const report={date:new Date().toISOString(),sourceHashes:Object.fromEntries(sources.map(path=>[path,sha(path)])),
 frames:[],video:null,errors:[],humanReading:'Not performed. These are controlled rendering diagnostics, not a new participant result.',
 control:'Same condensed letterforms, spacing, size, actual Source dock placement, camera, light, exposure, normal, ORM and wear. Albedo substrate/pigment palette alone changes.'};
const save=()=>writeFileSync(`${output}/polarity-capture-report.json`,JSON.stringify(report,null,2));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}
 };});
 await page.goto(`${process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334'}/artifacts/lettering-study/review.html`,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.letteringStudy?.ready&&window.letteringStudy?.polarityReady,{timeout:90000});await page.waitForNetworkIdle({idleTime:800,timeout:60000});
 for(const [width,height,scale] of [[960,600,1],[1280,720,1],[960,600,.5]]){
  await page.evaluate(async({width,height,scale})=>{const S=window.letteringStudy;S.stop();await S.configure('services',width,height,scale);S.R.r3dSetPixelMesh({debugSource:'final',reduceMotion:true,reduceFlash:true,memory:false});},{width,height,scale});
  for(const variant of ['fabricated','light-enamel'])for(const stage of ['props','scene','final']){
   const result=await page.evaluate(({variant,stage})=>{const S=window.letteringStudy;for(let n=0;n<4;n++)S.renderSample({variant,stage,light:'torch',distance:3});const s=S.renderSample({variant,stage,light:'torch',distance:3});return{url:s.frame.toDataURL('image/png'),evidence:s.evidence,settings:S.R.r3dPixelMeshSettings(),worldYaw:S.R.r3dWorldYaw()};},{variant,stage});
   const color=variant==='fabricated'?'green':'cream',file=`services-polarity-${color}-${width}x${height}-s${scale}-${stage}.png`;
   writeFileSync(`${output}/${file}`,Buffer.from(result.url.split(',')[1],'base64'));delete result.url;
   report.frames.push({width,height,scale,variant,stage,file,...result});assert.equal(result.evidence.glError,0);
  }save();
 }
 const recording=await page.evaluate(async()=>{
  const S=window.letteringStudy;await S.configure('services',960,600,1);S.R.r3dSetPixelMesh({debugSource:'final',reduceMotion:true,reduceFlash:true,memory:false});
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=632;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(12);
  const mimeType=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3500000}),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>recorder.onstop=r);
  const path=[],start=performance.now();recorder.start();let t=0;
  do{
   t=Math.min(1,(performance.now()-start)/8000);const distance=8-6.5*t;ctx.fillStyle='#111810';ctx.fillRect(0,0,canvas.width,canvas.height);
   const pair=[];
   for(const [side,variant] of ['fabricated','light-enamel'].entries()){
    const sample=S.renderSample({variant,light:'torch',distance});ctx.drawImage(sample.frame,side*960,32);
    ctx.fillStyle='#d5dfca';ctx.font='13px monospace';ctx.fillText(`${side===0?'GREEN GROUND / LIGHT INK':'PALE GROUND / DARK INK'} / ${distance.toFixed(2)} m / FINAL`,side*960+12,21);
    pair.push({variant,camera:sample.evidence.camera,glError:sample.evidence.glError,worldYaw:S.R.r3dWorldYaw()});
   }
   path.push({elapsedMs:performance.now()-start,distance,pair});await new Promise(r=>requestAnimationFrame(r));
  }while(t<1);
  recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mimeType});
  const url=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(blob);});
  return{url,path,mimeType,bytes:blob.size,elapsedMs:performance.now()-start,renderedPairs:path.length,
   note:'Controlled paired approach, identical eye/heading per pair. Reduced motion and memory off isolate sampling; separate full-default footage is retained independently. Rendered pairs are not encoded video frames.'};
 });
 const file='services-polarity-approach.webm';writeFileSync(`${output}/${file}`,Buffer.from(recording.url.split(',')[1],'base64'));delete recording.url;
 recording.encodedVideo=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,codec_name,nb_read_frames','-show_entries','format=duration,size','-of','json',`${output}/${file}`],{encoding:'utf8'}));
 report.video={file,...recording};assert.ok(recording.path.every(p=>p.pair.every(s=>s.glError===0)));assert.ok(recording.path.every(p=>JSON.stringify(p.pair[0].camera)===JSON.stringify(p.pair[1].camera)),'Polarity footage changed the camera between variants');
 report.sourceHashesAfter=Object.fromEntries(sources.map(path=>[path,sha(path)]));report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();
 assert.ok(report.sourcesUnchanged);assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify({frames:report.frames.length,video:recording.encodedVideo,sourcesUnchanged:report.sourcesUnchanged,errors:report.errors}));
}catch(error){report.failure=error.message;save();throw error;}finally{
 const process=browser.process();let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(()=>{process?.kill('SIGTERM');resolve();},10000);})]);}finally{clearTimeout(timer);}
}
