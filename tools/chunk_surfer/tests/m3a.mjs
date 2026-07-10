import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new',
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width:960, height:620 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{ if(m.type()==='error' && !/favicon|enterRogue/.test(m.text())) errs.push(m.text()); });
const key=async(k,ms=200)=>{ await page.keyboard.press(k); await new Promise(r=>setTimeout(r,ms)); };
const probe=()=>page.evaluate(()=>({ voices: window.__probe.voices(), rec: window.__probe.rec() }));
let pass=true;
const check=(name,ok,extra='')=>{ console.log(`${ok?'PASS':'FAIL'}  ${name}${extra?'  '+extra:''}`); if(!ok) pass=false; };

// ── STORY: silent world ──────────────────────────────────────────────────────
await page.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&at=4,5',{waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(()=>localStorage.clear());
await page.reload({waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,14000));
// close the auto-opened dialogue
let n=0; while(await page.evaluate(()=>window.__scenes.depth())>0 && n<40){ await key('Enter',150); n++; }
await new Promise(r=>setTimeout(r,1200));

let s=await probe();
check('story: walking world is silent (0 voices)', s.voices===0, `voices=${s.voices}`);
check('story: starts dark (the building is dark and so are you)', s.rec.light===false);

// walk: still silent, and noise is emitted
for(let i=0;i<4;i++) await key('ArrowUp',260);
s=await probe();
check('story: still silent after walking', s.voices===0, `voices=${s.voices}`);
check('walking emits noise', s.rec.noise>0.05, `noise=${s.rec.noise.toFixed(3)} (decaying)`);
const pos=await page.evaluate(()=>window.__probe.pos());
check('noise is left at a cell (what the presence will hunt)',
      s.rec.lastNoiseAt.t>0, `at ${s.rec.lastNoiseAt.x},${s.rec.lastNoiseAt.y} vs player ${pos.x},${pos.y}`);

// flashlight
await page.screenshot({path:'m3-dark.png'});
await key('f',400);
s=await probe();
check('F toggles flashlight on', s.rec.light===true);
await key('f',400);
s=await probe();
check('F toggles it back off', s.rec.light===false);

// ── RECORD: monitor opens, movement locks, light forced off ─────────────────
await new Promise(r=>setTimeout(r,2500));   // let noise decay
await key('r',1500);
s=await probe();
check('R starts recording', s.rec.recording===true);
check('recording forces the light off', s.rec.light===false);
check('recording opens the monitor (voices appear)', s.voices>0, `voices=${s.voices}`);
check('monitor is sparse (<=4 voices)', s.voices<=4, `voices=${s.voices}`);
await page.screenshot({path:'m3-recording.png'});

// take accrues while quiet (do NOT move: moving now spoils it by design)
await new Promise(r=>setTimeout(r,3000));
s=await probe();
check('take accrues while quiet', s.rec.takeElapsed>2, `elapsed=${s.rec.takeElapsed.toFixed(1)}s`);
check('take not spoiled by silence', s.rec.spoiled===false);

// spoil it: force noise (simulating something in the room)
await page.evaluate(()=>window.__probe.noise(0.9));
await new Promise(r=>setTimeout(r,400));
s=await probe();
check('noise spoils the take', s.rec.spoiled===true, `reason="${s.rec.spoilReason}"`);
await page.screenshot({path:'m3-spoiled.png'});
await new Promise(r=>setTimeout(r,1600));   // auto-close
s=await probe();
check('spoiled take closes the recorder', s.rec.recording===false);
check('closing the monitor returns silence', s.voices===0, `voices=${s.voices}`);
check('the light does NOT come back by itself', s.rec.light===false);

// injury raises the noise floor, measurably
const f0=await page.evaluate(()=>window.__probe.floor());
await page.evaluate(()=>window.__probe.injure());
const f1=await page.evaluate(()=>window.__probe.floor());
check('injury raises the noise floor', f1>f0, `${f0.toFixed(3)} -> ${f1.toFixed(3)}`);

// ── SURF: the lab is untouched ───────────────────────────────────────────────
await page.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=surf&renderer=3d',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,14000));
for(let i=0;i<6;i++) await key('ArrowUp',200);
await new Promise(r=>setTimeout(r,1500));
const sv=await page.evaluate(()=>window.__probe.voices());
check('JUST SURF still plays the full field', sv>10, `voices=${sv}`);

console.log(errs.length ? '\nERRORS:\n'+[...new Set(errs)].slice(0,4).join('\n') : '\nno page errors');
console.log(pass ? '\n✅ M3 CORE ACCEPTANCE PASSED' : '\n❌ FAILURES ABOVE');
await browser.close();
process.exit(pass?0:1);
