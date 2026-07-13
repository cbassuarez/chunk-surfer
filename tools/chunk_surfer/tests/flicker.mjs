import puppeteer from 'puppeteer-core';

let health=null;
try{const r=await fetch('http://127.0.0.1:8000/healthz');health=r.ok?await r.json():null;}catch(_){}
if(!health?.ready){console.log('SKIP  local lens is not running and warm (`npm run lens:local`)');process.exit(0);}

const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--mute-audio']});
const page=await browser.newPage();await page.setViewport({width:820,height:560});
await page.goto('http://localhost:5173/labs/chunk-surfer/index.html?renderer=3d&mode=surf&lens=1&at=4,5&tuner=0',{waitUntil:'domcontentloaded'});
let state=null;
for(let i=0;i<90;i++){await new Promise((r)=>setTimeout(r,1000));state=await page.evaluate(()=>({lens:{...window.__diffusion?.stats},surfaces:window.__probe?.surfaceDream?.()}));if(state?.lens?.state==='ready')break;}
const check=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)process.exitCode=1;};
const overlay=await page.evaluate(()=>[...document.querySelectorAll('#map canvas')].some((c)=>c.style.transition?.includes('opacity 600ms')));
check('there is no camera-space diffusion overlay',!overlay);
check('diffused material layers are active in the world shader',state?.surfaces?.active===10,`${state?.surfaces?.active||0}/10`);
const before=state?.lens?.framesIn||0;
await page.keyboard.press('ArrowRight');await new Promise((r)=>setTimeout(r,1500));
const after=await page.evaluate(()=>({frames:window.__diffusion?.stats.framesIn||0,active:window.__probe?.surfaceDream?.().active||0}));
check('turning the camera does not request or reproject a new image',after.frames===before,`${before} → ${after.frames}`);
check('surface materials remain attached after camera movement',after.active===10);
await browser.close();
