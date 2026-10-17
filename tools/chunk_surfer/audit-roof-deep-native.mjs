// Composition evidence, not an automatic judgment of beauty. Initial QA fixture
// only; from the gallery gate onward movement, looking and interactions use the
// ordinary keyboard/pointer input path. Browser is held for matched revisions.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile,writeFile,appendFile,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const out=resolve(process.env.ROOF_DEEP_OUT||'artifacts/roof-floor-design/deep-composition');
const projectRoot=resolve(process.env.ROOF_DEEP_ROOT||'.');
const assetOverride=process.env.ROOF_DEEP_ASSET_FILE?resolve(process.env.ROOF_DEEP_ASSET_FILE):null;
const servedAssetFile=assetOverride||resolve(projectRoot,'public/assets/conservatory-props.glb');
const assetOverrideRequests=[];
const port=Number(process.env.ROOF_DEEP_PORT)||5392;
const initialRunName=process.env.ROOF_DEEP_RUN_NAME||'baseline';
const diagnosticOnly=process.env.ROOF_DEEP_DIAGNOSTICS_ONLY==='1';
const url=`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const hash=async f=>createHash('sha256').update(await readFile(resolve(projectRoot,f))).digest('hex');
const sources=['src/main.js','src/data/academic-roof.js','src/data/academic-roof-dressing.js','src/render/props3d.js','src/render/r3d.js','src/render/printed-surface.js','src/render/pixel-mesh/shader.js','tools/chunk_surfer/academic-roof-geometry.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async f=>[f,await hash(f).catch(()=>null)])));
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'roof-deep-native-'));
const assetOverridePlugin={name:'roof-deep-native-asset-override',enforce:'pre',configureServer(vite){if(!assetOverride)return;vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/assets/conservatory-props.glb'||!['GET','HEAD'].includes(req.method))return next();try{const meta=await stat(servedAssetFile);assetOverrideRequests.push({url:req.url,method:req.method,path:servedAssetFile,bytes:meta.size});res.statusCode=200;res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Content-Length',String(meta.size));res.setHeader('Cache-Control','no-store');if(req.method==='HEAD')return res.end();const stream=createReadStream(servedAssetFile);stream.on('error',error=>res.destroy(error));stream.pipe(res);}catch(error){next(error);}});}};
const server=await createServer({root:projectRoot,configFile:resolve('vite.config.js'),plugins:[assetOverridePlugin],optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null,fs:{allow:[projectRoot,resolve('.')]}}});
await server.listen();console.log('SERVER_READY',url);
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:true,defaultViewport:null,timeout:60000,protocolTimeout:300000,args:['--no-sandbox','--window-size=1120,760','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();await page.setCacheEnabled(false);
const errors=[];page.on('pageerror',e=>errors.push({time:Date.now(),message:String(e.stack||e)}));
page.on('console',m=>{if(['warn','error'].includes(m.type()))console.log('BROWSER',m.type(),m.text());});
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  // Map actual cached uniform-location objects before any renderer compiles.
  // Diagnostic clock changes shader time only, never scene/input/audio clocks.
  const uniformNames=new WeakMap(),clockContexts=new WeakSet();
  window.__roofShaderClock={enabled:false,timeSec:1000,counts:{},contexts:0};
  window.__roofGlassBindingAblation={enabled:false,forcedValue:0,count:0};
  for(const Ctor of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
    if(!Ctor)continue;
    const get=Ctor.prototype.getUniformLocation,one=Ctor.prototype.uniform1f;
    Ctor.prototype.getUniformLocation=function(program,name){const result=get.call(this,program,name);if(result)uniformNames.set(result,String(name));return result;};
    Ctor.prototype.uniform1f=function(location,value){const clock=window.__roofShaderClock,name=uniformNames.get(location),glass=window.__roofGlassBindingAblation;if(clock?.enabled&&['uTime','uTimeSec','uTimeP'].includes(name)){value=clock.timeSec;clock.counts[name]=(clock.counts[name]||0)+1;if(!clockContexts.has(this)){clockContexts.add(this);clock.contexts++;}}if(glass?.enabled&&name==='uRoofGlass'){value=glass.forcedValue;glass.count++;}return one.call(this,location,value);};
  }
  window.__roofAudioTaps=[];
  const original=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
    const result=original.call(this,destination,...args);
    if(destination===this.context.destination){
      let tap=window.__roofAudioTaps.find(t=>t.context===this.context);
      if(!tap){tap={context:this.context,stream:this.context.createMediaStreamDestination(),connections:0};window.__roofAudioTaps.push(tap);}
      original.call(this,tap.stream);tap.connections++;
    }
    return result;
  };
});
let current=null,video=null,stage='boot';
let nextVideoChunk=0,pendingVideoChunks=new Map(),videoWrites=Promise.resolve(),videoChunkManifest=[];
let authored=null;
const state=()=>page.evaluate(()=>({at:performance.now(),pos:window.__probe?.pos?.(),floor:window.__probe?.floorH?.(),look:window.__probe?.lookAngles?.(),worldYaw:window.__roofR3?.r3dWorldYaw?.(),facing:window.__probe?.facing?.(),scene:window.__scenes?.top?.()?.id,sceneView:window.__scenes?.top?.()?.view?.(),focus:window.__probe?.interactionFocus?.(),eye:window.__probe?.sourceShoreView?.()?.eye,world:window.__probe?.world?.(),lighting:window.__probe?.r3dLighting?.(),pointer:window.__chunkSurferPointer?.status?.(),motion:window.__chunkSurferMotion?.status?.(),display:window.__chunkSurferPixelMesh?.status?.(),viewport:[innerWidth,innerHeight],audio:window.__roofAudioTaps?.map(t=>({state:t.context.state,sampleRate:t.context.sampleRate,connections:t.connections}))}));
async function boot(reload=false){
  stage='boot';if(reload){server.moduleGraph.invalidateAll();try{await page.reload({waitUntil:'domcontentloaded',timeout:60000});}catch(e){if(e.name!=='TimeoutError')throw e;}}else{try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});}catch(e){if(e.name!=='TimeoutError')throw e;}}
  console.log('NAVIGATION_RETURNED');
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:300000,polling:1000});
  // Throwaway test profile only, never the user's persisted license identity.
  if(await page.evaluate(()=>window.__scenes.top()?.id==='eula')){await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__scenes.top()?.id!=='eula',{timeout:20000});}
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','academic.entered'],['roof.access']);window.__probe.setTakes(['main_b3'],true);window.__probe.setTorch(true);window.__probe.nightSeed(44812);window.__probe.warpCell(44,243);window.__probe.lookAtWorld(0,-.03);window.__roofP3=await import('/src/render/props3d.js');window.__roofR3=await import('/src/render/r3d.js');window.__roofFP=await import('/src/world/floorplan.js');window.__roofProps=await import('/src/game/props.js');});
  await page.waitForFunction(()=>window.__roofP3.propPackStats()?.meshes>=431&&window.__roofP3.propTargets()?.ready,{timeout:300000,polling:1000});
  if(assetOverride&&!assetOverrideRequests.some(r=>r.method==='GET'))throw Error('Continuous native route did not request the overridden GLB');
  await wait(1500);
  await page.evaluate(()=>document.exitPointerLock?.());await wait(150);
  await page.mouse.click(550,350);
  await page.waitForFunction(()=>window.__chunkSurferMotion?.status?.().input.pointerLocked,{timeout:15000});
  console.log('BOOT_READY',JSON.stringify(await state()));
  if(!authored){
    // Compile only after native boot. Run route search off the browser main
    // thread so its static graph lookup cannot itself freeze the game/video.
    const [{conservatory},FP,P]=await Promise.all(['src/data/floorplan/conservatory.js','src/world/floorplan.js','src/game/props.js'].map(file=>import(pathToFileURL(resolve(projectRoot,file)).href)));
    FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});P.propsInit(FP);authored={FP,P};console.log('AUTHORED_ROUTE_READY');
  }
  await writeFile(join(out,'ready.json'),JSON.stringify({url,state:await state(),hash:await hash(servedAssetFile),servedAssetFile,assetOverrideRequests,liveCanonicalHash:await hash('public/assets/conservatory-props.glb'),sources:await hashes()},null,2));
}
async function point(yaw,pitch,duration=650){
  // Input deltas only: no camera/scene APIs after initial fixture. We measure
  // resulting yaw because r3d clamps a single huge displacement per frame.
  let start=await state();
  if(!start.pointer?.locked){
    // Ordinary click is currently necessary after a seat's lowering/rising
    // scene relinquishes pointer lock. Log the friction, do not use debug aim.
    current?.inputs.push({kind:'mouse-click-to-reacquire-look',at:Date.now(),scene:start.scene,reason:start.pointer?.lastReason});
    if(!current?.name.startsWith('baseline')&&start.scene==='academic-roof-sit')throw Error('Revised roof seat still requires a click to regain ordinary mouse look');
    await page.mouse.click(550,350);
    await page.waitForFunction(()=>window.__chunkSurferMotion?.status?.().input.pointerLocked,{timeout:15000});
    start=await state();
  }
  const localYaw=start.look.yaw;
  // Read the settled plan rotation. The target head yaw and eased drawn yaw
  // are different during a turn, so do not infer rotation from those two.
  const planYaw=0; // The academic building and both roof strips are unrotated.
  const wanted=yaw-planYaw;
  let totalDx=0,totalDy=0;
  for(let i=0;i<90;i++){
    const s=await state();
    let delta=((wanted-s.look.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    const deltaP=pitch-s.look.pitch;
    if(Math.abs(delta)<.013&&Math.abs(deltaP)<.013)break;
    const dx=Math.max(-12,Math.min(12,delta/.0048)),dy=Math.max(-12,Math.min(12,-deltaP/.0048));
    await page.evaluate(({dx,dy})=>{const e=new MouseEvent('mousemove',{bubbles:true});Object.defineProperties(e,{movementX:{value:dx},movementY:{value:dy}});window.dispatchEvent(e);},{dx,dy});
    totalDx+=dx;totalDy+=dy;await wait(Math.max(20,duration/28));
    if(i===89)throw Error(`Mouse look did not converge: ${JSON.stringify({wanted,pitch,look:s.look,pointer:s.pointer})}`);
  }
  current?.inputs.push({kind:'mouse-look',target:{yaw,pitch},from:start.look,to:(await state()).look,dx:totalDx,dy:totalDy,at:Date.now()});
}
async function keypress(key){const s=await state();await page.keyboard.press(key);await wait(110);current?.inputs.push({kind:'key',key,at:Date.now(),from:s.pos,to:(await state()).pos});}
async function route(target){
  const {FP,P}=authored,start=(await state()).pos,key=p=>`${p.x},${p.y}`;
  const end=FP.toRuntimePoint(target),seen=new Map([[key(start),null]]),queue=[start];
  const within=p=>(p.x>=84&&p.x<100&&p.y>=478&&p.y<500)||(p.x>=316&&p.x<380&&p.y>=548&&p.y<586)||(p.x>=380&&p.x<428&&p.y>=540&&p.y<594);
  for(let i=0;i<queue.length;i++){const p=queue[i];if(key(p)===key(end))break;for(const[dx,dy]of[[0,-1],[1,0],[0,1],[-1,0]]){const m=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set(['master'])});if(!m.ok)continue;const to=m.redirect||{x:p.x+dx,y:p.y+dy};if(!within(to)||!P.propCanOccupy(to.x,to.y)||seen.has(key(to)))continue;seen.set(key(to),{from:key(p),dx,dy,portal:m.edgePortal||null});queue.push(to);}}
  if(!seen.has(key(end)))throw Error(`No path ${key(start)} to ${key(end)}`);
  const steps=[];for(let here=key(end);here!==key(start);){const e=seen.get(here);steps.push({...e,to:here});here=e.from;}return{target:end,steps:steps.reverse()};
}
async function walk(label,x,y){
  stage=label;const initial=await route({x,y});console.log('WALK',label,initial.steps.length);let stalls=0;
  for(let i=0;i<initial.steps.length*8+24;i++){
    const r=await route({x,y});if(!r.steps.length){current.beats.push({kind:'arrival',label,state:await state()});return;}
    const edge=r.steps[0];await point(Math.atan2(edge.dx,-edge.dy),-.08,180);
    const before=await state();await keypress('w');const after=await state();
    console.log('STEP',label,i,JSON.stringify({from:before.pos,to:after.pos,look:after.look}));
    current.steps.push({label,before:before.pos,after:after.pos,floor:after.floor,portal:edge.portal,at:Date.now()});
    if(before.pos.x===after.pos.x&&before.pos.y===after.pos.y){if(++stalls>=4)throw Error(`Movement stalled at ${label}: ${JSON.stringify(after.pos)}`);}else stalls=0;
  }throw Error(`Did not finish ${label}`);
}
async function capture(name,dwell=1500){
  stage=name;await wait(dwell);const s=await state();
  await page.screenshot({path:join(current.dir,`${name}.webp`),type:'webp',quality:92});
  const props=await page.evaluate(()=>window.__probe.props());
  await writeFile(join(current.dir,`${name}-props-state.json`),JSON.stringify(props,null,2));
  const decisive=current.name==='baseline'||/^(02-first-foot-drop|08-west-seat-default|13-east-seat-default)$/.test(name);
  const raw=decisive?await page.evaluate(()=>Object.fromEntries(['props','scene','mark-alpha','vfd'].map(k=>[k,window.__probe.sourceShoreCapture?.(k)]))):{};
  for(const[k,data]of Object.entries(raw))if(data?.startsWith('data:'))await writeFile(join(current.dir,`${name}-${k}.png`),Buffer.from(data.split(',')[1],'base64'));
  current.captures.push({name,...s,renderedIds:props?.renderedIds});
  await writeFile(join(current.dir,'report.json'),JSON.stringify(current,null,2));console.log('CAPTURE',name,JSON.stringify({pos:s.pos,eye:s.eye,look:s.look,scene:s.scene,focus:s.focus?.propId}));
}
async function performanceSample(label,ms=4000){
  const values=await page.evaluate(ms=>new Promise(resolve=>{let last=performance.now(),start=last,a=[];function tick(t){a.push(t-last);last=t;if(t-start>=ms)resolve(a);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}),ms);
  const sorted=values.slice(1).sort((a,b)=>a-b);return{label,ms,samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],over50ms:sorted.filter(n=>n>50).length,raw:values};
}
async function recordStart(){
  // Capture the game's visible native canvases and its real WebAudio output in
  // one clocked stream. No image sequence, slowed replay, sound substitute or
  // cuts. DOM-only browser chrome is excluded; final dither and HUD canvases
  // are included. Canvas composition avoids CDP PNG screencast contention.
  video={kind:'canvas-mediarecorder'};
  current.recordingStart=Date.now();
  nextVideoChunk=0;pendingVideoChunks=new Map();videoWrites=Promise.resolve();videoChunkManifest=[];
  await page.exposeFunction('__roofWriteAV',async({index,data,timecode})=>{
    pendingVideoChunks.set(index,{buffer:Buffer.from(data,'base64'),timecode});
    while(pendingVideoChunks.has(nextVideoChunk)){
      const index=nextVideoChunk++,chunk=pendingVideoChunks.get(index);pendingVideoChunks.delete(index);
      videoChunkManifest.push({index,timecode:chunk.timecode,bytes:chunk.buffer.length,sha256:createHash('sha256').update(chunk.buffer).digest('hex')});
      videoWrites=videoWrites.then(()=>appendFile(join(current.dir,'uncut-with-audio.webm'),chunk.buffer));
    }
    await videoWrites;
  }).catch(()=>{});
  current.audioRecording=await page.evaluate(()=>{
    const taps=window.__roofAudioTaps.filter(t=>t.context.state==='running');if(!taps.length)return{available:false,reason:'No running AudioContext destination tap'};
    const canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight;const ctx=canvas.getContext('2d',{alpha:false});
    const sources=[...document.querySelectorAll('canvas')].filter(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;}).sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
    window.__roofVideoCanvas=canvas;window.__roofDrawVideo=true;let last=0;
    function draw(t){if(!window.__roofDrawVideo)return;if(t-last>=1000/12){last=t;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);for(const c of sources){const r=c.getBoundingClientRect();try{ctx.drawImage(c,r.x,r.y,r.width,r.height);}catch{}}}requestAnimationFrame(draw);}requestAnimationFrame(draw);
    const stream=canvas.captureStream(12);for(const track of taps.flatMap(t=>t.stream.stream.getAudioTracks()))stream.addTrack(track);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:3500000,audioBitsPerSecond:128000});
    window.__roofAudioRecorder=recorder;window.__roofAudioPending=[];
    let chunkIndex=0;
    recorder.ondataavailable=e=>{if(!e.data.size)return;const index=chunkIndex++,timecode=e.timecode;const p=new Promise(resolve=>{const r=new FileReader();r.onload=()=>{const value=String(r.result);resolve(window.__roofWriteAV({index,timecode,data:value.slice(value.lastIndexOf(',')+1)}));};r.readAsDataURL(e.data);});window.__roofAudioPending.push(p);};
    recorder.start(1000);return{available:true,contextCount:taps.length,connections:taps.map(t=>t.connections),tracks:stream.getAudioTracks().length,startedAt:performance.now(),method:'Visible native final-render and HUD canvases, composite at viewport size, VP8/Opus MediaRecorder 12fps',canvases:sources.map(c=>({class:c.className,width:c.width,height:c.height,z:getComputedStyle(c).zIndex}))};
  });
  await page.evaluate(()=>{window.__roofTrajectory=[];window.__roofTrajectoryTimer=setInterval(()=>{const p=window.__probe,s=window.__scenes.top();window.__roofTrajectory.push({at:performance.now(),pos:p.pos(),look:p.lookAngles(),worldYaw:window.__roofR3.r3dWorldYaw(),floor:p.floorH(),eye:p.sourceShoreView?.()?.eye,scene:s?.id,sceneView:s?.view?.(),worldView:s?.worldView?.(),roofStairAudio:p.roofStairAudio?.()});},100);});
}
async function recordStop(){
  if(!video)return;current.recordingEnd=Date.now();
  await page.evaluate(async()=>{clearInterval(window.__roofTrajectoryTimer);const r=window.__roofAudioRecorder;if(r?.state==='recording'){await new Promise(resolve=>{r.onstop=resolve;r.stop();});await Promise.all(window.__roofAudioPending);}window.__roofDrawVideo=false;});
  video=null;
  await videoWrites;
  current.videoChunkOrder={written:nextVideoChunk,pending:pendingVideoChunks.size,method:'Explicit sequence numbers; out-of-order FileReader completions buffered; serialized append writes'};
  await writeFile(join(current.dir,'video-chunks.json'),JSON.stringify(videoChunkManifest,null,2));
  await writeFile(join(current.dir,'trajectory.json'),JSON.stringify(await page.evaluate(()=>window.__roofTrajectory),null,2));
  current.audioMux={code:0,method:'Video and real audio recorded in same MediaRecorder stream; no mux drift'};
}
async function run(name='baseline',reload=false){
  if(reload)await boot(true);
  const dir=join(out,name);await mkdir(dir,{recursive:true});
  current={name,dir,projectRoot,startedAt:new Date().toISOString(),method:'Single initial gallery QA fixture; ordinary keyboard movement, pointer-delta looking, E interactions; live collisions; no warps between beats',servedAssetFile,assetOverride:!!assetOverride,assetOverrideRequests,hashStart:await hash(servedAssetFile),liveCanonicalHashStart:await hash('public/assets/conservatory-props.glb'),sources:await hashes(),inputs:[],steps:[],beats:[],captures:[],performance:[],errors:[]};
  try{
    current.performance.push(await performanceSample('warm gallery before recording'));
    await recordStart();await capture('01-gallery-gate');
    const gate=await state();if(gate.focus?.propId!=='roof-gate')throw Error(`Gallery gate focus ${gate.focus?.propId}`);
    await keypress('e');await wait(600);
    await walk('first foot outside',174,285);await point(5.62,-.73);await capture('02-first-foot-drop');
    await walk('lower flight',171,283);await point(Math.PI,-.45);await capture('03-lower-flight-school');
    await walk('turn lookout',159,278.5);await point(Math.PI*.25,-.82);await capture('04-turn-city-below');
    await walk('upper flight',184,281);await point(Math.PI/2,-.12);await capture('05-upper-flight-city');
    await walk('roof arrival',205,272);await point(Math.PI,-.12);await capture('06-roof-arrival');
    await walk('west glass seat',200,289);await point(0,0);await capture('07-west-seat-focus');
    if((await state()).focus?.propId!=='roof-sit-west')throw Error('West seat not focused');
    await keypress('e');await page.waitForFunction(()=>window.__scenes.top()?.id==='academic-roof-sit'&&window.__scenes.top()?.view?.().phase==='seated',{timeout:12000});
    await capture('08-west-seat-default',5000);current.performance.push(await performanceSample('warm west seat during recording'));
    await point(-Math.PI/3,-.12);await capture('09-west-seat-city-left');await point(Math.PI/3,-.12);await capture('10-west-seat-city-right');
    await point(0,-.9);await capture('11-west-seat-glass-down');
    if(!name.startsWith('baseline')){
      // Synchronous ordinary DOM input events make the 0.7s transition test
      // independent of this host's CDP response stalls. No camera or movement
      // probe is used. Keep W held past rising, then release it once.
      const begin=await page.evaluate(()=>{
        const before={pos:window.__probe.pos(),look:window.__probe.lookAngles(),view:window.__scenes.top()?.view?.(),pointer:window.__chunkSurferPointer.status()};
        for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'e',code:'KeyE',bubbles:true,cancelable:true}));
        const rising=window.__scenes.top()?.view?.();
        const e=new MouseEvent('mousemove',{bubbles:true});Object.defineProperties(e,{movementX:{value:12},movementY:{value:-4}});window.dispatchEvent(e);
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));
        return{at:performance.now(),before,rising,input:window.__chunkSurferMotion.status().input};
      });
      await wait(1200);await page.waitForFunction(()=>window.__scenes.top()?.id!=='academic-roof-sit',{timeout:10000});
      const after=await state();
      await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true,cancelable:true})));
      current.transitionInputCheck={method:'Ordinary DOM E edge, mouse delta and W hold injected synchronously during rising; W released once after return to exploration',begin,after};
      current.inputs.push({kind:'rise-mouse-and-held-w',at:Date.now(),begin,after});
      const origin=begin.before.view.origin;
      current.transitionInputCheck.checks=[
        {name:'input sequence began during rising',pass:begin.rising?.phase==='rising'},
        {name:'mouse look during rising survived into exploration',pass:Math.abs(after.look.yaw-begin.before.look.yaw)>1e-5,observedYawDelta:after.look.yaw-begin.before.look.yaw,observedPitchDelta:after.look.pitch-begin.before.look.pitch},
        {name:'W held during rising continued into ordinary movement',pass:after.pos.x!==origin.x||after.pos.y!==origin.y,origin,after:after.pos},
      ];
      // Quantitative observations are evidence, not a reason to abandon an
      // otherwise safe continuous route. Keep any failed check for review.
    }else{await keypress('e');await page.waitForFunction(()=>window.__scenes.top()?.id!=='academic-roof-sit',{timeout:10000});}
    await walk('east glass seat',205,286);await point(0,0);await capture('12-east-seat-focus');
    if((await state()).focus?.propId!=='roof-sit-east')throw Error('East seat not focused');
    await keypress('e');await page.waitForFunction(()=>window.__scenes.top()?.id==='academic-roof-sit'&&window.__scenes.top()?.view?.().phase==='seated',{timeout:12000});
    await capture('13-east-seat-default',5000);await point(Math.PI/2-.65,-.12);await capture('14-east-seat-city-left');await point(Math.PI/2+.65,-.12);await capture('15-east-seat-city-right');
    await point(Math.PI/2,-.9);await capture('16-east-seat-glass-down');await keypress('e');await page.waitForFunction(()=>window.__scenes.top()?.id!=='academic-roof-sit',{timeout:10000});
    await walk('Ren approach without explanatory dialogue',210,275);await point(0,-.04);await capture('17-ren-city-before-dialogue',5000);
    await walk('return to roof entry',205,272);await point(0,-.14);await capture('18-roof-return');
    await walk('upper flight head return',188,282);await point(Math.PI*1.5,-.14);await capture('19-upper-flight-return');
    await walk('exposed turn return',159,283);await point(Math.PI/2,-.18);await capture('20-turn-return');
    await walk('lower flight return',171,283);await point(Math.PI/2,-.12);await capture('21-lower-flight-return');
    await walk('gallery gate return',44,243);await point(0,-.03);await capture('22-gallery-return');
    await recordStop();current.performance.push(await performanceSample('warm gallery after recording'));
  }catch(error){current.errors.push({stage,message:String(error.stack||error)});console.error('RUN_FAIL',stage,error);await recordStop().catch(()=>{});}
  current.hashEnd=await hash(servedAssetFile);current.liveCanonicalHashEnd=await hash('public/assets/conservatory-props.glb');current.assetStable=current.hashStart===current.hashEnd;current.sourcesEnd=await hashes();current.sourcesStable=Object.keys(current.sources).every(f=>current.sources[f]===current.sourcesEnd[f]);current.browserErrors=errors.slice();current.finishedAt=new Date().toISOString();await writeFile(join(dir,'report.json'),JSON.stringify(current,null,2));console.log('RUN_COMPLETE',dir,current.errors.length);
}
try{
  await boot();if(!diagnosticOnly)await run(initialRunName);console.log(diagnosticOnly?'DIAGNOSTIC_HELD_READY':'HELD_BROWSER_READY');
  for(let i=0;i<14400;i++){
    try{await readFile(join(out,'release'));break;}catch{}
    try{const cmd=JSON.parse(await readFile(join(out,'command.json'),'utf8'));await rm(join(out,'command.json'));if(cmd.action==='run')await run(cmd.name||'revision',true);else if(cmd.action==='snapshot'){await capture(cmd.name||'held-snapshot');}else if(cmd.action==='evaluate'){const source=await readFile(resolve(cmd.file),'utf8');const result=await page.evaluate(async source=>await(new Function(`return (async()=>{${source}\n})()`))(),source);await writeFile(join(out,`${cmd.name||'evaluation'}.json`),JSON.stringify(result??null,null,2));}else if(cmd.action==='sample'){const s=await performanceSample(cmd.name||'held',cmd.ms||5000);await writeFile(join(out,`${cmd.name||'sample'}.json`),JSON.stringify(s,null,2));}console.log('COMMAND_COMPLETE',cmd);}catch(e){if(e.code!=='ENOENT')console.error('COMMAND_FAIL',e);}
    await wait(1000);
  }
}catch(error){console.error('FATAL',stage,error);await writeFile(join(out,'fatal.json'),JSON.stringify({stage,error:String(error.stack||error),state:await state().catch(()=>null)},null,2));}
finally{await recordStop().catch(()=>{});await browser.close();await server.close();await rm(profile,{recursive:true,force:true});}
process.exit(0);
