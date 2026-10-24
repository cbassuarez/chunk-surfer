import puppeteer from 'puppeteer-core';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cs-look-'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:300000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--no-first-run']});
try{const page=await browser.newPage();await page.setViewport({width:1280,height:800});
const logs=[];page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text().slice(0,400));});page.on('pageerror',e=>logs.push('pageerror: '+String(e).slice(0,400)));
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
await page.goto('http://127.0.0.1:5511/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForFunction(()=>window.__probe?.testRun,{timeout:120000});
for(let i=0;i<30;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);if(id==='title'||id==='world-title'||(i>1&&!id))break;if(id==='eula')await page.keyboard.press('Enter');await sleep(400);}
await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush();});await sleep(1000);
logs.length=0;
await page.evaluate(()=>{window.__probe.warpCell(92.5,77);window.__probe.lookAtWorld(Math.PI,0);});await sleep(3000);
const info=await page.evaluate(()=>window.__probe.chapelApparitions());
console.log(JSON.stringify(info));console.log(logs.slice(0,20).join('\n'));
}catch(e){console.error(e);}finally{await browser.close();fs.rmSync(profile,{recursive:true,force:true});}
