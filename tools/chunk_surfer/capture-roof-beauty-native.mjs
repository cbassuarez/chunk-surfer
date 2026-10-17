// Direct-placement native-render review. This intentionally proves appearance,
// not the continuous keyboard route covered by verify-roof-walk-native.mjs.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

let out=resolve(process.env.ROOF_BEAUTY_OUT||'artifacts/roof-floor-design/beauty-audit');
const controlOut=out;
const port=Number(process.env.ROOF_BEAUTY_PORT)||5388;
const software=process.env.ROOF_BEAUTY_SOFTWARE==='1';
const usePipe=process.env.ROOF_BEAUTY_PIPE==='1';
const minimal=process.env.ROOF_BEAUTY_MINIMAL==='1';
const url=process.env.ROOF_BEAUTY_URL||`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`;
const sourceFiles=['src/data/academic-roof.js','src/render/pixel-mesh/shader.js','src/render/r3d.js','tools/chunk_surfer/academic-roof-geometry.mjs'];
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
await mkdir(out,{recursive:true});
const report={url,software,usePipe,minimal,reviewType:'QA placements; appearance only',startedAt:new Date().toISOString(),assetHashBefore:await hash('public/assets/conservatory-props.glb'),sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,await hash(file)]))),captures:[],errors:[],console:[]};
const server=process.env.ROOF_BEAUTY_URL?null:await createServer({configFile:'vite.config.js',optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});
await server?.listen();
console.log('SERVER_READY',url);
const response=await fetch(url,{signal:AbortSignal.timeout(15000)});console.log('SERVER_HTTP',response.status,(await response.text()).length);
const profile=await mkdtemp(join(tmpdir(),'roof-beauty-native-'));
let browser;
let runReview;
let stage='boot';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:usePipe,defaultViewport:null,timeout:60000,protocolTimeout:300000,args:['--no-sandbox','--window-size=1120,760','--enable-webgl',software?'--use-angle=swiftshader':'--use-angle=metal',...(software?['--enable-unsafe-swiftshader']:[]),'--autoplay-policy=no-user-gesture-required']});
  report.browserEndpoint=browser.wsEndpoint();await writeFile(join(out,'browser.json'),JSON.stringify({endpoint:browser.wsEndpoint(),profile,url},null,2));console.log('BROWSER_READY',browser.wsEndpoint());
  const page=await browser.newPage();
  await page.setCacheEnabled(false);
  console.log('PAGE_CREATED');
  if(!usePipe)await page.setViewport({width:1120,height:700,deviceScaleFactor:1});
  console.log('VIEWPORT_READY');
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  page.on('pageerror',error=>report.errors.push({stage,message:String(error.stack||error)}));
  page.on('console',message=>{if(['warn','error'].includes(message.type())){report.console.push({stage,type:message.type(),message:message.text()});console.log('BROWSER_CONSOLE',message.type(),message.text());}});
  page.on('requestfailed',request=>console.log('REQUEST_FAILED',request.url(),JSON.stringify(request.failure())));
  page.on('response',response=>{if(response.url().includes('/src/main.js')||response.url().includes('conservatory-props.glb'))console.log('RESOURCE',response.status(),response.url());});
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});}catch(error){if(error.name!=='TimeoutError')throw error;console.log('NAVIGATION_TIMEOUT_CONTINUE');}
  console.log('NAVIGATION_RETURNED');
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:300000});
  if(await page.evaluate(()=>window.__scenes.top()?.id==='eula')){await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__scenes.top()?.id!=='eula',{timeout:20000});}
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','academic.entered','roof.access']);window.__probe.setTorch(true);for(const c of document.querySelectorAll('#map > canvas'))if(c.style.zIndex==='8')c.style.visibility='hidden';});
  console.log('BOOTED_NATIVE',report.assetHashBefore);
  await page.evaluate(async()=>{window.__roofAuditP3=await import('/src/render/props3d.js');});
  await page.waitForFunction(()=>window.__roofAuditP3.propPackStats()?.meshes>=431&&window.__roofAuditP3.propTargets()?.ready,{timeout:300000,polling:1000});
  console.log('PROP_PACK_READY',await page.evaluate(()=>window.__roofAuditP3.propPackStats()?.meshes));
  report.graphics=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d')?.getContext('webgl2');const debug=gl?.getExtension('WEBGL_debug_renderer_info');return{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR),viewport:[innerWidth,innerHeight]};});
  async function capture(name){
    stage=name;await wait(1200);
    await page.waitForFunction(()=>window.__roofAuditP3.propPackStats()?.meshes>=431&&window.__roofAuditP3.propTargets()?.ready,{timeout:300000,polling:1000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=await page.evaluate(()=>{const p=window.__probe.props?.();return{pos:window.__probe.pos(),floor:window.__probe.floorH(),look:window.__probe.lookAngles(),scene:window.__scenes.top()?.id,sceneView:window.__scenes.top()?.view?.(),focus:window.__probe.interactionFocus?.(),eye:window.__probe.sourceShoreView?.()?.eye,world:window.__probe.world?.(),lighting:window.__probe.r3dLighting?.(),props:{pack:p?.pack,renderedCount:p?.renderedIds?.length,roofIds:p?.renderedIds?.filter(id=>/roof|district-/.test(id)),authoredCount:p?.instances?.length},display:window.__chunkSurferPixelMesh?.status?.()};});
    if(state.scene==='eula')throw Error('EULA is still active during capture');
    const file=join(out,`${name}.webp`);await page.screenshot({path:file,type:'webp',quality:92});
    const raw=await page.evaluate(()=>Object.fromEntries(['props','scene','mark-alpha','vfd'].map(s=>[s,window.__probe.sourceShoreCapture?.(s)])));
    for(const [s,data]of Object.entries(raw))if(typeof data==='string'&&data.startsWith('data:'))await writeFile(join(out,`${name}-${s}.png`),Buffer.from(data.split(',')[1],'base64'));
    report.captures.push({name,file,...state});
    await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('CAPTURE',name,JSON.stringify({pos:state.pos,floor:state.floor,look:state.look,scene:state.scene}));
  }
  async function place(name,x,y,yaw,pitch,torch=true){await page.evaluate(({x,y,yaw,pitch,torch})=>{window.__probe.warpCell(x,y);window.__probe.setTorch(torch);window.__probe.lookAtWorld(yaw,pitch);},{x,y,yaw,pitch,torch});await capture(name);}
  runReview=async({output,full=true,reload=false}={})=>{
  if(output){out=resolve(output);await mkdir(out,{recursive:true});}
  if(reload){
    report.captures=[];report.errors=[];report.console=[];report.startedAt=new Date().toISOString();report.assetHashBefore=await hash('public/assets/conservatory-props.glb');
    report.sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,await hash(file)])));
    server?.moduleGraph.invalidateAll();
    try{await page.reload({waitUntil:'domcontentloaded',timeout:60000});}catch(error){if(error.name!=='TimeoutError')throw error;}
    await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:300000});
    if(await page.evaluate(()=>window.__scenes.top()?.id==='eula')){await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__scenes.top()?.id!=='eula',{timeout:20000});}
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','academic.entered','roof.access']);});
    await page.evaluate(async()=>{window.__roofAuditP3=await import('/src/render/props3d.js');});
    await page.waitForFunction(()=>window.__roofAuditP3.propPackStats()?.meshes>=431&&window.__roofAuditP3.propTargets()?.ready,{timeout:300000,polling:1000});
    const loadedSource=await page.evaluate(async()=>{const r=await(await fetch('/src/render/r3d.js',{cache:'no-store'})).text();const s=await(await fetch('/src/render/pixel-mesh/shader.js',{cache:'no-store'})).text();return{glassTag225:r.includes('ROOF_GLASS_INK')&&s.includes('ROOF_GLASS_INK'),r3dLength:r.length,pixelLength:s.length};});report.loadedSource=loadedSource;
  }
  await place('01-arrival-bridge-torch-on',188,285,Math.PI,-.12);
  if(full){
  await place('02-standing-roof-across-glass-torch-on',210,290,-.66,-.13);
  await place('03-standing-roof-across-glass-torch-off',210,290,-.66,-.13,false);
  await place('04-ren-and-northern-city',210,276,0,-.04);
  await place('05-roof-west-across-lantern',194,282,Math.PI/2,-.08);
  await place('06-turn-back-across-school',198,294,0,-.05);
  await place('06b-listening-vent-and-rehearsal-chair-torch-on',209,291,Math.atan2(1,-2.2),-.22);
  await place('06c-listening-vent-and-rehearsal-chair-torch-off',209,291,Math.atan2(1,-2.2),-.22,false);
  await place('06d-roof-north-edge-city-and-street-down-torch-on',208,271,0,-.65);
  await place('06e-roof-north-edge-city-and-street-down-torch-off',208,271,0,-.65,false);
  await place('07-outer-escape-northeast-down',159,278.5,Math.PI*.25,-.82);
  await place('07b-outer-escape-northeast-down-torch-off',159,278.5,Math.PI*.25,-.82,false);
  }
  for(const seat of [{id:'roof-sit-west',x:200,y:289,target:[200,287]},...(full?[{id:'roof-sit-east',x:207,y:284,target:[205,284]}]:[])]){
    stage=seat.id;
    await page.evaluate(({x,y,target})=>{window.__probe.warpCell(x,y);window.__probe.setTorch(true);const p=window.__probe.pos();window.__probe.lookAtWorld(Math.atan2(target[0]*2+1-p.x,-(target[1]*2+1-p.y)),0);},seat);
    await wait(400);const focus=await page.evaluate(()=>window.__probe.interactionFocus?.());
    if(focus?.propId!==seat.id){report.errors.push({stage,message:`Seat focus mismatch: ${focus?.propId}`});await capture(`${seat.id}-focus-failed`);continue;}
    await page.keyboard.press('e');
    await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='academic-roof-sit'&&window.__scenes.top().view?.().phase==='seated',{timeout:12000});
    await capture(`${seat.id}-seated-torch-on`);
    await page.evaluate(()=>window.__probe.setTorch(false));await capture(`${seat.id}-seated-torch-off`);
    await page.evaluate(()=>window.__probe.lookAtWorld(window.__probe.lookAngles().yaw,-.5));await capture(`${seat.id}-seated-glass-down-torch-off`);
    await page.keyboard.press('e');await page.waitForFunction(()=>window.__scenes.top()?.id!=='academic-roof-sit',{timeout:10000});
  }
  report.assetHashAfter=await hash('public/assets/conservatory-props.glb');report.assetStable=report.assetHashBefore===report.assetHashAfter;report.sourceHashesAfter=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,await hash(file)])));report.sourcesStable=Object.entries(report.sourceHashes).every(([file,value])=>report.sourceHashesAfter[file]===value);report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  };
  await runReview({full:!minimal});
}catch(error){report.errors.push({stage,message:String(error.stack||error)});console.error('FAIL',stage,error);try{const pages=await browser.pages();const page=pages.at(-1);report.failureState=await page.evaluate(()=>({url:location.href,ready:document.readyState,probe:!!window.__probe,text:document.body?.innerText?.slice(0,1500)}));await page.screenshot({path:join(out,'failure.webp'),type:'webp'});}catch{}}
finally{report.assetHashAfter=await hash('public/assets/conservatory-props.glb');report.finishedAt=new Date().toISOString();report.assetStable=report.assetHashBefore===report.assetHashAfter;await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));if(process.env.ROOF_BEAUTY_HOLD==='1'&&browser){console.log('HOLDING_NATIVE_BROWSER',browser.wsEndpoint());for(let i=0;i<3600;i++){try{await readFile(join(controlOut,'release'));break;}catch{}try{const command=JSON.parse(await readFile(join(controlOut,'recapture.json'),'utf8'));await rm(join(controlOut,'recapture.json'));if(runReview){console.log('RECAPTURE_REQUEST',command);await runReview({...command,reload:true});console.log('RECAPTURE_COMPLETE',out);}}catch(error){if(error.code!=='ENOENT'){console.error('RECAPTURE_ERROR',error);}}await wait(1000);}}await browser?.close();await server?.close();await rm(profile,{recursive:true,force:true});}
process.exit(report.errors.length||!report.assetStable?1:0);
