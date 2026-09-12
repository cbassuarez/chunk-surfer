// Actual main.js integration, using a fresh disposable Chromium profile. The
// probe seeds progression only; clicks/wheel/key events go through live input.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5296',out='artifacts/survey-console';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=()=>page.evaluate(()=>window.__scenes.top()?.debugState?.());
const shot=async name=>{await pause(250);await page.screenshot({path:`${out}/${name}.png`});};
async function client(point){return page.evaluate(point=>{const s=window.__scenes.top().debugState().viewport,r=document.getElementById('map').getBoundingClientRect();return{x:r.x+point.x/s.cols*r.width,y:r.y+point.y/s.rows*r.height};},point);}
async function click(id){const h=(await state()).hitRegions.find(h=>h.id===id);assert.ok(h,`live hit ${id}`);const p=await client({x:h.x+h.w/2,y:h.y+h.h/2});await page.mouse.click(p.x,p.y);await pause(120);}
try{
 await page.setViewport({width:1600,height:1050,deviceScaleFactor:1});
 await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
 await page.goto(`${base}/?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__probe?.bagOpen&&window.__scenes?.top()?.id,{timeout:60000});
 await page.evaluate(()=>{
  window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.tutSkip();
  window.__probe.setFlags(['bag.taken','map.taken','van.preparation.v1','title.shown','setup.levels','combat.trained','setup.waypoint',
    'setup.case.started','setup.case.opened','setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived']);
  window.__probe.bagOpen('map');
 });
 await page.waitForFunction(()=>window.__scenes.top()?.debugState?.()?.mapPresentation?.layout,{timeout:60000});
 await pause(600);
 const initial=await state();assert.equal(initial.nav.sectionId,'map');assert.ok(initial.model.map.architecture.stats.spans>50000);
 assert.equal(initial.hitRegions.filter(h=>h.kind==='map-control').length,16);
 await shot('live-stack');
 await click('bag:floor:b1');await click('bag:map:view-floor');
 // Select the actual issued B3 marker/polygon. Only SET owns the mutation.
 const before=(await state()).model.map.playerWaypoint;
 const s=await state(),space=s.mapPresentation.hits.find(h=>h.spaceId==='space:main_b3'||h.id==='bag:space:space:main_b3');
 assert.ok(space,'Studio B3 real room hit');
 const p=await client(space.point||{x:space.x+space.w/2,y:space.y+space.h/2});await page.mouse.click(p.x,p.y);await pause(120);
 assert.equal((await state()).mapSelected.roomId,'main_b3');assert.deepEqual((await state()).model.map.playerWaypoint,before);
 await click('bag:map:set-target');assert.equal((await state()).model.map.playerWaypoint?.roomId,'main_b3');
 await page.keyboard.press('Enter');assert.equal((await state()).model.map.playerWaypoint?.roomId,'main_b3');
 await shot('live-b3-target');
 await click('bag:map:clear-target');assert.equal((await state()).model.map.playerWaypoint,null);
 await page.keyboard.press('F6');assert.ok((await state()).mapNav.focusedControlId);
 await page.keyboard.press('ArrowRight');await shot('live-console-focus');
 await page.keyboard.press('Escape');assert.equal((await state()).mapNav.focusedControlId,null);
 const view=(await state()).mapPresentation.layout.mapViewport,at=await client({x:view.x+view.w*.5,y:view.y+view.h*.5});
 const zoom=(await state()).mapNav.zoom;await page.mouse.move(at.x,at.y);await page.mouse.wheel({deltaY:-120});await pause(150);assert.ok((await state()).mapNav.zoom>zoom);
 await click('bag:map:reset-view');await click('bag:floor:u1');await click('bag:map:view-floor');await shot('live-upper');
 // Inspect the actual forced B3 beat and its external leader; seed only the
 // preceding completed skills beat, then use the normal SET / CLOSE inputs.
 await page.keyboard.press('b');
 await page.evaluate(()=>{window.__probe.setFlags([],['setup.waypoint','setup.case.closed','setup.case.arrived']);window.__probe.bagOpen('map');});
 await pause(300);assert.equal(await page.evaluate(()=>window.__probe.setupHandoff().stage),'mark');
 await shot('live-guided-mark');
 await click('bag:map:set-target');assert.equal(await page.evaluate(()=>window.__probe.setupHandoff().stage),'close');
 await shot('live-guided-close');
 await page.keyboard.press('b');assert.equal(await page.evaluate(()=>window.__probe.setupHandoff().stage),'follow');
 assert.notEqual(await page.evaluate(()=>window.__scenes.top()?.id),'bag');
 assert.equal(await page.evaluate(()=>window.__probe.flag('setup.waypoint')),true);
 const guidance=await page.evaluate(()=>window.__probe.map().playerWaypoint);assert.equal(guidance.roomId,'main_b3');
 await shot('live-follow-bearing');
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/live-report.json`,JSON.stringify({scope:'Actual main.js and compiled building in disposable browser profile; probe-seeded progression, real mouse/keyboard/wheel dispatch; native gamepad not tested.',stats:initial.model.map.architecture.stats,guideStage:'follow',guidance,pageErrors:errors},null,2)+'\n');
 console.log('Live survey console: real geometry, input, waypoint authority and guided B3 handoff passed.');
}catch(error){await shot('live-failure');console.error(error.stack);console.error(JSON.stringify(await page.evaluate(()=>({top:window.__scenes?.top()?.id,bag:window.__probe?.bag?.(),setup:window.__probe?.setupHandoff?.()}))));process.exitCode=1;}
finally{await browser.close();}
