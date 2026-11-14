// Bounded BEFORE evidence. Developer staging is disclosed; movement is held W.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
const out='artifacts/door-station-field-visits-audit/before',sleep=ms=>new Promise(r=>setTimeout(r,ms));
await fs.mkdir(out,{recursive:true});
let server,browser,profile;
const receipt={method:'Isolated visible Chromium/Metal at1280x800, current actual game; staged chapel/tower station. RAF cadence is a main-thread proxy, not GPU timing. Actual held W tests movement. No participant, full-route or packaged-native claim.',samples:[],errors:[]};
try{
 server=await createServer({server:{host:'127.0.0.1',port:5591,strictPort:true,hmr:false,watch:null}});await server.listen();
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'station-before-'));
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,pipe:true,userDataDir:profile,protocolTimeout:180000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1280,840']});
 const page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
 page.on('pageerror',e=>receipt.errors.push(String(e.stack||e)));page.on('console',m=>{if(m.type()==='error'&&/shader|LOOP FAULT|GLSL/.test(m.text()))receipt.errors.push(m.text());});
 await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
 await page.goto('http://127.0.0.1:5591/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.testRun,{timeout:180000});
 for(let i=0;i<200;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);if(id==='title')break;if(id==='eula')await page.keyboard.press('Enter');await sleep(500);}
 await page.waitForFunction(()=>window.__scenes?.top()?.id==='title',{timeout:10000});
 await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','kit.fitted','title.shown','prologueDone','opening.driveTeaser.consumed']);window.__scenes.clear();await window.__probe.chapelOutskirtsPreset(125);window.__probe.hush();});
 const sample=async name=>{const cadence=await page.evaluate(async()=>{const R=await import('/src/render/r3d.js'),before=R.r3dPixelMeshStatus(),deltas=[];let last=performance.now(),start=last;await new Promise(resolve=>{function tick(now){deltas.push(now-last);last=now;if(now-start<2500)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});const after=R.r3dPixelMeshStatus();deltas.sort((a,b)=>a-b);return{frames:deltas.length,presentedFrames:after.framesRendered-before.framesRendered,medianMs:deltas[Math.floor(deltas.length*.5)],p95Ms:deltas[Math.floor(deltas.length*.95)],fps:(after.framesRendered-before.framesRendered)/((last-start)/1000),dither:after,portals:window.__probe.sourcePortals(),crossing:window.__probe.sourceCrossing(),realm:window.__probe.stationRealm(),scene:window.__scenes.top()?.id||null};});if(cadence.scene)throw Error('Blocking scene invalidates baseline: '+cadence.scene);receipt.samples.push({name,...cadence});await page.screenshot({path:`${out}/${name}.png`});console.log(name,cadence.fps,cadence.realm.frame?.pose);};
 await sleep(1500);await sample('chapel-closed');
 const door=await page.evaluate(()=>window.__probe.doorFieldDoors().find(d=>!d.shut&&!d.route&&d.variant===0));
 await page.evaluate(d=>{window.__probe.sourceWarp((d.threshold[0].x+d.threshold[1].x)/2+d.normal[0]*3,(d.threshold[0].y+d.threshold[1].y)/2+d.normal[2]*3);window.__probe.lookAtWorld(Math.atan2(-d.normal[0],d.normal[2]),0);window.__probe.hush();},door);
 await sleep(500);await sample('chapel-door');
 await page.evaluate(id=>window.__probe.crossFieldDoor(id),door.id);await sleep(650);await sample('chapel-occupied');
 const before=await page.evaluate(()=>window.__probe.stationRealm().frame?.pose);const at=Date.now();await page.keyboard.down('w');await sleep(3000);await page.keyboard.up('w');
 const after=await page.evaluate(()=>window.__probe.stationRealm().frame?.pose);receipt.actualWalk={seconds:(Date.now()-at)/1000,before,after,metres:before&&after?Math.hypot(after.x-before.x,after.z-before.z):null};
 await page.evaluate(async()=>{await window.__probe.bellsPreset(260);window.__probe.hush();});await sleep(1200);await sample('tower-closed');
 receipt.completed=true;
}catch(e){receipt.failure=String(e.stack||e);process.exitCode=1;console.error(receipt.failure);}
finally{await browser?.close().catch(()=>{});await server?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});await fs.writeFile(`${out}/receipt.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify({completed:receipt.completed,walk:receipt.actualWalk,errors:receipt.errors,failure:receipt.failure}));}
