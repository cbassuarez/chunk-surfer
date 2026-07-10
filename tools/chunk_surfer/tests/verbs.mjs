import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage(); await p.setViewport({width:960,height:620});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let pass=true; const check=(n,ok,x='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`); if(!ok)pass=false;};
const key=async(k,ms=220)=>{ await p.keyboard.press(k); await new Promise(r=>setTimeout(r,ms)); };
const rec=()=>p.evaluate(()=>window.__probe.rec());
const pos=()=>p.evaluate(()=>window.__probe.pos());

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&plan=testbed&skiptut=1&at=4,5',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.clear()); await p.reload({waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,14000));
let n=0; while(await p.evaluate(()=>window.__scenes.depth())>0 && n<40){ await key('Enter',120); n++; }

check('starts dark', (await rec()).light===false);
await p.screenshot({path:'v-dark.png'});
await key('f',500);
check('bare f = light on', (await rec()).light===true);
await p.screenshot({path:'v-lit.png'});
await key('f',400);
check('bare f again = light off', (await rec()).light===false);

// movement, forward and back
const p0=await pos();
await key('ArrowUp',350); const p1=await pos();
check('forward moves', p1.x!==p0.x || p1.y!==p0.y, `${p0.x},${p0.y} -> ${p1.x},${p1.y}`);
await key('ArrowDown',350); const p2=await pos();
check('back moves', p2.x!==p1.x || p2.y!==p1.y, `${p1.x},${p1.y} -> ${p2.x},${p2.y}`);
await key('ArrowRight',350); await key('ArrowUp',350); const p3=await pos();
check('turn then forward moves in the new facing', p3.x!==p2.x || p3.y!==p2.y, `${p2.x},${p2.y} -> ${p3.x},${p3.y}`);

// recorder: r starts it, moving aborts it rather than locking
await key('r',900);
check('bare r starts recording', (await rec()).recording===true);
const pr=await pos();
await key('ArrowUp',600);
const after=await rec();
check('moving mid-take spoils it (no input lock)', after.spoiled===true, `reason="${after.spoilReason}"`);
const pr2=await pos();
const ahead=await p.evaluate(()=>{ const f=window.__probe.facing(); const q=window.__probe.pos();
  return { blocked: window.__probe.solid(q.x+f[0], q.y+f[1]), f }; });
check('and you actually move (or a wall is there)',
      (pr2.x!==pr.x || pr2.y!==pr.y) || ahead.blocked,
      `${pr.x},${pr.y} -> ${pr2.x},${pr2.y}  wallAhead=${ahead.blocked}`);
await new Promise(r=>setTimeout(r,1600));
check('spoiled take closes itself', (await rec()).recording===false);

// r again, then reaching for the light spoils it
await key('r',800);
await key('f',500);
const l=await rec();
check('light mid-take spoils it', l.spoiled===true && l.light===true, `reason="${l.spoilReason}"`);
await key('r',400);

console.log(errs.length?'\nERRORS: '+[...new Set(errs)].slice(0,3).join(' | '):'\nno page errors');
console.log(pass?'\n✅ VERBS + MOVEMENT PASSED':'\n❌ FAILURES');
await b.close(); process.exit(pass?0:1);
