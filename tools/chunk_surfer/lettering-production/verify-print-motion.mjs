// Deterministic offline60Hz evidence over actual P3/R3d/final output. Encoding
// rate is never presented as game performance; native rAF is measured separately.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import puppeteer from 'puppeteer-core';
const args=new Map(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('='))),arm=args.get('arm')||'candidate',run=args.get('run')||'solid-paint-v1';
assert.ok(['baseline','candidate'].includes(arm));
const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334',out=path.resolve(`artifacts/lettering-production/motion-proof/${run}/${arm}`);
const baseline='artifacts/lettering-solid-paint/baseline/shader.js',shader='src/render/pixel-mesh/shader.js',sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=['src/render/r3d.js','src/render/props3d.js',shader,'src/render/printed-surface.js','public/assets/conservatory-props.glb',
 'public/assets/conservatory-props.lettering.json','artifacts/lettering-production/review.js','artifacts/lettering-study/encounters.js','artifacts/lettering-production/motion-probe.js'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(fs.readFileSync(f))]));
assert.ok(!fs.existsSync(path.join(out,'report.json')),'Frozen motion evidence already exists; select a fresh --run name rather than relabeling captured frames');
fs.mkdirSync(out,{recursive:true});const report={date:new Date().toISOString(),arm,sourceHashes:hashes(),servedAcquisitionShaderSha256:sha(fs.readFileSync(arm==='baseline'?baseline:shader)),
 servedAcquisitionShader:arm==='baseline'?baseline:shader,errors:[],clips:[],baselineRequests:0,
 scope:'Reconstructed actual Scene Dock and Vigil encounters, current physical meshes/materials/lights, target depth/atlas coverage and actual final output. Baseline substitutes only the saved acquisition shader at the same module URL. No whole-route, OCR or human reading claim.',
 interpretation:'Offline deterministic frames at monotonically advancing simulated60Hz are encoded at60fps. Wall-clock recording throughput is not60fps; native requestAnimationFrame throughput is measured separately without diagnostic readback.'};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',timeout:90000,protocolTimeout:180000,
  args:['--use-angle=metal','--no-sandbox','--disable-background-networking']});
 const page=await browser.newPage();await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 if(arm==='baseline'){
  await page.setRequestInterception(true);page.on('request',request=>{
   if(new URL(request.url()).pathname==='/src/render/pixel-mesh/shader.js'){report.baselineRequests++;request.respond({status:200,contentType:'text/javascript',body:fs.readFileSync(baseline,'utf8')});}
   else request.continue();
  });
 }
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}};});
 await page.goto(`${base}/artifacts/lettering-production/review.html`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.letteringProduction?.ready||window.letteringProduction?.failure,{timeout:120000});
 const failure=await page.evaluate(()=>window.letteringProduction.failure);if(failure)throw Error(failure);
 await page.waitForNetworkIdle({idleTime:600,timeout:120000});
 await page.evaluate(async()=>{window.printMotion=await import('/artifacts/lettering-production/motion-probe.js');});
 if(arm==='baseline')assert.ok(report.baselineRequests>0,'Saved shader was not served at its original module URL');
 report.realTimeRaf=await page.evaluate(()=>window.printMotion.realRafThroughput({scene:'dock',motion:'approach',scale:1}));save();
 const cases=[{scene:'dock',motion:'approach'},{scene:'vigil',motion:'walkby'},{scene:'dock',motion:'stationary'}]
  .flatMap(test=>[1,.5].map(scale=>({...test,scale,id:`${test.scene}-${test.motion}-s${scale}`}))).map((test,sequence)=>({...test,sequence})).filter(test=>!args.get('case')||test.id===args.get('case'));
 assert.ok(cases.length,'Unknown requested motion case');
 for(const test of cases){
  const folder=path.join(out,test.id);fs.mkdirSync(`${folder}/uv`,{recursive:true});fs.mkdirSync(`${folder}/stills`,{recursive:true});
  const setup=await page.evaluate(test=>window.printMotion.configure(test),test);
  fs.writeFileSync(`${folder}/expected-mask.png`,Buffer.from(setup.maskPng.split(',')[1],'base64'));delete setup.maskPng;
  const clock=await page.evaluate(sequence=>window.printMotion.startVirtual(sequence),test.sequence);
  const video=path.join(folder,'offline60fps.webm'),encoder=spawn('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','60','-vcodec','png','-i','pipe:0',
   '-an','-c:v','libvpx-vp9','-lossless','1','-pix_fmt','gbrp','-colorspace','rgb','-color_range','pc','-row-mt','1','-cpu-used','5',video],{stdio:['pipe','ignore','pipe']});
  let encoderErrors='';encoder.stderr.on('data',data=>encoderErrors+=data);const exit=once(encoder,'close');
  const frames=[],wallStart=performance.now();
  try{
   for(let index=0;index<=60;index++){
    const sample=await page.evaluate(index=>window.printMotion.sample(index),index),png=Buffer.from(sample.framePng.split(',')[1],'base64');
    assert.ok(sample.metadata.visible>100,'Projected depth-gated target has too few visible canonical samples; reject alignment before measuring paint');
    if(!encoder.stdin.write(png))await once(encoder.stdin,'drain');
    for(const [kind,key]of [['final','finalUvPng'],['scene','sceneUvPng'],['witness','witnessPng']])fs.writeFileSync(`${folder}/uv/${String(index).padStart(3,'0')}-${kind}.png`,Buffer.from(sample[key].split(',')[1],'base64'));
    if([0,30,60].includes(index))fs.writeFileSync(`${folder}/stills/${String(index).padStart(3,'0')}-native.png`,png);
    frames.push(sample.metadata);assert.equal(sample.metadata.glError,0,'GPU error while reading final/witness frames');
   }
  }finally{encoder.stdin.end();}
  const [code]=await exit;if(code!==0)throw Error(`Offline video encode failed: ${encoderErrors}`);
  const encoded=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,codec_name,pix_fmt,avg_frame_rate,nb_read_frames','-show_entries','format=duration,size','-of','json',video],{encoding:'utf8'}));
  assert.equal(Number(encoded.streams[0].nb_read_frames),61);assert.equal(encoded.streams[0].width,960);assert.equal(encoded.streams[0].height,600);
  execFileSync('/opt/homebrew/bin/ffmpeg',['-loglevel','error','-y','-i',video,'-frames:v','1',`${folder}/stills/decoded-first.png`]);
  const encodingPixelProof=JSON.parse(execFileSync('/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
   ['-c','from PIL import Image;import numpy as np,json,sys;a=np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int);b=np.asarray(Image.open(sys.argv[2]).convert("RGB")).astype(int);print(json.dumps(dict(maxRgbError=int(np.abs(a-b).max()),identicalRgb=bool(np.array_equal(a,b)))))',`${folder}/stills/000-native.png`,`${folder}/stills/decoded-first.png`],{encoding:'utf8'}));
  assert.equal(encodingPixelProof.maxRgbError,0,'Lossless RGB video changed actual rendered pixels');
  const clip={...test,folder,setup,clock,frames,encoded,encodingPixelProof,elapsedCaptureAndEncodeWallMs:performance.now()-wallStart,
   samples:61,simulatedSpanSeconds:1,encodedDurationSeconds:Number(encoded.format.duration),
   recordedShaderTimeStepMs:frames[1].virtualMs-frames[0].virtualMs,
   sourceWitnessContract:{canonical:'Real atlas-alpha in R; actual P3 mark tag in G; actual composed mark tag in B; depth-visible target in A. All arrays flipped bottom-left→top-left once.',
    finalUv:'Nearest actual final output RGB reprojected to surface UV; A is target visibility.',sceneUv:'Actual floating pre-acquisition scene RGB clamped to8bit for lighting context; A is target visibility.',
    targetVisibility:'Independent expected planar view depth versus actual packed24bit P3 depth within25mm and floating composed world depth within40mm.',
    depthPacking:'P3 near/far read from initialized targets; composed scene alpha is1/(1+viewMetres*.14).'}};
  fs.writeFileSync(`${folder}/frames.json`,JSON.stringify(clip,null,2)+'\n');report.clips.push({id:test.id,folder,video,...Object.fromEntries(Object.entries(clip).filter(([key])=>!['frames','folder'].includes(key)))});save();
  console.log(JSON.stringify({arm,case:test.id,frames:61,simulationSeconds:1,offlineEncodedFps:60,wallSeconds:clip.elapsedCaptureAndEncodeWallMs/1000}));
 }
 report.sourceHashesAfter=hashes();assert.deepEqual(report.sourceHashesAfter,report.sourceHashes,'Concurrent source/asset mutation invalidates matched motion evidence');
 assert.deepEqual(report.errors,[]);report.sourcesUnchanged=true;save();
 execFileSync('/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',['tools/chunk_surfer/lettering-production/analyze-print-motion.py',out],{stdio:'inherit'});
}catch(error){report.failure=error.message;save();throw error;}finally{
 if(browser){const child=browser.process();let timer;await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(()=>{child?.kill('SIGTERM');resolve();},10000);})]);clearTimeout(timer);}
}
