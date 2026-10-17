// Direct renderer motion proof: native monotonic clock, no per-frame readback.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const base='http://127.0.0.1:5334',out='artifacts/lettering-production/renderer-proof/direct-motion';mkdirSync(`${out}/frames`,{recursive:true});
const original=JSON.parse(readFileSync('artifacts/lettering-production/renderer-proof/final/report.json'));
const hashes=()=>Object.fromEntries(Object.keys(original.sourceHashes).map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
assert.deepEqual(hashes(),original.sourceHashes,'The renderer/content/asset freeze changed before recording');
const report={date:new Date().toISOString(),sourceHashes:hashes(),errors:[],console:[],clips:[],targetFps:60,
 scope:'Production mesh instances in reconstructed actual encounters, direct R.r3dCanvas captureStream. Native performance.now is never overridden. No per-frame Canvas2D/PNG readback or paired rendering. Reduced motion/flash, memory off; controlled camera motion, not live input play.'};
const save=()=>writeFileSync(`${out}/report.json`,`${JSON.stringify(report,null,2)}\n`);
const luminance=async(path)=>{const{data}=await sharp(path).extract({left:384,top:236,width:192,height:128}).removeAlpha().raw().toBuffer({resolveWithObject:true});let mean=0,bright=0;
 for(let i=0;i<data.length;i+=3){const y=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;mean+=y;bright+=y>.5;}return{roi:[384,236,192,128],meanLuma:mean/(data.length/3),brightFraction:bright/(data.length/3)};};
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:180000,args:['--use-angle=metal','--no-sandbox']});
try{const page=await browser.newPage();await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>report.console.push({type:m.type(),text:m.text()}));
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}};});
 await page.goto(`${base}/artifacts/lettering-study/review.html`,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.letteringStudy?.ready,{timeout:60000});
 for(const test of[{id:'services',motion:'approach',name:'production-services-approach',reference:'pale-enamel'},{id:'placard',motion:'walkby',name:'production-placard-walkby',reference:'brush-placard'}]){
  const clip=await page.evaluate(async test=>{
   const S=window.letteringStudy;S.stop();const e=await S.configure(test.id,960,600,1),R=S.R,canvas=R.r3dCanvas(),cfg=e.lightStates.torch;
   R.r3dSetProps(e.props);R.r3dSetDynamicProps([]);R.r3dSetPrintedSurfaceMode(3);R.r3dSetPixelMesh({debugSource:'final',reduceMotion:true,reduceFlash:true,memory:false});
   R.r3dSetLightingContext(cfg.context);R.r3dSetLocalLights(cfg.lights);R.r3dSetSourceEmergency(cfg.emergency||0);
   const state={px:0,py:0,floorH:0,tileW:12,tileH:12,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:1,plan:true,water:{active:false},sensoryProfile:'story',textSpace:!!e.sourceRoomLighting,torchLook:{power:1}};
   const render=(t)=>{const distance=test.motion==='approach'?8-6.5*t:3,offset=test.motion==='walkby'?-2+4*t:0,cam=e.camera(distance,offset),body=e.validateCamera(distance,offset);
    if(!body.walkable||body.bodyObstacle||body.propClear===false)throw Error(`Obstructed native camera ${JSON.stringify(body)}`);
    state.px=cam.x/.5-.5;state.py=cam.z/.5-.5;state.floorH=cam.y-1.62;R.r3dSetLookAngles({yaw:cam.yaw,pitch:cam.pitch||0});R.r3dSnapCameraOnNextFrame();
    const begin=performance.now();R.r3dFrame(state);return{time:performance.now(),submissionMs:performance.now()-begin,distance,offset,camera:cam,body,torch:R.r3dLightingDebug().torch,glError:canvas.getContext('webgl2').getError()};};
   const warmStart=performance.now();let warmFrames=0;do{render(0);warmFrames++;await new Promise(r=>requestAnimationFrame(r));}while(performance.now()-warmStart<1000);
   const warmDuration=performance.now()-warmStart,stream=canvas.captureStream(60),mimeType='video/webm;codecs=vp9',rec=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
   const stopped=new Promise(r=>rec.onstop=r),start=performance.now(),frames=[];rec.start();let t=0;
   do{t=Math.min(1,(performance.now()-start)/8000);frames.push(render(t));await new Promise(r=>requestAnimationFrame(r));}while(t<1);
   rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mimeType}),url=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(blob);});
   const gaps=frames.slice(1).map((f,i)=>f.time-frames[i].time),sorted=[...gaps].sort((a,b)=>a-b);
   return{url,frames,warmup:{durationMs:warmDuration,warmFrames},durationMs:performance.now()-start,
    callbackGapMs:{median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},
    sourceMesh:e.targetMesh,capturePixels:[canvas.width,canvas.height],actualState:state,settings:R.r3dPixelMeshSettings()};
  },test);
  const file=`${test.name}.webm`;writeFileSync(`${out}/${file}`,Buffer.from(clip.url.split(',')[1],'base64'));delete clip.url;
  clip.encoded=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,codec_name,nb_read_frames','-show_entries','format=duration,size','-of','json',`${out}/${file}`],{encoding:'utf8'}));
  const stream=clip.encoded.streams[0];clip.decodedFps=Number(stream.nb_read_frames)/Number(clip.encoded.format.duration);
  const reference=await luminance(`artifacts/lettering-production/renderer-proof/final/${test.reference}-960x600-s1-mode3-final.png`);
  clip.exposureGate={reference,minimumMeanLuma:Math.max(.025,reference.meanLuma*.1),minimumBrightFraction:.02,requiredTimes:[4,7],reason:'Reject a dark recording despite a valid encoded stream. Threshold is at least10% of matched native3m torch-reference ROI; beginning of far approach is recorded but not required to read.'};
  clip.decodedFrames=[];for(const time of[1,4,7]){const image=`frames/${test.name}-${time}s.png`;execFileSync('/opt/homebrew/bin/ffmpeg',['-loglevel','error','-ss',String(time),'-i',`${out}/${file}`,'-frames:v','1','-y',`${out}/${image}`]);clip.decodedFrames.push({time,image,...await luminance(`${out}/${image}`)});}
  clip.steadyTorch=clip.frames.every(f=>Number.isFinite(f.torch.power)&&f.torch.power>=.99&&Number.isFinite(f.torch.lightEase)&&f.torch.lightEase>=.99);
  report.clips.push({...test,file,...clip});save();assert.ok(clip.steadyTorch,'Torch did not remain at actual settledpower1');assert.ok(clip.frames.every(f=>f.glError===0));
  assert.ok(clip.decodedFrames.filter(f=>clip.exposureGate.requiredTimes.includes(f.time)).every(f=>f.meanLuma>=clip.exposureGate.minimumMeanLuma&&f.brightFraction>=clip.exposureGate.minimumBrightFraction),'Decoded native clip is underexposed');
  assert.ok(Number(stream.nb_read_frames)>=8&&Number(clip.encoded.format.duration)>=6);console.log(JSON.stringify({file,decodedFps:clip.decodedFps,gaps:clip.callbackGapMs,steadyTorch:clip.steadyTorch,brightness:clip.decodedFrames}));
 }
 report.sourceHashesAfter=hashes();report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();assert.deepEqual(report.errors,[]);assert.ok(report.sourcesUnchanged);
}catch(e){report.failure=e.message;save();throw e;}finally{await browser.close();}
