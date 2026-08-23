import puppeteer from 'puppeteer-core';
const OUT='/private/tmp/claude-501/-Users-seb-chunk-surfer/ead38971-e264-4071-a5a1-44d1c54907cb/scratchpad';
const browser = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new', args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); await page.setViewport({width:1024,height:640});
let nav=Date.now(); page.on('framenavigated',f=>{if(f===page.mainFrame())nav=Date.now();});
await page.goto('http://127.0.0.1:5173/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:60000});
const ready=()=>page.waitForFunction(()=>window.__chunkSurferPixelMesh?.status?.()?.framesRendered>4,{timeout:300000,polling:500});
await ready();
for(let i=0;i<40 && Date.now()-nav<2500;i++){ await new Promise(r=>setTimeout(r,500)); await ready().catch(()=>{}); }
const settle=(n)=>page.evaluate((n)=>new Promise(r=>{let i=0;const s=()=>(++i>=n?r():requestAnimationFrame(s));requestAnimationFrame(s);}),n);
await page.evaluate(()=>window.__probe.testRun()); await settle(30);
await page.evaluate(()=>{
  window.__probe.godMenu('source-space');
  const sc=window.__scenes.top();
  for(let i=0;i<80;i++){ if(sc.view?.()?.row==='horizon-head'){sc.key({key:'Enter',code:'Enter',preventDefault(){}});return;} sc.key({key:'ArrowDown',code:'ArrowDown',preventDefault(){}}); }
});
await settle(20); await page.evaluate(()=>window.__probe.closeGodMenu?.()); await settle(50);

// Can the body stand where the path says, and not where it does not?
const probeAt = (dx) => page.evaluate((dx)=>{
  const p = window.__probe.pos();
  return { ok: window.__probe.canStep ? !!window.__probe.canStep(p.x+dx, p.y) : null, x:p.x, y:p.y };
}, dx);
console.log('at the head:');
for (const dx of [0, 20, 34, 50, 90]) {
  const r = await probeAt(dx);
  console.log(`  step ${String(dx).padStart(3)} cells sideways -> ${r.ok===null?'n/a':(r.ok?'walkable':'OUTSIDE the picture')}`);
}
const h = await page.evaluate(()=>window.__probe.horizon());
console.log('\nedge value standing centred:', h.edge ?? '(not exposed)');
await browser.close();
