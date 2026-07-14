import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5173';
const lens=process.env.MOCK_LENS_URL||'ws://127.0.0.1:8765';
const output=path.resolve('artifacts/feature-regression-smoke');
fs.mkdirSync(output,{recursive:true});

const browser=await puppeteer.launch({
  executablePath:chrome,
  headless:'new',
  args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'],
});
const page=await browser.newPage();
await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
const errors=[];
page.on('pageerror',(error)=>errors.push(error.message));

try {
  await page.evaluateOnNewDocument(()=>{
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  });
  await page.goto(`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent(lens)}`,{
    waitUntil:'domcontentloaded',timeout:60000,
  });
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='opening-credits',{timeout:120000});
  await page.evaluate(()=>window.__scenes.top().update(2));
  await page.screenshot({path:path.join(output,'01-opening-credits.png')});
  await page.evaluate(()=>window.__scenes.top().update(18));
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='title',{timeout:10000});
  await page.screenshot({path:path.join(output,'02-title-current-build.png')});

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='difficulty-select',{timeout:10000});
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='warning',{timeout:10000});
  await page.keyboard.press('Enter');
  await page.keyboard.press('n');
  await page.waitForFunction(()=>window.__chunkParity?.().screen==='game',{timeout:20000});

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
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='god-menu',{timeout:5000});
  const godMenu=await page.evaluate(()=>window.__scenes.top().view());
  assert.ok(godMenu.tabs.some((tab)=>tab.id==='conditions'));
  assert.ok(godMenu.tabs.some((tab)=>tab.id==='scenes'));
  await page.screenshot({path:path.join(output,'04-god-menu.png')});
  for(let i=0;i<4;i++)await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.view?.()?.tab==='scenes',{timeout:5000});
  await page.screenshot({path:path.join(output,'04b-god-menu-game-parts.png')});
  await page.keyboard.press('F10');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='god-menu',{timeout:5000});

  assert.equal(await page.evaluate(()=>window.__probe.coldOpen()),true);
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='god-cold-open',{timeout:5000});
  await page.evaluate(()=>window.__scenes.top().update?.(2.5));
  await page.screenshot({path:path.join(output,'05-cold-open-clamped-dialogue.png')});

  assert.equal(await page.evaluate(()=>window.__probe.think('hush')),true);
  await page.waitForFunction(()=>/^thought:|^dialogue:/.test(window.__scenes?.top?.()?.id||''),{timeout:5000});
  await page.evaluate(()=>window.__scenes.top().update?.(1.2));
  await page.screenshot({path:path.join(output,'06-dialogue-pane.png')});

  assert.equal(await page.evaluate(()=>window.__probe.battleId('natatorium',false)),true);
  await page.waitForFunction(()=>/^battle:/.test(window.__scenes?.top?.()?.id||''),{timeout:5000});
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.screenshot({path:path.join(output,'07-redaction-battle.png')});

  assert.equal(await page.evaluate(()=>window.__probe.chunkSurfStart()),true);
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='chunk-surf',{timeout:5000});
  const chunkSurf=await page.evaluate(()=>window.__scenes.top().view());
  assert.ok(chunkSurf?.roomId,'Chunk Surf source-fault scene must expose its authored room state');
  await page.screenshot({path:path.join(output,'08-chunk-surf-source-fault.png')});

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({
    ok:true,
    renderer:map.parity.renderer,
    authoredFloors:map.source.definition.floors.length,
    mapTargets:map.source.targets.length,
    chunkSurfRoom:chunkSurf.roomId,
    output,
  }));
} finally {
  await browser.close();
}
