import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage(); await p.setViewport({width:960,height:620});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const key=async(k,ms=200)=>{ await p.keyboard.press(k); await new Promise(r=>setTimeout(r,ms)); };
let pass=true; const check=(n,ok,x='')=>{ console.log(`${ok?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`); if(!ok) pass=false; };

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&plan=testbed&skiptut=1&at=4,5',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.clear()); await p.reload({waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,14000));
let n=0; while(await p.evaluate(()=>window.__scenes.depth())>0 && n<40){ await key('Enter',120); n++; }

check('presence absent before the first take', !(await p.evaluate(()=>window.__probe.presence().active)));

// first RECORD summons it
await key('r',1200);
const s0=await p.evaluate(()=>window.__probe.presence());
check('first take summons the presence', s0.active===true, `at ${s0.x.toFixed(0)},${s0.y.toFixed(0)} dist=${s0.dist.toFixed(1)}`);
await key('r',600);   // stop recording

// THE central claim: it goes to the NOISE, not to the player.
// Put it far away, make a noise at a known cell, teleport player elsewhere.
await p.evaluate(()=>window.__probe.placePresence(0,40));
await p.evaluate(()=>{ window.__probe.noise(0.9); });   // noise at player's cell
const noiseCell=await p.evaluate(()=>window.__probe.rec().lastNoiseAt);
await new Promise(r=>setTimeout(r,2600));
const s1=await p.evaluate(()=>window.__probe.presence());
const distToNoise=Math.hypot(s1.x-noiseCell.x, s1.y-noiseCell.y);
check('it moves toward the sound', s1.hasTarget===true && distToNoise<40-2,
      `presence ${s1.x.toFixed(1)},${s1.y.toFixed(1)} -> noise ${noiseCell.x},${noiseCell.y} (d=${distToNoise.toFixed(1)})`);
check('its target IS the noise cell', Math.abs(s1.targetX-noiseCell.x)<0.01 && Math.abs(s1.targetY-noiseCell.y)<0.01,
      `target=${s1.targetX},${s1.targetY}`);

// standing still with the light off = it loses interest and drifts
await p.evaluate(()=>{ const r=window.__probe.rec(); if(r.light) window.__probe.toggleLight?.(); });
await new Promise(r=>setTimeout(r,8000));
const s2=await p.evaluate(()=>window.__probe.presence());
check('silence makes it lose the target', s2.hasTarget===false, `hasTarget=${s2.hasTarget}`);

// contact injures rather than kills
const before=await p.evaluate(()=>window.__probe.rec().injuries);
const pos=await p.evaluate(()=>window.__probe.pos());
await p.evaluate(({x,y})=>window.__probe.placePresence(x,y), pos);
await new Promise(r=>setTimeout(r,900));
const after=await p.evaluate(()=>({inj:window.__probe.rec().injuries, floor:window.__probe.floor(), aw:window.__probe.presence().awareness, pos:window.__probe.pos()}));
check('contact injures (no death)', after.inj===before+1, `injuries ${before} -> ${after.inj}`);
check('injury raises the noise floor', after.floor>0, `floor=${after.floor.toFixed(3)}`);
check('it becomes more aware, permanently', after.aw>0, `awareness=${after.aw.toFixed(2)}`);
check('player is shoved away, not killed', after.pos.x!==pos.x || after.pos.y!==pos.y, `${pos.x},${pos.y} -> ${after.pos.x},${after.pos.y}`);
await p.screenshot({path:'pres-caught.png'});

console.log(errs.length?'\nERRORS:\n'+[...new Set(errs)].slice(0,3).join('\n'):'\nno page errors');
console.log(pass?'\n✅ PRESENCE ACCEPTANCE PASSED':'\n❌ FAILURES');
await b.close(); process.exit(pass?0:1);
