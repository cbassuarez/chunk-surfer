import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH;
if(!chrome)throw new Error('CHROME_PATH must point to the platform Chrome executable');
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5173';
const lens=process.env.MOCK_LENS_URL||'ws://127.0.0.1:8765';
const output=path.resolve(process.env.FEATURE_SMOKE_OUTPUT||'artifacts/feature-regression-smoke');
const frameSampleTimeout=Math.max(1000,Number(process.env.FEATURE_SMOKE_FRAME_TIMEOUT_MS)||10000);
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
const interactionTimeout=process.platform==='linux'?30000:10000;
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

async function waitForTopScene(timeout=120000){
  await page.waitForFunction(
    ()=>!!window.__scenes?.top?.()?.id,
    {timeout},
  );
  return page.evaluate(()=>window.__scenes?.top?.()?.id||null);
}

async function acceptEulaIfPresent(){
  const scene=await waitForTopScene();
  if(scene!=='eula')return false;

  await page.screenshot({path:path.join(output,'00-eula-gate.png')}).catch(()=>{});
  const eulaView=await page.evaluate(()=>window.__scenes?.top?.()?.view?.()||null);
  assert.equal(eulaView?.reviewOnly,false,'first-run EULA must be an acceptance gate');
  assert.ok(eulaView?.sections>=3,'EULA gate must show required model-use sections');

  const lensAlreadyStarted=await page.evaluate(()=>!!window.__diffusion);
  assert.equal(
    lensAlreadyStarted,
    false,
    'diffusion lens must not start before EULA acceptance',
  );

  await page.keyboard.press('Enter');
  await page.waitForFunction(
    ()=>window.__scenes?.top?.()?.id!=='eula',
    {timeout:30000},
  );
  return true;
}

async function samplePerformance(minimumSamples=30){
  await page.evaluate(()=>window.__probe.performanceReset());
  const deadline=Date.now()+frameSampleTimeout;
  let snapshot=await page.evaluate(()=>window.__probe.performance());
  while(snapshot.samples<minimumSamples&&Date.now()<deadline){
    // Poll from Node's wall clock. Hosted Windows runners can briefly throttle
    // the headless tab, so a fixed 60 fps sleep is not a reliable frame count.
    await new Promise((resolve)=>setTimeout(resolve,100));
    snapshot=await page.evaluate(()=>window.__probe.performance());
  }
  assert.ok(
    snapshot.samples>=minimumSamples,
    `performance probe must observe at least ${minimumSamples} rendered frames; observed ${snapshot.samples} within ${frameSampleTimeout} ms`,
  );
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

async function advanceThoughtToBranch(){
  for(let i=0;i<12;i++){
    const view=await page.evaluate(()=>window.__scenes?.top?.()?.view?.()||null);
    if(view?.pending?.kind==='branch')return view;
    await page.evaluate(()=>{
      const scene=window.__scenes?.top?.();
      scene?.update?.(8);
      scene?.key?.({key:'Enter',code:'Enter'});
    });
  }
  throw new Error('thought did not reach a response branch');
}

async function revealThoughtResponse(){
  await page.evaluate(()=>{
    const scene=window.__scenes?.top?.();
    if(scene?.view?.()?.pending?.kind==='say')scene.key?.({key:'Enter',code:'Enter'});
    scene?.update?.(8);
    if(scene?.view?.()?.typing)scene.key?.({key:'Enter',code:'Enter'});
  });
}

async function finishThought(){
  for(let i=0;i<12;i++){
    const id=await page.evaluate(()=>window.__scenes?.top?.()?.id||null);
    if(!String(id||'').startsWith('thought:'))return true;
    await page.evaluate(()=>{
      const scene=window.__scenes?.top?.();
      scene?.update?.(8);
      scene?.key?.({key:'Enter',code:'Enter'});
    });
  }
  throw new Error('thought did not resolve');
}

try {
  console.log(`visual smoke: launching ${process.platform} capture with ${chrome}`);
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  });
  await page.goto(`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent(lens)}`,{
    waitUntil:'domcontentloaded',timeout:60000,
  });
  await acceptEulaIfPresent();
  try{
    await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='opening-credits',{timeout:240000});
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

  // Academic-gallery sightline proof. These are fixed authored positions, not
  // a cinematic camera: the same player renderer used in the shipped build has
  // to resolve the garden, crown, bridge, gallery void and locked threshold.
  if(!(await page.evaluate(()=>window.__probe.torch().on)))await page.keyboard.press('f');
  const academicViews=[
    ['03a-academic-entrance-looking-up.png',83,7,2],
    ['03b-academic-garden-plaza.png',77,14,1],
    ['03c-academic-bridge-arrival.png',8,275,0],
    ['03d-academic-gallery-across-void.png',41,254,3],
    ['03e-academic-classroom-threshold.png',11,264,1],
  ];
  for(const [name,x,y,facing] of academicViews){
    await page.evaluate((ax,ay,af)=>window.__probe.warpCell(ax,ay,af),x,y,facing);
    await settleViewport();
    await page.screenshot({path:path.join(output,name)});
  }
  await page.evaluate(()=>window.__probe.setFlags(['academic.entered']));
  const discoveredAcademic=await page.evaluate(()=>window.__probe.map());
  assert.equal(discoveredAcademic.floors.find((floor)=>floor.id==='academic')?.shortLabel,'3F');
  assert.equal(discoveredAcademic.spaces.some((space)=>space.floorId==='academic'),false,'the discovered floor remains free of objectives and labels');
  console.log('visual smoke: academic atrium and locked gallery captured');

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
  const warningDiagnostic=await page.evaluate(()=>window.__probe.hushSensation());
  assert.equal(warningDiagnostic.mode,'proximity');
  assert.ok(warningDiagnostic.debug.choices.every((choice)=>!Object.hasOwn(choice,'outcome')),'a distant warning has no hidden mechanical answers');
  assert.equal(await page.evaluate(()=>window.__probe.clearDiagnosticScenes()),true);
  await page.waitForFunction(()=>window.__chunkParity?.().screen==='game',{timeout:interactionTimeout});

  const beforeRelease=await page.evaluate(()=>({presence:window.__probe.presence(),rec:window.__probe.rec()}));
  assert.equal(await page.evaluate(()=>window.__probe.hushBrush(4417)),true);
  await advanceThoughtToBranch();
  const releasePicker=await page.evaluate(()=>window.__probe.hushSensation());
  const releaseIndex=releasePicker.debug.choices.findIndex((choice)=>choice.outcome==='release');
  assert.ok(releaseIndex>=0&&releasePicker.pending?.id,'brush diagnostics expose a real deferred attempt');
  await page.screenshot({path:path.join(output,'06a-hush-brush-picker.png')});
  assert.equal(await page.evaluate((index)=>window.__probe.hushChoice(index),releaseIndex),true);
  await revealThoughtResponse();
  await page.screenshot({path:path.join(output,'06b-hush-brush-release.png')});
  await finishThought();
  const afterRelease=await page.evaluate(()=>({
    sensation:window.__probe.hushSensation(),presence:window.__probe.presence(),rec:window.__probe.rec(),
  }));
  assert.equal(afterRelease.sensation.debug.selected.outcome,'release');
  assert.equal(afterRelease.sensation.pending,null);
  assert.equal(afterRelease.presence.active,true);
  assert.equal(afterRelease.presence.hasTarget,true,'the saving answer redirects HUSH instead of despawning it');
  assert.equal(afterRelease.presence.caughtCount,beforeRelease.presence.caughtCount);
  assert.equal(afterRelease.presence.awareness,beforeRelease.presence.awareness);
  assert.equal(afterRelease.rec.injuries,beforeRelease.rec.injuries);

  const beforeHard=await page.evaluate(()=>({presence:window.__probe.presence(),rec:window.__probe.rec()}));
  assert.equal(await page.evaluate(()=>window.__probe.hushBrush(7127)),true);
  await advanceThoughtToBranch();
  const hardPicker=await page.evaluate(()=>window.__probe.hushSensation());
  const hardIndex=hardPicker.debug.choices.findIndex((choice)=>choice.outcome==='hard');
  assert.ok(hardIndex>=0);
  assert.equal(await page.evaluate((index)=>window.__probe.hushChoice(index),hardIndex),true);
  await revealThoughtResponse();
  await page.screenshot({path:path.join(output,'06c-hush-brush-failed-thought.png')});
  await finishThought();
  const hardFlash=await page.evaluate(()=>window.__chunkSurferHushScare.status());
  assert.equal(hardFlash.active,true);
  assert.equal(hardFlash.contactHit,true);
  await page.screenshot({path:path.join(output,'06d-hush-brush-hard-contact.png')});
  const afterHard=await page.evaluate(()=>({presence:window.__probe.presence(),rec:window.__probe.rec(),sensation:window.__probe.hushSensation()}));
  assert.equal(afterHard.sensation.debug.selected.outcome,'hard');
  assert.equal(afterHard.presence.caughtCount,beforeHard.presence.caughtCount+1);
  assert.ok(afterHard.presence.awareness>beforeHard.presence.awareness);
  assert.equal(afterHard.rec.injuries,beforeHard.rec.injuries+1);
  await new Promise((resolve)=>setTimeout(resolve,750));

  await page.evaluate(()=>window.__probe.setReduceDread(true));
  assert.equal(await page.evaluate(()=>window.__probe.hushBrush(9001)),true);
  await advanceThoughtToBranch();
  assert.equal(await page.evaluate(()=>window.__probe.lookProfile()),'calm','reduced effects remove the moving HUSH look');
  await page.screenshot({path:path.join(output,'06e-hush-brush-reduced.png')});
  assert.equal(await page.evaluate(()=>window.__probe.clearDiagnosticScenes()),true);
  await page.evaluate(()=>window.__probe.setReduceDread(false));

  await page.evaluate(()=>window.__probe.setRecording(true));
  const recordingDecision=await page.evaluate(()=>window.__probe.hushDecision(.01,.25,false));
  assert.notEqual(recordingDecision.kind,'brush','an active take cannot become a brush dialogue');
  assert.equal(await page.evaluate(()=>window.__probe.scene()),null);
  await page.screenshot({path:path.join(output,'06f-hush-active-recording-exclusion.png')});
  await page.evaluate(()=>window.__probe.setRecording(false));

  assert.equal(await page.evaluate(()=>window.__probe.takeMe()),undefined);
  const takenFlash=await page.evaluate(()=>window.__chunkSurferHushScare.status());
  assert.equal(takenFlash.active,true);
  assert.equal(takenFlash.takenHit,true);
  await page.screenshot({path:path.join(output,'06g-hush-taken-contact.png')});
  assert.equal(await page.evaluate(()=>window.__probe.clearDiagnosticScenes()),true);

  await page.evaluate(()=>window.__probe.warpCell(80,31,2));
  assert.equal(await page.evaluate(()=>window.__probe.battleId('natatorium',false)),true);
  if(await page.evaluate(()=>window.__scenes?.top?.()?.id==='loadout-briefing')){
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(()=>/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.screenshot({path:path.join(output,'07-signal-combat.png')});
  assert.equal(await page.evaluate(()=>window.__probe.battleAbort()),true);
  await page.waitForFunction(()=>!/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});

  await page.evaluate(()=>window.__probe.warpCell(93,73,0));
  assert.equal(await page.evaluate(()=>window.__probe.battleId('chapel',false)),true);
  await page.waitForFunction(()=>/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.screenshot({path:path.join(output,'07-signal-combat-chapel.png')});
  assert.equal(await page.evaluate(()=>window.__probe.battleAbort()),true);
  await page.waitForFunction(()=>!/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:interactionTimeout});

  // Lighting signatures are judged through the shipped renderer. Power and
  // torch are held off here so each room has to identify itself by its own
  // maintained practical, sky and ambient response rather than by the HUD.
  for(const circuit of ['sp01','sp02','sp03'])await page.evaluate((id)=>window.__probe.setPower(id,false),circuit);
  await page.evaluate(()=>window.__probe.hush());
  await page.evaluate(()=>window.__probe.setTorch(false));
  const lightingViews=[
    ['07l-dock-sodium-seam.png',65,10,0],
    ['07l-dance-stair-failure.png',45,19.5,2],
    ['07l-plant-indicator.png',35,29,1],
    ['07l-natatorium-roof-bounce.png',80,31,2],
    ['07l-hall-stage-door.png',100,12,0],
    ['07l-practice-emergency-end.png',60.5,55,0],
    ['07l-academic-skylight.png',39,254,3],
    ['07l-chapel-cold-shaft.png',93,73,0],
    ['07l-tower-light-bands.png',1,151,2],
  ];
  for(const [name,x,y,facing] of lightingViews){
    await page.evaluate((ax,ay,af)=>window.__probe.warpCell(ax,ay,af),x,y,facing);
    await settleViewport();
    await page.screenshot({path:path.join(output,name)});
  }

  // Geometry proofs use the player's actual torch and local service circuit.
  // The pool view must show one uninterrupted room with no inserted shell; the
  // wing view must show the seating bowl climbing away from the stage.
  await page.evaluate(()=>{window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__probe.setPower('sp02',true);});
  await page.evaluate(()=>window.__probe.warpCell(83,47,0));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07o-natatorium-single-vault.png')});
  await page.evaluate(()=>{window.__probe.setPower('sp02',false);window.__probe.setPower('sp03',true);});
  await page.evaluate(()=>window.__probe.warpCell(100,23,1));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07o-hall-seating-rises-to-rear.png')});
  await page.evaluate(()=>{window.__probe.setPower('sp03',false);window.__probe.setTorch(false);});

  await page.evaluate(()=>window.__probe.warpCell(35,29,1));
  await page.screenshot({path:path.join(output,'07m-sp01-off.png')});
  const livePlant=await page.evaluate(()=>{window.__probe.setPower('sp01',true);return{power:window.__probe.power(),light:window.__probe.light(),hum:window.__probe.electricalHum()};});
  assert.ok(livePlant.power.live.includes('sp01'));
  assert.ok(livePlant.light.rig.some((entry)=>entry.id==='plant-service-live'));
  assert.equal(livePlant.hum.audible,true);
  await settleViewport();
  await page.screenshot({path:path.join(output,'07m-sp01-on.png')});
  await page.evaluate(()=>window.__probe.setPower('sp01',false));

  await page.evaluate(()=>window.__probe.warpCell(49,23,1));
  await page.evaluate(()=>window.__probe.hush());
  for(const [name,battery] of [
    ['07n-torch-clean.png',1],
    ['07n-torch-warm.png',.30],
    ['07n-torch-failing.png',.10],
    ['07n-torch-flat.png',0],
  ]){
    await page.evaluate((value)=>window.__probe.setTorchBattery(value),battery);
    const shouldBurn=battery>0;
    await page.evaluate((on)=>window.__probe.setTorch(on),shouldBurn);
    await settleViewport();
    await page.screenshot({path:path.join(output,name)});
  }
  await page.evaluate(()=>window.__probe.setTorchBattery(1));
  await page.evaluate(()=>window.__probe.setTorch(true));
  console.log('visual smoke: room signatures, circuit state and torch degradation captured');

  await page.setViewport(compactViewport);
  await settleViewport();
  const buildingPerformance=await samplePerformance();
  await page.setViewport(desktopViewport);
  await settleViewport();

  await page.evaluate(()=>window.__probe.warpCell(84,28,2));
  if(await page.evaluate(()=>window.__probe.torch().on))await page.keyboard.press('f');
  await page.evaluate(()=>window.__probe.look(0,-.12));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07-natatorium-long-hall.png')});

  await page.evaluate(()=>window.__probe.warpCell(61,40,2));
  if(!(await page.evaluate(()=>window.__probe.torch().on)))await page.keyboard.press('f');
  await settleViewport();
  await page.screenshot({path:path.join(output,'07a-upper-stair-normal-dark.png')});
  await page.evaluate(()=>window.__probe.warpCell(61,54,1));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07ab-practice-arrival-hall.png')});
  await page.evaluate(()=>window.__probe.warpCell(64,53,0));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07ac-academic-stair-visible.png')});
  await page.evaluate(()=>window.__probe.warpCell(66,82,2));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07aa-practice-corridor-dead-end-dark.png')});
  await page.evaluate(()=>window.__probe.warpCell(49,23,1));
  await settleViewport();
  await page.screenshot({path:path.join(output,'07b-basement-stair-normal-dark.png')});
  await page.keyboard.press('f');
  await page.evaluate(()=>window.__probe.hush());

  let stairPerformance=null;
  for(const [mode,reduced] of [['reduced',true],['full',false]]){
    for(let stage=0;stage<4;stage++){
      const stair=await page.evaluate((phase,isReduced)=>window.__probe.stairAnomalyPreset(phase,isReduced),stage,reduced);
      assert.equal(stair.active,true);
      assert.equal(stair.ledger.stage,stage);
      assert.ok(stair.lights.length<=8,'stair practicals stay inside the eight-light renderer limit');
      assert.ok(stair.lights.filter((entry)=>entry.castsShadow).length<=1,'only one stair practical may cast a hero shadow');
      if(stage===2)assert.equal(stair.shadowOnly,reduced?0:1,'reduced dread removes only the implied figure occluder');
      await new Promise((resolve)=>setTimeout(resolve,140));
      await page.screenshot({path:path.join(output,`07c-stair-${mode}-phase-${stage+1}.png`)});
      if(!reduced&&stage===2)stairPerformance=await samplePerformance();
    }
  }
  assert.ok(stairPerformance?.samples>=30,'active stair rendering must sustain the feature performance probe');
  assert.equal(await page.evaluate(()=>window.__probe.godWarpDock()),true,'stair capture exits atomically back into the building');
  await page.waitForFunction(()=>window.__probe?.stairAnomaly?.().active===false,{timeout:interactionTimeout});
  console.log('visual smoke: permanent and impossible stairs captured');

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
    if(preset==='hunt'){
      const beforeContact=await page.evaluate(()=>window.__probe.chunkSurf());
      const contact=await page.evaluate(()=>window.__probe.sourceContact());
      assert.ok(contact&&contact.source,'Source checkpoint contact remains on its separate immediate path');
      assert.deepEqual(contact.source.optionalTraces,beforeContact.optionalTraces,'Source contact preserves resolved evidence');
      await new Promise((resolve)=>setTimeout(resolve,250));
      await page.screenshot({path:path.join(output,'08-source-hunt-contact-960x600.png')});
    }
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
  await page.evaluate(()=>{
    const credits=window.__scenes.top();
    credits.key?.({key:'End',code:'End'});
    credits.key?.({key:' ',code:'Space'});
    credits.update?.(4.1);
    credits.update?.(13.5);
  });
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
    stairPerformance,
    sourcePerformance,
    output,
  }));
} finally {
  await browser.close();
}
