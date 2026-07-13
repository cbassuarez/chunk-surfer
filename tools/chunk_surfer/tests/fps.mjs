import puppeteer from 'puppeteer-core';

let health=null;
try{const r=await fetch('http://127.0.0.1:8000/healthz');health=r.ok?await r.json():null;}catch(_){}
if(!health?.ready){console.log('SKIP  local lens is not running and warm (`npm run lens:local`)');process.exit(0);}
console.log(`LOCAL SURFACE LENS  ${health.model} · ${health.device} · ${health.size}px`);

const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--mute-audio']});
const page=await browser.newPage();await page.setViewport({width:900,height:600});
const errors=[];page.on('pageerror',(e)=>errors.push(String(e)));
await page.goto('http://localhost:5173/labs/chunk-surfer/index.html?renderer=3d&mode=surf&lens=1&at=4,5&tuner=0',{waitUntil:'domcontentloaded'});

const started=Date.now();let result=null;
for(let i=0;i<90;i++){
  await new Promise((r)=>setTimeout(r,1000));
  result=await page.evaluate(()=>({lens:{...window.__diffusion?.stats},surfaces:window.__probe?.surfaceDream?.()}));
  if(result?.lens?.state==='ready'&&result?.surfaces?.active===10)break;
}
const elapsed=(Date.now()-started)/1000;
const check=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)process.exitCode=1;};
check('lens operates on material tiles, not camera frames',result?.lens?.mode==='surfaces',JSON.stringify(result?.lens));
check('all ten PBR albedo layers receive a local dream',result?.surfaces?.active===10,JSON.stringify(result?.surfaces));
check('one detailed surface sweep completes',result?.lens?.framesIn>=10,`${result?.lens?.framesIn||0} tiles in ${elapsed.toFixed(1)}s`);

const before=result.lens.framesIn;await new Promise((r)=>setTimeout(r,3000));
const after=await page.evaluate(()=>window.__diffusion?.stats.framesIn||0);
check('camera idling sends no frames after the material sweep',after===before,`${before} → ${after}`);
check('surface shader compiled without page errors',errors.length===0,errors.join(' | '));
await browser.close();
