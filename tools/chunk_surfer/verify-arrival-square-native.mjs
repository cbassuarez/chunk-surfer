// Focused native QA. A fresh-arrival fixture starts the actual automatic drive;
// no camera or vehicle pose is assigned during its subsequent real traversal.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.ARRIVAL_SQUARE_OUT||'artifacts/opening-access-audit/2026-11-08/arrival-square');
const port=Number(process.env.ARRIVAL_SQUARE_PORT)||5497;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(out,{recursive:true});
let server,browser,profile,page;
const report={method:'Native Metal; one explicit fresh-arrival QA fixture, then real automatic vehicle simulation; separate square camera fixtures. Not a full New Run or unfamiliar-human test.',errors:[],frames:[],samples:[]};
try{
 server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
 profile=await mkdtemp(join(tmpdir(),'arrival-square-native-'));
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:true,protocolTimeout:180000,args:['--no-sandbox','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
 page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
 page.on('pageerror',error=>report.errors.push(String(error.stack||error)));
 await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__auditAudio=[];const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...rest){const result=connect.call(this,destination,...rest);
   if(destination===this.context.destination){let row=window.__auditAudio.find(r=>r.ctx===this.context);if(!row){row={ctx:this.context,destination:this.context.createMediaStreamDestination()};window.__auditAudio.push(row);}connect.call(this,row.destination);}
   return result;};
 });
 await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__probe?.openingArrivalStart&&window.__scenes?.top?.()?.id,{timeout:240000});
 if(await page.evaluate(()=>window.__scenes.top()?.id==='eula'))await page.keyboard.press('Enter');
 await page.evaluate(async()=>{await window.__probe.openingArrivalStart();window.__auditP3=await import('/src/render/props3d.js');window.__auditR3=await import('/src/render/r3d.js');});
 await page.waitForFunction(()=>window.__probe.openingArrival()?.vehicle?.phase==='driving',{timeout:240000});
 report.graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)};});
 await page.evaluate(()=>{
  const canvas=document.querySelector('canvas.r3d'),stream=canvas.captureStream(30),audio=window.__auditAudio.find(r=>r.ctx.state==='running');
  if(audio)for(const track of audio.destination.stream.getAudioTracks())stream.addTrack(track);
  const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2000000}),chunks=[];
  window.__arrivalMovie={recorder,stream,chunks,mimeType,audioTracks:stream.getAudioTracks().length};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);
 });
 const snapshot=()=>page.evaluate(()=>({at:performance.now(),arrival:window.__probe.openingArrival(),lights:window.__probe.r3dLighting?.(),pos:window.__probe.pos(),eye:window.__auditR3.r3dEyePoint(),gl:document.querySelector('canvas.r3d').getContext('webgl2').getError()}));
 const started=Date.now();let thought=false;
 while(Date.now()-started<25000){
  const sample=await snapshot();report.samples.push(sample);
  if(sample.arrival.vehicle?.recollection&&!thought){thought=true;await page.screenshot({path:join(out,'01-lyle-during-arrival.png')});}
  if(sample.arrival.vehicle?.phase==='parked')break;
  await wait(100);
 }
 if(report.samples.at(-1)?.arrival.vehicle?.phase!=='parked')throw Error('Actual arrival did not park in25seconds');
 await wait(600);await page.screenshot({path:join(out,'02-parked-cab.png')});
 const movie=await page.evaluate(()=>new Promise(resolve=>{const q=window.__arrivalMovie;q.recorder.onstop=async()=>{const blob=new Blob(q.chunks,{type:q.mimeType});const data=await new Promise(done=>{const reader=new FileReader();reader.onload=()=>done(reader.result);reader.readAsDataURL(blob);});q.stream.getTracks().forEach(t=>t.stop());resolve({data,audioTracks:q.audioTracks,mimeType:q.mimeType,bytes:blob.size});};q.recorder.stop();}));
 const marker=';base64,',start=movie.data.indexOf(marker);
 if(start<0)throw Error('Recorded movie has no base64 payload');
 const bytes=Buffer.from(movie.data.slice(start+marker.length),'base64');
 if(bytes.length!==movie.bytes)throw Error(`Recorded blob ${movie.bytes} bytes became ${bytes.length} bytes on disk`);
 const video=join(out,'arrival-through-parking.webm');await writeFile(video,bytes);delete movie.data;
 const streams=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'}));
 const packets=execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-select_streams','v:0','-show_entries','packet=pts_time,duration_time','-of','csv=p=0',video],{encoding:'utf8'});
 const duration=Math.max(0,...packets.trim().split('\n').map(line=>{const[pts,span]=line.split(',').map(Number);return Number.isFinite(pts)?pts+(Number.isFinite(span)?span:0):0;}));
 execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-i',video,'-f','null','-']);
 report.movie={...movie,video,streams:streams.streams.map(s=>({type:s.codec_type,codec:s.codec_name})),duration,fullyDecoded:true};
 if(!report.movie.streams.some(s=>s.type==='video')||!report.movie.streams.some(s=>s.type==='audio'))throw Error('Saved movie lacks a decodable video or audio stream');
 await page.evaluate(()=>{window.__scenes.clear();window.__probe.tutSkip();window.__probe.hush?.();});
 for(const view of[{name:'03-chrysanthemum-border',x:42,y:552,yaw:-.55,pitch:-.36},{name:'04-daisy-border',x:33,y:548,yaw:.75,pitch:-.35}]){
  await page.evaluate(v=>{window.__probe.warpCell(v.x,v.y);window.__probe.lookAtWorld(v.yaw,v.pitch);window.__probe.setTorch?.(true);},view);await wait(1800);
  const frame=await snapshot();report.frames.push({name:view.name,...frame});await page.screenshot({path:join(out,`${view.name}.png`)});
 }
 report.flora=await page.evaluate(()=>({catalog:window.__auditP3.propMeshCatalog().filter(n=>/chrysanthemum|daisy/.test(n)),props:window.__probe.props().instances.filter(p=>p.id.startsWith('ellery-square-chrysanthemums')||p.id.startsWith('ellery-square-daisies'))}));
 report.success=report.errors.length===0&&thought&&report.movie.audioTracks>0&&report.samples.every(s=>s.gl===0)&&report.flora.catalog.includes('vegetation_chrysanthemum_clump_flowers');
 console.log(JSON.stringify({success:report.success,errors:report.errors,movie:report.movie,catalog:report.flora.catalog,samples:report.samples.length,parkedAt:report.samples.at(-1)?.arrival.vehicle.drive?.elapsed},null,2));
}catch(error){report.error=String(error.stack||error);console.error(report.error);process.exitCode=1;}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await page?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{});if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});}
