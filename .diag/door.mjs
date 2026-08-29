import {boot} from './boot.mjs';
const {browser,page}=await boot();
await page.evaluate(()=>window.__probe.sourcePreset('landing'));
await new Promise(r=>setTimeout(r,1200));
await page.evaluate(()=>window.__probe.sourceWarp(8,-242-14,0));
for(let i=0;i<10;i++) await page.keyboard.press('w');
await new Promise(r=>setTimeout(r,500));
// Sample frame times across the open.
const trace=await page.evaluate(async()=>{
  const marks=[]; let last=performance.now(); let stop=false;
  const tick=()=>{const n=performance.now();marks.push(n-last);last=n;if(!stop)requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
  const t0=performance.now();
  window.__probe.sourceCell&&null;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));
  await new Promise(r=>setTimeout(r,4000));
  stop=true;
  return {marks,portal:window.__probe.chunkSurf().landing?.portal||null,elapsed:performance.now()-t0};
});
const m=trace.marks.filter(Number.isFinite);
m.sort((a,b)=>b-a);
console.log('frames sampled:',m.length);
console.log('worst frame:',m[0]?.toFixed(0),'ms | 2nd:',m[1]?.toFixed(0),'| 3rd:',m[2]?.toFixed(0),'| median:',m[Math.floor(m.length/2)]?.toFixed(1));
console.log('portal after 4s:',JSON.stringify(trace.portal));
await browser.close();
