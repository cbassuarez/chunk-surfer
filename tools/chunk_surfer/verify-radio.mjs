// Disposable browser acceptance: real V/RB dispatch and held choices; God
// fixtures stage radio conversations, not their earned world/progression gates.
// Uses the isolated Vite + mock lens servers; no native/audio-perception claim.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5297';
const output=process.env.RADIO_ARTIFACT_DIR||'artifacts';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
const page=await browser.newPage(),errors=[],captured=new Set();
page.on('pageerror',error=>{errors.push(error.stack||error.message);console.error('PAGEERROR',error.message);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=(fn,...args)=>page.waitForFunction(fn,{timeout:90000},...args);
const state=()=>page.evaluate(()=>{const scene=window.__scenes?.top();return{id:scene?.id||null,view:scene?.view?.()||null,audio:scene?.radioAudioSnapshot?.()||null,radio:window.__probe?.radio?.()||null};});
const shot=async name=>{await page.screenshot({path:`${output}/radio-${name}.png`});captured.add(name);console.log('CAPTURE',name);};
const noRadio=()=>wait(()=>!window.__scenes.top()?.id?.startsWith('radio:'));

async function seedRadio({initial=true}={}){
  await page.evaluate(async initial=>{
    const radio=await import('/src/game/radio.js');
    // This is fixture state, not a claim that the player earned/heard a call.
    radio.loadRadioState({schema:4,milestones:{[radio.RADIO_CUES.INITIAL]:initial}});
    const save=await import('/src/game/save.js');save.saveCommit({radio:radio.saveRadioState()});
  },initial);
}
async function pad(button){
  await page.evaluate(async()=>{
    if(window.__radioPad)return;
    window.__radioPad={id:'Xbox 360 Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
    (await import('/src/game/controller.js')).setControllerNavigatorForTest({getGamepads:()=>[window.__radioPad]});
  });
  await sleep(150);
  await page.evaluate(button=>{window.__radioPad.buttons[button]={pressed:true,value:1,touched:true};},button);
  await sleep(130);
  await page.evaluate(button=>{window.__radioPad.buttons[button]={pressed:false,value:0,touched:false};},button);
  await sleep(180);
}
async function clickChoice(goto){
  const point=await page.evaluate(async goto=>{
    const view=window.__scenes.top().view();
    const size=(await import('/src/render/ui.js')).uiSize();
    const layout=(await import('/src/render/radio-scene.js')).radioSceneLayout(size,view);
    const at=view.pending.options.findIndex(choice=>choice.goto===goto),hit=layout.choices[at];
    if(!hit)throw new Error(`No radio option ${goto}`);
    const rect=document.getElementById('map').getBoundingClientRect();
    return{x:rect.left+(hit.x+hit.w*.5)/size.cols*rect.width,y:rect.top+(hit.y+hit.h*.5)/size.rows*rect.height};
  },goto);
  await page.mouse.click(point.x,point.y);await sleep(160);
}
async function driveUntil(predicate,{capturePrefix=null,pauseRelay=false}={}){
  const deadline=Date.now()+120000;let paused=false;
  while(Date.now()<deadline){
    const value=await state();
    if(predicate(value))return value;
    assert.ok(value.id?.startsWith('radio:'),`radio scene unexpectedly left: ${value.id}`);
    const view=value.view,stage=view.radio.stage;
    if(capturePrefix&&view.lineSourceId?.endsWith(`rupture.${stage}`)&&!captured.has(`${capturePrefix}-${stage}`)){
      // Let its image reach the canvas; the actual stage clock is never forged.
      await sleep(220);await shot(`${capturePrefix}-${stage}`);
    }
    if(pauseRelay&&stage==='relay'&&!paused){
      paused=true;
      await page.evaluate(()=>{window.__radioPausedScene=window.__scenes.top();});
      assert.ok(value.audio?.nodes>0,'relay has a scene-local audio graph');
      await page.keyboard.press('Escape');await wait(()=>window.__scenes.top()?.id==='pause');
      const before=await page.evaluate(()=>({time:window.__radioPausedScene.view().radio.time,audio:window.__radioPausedScene.radioAudioSnapshot()}));
      assert.equal(before.audio.nodes,0);assert.equal(before.audio.paused,true);
      await sleep(400);
      assert.equal(await page.evaluate(()=>window.__radioPausedScene.view().radio.time),before.time,'pause freezes the scene clock');
      await shot(`${capturePrefix}-paused`);
      await page.keyboard.press('Escape');await wait(()=>window.__scenes.top()?.id?.startsWith('radio:'));
      const resumed=await state();assert.equal(resumed.audio.voices,2,'resume restores only carrier, not the clipped return');
      console.log('PAUSE',JSON.stringify({nodes:before.audio.nodes,resumedVoices:resumed.audio.voices}));
      continue;
    }
    if(view.radio.contact)throw new Error('Drive would bypass the required held contact choice');
    if(!view.radio.ready){await sleep(80);continue;}
    await page.keyboard.press('Enter');await sleep(view.typing?90:180);
  }
  throw new Error('Timed out advancing readable radio presentation');
}
async function openRequest({controller=false}={}){
  if(controller)await pad(5);else await page.keyboard.press('v');
  await wait(()=>window.__scenes.top()?.id==='radio:request');
  return driveUntil(value=>!!value.view?.pending?.options?.some(choice=>choice.goto==='directions'));
}
async function routeCall({controller=false}={}){
  const before=(await state()).radio;
  await openRequest({controller});await shot(controller?'request-controller':'request');
  assert.equal((await state()).radio.transmissions,before.transmissions,'opening the front panel does not transmit');
  await clickChoice('directions');await wait(()=>window.__scenes.top()?.id?.startsWith('radio:guidance:'));
  const call=await state();assert.equal(call.radio.guidance.dangerCallCount,0);
  assert.equal(call.radio.transmissions,before.transmissions+1);
  assert.ok(!call.view.pending?.options?.some(choice=>choice.goto==='help'),'directions do not become danger help');
  await shot(controller?'directions-controller':'directions');
  if(controller)await pad(5);else await page.keyboard.press('v');await noRadio();
}
async function preview(cue,reducedMotion=false){
  await seedRadio();
  const id=await page.evaluate(options=>window.__probe.radioPreview(options),{cue,reducedMotion});
  assert.ok(id,'explicit God presentation fixture started');await wait(id=>window.__scenes.top()?.id===id,id);
  console.log('FIXTURE',cue,reducedMotion?'reduced-motion':'full-motion');
}
async function terminal({cue,choice,reducedMotion=false,pauseRelay=false}){
  await preview(cue,reducedMotion);
  const prefix=`${cue}-${choice}${reducedMotion?'-reduced':''}`;
  const contact=await driveUntil(value=>!!value.view?.radio.contact,{capturePrefix:prefix,pauseRelay});
  assert.equal(contact.view.radio.stage,'decision');assert.equal(contact.audio.nodes,0,'decision is an actual audio pause');
  await wait(()=>window.__scenes.top().view().radio.ready);
  const presented=await state();
  assert.equal(presented.view.pending.options[presented.view.pending.index]?.goto,'still','safe inaction is the initial contact choice');
  await shot(`${prefix}-choices`);
  if(reducedMotion){
    await page.setViewport({width:960,height:600});
    await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1.5));await sleep(300);
    const geometry=await page.evaluate(async()=>{
      const size=(await import('/src/render/ui.js')).uiSize();
      const layout=(await import('/src/render/radio-scene.js')).radioSceneLayout(size,window.__scenes.top().view());
      return{size,layout};
    });
    const rows=geometry.layout.choices;
    assert.equal(rows.length,2);
    assert.ok(rows[0].y+rows[0].h<rows[1].y,'large-text decisions do not overlap');
    assert.ok(rows.at(-1).y+rows.at(-1).h<geometry.layout.footerY);
    assert.ok(geometry.layout.x+geometry.layout.w<=geometry.size.cols);
    await shot(`${prefix}-choices-large-text`);
    await page.evaluate(()=>window.__chunkSurferDisplay.setUiScale(1));
    await page.setViewport({width:1280,height:760});await sleep(200);
  }
  const index=contact.view.pending.options.findIndex(option=>option.goto===choice);assert.ok(index>=0);
  await page.keyboard.press(String(index+1));await sleep(120);
  assert.equal((await state()).view.radio.contact,true,'numeric choice selects but cannot commit');
  await page.keyboard.down('Enter');await sleep(280);await page.keyboard.up('Enter');await sleep(90);
  assert.equal((await state()).view.radio.contact,true,'a short tap cannot satisfy the 650ms hold');
  assert.equal((await state()).view.radio.hold,0,'release cancels incomplete contact');
  const began=Date.now();await page.keyboard.down('Enter');await sleep(750);
  await wait(()=>!window.__scenes.top().view().radio.contact);await page.keyboard.up('Enter');
  assert.ok(Date.now()-began>=650,'held actual wall time, never scene.update acceleration');
  assert.equal((await state()).view.radio.choice,choice);await shot(`${prefix}-committed`);
  await driveUntil(value=>!value.id?.startsWith('radio:'),{capturePrefix:prefix});
  assert.equal((await state()).radio.dead,true,'preview terminal reaches its explicitly fixture-marked dead state');
  await page.keyboard.press('v');await wait(()=>window.__scenes.top()?.id==='radio:dead-check');
  await shot(`${prefix}-dead-inspection`);await page.keyboard.press('v');await noRadio();
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
  console.log('BOOT','game ready');
  await page.evaluate(async()=>{
    // Load fixtures before mutating flags: awaiting an import after bag.taken
    // gives the real scheduler a frame in which to start the initial check-in.
    const radio=await import('/src/game/radio.js'),save=await import('/src/game/save.js');
    window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.tutSkip();
    window.__probe.setFlags(['bag.taken','title.shown','setup.levels','combat.trained','setup.waypoint','setup.case.started','setup.case.opened','setup.case.skills-opened','setup.case.skills-done','setup.case.map-opened','setup.case.closed','setup.case.arrived'],['radio.contact.reseated','radio.contact.held','radio.rupture.broken']);
    radio.loadRadioState({schema:4,milestones:{[radio.RADIO_CUES.INITIAL]:true}});
    save.saveCommit({radio:radio.saveRadioState(),settings:{...save.getSave().settings,controlHud:'smart',shake:'full'}});
  });
  await sleep(650);await noRadio();await shot('hud-smart');
  await openRequest();await page.keyboard.press('v');await noRadio();
  assert.equal((await state()).radio.transmissions,0,'V closes an untransmitted request');
  await routeCall();await routeCall({controller:true});
  assert.equal((await state()).radio.guidance.dangerCallCount,0,'repeated directions never spend danger help');
  await seedRadio({initial:false});await page.evaluate(()=>window.__probe.radioTransmit(0));
  await wait(()=>window.__probe.radio().call.status==='calling');
  assert.ok(!(await state()).id?.startsWith('radio:'),'incoming call does not take scene ownership');
  await shot('incoming');await page.keyboard.press('v');
  await wait(()=>window.__scenes.top()?.id==='radio:initial_checkin');await sleep(350);await shot('initial');
  await page.keyboard.press('v');await noRadio();
  assert.equal((await state()).radio.milestones.initial_checkin,false,'cancelling a scripted first call does not count as hearing it');
  await preview('warning');await sleep(350);await shot('warning');await page.keyboard.press('v');await noRadio();
  await terminal({cue:'breakdown',choice:'reseat',pauseRelay:true});
  await terminal({cue:'hush',choice:'still',reducedMotion:true});
  await shot('hud-dead');
  assert.deepEqual(errors,[]);
  console.log('PASS: real V/RB request/directions/lower, no danger cost for repeat routes, first-call cancellation, readable warning fixture, both held terminal choices, real 650ms hold, pause graph cleanup, quiet resume, dead inspection, reduced-motion presentation. Zero page errors. Disposable God fixtures + mock lens + simulated gamepad; no earned-route/native/audio-perception acceptance.');
}catch(error){
  console.error('FAIL',error.stack);console.error('STATE',JSON.stringify(await state()));
  await shot('failure');process.exitCode=1;
}finally{await browser.close();}
