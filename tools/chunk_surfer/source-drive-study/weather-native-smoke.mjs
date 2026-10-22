// One explicit fixed-frame diagnostic, not a playthrough or perceptual test.
import puppeteer from 'puppeteer-core';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import{join,resolve}from'node:path';import{createHash}from'node:crypto';
const out=resolve('artifacts/source-drive-study/refinement/weather'),profile=await mkdtemp(join(tmpdir(),'source-drive-weather-'));
await mkdir(out,{recursive:true});const paths=['tools/chunk_surfer/source-drive-study/renderer-adapter.mjs','artifacts/source-drive-study/weather.js','artifacts/source-drive-study/prototype.js','artifacts/source-drive-study/scene.js'];
const hashes=async()=>Promise.all(paths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
const before=await hashes(),errors=[];let browser;
try{
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:90000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding']});
 const page=await browser.newPage();await page.setViewport({width:1100,height:760,deviceScaleFactor:1});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.evaluateOnNewDocument(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols==='vite-hmr')return new class extends EventTarget{constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}};super(url,protocols);}};});
 await page.goto('http://127.0.0.1:5337/artifacts/source-drive-study/prototype.html',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.sourceDriveStudy?.ready||window.sourceDriveStudy?.errors?.length,{timeout:90000});
 const result=await page.evaluate(async()=>{
  const api=window.sourceDriveStudy;if(!api.ready)return{ready:false,errors:api.errors};
  const W=await import('/artifacts/source-drive-study/weather.js'),S=await import('/artifacts/source-drive-study/scene.js'),P=await import('/src/render/props3d.js?drive-study=2'),{CELL}=await import('/src/data/floorplan/legend.js');
  const state=api.fixture({phase:1,distance:400,paused:true}),weather=W.createDriveWeather({rain:.35,initialWetness:.55,extinction:.006});
  for(let i=0;i<90;i++)W.stepDriveWeather(weather,{dt:1/60,timeSec:(i+1)/60,wipers:true});
  const wf=W.driveWeatherFrame(weather),scene=S.makeDriveScene(state,api.metrics,{wipers:true,weather:wf,wiperAngles:wf.wiperAngles,wiperTiltX:wf.wiperTiltX}),frame=W.driveWeatherFrame(weather,{bodyMatrix:scene.body,cabinMount:api.metrics.cabinBodyMount,headlamps:scene.lamps.slice(0,2)}),R=api.R;
  R.r3dSetProps(scene.props);R.r3dSetLookAngles({yaw:state.heading,pitch:-.14});P.setDriveStudyFrame({heading:state.heading,lampDip:.020,mirrors:scene.mirrors,weather:frame});R.r3dSetLocalLights(scene.lamps);
  const start=performance.now(),eye=scene.eye;R.r3dFrame({px:eye[0]/CELL-.5,py:eye[2]/CELL-.5,floorH:eye[1]-1.62,tileW:256,tileH:256,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',sourceVoidPhysical:true,driveStudy:{active:true,heading:state.heading,lampDip:.020,weather:frame}});
  const submissionMs=performance.now()-start,status=R.r3dPixelMeshStatus(),adapter=P.driveStudyRendererStatus(),canvas=R.r3dCanvas();
  return{ready:true,status,adapter,submissionMs,canvas:[canvas.width,canvas.height],explicitFixture:{phase:1,distance:400,paused:true},weather:{rain:frame.rain,extinction:frame.extinction,wiperAngles:frame.wiperAngles,wiperTiltX:frame.wiperTiltX,minWetness:Math.min(...weather.grid),maxWetness:Math.max(...weather.grid),meanWetness:weather.grid.reduce((a,b)=>a+b,0)/weather.grid.length},image:canvas.toDataURL('image/png'),errors:api.errors};
 });
 const after=await hashes(),changed=before.filter((r,i)=>r.sha256!==after[i].sha256).map(r=>r.path);
 if(result.image){await writeFile(join(out,'native-weather-frame.png'),Buffer.from(result.image.split(',')[1],'base64'));delete result.image;}
 const report={kind:'single-fixed-frame-weather-shader-smoke',scope:'Actual native Chrome WebGL material/depth/final acquisition with an explicit descriptor. One paused fixed frame, no sound, video, uninterrupted play, human test or performance acceptance.',...result,browserErrors:errors,sourceBefore:before,sourceAfter:after,changedDuringCheck:changed};
 report.passed=!!result.ready&&!result.errors?.length&&!errors.length&&result.status?.shaderReady&&result.status?.lastGlError===0&&result.adapter?.weather?.active===true&&result.adapter?.weather?.wetnessTexture==='48x32'&&result.adapter?.weather?.wetnessInitialUploadUnit===5;
 await writeFile(join(out,'native-weather-smoke.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}catch(error){await writeFile(join(out,'native-weather-smoke-failure.json'),JSON.stringify({error:String(error.stack||error),errors,sourceBefore:before},null,2)+'\n');throw error;}
finally{await browser?.close();await rm(profile,{recursive:true,force:true});}
