// Real main.js + combat scene + renderer in Chromium. Only the starting combat
// checkpoint and dialogue-free review fixture are injected; production inputs,
// turn clocks, reducer, migration, checkpoints and rendering stay intact.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.SOURCE_DESKTOP_URL||'http://127.0.0.1:5307';
const out=process.env.SOURCE_DESKTOP_OUT||'/private/tmp/source-desktop-combat';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling'],protocolTimeout:120000});
const page=await browser.newPage(),errors=[],captures={};
page.on('pageerror',e=>{errors.push(e.stack||String(e));console.log('PAGE ERROR',e.stack||String(e));});
const wait=ms=>new Promise(done=>setTimeout(done,ms));
try{
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true}));
  await page.evaluateOnNewDocument(()=>{
    // Concurrent authoring should not reload this disposable acceptance run.
    window.WebSocket=new Proxy(window.WebSocket,{construct(Target,args){
      if(args[1]==='vite-hmr')return{readyState:0,addEventListener(){},removeEventListener(){},send(){},close(){}};
      return Reflect.construct(Target,args);
    }});
  });
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    if(new URL(req.url()).pathname==='/src/game/source-desktop-session.js'){
      const body=await(await fetch(req.url())).text();
      return req.respond({status:200,contentType:'text/javascript',body:body.replace('mode:refreshMode,','mode:()=>window.__proofNativeIsland?\'native\':refreshMode(),')});
    }
    if(new URL(req.url()).pathname!=='/src/main.js')return req.continue();
    const body=await (await fetch(req.url())).text();
    await req.respond({status:200,contentType:'text/javascript',body:body+`
      window.__desktopCombatProof={
        checkpoints:[],
        start:async(saved=null)=>{
          const {createCombatState,combatContinuationSnapshot}=await import('/src/game/combat-state.js');
          const original=sourceCombatBattle();
          const battle={...original,intro:[],win:[],lose:[],combat:{...original.combat,
            movements:original.combat.movements.map(m=>({...m,before:[],after:[],barks:[]}))}};
          const state=createCombatState(battle.combat,{composure:1,source:{rescueEligible:true}});
          state.sourceDesktop.cover=0;state.movementCoherence-=5;
          scenes.clear();
          const scene=pushCombat(battle,{source:{rescueEligible:true},skipOpening:true,
            continuation:saved||combatContinuationSnapshot(state),
            onCheckpoint:value=>window.__desktopCombatProof.checkpoints.push(value)});
          window.__desktopCombatProof.scene=scene;
          return scene.battleView();
        },
        freeze:()=>scenes.push({id:'proof-hold',freezesBelow:true}),
        unfreeze:()=>{if(scenes.top()?.id==='proof-hold')scenes.pop();},
        commandViewport:()=>setSourceCommandViewport({width:960,height:480}),
        stop:()=>scenes.clear(),
        view:()=>window.__desktopCombatProof.scene?.battleView(),
      };`});
  });
  await page.goto(`${base}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__desktopCombatProof&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();await window.__desktopCombatProof.start();});
  console.log('STARTED',await page.evaluate(()=>({top:window.__scenes?.top()?.id,source:window.__desktopCombatProof.view()?.sourceDesktop})));
  await page.waitForFunction(()=>window.__desktopCombatProof.view()?.sourceDesktop?.presentation?.ready,{timeout:30000});
  captures.contained=await page.evaluate(()=>window.__desktopCombatProof.view());
  await page.screenshot({path:`${out}/contained.png`});
  await page.waitForFunction(()=>window.__desktopCombatProof.view()?.phase==='desktop-breach',{timeout:30000,polling:50});
  captures.break=await page.evaluate(()=>window.__desktopCombatProof.view());
  await wait(1100);await page.screenshot({path:`${out}/dissolve.png`});
  await page.waitForFunction(()=>{const v=window.__desktopCombatProof.view();return v?.state.sourceDesktop.breached&&v.phase==='tool';},{timeout:15000});
  await page.evaluate(()=>window.__desktopCombatProof.freeze());
  captures.desktop=await page.evaluate(()=>window.__desktopCombatProof.view());
  await page.screenshot({path:`${out}/in-window.png`});
  assert.equal(captures.desktop.sourceDesktop.presentation.mode,'fallback');
  assert.equal(captures.desktop.state.sourceDesktop.breaks.length,1);
  assert.equal(captures.desktop.state.movementCoherence,captures.contained.state.movementCoherence,'breach did not heal the opponent');
  assert.equal(captures.desktop.sourceDesktop.cover.capacity,2);
  const pausedClock=captures.desktop.sourceDesktop.clock;
  await wait(500);
  assert.equal((await page.evaluate(()=>window.__desktopCombatProof.view())).sourceDesktop.clock,pausedClock);
  assert.equal((await page.evaluate(()=>window.__desktopCombatProof.view())).sourceDesktop.paused,true);
  const checkpoint=await page.evaluate(()=>window.__desktopCombatProof.view().checkpoint);
  await page.evaluate(saved=>window.__desktopCombatProof.start(saved),checkpoint);
  await page.waitForFunction(()=>{const v=window.__desktopCombatProof.view();return v?.phase==='tool'&&v?.sourceDesktop?.presentation?.ready;},{timeout:30000});
  await page.evaluate(()=>window.__desktopCombatProof.freeze());
  captures.reloaded=await page.evaluate(()=>window.__desktopCombatProof.view());
  assert.equal(captures.reloaded.state.movementCoherence,checkpoint.sourceCombat.movementCoherence);
  assert.deepEqual(captures.reloaded.state.sentBack,checkpoint.sentBack);
  assert.equal(captures.reloaded.state.composure,checkpoint.composure);
  await page.screenshot({path:`${out}/reloaded.png`});
  // Render the actual main-window command UI at its native logical allocation.
  // This is layout proof only; actual OS window proof is a separate Tauri run.
  await page.evaluate(()=>{
    window.__proofNativeIsland=true;
    window.__desktopCombatProof.commandViewport();
  });
  await page.setViewport({width:1040,height:480,deviceScaleFactor:1});await wait(300);
  captures.commandIsland=await page.evaluate(async()=>{
    const {uiCellMetrics}=await import('/src/render/ui.js');
    const map=document.getElementById('map').getBoundingClientRect();
    return{view:window.__desktopCombatProof.view(),metrics:uiCellMetrics(),
      viewportFault:!document.querySelector('[data-viewport-fault]').hidden,
      map:{x:map.x,y:map.y,width:map.width,height:map.height}};
  });
  const {view,metrics}=captures.commandIsland;
  assert.equal(captures.commandIsland.viewportFault,false);
  assert.equal(captures.commandIsland.map.width,1040);
  assert.equal(captures.commandIsland.map.height,480);
  assert.equal(view.inputRects.channels.length,3,'real command UI must be active');
  assert.ok(view.inputRects.tools.length>0);
  for(const rect of [...view.inputRects.channels,...view.inputRects.tools,...view.inputRects.moves]){
    assert.ok(rect.y*metrics.cellH>=0&& (rect.y+rect.h)*metrics.cellH<=480,`command clipped: ${JSON.stringify(rect)}`);
  }
  await page.screenshot({path:`${out}/command-island.png`});
  // Center clicks must hit fractional-height channel cards at this allocation.
  const choice=view.inputRects.channels.find(r=>r.id!==view.state.source.armed);
  await page.evaluate(r=>window.__desktopCombatProof.scene.pointer({type:'pointerdown',button:0,cellX:r.x+r.w/2,cellY:r.y+r.h/2}),choice);
  assert.equal((await page.evaluate(()=>window.__desktopCombatProof.view())).state.source.armed,choice.id);
  await page.evaluate(()=>window.__desktopCombatProof.scene.key({key:'ArrowDown'}));await wait(100);
  captures.commandActions=await page.evaluate(()=>window.__desktopCombatProof.view());
  assert.equal(captures.commandActions.phase,'move');
  assert.ok(captures.commandActions.inputRects.moves.length>0,'compact action controls must render');
  for(const rect of captures.commandActions.inputRects.moves){
    assert.ok(rect.y*metrics.cellH>=0&&(rect.y+rect.h)*metrics.cellH<=480,'action clipped');
  }
  await page.screenshot({path:`${out}/command-actions.png`});
  const waiting=captures.commandActions.inputRects.moves.find(r=>r.id==='wait');
  assert.ok(waiting,'WAIT provides a deterministic native reaction check');
  await page.evaluate(r=>{
    window.__desktopCombatProof.scene.pointer({type:'pointerdown',button:0,cellX:r.x+r.w/2,cellY:r.y+r.h/2});
    window.__desktopCombatProof.unfreeze();
  },waiting);
  await page.waitForFunction(()=>{const v=window.__desktopCombatProof.view();return v.phase==='resolve'&&v.resolution?.side==='enemy'&&v.inputRects.reaction;},{timeout:12000,polling:16});
  await page.evaluate(()=>window.__desktopCombatProof.freeze());
  captures.commandReaction=await page.evaluate(()=>window.__desktopCombatProof.view());
  const reaction=captures.commandReaction.inputRects.reaction;
  assert.ok(reaction.y*metrics.cellH>=0&&(reaction.y+reaction.h)*metrics.cellH<=480,'reaction clipped');
  const aperture=captures.commandReaction.inputRects.projectiles;
  assert.ok(aperture.h*metrics.cellH>=54,'ranged exchange retains a usable separate aperture');
  assert.ok((aperture.y+aperture.h)*metrics.cellH<reaction.y*metrics.cellH,'projectiles do not cover the parry input');
  await page.screenshot({path:`${out}/command-reaction.png`});
  await page.evaluate(()=>window.__desktopCombatProof.stop());
  assert.equal(await page.$('[data-source-desktop]'),null,'scene exit removes the presentation container');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,mode:'real game in-window fallback',out,checkpoints:await page.evaluate(()=>window.__desktopCombatProof.checkpoints.length)}));
}finally{
  try{captures.final=await page.evaluate(()=>({view:window.__desktopCombatProof?.view(),top:window.__scenes?.top()?.id}));await page.screenshot({path:`${out}/final.png`});}catch{}
  await writeFile(`${out}/report.json`,JSON.stringify({errors,captures},null,2));
  await browser.close();
}
