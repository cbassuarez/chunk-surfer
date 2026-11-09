// One initial QA placement; thereafter actual keyboard steps against the live
// floor, doors and prop bodies. Camera bearings are QA aims, not player input.
import puppeteer from 'puppeteer-core';
import{createServer}from'vite';
import{mkdir,mkdtemp,readFile,writeFile,rm}from'node:fs/promises';
import{createHash}from'node:crypto';import{tmpdir}from'node:os';import{join,resolve}from'node:path';
import{spawnSync}from'node:child_process';
import{compileAtriumAccess,atriumBodyRoute,ATRIUM_ROUTE_TARGETS}from'./audit-atrium-access.mjs';
const out=resolve(process.env.ATRIUM_OUT||'artifacts/atrium-access/native');
const port=Number(process.env.ATRIUM_PORT)||5396;
const url=process.env.GAME_URL||`http://127.0.0.1:${port}`;
const freezeMain=process.env.ATRIUM_FROZEN_MAIN==='1';
if(freezeMain&&process.env.GAME_URL)throw Error('Frozen-main validation must own its Vite server');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
await mkdir(out,{recursive:true});compileAtriumAccess();
const report={method:'One initial warpRuntime(150,27) fixture with master key from testRun; relevant leaves opened as an explicit fixture. Every subsequent displacement is an ordinary W key, with read-only live position checks and QA camera aiming. Continuous renderer+actual WebAudio recording. Not unfamiliar-human acceptance.',steps:[],captures:[],checks:[],errors:[],sources:{},beforeAsset:await hash('public/assets/conservatory-props.glb')};
const mainPath=resolve('src/main.js'),frozenMain=freezeMain?await readFile(mainPath,'utf8'):null;
const frozenMainHash=frozenMain==null?null:createHash('sha256').update(frozenMain).digest('hex');
const markerMain=frozenMainHash?`ATRIUM_FROZEN_MAIN_SHA:${frozenMainHash}`:null;
if(freezeMain){await writeFile(join(out,'frozen-main.js'),frozenMain);report.frozenMain={file:join(out,'frozen-main.js'),sha256:frozenMainHash,loadRequests:[],servedMarker:false,rawDiskAtFreeze:frozenMainHash};}
const sources=['src/data/floorplan/conservatory.js','src/data/conservatory-props.js','src/data/building-amenities.js','src/data/conservatory-doors.js','src/data/atrium-circulation.js','src/main.js',
  'src/game/props.js','src/world/floorplan.js','src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js'];
for(const source of sources)report.sources[source]=freezeMain&&source==='src/main.js'?frozenMainHash:await hash(source);
let server,browser,page,profile,stage='boot';
const servedReads=[];
const state=()=>page.evaluate(()=>({pos:window.__probe.pos(),floor:window.__probe.floorH(),look:window.__probe.lookAngles(),
  scene:window.__scenes.top()?.id||null,focus:window.__probe.interactionFocus(),
  eye:window.__probe.exteriorInspection().camera,gl:document.querySelector('canvas.r3d')?.getContext('webgl2')?.getError()}));
async function capture(name){
  await sleep(300);const s=await state(),frame=await page.evaluate(()=>Object.fromEntries(['scene','vfd'].map(k=>[k,window.__probe.sourceShoreCapture(k)])));
  for(const[k,data]of Object.entries(frame))if(data)await writeFile(join(out,`${name}-${k}.png`),Buffer.from(data.split(',')[1],'base64'));
  await page.screenshot({path:join(out,`${name}.png`)});report.captures.push({name,...s});
  console.log('CAPTURE',name,JSON.stringify({pos:s.pos,floor:s.floor,scene:s.scene,gl:s.gl}));
}
async function walkTo(id,target){
  stage=id;let now=(await state()).pos,path=atriumBodyRoute(now,target);
  if(!path)throw Error(`No compiled ordinary route for ${id} from${JSON.stringify(now)}`);
  const budget=path.length*5+20;let stalls=0;
  for(let n=0;n<budget;n++){
    now=(await state()).pos;if(now.x===target.x&&now.y===target.y)return;
    if(!path.length||path[0].from.x!==now.x||path[0].from.y!==now.y)path=atriumBodyRoute(now,target);
    if(!path?.length)throw Error(`${id}: lost route at${JSON.stringify(now)}`);
    const edge=path[0],yaw=Math.atan2(edge.dx,-edge.dy);
    await page.evaluate(yaw=>window.__probe.lookAtWorld(yaw,-.08),yaw);
    await page.keyboard.press('w');await sleep(40);const after=await state();
    report.steps.push({stage,from:now,to:after.pos,floor:after.floor,scene:after.scene,expected:edge.to});
    if(after.pos.x===now.x&&after.pos.y===now.y){if(++stalls>5)throw Error(`${id}: live movement blocked at${JSON.stringify(now)}`);}
    else{stalls=0;path.shift();}
  }
  throw Error(`${id}: keyboard budget exhausted`);
}
try{
  if(!process.env.GAME_URL){server=await createServer({configFile:'vite.config.js',plugins:freezeMain?[{
    name:'atrium-immutable-main-qa',enforce:'pre',load(id){
      if(id.split('?')[0]!==mainPath)return null;
      report.frozenMain.loadRequests.push({id,sha256:frozenMainHash});
      return`/* ${markerMain} */\n${frozenMain}`;
    },
  }]:[],server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();}
  profile=await mkdtemp(join(tmpdir(),'atrium-native-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:true,protocolTimeout:180000,
    args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);
  page.on('pageerror',e=>report.errors.push({stage,error:String(e.stack||e)}));
  if(freezeMain)page.on('response',response=>{
    if(new URL(response.url()).pathname!=='/src/main.js'||response.status()!==200)return;
    servedReads.push(response.text().then(async source=>{
      report.frozenMain.servedMarker=source.includes(markerMain);
      report.frozenMain.transformedSha256=createHash('sha256').update(source).digest('hex');
      report.frozenMain.transformedBytes=Buffer.byteLength(source);
      await writeFile(join(out,'served-main-transformed.js'),source);
    }).catch(error=>report.errors.push({stage:'served-main-provenance',error:String(error)})));
  });
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
    window.__atriumAudioTaps=new Map();const connect=AudioNode.prototype.connect,seen=new WeakSet();
    AudioNode.prototype.connect=function(destination,...args){
      if(destination===this.context.destination&&!seen.has(this)){
        seen.add(this);let tap=window.__atriumAudioTaps.get(this.context);
        if(!tap){tap=this.context.createMediaStreamDestination();window.__atriumAudioTaps.set(this.context,tap);}
        connect.call(this,tap);
      }
      return connect.call(this,destination,...args);
    };
  });
  await page.goto(`${url}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:180000});
  await page.evaluate(async()=>{
    await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','kit.fitted']);
    const fp=await import('/src/world/floorplan.js');
    for(const id of['dock-foyer-service','public-wc-large','public-wc-standard','foh-office','hall-stage-service','hall-vestibule','pool-lobby'])fp.setDoorOpen(id,true);
    window.__probe.warpRuntime(150,27,1);window.__probe.setTorch(true);window.__probe.setTorchBattery(1);
    window.__probe.lookAtWorld(Math.PI/2,-.08);await window.__probe.exteriorAssetsReady();
  });
  await page.waitForFunction(()=>window.__probe.glassCourt().ready&&window.__probe.exteriorInspection().catalog.some(m=>(typeof m==='string'?m:m.name)==='hall_stage_service_steps'),{timeout:180000});
  await Promise.all(servedReads);
  if(freezeMain&&(!report.frozenMain.servedMarker||!report.frozenMain.loadRequests.length))throw Error('Chrome did not receive the immutable main revision');
  await page.mouse.click(640,400);await sleep(1200);
  report.fixture={...await state(),keys:await page.evaluate(()=>window.__probe.keys())};
  if(!report.fixture.keys.includes('master'))throw Error('Native fixture has no issued master key');
  await page.evaluate(()=>{
    const stream=document.querySelector('canvas.r3d').captureStream(30);
    const tap=[...window.__atriumAudioTaps.values()][0];if(tap)for(const track of tap.stream.getAudioTracks())stream.addTrack(track);
    const chunks=[],mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2400000});
    window.__atriumFilm={stream,chunks,recorder,mimeType,audioTracks:stream.getAudioTracks().length,startedAt:performance.now()};
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);
  });
  await capture('01-clear-rear-aisle');
  for(const id of['large-wc','standard-wc','washroom','box-office','hall-stage-service','hall-public','greenhouse','sealed-public-front-approach','scene-dock']){
    const target=ATRIUM_ROUTE_TARGETS.find(t=>t.id===id);
    await walkTo(id,target.at);await capture(`${String(report.captures.length+1).padStart(2,'0')}-${id}`);
    await walkTo(`${id}-return`,{x:150,y:27});report.checks.push({id,outward:true,return:true});
  }
  const film=await page.evaluate(()=>new Promise(resolve=>{const f=window.__atriumFilm;f.recorder.onstop=async()=>{
    const blob=new Blob(f.chunks,{type:f.mimeType}),reader=new FileReader();reader.onload=()=>resolve({data:reader.result,bytes:blob.size,mimeType:f.mimeType,audioTracks:f.audioTracks,seconds:(performance.now()-f.startedAt)/1000});reader.readAsDataURL(blob);f.stream.getTracks().forEach(t=>t.stop());};f.recorder.stop();}));
  const marker=';base64,',offset=film.data.indexOf(marker);
  if(offset<0)throw Error('Recorded movie has no base64 payload marker');
  const saved=Buffer.from(film.data.slice(offset+marker.length),'base64');
  if(saved.length!==film.bytes||saved.subarray(0,4).toString('hex')!=='1a45dfa3')throw Error('Saved movie bytes/header do not match the recorded WebM Blob');
  const video=join(out,'continuous-keyboard-walk.webm');await writeFile(video,saved);delete film.data;report.film=film;
  const probe=spawnSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,codec_type,width,height','-of','json',video],{encoding:'utf8'});
  if(probe.status!==0)throw Error(`Saved movie probe failed: ${probe.stderr}`);
  const decoded=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-threads','2','-i',video,'-map','0','-f','null','-'],{encoding:'utf8'});
  report.savedMedia={bytes:saved.length,blobBytes:film.bytes,ebml:saved.subarray(0,4).toString('hex'),probe:JSON.parse(probe.stdout),
    fullDecodeExitStatus:decoded.status,fullDecodeErrors:decoded.stderr,pass:decoded.status===0};
  if(!report.savedMedia.pass)throw Error(`Saved movie full decode failed: ${decoded.stderr}`);
  report.afterAsset=await hash('public/assets/conservatory-props.glb');report.assetStable=report.afterAsset===report.beforeAsset;
  report.sourceStable=true;report.sourceEnd={};for(const source of sources){
    const diskHash=await hash(source);
    if(freezeMain&&source==='src/main.js'){
      report.frozenMain.rawDiskEnd=diskHash;report.frozenMain.rawDiskDrift=diskHash!==frozenMainHash;
      report.sourceEnd[source]=frozenMainHash;
    }else report.sourceEnd[source]=diskHash;
    if(report.sourceEnd[source]!==report.sources[source])report.sourceStable=false;
  }
  report.pass=report.assetStable&&report.sourceStable&&!report.errors.length&&report.checks.length===9&&report.captures.every(c=>c.gl===0);
  if(!report.pass)process.exitCode=1;
}catch(error){report.error={stage,message:String(error.stack||error)};report.pass=false;process.exitCode=1;console.error(report.error.message);await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server?.close();if(profile)await rm(profile,{recursive:true,force:true});
  console.log(JSON.stringify({pass:report.pass,checks:report.checks,steps:report.steps.length,film:report.film,error:report.error,errors:report.errors},null,2));
}
