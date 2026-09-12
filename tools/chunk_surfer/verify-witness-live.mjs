// Actual main.js integration in a disposable browser profile. Ending history
// and tutorial completion are explicitly seeded fixtures, not full-play claims.
// Van entry, pickups, selection, inspection, fitting and carried inspection use
// real mouse/keyboard events against the live scene's rendered hit regions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const base=process.env.GAME_URL||'http://127.0.0.1:5296',out='artifacts/witness-edition/live';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),errors=[],checks=[],snapshots={};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const top=()=>page.evaluate(()=>window.__scenes?.top()?.id||null);
const press=async key=>{await page.keyboard.press(key);await sleep(200);};
const wait=fn=>page.waitForFunction(fn,{timeout:45000});
const state=()=>page.evaluate(()=>window.__scenes.top()?.debugState?.()||window.__scenes.top()?.view?.()||null);
const shot=async name=>{await page.screenshot({path:`${out}/${name}.png`});console.log('CAPTURE',name);};
page.on('pageerror',error=>{errors.push(error.stack||String(error));console.error('PAGEERROR',String(error));});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
await page.setViewport({width:1280,height:760,deviceScaleFactor:1});
async function click(id){
  const point=await page.evaluate(async id=>{
    const scene=window.__scenes.top(),state=scene.debugState?.()||scene.view?.();
    const hit=(state.hitRegions||state.layout?.buttons||[]).find(region=>region.id===id);
    if(!hit)throw new Error(`Missing ${id} in ${scene.id}: ${(state.hitRegions||state.layout?.buttons||[]).map(r=>r.id).join(', ')}`);
    const size=(await import('/src/render/ui.js')).uiSize();
    const canvas=[...document.querySelectorAll('canvas')].find(c=>c.style.zIndex==='8'),rect=canvas.getBoundingClientRect();
    return{x:rect.left+(hit.x+hit.w/2)/size.cols*rect.width,y:rect.top+(hit.y+hit.h/2)/size.rows*rect.height};
  },id);
  await page.mouse.click(point.x,point.y);await sleep(230);
}
async function openVan(){
  const point=await page.evaluate(()=>{
    for(const x of [63.6,63,62.5,62,64])for(const y of [208,207.5,208.5])for(const f of [1,0,2,3]){
      window.__probe.warpCell(x,y,f);if(window.__probe.interactionFocus().propId==='yard-van')return{x,y,f};
    }return null;
  });
  assert.ok(point,'actual van interaction focus found');await press('e');await wait(()=>window.__scenes.top()?.id==='van-workbench');
  await wait(()=>window.__scenes.top()?.debugState?.().stage.ready);await sleep(200);
}
async function seedEndings(ids){
  await page.evaluate(ids=>window.__probe.metaCommit({endingsSeen:ids,cosmetics:{unlocked:[],selected:null}}),ids);
}
try{
  await page.goto(`${base}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await wait(()=>window.__probe?.testRun&&window.__scenes?.top()?.id);
  await page.waitForFunction(()=>['eula','opening-credits','title'].includes(window.__scenes.top()?.id),{timeout:120000});
  // Do not accept the EULA or launch lens calibration. The existing diagnostic
  // testRun removes the boot gate and restores the real building runtime.
  await page.evaluate(async()=>{
    window.__probe.testRun();
    const save=await import('/src/game/save.js');save.newGame({prepareInVan:true});
    window.__probe.tutSkip();
    const current=save.getSave(),flags={...current.flags};
    for(const key of ['van.closed','kit.fitted','bag.taken','map.taken'])delete flags[key];
    save.saveCommit({flags});
  });
  await seedEndings([]);await openVan();await click('van:group:faceplate');
  snapshots.hidden=await state();
  assert.equal(snapshots.hidden.state.witness.visible,false);
  assert.ok(!snapshots.hidden.hitRegions.some(r=>r.id==='van:kit:faceplate:witness'));
  assert.ok(!snapshots.hidden.stage.models.witness);
  checks.push('Zero seeded endings: Witness selector and physical sleeve absent');
  await shot('zero-endings');await press('Escape');

  await seedEndings(['sacrifice']);await openVan();await click('van:group:faceplate');
  snapshots.locked=await state();assert.equal(snapshots.locked.state.witness.count,1);
  assert.ok(snapshots.locked.hitRegions.some(r=>r.id==='van:kit:faceplate:witness'));
  assert.ok(!snapshots.locked.stage.models.witness);
  await click('van:kit:faceplate:witness');await wait(()=>window.__scenes.top()?.id==='witness-inspection'&&window.__scenes.top()?.view?.().ready);
  snapshots.lockedInspection=await state();assert.equal(snapshots.lockedInspection.canFit,false);
  assert.ok(!snapshots.lockedInspection.layout.buttons.some(button=>button.id==='fit'));
  await shot('one-ending-preview');await press('t');assert.notEqual((await state()).yaw,snapshots.lockedInspection.yaw);
  await press('Escape');assert.equal(await top(),'van-workbench');await press('Escape');
  checks.push('One seeded ending: visible locked preview, actual 3D turn-over, no fit action or sleeve');

  await seedEndings(['sacrifice','helped']);await openVan();
  await wait(()=>window.__scenes.top()?.debugState?.().stage.models.witness==='witness-faceplate');
  await wait(()=>window.__scenes.top()?.debugState?.().hitRegions.some(r=>r.id==='van:inspect:witness'));
  snapshots.owned=await state();assert.equal(snapshots.owned.state.bagTaken,false);
  await shot('two-endings-sleeve');
  await click('van:inspect:witness');await wait(()=>window.__scenes.top()?.view?.().ready);
  assert.equal((await state()).canFit,false,'owned reward still needs the physical case');
  assert.equal((await state()).fittingNotice,'TAKE THE FIELD CASE BEFORE FITTING.');
  await shot('case-required');await press('Escape');await click('van:case');
  assert.equal((await state()).state.bagTaken,true);
  await click('van:group:buttons');await click('van:kit:buttons:signal');
  await click('van:group:vfd');await click('van:kit:vfd:amber');
  await click('van:group:recorder');await click('van:kit:recorder:headroom');
  snapshots.beforeFit=(await state()).state.fieldKit;
  await click('van:inspect:witness');await wait(()=>window.__scenes.top()?.id==='witness-inspection'&&window.__scenes.top()?.view?.().ready);
  snapshots.fitInspection=await state();assert.equal(snapshots.fitInspection.canFit,true);
  await shot('owned-inspection');
  if((await state()).mode!=='plate')await click('model');
  await sleep(200);await shot('replacement-faceplate');
  await click('turn');await sleep(200);await shot('replacement-back');
  await click('reset');await click('model');await sleep(200);assert.equal((await state()).mode,'recorder');await shot('owned-recorder');
  await click('fit');
  await wait(()=>window.__scenes.top()?.id==='van-workbench'&&window.__scenes.top()?.debugState?.().stage.models.recorder==='field-recorder-witness');
  await wait(()=>window.__scenes.top()?.debugState?.().stage.ready);await sleep(300);
  snapshots.fitted=await state();
  assert.equal(snapshots.fitted.state.fieldKit.cosmetics.faceplate,'witness');assert.ok(!snapshots.fitted.stage.models.witness);
  assert.deepEqual(snapshots.fitted.state.fieldKit,{...snapshots.beforeFit,cosmetics:{...snapshots.beforeFit.cosmetics,faceplate:'witness'}});
  snapshots.meta=await page.evaluate(()=>window.__probe.meta());
  assert.equal(snapshots.meta.cosmetics.selected,'witness');assert.ok(snapshots.meta.cosmetics.unlocked.includes('witness'));
  await shot('fitted-workbench');
  checks.push('Two seeded endings: independent sleeve on live shelf, real case pickup, physical inspect/plate/turn/fit replaces recorder GLB and persists only finish');
  await press('Escape');
  // Complete only the guided-bag prerequisite flags, so this acceptance can
  // inspect carried equipment without pretending it played the practice fight.
  await page.evaluate(()=>window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','setup.case.started','setup.case.opened',
    'setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived']));
  await press('b');await wait(()=>window.__scenes.top()?.id==='bag');await sleep(200);
  const entry=await page.evaluate(()=>window.__scenes.top().debugState().model.sections.find(s=>s.id==='kit').entries.find(e=>e.sourceId==='recorder'));
  assert.ok(entry,'real fitted recorder is listed in carried equipment');
  await click(`bag:item:${entry.id}`);await click('bag:action:inspect-item');
  await wait(()=>window.__scenes.top()?.id==='witness-inspection'&&window.__scenes.top()?.view?.().ready);
  snapshots.carried=await state();assert.equal(snapshots.carried.canFit,false);assert.equal(snapshots.carried.owned,true);
  await shot('carried-inspection');await press('Escape');assert.equal(await top(),'bag');await press('b');
  checks.push('Closing and reopening the actual Bag uses fitted Witness inspection, owned but with no remote fitting action');
  await press('r');
  if(await top()==='recorder'){await sleep(250);await shot('live-recorder');checks.push('Actual R recorder scene renders fitted Witness finish');}
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({base,scope:'Production main.js scenes; seeded ending history and setup prerequisites, not full ending playthroughs.',checks,errors,snapshots},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}catch(error){
  console.error(error.stack);await shot('failure');console.log('TOP',await top());console.log('STATE',JSON.stringify(await state()));
  await writeFile(`${out}/failure.json`,JSON.stringify({checks,errors,snapshots,state:await state(),error:String(error.stack)},null,2));process.exitCode=1;
}finally{await browser.close();}
