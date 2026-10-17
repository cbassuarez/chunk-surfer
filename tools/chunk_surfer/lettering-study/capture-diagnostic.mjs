// Acquisition diagnostics only. These modes explain the actual final pass;
// they do not replace the final output in the study or change production code.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output='artifacts/lettering-study/evidence';mkdirSync(output,{recursive:true});
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sources=['src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js','artifacts/lettering-study/review.js','public/assets/lettering-study/signs.glb'];
const errors=[],report={date:new Date().toISOString(),sourceHashes:Object.fromEntries(sources.map(path=>[path,sha(path)])),
 conditions:{width:960,height:600,renderScale:1,distanceM:3,variant:'fabricated',light:'torch',reduceMotion:true,reduceFlash:true,memory:false},
 frames:[],errors,interpretation:'Existing acquisition debug modes. World is shader variable c after the optional lens/grade block, not the raw material pass; recorded is recordedSignal; edge is combined luma/depth edge; final is unchanged finished output. These images explain failure and do not establish human reading accuracy.'};
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1200,height:900,deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}
 };});
 await page.goto(`${process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334'}/artifacts/lettering-study/review.html`,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.letteringStudy?.ready,{timeout:90000});await page.waitForNetworkIdle({idleTime:800,timeout:60000});
 for(const id of ['services','placard'])for(const debugSource of ['world','recorded','edge','final']){
  const frame=await page.evaluate(async({id,debugSource})=>{
   const S=window.letteringStudy;S.stop();await S.configure(id,960,600,1);S.R.r3dSetPixelMesh({reduceMotion:true,reduceFlash:true,memory:false,debugSource});
   const stage=debugSource==='final'?'final':`debug-${debugSource}`;
   for(let n=0;n<3;n++)S.renderSample({variant:'fabricated',light:'torch',distance:3,stage});
   const sample=S.renderSample({variant:'fabricated',light:'torch',distance:3,stage});
   return{url:sample.frame.toDataURL('image/png'),id,debugSource,evidence:sample.evidence,settings:S.R.r3dPixelMeshSettings(),worldYaw:S.R.r3dWorldYaw()};
  },{id,debugSource});
  const path=`${id}-acquisition-debug-${debugSource}.png`;writeFileSync(`${output}/${path}`,Buffer.from(frame.url.split(',')[1],'base64'));delete frame.url;
  report.frames.push({...frame,file:path});assert.equal(frame.settings.debugSource,debugSource);assert.equal(frame.evidence.glError,0);
 }
 report.sourceHashesAfter=Object.fromEntries(sources.map(path=>[path,sha(path)]));report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);
 writeFileSync(`${output}/acquisition-diagnostic-report.json`,JSON.stringify(report,null,2));
 await page.click('[data-case="services"]');await page.select('#stage','final');await page.waitForFunction(()=>document.querySelector('#context').textContent.includes('Maintained'));
 await page.screenshot({path:`${output}/review.png`,fullPage:true});
 assert.ok(report.sourcesUnchanged,'Diagnostic inputs changed during capture');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({frames:report.frames.map(f=>({id:f.id,debugSource:f.debugSource,file:f.file,glError:f.evidence.glError})),sourcesUnchanged:report.sourcesUnchanged,errors}));
}finally{
 const process=browser.process();let timer;try{await Promise.race([browser.close(),new Promise(resolve=>{timer=setTimeout(()=>{process?.kill('SIGTERM');resolve();},10000);})]);}finally{clearTimeout(timer);}
}
