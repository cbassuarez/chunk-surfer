import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const tok = fs.readFileSync('/Users/seb/cbassuarez.github.io/tools/chunk_surfer/diffusion_server/.lens-token','utf8').trim();
await fetch('https://cbassuarez--chunk-surfer-lens-lens.modal.run').catch(()=>{});
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--mute-audio']});
const p=await b.newPage(); await p.setViewport({width:820,height:560});
const wss=encodeURIComponent('wss://cbassuarez--chunk-surfer-lens-lens.modal.run');
await p.goto(`http://localhost:5173/labs/chunk-surfer/index.html?renderer=3d&mode=surf&lens=1&at=0,8&tuner=0&dtoken=${tok}`,{waitUntil:'domcontentloaded'});
for(let i=0;i<32;i++){ await new Promise(r=>setTimeout(r,4000));
  const n=await p.evaluate(()=>window.__diffusion?.stats.framesIn||0); if(n>12) break; }
// Instrument: hash every returned frame, measure diff between consecutive ones
await p.evaluate(()=>{
  window.__flick={hist:[]};
  // the diffusion overlay: 2D context, pointer-events none, z-index auto
  // (the ui glyph layer is z-index 8)
  const c=[...document.querySelectorAll('#map canvas')].find(x=>{
    const cs=getComputedStyle(x);
    return cs.pointerEvents==='none' && cs.zIndex==='auto' && x.width>100 && !!x.getContext('2d');
  });
  window.__flickCanvas=c;
  return !!c;
});
console.log('overlay found:', await p.evaluate(()=>!!window.__flickCanvas));
const sample = async () => p.evaluate(()=>{
  const c=window.__flickCanvas; if(!c) return null;
  const ctx=c.getContext('2d');
  const d=ctx.getImageData(0,0,c.width,c.height).data;
  const cur=[]; for(let i=0;i<d.length;i+=397*4) cur.push(d[i]);
  const h=window.__flick.hist; h.push(cur); if(h.length>3) h.shift();
  const diff=(a,bb)=>{ let s=0; for(let i=0;i<a.length;i++) s+=Math.abs(a[i]-bb[i]); return s/a.length; };
  if(h.length<3) return null;
  return { d1: diff(h[2],h[1]), d2: diff(h[2],h[0]) };
});
await sample(); await sample();
const d1=[], d2=[];
for(let i=0;i<26;i++){ await new Promise(r=>setTimeout(r,140)); const r=await sample(); if(r){ d1.push(r.d1); d2.push(r.d2); } }
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('STATIONARY, camera still:');
console.log('  N vs N-1 (adjacent):', avg(d1).toFixed(2));
console.log('  N vs N-2 (skip one):', avg(d2).toFixed(2));
console.log('  ratio adjacent/skip :', (avg(d1)/Math.max(0.01,avg(d2))).toFixed(2), '  >1.3 = ALTERNATING (flicker)');
await b.close();
