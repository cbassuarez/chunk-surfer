import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH;
if(!chrome)throw new Error('CHROME_PATH must point to the platform Chrome executable');
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5173';
const lens=process.env.MOCK_LENS_URL||'ws://127.0.0.1:8765';
const output=path.resolve(process.env.FEATURE_SMOKE_OUTPUT||'artifacts/feature-regression-smoke');
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});

const browser=await puppeteer.launch({
  executablePath:chrome,
  headless:'new',
  args:[
    '--autoplay-policy=no-user-gesture-required',
    ...(process.platform==='darwin'?['--use-angle=metal']:[]),
    ...(process.platform==='linux'?[
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ]:[]),
  ],
});
const page=await browser.newPage();
const desktopViewport={width:1280,height:800,deviceScaleFactor:1};
const compactViewport={width:960,height:600,deviceScaleFactor:1};
const transitionTimeout=process.platform==='linux'?60000:10000;
const gameplayTimeout=process.platform==='linux'?90000:20000;
const interactionTimeout=process.platform==='linux'?30000:5000;
await page.setViewport(desktopViewport);
const errors=[];
page.on('pageerror',(error)=>{
  errors.push(error.message);
  console.error(`visual smoke: page error: ${error.message}`);
});
page.on('console',(message)=>{
  if(message.type()==='error'||message.type()==='warning'){
    console.error(`visual smoke: page ${message.type()}: ${message.text()}`);
  }
});

async function settleViewport(){
  // Hosted Windows runners can suspend requestAnimationFrame for headless tabs
  // after a viewport change. setViewport already waits for the CDP resize; a
  // short wall-clock settle lets the canvas compositor catch up without an
  // unbounded dependency on page visibility.
  await new Promise((resolve)=>setTimeout(resolve,100));
}

async function samplePerformance(frames=75){
  await page.evaluate(()=>window.__probe.performanceReset());
  await new Promise((resolve)=>setTimeout(resolve,Math.max(500,frames*18)));
  const snapshot=await page.evaluate(()=>window.__probe.performance());
  assert.ok(snapshot.samples>=30,'performance probe must observe at least thirty rendered frames');
  return snapshot;
}

async function capturePair(desktopName,compactName){
  await page.screenshot({path:path.join(output,desktopName)});
  await page.setViewport(compactViewport);
  await settleViewport();
  await page.screenshot({path:path.join(output,compactName)});
  await page.setViewport(desktopViewport);
  await settleViewport();
}

try {
  console.log(`visual smoke: launching ${process.platform} capture with ${chrome}`);
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  });
  await page.goto(`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent(lens)}`,{
    waitUntil:'domcontentloaded',timeout:60000,
  });
  try{
    await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='opening-credits',{timeout:120000});
  }catch(error){
    await page.screenshot({path:path.join(output,'00-boot-failure.png')}).catch(()=>{});
    const state=await page.evaluate(()=>({
      scene:window.__scenes?.top?.()?.id||null,
      sceneView:window.__scenes?.top?.()?.view?.()||null,
      diffusion:window.__diffusion?.stats||null,
      renderer:window.__chunkParity?.()?.renderer||null,
    })).catch((cause)=>({diagnosticError:cause.message}));
    console.error(`visual smoke: opening did not start: ${JSON.stringify(state)}`);
    throw error;
  }
  console.log('visual smoke: opening credits ready');
  await page.evaluate(()=>window.__scenes.top().update(.35));
  await capturePair('01-opening-credits.png','01-opening-credits-compact.png');
  await page.evaluate(()=>window.__scenes.top().update(1.65));
  await capturePair('01b-opening-creator.png','01b-opening-creator-compact.png');
  await page.evaluate(()=>window.__scenes.top().update(6.5));
  await capturePair('01c-opening-sound-design.png','01c-opening-sound-design-compact.png');
  await page.evaluate(()=>window.__scenes.top().update(7.5));
  await capturePair('01d-opening-quotation.png','01d-opening-quotation-compact.png');
  await page.evaluate(()=>window.__scenes.top().update(6));
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='title',{timeout:transitionTimeout});
  await capturePair('02-title-current-build.png','02-title-compact.png');
  console.log('visual smoke: opening and title captured');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='difficulty-select',{timeout:transitionTimeout});
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='warning',{timeout:transitionTimeout});
  await page.keyboard.press('Enter');
  await page.keyboard.press('n');
  await page.waitForFunction(()=>window.__chunkParity?.().screen==='game',{timeout:gameplayTimeout});

  const map=await page.evaluate(()=>({
    source:window.__probe.mapSource(),
    model:window.__probe.map(),
    parity:window.__chunkParity(),
  }));
  assert.equal(map.parity.renderer,'3d');
  assert.ok(map.source?.definition?.floors?.length>=3,'authored multi-floor building definition must drive navigation');
  assert.ok(map.source?.targets?.length>=5,'authored facility targets must be present');
  assert.ok(map.model?.floors?.length>=1,'facility map model must render');
  assert.notEqual(map.source?.kind,'procedural','legacy procedural navigation must not surface');
  await page.screenshot({path:path.join(output,'03-authored-facility-map.png')});

  await page.keyboard.press('F10');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='god-menu',{timeout:interactionTimeout});
  const godMenu=await page.evaluate(()=>window.__scenes.top().view());
  assert.ok(godMenu.tabs.some((tab)=>tab.id==='conditions'));
  assert.ok(godMenu.tabs.some((tab)=>tab.id==='scenes'));
  await page.screenshot({path:path.join(output,'04-god-menu.png')});
  const currentTab=godMenu.tabs.findIndex((tab)=>tab.id===godMenu.tab);
  const scenesTab=godMenu.tabs.findIndex((tab)=>tab.id==='scenes');
  const tabSteps=(scenesTab-currentTab+godMenu.tabs.length)%godMenu.tabs.length;
  for(let i=0;i<tabSteps;i++)await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.view?.()?.tab==='scenes',{timeout:interactionTimeout});
  await page.screenshot({path:path.join(output,'04b-god-menu-game-parts.png')});
  await page.keyboard.press('F10');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='god-menu',{timeout:interactionTimeout});

  assert.equal(await page.evaluate(()=>window.__probe.coldOpen()),true);
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='god-cold-open',{timeout:interactionTimeout});
  await page.evaluate(()=>window.__scenes.top().update?.(2.5));
  await page.screenshot({path:path.join(output,'05-cold-open-clamped-dialogue.png')});

  assert.equal(await page.evaluate(()=>window.__probe.think('hush')),true);
  await page.waitForFunction(()=>/^thought:|^dialogue:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});
  await page.evaluate(()=>window.__scenes.top().update?.(1.2));
  await page.screenshot({path:path.join(output,'06-dialogue-pane.png')});
  assert.equal(await page.evaluate(()=>window.__probe.clearDiagnosticScenes()),true);
  await page.waitForFunction(()=>window.__chunkParity?.().screen==='game',{timeout:interactionTimeout});

  assert.equal(await page.evaluate(()=>window.__probe.battleId('natatorium',false)),true);
  await page.waitForFunction(()=>/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.screenshot({path:path.join(output,'07-signal-combat.png')});
  assert.equal(await page.evaluate(()=>window.__probe.battleAbort()),true);
  await page.waitForFunction(()=>!/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});

  await page.setViewport(compactViewport);
  await settleViewport();
  const buildingPerformance=await samplePerformance();
  await page.setViewport(desktopViewport);
  await settleViewport();

  assert.equal(await page.evaluate(()=>window.__probe.chunkSurfStart()),true);
  await page.waitForFunction(()=>window.__probe?.chunkSurf?.().active===true,{timeout:interactionTimeout});
  const chunkSurf=await page.evaluate(()=>({
    state:window.__probe.chunkSurf(),
    parity:window.__chunkParity(),
    scene:window.__scenes?.top?.()?.id||null,
  }));
  assert.equal(chunkSurf.state.phase,'hall','Chunk Surf must enter the real Long Hall world');
  assert.equal(chunkSurf.parity.screen,'game','source-space remains in the normal gameplay renderer');
  assert.notEqual(chunkSurf.scene,'chunk-surf','source-space must not restore the obsolete blocking scene');
  await page.screenshot({path:path.join(output,'08-chunk-surf-long-hall.png')});

  const sourcePresets=[
    ['hall-entry','hall'],
    ['hall-storm','hall'],
    ['haystack','haystack'],
    ['landscape','landscape'],
    ['hunt','landscape'],
    ['final-run','landscape'],
    ['final','final'],
  ];
  let sourcePerformance=null;
  await page.setViewport(compactViewport);
  await settleViewport();
  for(const [preset,phase] of sourcePresets){
    const snapshot=await page.evaluate((id)=>window.__probe.sourcePreset(id),preset);
    assert.equal(snapshot.phase,phase,`${preset} must enter its authored Source phase`);
    await page.waitForFunction((expected)=>window.__probe?.chunkSurf?.().phase===expected,{timeout:interactionTimeout},phase);
    await new Promise((resolve)=>setTimeout(resolve,120));
    const frame=await page.evaluate(()=>({source:window.__probe.chunkSurf(),props:window.__probe.props().pack,parity:window.__chunkParity()}));
    assert.equal(frame.parity.renderer,'3d');
    if(['landscape','final'].includes(phase)){
      assert.ok(frame.source.visibleGlyphs>0,`${preset} must submit visible provenance-backed glyphs`);
      assert.ok(frame.props.sourceText>0,`${preset} must reach the GPU source-text pass`);
    }
    if(preset==='landscape'){
      const atlasBuilds=frame.props.textAtlasBuilds;
      sourcePerformance=await samplePerformance();
      const after=await page.evaluate(()=>window.__probe.props().pack);
      assert.equal(after.textAtlasBuilds,atlasBuilds,'traversal frames must not rebuild the glyph atlas');
      assert.ok(sourcePerformance.spikesAbove50<=1,'Source traversal must not produce recurring frame spikes above 50 ms');
      assert.ok(sourcePerformance.frameMs<=buildingPerformance.frameMs*1.1,`Source frame time ${sourcePerformance.frameMs} ms must stay within 10% of building baseline ${buildingPerformance.frameMs} ms`);
    }
    await page.screenshot({path:path.join(output,`08-source-${preset}-960x600.png`)});
  }
  await page.setViewport(desktopViewport);
  await settleViewport();

  assert.equal(await page.evaluate(()=>window.__probe.godWarpDock()),true,'God warp returns from Source to the loading dock');
  await page.waitForFunction(()=>{
    const chunk=window.__probe.chunkSurf();
    const map=window.__probe.map();
    return chunk.active===false&&map?.player?.resolved===true&&window.__probe.lookProfile()==='explore';
  },{timeout:interactionTimeout});
  const dockReturn=await page.evaluate(()=>({
    chunk:window.__probe.chunkSurf(),
    map:window.__probe.map(),
    source:window.__probe.mapSource(),
    look:window.__probe.lookProfile(),
  }));
  assert.equal(dockReturn.chunk.active,false,'facility warp deactivates the Source diagnostic');
  assert.equal(dockReturn.map.player.resolved,true,'loading-dock player position resolves after Source exit');
  assert.ok(dockReturn.source?.definition?.floors?.length>=3,'loading-dock facility map is restored');
  assert.match(String(dockReturn.map.player.areaLabel||''),/loading dock/i);
  assert.equal(dockReturn.look,'explore','facility warp restores the authored facility look');
  console.log('visual smoke: gameplay path captured');

  assert.equal(await page.evaluate(()=>window.__probe.openCredits()),true);
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='credits',{timeout:interactionTimeout});
  await page.evaluate(()=>window.__scenes.top().update?.(1.8));
  await capturePair('09-credits-opening-card.png','09-credits-opening-card-compact.png');
  await page.evaluate(()=>window.__scenes.top().update?.(2.3));
  await capturePair('10-credits-roll-early.png','10-credits-roll-early-compact.png');
  await page.evaluate(()=>window.__scenes.top().update?.(12));
  await capturePair('11-credits-roll-mid.png','11-credits-roll-mid-compact.png');
  await page.keyboard.press('End');
  await capturePair('12-credits-closing-card.png','12-credits-closing-card-compact.png');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='credits',{timeout:interactionTimeout});

  const endingSummary=await page.evaluate(()=>window.__probe.endingCredits('sacrifice'));
  assert.equal(endingSummary.endingId,'sacrifice');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.view?.()?.context==='ending',{timeout:interactionTimeout});
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  await page.evaluate(()=>window.__scenes.top().update?.(4.1));
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='return-report',{timeout:interactionTimeout});
  await capturePair('13-return-report-after-credits.png','13-return-report-after-credits-compact.png');
  console.log('visual smoke: credit and ending path captured');

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({
    ok:true,
    renderer:map.parity.renderer,
    authoredFloors:map.source.definition.floors.length,
    mapTargets:map.source.targets.length,
    chunkSurfPhase:chunkSurf.state.phase,
    buildingPerformance,
    sourcePerformance,
    output,
  }));
} finally {
  await browser.close();
}
