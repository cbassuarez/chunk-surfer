// Shared boot: reach the walkable world on the arrival spine.
import puppeteer from 'puppeteer-core';

export async function boot({width=1280,height=760}={}){
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', protocolTimeout: 300000,
    args: ['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required',
      '--disable-renderer-backgrounding','--disable-background-timer-throttling'],
  });
  const page = await browser.newPage();
  await page.setViewport({width,height});
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  });
  const errors=[];
  page.on('pageerror',(e)=>errors.push(e.message));
  page.on('console',(m)=>{ if(m.type()==='error') errors.push('console: '+m.text()); });
  const wait=(f,t=240000)=>page.waitForFunction(f,{timeout:t});
  const top=()=>page.evaluate(()=>window.__scenes?.top?.()?.id||null);
  await page.goto('http://127.0.0.1:5199/index.html?nomic=1&sam=0&diffusion='
    +encodeURIComponent('ws://127.0.0.1:5198'),{waitUntil:'domcontentloaded',timeout:60000});
  await wait(()=>!!window.__scenes?.top?.()?.id);
  if(await top()==='eula'){ await page.keyboard.press('Enter'); await wait(()=>window.__scenes?.top?.()?.id!=='eula',30000); }
  await wait(()=>window.__scenes?.top?.()?.id==='opening-credits');
  await page.evaluate(()=>window.__scenes.top().update(30));
  await wait(()=>window.__scenes?.top?.()?.id==='title',60000);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await wait(()=>window.__scenes?.top?.()?.id==='difficulty-select',60000);
  await page.keyboard.press('Enter');
  await wait(()=>window.__scenes?.top?.()?.id==='warning',60000);
  await page.keyboard.press('Enter'); await page.keyboard.press('n');
  await wait(()=>window.__chunkParity?.().screen==='game',240000);
  return {browser,page,errors,wait,top};
}
