// Task-owned native fixture driver. JSON lines preserve ordinary input timing.
import puppeteer from 'puppeteer-core';
import {createInterface} from 'node:readline';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';import{createHash}from'node:crypto';import {tmpdir} from 'node:os';
const out=resolve(process.env.SOURCE_DRIVE_NATIVE_DIR||'artifacts/source-drive-study/native');await mkdir(out,{recursive:true});const profile=await mkdtemp(join(tmpdir(),'source-drive-study-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function listSource(dir){const paths=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())paths.push(...await listSource(p));else if(p.endsWith('.js'))paths.push(p);}return paths;}
const sourcePaths=['tools/chunk_surfer/source-drive-study/renderer-adapter.mjs',...await listSource('src/render'),'src/world/floorplan.js','src/data/floorplan/legend.js',...['prototype.js','audio.js','drive-state.js','vehicle-dynamics.js','vehicle-contacts.js','road.js','route-layout.js','route-boundaries.js','checkpoint-recovery.js','evolution.js','radio-programmes.js','weather.js','road-joints.js','scene.js','drive.glb','geometry/metrics.json','geometry/wheel-hands.glb','geometry/wheel-hands-pose.js','geometry/wheel-reach-contact.js','cut/scene.js','cut/motion.js','cut/foley.js','cut/cut-static.glb','cut/cut-living.glb','cut/cut-roadside.glb','cut/cut-landscape.glb','cut/landscape-motion.js','cut/metrics.json'].map(p=>'artifacts/source-drive-study/'+p)].sort();
async function snapshot(){return Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path))})));}const sourceBefore=await snapshot();const resourceUrls=new Set();
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
const page=await browser.newPage();await page.setViewport({width:1100,height:760,deviceScaleFactor:1});const errors=[],commands=[];
let materialControl=null;if(process.env.SOURCE_DRIVE_MATERIAL_CONTROL){const asset=resolve(process.env.SOURCE_DRIVE_MATERIAL_CONTROL),body=await readFile(asset),metrics=JSON.parse(await readFile('artifacts/source-drive-study/geometry/metrics.json','utf8'));metrics.recorder.readoutLocalCenter[2]=.0244;metrics.sha256=sha(body);materialControl={kind:'reconstructed pre-fix colour/depth control; not the earlier build',asset,sha256:sha(body),readoutLocalZ:.0244,scope:'Only six encoded base-colour images and display mount differ. Camera, geometry, lighting, final acquisition and input recipe are held identical.'};await page.setRequestInterception(true);page.on('request',request=>{const path=new URL(request.url()).pathname;if(path==='/artifacts/source-drive-study/drive.glb')return request.respond({status:200,contentType:'model/gltf-binary',body});if(path==='/artifacts/source-drive-study/geometry/metrics.json')return request.respond({status:200,contentType:'application/json',body:JSON.stringify(metrics)});return request.continue();});}

page.on('response',r=>resourceUrls.add(r.url()));page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.evaluateOnNewDocument(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols==='vite-hmr')return new class extends EventTarget{constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){}};super(url,protocols);}};});
await page.goto('http://127.0.0.1:5337/artifacts/source-drive-study/prototype.html',{waitUntil:'domcontentloaded',timeout:60000});
const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
await page.waitForFunction(()=>window.sourceDriveStudy?.ready||window.sourceDriveStudy?.errors?.length,{timeout:120000});write({ready:await page.evaluate(()=>sourceDriveStudy.ready),errors:await page.evaluate(()=>sourceDriveStudy.errors),out});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));async function waitReady(){const deadline=Date.now()+120000;while(Date.now()<deadline){if(await page.evaluate(()=>!!window.sourceDriveStudy?.ready))return;await sleep(200);}throw Error('Study readiness timed out');}let record=false,movieName='capture',capture=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function timingSummary(frames,start=-Infinity,end=Infinity){
 const selected=frames.filter(f=>f.wall>=start&&f.wall<=end),stats=key=>{const values=selected.map(f=>f[key]).filter(Number.isFinite).sort((a,b)=>a-b);if(!values.length)return null;const percentile=p=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];return{count:values.length,min:values[0],mean:values.reduce((a,b)=>a+b,0)/values.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:values.at(-1)};};
 return{scope:'Observed requestAnimationFrame intervals and CPU submission under this browser/capture load; not GPU timing or human smoothness acceptance',frames:selected.length,wallStart:start,wallEnd:end,deltaMs:stats('deltaMs'),submissionMs:stats('submissionMs'),intervalsOver25ms:selected.filter(f=>f.deltaMs>25).length,intervalsOver50ms:selected.filter(f=>f.deltaMs>50).length,intervalsOver100ms:selected.filter(f=>f.deltaMs>100).length};
}
// A technical input driver, not gameplay/autopilot code. It reads study telemetry,
// presses ordinary keys, and never assigns vehicle, road, camera or clock state.
async function followRoad(q){
 const durationMs=clamp(Number(q.ms)||30000,100,30000),tickMs=clamp(Number(q.tickMs)||90,60,250),laneOffset=clamp(Number.isFinite(q.laneOffset)?q.laneOffset:-1.35,-5.5,1.8),cruiseSpeed=clamp(Number(q.speed)||11,2,14),destination=Number.isFinite(q.destination)?q.destination:null;
 const held=new Set(),keyEvents=[],samples=[],start=Date.now(),initial=await page.evaluate(()=>({state:sourceDriveStudy.query(),wall:performance.now()}));let reason='time-limit',controllerError=null;
 const keys=async wanted=>{for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);keyEvents.push({elapsedMs:Date.now()-start,type:'keyup',key});}for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);keyEvents.push({elapsedMs:Date.now()-start,type:'keydown',key});}};
 try{
  if(initial.state.paused)throw Error('Road-follow requires a running study; start it explicitly first');
  while(Date.now()-start<durationMs){
   const t0=Date.now(),s=await page.evaluate(()=>{const s=sourceDriveStudy.query();return{wall:performance.now(),program:s.programTime,x:s.x,z:s.z,heading:s.heading,speed:s.speed,lateralSpeed:s.lateralSpeed,yawRate:s.yawRate,wheelAngle:s.wheelAngle,roadOffset:s.roadOffset,surface:s.surface,paused:s.paused,arrived:s.arrived,roadPreview:s.roadPreview,errors:s.errors};});
   if(s.errors?.length){reason='study-error';throw Error(s.errors.join('; '));}if(s.paused){reason='paused';break;}if(s.arrived){reason='arrived';break;}
   if(![s.x,s.z,s.heading,s.speed,s.wheelAngle,s.roadPreview?.x,s.roadPreview?.z,s.roadPreview?.heading].every(Number.isFinite)){reason='non-finite-telemetry';throw Error(reason);}
   const p=s.roadPreview,ramp=clamp((-s.z-812)/34,0,1),bayBlend=ramp*ramp*ramp*(10+ramp*(-15+6*ramp)),targetLaneOffset=q.pullIn?laneOffset-3.1*bayBlend:laneOffset,targetX=p.x+targetLaneOffset*Math.cos(p.heading),targetZ=p.z+targetLaneOffset*Math.sin(p.heading),lookDistance=Math.max(8,Math.hypot(targetX-s.x,targetZ-s.z));
   const bearing=Math.atan2(targetX-s.x,-(targetZ-s.z)),headingError=Math.atan2(Math.sin(bearing-s.heading),Math.cos(bearing-s.heading));
   const desiredWheel=clamp(Math.atan(2*3.1*Math.sin(headingError)/lookDistance)-Math.atan2(s.lateralSpeed||0,Math.max(3,Math.abs(s.speed)))*.3,-.18,.18);
   const steeringError=desiredWheel-s.wheelAngle,remaining=destination===null?null:destination+s.z;
   let targetSpeed=cruiseSpeed;if(Math.abs(headingError)>.22||Math.abs(s.roadOffset-targetLaneOffset)>1.15)targetSpeed=Math.min(targetSpeed,6);if(remaining!==null)targetSpeed=Math.min(targetSpeed,Math.sqrt(Math.max(0,remaining-1)*2*2.1));
   if(remaining!==null&&remaining<=1.3&&Math.abs(s.speed)<.4){reason='destination-stopped';await keys(new Set([' ']));await sleep(120);break;}
   const wanted=new Set();if(s.speed<targetSpeed-.3)wanted.add('w');if(s.speed>targetSpeed+.65||remaining!==null&&remaining<0)wanted.add(' ');
   // Short steering pulses avoid inventing an analogue steering input that the
   // player does not possess. Coast between them to let the physical rack return.
   const turnRate=.64/(1+Math.abs(s.speed)/30),pulseMs=Math.abs(steeringError)>.006?clamp(Math.abs(steeringError)/turnRate*1000,12,tickMs):0;
   if(pulseMs)wanted.add(steeringError>0?'d':'a');await keys(wanted);
   samples.push({...s,elapsedMs:Date.now()-start,targetX,targetZ,targetLaneOffset,headingError,desiredWheel,targetSpeed,remaining,steeringPulseMs:pulseMs,keys:[...wanted]});
   if(pulseMs&&pulseMs<tickMs){await sleep(pulseMs);wanted.delete('a');wanted.delete('d');await keys(wanted);}
   await sleep(Math.max(0,tickMs-(Date.now()-t0)));
  }
 }catch(e){controllerError=String(e.stack||e);if(reason==='time-limit')reason='controller-error';}
 finally{await keys(new Set());}
 const final=await page.evaluate(()=>({state:sourceDriveStudy.query(),wall:performance.now(),frames:sourceDriveStudy.frames})),offsets=samples.map(s=>Math.abs(s.roadOffset-s.targetLaneOffset)).filter(Number.isFinite),surfaces=Object.fromEntries([...new Set(samples.map(s=>s.surface))].map(surface=>[surface,samples.filter(s=>s.surface===surface).length]));
 const receipt={kind:'scripted-keyboard-technical-road-follow',humanAcceptance:'pending; this controller is not an unbriefed driver or handling assessment',noStateMutationDuringSegment:true,controls:'Actual W/A/D/Space keyboard events; read-only state and 18 m road preview feedback',configuration:{durationMs,tickMs,laneOffset,cruiseSpeed,destination,pullIn:!!q.pullIn},reason,controllerError,elapsedMs:Date.now()-start,initial:initial.state,final:final.state,keyEvents,samples,summary:{sampleCount:samples.length,maximumLaneErrorM:offsets.length?Math.max(...offsets):null,meanLaneErrorM:offsets.length?offsets.reduce((a,b)=>a+b,0)/offsets.length:null,surfaceSamples:surfaces,distanceAdvancedM:-final.state.z+initial.state.z},timing:timingSummary(final.frames,initial.wall,final.wall)};
 const path=join(out,`${q.name||'road-follow'}.json`);await writeFile(path,JSON.stringify(receipt,null,2));if(controllerError)throw Error(`Road-follow failed; receipt ${path}: ${controllerError}`);return{path,reason,elapsedMs:receipt.elapsedMs,summary:receipt.summary,timing:receipt.timing};
}
try{for await(const line of createInterface({input:process.stdin,terminal:false})){if(!line.trim())continue;let q;try{q=JSON.parse(line);commands.push({at:Date.now(),...q});let value;
 switch(q.op){case'debug':if(record)throw Error('No diagnostic changes during capture');await page.evaluate(v=>sourceDriveStudy.debugSource(v),q.value);value=true;break;
 case'lighting':if(record)throw Error('No diagnostic changes during capture');await page.evaluate(v=>sourceDriveStudy.lightingTest(v),q.value||{});value=true;break;
 case'query':{const receipt=await page.evaluate(()=>sourceDriveStudy.query());await writeFile(join(out,`${q.name||'state'}.json`),JSON.stringify(receipt,null,2));value={program:receipt.programTime,distance:receipt.furthest,phase:receipt.phase,takes:receipt.takes.length,paused:receipt.paused,errors:receipt.errors};break;}
 case'fixture':if(record)throw Error('Fixture mutation after recording begins is forbidden');await page.evaluate(v=>sourceDriveStudy.fixture(v),q.value||{});await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));value=await page.evaluate(()=>sourceDriveStudy.query());break;
 case'start':await page.evaluate(()=>sourceDriveStudy.start());value=true;break;
 case'reload':await page.reload({waitUntil:'domcontentloaded'});await waitReady();value=true;break;
 case'replay':value=await page.evaluate(id=>sourceDriveStudy.replayTake(id),q.id);break;
 case'finish':value=await page.evaluate(()=>sourceDriveStudy.finishJourney());break;
 case'pause':await page.evaluate(()=>sourceDriveStudy.pause());value=true;break;
 case'hold':await page.keyboard.down(q.key);try{await sleep(Math.min(30000,q.ms||100));}finally{await page.keyboard.up(q.key);}value=true;break;
 case'follow':value=await followRoad(q);break;
 case'press':await page.keyboard.press(q.key);value=true;break;
 case'wait':await sleep(Math.min(30000,q.ms||100));value=true;break;
 case'drag':await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(q.toX,q.toY,{steps:12});await page.mouse.up();value=true;break;
 case'mouse':await page.mouse.move(q.x,q.y);value=true;break;
 case'canvasShot':{const path=join(out,`${q.name||'canvas'}.png`),data=await page.evaluate(()=>sourceDriveStudy.witness());await writeFile(path,Buffer.from(data.split(',')[1],'base64'));value={path};break;}
 case'shot':{const path=join(out,`${q.name||'view'}.png`);await page.screenshot({path});value={path};break;}
 case'click':await page.mouse.click(q.x,q.y);value=true;break;
 case'save':value=await page.evaluate(()=>sourceDriveStudy.save());break;
 case'restore':value=await page.evaluate(()=>sourceDriveStudy.restore());break;
 case'take':{value=await page.evaluate(id=>sourceDriveStudy.exportTake(id),q.id);const path=join(out,`${q.name||`take-${q.id}`}.webm`);await writeFile(path,Buffer.from(value.base64,'base64'));value={path,sha256:createHash('sha256').update(Buffer.from(value.base64,'base64')).digest('hex'),take:value.take};break;}
 case'record':{movieName=q.name||'capture';value=await page.evaluate(()=>{const c=sourceDriveStudy.R.r3dCanvas(),a=sourceDriveStudy.audio,stream=new MediaStream([...c.captureStream(30).getVideoTracks(),...a.monitorTap.stream.getAudioTracks()]);const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:1500000}),chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__driveCapture={rec,chunks,start:performance.now(),initial:sourceDriveStudy.query(),initialInput:sourceDriveStudy.inputs.length};rec.start(500);return{width:c.width,height:c.height};});record=true;break;}
 case'stop':{capture=await page.evaluate(async()=>{const x=window.__driveCapture;if(!x)return null;await new Promise(ok=>{x.rec.onstop=ok;x.rec.stop();});const b=new Blob(x.chunks,{type:x.rec.mimeType}),bytes=new Uint8Array(await b.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return{base64:btoa(raw),bytes:b.size,start:x.start,end:performance.now(),initial:x.initial,final:sourceDriveStudy.query(),inputs:sourceDriveStudy.inputs.slice(x.initialInput),frames:sourceDriveStudy.frames};});record=false;const path=join(out,movieName+'.webm');await writeFile(path,Buffer.from(capture.base64,'base64'));delete capture.base64;capture.timing=timingSummary(capture.frames,capture.start,capture.end);await writeFile(join(out,movieName+'.json'),JSON.stringify(capture,null,2));value={path,bytes:capture.bytes,timing:capture.timing};break;}
 case'close':value={closed:true};break;default:throw Error('Unknown operation');}
 write({id:q.id||null,ok:true,result:value});if(q.op==='close')break;
 }catch(e){write({id:q?.id||null,ok:false,error:String(e.stack||e)});}}}
finally{try{const receipt=await page.evaluate(async()=>await(await fetch('/__drive-study-renderer')).json());await writeFile(join(out,'renderer-receipt.json'),JSON.stringify(receipt,null,2));}catch{}await writeFile(join(out,process.env.DRIVE_SESSION_NAME||'session.json'),JSON.stringify({commands,errors,materialControl,sourceBefore,sourceAfter:await snapshot(),resourceUrls:[...resourceUrls],closedAt:Date.now()},null,2));await browser.close();await rm(profile,{recursive:true,force:true});}
