// Physical redaction battle + encounter lifecycle.
// npm run dev && node tools/chunk_surfer/tests/battle.mjs

import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage();
await p.setViewport({width:1100,height:700});
const errs=[];p.on('pageerror',(e)=>errs.push(e.message));
let pass=true;
const check=(name,ok,extra='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${extra?'  '+extra:''}`);if(!ok)pass=false;};
const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
const key=async(k,ms=90)=>{await p.keyboard.press(k);await wait(ms);};
const ev=(fn,...args)=>p.evaluate(fn,...args);
const scene=()=>ev(()=>window.__probe?.scene?.()||null);
const state=()=>ev(()=>window.__probe?.battleState?.()||null);
const gates=()=>ev(()=>window.__probe?.encounters?.()||null);
const url='http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&sam=0&at=85,30';

async function dismissScenes(limit=30){
  for(let i=0;i<limit&&(await ev(()=>window.__scenes?.depth?.()||0))>0;i++)await key('Enter',110);
}
async function waitReady(limit=160){
  for(let i=0;i<limit;i++){
    if(await ev(()=>!!window.__probe&&window.__probe.plan().loaded))return true;
    await wait(100);
  }
  return false;
}
async function toPuzzle(limit=80){
  for(let i=0;i<limit;i++){
    const s=await state();
    if(s?.phase==='puzzle')return s;
    if(!(await scene())?.startsWith('battle'))return null;
    await key('Space',100);
  }
  return null;
}
async function solveSheet(){
  const s=await state();
  const keep=new Set(s.readings[0].required);
  for(let i=0;i<s.tokens.length;i++){
    if(!keep.has(s.tokens[i].id))await key('Enter',12);
    if(i<s.tokens.length-1)await key('ArrowRight',8);
  }
  await key('r',950);
}
async function finishWin(){
  for(let guard=0;guard<8&&(await scene())?.startsWith('battle');guard++){
    const s=await toPuzzle();
    if(!s)break;
    await solveSheet();
  }
  for(let i=0;i<80&&(await scene())?.startsWith('battle');i++)await key('Space',80);
}

await p.goto(url,{waitUntil:'domcontentloaded'});
await ev(()=>localStorage.clear());
await p.reload({waitUntil:'domcontentloaded'});
await waitReady();await dismissScenes();

// Direct mechanic: the text itself is the battle.
await ev(()=>window.__probe.battle(false));await wait(250);
let s=await toPuzzle();
check('battle opens on a physical sheet',s?.phase==='puzzle',JSON.stringify(s?.phase));
check('sheet exposes tokens and multiple readings',s?.tokens?.length>10&&s?.readings?.length>=2,`${s?.tokens?.length}/${s?.readings?.length}`);
check('no verb menu remains',!('verbs'in(s||{})));
const original=s?.surviving;
await key('Enter',80);
s=await state();
check('confirm physically blacks out the selected word',s?.playerRedacted?.length===1,String(s?.playerRedacted?.length));
check('readback changes with the sheet',s?.surviving!==original,s?.surviving);
await key('Backspace',80);
check('undo restores the word',(await state())?.surviving===original);
await finishWin();
check('two won challenges defeat a normal battle',!(await scene())?.startsWith('battle'));

// Fresh slot two: stale thought data must not suppress the natatorium.
await ev(()=>localStorage.clear());
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>{
  const raw=JSON.parse(localStorage.getItem('chunk-surfer:save:v2')||'{"version":2}');
  raw.thoughts={had:['battle-the_tub']};localStorage.setItem('chunk-surfer:save:v2',JSON.stringify(raw));
});
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>window.__probe.seedTake('main_b3'));
await ev(()=>window.__probe.tuneRoomTone({takeSeconds:8}));
await key('r',180);await key('r',180);
let fired=null;
for(let i=0;i<30&&!fired;i++){await wait(120);if((await scene())?.startsWith('battle'))fired=await scene();}
const g=await gates();
check('recording slot two fires in the natatorium',fired==='battle:natatorium',JSON.stringify(g));

// Reloading an unfinished battle does not consume it.
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>window.__probe.seedTake('main_b3'));
await ev(()=>window.__probe.tuneRoomTone({takeSeconds:8}));
await key('r',180);await key('r',180);
fired=null;
for(let i=0;i<30&&!fired;i++){await wait(120);if((await scene())?.startsWith('battle'))fired=await scene();}
check('reload re-arms an unfinished encounter',fired==='battle:natatorium',JSON.stringify(await gates()));

// The event belongs to recording ordinal, not the natatorium. Choosing the
// hall as recording two produces the hall sheet instead.
await ev(()=>localStorage.clear());
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>window.__probe.seedTake('main_b3'));
await ev(()=>window.__probe.warpCell(102,15));
await ev(()=>window.__probe.tuneRoomTone({takeSeconds:8}));
await key('r',180);await key('r',180);
fired=null;
for(let i=0;i<30&&!fired;i++){await wait(120);if((await scene())?.startsWith('battle'))fired=await scene();}
check('recording two may be the concert hall',fired==='battle:hall',JSON.stringify(await gates()));

console.log(errs.length?`\nERRORS:\n${errs.join('\n')}`:'\nno page errors');
console.log(pass?'\n✅ BATTLE PASSED':'\n❌ FAILURES');
await b.close();
process.exit(pass?0:1);
