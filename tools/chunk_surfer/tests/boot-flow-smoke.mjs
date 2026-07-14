import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5173';
const lens=process.env.MOCK_LENS_URL||'ws://127.0.0.1:8765';
const output=path.resolve('artifacts/regression-smoke');
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
  const url=`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent(lens)}`;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='opening-credits',{timeout:120000,polling:100});
  await page.waitForFunction(()=>window.__chunkSurferPixelMesh?.bankStatus?.()?.bank==='calm',{timeout:30000,polling:100});
  await page.screenshot({path:path.join(output,'01-opening-credits.png')});

  // Advance only the authored clock; the scene still executes its normal
  // removal/onDone path and the title is not constructed early.
  await page.evaluate(()=>window.__scenes.top().update(18));
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='title',{timeout:10000});

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='difficulty-select',{timeout:10000});
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='warning',{timeout:10000});
  await page.keyboard.press('Enter');
  await page.keyboard.press('n');
  await page.waitForFunction(()=>window.__chunkParity?.().screen==='game',{timeout:20000,polling:100});
  await page.waitForFunction(()=>window.__chunkSurferPixelMesh?.bankStatus?.()?.bank==='explore',{timeout:15000,polling:100});
  await page.evaluate(()=>window.__probe.warpCell(15,12));
  await page.keyboard.press('f');
  await new Promise((resolve)=>setTimeout(resolve,750));

  const live=await page.evaluate(()=>({
    parity:window.__chunkParity(),
    motion:window.__chunkSurferMotion.status(),
    voices:window.__probe.voices(),
    bank:window.__chunkSurferPixelMesh.bankStatus(),
  }));
  assert.equal(live.parity.renderer,'3d');
  assert.equal(live.motion.inRogue,true);
  assert.equal(live.motion.storyMode,true);
  assert.equal(live.voices,0,'legacy 2D sample voices must stay silent in story mode');
  assert.ok(live.bank.bank,'a generated material bank must remain resident');
  await page.screenshot({path:path.join(output,'02-game.png')});

  // Missing keyup during alt-tab must be cleared, and a fresh press must work.
  await page.keyboard.down('w');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>window.__chunkSurferMotion.status().input.held.length===0,{timeout:5000});
  const blurred=await page.evaluate(()=>window.__chunkSurferMotion.status());
  assert.match(blurred.motionResetReason,/blur/);
  await page.keyboard.up('w');

  await page.evaluate(async()=>{ await window.__probe.audioSuspend(); window.dispatchEvent(new Event('focus')); });
  await page.waitForFunction(()=>window.__probe.audio().actx==='running',{timeout:10000,polling:100});

  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='pause',{timeout:5000});
  await page.screenshot({path:path.join(output,'03-pause.png')});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='pause',{timeout:5000});

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,renderer:live.parity.renderer,bank:live.bank.bank,voices:live.voices,blurReason:blurred.motionResetReason,output}));
} finally {
  await browser.close();
}
