import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const repo=process.cwd(),out=resolve('artifacts/van-icon-study'),profile=await mkdtemp(join(tmpdir(),'van-icon-study-'));
const appVersion=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')).version;
let server,browser,page;const report={passed:false,scope:'Isolated authored van derivative; rendered design/motion study, not a native Dock or packaged icon acceptance.',audioTracks:0,errors:[]};
try{
 await mkdir(out,{recursive:true});server=await createServer({root:repo,configFile:false,define:{__APP_VERSION__:JSON.stringify(appVersion),__LOCAL_TEXT_REVIEW__:true},cacheDir:join(profile,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:['three','three/addons/loaders/GLTFLoader.js']},server:{host:'127.0.0.1',port:5634,strictPort:true,hmr:false,watch:null}});await server.listen();
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,args:['--mute-audio','--use-angle=metal','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
 page=await browser.newPage();await page.setViewport({width:1280,height:1000,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(String(e.stack||e)));
 await page.goto('http://127.0.0.1:5634/artifacts/van-icon-study/',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__vanIconStudy?.ready,{timeout:60000});
 const still=await page.evaluate(()=>window.__vanIconStudy.still());await writeFile(join(out,'van-master.png'),Buffer.from(still.split(',')[1],'base64'));
 const video=await page.evaluate(async()=>{
  const study=window.__vanIconStudy,canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(24),type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:3500000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const ended=new Promise(resolve=>recorder.onstop=resolve);let frames=0;
  const render=t=>{study.renderAt(t);ctx.fillStyle='#272a31';ctx.fillRect(0,0,768,768);ctx.drawImage(study.canvas,0,0,768,768);frames++;};
  render(0);recorder.start();const start=performance.now();await new Promise(resolve=>{function frame(now){const t=(now-start)/1000;render(Math.min(3,t));if(t<2.35)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
  recorder.stop();await ended;const blob=new Blob(chunks,{type});stream.getTracks().forEach(t=>t.stop());study.renderAt(3);
  const base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
  return{base64,bytes:blob.size,type,frames,audioTracks:stream.getAudioTracks().length,fit:study.fit};
 });
 await writeFile(join(out,'launch.webm'),Buffer.from(video.base64,'base64'));const{base64,...metrics}=video;report.video=metrics;
 // A PNG poster is a composite for video; canonical artwork remains alpha.
 const poster=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const c=canvas.getContext('2d');c.fillStyle='#272a31';c.fillRect(0,0,768,768);c.drawImage(window.__vanIconStudy.canvas,0,0,768,768);return canvas.toDataURL();});
 await writeFile(join(out,'van-preview.png'),Buffer.from(poster.split(',')[1],'base64'));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__vanIconStudy?.ready);await page.screenshot({path:join(out,'review.png'),fullPage:true});
 report.passed=report.errors.length===0&&video.frames>30&&video.audioTracks===0;
 if(!report.passed)process.exitCode=1;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();await server?.close();await rm(profile,{recursive:true,force:true});await writeFile(join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
