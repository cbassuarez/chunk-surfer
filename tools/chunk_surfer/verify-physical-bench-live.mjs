// Disposable real-game acceptance. Boot/tutorial state is a declared fixture;
// van pickup, physical selections, replacement, choices and Bag use real input.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5296',out='artifacts/physical-bench/live';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  protocolTimeout:120000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),errors=[],checks=[],snapshots={};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const top=()=>page.evaluate(()=>window.__scenes?.top()?.id||null);
const state=()=>page.evaluate(()=>window.__scenes.top()?.debugState?.()||window.__scenes.top()?.view?.()||null);
const press=async key=>{await page.keyboard.press(key);await sleep(220);};
const wait=fn=>page.waitForFunction(fn,{timeout:45000});
const shot=async name=>{await page.screenshot({path:`${out}/${name}.png`});console.log('CAPTURE',name);};
page.on('pageerror',error=>{errors.push(error.stack||String(error));console.error('PAGEERROR',String(error));});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
async function click(id){
  const point=await page.evaluate(async id=>{
    const scene=window.__scenes.top(),view=scene.debugState?.()||scene.view?.();
    const hits=view.hitRegions||view.layout?.buttons||[],hit=hits.find(region=>region.id===id);
    if(!hit)throw new Error(`Missing ${id} in ${scene.id}: ${hits.map(r=>r.id).join(', ')}`);
    const size=(await import('/src/render/ui.js')).uiSize();
    const canvas=[...document.querySelectorAll('canvas')].find(c=>c.style.zIndex==='8'),rect=canvas.getBoundingClientRect();
    return{x:rect.left+(hit.x+hit.w/2)/size.cols*rect.width,y:rect.top+(hit.y+hit.h/2)/size.rows*rect.height};
  },id);
  await page.mouse.click(point.x,point.y);await sleep(280);
}
async function openVan(){
  const point=await page.evaluate(()=>{
    for(const x of [63.6,63,62.5,62,64])for(const y of [208,207.5,208.5])for(const f of [1,0,2,3]){
      window.__probe.warpCell(x,y,f);if(window.__probe.interactionFocus().propId==='yard-van')return{x,y,f};
    }return null;
  });
  assert.ok(point,'van world focus found');await press('e');await wait(()=>window.__scenes.top()?.id==='van-workbench');
  await wait(()=>window.__scenes.top()?.debugState?.().stage.ready);await sleep(300);
}
async function select(group,option){await click(`van:object:variant:${group}:${option}`);}
try{
  await page.goto(`${base}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await wait(()=>window.__probe?.testRun&&window.__scenes?.top()?.id);
  await page.waitForFunction(()=>['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:60000});
  console.log('BOOT READY',await top());
  await page.evaluate(async()=>{
    window.__probe.testRun();
    // Vite may stamp an edited dependency URL. Import the exact module used
    // by main, never a second unstamped save singleton in the proof fixture.
    const saveUrl=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname==='/src/game/save.js')?.name;
    const save=window.__benchLiveSave=await import(saveUrl||'/src/game/save.js');
    save.newGame({prepareInVan:true});window.__probe.tutSkip();
    const current=save.getSave(),flags={...current.flags};
    for(const key of Object.keys(flags))if(['van.closed','kit.fitted','bag.taken','map.taken','van.spanner.taken','van.spanner.decided','van.difficulty.confirmed'].includes(key)||key.startsWith('van.packed.'))delete flags[key];
    flags['van.bench.v2']=true;flags['van.difficulty.pending']=true;
    save.saveCommit({flags,vanPreparation:null});window.__probe.metaCommit({endingsSeen:[],cosmetics:{unlocked:[],selected:null}});
    window.__probe.setFlags(['van.preparation.v1','van.bench.v2','van.difficulty.pending'],
      ['van.closed','kit.fitted','bag.taken','map.taken','prologueDone','combat.trained','van.run-started','van.difficulty.chosen']);
  });
  await openVan();snapshots.initial=await state();
  assert.equal(snapshots.initial.stage.caseOpen,false);
  assert.deepEqual(snapshots.initial.stage.glowing.sort(),['case','difficulty','map']);
  for(const group of ['headphones','microphone','recorder','flashlight']){
    const variants=Object.keys(snapshots.initial.stage.models).filter(key=>key.startsWith(`variant:${group}:`));
    assert.equal(variants.length,3,`${group} has all three physical models`);
    for(const key of variants)assert.equal(snapshots.initial.stage.destinations[key],'bench');
  }
  assert.deepEqual(snapshots.initial.state.packedGroups,[]);
  await shot('closed-case-all-gear');
  await select('flashlight','throw');assert.deepEqual((await state()).state.packedGroups,[],'cannot pack before taking case');
  await click('van:inspect:field-case');await wait(()=>window.__scenes.top()?.view?.().inspection?.ready);
  await shot('closed-case-inspection');await press('Escape');
  await click('van:spanner');assert.equal((await state()).focusId,'van:spanner:no');await shot('spanner-choice');
  await press('Enter');assert.equal((await state()).state.spannerTaken,false);assert.equal((await state()).state.spannerDecided,true);
  checks.push('Untaken closed case, map and unsigned shift glow; all hardware variants visible; no packing before case; optional spanner defaults No.');
  await click('van:object:case');await wait(()=>window.__scenes.top()?.debugState?.().stage.caseOpen);
  snapshots.open=await state();assert.deepEqual(snapshots.open.state.packedGroups,[]);
  assert.equal(snapshots.open.stage.destinations.recorder,'case');assert.equal(snapshots.open.stage.destinations.radio,'case');
  assert.ok(!snapshots.open.stage.glowing.includes('case'));await shot('open-empty-case');
  await click('van:object:map');assert.equal((await state()).state.mapTaken,true);
  await click('van:difficulty');assert.equal(await top(),'difficulty-select');await press('Enter');
  await wait(()=>window.__scenes.top()?.id==='van-workbench');assert.equal((await state()).state.difficultyConfirmed,true);
  await select('headphones','open');await select('microphone','directional');
  await select('recorder','low-draw');
  assert.equal((await state()).stage.destinations['variant:recorder:low-draw'],'case');
  await select('recorder','headroom');
  assert.equal((await state()).stage.destinations['variant:recorder:low-draw'],'bench');
  assert.equal((await state()).stage.destinations['variant:recorder:headroom'],'case');
  await select('flashlight','flood');await select('flashlight','throw');
  assert.equal((await state()).stage.destinations['variant:flashlight:flood'],'bench');
  assert.equal((await state()).stage.destinations['variant:flashlight:throw'],'case');
  await click('van:group:flashlightHousing');await click('van:kit:flashlightHousing:ivory');
  await select('faceplate','black');await select('faceplate','olive');
  assert.equal((await state()).stage.destinations['variant:faceplate:black'],'bench');
  assert.equal((await state()).stage.destinations['variant:faceplate:olive'],'device');
  await click('van:spanner');await click('van:spanner:yes');
  snapshots.packed=await state();assert.equal(snapshots.packed.state.spannerTaken,true);
  assert.equal(snapshots.packed.stage.destinations.spanner,'case');
  assert.equal(snapshots.packed.state.packedGroups.length,4);assert.deepEqual(snapshots.packed.stage.glowing,[]);
  await click('van:group:flashlight');await shot('packed-case');
  checks.push('Real physical picking packs four selected models; replaced amp/light return to bench; fitted plate leaves bench; shell persists; spanner Yes packs optional tool.');
  await click('van:inspect:flashlight-throw');await wait(()=>window.__scenes.top()?.view?.().inspection?.ready);
  assert.equal((await state()).inspection.id,'flashlight-throw');await shot('selected-flashlight-inspection');await press('Escape');
  await press('Escape');await openVan();snapshots.reopened=await state();
  assert.deepEqual(snapshots.reopened.state.fieldKit,snapshots.packed.state.fieldKit);
  assert.deepEqual(snapshots.reopened.state.packedGroups,snapshots.packed.state.packedGroups);
  assert.equal(snapshots.reopened.state.spannerTaken,true);
  await page.setViewport({width:960,height:640,deviceScaleFactor:1});await sleep(500);await shot('packed-compact');
  const compact=await state();for(const region of compact.hitRegions){assert.ok(region.x>=0&&region.y>=0);assert.ok(region.x+region.w<=compact.layout.size.cols+.1&&region.y+region.h<=compact.layout.size.rows+.1,region.id);}
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});await sleep(300);
  await page.reload({waitUntil:'domcontentloaded'});
  await wait(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id));
  await page.evaluate(async()=>{
    window.__probe.testRun();window.__probe.tutSkip();window.__probe.setFlags([],['prologueDone']);
    const url=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname==='/src/game/save.js')?.name;
    window.__benchLiveSave=await import(url||'/src/game/save.js');
  });
  await openVan();snapshots.reloaded=await state();
  assert.deepEqual(snapshots.reloaded.state.fieldKit,snapshots.packed.state.fieldKit);
  assert.deepEqual(snapshots.reloaded.state.packedGroups,snapshots.packed.state.packedGroups);
  assert.equal(snapshots.reloaded.state.spannerTaken,true);assert.equal(snapshots.reloaded.state.difficultyConfirmed,true);
  await shot('reloaded-packed-case');
  await click('van:continue');
  const final=await page.evaluate(()=>window.__benchLiveSave.getSave());
  assert.equal(final.flags['kit.fitted'],true);assert.equal(final.flags['van.difficulty.pending'],false);
  snapshots.finalKit=final.fieldKit;
  // Declared dialogue/setup fixture: Bag proof should not pretend it played
  // the practice fight or selected the remaining authored van lore branches.
  await page.evaluate(()=>{
    for(let i=0;i<8&&window.__scenes.top();i++)window.__scenes.pop();
    window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','setup.case.started','setup.case.opened',
      'setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived']);
  });
  await press('b');await wait(()=>window.__scenes.top()?.id==='bag');await sleep(250);
  const kit=await page.evaluate(()=>window.__scenes.top().debugState().model.sections.find(s=>s.id==='kit').entries);
  const light=kit.find(entry=>entry.sourceId==='light'),amp=kit.find(entry=>entry.sourceId==='amp-headroom');
  assert.equal(light.source.modelId,'flashlight-throw');assert.ok(amp,'selected amp has its own Bag entry');
  assert.ok(light.source.materialColors['flashlight-housing']);
  await click(`bag:item:${light.id}`);await shot('carried-flashlight');await click('bag:action:inspect-item');
  await wait(()=>window.__scenes.top()?.debugState?.().route?.inspection?.ready);assert.equal((await state()).route.inspection.id,'flashlight-throw');
  await shot('carried-flashlight-inspection');
  checks.push('Reopening and browser reload preserve packing and choices; compact controls remain on-screen; Continue finalizes real kit; Bag carries actual selected amp/light models.');
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({base,scope:'Production scenes; tutorial/boot and final Bag prerequisites are seeded fixtures, not a full playthrough.',checks,errors,snapshots},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}catch(error){console.error(error.stack);await shot('failure');console.log('TOP',await top());
  await writeFile(`${out}/failure.json`,JSON.stringify({checks,errors,snapshots,state:await state(),error:String(error.stack)},null,2));process.exitCode=1;
}finally{await browser.close();}
