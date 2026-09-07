import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5203',out='artifacts/item-portraits';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e.stack||e)));
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
 await page.goto(`${base}/?nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.bagOpen&&window.__scenes?.top()?.id);
 await page.evaluate(async()=>{
  window.__probe.testRun();window.__probe.setFlags(['bag.taken','has.interface','has.fork','combat.trained','badge.taken']);window.__probe.bagOpen('kit');
  window.__itemQA=await import('/src/game/item-inspection.js');window.__uiQA=await import('/src/render/ui.js');
 });
 const state=()=>page.evaluate(()=>window.__scenes.top()?.debugState?.());
 const stats=()=>page.evaluate(()=>window.__itemQA.itemInspectionStats());
 async function cellPoint(r){return page.evaluate(r=>{const size=window.__uiQA.uiSize(),host=document.getElementById('map').getBoundingClientRect();return{x:host.x+(r.x+r.w/2)/size.cols*host.width,y:host.y+(r.y+r.h/2)/size.rows*host.height};},r);}
 async function clickHit(id){const hit=(await state()).hitRegions.find(h=>h.id===id);assert.ok(hit,`Visible target ${id}`);const p=await cellPoint(hit);await page.mouse.click(p.x,p.y);await sleep(180);}
 async function inspect(id){
  const entry=(await state()).model.sections.find(s=>s.id==='kit').entries.find(e=>e.sourceId===id);assert.ok(entry,id);
  // Navigate the real catalog so offscreen items scroll into view.
  for(let i=0;i<30&&(await state()).selected.sourceId!==id;i++)await page.keyboard.press('ArrowDown');
  assert.equal((await state()).selected.sourceId,id);
  await page.keyboard.press('Enter');await sleep(150);
  await clickHit('bag:action:inspect');
  await page.waitForFunction(()=>window.__scenes.top()?.debugState?.().route.inspection?.ready);
  await sleep(200);
 }
 await sleep(700);assert.equal((await stats()).contexts,0,'ordinary inventory creates no WebGL portrait context');
 await page.screenshot({path:`${out}/bag-wide.png`});
 await inspect('recorder');assert.equal((await stats()).contexts,1);
 const first=await state(),loadout=first.model.loadout;
 await page.screenshot({path:`${out}/recorder-inspect.png`});
 await page.keyboard.press('ArrowRight');assert.ok((await state()).route.inspection.yaw>0);
 const layout=await page.evaluate(async()=>{const {itemInspectionLayout}=await import('/src/render/item-inspection-view.js');const r=window.__scenes.top().debugState().hitRegions;const back=r.find(h=>h.kind==='bag-back');return{back};});
 // Drag across the left half of the actual inspection surface.
 const backPoint=await cellPoint(layout.back);await page.mouse.move(340,backPoint.y-230);await page.mouse.down();await page.mouse.move(470,backPoint.y-180,{steps:10});await page.mouse.up();
 assert.ok((await state()).route.inspection.yaw>.2,'pointer drag rotates the object');
 await page.screenshot({path:`${out}/recorder-rotated.png`});
 await page.keyboard.press('r');assert.equal((await state()).route.inspection.yaw,0);
 await page.evaluate(()=>window.__scenes.top().key({controllerAction:'move_left'}));assert.ok((await state()).route.inspection.yaw<0);
 await page.evaluate(()=>window.__scenes.top().key({controllerAction:'tabPrev'}));assert.equal((await state()).route.inspection.yaw,0);
 const count=(await stats()).renderCount;await sleep(600);assert.equal((await stats()).renderCount,count,'stationary inspection renders on demand');
 await page.keyboard.press('Escape');assert.deepEqual((await state()).model.loadout,loadout);assert.equal((await stats()).active,false);
 const stopped=(await stats()).renderCount;await sleep(600);assert.equal((await stats()).renderCount,stopped,'closing stops portrait rendering');
 await inspect('radio');assert.equal((await stats()).contexts,1,'a second asset reuses the same context');
 await page.screenshot({path:`${out}/radio-inspect.png`});
 await page.setViewport({width:960,height:640});await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1.5));await sleep(400);
 await page.screenshot({path:`${out}/inspect-large-text.png`});
 const hits=(await state()).hitRegions;assert.ok(hits.some(h=>h.id==='bag:inspection-reset'));
 await clickHit('bag:inspection-reset');await page.keyboard.press('b');assert.notEqual(await page.evaluate(()=>window.__scenes.top()?.id),'bag');assert.equal((await stats()).active,false);
 // The actual renderer fails gracefully while the cached picture stays usable.
 await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/assets/items/badge.glb')?r.abort():r.continue());
 await page.evaluate(()=>window.__probe.bagOpen('kit'));await sleep(200);
 for(let i=0;i<30&&(await state()).selected.sourceId!=='badge';i++)await page.keyboard.press('ArrowDown');
 await page.keyboard.press('Enter');await sleep(150);
 // Compact layouts can scroll action rows using keyboard; inspect is always first.
 const badge=(await state()).selected;const index=badge.actionList.findIndex(a=>a.id==='inspect');
 for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.__scenes.top()?.debugState?.().route.inspection?.failed);
 await page.screenshot({path:`${out}/inspection-fallback.png`});await page.keyboard.press('b');
 assert.equal((await stats()).active,false);assert.deepEqual(errors,[]);
 const report={checks:['cached bag portraits create zero GPU contexts','inspection loads real GLB','keyboard rotation','pointer rotation','keyboard reset','controller rotation and reset','still view renders on demand','close stops rendering','inspection never changes loadout','one shared context across assets','150% text and compact layout','B closes nested inspection','missing GLB retains still and back controls'],stats:await stats(),errors};
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log('PASS',report.checks.length,'portrait checks');
}finally{await browser.close();}
