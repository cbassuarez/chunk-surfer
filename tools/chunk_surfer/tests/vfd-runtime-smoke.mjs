import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5173';
const lens=process.env.MOCK_LENS_URL||'ws://127.0.0.1:8765';
const browser=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();
await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
const errors=[];
page.on('pageerror',(error)=>errors.push(error.message));
await page.goto(`${base}/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0&diffusion=${encodeURIComponent(lens)}`,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>window.__chunkSurferPixelMesh?.status?.()?.framesRendered>4,{timeout:240000,polling:250});
try {
  await page.waitForFunction(()=>window.__chunkSurferPixelMesh?.bankStatus?.()?.bank==='calm',{timeout:30000,polling:100});
} catch (error) {
  console.error(JSON.stringify(await page.evaluate(()=>({
    mesh:window.__chunkSurferPixelMesh?.status?.(),
    look:window.__chunkSurferPixelMesh?.lookStatus?.(),
    bank:window.__chunkSurferPixelMesh?.bankStatus?.(),
    diffusion:window.__diffusion?.stats,
    scene:window.__scenes?.top?.()?.id||null,
  }))));
  console.error(JSON.stringify({pageErrors:errors}));
  throw error;
}
const snapshot=await page.evaluate(()=>({
  mesh:window.__chunkSurferPixelMesh.status(),
  look:window.__chunkSurferPixelMesh.lookStatus(),
  bank:window.__chunkSurferPixelMesh.bankStatus(),
  scene:window.__scenes.top()?.id||null,
}));
assert.deepEqual(errors,[]);
assert.equal(snapshot.mesh.shaderReady,true);
assert.equal(snapshot.mesh.lastError,null);
assert.equal(snapshot.bank.bank,'calm');
assert.equal(snapshot.bank.pendingBank,null);
console.log(JSON.stringify(snapshot));
await browser.close();
