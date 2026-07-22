// Deterministic signal combat + encounter lifecycle.
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
const url='http://localhost:5173/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&sam=0&at=85,30';

async function dismissScenes(limit=30){
  if(await ev(()=>typeof window.__probe?.testRun==='function')){
    await ev(()=>window.__probe.testRun());
    await wait(120);
    return;
  }
  if(await ev(()=>typeof window.__probe?.clearDiagnosticScenes==='function')){
    await ev(()=>window.__probe.clearDiagnosticScenes());
    await wait(120);
    return;
  }
  for(let i=0;i<limit&&(await ev(()=>window.__scenes?.depth?.()||0))>0;i++)await key('Enter',110);
}
async function waitReady(limit=160){
  for(let i=0;i<limit;i++){
    if(await ev(()=>!!window.__probe&&window.__probe.plan().loaded))return true;
    await wait(100);
  }
  return false;
}
async function toCombatMenu(limit=120){
  for(let i=0;i<limit;i++){
    const s=await state();
    if(s?.phase==='select')return s;
    if(!(await scene())?.startsWith('battle'))return null;
    await key('Space',100);
  }
  return null;
}
async function chooseAction(id){
  const view=await state();
  const at=view.actions.findIndex((action)=>action.id===id&&action.enabled);
  if(at<0)throw new Error(`action ${id} unavailable: ${JSON.stringify(view.actions)}`);
  const down=(at-view.selected+view.actions.length)%view.actions.length;
  for(let i=0;i<down;i++)await key('ArrowDown',12);
  await key('Enter',180);
}
async function finishWin(limit=80){
  for(let guard=0;guard<limit&&(await scene())?.startsWith('battle');guard++){
    const view=await toCombatMenu();
    if(!view)break;
    const intent=view.intent?.kind;
    const preferred=view.state.tempo
      ? (view.actions.some((action)=>action.id==='playback'&&action.enabled)?'playback':'end-tempo')
      : intent==='broadcast'?'monitor'
        : intent==='conceal'?'expose'
          : intent==='overload'?'hold'
            : intent==='loop'&&view.actions.some((action)=>action.id==='invert'&&action.enabled)?'invert'
              :'hold';
    await chooseAction(preferred);
  }
  for(let i=0;i<80&&(await scene())?.startsWith('battle');i++)await key('Space',80);
}

await p.goto(url,{waitUntil:'domcontentloaded'});
await ev(()=>localStorage.clear());
await p.reload({waitUntil:'domcontentloaded'});
await waitReady();await dismissScenes();

// Direct mechanic: exact intent, action result, and deterministic Tempo.
await ev(()=>window.__probe.battle(false));
const heldForEntry=await state();
check('combat waits while its musical entry is acquired',heldForEntry?.phase==='arrival',JSON.stringify(heldForEntry?.music));
let arrival=heldForEntry;
for(let i=0;i<50&&!arrival?.music?.entryVariant;i++){await wait(50);arrival=await state();}
check('battle score exposes a deterministic entry pair',
  arrival?.music?.entryVariant>=1&&arrival.music.entryVariant<=3&&Number.isFinite(arrival.music.downbeatAt),
  JSON.stringify(arrival?.music));
let s=await toCombatMenu();
check('battle opens on an exact intent',s?.phase==='select'&&s?.intent?.kind==='broadcast',JSON.stringify(s?.intent));
check('Natatorium keeps lead 1 on the shared 40-bar clock',
  s?.music?.targetLead==='lead-1'&&s.music.status==='running'&&s.music.gridBar>=1,
  JSON.stringify(s?.music));
check('actions expose exact availability and results',s?.actions?.length>=5&&s.actions.every((action)=>typeof action.enabled==='boolean'),JSON.stringify(s?.actions));
check('word-redaction sheet state is retired',!('tokens'in(s?.state||{}))&&!('readings'in(s?.state||{})));
const printedTakeDamage=s?.intent?.playbackDamage??s?.intent?.damage;
await chooseAction('monitor');
s=await state();
check('perfect Monitor captures the printed Take',s?.state?.take?.damage===printedTakeDamage,String(s?.state?.take?.damage));
check('perfect response opens one Tempo action',s?.state?.tempo===true,JSON.stringify(s?.state?.last));
check('perfect response requests the written lead on a future bar',
  s?.music?.activeLead==='lead-1'&&s.music.windowStartAt>=s.music.downbeatAt,
  JSON.stringify(s?.music));
await chooseAction('playback');
s=await state();
check('Playback spends the Take without chaining Tempo',!s?.state?.take&&s?.state?.tempo===false,JSON.stringify({take:s?.state?.take,tempo:s?.state?.tempo,turns:s?.state?.turns}));
await finishWin();
check('authored deterministic movements defeat a normal battle',!(await scene())?.startsWith('battle'));

// The two boss routes use the same conductor but retain movement-authored voices.
for(const [id,movementLeads] of [
  ['source',['lead-1','lead-2','lead-3']],
  ['chapel',['lead-1','lead-2','lead-3','lead-1','lead-3']],
]){
  await ev((battleId)=>window.__probe.battleId(battleId,false),id);
  let bossArrival=await state();
  for(let i=0;i<50&&!bossArrival?.music?.entryVariant;i++){await wait(50);bossArrival=await state();}
  const bossMenu=await toCombatMenu();
  check(`${id} opens on its deterministic battle-score session`,
    bossMenu?.music?.targetLead===movementLeads[0]&&bossMenu.music.status==='running',
    JSON.stringify(bossMenu?.music));
  check(`${id} retains its authored movement voice sequence`,
    await ev((battleId,expected)=>{
      const music=window.__probe.battleState?.()?.state?.definition?.music;
      return music?.mode==='movement'&&JSON.stringify(music.movementLeads)===JSON.stringify(expected);
    },id,movementLeads));
  await ev(()=>window.__probe.battleAbort());await wait(120);
}

// Fresh slot two: stale thought data must not suppress the natatorium.
await ev(()=>localStorage.clear());
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>{
  const raw=JSON.parse(localStorage.getItem('chunk-surfer:save:v2')||'{"version":2}');
  raw.thoughts={had:['battle-the_tub','level-check','first-take']};localStorage.setItem('chunk-surfer:save:v2',JSON.stringify(raw));
});
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>window.__probe.warpCell(85,30));
await ev(()=>window.__probe.seedTake('main_b3'));
await ev(()=>window.__probe.tuneRoomTone({takeSeconds:8}));
await key('r',180);await key('r',180);
let fired=null;
for(let i=0;i<30&&!fired;i++){await wait(120);if((await scene())?.startsWith('battle'))fired=await scene();}
const g=await gates();
check('recording slot two fires in the natatorium',fired==='battle:natatorium',JSON.stringify(g));

// Reloading an unfinished battle does not consume it.
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>window.__probe.warpCell(85,30));
await ev(()=>window.__probe.seedTake('main_b3'));
await ev(()=>window.__probe.tuneRoomTone({takeSeconds:8}));
await key('r',180);await key('r',180);
fired=null;
for(let i=0;i<30&&!fired;i++){await wait(120);if((await scene())?.startsWith('battle'))fired=await scene();}
check('reload re-arms an unfinished encounter',fired==='battle:natatorium',JSON.stringify(await gates()));

// The event belongs to recording ordinal, not the natatorium. Choosing the
// hall as recording two produces the hall combat script instead.
await ev(()=>localStorage.clear());
await p.reload({waitUntil:'domcontentloaded'});await waitReady();await dismissScenes();
await ev(()=>{
  const raw=JSON.parse(localStorage.getItem('chunk-surfer:save:v2')||'{"version":2}');
  raw.thoughts={had:['level-check','first-take']};localStorage.setItem('chunk-surfer:save:v2',JSON.stringify(raw));
});
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
