// Art-review captures for the Horizon crossing.
//
// The horizon is the one part of this game that cannot be reasoned about from
// the source: it is forty near-opaque slices of a baked recording composited
// back to front around a body standing inside them, and every question about it
// — is there a floor, can you see where the corridor went, is the tape a wall or
// a volume — is a question about what a frame actually looks like.
//
//   npx vite --port 5199 --host 127.0.0.1
//   node tools/chunk_surfer/verify-horizon.mjs
//
// TUNES is a JSON array of r3dHorizonTune patches, each with a `tag`, so a
// tuning sweep is one run and the PNGs are named by what produced them:
//
//   TUNES='[{"tag":"a","bore":0.9},{"tag":"b","bore":0.99}]' node tools/...
//
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE='http://127.0.0.1:5199';
const OUT=path.resolve(process.env.OUT||'artifacts/horizon-review');
fs.mkdirSync(OUT,{recursive:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:600000,
  args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required',
        '--disable-renderer-backgrounding','--disable-background-timer-throttling'],
});
const page=await browser.newPage();
await page.setViewport({width:1280,height:760});
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__diffusion={ready:Promise.resolve(),stats:{criticalBank:'calm'},activateBank:async()=>true,retry:async()=>true};
});
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e));
page.on('console',m=>{const t=m.text();if(/shader|GLSL|compile|ERROR:/i.test(t))errs.push(t);});
const top=()=>page.evaluate(()=>window.__scenes?.top?.()?.id||null);
const wait=(fn,t=300000)=>page.waitForFunction(fn,{timeout:t});

await page.goto(`${BASE}/index.html?nomic=1&sam=0&skiptut=1&nothink=1`,{waitUntil:'domcontentloaded',timeout:60000});
await wait(()=>!!window.__scenes?.top?.()?.id);
if(await top()==='eula'){await page.keyboard.press('Enter');await wait(()=>window.__scenes?.top?.()?.id!=='eula',30000);}
await wait(()=>window.__scenes?.top?.()?.id==='opening-credits');
await page.evaluate(()=>window.__scenes.top().update(30));
await wait(()=>window.__scenes?.top?.()?.id==='title',60000);
await page.keyboard.press('Enter');await page.keyboard.press('Enter');
await wait(()=>window.__scenes?.top?.()?.id==='difficulty-select',60000);
await page.keyboard.press('Enter');
await wait(()=>window.__scenes?.top?.()?.id==='warning',60000);
await page.keyboard.press('Enter');await page.keyboard.press('n');
await wait(()=>window.__chunkParity?.().screen==='game',240000);
await page.evaluate(()=>window.__probe.testRun());
await sleep(1800);
for(let i=0;i<8;i++){
  const ready=await page.evaluate(()=>window.__chunkParity?.().screen==='game'&&!window.__scenes?.top?.()?.id);
  if(ready)break;
  await page.keyboard.press(i%2?'Escape':'Enter');await sleep(400);
}
const TUNES=JSON.parse(process.env.TUNES||'[{}]');
for(const tune of TUNES){
await page.evaluate((t)=>window.__probe.horizonTune(t),tune);
const tag=tune.tag||'base';
for(const depth of [80,168]){
  const st=await page.evaluate((d)=>window.__probe.horizonPreset(d),depth);
  await sleep(1600);
  for(let i=0;i<6;i++){
    const ready=await page.evaluate(()=>!window.__scenes?.top?.()?.id);
    if(ready)break;
    await page.keyboard.press('Escape');await sleep(300);
  }
  await sleep(900);
  const frame=await page.evaluate(()=>({f:window.__probe.horizonFrame?.(),h:window.__probe.horizon?.()||null}));
  await page.screenshot({path:path.join(OUT,`horizon-${tag}-${String(depth).padStart(3,'0')}.png`)});
  console.log(tag,'depth',depth,'phase',st?.phase);
}
}
console.log(errs.length?('ERRORS:\n'+errs.slice(0,10).join('\n')):'no shader errors');
await browser.close();
