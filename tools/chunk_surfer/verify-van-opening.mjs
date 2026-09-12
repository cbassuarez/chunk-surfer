// Production opening acceptance. Isolated browser profile; warps only position
// to the van, then uses real E, pointer/keyboard controls, and persisted saves.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const base=process.env.GAME_URL||'http://127.0.0.1:5299';
const lens=process.env.LENS_URL||'ws://127.0.0.1:5298';
const out='artifacts/van-opening';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,protocolTimeout:180000,args:['--no-sandbox','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),errors=[],checks=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=fn=>page.waitForFunction(fn,{timeout:120000});
const top=()=>page.evaluate(()=>window.__scenes?.top()?.id||null);
const save=()=>page.evaluate(async()=>JSON.parse(JSON.stringify((await import('/src/game/save.js')).getSave())));
const press=async key=>{await page.keyboard.press(key);await sleep(180);};
const shot=name=>page.screenshot({path:`${out}/${name}.png`});
page.on('pageerror',error=>{errors.push(String(error.stack||error));console.log('PAGEERROR',String(error));});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
await page.setViewport({width:1280,height:760});

async function title(){
  await wait(()=>!!window.__scenes?.top()?.id);
  if(await top()==='eula')await press('Enter');
  await wait(()=>['opening-credits','title'].includes(window.__scenes?.top()?.id));
  if(await top()==='opening-credits')await page.evaluate(()=>window.__scenes.top().update(40));
  await wait(()=>window.__scenes?.top()?.id==='title');
}
async function openVan(){
  // Use the prop's actual interaction focus. This does not grant kit/progress.
  const positioned=await page.evaluate(()=>{
    for(const x of [63.6,63,62.5,62,64])for(const y of [208,207.5,208.5])for(const f of [1,0,2,3]){
      window.__probe.warpCell(x,y,f);
      if(window.__probe.interactionFocus().propId==='yard-van')return{x,y,f};
    }
    return null;
  });
  assert.ok(positioned,'van reached through a real interaction focus');
  await press('e');await wait(()=>window.__scenes?.top()?.id==='van-workbench');
  await wait(()=>window.__scenes?.top()?.debugState()?.stage?.ready);
  const stage=await page.evaluate(()=>window.__scenes.top().debugState().stage);
  assert.equal(stage.rendererCount,1,'one physical shelf renderer, not one context per item');
  assert.equal(stage.error,'');assert.equal(Object.keys(stage.models).length,7);
  assert.equal(stage.models.case,'field-case');assert.equal(stage.models.recorder,'field-recorder');
  assert.equal(stage.models.map,'map');assert.equal(stage.models.radio,'radio');assert.equal(stage.models.light,'light');
}
async function click(id){
  const point=await page.evaluate(id=>{
    const state=window.__scenes.top().debugState();
    const hit=state.hitRegions.find(hit=>hit.id===id);
    if(!hit)throw new Error(`No hit ${id}`);
    const canvas=[...document.querySelectorAll('canvas')].find(c=>c.style.zIndex==='8');
    const rect=canvas.getBoundingClientRect();
    return{x:rect.left+(hit.x+hit.w/2)/state.layout.size.cols*rect.width,
      y:rect.top+(hit.y+hit.h/2)/state.layout.size.rows*rect.height};
  },id);
  await page.mouse.click(point.x,point.y);await sleep(180);
}
async function choose(text){
  for(let i=0;i<40;i++){
    const view=await page.evaluate(()=>window.__scenes.top()?.view?.());
    if(view?.pending?.kind==='branch'){
      const index=view.pending.options.findIndex(option=>String(option.text||option.label).toLowerCase().includes(text));
      assert.ok(index>=0,`choice ${text}: ${JSON.stringify(view.pending.options)}`);
      // Branches enter at the first row; use the live selected index when present.
      const selected=view.pending.selectedIndex??view.pending.index??0;
      for(let j=selected;j<index;j++)await press('ArrowDown');
      for(let j=selected;j>index;j--)await press('ArrowUp');
      await press('Enter');return;
    }
    await press('Enter');
  }
  throw new Error(`No branch for ${text}`);
}
try{
  await page.goto(`${base}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&diffusion=${encodeURIComponent(lens)}`,{waitUntil:'domcontentloaded',timeout:60000});
  await title();await press('Enter');await press('Enter');
  await wait(()=>window.__chunkParity?.().screen==='game');
  assert.notEqual(await top(),'difficulty-select');
  let s=await save();const runId=s.run.id;
  assert.equal(s.flags['van.difficulty.pending'],true);assert.equal(!!s.flags['bag.taken'],false);
  checks.push('New Run reaches arrival without the old difficulty screen');
  await openVan();await shot('unpacked');
  await click('van:continue');assert.equal(await top(),'van-workbench');
  await click('van:case');s=await save();assert.equal(s.flags['bag.taken'],true);assert.equal(!!s.flags['map.taken'],false);
  await press('Escape');await press('b');
  assert.equal(await top(),'bag');
  const bag=await page.evaluate(()=>window.__scenes.top().debugState());
  assert.ok(Array.isArray(bag.model.sections));assert.equal(bag.model.map,null,'uncollected map has no player-facing plan');
  assert.match(bag.model.mapUnavailableReason,/van shelf/);
  assert.equal(bag.model.sections.find(section=>section.id==='map').entries.length,0,'no orphan mark actions without the instrument');
  assert.equal((bag.model?.sections?.find(section=>section.id==='kit')?.entries||[]).some(entry=>entry.sourceId==='map'),false);
  await shot('case-without-map');await press('Escape');
  await page.reload({waitUntil:'domcontentloaded'});await title();await press('Enter');
  await wait(()=>window.__chunkParity?.().screen==='game');
  s=await save();assert.equal(s.run.id,runId);assert.equal(s.flags['bag.taken'],true);assert.equal(!!s.flags['map.taken'],false);
  checks.push('Partial pickup survives a real reload without granting the map or difficulty');
  await openVan();await click('van:map');await click('van:difficulty');
  assert.equal(await top(),'difficulty-select');await press('Enter');
  assert.equal(await top(),'van-workbench');s=await save();assert.equal(s.flags['van.difficulty.pending'],true);
  assert.ok(s.vanPreparation.difficulty);assert.equal(!!s.flags['kit.fitted'],false);
  await click('van:object:microphone');
  assert.equal(await page.evaluate(()=>window.__scenes.top().debugState().pickedObject),'microphone');
  await click('van:kit:microphone:directional');
  await click('van:group:headphones');await click('van:kit:headphones:closed');
  await click('van:group:recorder');await click('van:kit:recorder:headroom');
  await click('van:group:faceplate');await click('van:kit:faceplate:olive');
  await click('van:group:buttons');await click('van:kit:buttons:signal');
  await click('van:group:vfd');await click('van:kit:vfd:amber');
  await wait(()=>window.__scenes?.top()?.debugState()?.stage?.ready);
  const fittedStage=await page.evaluate(()=>window.__scenes.top().debugState().stage);
  assert.equal(fittedStage.models.headphones,'headphones-closed');
  assert.equal(fittedStage.models.microphone,'microphone-directional');
  checks.push('Seven independent GLBs load in one physical shelf; actual object clicks and hardware swaps change the fitted models');
  await shot('fitted');
  await click('van:inspect:map');await wait(()=>window.__scenes.top()?.view?.().inspection?.ready);
  await shot('survey-indicator');await press('ArrowRight');await press('Escape');
  await click('van:continue');assert.equal(await top(),'thought:van-kit');
  s=await save();assert.equal(s.flags['van.difficulty.pending'],false);assert.equal(s.flags['kit.fitted'],true);
  assert.equal(s.run.id,runId);assert.equal(s.fieldKit.microphone,'directional');
  const duration=await page.evaluate(async()=>(await import('/src/game/recordist.js')).takeDuration());
  assert.ok(Math.abs(duration-49.5)<1e-6);checks.push('Fitted hardware reaches real recordist configuration; draft finalizes once at packing');
  await choose('strap');await choose('survey note');await choose('spanner');await choose('side pocket');
  await choose('badge');await choose('clip it');await choose("that's everything");
  for(let i=0;i<12&&await top()==='thought:van-kit';i++)await press('Enter');
  await wait(()=>window.__probe.vanDoors().shut);
  await sleep(2000);const doors=await page.evaluate(()=>window.__probe.vanDoors());
  assert.equal(doors.open,0);assert.equal(doors.waypoint,'story:lodge');
  s=await save();assert.equal(s.flags['badge.taken'],true);assert.equal(s.flags['van.spanner.taken'],true);assert.equal(s.flags['van.survey-note.read'],true);
  await shot('departed');checks.push('Authored lore and optional spanner/badge choices complete, then doors close without another E');
  await press('b');assert.equal(await top(),'bag');await shot('packed-case');await press('Escape');
  await page.reload({waitUntil:'domcontentloaded'});await title();await press('Enter');await wait(()=>window.__chunkParity?.().screen==='game');
  s=await save();assert.equal(s.run.id,runId);assert.equal(s.flags['van.closed'],true);assert.equal(s.fieldKit.cosmetics.faceplate,'olive');
  assert.equal(s.flags['van.difficulty.pending'],false);checks.push('Finished equipment, cosmetics, difficulty and closed doors survive reload');
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({checks,pageErrors:errors,runId,gear:s.fieldKit,doors},null,2)+'\n');
  console.log(JSON.stringify({checks,pageErrors:errors},null,2));
}catch(error){console.error(error.stack);await shot('failure');console.log('TOP',await top());process.exitCode=1;}
finally{await browser.close();}
