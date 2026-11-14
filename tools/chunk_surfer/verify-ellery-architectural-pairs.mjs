// Bounded matched developer staging. Never represents an earned before route.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const OUT=path.join(ROOT,'artifacts/ellery-construction-source-drive-audit/implementation/architectural-pairs');
const PRE=path.join(ROOT,'artifacts/ellery-construction-source-drive-audit/implementation/preimages');
const PRE_FILES=['src/main.js','src/render/r3d.js','src/world/floorplan.js','src/world/building-window-views.js','src/game/prop-visibility.js','src/data/atrium-circulation.js','src/data/conservatory-doors.js','src/data/floorplan/conservatory.js','src/data/glass-court.js','tools/chunk_surfer/glass-court-geometry.mjs'];
const HEAD_FILES=['src/data/conservatory-props.js','src/game/props.js','src/data/scene-dock-dressing.js','src/data/world-inscriptions.js'];
const ASSETS=['public/assets/conservatory-props.glb','public/assets/ellery-public-front.glb','public/assets/glass-court.glb','public/assets/box-office.glb','public/assets/ellery-garden-approaches.glb'];
const VIEWS=[
 {id:'public-hatch',x:89.75,z:10.25,yaw:Math.PI/2,pitch:-.06,doors:[]},
 {id:'real-desk',x:93.25,z:10.75,yaw:-.10,pitch:-.4,doors:['foh-office']},
 {id:'west-approach',x:72.25,z:-.25,yaw:Math.PI,pitch:0,doors:[],baselineWarning:'Developer-staged comparison: this old approach may be inside scenic construction. No physically reachable before route is claimed.'},
 {id:'greenhouse',x:84.25,z:21.25,yaw:Math.PI/2,pitch:.05,doors:['pool-lobby','glasshouse-changing','changing-pool']},
];
const sha=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={method:'Four matched, developer-staged architectural BEFORE/AFTER pairs. Actual isolated visible Chrome/Metal, production camera/WebGL/final dither; raw R3D PNG plus composite. Same1280x800 viewport, night seed, torch full power/battery, explicit open leaves, world-simulation pause and storm flash zero. No earned before traversal, uninstrumented performance or participant validation claim.',views:VIEWS,baselineSources:{},currentSources:{},captures:[],checks:[],errors:[],consoleErrors:[],overrideHits:{},limitations:['Baseline assembly uses saved preimages for already-dirty files and HEAD for four files confirmed clean at task start. Unchanged dependencies are the same current files in both views.','Baseline glass is regenerated privately from exact saved data/geometry plus the clean HEAD builder; no shared pack is regenerated.','Controlled static staging does not establish movement quality, navigation comprehension, temporal stability or frame rate.']};
report.verifierExecutionSha256=sha(await fs.readFile(fileURLToPath(import.meta.url)));
await fs.mkdir(OUT,{recursive:true});
const overrides=new Map(),head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();report.baselineCommit=head;
for(const f of PRE_FILES){const data=await fs.readFile(path.join(PRE,f));overrides.set(path.join(ROOT,f),data.toString());report.baselineSources[f]={kind:'saved task-start preimage',file:path.relative(ROOT,path.join(PRE,f)),sha256:sha(data)};}
for(const f of HEAD_FILES){const data=execFileSync('git',['show',`HEAD:${f}`],{cwd:ROOT});overrides.set(path.join(ROOT,f),data.toString());report.baselineSources[f]={kind:'HEAD, confirmed clean at task start',commit:head,sha256:sha(data)};}
const protectedFiles=[...new Set([...PRE_FILES,...HEAD_FILES,...ASSETS,'tools/chunk_surfer/build-glass-court.mjs','src/data/generated/ellery-garden-collision.js'])];
for(const f of protectedFiles)report.currentSources[f]=sha(await fs.readFile(path.join(ROOT,f)));

// Rehome only the old glass data/geometry and the clean builder's imports/ROOT.
// The source payload and dependency substitutions are retained for inspection.
const baselineDir=path.join(OUT,'baseline-build'),baselineSources=path.join(baselineDir,'sources');await fs.mkdir(baselineSources,{recursive:true});
const dataPath=path.join(baselineSources,'glass-court.mjs'),geometryPath=path.join(baselineSources,'glass-court-geometry.mjs'),builderPath=path.join(baselineSources,'build-glass-court.mjs');
const oldData=overrides.get(path.join(ROOT,'src/data/glass-court.js'));
const absoluteImports=(code,original)=>code.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,b,c)=>a+pathToFileURL(path.resolve(path.dirname(path.join(ROOT,original)),b)).href+c);
await fs.writeFile(dataPath,absoluteImports(oldData,'src/data/glass-court.js'));
await fs.writeFile(geometryPath,absoluteImports(overrides.get(path.join(ROOT,'tools/chunk_surfer/glass-court-geometry.mjs')),'tools/chunk_surfer/glass-court-geometry.mjs'));
const originalBuilder=execFileSync('git',['show','HEAD:tools/chunk_surfer/build-glass-court.mjs'],{cwd:ROOT,encoding:'utf8'});
let builder=absoluteImports(originalBuilder,'tools/chunk_surfer/build-glass-court.mjs')
 .replace(pathToFileURL(path.join(ROOT,'src/data/glass-court.js')).href,pathToFileURL(dataPath).href)
 .replace(pathToFileURL(path.join(ROOT,'tools/chunk_surfer/glass-court-geometry.mjs')).href,pathToFileURL(geometryPath).href)
 .replace("const ROOT=fileURLToPath(new URL('../../',import.meta.url));",`const ROOT=${JSON.stringify(ROOT)};`)
 .replace('const read=file=>fs.readFileSync(path.join(ROOT,file));',`const baselineReads=${JSON.stringify({'src/data/glass-court.js':dataPath,'tools/chunk_surfer/glass-court-geometry.mjs':geometryPath,'tools/chunk_surfer/build-glass-court.mjs':builderPath})};\nconst read=file=>fs.readFileSync(baselineReads[file]||path.join(ROOT,file));`);
await fs.writeFile(builderPath,builder);
report.baselineGlass={builderHEADSha256:sha(originalBuilder),rewrittenBuilderSha256:sha(builder),dataPreimageSha256:report.baselineSources['src/data/glass-court.js'].sha256,geometryPreimageSha256:report.baselineSources['tools/chunk_surfer/glass-court-geometry.mjs'].sha256,dependencyRule:'Relative imports point at unchanged current dependency paths; only data/geometry targets and ROOT/read receipt lookup are rehomed.'};
const {buildGlassCourt}=await import(pathToFileURL(builderPath).href);const oldGlass=await buildGlassCourt({outputDir:baselineDir});
report.baselineGlass.pack={file:path.relative(ROOT,path.join(baselineDir,'glass-court.glb')),sha256:oldGlass.sha256,bytes:oldGlass.bytes,triangles:oldGlass.totalTriangles};
const baselineGLB=await fs.readFile(path.join(baselineDir,'glass-court.glb'));
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
let active='before',stage='boot',browser,server,profile,page;
async function state(){return page.evaluate(async()=>{const R=await import('/src/render/r3d.js');return{position:window.__probe.pos(),floor:window.__probe.floorH(),look:window.__probe.lookAngles(),camera:R.r3dViewCamera(),scene:window.__scenes.top()?.id,torch:window.__probe.torch(),display:R.r3dPixelMeshStatus(),stormFlash:R.r3dStormFlash?.(),lighting:R.r3dLightingDebug?.()};});}
async function runVariant(variant){
 active=variant;stage='boot';const baseline=variant==='before',port=5585;report.overrideHits[variant]={};
 const plugin={name:'ellery-paired-review-source-overrides',enforce:'pre',load(id){const clean=id.split('?')[0];if(baseline&&overrides.has(clean)){const label=path.relative(ROOT,clean);report.overrideHits[variant][label]=(report.overrideHits[variant][label]||0)+1;return overrides.get(clean);}return null;},configureServer(s){if(baseline)s.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]==='/assets/glass-court.glb'){res.statusCode=200;res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Length',baselineGLB.length);res.end(baselineGLB);}else next();});}};
 try{
  server=await createServer({root:ROOT,configFile:path.join(ROOT,'vite.config.js'),plugins:[plugin],server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'ellery-architectural-pair-'));
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,userDataDir:profile,pipe:true,defaultViewport:null,protocolTimeout:180000,args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1280,840']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);
  page.on('pageerror',e=>report.errors.push({variant,stage,error:String(e.stack||e)}));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({variant,stage,text:m.text().slice(0,1600)});});
  await page.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});});
  await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun,{timeout:180000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','kit.fitted','title.shown','prologueDone','opening.driveTeaser.consumed']);window.__probe.nightSeed(7321);await window.__probe.exteriorAssetsReady();});
  await page.mouse.click(640,400);await sleep(500);
  const gl=await page.evaluate(()=>{const c=document.querySelector('canvas.r3d'),g=c?.getContext('webgl2')||c?.getContext('webgl'),e=g?.getExtension('WEBGL_debug_renderer_info');return{renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g?.getParameter(g.RENDERER),vendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):g?.getParameter(g.VENDOR)};});
  report[variant]={gpu:gl,viewport:{width:1280,height:800,deviceScaleFactor:1}};
  for(const view of VIEWS){
   stage=view.id;
   const fixture=await page.evaluate(async v=>{const F=await import('/src/world/floorplan.js'),R=await import('/src/render/r3d.js');window.__scenes.clear();F.setAllDoorsOpen(false);for(const id of v.doors)F.setDoorOpen(id,true);const p=F.logicalAtPhysical((v.x-.25)/.5,(v.z-.25)/.5,{floor:0});const at=p?{x:p.x,y:p.y}:{x:(v.x-.25)/.5,y:(v.z-.25)/.5};window.__probe.warpRuntime(at.x,at.y,0);window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__probe.lookAtWorld(v.yaw,v.pitch);R.r3dSetStormFlash?.(0);return{logical:at,resolved:!!p,isSolid:F.isSolid(at.x,at.y),collisionOnly:F.isCollisionOnly?.(at.x,at.y),canOccupy:(await import('/src/game/props.js')).propCanOccupy(at.x,at.y)};},view);
   await sleep(2500);
   await page.evaluate(async()=>{window.__scenes.push({id:'ProbePause',blocksInput:true,blocksWorld:true,allowsLook:true,render(){}});const R=await import('/src/render/r3d.js');R.r3dSetStormFlash?.(0);window.__probe.setTorchBattery(1);});
   await sleep(200);
   const value=await state(),raw=await page.evaluate(()=>{const c=document.querySelector('canvas.r3d');return{data:c.toDataURL('image/png'),width:c.width,height:c.height};});
   const name=variant+'-'+view.id;await fs.writeFile(path.join(OUT,name+'.png'),Buffer.from(raw.data.slice(raw.data.indexOf(',')+1),'base64'));await page.screenshot({path:path.join(OUT,name+'-composite.png')});
   report.captures.push({variant,view:view.id,file:name+'.png',composite:name+'-composite.png',width:raw.width,height:raw.height,fixture,requested:view,state:value,baselineWarning:baseline?(view.baselineWarning||(!fixture.canOccupy||fixture.isSolid||fixture.collisionOnly?'Developer-staged camera overlaps old body geometry; this is an exact-position construction comparison, not an attainable before viewpoint.':null)):null});
   check(variant+' '+view.id+' final dither',value.display.shaderReady&&value.display.framesRendered>0&&!value.display.lastError,value.display.lastError);
   check(variant+' '+view.id+' storm held off',value.stormFlash===0,value.stormFlash);
   console.log('CAPTURE',name,JSON.stringify(value.camera));
  }
 }finally{
  await browser?.close().catch(()=>{});browser=null;await server?.close();server=null;if(profile)await fs.rm(profile,{recursive:true,force:true});profile=null;
 }
}
try{
 await runVariant('before');await runVariant('after');
 report.cameraComparisons=[];
 for(const view of VIEWS){
  const a=report.captures.find(c=>c.variant==='before'&&c.view===view.id),b=report.captures.find(c=>c.variant==='after'&&c.view===view.id),ca=a.state.camera,cb=b.state.camera,delta={};
  for(const k of['x','y','z']){delta[k]=Math.abs(ca.eye[k]-cb.eye[k]);check(view.id+' matched camera eye.'+k,delta[k]<(k==='y'?.001:.00001),{before:ca.eye[k],after:cb.eye[k],toleranceM:k==='y'?.001:.00001});}
  for(const k of['yaw','pitch','tanHalfFov','width','height']){delta[k]=Math.abs(ca[k]-cb[k]);check(view.id+' matched camera '+k,delta[k]<.00001,{before:ca[k],after:cb[k]});}
  report.cameraComparisons.push({view:view.id,absoluteDifference:delta,qualification:'World eye X/Z, bearing, field of view and output dimensions match. Y tolerance1mm accommodates ordinary floor-height settling; actual values are preserved.'});
 }
 report.caughtLoopFaults=report.consoleErrors.filter(e=>e.text.includes('LOOP FAULT'));
 if(report.caughtLoopFaults.length)report.limitations.push('Caught LOOP FAULT console messages were present during both variants and remain in this receipt. No error-free runtime or movement/performance qualification is inferred from these static comparisons.');
 check('no uncaught pageerror events (caught console faults retained)',report.errors.length===0,report.errors);
 for(const f of protectedFiles)check('production unchanged '+f,sha(await fs.readFile(path.join(ROOT,f)))===report.currentSources[f]);
 report.completed=true;
}catch(error){report.failure={variant:active,stage,error:String(error.stack||error)};process.exitCode=1;console.error('FAIL',report.failure);}
finally{await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('DONE',OUT);}
