import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const OUT=path.resolve('artifacts/figure-review'); fs.mkdirSync(OUT,{recursive:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:600000,
  args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding'],
});
const page=await browser.newPage();
await page.setViewport({width:1280,height:760});
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__diffusion={ready:Promise.resolve(),stats:{criticalBank:'calm'},activateBank:async()=>true,retry:async()=>true};
});
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
const top=()=>page.evaluate(()=>window.__scenes?.top?.()?.id||null);
const wait=(fn,t=300000)=>page.waitForFunction(fn,{timeout:t});
await page.goto('http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=1',{waitUntil:'domcontentloaded',timeout:60000});
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
await page.evaluate(()=>window.__probe.testRun()); await sleep(1800);
for(let i=0;i<8;i++){
  if(await page.evaluate(()=>window.__chunkParity?.().screen==='game'&&!window.__scenes?.top?.()?.id))break;
  await page.keyboard.press(i%2?'Escape':'Enter'); await sleep(400);
}
// Stand a few metres off the woman at the shelter and look at her.
const shots=[
  // stand-at, look-at — both authored logical metres.
  ['bus-woman',56.9,206.5,54.15,206.55],
  ['mews-neighbor',36.4,326,37.0,326],
];
for(const [tag,sx,sy,tx,ty] of shots){
  const ok=await page.evaluate(([x,y])=>!!window.__probe.warpCell?.(x,y),[sx,sy]);
  await sleep(1000);
  await page.evaluate(([sx,sy,tx,ty])=>{
    const dx=tx-sx, dz=ty-sy;
    // A body faces local -Z, which the prop matrix turns into (sin yaw,-cos yaw).
    window.__probe.lookAtWorld?.(Math.atan2(dx,-dz),-0.03);
  },[sx,sy,tx,ty]);
  await sleep(1000);
  await page.screenshot({path:path.join(OUT,`${tag}.png`)});
  console.log(tag,'warp',ok);
}
console.log(errs.length?errs.slice(0,3).join('\n'):'no page errors');
await browser.close();
