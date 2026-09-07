// Browser evidence for the shipping Canvas helpers and actual scene routing.
// Requires Vite5199 + the repo mock lens5198. Native input/audio remain separate.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const base=process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5199';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],protocolTimeout:120000});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>{errors.push(error.message);console.log('PAGEERROR',error.message);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  await page.setViewport({width:960,height:470,deviceScaleFactor:2});
  // A same-origin JS document provides module access without starting a game.
  await page.goto(`${base}/src/render/hardware-material.js`);
  await page.setContent('<link rel="stylesheet" href="/styles.css"><div id="plate" style="position:relative;width:960px;height:470px;background:#080c09"></div>');
  const timings=await page.evaluate(async()=>{
    const ui=await import('/src/render/ui.js'),p=await import('/src/render/presentation.js');
    const {drawPrintedText}=await import('/src/render/keycap.js');
    ui.uiInit(document.getElementById('plate'));await document.fonts.load('600 14px "Hardware Sans"');
    const draw=()=>{
      p.drawMachinePanel(1,1,111,21,{label:'CONTROL ASSEMBLY',model:'DA-1000',wordmark:'AUDIOCORP',meter:false,footer:'MOLDED LENS / SILKSCREEN / MACHINED RETAINER'});
      for(const [i,key] of [{legend:'MONITOR',color:'amber'},{legend:'RECORD',color:'red'},{legend:'RETURN',color:'green'},{legend:'POWER',color:'blue'},{legend:'STOP',color:'white',finish:'opaque'}].entries()) {
        const x=4+i*21;
        drawPrintedText(x,5,'UNLIT / RAISED',{w:18,ink:'#b9bda9'});
        p.drawLampButton(x,6.4,18,3.2,{...key,travel:0,lampHeat:0});
        drawPrintedText(x,11.5,'LIT / LATCHED',{w:18,ink:'#b9bda9'});
        p.drawLampButton(x,13,18,3.2,{...key,travel:.8,lampHeat:1});
      }
    };
    const before=performance.now();draw();const coldMs=performance.now()-before;
    const timings=[];
    for(let n=0;n<80;n++){const start=performance.now();draw();timings.push(performance.now()-start);}
    timings.sort((a,b)=>a-b);
    return {coldMs,p50:timings[40],p95:timings[76],max:timings.at(-1)};
  });
  await page.screenshot({path:'artifacts/hardware-material-board.png'});
  console.log('Isolated ten-cap rendering, milliseconds:',JSON.stringify(timings));
  assert.ok(timings.p95<16.7,'warm material panel fits one60Hz frame');
  await page.setViewport({width:1280,height:760,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  await page.goto(`${base}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`,{waitUntil:'domcontentloaded'});
  const wait=(f,timeout=180000)=>page.waitForFunction(f,{timeout});
  await wait(()=>!!window.__scenes?.top?.()?.id);
  if(await page.evaluate(()=>window.__scenes.top().id==='eula'))await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='opening-credits');
  await page.evaluate(()=>window.__scenes.top().update(30));
  await wait(()=>window.__scenes.top()?.id==='title');
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='difficulty-select');await page.keyboard.press('Enter');
  await wait(()=>window.__scenes.top()?.id==='warning');await page.keyboard.press('Enter');await page.keyboard.press('n');
  await wait(()=>window.__chunkParity?.().screen==='game');
  await page.evaluate(()=>{window.__probe.testRun();window.__probe.godWarpGetIn();window.__probe.setFlags(['setup.levels','setup.waypoint','combat.trained','bag.taken']);});
  await sleep(600);await page.keyboard.press('r');
  await wait(()=>window.__scenes.top()?.id==='recorder');await sleep(500);
  assert.equal(await page.evaluate(()=>document.pointerLockElement===null),true,'open recorder releases camera capture');
  for(const [name,w,h] of [['wide',1280,760],['narrow',960,600]]) {
    await page.setViewport({width:w,height:h});await sleep(500);
    assert.equal(await page.evaluate(()=>window.__scenes.top()?.id),'recorder');
    await page.screenshot({path:`artifacts/hardware-recorder-${name}.png`});
    const regions=await page.evaluate(()=>window.__scenes.top().debugState().hitRegions);
    assert.ok(regions.filter(r=>r.kind==='transport').every(r=>r.w>=6),'readable physical transport width');
  }
  // Refused keys remain visible. A real pointer selects one and receives the
  // same refusal as keyboard; it must not fall through into world look input.
  const point=await page.evaluate(async()=>{
    const ui=await import('/src/render/ui.js');
    const hit=window.__scenes.top().debugState().hitRegions.find(r=>r.id==='play');
    // The viewport may retain a logical rendering size while CSS-scaled. Use
    // the inverse of uiPointFromClient, not nominal glyph pixels.
    const size=ui.uiSize(),r=document.getElementById('map').getBoundingClientRect();
    const x=r.left+(hit.x+hit.w*.5)/size.cols*r.width,y=r.top+(hit.y+hit.h*.5)/size.rows*r.height;
    window.__hardwarePointerEvents=[];
    window.addEventListener('pointerdown',e=>window.__hardwarePointerEvents?.push({x:e.clientX,y:e.clientY,target:e.target.tagName,point:ui.uiPointFromClient(e.clientX,e.clientY),scene:window.__scenes?.top()?.id}),true);
    return {x,y,hit,size,mapped:ui.uiPointFromClient(x,y),map:{x:r.x,y:r.y,w:r.width,h:r.height}};
  });
  await page.mouse.click(point.x,point.y);await sleep(120);
  const selected=await page.evaluate(()=>window.__scenes.top().debugState());
  if(selected.selectedKey!=='play') console.log('POINTER DIAGNOSTIC',JSON.stringify({point,selected,events:await page.evaluate(()=>window.__hardwarePointerEvents)}));
  assert.equal(selected.selectedKey,'play');assert.match(selected.notice,/TAPE|NOTHING/);
  console.log('Recorder live pointer selection/refusal, resize, wide/narrow: PASS');
  // Seed a rolling transport through the test hook, then stop through the real
  // visible button and real game callback (not through the hook).
  await page.evaluate(()=>window.__probe.setRecording(true));await sleep(250);
  const stopPoint=await page.evaluate(async()=>{
    const ui=await import('/src/render/ui.js');
    const hit=window.__scenes.top().debugState().hitRegions.find(r=>r.id==='stop');
    const size=ui.uiSize(),r=document.getElementById('map').getBoundingClientRect();
    return {x:r.left+(hit.x+hit.w*.5)/size.cols*r.width,y:r.top+(hit.y+hit.h*.5)/size.rows*r.height};
  });
  await page.mouse.click(stopPoint.x,stopPoint.y);await sleep(250);
  assert.equal(await page.evaluate(()=>window.__probe.rec().recording),false,'visible STOP owns live recording');
  console.log('Recorder live STOP click: PASS');
  await page.keyboard.press('r');await sleep(250);
  await page.evaluate(()=>window.__probe.setRecording(true));await sleep(800);
  await page.screenshot({path:'artifacts/hardware-recording.png'});
  await page.evaluate(()=>window.__probe.setRecording(false));await sleep(250);
  await page.setViewport({width:1280,height:760});
  await page.keyboard.press('b');await wait(()=>window.__scenes.top()?.id==='bag');
  console.log('First B after recorder closes: PASS');
  await page.keyboard.press('4');await sleep(500);
  assert.equal(await page.evaluate(()=>window.__scenes.top().debugState().nav.sectionId),'skills');
  await page.screenshot({path:'artifacts/hardware-bag.png'});
  await page.keyboard.press('b');await sleep(250);
  await page.evaluate(()=>window.__probe.battle(false));await sleep(8000);
  await page.keyboard.press('Enter');await wait(()=>!!window.__scenes.top()?.battleView);
  await wait(()=>window.__scenes.top().battleView().phase!=='arrival');
  for(let n=0;n<40&&await page.evaluate(()=>window.__scenes.top().battleView().phase==='talk');n++){
    await page.keyboard.press('Enter');await sleep(220);
  }
  console.log('Combat capture phase:',await page.evaluate(()=>window.__scenes.top().battleView().phase));
  assert.notEqual(await page.evaluate(()=>window.__scenes.top().battleView().phase),'talk','capture actionable combat, not introduction');
  await sleep(400);
  await page.screenshot({path:'artifacts/hardware-combat.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: actual game browser captures; zero page errors. Mock lens; not native acceptance.');
} finally {await browser.close();}
