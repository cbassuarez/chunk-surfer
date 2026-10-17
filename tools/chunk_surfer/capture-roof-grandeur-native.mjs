// Matched native-Metal QA placements, not continuous traversal or human proof.
// Run separately before/after canonical GLB publication; no product edits.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const condition=process.env.ROOF_GRANDEUR_CONDITION||'before';
const out=resolve(process.env.ROOF_GRANDEUR_OUT||`artifacts/roof-floor-design/grandeur/${condition}`);
const assetOverride=process.env.ROOF_GRANDEUR_ASSET_FILE?resolve(process.env.ROOF_GRANDEUR_ASSET_FILE):null;
const servedAssetFile=assetOverride||resolve('public/assets/conservatory-props.glb');
const baselineManifest=resolve(process.env.ROOF_GRANDEUR_BASELINE_MANIFEST||'artifacts/roof-floor-design/grandeur/before-comparison-manifest.json');
const port=Number(process.env.ROOF_GRANDEUR_PORT)||5389;
const url=`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const sources=['src/main.js','src/data/academic-roof.js','src/data/academic-roof-dressing.js','src/render/props3d.js','src/render/r3d.js','src/render/printed-surface.js','src/render/pixel-mesh/shader.js','tools/chunk_surfer/academic-roof-geometry.mjs','tools/chunk_surfer/city-district-geometry.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async f=>[f,await hash(f).catch(()=>null)])));
await mkdir(out,{recursive:true});
const report={condition,url,method:'QA placements with actual ordinary E seat entry/exit; native Metal GPU; shader-only time pinned 1000; game clocks remain live; rainy night seed 0, full torch; no human acceptance',startedAt:new Date().toISOString(),servedAssetFile,assetOverride:!!assetOverride,assetOverrideRequests:[],assetHashBefore:await hash(servedAssetFile),liveCanonicalAssetHashBefore:await hash('public/assets/conservatory-props.glb'),sourceHashes:await hashes(),servedSourceHashes:{},captures:[],smoke:[],errors:[],warnings:[]};
const sourceReads=[];
const pendingGlb=new Set(),finishedGlb=new Set();
let browser,server,profile,page,stage='boot';
async function state(){return page.evaluate(()=>{const gl=document.querySelector('canvas.r3d')?.getContext('webgl2');return{pos:window.__probe.pos(),floor:window.__probe.floorH(),look:window.__probe.lookAngles(),world:window.__probe.world?.(),eye:window.__probe.sourceShoreView?.()?.eye,scene:window.__scenes.top()?.id,sceneView:window.__scenes.top()?.view?.(),focus:window.__probe.interactionFocus?.(),lighting:window.__probe.r3dLighting?.(),torch:window.__probe.torch(),seed:window.__probe.nightSeed(),display:window.__chunkSurferPixelMesh?.status?.(),pointer:window.__chunkSurferPointer?.status?.(),motion:window.__chunkSurferMotion?.status?.(),glError:gl?.getError(),shaderClock:window.__roofGrandeurClock};});}
async function capture(name){
 stage=name;
 await page.evaluate(()=>{window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__roofR3.r3dResetVfdMemory();});
 await wait(1200);
 // Wait for a non-strike frame; capture both stages in one JS turn so a
 // lightning update cannot occur between raw scene and final dither reads.
 let frame;
 const started=Date.now();
 while(Date.now()-started<10000){
   frame=await page.evaluate(()=>{const flash=window.__roofR3.r3dStormFlash?.()||0;if(flash>.001)return{pendingFlash:flash};return{images:Object.fromEntries(['scene','vfd'].map(layer=>[layer,window.__probe.sourceShoreCapture(layer)])),renderStormFlash:flash,storm:window.__probe.storm?.(),capturedAt:performance.now()};});
   if(frame.images)break;
   await wait(150);
 }
 if(!frame?.images)throw Error('No quiet storm frame available within10seconds');
 const pose=await state(),files={};
 for(const[layer,data]of Object.entries(frame.images)){
   if(!data?.startsWith('data:image/png;base64,'))throw Error(`Missing capture ${layer}`);
   const path=join(out,`${name}-${layer}.png`);await writeFile(path,Buffer.from(data.split(',')[1],'base64'));files[layer]=path;
 }
 files.screenshot=join(out,`${name}.webp`);await page.screenshot({path:files.screenshot,type:'webp',quality:88});
 report.captures.push({name,...pose,files,renderStormFlash:frame.renderStormFlash,storm:frame.storm,frameCapturedAt:frame.capturedAt,captureMethod:'Raw scene and VFD read synchronously in one JS turn on a non-strike frame; ordinary screenshot follows separately. CPU traffic, eye easing and live clocks remain uncontrolled.'});
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('CAPTURE',name,JSON.stringify({pos:pose.pos,eye:pose.eye,look:pose.look,scene:pose.scene,gl:pose.glError,stormFlash:frame.renderStormFlash}));
}
async function place(name,x,y,yaw,pitch){await page.evaluate(({x,y,yaw,pitch})=>{window.__probe.warpCell(x,y);window.__probe.lookAtWorld(yaw,pitch);},{x,y,yaw,pitch});await capture(name);}
async function seat(id,x,y){stage=id;await page.evaluate(({x,y,id})=>{window.__probe.warpCell(x,y);const p=window.__probe.pos(),bay=window.__probe.props().instances.find(p=>p.id===id);window.__probe.lookAtWorld(Math.atan2(bay.x*2+1-p.x,-(bay.y*2+1-p.y)),0);},{x,y,id});await wait(700);const focus=await page.evaluate(()=>window.__probe.interactionFocus());if(focus?.propId!==id)throw Error(`${id}: actual E focus is ${focus?.propId}`);await page.keyboard.press('e');await page.waitForFunction(()=>window.__scenes.top()?.id==='academic-roof-sit'&&window.__scenes.top().view?.().phase==='seated',{timeout:20000});await capture(id);await page.keyboard.press('e');await page.waitForFunction(()=>window.__scenes.top()?.id!=='academic-roof-sit',{timeout:20000});report.smoke.push({name:`${id}: ordinary E entry and exit`,pass:true,state:await state()});}
try{
 const overridePlugin={name:'roof-native-capture-asset-override',enforce:'pre',configureServer(vite){if(!assetOverride)return;vite.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/assets/conservatory-props.glb'||!['GET','HEAD'].includes(req.method))return next();try{const meta=await stat(servedAssetFile);report.assetOverrideRequests.push({url:req.url,method:req.method,path:servedAssetFile,bytes:meta.size});res.statusCode=200;res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Content-Length',String(meta.size));res.setHeader('Cache-Control','no-store');if(req.method==='HEAD')return res.end();const stream=createReadStream(servedAssetFile);stream.on('error',error=>{report.errors.push({stage:'asset-override',message:String(error)});res.destroy(error);});stream.pipe(res);}catch(error){next(error);}});}};
 server=await createServer({configFile:'vite.config.js',plugins:[overridePlugin],optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();console.log('SERVER_READY',url);
 profile=await mkdtemp(join(tmpdir(),'roof-grandeur-native-'));
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:true,defaultViewport:null,timeout:60000,protocolTimeout:300000,args:['--no-sandbox','--window-size=1120,760','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
 page=await browser.newPage();await page.setCacheEnabled(false);
 page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('.glb'))pendingGlb.add(request.url());});page.on('requestfinished',request=>{if(new URL(request.url()).pathname.endsWith('.glb')){pendingGlb.delete(request.url());finishedGlb.add(new URL(request.url()).pathname);}});page.on('requestfailed',request=>pendingGlb.delete(request.url()));
 page.on('pageerror',e=>report.errors.push({stage,message:String(e.stack||e)}));page.on('console',m=>{if(['error','warn'].includes(m.type()))report.warnings.push({stage,type:m.type(),message:m.text()});});page.on('response',r=>{if(r.status()>=400)report.warnings.push({stage,type:'http',status:r.status(),url:r.url()});});page.on('requestfailed',r=>report.warnings.push({stage,type:'requestfailed',url:r.url(),failure:r.failure()}));
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(!path.startsWith('/src/')||response.status()!==200||!String(response.headers()['content-type']).includes('javascript'))return;sourceReads.push(response.text().then(source=>{const sha256=createHash('sha256').update(source).digest('hex'),prior=report.servedSourceHashes[path];if(prior&&prior.sha256!==sha256)report.errors.push({stage:'served-module-drift',message:`${path} changed while this capture ran`});report.servedSourceHashes[path]={sha256,bytes:Buffer.byteLength(source)};}).catch(error=>report.warnings.push({stage:'source-provenance',url:response.url(),message:String(error)})));});
 await page.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});const names=new WeakMap();window.__roofGrandeurClock={enabled:true,timeSec:1000,counts:{}};for(const Ctor of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){if(!Ctor)continue;const get=Ctor.prototype.getUniformLocation,one=Ctor.prototype.uniform1f;Ctor.prototype.getUniformLocation=function(program,name){const location=get.call(this,program,name);if(location)names.set(location,String(name));return location;};Ctor.prototype.uniform1f=function(location,value){const c=window.__roofGrandeurClock,n=names.get(location);if(c.enabled&&['uTime','uTimeSec','uTimeP'].includes(n)){value=c.timeSec;c.counts[n]=(c.counts[n]||0)+1;}return one.call(this,location,value);};}});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>{if(e.name!=='TimeoutError')throw e;});await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:300000,polling:1000});
 if(await page.evaluate(()=>window.__scenes.top()?.id==='eula')){await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__scenes.top()?.id!=='eula',{timeout:20000});}
 await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','academic.entered','roof.access']);window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__probe.nightSeed(0);window.__roofP3=await import('/src/render/props3d.js');window.__roofR3=await import('/src/render/r3d.js');});
 await page.waitForFunction(()=>window.__roofP3.propPackStats()?.meshes>=431&&window.__roofP3.propTargets()?.ready,{timeout:300000,polling:1000});
 if(assetOverride&&!report.assetOverrideRequests.some(r=>r.method==='GET'))throw Error('Native page did not request the overridden GLB');
 stage='wait-for-supplemental-packs';let count=-1,quietSince=Date.now(),settled=false;const loadStart=Date.now();while(Date.now()-loadStart<240000){const next=await page.evaluate(()=>window.__roofP3.propPackStats()?.meshes||0);if(next!==count){count=next;quietSince=Date.now();}if(finishedGlb.has('/assets/conservatory-main-stair.glb')&&pendingGlb.size===0&&Date.now()-quietSince>3000){settled=true;break;}await wait(500);}if(!settled)throw Error(`Supplemental packs did not settle: catalog=${count}, pending=${JSON.stringify([...pendingGlb])}`);report.assetLoadSettle={waitMs:Date.now()-loadStart,catalogSize:count,finalChainedPackFinished:true,pendingGlb:[...pendingGlb]};console.log('SUPPLEMENTAL_PACKS_SETTLED',JSON.stringify(report.assetLoadSettle));
 await page.mouse.click(550,350);await wait(500);report.graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),viewport:[innerWidth,innerHeight],propPack:window.__roofP3.propPackStats()};});console.log('BOOTED',report.graphics.renderer);
 if(process.env.ROOF_GRANDEUR_ONLY_EXTRA_VIEWS!=='1'){
 if(process.env.ROOF_GRANDEUR_STAIR_ONLY!=='1'){
 await place('01-arrival-south',205,272,Math.PI,-.12);
 await place('02-south-forecourt-north',198,294,0,-.05);
 await place('03-southwest-northeast',194,293,.65,-.08);
 await seat('roof-sit-west',200,289);
 await seat('roof-sit-east',205,286);
 await place('07-ren-before-conversation',210,276,0,-.04);
 }
 await place('06-exposed-stair-turn',159,279.5,Math.PI*.55,-.87);
 }
 if(process.env.ROOF_GRANDEUR_EXTRA_VIEWS){
   const views=JSON.parse(await readFile(resolve(process.env.ROOF_GRANDEUR_EXTRA_VIEWS),'utf8'));
   if(!Array.isArray(views))throw Error('Extra view fixture must be an array');
   for(const view of views){if(!/^[a-z0-9-]+$/.test(view.name)||!['x','y','yaw','pitch'].every(key=>Number.isFinite(view[key])))throw Error('Invalid extra view fixture');await place(view.name,view.x,view.y,view.yaw,view.pitch);}
 }
 if(process.env.ROOF_GRANDEUR_SMOKE==='1'){
   // Small ordinary-control collision samples around two seats, Ren and return
   // entry. Each starts at an explicit QA placement; this is not route proof.
   for(const s of [{name:'west-seat-approach',x:200,y:290,yaw:0,key:'w'},{name:'east-seat-approach',x:205,y:286,yaw:Math.PI/2,key:'d'},{name:'ren-approach',x:210,y:276,yaw:0,key:'w'},{name:'return-roof-entry-portal',x:205,y:271,yaw:0,key:'w'}]){
     await page.evaluate(s=>{window.__probe.warpCell(s.x,s.y);window.__probe.lookAtWorld(s.yaw,0);},s);await wait(300);const before=await state();await page.keyboard.down(s.key);await wait(400);await page.keyboard.up(s.key);await wait(250);const after=await state(),distance=Math.hypot(after.pos.x-before.pos.x,after.pos.y-before.pos.y),pass=distance>.1&&after.floor>=16.9&&after.scene===before.scene;report.smoke.push({name:s.name,method:'Explicit QA placement then ordinary keyboard held 400 ms',pass,distance,before,after});if(!pass)report.errors.push({stage:s.name,message:`Navigation smoke failed: distance ${distance}, floor ${after.floor}`});
   }
 }
 if(process.env.ROOF_GRANDEUR_PERF==='1'){
   stage='recorder-off-performance';await page.evaluate(()=>{window.__roofGrandeurClock.enabled=false;window.__probe.warpCell(198,294);window.__probe.lookAtWorld(0,-.05);window.__probe.setTorchBattery(1);window.__probe.setTorch(true);});await wait(2000);
   report.performance=await page.evaluate(()=>new Promise(resolve=>{const intervals=[];let last=null;const start=performance.now();function frame(at){if(last!==null&&at>last)intervals.push(at-last);last=at;if(intervals.length>=120||performance.now()-start>15000){const sorted=intervals.toSorted((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??null;resolve({method:'Recorder off; shader clock restored live; 120 positive requestAnimationFrame intervals or 15 second cap at south forecourt north. Host load uncontrolled; no matched BEFORE sample, no causal performance conclusion.',intervalsMs:intervals,samples:intervals.length,medianMs:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),shaderClockEnabled:window.__roofGrandeurClock.enabled,display:window.__chunkSurferPixelMesh.status(),lighting:window.__probe.r3dLighting()});}else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
 }
}catch(e){report.errors.push({stage,message:String(e.stack||e)});console.error('FAIL',stage,e);try{await page?.screenshot({path:join(out,'failure.webp'),type:'webp'});}catch{}}
finally{await Promise.all(sourceReads);report.assetHashAfter=await hash(servedAssetFile);report.liveCanonicalAssetHashAfter=await hash('public/assets/conservatory-props.glb');report.assetStable=report.assetHashBefore===report.assetHashAfter;report.sourceHashesAfter=await hashes();report.sourcesStable=Object.entries(report.sourceHashes).every(([file,sha])=>report.sourceHashesAfter[file]===sha);report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server?.close();if(profile)await rm(profile,{recursive:true,force:true});console.log('CLOSED_NATIVE',JSON.stringify({captures:report.captures.length,errors:report.errors.length,assetStable:report.assetStable,sourcesStable:report.sourcesStable}));}
if(condition==='after'){
 try{
   const before=JSON.parse(await readFile(baselineManifest,'utf8')),priorViews=before.views||before.captures;
   const runtimeSources=sources.filter(f=>f.startsWith('src/')),sourceChecks=before.sourceHashes?Object.fromEntries(runtimeSources.map(file=>[file,before.sourceHashes[file]===report.sourceHashes[file]])):null;
   const servedSourceChecks=before.servedSourceHashes?Object.fromEntries([...new Set([...Object.keys(before.servedSourceHashes),...Object.keys(report.servedSourceHashes)])].sort().map(path=>[path,before.servedSourceHashes[path]?.sha256===report.servedSourceHashes[path]?.sha256])):null;
   const comparisons=report.captures.map(after=>{const prior=priorViews.find(v=>v.name===after.name);if(!prior)return{name:after.name,matched:false,reason:'No before camera'};const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.001;const match={position:['x','y'].every(k=>close(prior.pos[k],after.pos[k])),eye:['x','y','z'].every(k=>close(prior.eye[k],after.eye[k])),look:['yaw','pitch'].every(k=>close(prior.look[k],after.look[k])),seed:prior.seed===after.seed,exposure:prior.lighting.captureExposure===after.lighting.captureExposure,torchColor:JSON.stringify(prior.lighting.torch.color)===JSON.stringify(after.lighting.torch.color),torchReach:prior.lighting.torch.reach===after.lighting.torch.reach,shaderTime:prior.shaderClock.timeSec===after.shaderClock.timeSec,dimensions:prior.display.sceneWidth===after.display.sceneWidth&&prior.display.sceneHeight===after.display.sceneHeight};return{name:after.name,matched:Object.values(match).every(Boolean),checks:match,before:prior.files,after:after.files};});
   await writeFile(join(out,'match-report.json'),JSON.stringify({method:'Pose/light/shader-time/source provenance check; matching does not establish perceived awe or performance',baselineManifest,beforeAssetHash:before.assetHash||before.assetHashBefore,afterAssetHash:report.assetHashBefore,runtimeSourceChecks:sourceChecks,runtimeSourcesIdentical:sourceChecks?Object.values(sourceChecks).every(Boolean):null,servedSourceChecks,servedSourcesIdentical:servedSourceChecks?Object.values(servedSourceChecks).every(Boolean):null,comparisons},null,2));
 }catch(error){await writeFile(join(out,'match-report.json'),JSON.stringify({error:String(error)},null,2));}
}
process.exit(report.errors.length||!report.assetStable?1:0);
