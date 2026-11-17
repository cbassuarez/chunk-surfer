import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const out=process.argv[2];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cs-light-'));
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,userDataDir:profile,protocolTimeout:300000,
  args:['--no-sandbox','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--mute-audio','--window-size=1280,800']});
try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:800});
  page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('NAV',f.url());});page.on('error',e=>console.log('CRASH',String(e)));page.on('console',m=>{if(/error|reload|context lost/i.test(m.text()))console.log('CONSOLE',m.text().slice(0,200));});
  page.on('pageerror',e=>console.error('PAGEERROR',String(e).slice(0,300)));
  await page.evaluateOnNewDocument(fs.readFileSync(new URL('./inject.js',import.meta.url),'utf8'));
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  const t0=Date.now();
  await page.goto('http://127.0.0.1:5547/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__probe?.testRun,{timeout:240000});
  console.log('probe ready',Date.now()-t0);
  for(let i=0;i<40;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);console.log('scene',id);if(id==='title'||id==='world-title'||(i>1&&!id))break;if(id==='eula')await page.keyboard.press('Enter');await sleep(500);}
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush();});await sleep(1500);
  const ok=await page.evaluate(async()=>await window.__probe.godWarpHook('loading-bay'));await sleep(3000);
  const info=await page.evaluate(()=>{const A=window.__lightAudit,gl=A.gl,d=gl?.getExtension('WEBGL_debug_renderer_info');
    return{renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):null,patched:A.patched,lightShaders:A.lightShaders,timer:!!A.timerExt,seen:A.seen,canvas:[gl?.drawingBufferWidth,gl?.drawingBufferHeight],
      lights:window.__probe.r3dLighting(),where:window.__probe.whereAmI()};});
  console.log(JSON.stringify({ok,...info,lights:info.lights?.lights?.length??info.lights},null,0));
  fs.writeFileSync(path.join(out,'boot.png'),await page.screenshot({type:'png'}));
  await page.evaluate(()=>{window.__lightAudit.clay=true;});await sleep(800);
  fs.writeFileSync(path.join(out,'boot-clay.png'),await page.screenshot({type:'png'}));
  const grid=await page.evaluate(()=>window.__lightAudit.sceneGrid(64));
  console.log('grid',grid&&{c:grid.columns,r:grid.rows,w:grid.sceneWidth,h:grid.sceneHeight,len:grid.base64.length});
}finally{await browser.close();fs.rmSync(profile,{recursive:true,force:true});}
