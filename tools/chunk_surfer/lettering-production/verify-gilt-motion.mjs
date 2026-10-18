// Deterministic offline60Hz evidence over actual P3/R3d/final output. Encoding
// rate is never presented as game performance; native rAF is measured separately.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import puppeteer from 'puppeteer-core';
import {gzipSync,gunzipSync} from 'node:zlib';
const args=new Map(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('='))),arm=args.get('arm')||'candidate',run=args.get('run')||'gilt-v1';
assert.ok(['baseline','candidate'].includes(arm));
const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334',out=path.resolve(`artifacts/lettering-production/gilt/motion-proof/${run}/${arm}`);
const baseline='artifacts/lettering-production/gilt/baseline/shader.js',shader='src/render/pixel-mesh/shader.js',sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=['src/render/r3d.js','src/render/props3d.js',shader,'src/render/printed-surface.js','public/assets/conservatory-props.glb',
 'public/assets/conservatory-props.lettering.json','artifacts/lettering-production/review.js','artifacts/lettering-study/encounters.js','artifacts/lettering-production/gilt/encounter.js','artifacts/lettering-production/gilt/motion-probe.js','src/data/conservatory-props.js','src/data/world-inscriptions.js','src/data/conservatory-lights.js','src/data/floorplan/conservatory.js','src/data/floorplan/legend.js','src/world/floorplan.js','src/game/props.js','src/render/camera-basis.js'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,sha(fs.readFileSync(f))]));
assert.ok(!fs.existsSync(path.join(out,'report.json')),'Frozen motion evidence already exists; select a fresh --run name rather than relabeling captured frames');
fs.mkdirSync(out,{recursive:true});const report={date:new Date().toISOString(),arm,sourceHashes:hashes(),servedAcquisitionShaderSha256:sha(fs.readFileSync(arm==='baseline'?baseline:shader)),
 servedAcquisitionShader:arm==='baseline'?baseline:shader,errors:[],clips:[],baselineRequests:0,
 scope:'Actual compiled ringing-room and hall-entrance encounters. Standing eye, real volume/props/doors, actual authored lights and normal game torch. Baseline restores saved pre-gilt shader/assets at original URLs; candidate freezes its resources too. Same corrected mounting/cameras, complete existing copy. No whole-route, OCR or human reading claim.',
 interpretation:'Offline deterministic frames at monotonically advancing simulated60Hz are encoded at60fps. Wall-clock recording throughput is not60fps; native requestAnimationFrame throughput is measured separately without diagnostic readback.'};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');let browser;
const resourceDir=path.resolve(arm==='baseline'?'artifacts/lettering-production/gilt/baseline':'artifacts/lettering-production/gilt/candidate/motion-resources');fs.mkdirSync(resourceDir,{recursive:true});
if(arm==='candidate'){
 for(const file of[shader,'public/assets/conservatory-props.lettering.json'])fs.copyFileSync(file,path.join(resourceDir,path.basename(file)));
 fs.writeFileSync(path.join(resourceDir,'props.glb.gz'),gzipSync(fs.readFileSync('public/assets/conservatory-props.glb'),{level:6,mtime:0}));
 const meta=JSON.parse(fs.readFileSync(path.join(resourceDir,'conservatory-props.lettering.json')));
 for(const face of meta.entries.filter(e=>['tower_peal_board','lettering_overlay_hall-entrance-sign'].includes(e.mesh)))for(const kind of['albedo','normal','orm'])fs.copyFileSync(`public/assets/lettering/${meta.pages[face.page][kind]}`,path.join(resourceDir,meta.pages[face.page][kind]));
}
const resourceMap=new Map(),add=(url,file,type)=>{const bytes=file.endsWith('.gz')?gunzipSync(fs.readFileSync(file)):fs.readFileSync(file);resourceMap.set(url,{bytes,file,type,sha256:sha(bytes),requests:0});};
add('/src/render/pixel-mesh/shader.js',path.join(resourceDir,'shader.js'),'text/javascript');add('/assets/conservatory-props.glb',path.join(resourceDir,arm==='baseline'?'props.glb':'props.glb.gz'),'model/gltf-binary');add('/assets/conservatory-props.lettering.json',path.join(resourceDir,'conservatory-props.lettering.json'),'application/json');
for(const file of fs.readdirSync(resourceDir).filter(f=>/^lettering-\d+-(albedo|normal|orm)\.png$/.test(f)))add(`/assets/lettering/${file}`,path.join(resourceDir,file),'image/png');
report.frozenResources=Object.fromEntries([...resourceMap].map(([url,item])=>[url,{file:item.file,sha256:item.sha256,bytes:item.bytes.length}]));
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',timeout:90000,protocolTimeout:180000,
  args:['--use-angle=metal','--no-sandbox','--disable-background-networking']});
 const page=await browser.newPage();await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
 // The frozen GLB is 43 MB. Retain its actual received body long enough to
 // hash it alongside the smaller control pack and texture responses.
 await page._client().send('Network.enable',{maxTotalBufferSize:536870912,maxResourceBufferSize:134217728});
 page.on('pageerror',e=>report.errors.push(e.message));
 const responseProofs=[];await page.setRequestInterception(true);page.on('request',request=>{const resource=resourceMap.get(new URL(request.url()).pathname);if(resource){resource.requests++;request.respond({status:200,contentType:resource.type,body:resource.bytes});}else request.continue();});
 page.on('response',response=>{const url=new URL(response.url()).pathname,resource=resourceMap.get(url);if(resource)responseProofs.push(response.buffer().then(bytes=>{assert.equal(sha(bytes),resource.sha256,`Received frozen resource differs: ${url}`);return{url,bytes:bytes.length,sha256:sha(bytes),receivedBrowserBodyMatchesFrozenBytes:true};}));});
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}};});
 await page.goto(`${base}/artifacts/lettering-production/review.html`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.letteringProduction?.ready||window.letteringProduction?.failure,{timeout:120000});
 const failure=await page.evaluate(()=>window.letteringProduction.failure);if(failure)throw Error(failure);
 await page.waitForNetworkIdle({idleTime:600,timeout:120000});
 await page.evaluate(async()=>{window.printMotion=await import('/artifacts/lettering-production/gilt/motion-probe.js');});
 for(const url of['/src/render/pixel-mesh/shader.js','/assets/conservatory-props.glb','/assets/conservatory-props.lettering.json'])assert.ok(resourceMap.get(url).requests>0,`Frozen resource not actually requested: ${url}`);
 report.receivedResourceBodies=await Promise.all(responseProofs);
 report.realTimeRaf=await page.evaluate(()=>window.printMotion.realRafThroughput({scene:'gilt-peal',motion:'approach',scale:1}));save();
 const cases=['gilt-peal','gilt-hall'].flatMap(scene=>['approach','walkby-turn','stationary'].map(motion=>({scene,motion,scale:1,...(scene==='gilt-hall'?{headPitchDeg:Number(args.get('glance')||30)}:{}),id:`${scene}-${motion}-s1`})))
  .map((test,sequence)=>({...test,sequence})).filter(test=>!args.get('motions')||args.get('motions').split(',').includes(test.motion)).filter(test=>!args.get('case')||test.id===args.get('case'));
 assert.ok(cases.length,'Unknown requested motion case');
 for(const test of cases){
  const folder=path.join(out,test.id);fs.mkdirSync(`${folder}/uv`,{recursive:true});fs.mkdirSync(`${folder}/stills`,{recursive:true});
  const setup=await page.evaluate(test=>window.printMotion.configure(test),test);
  fs.writeFileSync(`${folder}/expected-mask.png`,Buffer.from(setup.maskPng.split(',')[1],'base64'));delete setup.maskPng;
  const clock=await page.evaluate(sequence=>window.printMotion.startVirtual(sequence),test.sequence);
  const video=path.join(folder,'offline60fps.webm'),encoder=spawn('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','60','-vcodec','png','-i','pipe:0',
   '-an','-c:v','libvpx-vp9','-lossless','1','-pix_fmt','gbrp','-colorspace','rgb','-color_range','pc','-row-mt','1','-cpu-used','0',video],{stdio:['pipe','ignore','pipe']});
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
 report.sourceHashesAfter=hashes();
 const frozenPaths=new Set([shader,'public/assets/conservatory-props.glb','public/assets/conservatory-props.lettering.json']);
 report.diskSourceChanges=Object.keys(report.sourceHashes).filter(p=>report.sourceHashes[p]!==report.sourceHashesAfter[p]);
 report.unfrozenSourceChanges=report.diskSourceChanges.filter(p=>!frozenPaths.has(p));
 report.sourceStabilityScope='Unintercepted renderer/data files must remain byte-identical. Shader/GLB/sidecar are immutable in-memory request responses whose actual browser bodies are verified separately; later disk writes cannot alter those captured resources.';
 assert.deepEqual(report.unfrozenSourceChanges,[],'Concurrent change to an unfrozen renderer input invalidates motion evidence');
 assert.deepEqual(report.errors,[]);report.sourcesUnchanged=true;save();
 report.receivedResourceBodies=await Promise.all(responseProofs);save();
 execFileSync('/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',['tools/chunk_surfer/lettering-production/analyze-gilt-motion.py',out],{stdio:'inherit'});
}catch(error){report.failure=error.message;save();throw error;}finally{
 if(browser){const child=browser.process();let timer;await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(()=>{child?.kill('SIGTERM');resolve();},10000);})]);clearTimeout(timer);}
}

// All proof and encoder writes above are synchronous or awaited. Release any
// retained inspector transport after the bounded browser shutdown.
process.exit(0);
