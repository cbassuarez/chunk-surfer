// Capture the live game at authored points: node tools/chunk_surfer/capture-views.mjs out-dir "label:ax:ay:yawDeg:pitch" ...
// A label ending in -torch also captures the same view with the torch on.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const outDir=process.argv[2],out=path.join(process.argv[2],'views.json'),shots=process.argv.slice(3).map((s)=>{const [label,ax,ay,yaw,pitch]=s.split(':');return{label,ax:+ax,ay:+ay,yaw:+yaw*Math.PI/180,pitch:+pitch};});
fs.mkdirSync(outDir,{recursive:true});
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cs-look-'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:300000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=1048576','--disable-gpu-shader-disk-cache','--no-first-run']});
try{const page=await browser.newPage();await page.setViewport({width:1280,height:800});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
await page.goto('http://127.0.0.1:5511/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForFunction(()=>window.__probe?.testRun,{timeout:120000});
for(let i=0;i<30;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);if(id==='title'||id==='world-title'||(i>1&&!id))break;if(id==='eula')await page.keyboard.press('Enter');await sleep(400);}
await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush();});await sleep(1000);
const meta=[];
for(const s of shots){
  await page.evaluate(({ax,ay,yaw,pitch})=>{window.__probe.hush();window.__probe.warpCell(ax,ay);window.__probe.lookAtWorld(yaw,pitch);},s);await sleep(3500);
  const st=await page.evaluate(async()=>{const R3=await import('/src/render/r3d.js');return{cam:R3.r3dViewCamera(),pos:window.__probe.pos()};});
  fs.writeFileSync(path.join(outDir,`${s.label}.png`),await page.screenshot({type:'png'}));meta.push({...s,...st});
  if(s.label.endsWith('-torch')){await page.evaluate(()=>window.__probe.setTorch(true));await sleep(1200);fs.writeFileSync(path.join(outDir,`${s.label}-on.png`),await page.screenshot({type:'png'}));await page.evaluate(()=>window.__probe.setTorch(false));}
}
fs.writeFileSync(out,JSON.stringify(meta,null,1));}catch(e){console.error(e);}finally{await browser.close();fs.rmSync(profile,{recursive:true,force:true});}
