// One owned Chromium/Metal page against the ordinary Vite or dist server.
// Start with EXTERIOR_INTEGRATION_URL=http://127.0.0.1:<port> node this-file.
// JSON lines on stdin: fixture, assets, state, map, key, hold, look, shot,
// record, stop, wait, close. Only fixture assigns a position, before recording.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';

const output=path.resolve(process.env.EXTERIOR_INTEGRATION_OUTPUT_DIR||'artifacts/exterior-integration');
const url=new URL(process.env.EXTERIOR_INTEGRATION_URL||'http://127.0.0.1:5173/');
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('This inspection lane requires a local server.');
for(const[key,value]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0'}))url.searchParams.set(key,value);
const requiredDefault=['conservatory_west_elevation','ellery_public_front','ellery_public_forecourt',
  'glass_court_frame','glass_court_glass','glass_court_beds','glass_court_nursery','glass_court_plants','glass_court_vestibule',
  'exterior_pub_frontage','exterior_pub_interior','yard_stable_range','yard_rehearsal_range'];
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeName=name=>{if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(name)))throw Error('Use a short lowercase artifact name.');return String(name);};
const report={kind:'exterior-integration',url:url.href,started:new Date().toISOString(),
  qualification:'Disposable Chromium/Metal technical inspection of the ordinary game runtime. Fixture prerequisites and its initial placement are declared. Recorded traversal uses actual keyboard controls. This does not establish native WebView or fresh-player acceptance.',
  operations:[],errors:[],warnings:[],resources:[],screenshots:[],movies:[]};
await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'chunk-exterior-integration-'));
const persist=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
let browser,page,recording=null;
const resourceReads=[];

async function state({full=false,map=false}={}){
  return page.evaluate(({full,map})=>{
    const probe=window.__probe,inspection=probe.exteriorInspection(),pos=probe.pos();
    const result={pos,physical:inspection.physical,zone:inspection.zone,camera:inspection.camera,
      look:probe.lookAngles(),scene:window.__scenes?.top()?.id||null,focus:probe.interactionFocus(),
      assets:inspection.assets,catalogCount:inspection.catalog.length,submittedCount:inspection.submittedIds.length,
      shader:window.__chunkSurferPixelMesh?.status?.(),motion:window.__chunkSurferMotion?.status?.()};
    if(full){result.rendered=inspection.rendered;result.catalog=inspection.catalog;result.submittedIds=inspection.submittedIds;}
    if(map){const model=probe.map();result.map={context:model.context,player:model.player,waypoint:model.waypoint,
      floors:model.floors.map(f=>({id:f.id,bounds:f.bounds,openCount:f.open?.size,visibilityCount:f.visibilityOpen?.size})),
      spaces:model.spaces,district:full?model.district:{footprintCount:model.district?.footprints?.length,
        boundaryCount:model.district?.institutionEdges?.length},route:model.route,policy:model.policy};}
    return result;
  },{full,map});
}
async function assets(required=requiredDefault){
  const ready=await page.evaluate(()=>window.__probe.exteriorAssetsReady());
  const catalog=await page.evaluate(()=>window.__probe.exteriorInspection().catalog),missing=required.filter(mesh=>!catalog.includes(mesh));
  if(!ready.glassCourt||!ready.publicFront||missing.length)throw Error('Required scene assets unavailable: '+JSON.stringify({ready,missing}));
  return{ready,required,catalogCount:catalog.length};
}
async function fixture(command){
  if(recording)throw Error('Fixture mutations are forbidden during a recorded walk.');
  const result=await page.evaluate(async q=>{
    const p=window.__probe;await p.testRun();p.clearDiagnosticScenes();p.frontEndGrade(false);p.hush();p.tutSkip();
    const stagedFlags=['prologueDone','bag.taken','map.taken','kit.fitted','van.closed','title.shown',
      'opening.driveTeaser.consumed','setup.levels','setup.waypoint','combat.trained'];
    p.setFlags(stagedFlags);
    await p.exteriorAssetsReady();
    let point;
    if(q.world){
      if(q.world.length<2||q.world.length>3||!q.world.every(Number.isFinite))throw Error('world must be [x,z] or [x,z,floor] in metres.');
      point=p.exteriorStandingPoint(q.world[0],q.world[1],q.world[2]??0);
      if(!point)throw Error('The requested physical point is not clear standing ground.');
      p.warpRuntime(point.x,point.y);
    }else if(q.hook){
      if(!await p.godWarpHook(q.hook))throw Error('The named authored hook could not be staged.');
    }else throw Error('A fixture requires an explicit physical world point or authored hook.');
    p.lookAtWorld(q.yaw??0,q.pitch??0);p.setTorch(q.torch!==false);
    return{stagedFlags,point:point||p.pos(),world:q.world,hook:q.hook,
      qualification:'Developer-staged map, kit, completed arrival/training and suppressed HUSH, with one legal initial placement. These prerequisites were not earned.'};
  },command);
  await assets(command.required||requiredDefault);await wait(500);
  return{...result,state:await state({map:true})};
}
async function startFilm(name){
  if(recording)throw Error('A walk is already being recorded.');
  const id=safeName(name||'walk');
  const result=await page.evaluate(()=>{
    const host=document.querySelector('#map');if(!host)throw Error('The ordinary game stage is unavailable.');
    const rect=host.getBoundingClientRect(),canvas=document.createElement('canvas');
    canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);
    const context=canvas.getContext('2d'),stream=canvas.captureStream(30);
    const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mimeType)throw Error('No supported WebM recording format.');
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2500000});
    const film=window.__exteriorIntegrationFilm={running:true,start:performance.now(),chunks:[],samples:[],lastSample:-Infinity,stream,recorder};
    recorder.ondataavailable=e=>{if(e.data.size)film.chunks.push(e.data);};
    function frame(now){
      if(!film.running)return;
      context.globalAlpha=1;context.filter='none';context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
      const box=host.getBoundingClientRect();
      const layers=[...host.querySelectorAll('canvas')].map((e,index)=>({e,index,style:getComputedStyle(e),rect:e.getBoundingClientRect()}))
        .filter(v=>v.style.display!=='none'&&v.style.visibility!=='hidden'&&Number(v.style.opacity)>0&&v.rect.width>0&&v.rect.height>0)
        .sort((a,b)=>(Number(a.style.zIndex)||0)-(Number(b.style.zIndex)||0)||a.index-b.index);
      for(const layer of layers){context.globalAlpha=Number(layer.style.opacity);context.filter=layer.style.filter;
        context.drawImage(layer.e,layer.rect.x-box.x,layer.rect.y-box.y,layer.rect.width,layer.rect.height);}
      if(now-film.lastSample>=100){
        const p=window.__probe,inspection=p.exteriorInspection();film.lastSample=now;
        film.samples.push({ms:now-film.start,pos:p.pos(),physical:inspection.physical,camera:inspection.camera,
          scene:window.__scenes?.top()?.id||null,focus:p.interactionFocus(),look:p.lookAngles(),
          shaderFrames:window.__chunkSurferPixelMesh?.status?.()?.framesRendered});
      }
      requestAnimationFrame(frame);
    }
    recorder.start(500);requestAnimationFrame(frame);
    return{width:canvas.width,height:canvas.height,mimeType,qualification:'Uncut game-stage canvas composite including the navigator; video only, without recorded audio.'};
  });
  recording=id;return{name:id,...result};
}
async function endFilm(){
  if(!recording)throw Error('No walk is being recorded.');
  const name=recording;
  const result=await page.evaluate(async()=>{
    const f=window.__exteriorIntegrationFilm;f.running=false;
    await new Promise(done=>{f.recorder.onstop=done;f.recorder.stop();});f.stream.getTracks().forEach(track=>track.stop());
    const bytes=new Uint8Array(await new Blob(f.chunks,{type:f.recorder.mimeType}).arrayBuffer());let raw='';
    for(let at=0;at<bytes.length;at+=8192)raw+=String.fromCharCode(...bytes.subarray(at,at+8192));
    return{base64:btoa(raw),samples:f.samples,seconds:(performance.now()-f.start)/1000,mimeType:f.recorder.mimeType};
  });
  recording=null;const bytes=Buffer.from(result.base64,'base64');delete result.base64;
  await fs.writeFile(path.join(output,name+'.webm'),bytes);
  await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(result,null,2)+'\n');
  const receipt={file:name+'.webm',trace:name+'.json',bytes:bytes.length,sha256:hash(bytes),seconds:result.seconds,sampleCount:result.samples.length};
  report.movies.push(receipt);return receipt;
}

try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:true,userDataDir:profile,pipe:true,timeout:60000,protocolTimeout:180000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
  await page.setCacheEnabled(false);await page.bringToFront();
  page.on('pageerror',error=>report.errors.push({kind:'pageerror',message:String(error.stack||error)}));
  page.on('console',message=>{if(['error','warn'].includes(message.type())){
    const item={kind:'console',level:message.type(),message:message.text()};(message.type()==='error'?report.errors:report.warnings).push(item);
  }});
  page.on('requestfailed',request=>report.errors.push({kind:'requestfailed',url:request.url(),failure:request.failure()}));
  page.on('response',response=>{
    if(response.status()>=400)report.errors.push({kind:'http',status:response.status(),url:response.url()});
    const pathname=new URL(response.url()).pathname;
    if(pathname.endsWith('.glb')||pathname==='/index.html'||pathname==='/src/main.js'||/\/main-[^/]+\.js$/.test(pathname)){
      const receipt={url:response.url(),status:response.status()};report.resources.push(receipt);
      resourceReads.push(response.buffer().then(bytes=>Object.assign(receipt,{bytes:bytes.length,sha256:hash(bytes)}))
        .catch(error=>{receipt.bodyError=String(error);}));
    }
  });
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.exteriorInspection&&window.__probe?.exteriorStandingPoint,{timeout:180000,polling:500});
  report.graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d')?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return{renderer:gl&&(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)),webgl:!!gl};});
  write({ready:true,url:url.href,output,graphics:report.graphics,state:await state()});
  for await(const line of createInterface({input:process.stdin,terminal:false})){
    if(!line.trim())continue;let command;
    try{
      command=JSON.parse(line);let result;
      switch(command.op){
        case 'fixture':result=await fixture(command);break;
        case 'assets':result=await assets(command.required||requiredDefault);break;
        case 'state':result=await state({full:!!command.full,map:!!command.map});break;
        case 'map':result=(await state({full:!!command.full,map:true})).map;break;
        case 'look':if(recording)throw Error('Use ordinary arrow-key controls during a recorded walk.');
          await page.evaluate(q=>window.__probe.lookAtWorld(q.yaw,q.pitch||0),command);result=await state();break;
        case 'key':await page.keyboard.press(command.key);await wait(Math.max(0,Math.min(30000,command.ms??150)));result=await state();break;
        case 'hold':{const keys=command.keys||[command.key],duration=Math.max(1,Math.min(30000,Number(command.ms)||100));
          for(const key of keys)await page.keyboard.down(key);
          try{await wait(duration);}finally{for(const key of keys)await page.keyboard.up(key);}
          result=await state();break;}
        case 'wait':await wait(Math.max(1,Math.min(30000,Number(command.ms)||100)));result=await state();break;
        case 'shot':{const name=safeName(command.name),bytes=await page.screenshot({path:path.join(output,name+'.png')});
          result={file:name+'.png',bytes:bytes.length,sha256:hash(bytes),state:await state({map:true})};report.screenshots.push(result);break;}
        case 'record':result=await startFilm(command.name);break;
        case 'stop':result=await endFilm();break;
        case 'close':if(recording)await endFilm();result={closed:true};break;
        default:throw Error('Unknown inspection command.');
      }
      report.operations.push({at:new Date().toISOString(),command,result});await persist();write({ok:true,result});
      if(command.op==='close')break;
    }catch(error){const result={kind:'operation',command,message:String(error.stack||error)};report.errors.push(result);await persist();write({ok:false,error:result.message});}
  }
}catch(error){
  report.errors.push({kind:'fatal',message:String(error.stack||error)});throw error;
}finally{
  if(recording)await endFilm().catch(error=>report.errors.push({kind:'recording-close',message:String(error)}));
  await Promise.allSettled(resourceReads);report.ended=new Date().toISOString();await persist();
  await browser?.close();await fs.rm(profile,{recursive:true,force:true});
}
