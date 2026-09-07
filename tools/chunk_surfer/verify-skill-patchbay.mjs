// Real game pointer acceptance. Uses a disposable Chrome profile and the repo
// mock lens; it does not modify a player's saved run or claim native acceptance.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { TECHNIQUE as T } from '../../src/game/combat-state.js';

const base=process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5199';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>{errors.push(error.message);console.log('PAGEERROR',error.message);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=()=>page.evaluate(()=>window.__scenes.top().debugState());
const wait=fn=>page.waitForFunction(fn,{timeout:180000});
const supply=branch=>`bag:patch:supply:${branch}`;
const input=id=>`bag:patch:input:skill:${id}`;
const output=id=>`bag:patch:output:skill:${id}`;
async function point(id){
  return page.evaluate(async id=>{
    const ui=await import('/src/render/ui.js'),hit=window.__scenes.top().debugState().hitRegions.find(r=>r.id===id);
    if(!hit)throw new Error(`Missing visible target ${id}`);
    const size=ui.uiSize(),rect=document.getElementById('map').getBoundingClientRect();
    return {x:rect.left+(hit.x+hit.w*.5)/size.cols*rect.width,y:rect.top+(hit.y+hit.h*.5)/size.rows*rect.height};
  },id);
}
async function click(id){const p=await point(id);await page.mouse.click(p.x,p.y);await sleep(140);}
async function drag(from,to,{capture=null}={}){
  const start=await point(from),end=await point(to);
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  assert.ok((await state()).patchDrag,`available cable can be picked up at ${from}`);
  await page.mouse.move(end.x,end.y,{steps:10});await sleep(100);
  if(capture)await page.screenshot({path:`artifacts/${capture}.png`});
  await page.mouse.up();await sleep(180);
  assert.equal((await state()).patchDrag,null,'release clears transient cable');
}
try{
  await page.setViewport({width:1280,height:760,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  await page.goto(`${base}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`,{waitUntil:'domcontentloaded'});
  await wait(()=>!!window.__scenes?.top?.()?.id);
  if(await page.evaluate(()=>window.__scenes.top().id==='eula'))await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='opening-credits');
  await page.evaluate(()=>window.__scenes.top().update(30));
  await wait(()=>window.__scenes.top()?.id==='title');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='difficulty-select');await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='warning');await page.keyboard.press('Enter');await page.keyboard.press('n');
  await wait(()=>window.__chunkParity?.().screen==='game');
  await page.evaluate(()=>{
    window.__probe.testRun();window.__probe.godWarpGetIn();
    window.__probe.setFlags(['setup.levels','setup.waypoint','combat.trained','bag.taken']);
    window.__probe.setComposure(40);
  });
  const grant=await page.evaluate(()=>window.__probe.build());
  assert.equal(grant.tutorialGrant?.combatAssistance,'standard');
  assert.equal(grant.unspent,1,'Contract tutorial grants one starter lead');
  // Two existing collectible flags make a three-lead test rig, not a new grant.
  await page.evaluate(()=>{window.__probe.setFlags(['pin.academic','pin.gallery']);window.__probe.setComposure(40);});
  await sleep(400);await page.keyboard.press('b');await wait(()=>window.__scenes.top()?.id==='bag');
  assert.equal(await page.evaluate(()=>document.pointerLockElement===null),true);
  for(const section of ['map','sheets','kit','skills']){
    await click(`bag:tab:${section}`);assert.equal((await state()).nav.sectionId,section);
  }
  assert.equal((await state()).workingBuild.unspent,3);
  assert.equal((await state()).hitRegions.filter(r=>r.kind==='bag-patch-input').length,21);
  assert.equal((await state()).hitRegions.filter(r=>r.id.startsWith('bag:patch:output:')).length,0);
  await page.screenshot({path:'artifacts/patchbay-game-unpatched.png'});
  await drag(supply('torch'),input(T.AFTERIMAGE),{capture:'patchbay-game-drag'});
  assert.deepEqual((await state()).workingBuild.techniques,[T.AFTERIMAGE]);
  await drag(output(T.AFTERIMAGE),input(T.WHITEOUT));
  assert.deepEqual((await state()).workingBuild.techniques,[T.AFTERIMAGE,T.WHITEOUT]);
  const chain=(await state()).workingBuild;
  await drag(input(T.AFTERIMAGE),input(T.AFTERIMAGE));
  assert.deepEqual((await state()).workingBuild,chain,'releasing into same input preserves downstream chain');
  await drag(supply('recorder'),input(T.DEEP_RESERVE));
  assert.deepEqual((await state()).workingBuild,chain,'wrong color consumes nothing');
  await page.screenshot({path:'artifacts/patchbay-game-wide.png'});
  await page.setViewport({width:960,height:600});await sleep(500);
  await drag(input(T.AFTERIMAGE),'bag:patch:return');
  assert.equal((await state()).workingBuild.unspent,3);
  assert.deepEqual((await state()).workingBuild.techniques,[],'returning parent refunds its whole chain');
  await drag(supply('nerve'),input(T.DEEP_RESERVE));
  await drag(input(T.DEEP_RESERVE),input(T.BRACE));
  assert.deepEqual((await state()).workingBuild.techniques,[T.BRACE],'same-color reroute exchanges one patch');
  await drag(supply('torch'),input(T.AFTERIMAGE));
  await drag(output(T.AFTERIMAGE),input(T.WHITEOUT));
  assert.equal((await state()).workingBuild.unspent,0);
  const exhausted=(await state()).workingBuild;
  const p=await point(supply('recorder'));await page.mouse.move(p.x,p.y);await page.mouse.down();
  assert.equal((await state()).patchDrag,null,'no phantom cable when stock is empty');await page.mouse.up();
  assert.deepEqual((await state()).workingBuild,exhausted);
  await page.screenshot({path:'artifacts/patchbay-game-compact.png'});
  await click('bag:tab:kit');await page.screenshot({path:'artifacts/patchbay-game-inventory.png'});
  await page.keyboard.press('b');await sleep(250);
  assert.deepEqual((await page.evaluate(()=>window.__probe.build())).techniques,exhausted.techniques,'closing commits the live rig');
  const persisted=await page.evaluate(async()=>{
    const {saveLoad,getSave}=await import('/src/game/save.js');saveLoad();return getSave().combatBuild;
  });
  assert.deepEqual(persisted.techniques,exhausted.techniques,'save reload preserves configuration');
  assert.equal(persisted.unspent,0,'save reload cannot duplicate tutorial grant');
  await page.keyboard.press('b');await wait(()=>window.__scenes.top()?.id==='bag');await click('bag:tab:skills');
  assert.deepEqual((await state()).workingBuild.techniques,exhausted.techniques);
  // Inspect the job last: its real read callback advances the room's story,
  // which can legitimately open a dialogue after the Bag is later closed.
  await click('bag:tab:sheets');
  const sheet=(await state()).hitRegions.find(region=>region.kind==='bag-sheet');
  assert.ok(sheet,'the real run has its authored job sheet');await click(sheet.id);
  assert.equal((await state()).route.type,'sheet-reader');
  assert.ok((await state()).route.reader.reservedTopRows>0,'paper reserves space for momentary selectors');
  await sleep(500);await page.screenshot({path:'artifacts/patchbay-game-sheet.png'});
  await page.keyboard.press('z');await sleep(400);
  assert.equal((await state()).route.reader.reading,true);
  await page.screenshot({path:'artifacts/patchbay-game-sheet-reading.png'});
  await click('bag:tab:kit');assert.equal((await state()).route.type,'root');
  assert.deepEqual(errors,[]);
  console.log('PASS: real mouse tab selection, 21 inputs, installed-only outputs, cable dragging, prerequisite chain, atomic refusal, reroute/refund, empty stock, compact geometry, embedded paper/reading and save/reload. Zero page errors. Mock lens; native input not tested.');
}finally{await browser.close();}
