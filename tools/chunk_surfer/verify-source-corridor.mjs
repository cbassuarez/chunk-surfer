import puppeteer from 'puppeteer-core';
const LENS=process.env.LENS_URL||'ws://127.0.0.1:8000';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:600000,
  args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
const p=await b.newPage(); await p.setViewport({width:1280,height:760});
await p.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});});
p.on('pageerror',e=>console.log('  PAGEERROR:',String(e).slice(0,200)));
const w=(f,t=300000)=>p.waitForFunction(f,{timeout:t});
const top=()=>p.evaluate(()=>window.__scenes?.top?.()?.id||null);
await p.goto(`http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0&diffusion=${encodeURIComponent(LENS)}`,{waitUntil:'domcontentloaded',timeout:60000});
await w(()=>!!window.__scenes?.top?.()?.id);
if(await top()==='eula'){await p.keyboard.press('Enter');await w(()=>window.__scenes?.top?.()?.id!=='eula',30000);}
await w(()=>window.__scenes?.top?.()?.id==='opening-credits');
await p.evaluate(()=>window.__scenes.top().update(30));
await w(()=>window.__scenes?.top?.()?.id==='title',60000);
await p.keyboard.press('Enter');await p.keyboard.press('Enter');
await w(()=>window.__scenes?.top?.()?.id==='difficulty-select',60000);
await p.keyboard.press('Enter');
await w(()=>window.__scenes?.top?.()?.id==='warning',60000);
await p.keyboard.press('Enter');await p.keyboard.press('n');
await w(()=>window.__chunkParity?.().screen==='game',240000);
console.log('in game');
console.log('chunkSurfStart:',await p.evaluate(()=>window.__probe.chunkSurfStart()));
if(process.env.LANDSCAPE==='1'){
  // Skip the hall: drop straight into the opened field at the arrival tier.
  await p.evaluate(()=>{ const st=window.__probe.surf?.(); void st; });
  await p.evaluate(()=>window.__probe.chunkSurfPhase?.('landscape'));
}
await new Promise(r=>setTimeout(r,2500));

// Walk the hall out past the haystack, hunting for the still page the way a
// player does: forward, and try the sheet in front of you every few steps.
let took=false;
for(let i=0;i<340 && !took;i++){
  await p.keyboard.press('w');
  if(i>210 && i%3===0){
    await p.keyboard.press('e');
    const id=await p.evaluate(()=>window.__scenes?.top?.()?.id||'world');
    if(id==='source-page'){ await p.keyboard.press('x'); }
    else if(id==='source-threshold'){ took=true; }
  }
}
console.log('page taken:',took);
await new Promise(r=>setTimeout(r,5200));
for(const [name,x,y,f] of [['tier0',0,-8,0],['fork',0,-70,0],['trace',0,-165,0],['return',0,-250,0]]){
  await p.evaluate(([a,b,c])=>window.__probe.warp(a,b,c),[x,y,f]);
  await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:`artifacts/level-${name}.png`});
  console.log('  shot',name);
}
await b.close();
