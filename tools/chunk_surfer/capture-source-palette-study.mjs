// Read-only rendering evidence for the Source-proper palette design study.
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const out = process.env.SOURCE_PALETTE_OUT || 'artifacts/source-palette-study';
await mkdir(out, {recursive:true});
const browser = await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true, protocolTimeout:120000,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling'],
});
const page = await browser.newPage(), errors = [], captures = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail/i.test(message.text())) errors.push(message.text());
});
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
await page.evaluateOnNewDocument(() => Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
try {
  const url=new URL(process.env.SOURCE_FIX_BASE || 'http://127.0.0.1:5297/');
  for(const [key,value] of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(key,value);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => window.__probe?.testRun && ['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async () => {await window.__probe.testRun();window.__probe.tutSkip();});
  for (const [name,preset,yaw,pitch] of [
    ['first-lift','first-lift',0,0],
    ['first-landing','first-contact',0,0],
    ['first-landing-lateral','first-contact',1.05,0],
    ['middle-code','all-insights',0,0],
    ['middle-code-lateral','all-insights',.7,0],
    ['final-run','final-run',0,0],
    ['doors','final',.65,0],
  ]) {
    await page.evaluate(({preset,yaw,pitch,name}) => {
      window.__probe.sourcePreset(preset);
      if (name==='doors') {const at=window.__probe.edgeDoorApproach();window.__probe.sourceWarp(at.x,at.y+6);}
      window.__probe.lookAtWorld(yaw,pitch);
    },{preset,yaw,pitch,name});
    await sleep(800);
    if(await page.evaluate(() => !!window.__probe.rec().light)) await page.keyboard.press('f');
    await sleep(700);
    const state=await page.evaluate(() => ({
      pos:window.__probe.pos(),phase:window.__probe.chunkSurf().phase,top:window.__scenes?.top()?.id,
      presence:window.__probe.presence(),props:window.__probe.sourceProps(),
      lighting:window.__probe.r3dLighting?.(),camera:window.__probe.lookAngles(),torch:!!window.__probe.rec().light,
      canvases:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.width,height:c.height,rect:{x:c.getBoundingClientRect().x,y:c.getBoundingClientRect().y,width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height}})),
    }));
    await page.screenshot({path:`${out}/${name}.png`});
    const raw=await page.evaluate(() => {
      const c=document.querySelector('canvas.r3d'),copy=document.createElement('canvas');
      copy.width=c.width;copy.height=c.height;
      const ctx=copy.getContext('2d');ctx.drawImage(c,0,0);
      const rgba=ctx.getImageData(0,0,c.width,c.height).data;
      const buckets=new Map();let dark=0;
      for(let i=0;i<rgba.length;i+=16){
        const r=rgba[i],g=rgba[i+1],b=rgba[i+2];if(Math.max(r,g,b)<20)dark++;
        const key=[r,g,b].map(n=>Math.min(255,Math.round(n/8)*8)).join(',');
        buckets.set(key,(buckets.get(key)||0)+1);
      }
      const samples=rgba.length/16;
      return {data:c.toDataURL('image/png'),palette:[...buckets].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([rgb,n])=>({rgb:rgb.split(',').map(Number),share:n/samples})),darkShare:dark/samples};
    });
    await writeFile(`${out}/${name}-world.png`,Buffer.from(raw.data.split(',')[1],'base64'));
    const {data,...palette}=raw;
    captures.push({name,preset,yaw,pitch,...state,...palette});
    console.log('CAPTURE',name,JSON.stringify({pos:state.pos,phase:state.phase,top:state.top,torch:state.torch}));
  }
} finally {
  await writeFile(`${out}/report.json`,JSON.stringify({url:process.env.SOURCE_FIX_BASE || 'http://127.0.0.1:5297/',scope:'Chromium/Metal, 1440x900 with raw 1280x800 WebGL canvases, torch off, fixed forward/lateral diagnostic camera. Disposable source presets; no gameplay source edits. Not full run/native acceptance.',captures,errors},null,2));
  await browser.close();
}
if(errors.length)process.exitCode=1;
