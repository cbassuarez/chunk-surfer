// One silent, staged production-renderer comparison. No game route or audio.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import puppeteer from 'puppeteer-core';
import {shaderDeclaration} from './export-pressure-review-shaders.mjs';
import * as HZ from '../../src/render/horizon3d.js';
const base=process.env.HUSH_FINAL_URL||'http://127.0.0.1:5595';
const out=resolve('artifacts/source-hush-transitions/renderer');await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),source=await readFile('src/render/r3d.js','utf8'),bindings={HZ};
for(const m of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm)){
 if(!m[1].includes('GLSL'))continue;
 const mod=await import(new URL(m[2],new URL('../../src/render/r3d.js',import.meta.url)));
 for(const name of m[1].split(',').map(x=>x.trim()))if(name in mod)bindings[name]=mod[name];
}
const context=vm.createContext(bindings);
for(const name of['COMMON_GLSL','RAIN_GLSL','GRAIN_GLSL','POST_FRAG','SOURCE_VOID_PHYSICAL_FRAG'])vm.runInContext(shaderDeclaration(source,name),context);
const files=['src/render/r3d.js','src/render/props3d.js','src/render/pressure-composite.js','src/render/hush-cosmos.js','src/render/pixel-mesh/shader.js','src/render/pressure-volume.js','src/game/hush-density-performance.js','src/game/pressure-performance.js','src/game/pressure-gait.js','src/game/presence.js','src/game/hush-audition.js'];
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))])));
const bundle=JSON.stringify({sourceHashes,r3dSha256:sha(source),shaders:vm.runInContext('({post:POST_FRAG,sourceVoidPhysical:SOURCE_VOID_PHYSICAL_FRAG})',context)}),bundleName='production-shaders-'+sha(bundle).slice(0,12)+'.json';
await writeFile(join(out,bundleName),bundle);
const fixtureSource=(await readFile(join(out,'renderer.js'),'utf8')).replace("'./production-shaders.json'",JSON.stringify('./'+bundleName)),fixtureName='renderer-'+sha(fixtureSource).slice(0,12)+'.js';
await writeFile(join(out,fixtureName),fixtureSource);
const html=(await readFile(join(out,'index.html'),'utf8')).replace(/src="\/artifacts\/source-hush-transitions\/renderer\/renderer[^"?]*\.js[^\"]*"/, 'src="/artifacts/source-hush-transitions/renderer/'+fixtureName+'"');
await writeFile(join(out,'index.html'),html);
const report={scope:'Staged Chromium/Metal renderer fixture: actual final GLB, current P3 deformation/pressure, acquisition and POST. Synthetic accepted-movement trace, no earned route, AI pursuit/capture fairness, native app, sound or human acceptance.',silent:true,errors:[],sourceHashes,assetSha256:sha(await readFile('public/assets/hush-density.glb')),frames:[]};
let browser,page;
try{
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,pipe:true,protocolTimeout:120000,
  args:['--mute-audio','--autoplay-policy=user-gesture-required','--use-angle=metal','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
 page=await browser.newPage();await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  const NativeSocket=window.WebSocket;
  class ReviewSocket extends EventTarget{
   static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
   constructor(url){super();this.url=String(url);this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
   send(){}close(){this.readyState=3;}
  }
  window.WebSocket=class extends NativeSocket{constructor(url,protocols){if(protocols==='vite-hmr')return new ReviewSocket(url);super(url,protocols);}};
 });
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(/shader.*error|ERROR: 0:|GLSL.*error|link.*fail|context.*lost|feedback loop/i.test(m.text()))report.errors.push(m.text());});
 await page.goto(base+'/artifacts/source-hush-transitions/renderer/index.html?performance=chase&camera=front6&light=front',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>document.querySelector('#status')?.dataset.ready==='true'||document.querySelector('#status')?.classList.contains('error'),{timeout:90000});
 await page.waitForFunction(()=>typeof window.__hushFocused?.pixels==='function',{timeout:15000});
 const initial=await page.evaluate(()=>({status:document.querySelector('#status').textContent,snapshot:window.__hushDensityProductionSnapshot}));
 assert.ok(initial.snapshot?.pressureDraws>0,initial.status);assert.equal(initial.snapshot.asset.sha256,report.assetSha256);
 report.initial=initial.snapshot;
 // Confirm final pixels before spending time recording. A valid GL draw can
 // still be erased by a missing presentation binding in an isolated fixture.
 const preflight=await page.evaluate(()=>{window.__hushFocused.seek(3.7);return window.__hushFocused.pixels();});
 report.preflight=preflight;
 assert.ok(preflight.core>200&&preflight.marked>50&&preflight.purple>10,'preflight: covered Hush must retain visible violet marks');
 let prior=null;if(process.env.HUSH_FINAL_REUSE_VIDEO==='1')try{prior=JSON.parse(await readFile(join(out,'report.json'),'utf8'));}catch{}
 const video=prior?.assetSha256===report.assetSha256&&prior?.video?.final?.fixtureTime>=11.9?null:await page.evaluate(async()=>{
  window.__hushFocused.seek(0);window.__hushCaptureFrames=[];
  const canvas=document.querySelector('#scene'),stream=canvas.captureStream(30),mime=['video/webm;codecs=vp8','video/webm;codecs=vp9'].find(s=>MediaRecorder.isTypeSupported(s));
  if(!mime)throw Error('No video-only recorder');
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise(resolve=>{recorder.onstop=async()=>{const blob=new Blob(chunks,{type:mime}),reader=new FileReader();reader.onload=()=>resolve({data:reader.result,mime,audioTracks:stream.getAudioTracks().length,frames:window.__hushCaptureFrames,snapshot:window.__hushFocused.snapshot()});reader.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop());};});
  recorder.start(500);window.__hushFocused.play();await new Promise(r=>setTimeout(r,13200));window.__hushFocused.stop();recorder.stop();return done;
 });
 if(video){await writeFile(join(out,'chase-stop.webm'),Buffer.from(video.data.split(',')[1],'base64'));assert.equal(video.audioTracks,0);report.video={file:'chase-stop.webm',mime:video.mime,audioTracks:0,frames:video.frames,final:video.snapshot,sourceHashes};}
 else report.video={...prior.video,sourceHashes:prior.video.sourceHashes||prior.sourceHashes,reusedExistingVideo:true};
 assert.ok(report.video.final.fixtureTime>=11.9,'the staged chase-stop film must reach its retained end');
 assert.ok(report.video.frames.some(f=>f.density.drive>.75&&f.character.blend?.clip==='density_chase'),'actual current performance driver must select chase');
 assert.ok(report.video.frames.every(f=>f.pressureDraws>0&&!f.poseErrors?.length));
 for(const [label,side]of[['front',false],['profile',true]]){
  const result=await page.evaluate(side=>{
   const before=window.__hushFocused.seek(3.7),root=before.capturedFrame.primary,rx=(root.x+.5)*.5,rz=(root.y+.5)*.5;
   const snapshot=window.__hushFocused.seek(3.7,side?[rx+3.2,1.62,rz]:[rx,1.62,rz-3.2]);
   return{snapshot,pixels:window.__hushFocused.pixels(),image:document.querySelector('#scene').toDataURL('image/png')};
  },side);
  await writeFile(join(out,label+'.png'),Buffer.from(result.image.split(',')[1],'base64'));report.frames.push({label,pixels:result.pixels,...result.snapshot});assert.ok(result.pixels.core>200&&result.pixels.marked>50&&result.pixels.purple>10,'actual covered Hush pixels must retain readable nonblack violet marks');
 }
 report.gl=await page.evaluate(()=>{const c=document.querySelector('#scene'),gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{error:gl.getError(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
 assert.equal(report.gl.error,0);assert.deepEqual(report.errors,[]);
 report.passed=true;
}catch(error){report.passed=false;report.failure=String(error?.stack||error);process.exitCode=1;if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{await browser?.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,failure:report.failure,assetSha256:report.assetSha256,frames:report.frames.length,videoFrames:report.video?.frames.length,gl:report.gl,errors:report.errors},null,2));
// Imported game modules can retain ordinary housekeeping timers in Node.
// The browser has closed and all evidence writes completed at this boundary.
process.exit(process.exitCode||0);
