// Disposable authored-checkpoint fixtures; locomotion and dialogue use real input.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const out='artifacts/source-route/live';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
const page=await browser.newPage(),errors=[],checks=[],snapshots={};
let failure=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
page.on('pageerror',e=>{errors.push(String(e));console.log('PAGEERROR',String(e));});
page.on('console',m=>{if(/shader.*error|GLSL.*error|ERROR: 0:/i.test(m.text()))errors.push(m.text());});
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
const shot=async name=>{await page.screenshot({path:`${out}/${name}.png`});console.log('CAPTURE',name);};
const view=()=>page.evaluate(()=>window.__scenes?.top()?.view?.()||null);
const top=()=>page.evaluate(()=>window.__scenes?.top()?.id||null);
const pos=()=>page.evaluate(()=>({x:window.__sourceSave.getSave().px,y:window.__sourceSave.getSave().py}));
const press=async key=>{await page.keyboard.press(key);await sleep(160);};
async function clearSpeech(){await page.evaluate(async()=>{const u=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/speech.js')?.name;if(u){const s=await import(u);s.clearSpeech?.();}});}
async function move(key,ms=1000){const a=await pos();await page.keyboard.down(key);await sleep(ms);await page.keyboard.up(key);await sleep(180);return{a,b:await pos()};}
async function choose(id){
  for(let i=0;i<100;i++){
    const v=await view();
    if(!v)throw new Error('No dialogue for '+id+' top '+await top());
    if(v.pending?.options?.some(c=>c.id===id)){
      const index=v.pending.options.findIndex(c=>c.id===id);
      for(let n=0;n<(index-v.pending.index+v.pending.options.length)%v.pending.options.length;n++)await press('ArrowDown');
      await press('Enter');return;
    }
    await press('Enter');
  }
  throw new Error('Choice did not arrive '+id+' '+JSON.stringify(await view()));
}
async function finish(){for(let i=0;i<40&&await top();i++)await press('Enter');}
// Three talks qualify the fight (source-contact.js). Walk away each time.
async function talkThrice(){
  for(let n=0;n<3;n++){
    await page.evaluate(()=>{const p=window.__probe.presence(),s=window.__sourceSave.getSave();window.__probe.lookAtWorld(Math.atan2(p.x-s.px,-(p.y-s.py)),0);});
    await sleep(250);await clearSpeech();await press('e');await choose('contact.leave');await finish();
  }
}
async function chooseLabel(fragment){
  for(let i=0;i<80;i++){
    const v=await view(),options=v?.pending?.options||[];
    const index=options.findIndex(c=>String(c.text||c.label||'').includes(fragment));
    if(index>=0){
      for(let n=0;n<(index-v.pending.index+options.length)%options.length;n++)await press('ArrowDown');
      await press('Enter');return;
    }
    await press('Enter');
  }
  throw new Error('Choice label did not arrive '+fragment+' '+JSON.stringify(await view()));
}
async function walkTo(target){
  console.log('WALK TO',target);
  let stuck=0,previous=null;
  for(let n=0;n<150;n++){
    const p=await pos(),distance=Math.hypot(target.x-p.x,target.y-p.y);
    if(await page.evaluate(()=>window.__probe.chunkSurf().phase==='bells'))return;
    if(distance<1.3)return;
    if(previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<.02)stuck++;else stuck=0;
    if(stuck>5)throw new Error('Walking blocked '+JSON.stringify({target,p,motion:await page.evaluate(()=>window.__chunkSurferMotion.status())}));
    previous=p;
    if(n%15===0)console.log('WALK',p,distance);
    await page.evaluate(({p,target})=>window.__probe.lookAtWorld(Math.atan2(target.x-p.x,-(target.y-p.y)),0),{p,target});
    await move('w',Math.min(700,Math.max(60,distance*65)));
  }
  throw new Error('Walking target not reached '+JSON.stringify({target,p:await pos()}));
}
try{
  await page.goto('http://127.0.0.1:5296/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async()=>{
    window.__probe.testRun();window.__probe.tutSkip();
    const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/save.js')?.name;
    window.__sourceSave=await import(url||'/src/game/save.js');
  });
  await page.evaluate(()=>window.__probe.sourcePreset('landing'));await clearSpeech();await sleep(1100);await shot('scene-dock');
  snapshots.dock=await page.evaluate(()=>window.__probe.chunkSurf());
  await page.evaluate(()=>window.__probe.sourcePreset('first-contact'));await clearSpeech();await sleep(700);
  const initial=await page.evaluate(()=>({p:window.__probe.presence(),s:window.__probe.chunkSurf()}));
  await sleep(2500);
  const approached=await page.evaluate(()=>({p:window.__probe.presence(),s:window.__probe.chunkSurf()}));
  snapshots.hush={initial,approached};
  console.log('HUSH',initial.p.dist,approached.p.dist,await top());
  assert.ok(approached.p.dist<initial.p.dist-.1||approached.p.dist<=5.1,'HUSH approaches and stops within range');
  await page.evaluate(()=>{const p=window.__probe.presence(),s=window.__sourceSave.getSave();window.__probe.lookAtWorld(Math.atan2(p.x-s.px,-(p.y-s.py)),0);});
  await sleep(350);await shot('hush-first-landing');await talkThrice();await press('e');
  console.log('DIALOGUE',await top());
  assert.ok((await top())?.startsWith('source-contact:'),'real interact opens HUSH tree');
  await choose('contact.warning');
  for(let i=0;i<24;i++){const v=await view();if(v.pending?.options?.some(c=>c.id==='contact.confirm'))break;await press('Enter');}
  await shot('hush-contact-warning');
  await choose('contact.leave-warning');await finish();
  checks.push('HUSH approaches; real interact opens branching warning; player can withdraw without combat.');
  await page.evaluate(()=>window.__probe.preTapePreset(120));await sleep(500);
  const emptyMove=await move('w');assert.ok(Math.hypot(emptyMove.a.x-emptyMove.b.x,emptyMove.a.y-emptyMove.b.y)>.4,'outskirts movement');
  await shot('outskirts');checks.push('Actual held W crosses open-sky outskirts.');
  await page.evaluate(()=>window.__probe.bellsPreset(40));await sleep(700);
  const bellsBefore=await page.evaluate(()=>window.__probe.lookAngles());
  await page.mouse.click(720,450);await sleep(250);await page.mouse.move(820,430,{steps:8});await sleep(300);
  const bellsAfter=await page.evaluate(()=>window.__probe.lookAngles());
  assert.notEqual(bellsBefore.yaw,bellsAfter.yaw,'bell field permits looking');
  const bellMove=await move('w');assert.ok(Math.hypot(bellMove.a.x-bellMove.b.x,bellMove.a.y-bellMove.b.y)>.4,'bell field movement');
  snapshots.bells=await page.evaluate(()=>({frame:window.__probe.bellsFrame(),props:window.__probe.sourceProps(),source:window.__probe.chunkSurf(),lighting:window.__probe.r3dLighting()}));
  await shot('bell-field');checks.push('Bell field permits real turn and locomotion and submits shipped bell meshes.');
  await page.evaluate(()=>window.__probe.horizonPreset(168));await sleep(1800);
  await page.evaluate(()=>window.__probe.lookAtWorld(-Math.PI/2,0));await sleep(250);
  await shot('horizon-bust');snapshots.horizon=await page.evaluate(()=>window.__probe.horizonFrame());
  for(let n=0;n<12&&!await top();n++){await clearSpeech();await press('e');}
  assert.equal(await top(),'finale','real interact reaches bust proposition');
  await chooseLabel('Show me the choice');
  const beforeChoice=await pos();
  await chooseLabel('Set your hand');await finish();await clearSpeech();
  const path=await page.evaluate(()=>window.__probe.horizonFrame().towerPath);
  assert.equal(path.length,4,'acceptance reveals path');
  assert.deepEqual(await pos(),beforeChoice,'bust does not teleport player');
  await page.evaluate(()=>window.__probe.lookAtWorld(-Math.PI/2,-.14));await sleep(400);await shot('tower-path-revealed');
  const originY=beforeChoice.y+168;
  for(const point of path)await walkTo({x:point.x,y:originY-point.depth});
  snapshots.walkedTower=await page.evaluate(()=>({phase:window.__probe.chunkSurf().phase,position:window.__chunkSurferMotion.status(),bells:window.__probe.bellsFrame()}));
  assert.equal(snapshots.walkedTower.phase,'bells','walking revealed route reaches bell field');
  await shot('walked-into-bells');checks.push('Real bust interaction reveals a path without teleport; held movement walks the whole route into bells.');
  // Combat entry uses the same spoken warning, not a debug commit.
  await page.evaluate(()=>window.__probe.sourcePreset('first-contact'));await sleep(2000);
  await page.evaluate(()=>{const p=window.__probe.presence(),s=window.__sourceSave.getSave();window.__probe.lookAtWorld(Math.atan2(p.x-s.px,-(p.y-s.py)),0);});
  await talkThrice();await press('e');await choose('contact.warning');await choose('contact.confirm');
  for(let i=0;i<60;i++){const id=await top();if(id&&!id.startsWith('source-contact:'))break;await press('Enter');}
  await sleep(1800);snapshots.combat={scene:await top(),view:await view()};
  console.log('COMBAT',snapshots.combat.scene);
  assert.equal(snapshots.combat.scene,'battle:source-final','warning hands input to actual Source combat');
  await shot('contact-combat');checks.push('Warned dialogue confirmation opens actual combat pipeline.');
  assert.deepEqual(errors,[],'no JavaScript or shader errors');
}catch(error){failure=String(error?.stack||error);await shot('failure');console.error(error);process.exitCode=1;}
finally{
  await writeFile(`${out}/report.json`,JSON.stringify({
    passed:failure===null,failure,
    scope:'Chromium/Metal, disposable authored checkpoints; real keyboard dialogue and held movement. Route bearings use the camera probe; independent mouse-look is also tested. Not a complete playthrough or native OS-window validation.',
    checks,errors,snapshots,
  },null,2));
  await browser.close();
}
