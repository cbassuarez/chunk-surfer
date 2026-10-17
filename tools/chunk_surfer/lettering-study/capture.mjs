// Explicit study captures. Requires an already running local Vite server.
import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output='artifacts/lettering-study/evidence';mkdirSync(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE',e.message);});
 page.on('console',m=>{if(['error','warn','info'].includes(m.type()))console.log('CONSOLE',m.type(),m.text().slice(0,600));});
 page.on('requestfailed',r=>{if(!r.url().includes('/@vite/client'))console.log('FAILED',r.url(),r.failure()?.errorText);});
 page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
 // Never let concurrent rebuilds replace a controlled capture. All meshes and
 // textures needed by the actual scene still load via the production loader.
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}};});
 console.log('Opening lettering review');
 await page.goto(`${process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334'}/artifacts/lettering-study/review.html`,{waitUntil:'domcontentloaded',timeout:45000});
 console.log('Review document loaded');
 try{await page.waitForFunction(()=>window.letteringStudy?.ready,{timeout:90000});}
 catch(e){console.log(await page.evaluate(()=>({text:document.body.innerText.slice(0,1200),scripts:[...document.scripts].map(s=>s.src),resources:performance.getEntriesByType('resource').slice(-12).map(e=>e.name)})));await page.screenshot({path:`${output}/loading-failure.png`});throw e;}
 console.log('Production renderer ready');
 await page.waitForNetworkIdle({idleTime:800,timeout:60000});
 const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 const sources=['src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js','public/assets/lettering-study/signs.glb'];
 const report={date:new Date().toISOString(),errors,sourceHashes:Object.fromEntries(sources.map(p=>[p,sha(p)])),captures:[],benchmarks:[],videos:[],humanReading:'not yet performed'};
 for(const id of ['services','placard','dock-original']){
  const result=await page.evaluate(async id=>{const S=window.letteringStudy;await S.configure(id,960,600,1);return['baseline',id==='dock-original'?'mount-only':'fabricated'].map(variant=>{const {frame,evidence}=S.renderSample({variant});return{evidence,url:frame.toDataURL()};});},id);
  for(const s of result){writeFileSync(`${output}/${id}-${s.evidence.variant}-first.png`,Buffer.from(s.url.split(',')[1],'base64'));report.captures.push(s.evidence);}
  console.log(JSON.stringify(result.map(s=>({id,variant:s.evidence.variant,cap:s.evidence.capHeightPx,stroke:s.evidence.strokePx,draws:s.evidence.draws,gl:s.evidence.glError}))));
 }
 writeFileSync(`${output}/capture-report.json`,JSON.stringify(report,null,2));
 for(const id of ['services','placard','dock-original']){
  await page.evaluate(async id=>window.letteringStudy.configure(id,960,600,1),id);
  for(const light of ['normal','torch'])for(const variant of ['baseline',id==='dock-original'?'mount-only':'fabricated']){
   const result=await page.evaluate(({light,variant})=>{const S=window.letteringStudy;for(let i=0;i<5;i++)S.renderSample({variant,light});return ['props','scene','vfd','final'].map(stage=>{const {frame,evidence}=S.renderSample({variant,light,stage});return{stage,evidence,url:frame.toDataURL()};});},{light,variant});
   for(const s of result){writeFileSync(`${output}/${id}-${variant}-${light}-${s.stage}.png`,Buffer.from(s.url.split(',')[1],'base64'));report.captures.push(s.evidence);}
  }
  console.log('Material/scene/final captured',id);writeFileSync(`${output}/capture-report.json`,JSON.stringify(report,null,2));
 }
 // Distances and performance scale are deliberate sampling controls. Each
 // pair keeps the same camera and authored incident light.
 for(const id of ['services','placard'])for(const [width,height,scale] of [[960,600,1],[1280,720,1],[640,480,1],[960,600,.5]]){
  await page.evaluate(async({id,width,height,scale})=>window.letteringStudy.configure(id,width,height,scale),{id,width,height,scale});
  for(const distance of [8,5,3,1.5])for(const variant of ['baseline','type-flat','fabricated']){
   const s=await page.evaluate(({distance,variant})=>{const {frame,evidence}=window.letteringStudy.renderSample({distance,variant,light:'torch'});return{evidence,url:frame.toDataURL()};},{distance,variant});
   writeFileSync(`${output}/${id}-${variant}-${width}x${height}-s${scale}-${distance}m.png`,Buffer.from(s.url.split(',')[1],'base64'));report.captures.push(s.evidence);
  }
  console.log('Sampling matrix',id,width,height,scale);writeFileSync(`${output}/capture-report.json`,JSON.stringify(report,null,2));
 }
 // Genuine emergency states exist in the original dock only.
 await page.evaluate(()=>window.letteringStudy.configure('dock-original',960,600,1));
 for(const light of ['emergencyOn','emergencyOff'])for(const variant of ['baseline','mount-only','fabricated']){
  const s=await page.evaluate(({light,variant})=>{const{frame,evidence}=window.letteringStudy.renderSample({light,variant});return{evidence,url:frame.toDataURL()};},{light,variant});
  writeFileSync(`${output}/dock-original-${variant}-${light}.png`,Buffer.from(s.url.split(',')[1],'base64'));report.captures.push(s.evidence);
 }
 for(const id of ['services','placard']){
  const benchmark=await page.evaluate(async id=>{
   const S=window.letteringStudy;await S.configure(id,960,600,1);const gl=S.R.r3dCanvas().getContext('webgl2'),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
   for(let i=0;i<6;i++)S.renderSample({variant:i%2?'fabricated':'baseline',light:'torch'});
   const records=[],gpu=[];
   for(let i=0;i<16;i++)for(const variant of i%2?['fabricated','baseline']:['baseline','fabricated']){
    const query=ext?gl.createQuery():null;if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    const sample=S.renderSample({variant,light:'torch'});if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);
    records.push({variant,cpuMs:sample.evidence.cpuSubmissionMs,draws:sample.evidence.draws,triangles:sample.evidence.triangles,query});
    await new Promise(r=>requestAnimationFrame(r));
   }
   if(ext)for(const r of records){let attempts=0;while(!gl.getQueryParameter(r.query,gl.QUERY_RESULT_AVAILABLE)&&attempts++<30)await new Promise(resolve=>requestAnimationFrame(resolve));gpu.push({variant:r.variant,ms:gl.getParameter(ext.GPU_DISJOINT_EXT)?null:gl.getQueryParameter(r.query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(r.query);delete r.query;}
   const median=a=>{const b=a.slice().sort((x,y)=>x-y);return(b[(b.length-1)>>1]+b[b.length>>1])/2;};
   const baseline=S.renderSample({variant:'baseline',light:'torch'}).evidence,fabricated=S.renderSample({variant:'fabricated',light:'torch'}).evidence,omitted=S.renderSample({variant:'fabricated',light:'torch',omitTarget:true}).evidence;
   const summaries=['baseline','fabricated'].map(variant=>({variant,cpuSubmissionP50Ms:median(records.filter(r=>r.variant===variant).map(r=>r.cpuMs)),gpuP50Ms:gpu.some(r=>r.variant===variant&&r.ms!=null)?median(gpu.filter(r=>r.variant===variant&&r.ms!=null).map(r=>r.ms)):null}));
   const stationary=[];for(const variant of ['baseline','fabricated']){const frames=[];let box;for(let i=0;i<12;i++){const s=S.renderSample({variant,light:'torch'});box=s.evidence.bounds;frames.push(s.frame.getContext('2d').getImageData(0,0,s.frame.width,s.frame.height));await new Promise(r=>setTimeout(r,35));}let sum=0,n=0,changed=0;const x0=Math.max(0,Math.floor(box.left)),x1=Math.min(960,Math.ceil(box.right)),y0=Math.max(0,Math.floor(box.top)),y1=Math.min(600,Math.ceil(box.bottom));for(let f=1;f<frames.length;f++)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const at=(y*960+x)*4,d=Math.abs(frames[f].data[at]-frames[f-1].data[at])+Math.abs(frames[f].data[at+1]-frames[f-1].data[at+1])+Math.abs(frames[f].data[at+2]-frames[f-1].data[at+2]);sum+=d/3;n++;if(d>30)changed++;}stationary.push({variant,frames:frames.length,roi:box,meanAbsoluteRgbDelta:sum/n,changedFraction:changed/n,note:'Controlled reduced-motion acquisition. Image stability is not reading accuracy.'});}
   return{id,summaries,records:records.map(({query,...rest})=>rest),gpu,wholeSceneNote:'Warmed CPU submission, actual scene, 16 counterbalanced pairs. Not a game FPS claim.',targetDelta:{baselineDraws:baseline.draws-omitted.draws,fabricatedDraws:fabricated.draws-omitted.draws,baselineTriangles:baseline.triangles-omitted.triangles,fabricatedTriangles:fabricated.triangles-omitted.triangles},stationary,gpuTimer:!!ext,glError:gl.getError()};
  },id);report.benchmarks.push(benchmark);console.log('Measured',JSON.stringify({id,summaries:benchmark.summaries,target:benchmark.targetDelta,gpuTimer:benchmark.gpuTimer,gl:benchmark.glError}));writeFileSync(`${output}/capture-report.json`,JSON.stringify(report,null,2));
 }
 const atlas=await page.evaluate(async()=>{const [G,S]=await Promise.all([import('/src/game/chunk-surf-god.js'),import('/src/game/source-space-runtime.js')]);const built=G.buildChunkSurfGodPreset(G.CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417}),runtime=S.createSourceSpaceRuntime({initialState:built.state});runtime.setPlayerPosition(built.position);const corpus=[...new Set(runtime.sourceScene({px:built.position.x,py:built.position.y,time:0}).corpus)],ctx=document.createElement('canvas').getContext('2d');const fits=corpus.map(text=>{let font=14;ctx.font=`${font}px monospace`;while(font>6&&ctx.measureText(text).width>184){font--;ctx.font=`${font}px monospace`;}return{text,font,width:ctx.measureText(text).width,clipped:ctx.measureText(text).width>184};});return{entries:corpus.length,clipped:fits.filter(f=>f.clipped).length,minimumFont:Math.min(...fits.map(f=>f.font)),fontHistogram:Object.fromEntries([...new Set(fits.map(f=>f.font))].sort((a,b)=>a-b).map(n=>[n,fits.filter(f=>f.font===n).length])),worst:fits.sort((a,b)=>b.width-a.width).slice(0,10),method:'Exact Canvas fitting loop from ensureTextAtlas; browser generic monospace; 184px available. This measures clipping before material and final acquisition.'};});
 report.atlas=atlas;writeFileSync(`${output}/atlas-fit.json`,JSON.stringify(atlas,null,2));console.log('Atlas fit',JSON.stringify({entries:atlas.entries,clipped:atlas.clipped,minimumFont:atlas.minimumFont}));
 for(const id of ['services','placard'])for(const mode of ['approach','walkby']){
  const recording=await page.evaluate(async({id,mode})=>{
   const S=window.letteringStudy;await S.configure(id,960,600,1);const c=document.createElement('canvas');c.width=1920;c.height=632;const ctx=c.getContext('2d'),stream=c.captureStream(12),mimeType=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3500000}),chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>recorder.onstop=r);const path=[],start=performance.now();recorder.start();let t=0;
   do{t=Math.min(1,(performance.now()-start)/8000);const from=id==='placard'?5:8,distance=mode==='approach'?from-(from-1.5)*t:3,offset=mode==='walkby'?-2+4*t:0;ctx.fillStyle='#111810';ctx.fillRect(0,0,c.width,c.height);for(const[side,variant]of ['baseline','fabricated'].entries()){const s=S.renderSample({variant,light:'torch',distance,offset});ctx.drawImage(s.frame,side*960,32);ctx.fillStyle='#d5dfca';ctx.font='13px monospace';ctx.fillText(`${variant.toUpperCase()} / ${distance.toFixed(2)} m / FINAL GAME OUTPUT`,side*960+15,21);if(side===0)path.push({t:performance.now()-start,distance,offset,camera:s.evidence.camera});}await new Promise(r=>requestAnimationFrame(r));}while(t<1);
   recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mimeType});const url=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob);});return{url,path,frames:path.length,elapsedMs:performance.now()-start,mimeType,bytes:blob.size,note:'Same physical camera for both variants; actual production final output. Reduced motion and memory off isolate glyph sampling. Maintained/exterior practicals plus steady aimed torch.'};
  },{id,mode});writeFileSync(`${output}/${id}-${mode}.webm`,Buffer.from(recording.url.split(',')[1],'base64'));delete recording.url;report.videos.push({id,mode,...recording});console.log('Footage',id,mode,recording.frames,recording.bytes);writeFileSync(`${output}/capture-report.json`,JSON.stringify(report,null,2));
 }
 report.sourceHashesAfter=Object.fromEntries(sources.map(p=>[p,sha(p)]));report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);
 writeFileSync(`${output}/capture-report.json`,JSON.stringify(report,null,2));
 await page.click('[data-case="services"]');await page.waitForFunction(()=>document.querySelector('#context').textContent.includes('Maintained'));
 await page.screenshot({path:`${output}/review.png`,fullPage:true});
}finally{await browser.close();}
