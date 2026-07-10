import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const tok=fs.readFileSync('/Users/seb/cbassuarez.github.io/tools/chunk_surfer/diffusion_server/.lens-token','utf8').trim();
await fetch('https://cbassuarez--chunk-surfer-lens-lens.modal.run').catch(()=>{});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--mute-audio']});
const p=await b.newPage(); await p.setViewport({width:900,height:600});
await p.goto(`http://localhost:5173/labs/chunk-surfer/index.html?renderer=3d&mode=surf&lens=1&at=0,8&tuner=0&dtoken=${tok}`,{waitUntil:'domcontentloaded'});
for(let i=0;i<32;i++){ await new Promise(r=>setTimeout(r,4000));
  const n=await p.evaluate(()=>window.__diffusion?.stats.framesIn||0); if(n>10) break; }
// steady-state fps over 20s, standing still
const a=await p.evaluate(()=>window.__diffusion.stats.framesIn);
await new Promise(r=>setTimeout(r,20000));
const c=await p.evaluate(()=>({...window.__diffusion.stats}));
console.log('STILL  fps=', ((c.framesIn-a)/20).toFixed(1), ' rtt=', Math.round(c.lastRttMs)+'ms',
  ' out='+c.framesOut+' draw='+c.msDraw.toFixed(1)+'ms encode='+c.msEncode.toFixed(1)+'ms decode='+c.msDecode.toFixed(1)+'ms');
// and while walking
const d=c.framesIn;
for(let i=0;i<14;i++){ await p.keyboard.press('ArrowUp'); await new Promise(r=>setTimeout(r,700)); }
const e=await p.evaluate(()=>({...window.__diffusion.stats}));
console.log('MOVING fps=', ((e.framesIn-d)/9.8).toFixed(1), ' rtt=', Math.round(e.lastRttMs)+'ms');
await b.close();
