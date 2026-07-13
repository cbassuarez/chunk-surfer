import puppeteer from 'puppeteer-core';

const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal']});
const p=await b.newPage();await p.setViewport({width:900,height:600});
const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
const key=async(k,ms=100)=>{await p.keyboard.press(k);await wait(ms);};
const ev=(fn,...args)=>p.evaluate(fn,...args);
let pass=true;const ck=(n,ok,x='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`);if(!ok)pass=false;};
const url='http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&skipwarn=1&nomic=1&sam=0';

await p.goto(url,{waitUntil:'domcontentloaded'});await ev(()=>localStorage.clear());await p.reload({waitUntil:'domcontentloaded'});
for(let i=0;i<160&&!await ev(()=>!!window.__probe?.plan?.().loaded);i++)await wait(100);
for(let i=0;i<30&&await ev(()=>window.__scenes.depth()>0);i++)await key('Enter');
await ev(()=>window.__probe.warpCell(85,30));
const before=await ev(()=>window.__probe.pos());
for(const k of ['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']){
  await key(k,180);
  const now=await ev(()=>window.__probe.pos());
  if(now.x!==before.x||now.y!==before.y)break;
}
const saved=await ev(()=>window.__probe.pos());
const raw=await ev(()=>JSON.parse(localStorage.getItem('chunk-surfer:save:v3')));
ck('a successful step persists position immediately',raw?.px===saved.x&&raw?.py===saved.y,JSON.stringify({saved,raw:raw&&{x:raw.px,y:raw.py}}));
await p.reload({waitUntil:'domcontentloaded'});
for(let i=0;i<160&&!await ev(()=>!!window.__probe?.plan?.().loaded);i++)await wait(100);
for(let i=0;i<30&&await ev(()=>window.__scenes.depth()>0);i++)await key('Enter');
const restored=await ev(()=>window.__probe.pos());
ck('reload restores the saved physical position',restored.x===saved.x&&restored.y===saved.y,JSON.stringify({saved,restored}));

console.log(pass?'\n✅ POSITION SAVE PASSED':'\n❌ FAILURES');
await b.close();process.exit(pass?0:1);
