// Authored bench fight -> live patch bay -> actual B3 map mark. Disposable
// browser save + mock lens. God hooks stage the room and test arrival identity;
// they do not complete combat, grant its reward, patch a skill or mark the map.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const base=process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5297';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
const page=await browser.newPage(),errors=[],lessons=new Set();
page.on('pageerror',error=>{errors.push(error.stack||error.message);console.error('PAGEERROR',error.message);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=fn=>page.waitForFunction(fn,{timeout:120000});
const bag=()=>page.evaluate(()=>window.__scenes.top()?.debugState?.());
const handoff=()=>page.evaluate(()=>window.__probe.setupHandoff());
const scene=()=>page.evaluate(()=>({id:window.__scenes.top()?.id,battle:window.__scenes.top()?.battleView?.()}));
async function levelCheck(){
  await page.keyboard.press('r');
  let observedSeconds=0,held=false,slowRead=false;
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const value=await page.evaluate(()=>({id:window.__scenes.top()?.id,rec:window.__probe.rec(),setup:window.__probe.setupHandoff()}));
    observedSeconds=Math.max(observedSeconds,value.rec.takeElapsed||0);
    if(value.id?.startsWith('battle:')){
      assert.equal(value.setup.flags['setup.levels'],true,'real R path finishes measurement before launching combat');
      assert.ok(observedSeconds>=5.8,'at least six actual clean seconds, not advancing text');
      assert.deepEqual(value.rec.takes,[],'calibration is never one of the five job takes');
      console.log('LEVELS',JSON.stringify({observedSeconds,held,slowRead}));return;
    }
    if(value.id==='setup-level-hold'&&!held){held=true;await shot('real-level-hold');}
    if(process.env.TUTORIAL_SLOW_READING==='1'&&value.rec.recording&&!slowRead){
      // Actual world time; scene.update cannot fabricate the recorder's clock.
      slowRead=true;await sleep(46500);
      const after=await page.evaluate(()=>({rec:window.__probe.rec(),setup:window.__probe.setupHandoff(),presence:window.__probe.presence()}));
      assert.deepEqual(after.rec.takes,[],'slow reading cannot count loading_dock as a job take');
      assert.equal(after.setup.flags['setup.levels'],true);assert.equal(after.presence.active,false,'measurement does not wake Presence');
      observedSeconds=6;console.log('SLOW READER',JSON.stringify({seconds:46.5,takes:after.rec.takes,presence:after.presence.active}));
    }
    // The authored level-check menus offer the practical next step as option 2.
    // Numeric choice is ignored during text. Continue never fakes elapsed time.
    await page.keyboard.press('2');await page.keyboard.press('Enter');await sleep(30);
  }
  throw new Error('The real R / level-check / daydream path did not reach combat');
}
async function point(id){return page.evaluate(async id=>{
  const hit=window.__scenes.top().debugState().hitRegions.find(r=>r.id===id);
  if(!hit)throw new Error(`Missing target ${id}`);
  const size=(await import('/src/render/ui.js')).uiSize(),rect=document.getElementById('map').getBoundingClientRect();
  return{x:rect.left+(hit.x+hit.w*.5)/size.cols*rect.width,y:rect.top+(hit.y+hit.h*.5)/size.rows*rect.height};
},id);}
async function click(id){const p=await point(id);await page.mouse.click(p.x,p.y);await sleep(180);}
async function shot(name){await page.screenshot({path:`artifacts/tutorial${process.env.TUTORIAL_SLOW_READING==='1'?'-slow':''}-${name}.png`});}
async function pad(button){
  await page.evaluate(async()=>{
    if(window.__tutorialPad)return;
    window.__tutorialPad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
    (await import('/src/game/controller.js')).setControllerNavigatorForTest({getGamepads:()=>[window.__tutorialPad]});
  });
  await sleep(140);
  await page.evaluate(button=>{window.__tutorialPad.buttons[button]={pressed:true,value:1,touched:true};},button);
  await sleep(110);
  await page.evaluate(button=>{window.__tutorialPad.buttons[button]={pressed:false,value:0,touched:false};},button);
  await sleep(180);
}
async function assertTour(){
  const state=await bag(),tour=state.guidePresentation;
  assert.ok(tour?.callouts?.length,'visible guided callout');
  for(const callout of tour.callouts)assert.ok(callout.rect.x+callout.rect.w<tour.outer.x,'instruction is outside the modal');
  for(const target of tour.targets)assert.ok(state.hitRegions.some(hit=>hit.id===target.id),'highlight comes from a real clickable module');
}
async function fight(){
  let actions=0,won=false,parries=0,pressedResolution=false;
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const {id,battle:b}=await scene();
    if(id==='setup-field-case'){assert.ok(won,'ordinary coherence result won the fight');break;}
    if(!b){await sleep(60);continue;}
    if(b.state.result?.result==='lose')throw new Error('The taught sequence lost the rehearsal');
    if(b.state.result?.result==='win')won=true;
    if(b.tutorial?.id&&!lessons.has(b.tutorial.id)){
      lessons.add(b.tutorial.id);console.log('LESSON',b.tutorial.id,'composure',b.state.composure,'coherence',b.state.movementCoherence);
      await shot(`fight-${b.tutorial.id}`);
    }
    if(b.phase==='talk'){await page.keyboard.press('Enter');await sleep(110);continue;}
    if(b.phase==='move'){
      assert.equal(b.turnClock,null,'reading/choosing never times out');
      assert.ok(b.moves.some(move=>move.enabled),'lesson never strands the player with no moves');
      assert.ok(b.moves[b.selectedMove]?.enabled,'selected lesson move is usable');
      await page.keyboard.press('Enter');actions++;pressedResolution=false;await sleep(80);continue;
    }
    if(b.phase==='tool'){await page.keyboard.press('ArrowDown');await sleep(80);continue;}
    const p=b.resolution?.parry;
    if(p?.armed&&p.tier==='perfect'&&!pressedResolution){
      await page.keyboard.press('Enter');pressedResolution=true;parries++;
    }
    await sleep(24);
  }
  assert.equal((await scene()).id,'setup-field-case','result immediately holds the player for the Bag');
  assert.deepEqual([...lessons],['hold','expose','settle','monitor','tempo','parry','free']);
  assert.ok(actions>=7&&actions<30,`finite tutorial: ${actions} commitments`);
  console.log('FIGHT',JSON.stringify({actions,parryInputs:parries,won}));
}
try{
  await page.setViewport({width:1280,height:760,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  await page.goto(`${base}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`,{waitUntil:'domcontentloaded'});
  await wait(()=>!!window.__scenes?.top?.()?.id);
  if(await page.evaluate(()=>window.__scenes.top().id==='eula'))await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='opening-credits');await page.evaluate(()=>window.__scenes.top().update(30));
  await wait(()=>window.__scenes.top()?.id==='title');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='difficulty-select');await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='warning');await page.keyboard.press('Enter');await page.keyboard.press('n');
  await wait(()=>window.__chunkParity?.().screen==='game');
  await page.evaluate(()=>{
    window.__probe.testRun();window.__probe.godWarpGetIn();
    window.__probe.setFlags(['bag.taken','title.shown'],['setup.levels','combat.trained','setup.waypoint']);
    window.__probe.tutSkip();window.__probe.setComposure(40);
  });
  await levelCheck();
  await fight();await shot('open-case');
  assert.equal((await handoff()).stage,'open-bag');assert.equal((await handoff()).canLeave,false);
  const before=await page.evaluate(()=>window.__probe.pos());
  await page.keyboard.down('w');await sleep(400);await page.keyboard.up('w');
  assert.deepEqual(await page.evaluate(()=>window.__probe.pos()),before,'required field-case hold blocks locomotion');
  await pad(2);await wait(()=>window.__scenes.top()?.id==='bag');await sleep(220);
  assert.equal((await bag()).nav.sectionId,'kit');assert.equal((await handoff()).stage,'skills-tab');
  await assertTour();await shot('tour-skills-selector');
  await page.keyboard.press('b');assert.equal((await scene()).id,'bag','cannot skip required setup');
  await click('bag:tab:skills');assert.equal((await handoff()).stage,'skills');
  await assertTour();
  assert.equal((await bag()).workingBuild.unspent,1,'Contract grants its one lead after actual victory');
  await shot('skills-unpatched');
  const from=await point('bag:patch:supply:torch'),to=await point('bag:patch:input:skill:torch.afterimage');
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await page.mouse.up();await sleep(220);
  assert.deepEqual((await bag()).workingBuild.techniques,['torch.afterimage']);
  assert.equal((await handoff()).stage,'skills','patching does not dismiss the skill explanation');
  await page.setViewport({width:960,height:600});await sleep(350);await shot('skills-compact');
  await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1.5));await sleep(350);
  await assertTour();await shot('skills-large-text');
  await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1));await sleep(350);
  await click('bag:guide:continue');assert.equal((await handoff()).stage,'map-tab');
  await assertTour();await shot('tour-map-selector');
  const checkpoint=await page.evaluate(async()=>{const {saveLoad,getSave}=await import('/src/game/save.js');saveLoad();return getSave();});
  assert.equal(checkpoint.flags['setup.case.skills-done'],true);
  assert.deepEqual(checkpoint.combatBuild.techniques,['torch.afterimage'],'Continue saves both progression and the accepted patch');
  await click('bag:tab:map');assert.equal((await handoff()).stage,'mark');await shot('mark-b3');
  await assertTour();
  await click('bag:space:space:main_b3');await sleep(220);
  assert.equal((await handoff()).markedRoom,'main_b3');assert.equal((await handoff()).stage,'close');
  await assertTour();await shot('tour-close');
  await pad(2);await sleep(350);
  assert.equal((await handoff()).stage,'follow');assert.equal((await handoff()).canLeave,true);
  assert.equal(await page.evaluate(()=>window.__probe.storyGuidance().target?.id),'room:main_b3','the actual HUD bearing agrees with the player mark');
  assert.equal((await handoff()).atStudio,false,'Get In sharing main_b3 acoustic identity is not Studio arrival');
  await shot('follow-b3');
  // Physical-zone acceptance, not a claim to have walked the entire stairs.
  await page.evaluate(()=>window.__probe.godWarpHook('studio-b3'));await sleep(500);
  assert.equal((await handoff()).stage,'done');
  await page.keyboard.press('b');await wait(()=>window.__scenes.top()?.id==='bag');
  await click('bag:tab:kit');assert.equal((await bag()).nav.sectionId,'kit','subsequent Bag visits are ungated');
  assert.deepEqual(errors,[]);
  console.log('PASS: real R measurement and tutorial win, immediate Bag hold, movement lock, controller Bag polling, explicit Skills visit, real cable drag, atomic Continue save/reload, explicit MAP visit, real B3 mark, follow HUD, Studio physical-zone completion, and ordinary later Bag. Zero page errors. Mock lens; simulated gamepad; no native/audio/full-stair-walk acceptance.');
}catch(error){
  console.error('FAIL',error.stack);console.error('STATE',JSON.stringify(await scene()));
  console.error('HANDOFF',JSON.stringify(await handoff()));
  await shot('failure');process.exitCode=1;
}finally{await browser.close();}
