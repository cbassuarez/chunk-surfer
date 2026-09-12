import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5296',output='artifacts/kit-inspection';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
const fixture=`${base}/__kit_inspection_fixture.html`;
await page.setRequestInterception(true);
page.on('request',request=>request.url()===fixture?request.respond({status:200,contentType:'text/html',body:'<!doctype html><html><style>html,body{margin:0;background:#101713}#stage{position:relative;width:100vw;height:100vh}</style><div id="stage"></div></html>'}):request.continue());
try{
 await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
 await page.goto(fixture,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const ui=await import('/src/render/ui.js'),scenes=await import('/src/game/scenes.js');
  const {makeItemInspectionScene}=await import('/src/game/item-inspection-scene.js');
  // Vite may timestamp a dependency after an edit. Resolve the same loaded
  // module as the scene so the shared-renderer counters are not a fresh copy.
  const inspectionUrl=performance.getEntriesByType('resource').map(entry=>entry.name)
   .filter(url=>/\/src\/game\/item-inspection\.js(?:\?|$)/.test(url)).at(-1)||'/src/game/item-inspection.js';
  const {itemInspectionStats}=await import(inspectionUrl);
  const {fieldKitInspection}=await import('/src/game/field-kit.js');
  const {normalizeEquipment}=await import('/src/game/bag-model.js');
  ui.uiInit(document.querySelector('#stage'));
  window.kitInspector={ui,scenes,stats:itemInspectionStats,open(kit,group){
   const details=group==='case'?{id:'field-case',title:'FIELD CASE / NOT YET TAKEN',nodeRotations:{'open-lid-hinge':[Math.PI/2,0,0]},hiddenNodes:['lid-retaining-strap']}:fieldKitInspection(kit,group);
   const entry=normalizeEquipment({...details,present:true});
   this.entry=entry;this.scene=makeItemInspectionScene(entry);scenes.replace(this.scene);
  },draw(){ui.uiClear();scenes.render();}};
  document.addEventListener('keydown',e=>{e.preventDefault();scenes.key(e);window.kitInspector.draw();});
 });
 const cases=[
  {name:'recorder-black-signal-amber',group:'recorder',kit:{cosmetics:{faceplate:'black',buttons:'signal',vfd:'amber'}}},
  {name:'recorder-olive-seaglass-ice',group:'recorder',kit:{cosmetics:{faceplate:'olive',buttons:'sea-glass',vfd:'ice'}}},
  {name:'recorder-aluminum-restored',group:'recorder',kit:{}},
  {name:'flashlight-longthrow-ivory',group:'flashlight',kit:{flashlight:'throw',cosmetics:{flashlightHousing:'ivory'}}},
  {name:'case-closed',group:'case',kit:{}},
 ];
 for(const item of cases){
  await page.evaluate(({kit,group})=>window.kitInspector.open(kit,group),item);
  await page.waitForFunction(()=>window.kitInspector.scene.view().inspection.ready||window.kitInspector.scene.view().inspection.failed,{timeout:15000});
  await page.evaluate(()=>window.kitInspector.draw());
  const state=await page.evaluate(()=>({view:window.kitInspector.scene.view(),stats:window.kitInspector.stats(),source:window.kitInspector.entry.source}));
  assert.equal(state.view.inspection.ready,true);assert.equal(state.view.inspection.failed,false);assert.equal(state.stats.contexts,1);
  const screenshot=`${output}/${item.name}.png`;await page.screenshot({path:screenshot});
  await page.keyboard.press('ArrowRight');
  const rotated=await page.evaluate(()=>window.kitInspector.scene.view().inspection.yaw);assert.ok(rotated>state.view.inspection.yaw);
  await page.keyboard.press('r');assert.equal(await page.evaluate(()=>window.kitInspector.scene.view().inspection.yaw),0);
  results.push({name:item.name,state,screenshot});console.log(`Inspected ${item.name}`);
 }
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.kitInspector.stats().active),false);
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/report.json`,JSON.stringify({scope:'Production generic inspector with isolated equipment fixtures; same-model cosmetic changes, selected flashlight identity, closed-case pose, keyboard orbit/reset/close.',results,pageErrors:errors},null,2));
 console.log(`PASS ${results.length} generic inspection cases; no page errors.`);
}catch(error){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await browser.close();}
