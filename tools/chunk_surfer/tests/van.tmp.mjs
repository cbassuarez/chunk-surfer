import fs from 'node:fs';import path from 'node:path';import puppeteer from 'puppeteer-core';
const out='/private/tmp/claude-501/-Users-seb-chunk-surfer/3463b1fa-55a1-4af2-b8d7-3ea9720b32c1/scratchpad/van';
fs.mkdirSync(out,{recursive:true});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:300000,args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
const p=await b.newPage();await p.setViewport({width:1280,height:760});
await p.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});});
const errs=[];p.on('pageerror',(e)=>errs.push(e.message));
const w=(f,t=240000)=>p.waitForFunction(f,{timeout:t});
await p.goto('http://127.0.0.1:5173/index.html?nomic=1&sam=0&skiptut=1&nothink=1&diffusion='+encodeURIComponent('ws://127.0.0.1:5198'),{waitUntil:'domcontentloaded',timeout:60000});
await w(()=>!!window.__scenes?.top?.()?.id);
if(await p.evaluate(()=>window.__scenes?.top?.()?.id)==='eula'){await p.keyboard.press('Enter');await w(()=>window.__scenes?.top?.()?.id!=='eula',30000);}
await w(()=>window.__scenes?.top?.()?.id==='opening-credits');
await p.evaluate(()=>window.__scenes.top().update(30));
await w(()=>window.__scenes?.top?.()?.id==='title',60000);
await p.keyboard.press('Enter');await p.keyboard.press('Enter');
await w(()=>window.__scenes?.top?.()?.id==='difficulty-select',60000);
await p.keyboard.press('Enter');
await w(()=>window.__scenes?.top?.()?.id==='warning',60000);
await p.keyboard.press('Enter');await p.keyboard.press('n');
await w(()=>window.__chunkParity?.().screen==='game',240000);
await p.evaluate(()=>{window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__probe.nightSeed(0.37);});
// The van is at logical (66,208); inspectAt (63.6,208).
for (const [x,y,f] of [[62,208,1],[63,208,1],[64,209,1],[64,207,1]]) {
  await p.evaluate(([a,bb,c])=>window.__probe.warpCell(a,bb,c),[x,y,f]);
  await new Promise(r=>setTimeout(r,700));
  await p.keyboard.press('e');
  await new Promise(r=>setTimeout(r,1200));
  const scene=await p.evaluate(()=>window.__scenes?.top?.()?.id);
  console.log('at',x,y,'facing',f,'-> scene',scene);
  if(scene){await p.screenshot({path:path.join(out,'a-van.png')});
    // step into the hub and look at the badge
    for(let i=0;i<4;i++){await p.keyboard.press('Space');await new Promise(r=>setTimeout(r,450));}
    await p.screenshot({path:path.join(out,'b-hub.png')});
    console.log('plant spanner owned before choosing:',JSON.stringify((await p.evaluate(()=>window.__probe.plant())).spannerOwned));
    break;}
}
console.log('errors:',errs.slice(0,4));await b.close();
