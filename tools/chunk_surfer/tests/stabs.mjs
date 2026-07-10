import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage(); await p.setViewport({width:1000,height:640});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let pass=true; const check=(n,ok,x='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`); if(!ok)pass=false;};
const key=async(k,ms=180)=>{ await p.keyboard.press(k); await new Promise(r=>setTimeout(r,ms)); };

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&at=4,5',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.clear()); await p.reload({waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,15000));
let n=0; while(await p.evaluate(()=>window.__scenes.depth())>0 && n<40){ await key('Enter',110); n++; }

const pool=await p.evaluate(()=>window.__probe.stabPool());
check('stab pool built from the catalogue transients', pool>0, `${pool} samples`);

// 1. Silence in the opening minutes. Trust must exist before it is violated.
await p.evaluate(()=>window.__probe.stabRelief(1));   // maximally "safe"
await new Promise(r=>setTimeout(r,2500));
let s=await p.evaluate(()=>window.__probe.stabs());
check('no stab in the quiet opening, however safe you feel',
      s.trueCount===0 && s.falseCount===0, `expectation=${s.expectation.toFixed(2)}`);

// 2. Past the quiet window, a peak in expectation fires a TRUE stab.
await p.evaluate(()=>window.__probe.stabTune({quietMinutes:0, cooldownSec:0}));
await p.evaluate(()=>window.__probe.stabRelief(1));
await new Promise(r=>setTimeout(r,900));
s=await p.evaluate(()=>window.__probe.stabs());
check('a peak of safety fires a stab', s.trueCount+s.falseCount>0, `true=${s.trueCount} false=${s.falseCount}`);
check('the FIRST stabs are TRUE (the lesson before the lie)', s.falseCount===0, `false=${s.falseCount}`);

// 3. Threat suppresses stabs entirely: you cannot be startled while afraid.
await p.evaluate(()=>window.__probe.stabTune({cooldownSec:0}));
const before=await p.evaluate(()=>window.__probe.stabs());
for(let i=0;i<12;i++){ await p.evaluate(()=>window.__probe.stabThreat()); await new Promise(r=>setTimeout(r,120)); }
const after=await p.evaluate(()=>window.__probe.stabs());
check('threat suppresses stabs (no startle while already afraid)',
      after.trueCount+after.falseCount === before.trueCount+before.falseCount);
check('threat zeroes expectation', after.expectation<0.2, `expectation=${after.expectation.toFixed(2)}`);

// 4. Cooldown is a hard floor.
await p.evaluate(()=>window.__probe.stabTune({cooldownSec:600}));
const c0=await p.evaluate(()=>window.__probe.stabs());
for(let i=0;i<8;i++){ await p.evaluate(()=>window.__probe.stabRelief(1)); await new Promise(r=>setTimeout(r,150)); }
const c1=await p.evaluate(()=>window.__probe.stabs());
check('cooldown is a hard floor', c1.trueCount+c1.falseCount===c0.trueCount+c0.falseCount);

// 5. reduce-dread silences the physical layer entirely.
await p.evaluate(()=>window.__probe.setReduceDread(true));
await p.evaluate(()=>window.__probe.stabTune({cooldownSec:0, quietMinutes:0}));
const d0=await p.evaluate(()=>window.__probe.stabs());
for(let i=0;i<10;i++){ await p.evaluate(()=>window.__probe.stabRelief(1)); await new Promise(r=>setTimeout(r,140)); }
const d1=await p.evaluate(()=>window.__probe.stabs());
check('reduce-dread disables stabs', d1.trueCount+d1.falseCount===d0.trueCount+d0.falseCount);

// 6. Pages set a waypoint and name a room.
await p.evaluate(()=>window.__probe.placePage(0,-1,'lux_nova'));
await key('ArrowUp',500);
const o=await p.evaluate(()=>window.__probe.obj());
check('walking over a page sets a waypoint', !!o.wp && o.target==='lux_nova', JSON.stringify(o));
await p.screenshot({path:'stab-hud.png'});

console.log(errs.length?'\nERRORS:\n'+[...new Set(errs)].slice(0,3).join('\n'):'\nno page errors');
console.log(pass?'\n✅ DREAD DIRECTOR + OBJECTIVES PASSED':'\n❌ FAILURES');
await b.close(); process.exit(pass?0:1);
