// WHY THE RECORDING HALLUCINATIONS NEVER SHOWED UP.
//
// Rolls one real forty-five second take in a dark studio and reports, second by
// second, which gate the beat closed on and whether a body was placed — then
// screenshots the first few beats that land, because "it fired" and "you could
// see it" turned out to be different questions. Measured 2026-08-27: the
// director started four events in one take and placed a body for every one,
// and the opaque DA-1000 overlay covered all four from the shins up.
//
//   npx vite --port 5199 --host 127.0.0.1
//   npm run verify:recording-hallucination        # TORCH=1 to roll with the light on
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.URL || 'http://127.0.0.1:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required',
         '--disable-renderer-backgrounding','--disable-background-timer-throttling'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  window.__diffusion = { ready: Promise.resolve(), stats:{criticalBank:'calm'}, activateBank: async()=>true, retry: async()=>true };
});
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0,300)));

const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const wait = (fn, t = 300000) => page.waitForFunction(fn, { timeout: t });

await page.goto(`${BASE_URL}/index.html?nomic=1&sam=0&skiptut=1&nothink=0`, { waitUntil:'domcontentloaded', timeout:60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000); }
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

// ---- IS ANYTHING RINGING AT THE TITLE? (issue 1 regression check happens earlier; here we just play)
await page.evaluate(() => window.__probe.testRun());
await sleep(1800);
for (let i = 0; i < 8; i++) {
  const ready = await page.evaluate(() => window.__chunkParity?.().screen === 'game' && !window.__scenes?.top?.()?.id);
  if (ready) break;
  await page.keyboard.press(i % 2 ? 'Escape' : 'Enter');
  await sleep(400);
}

// Warp to a recordable room. Studio B3 is the authored review fallback.
console.log('warp', await page.evaluate(() => window.__probe.godWarpHook('studio-b3')));
await sleep(1200);

const setup = await page.evaluate(() => {
  const s = window.__probe;
  // light OFF is what the beat requires
  const rec = s.rec();
  return { world: s.world(), rec: { phase: rec.phase, light: rec.light }, pos: s.pos() };
});
console.log('setup', JSON.stringify(setup));

const TORCH = process.env.TORCH === '1';
await page.evaluate((on) => { if (window.__probe.rec().light !== on) window.__probe.setTorch(on); }, TORCH);
console.log('torch', TORCH);
// The level-check fallback stops any six-second take at B3 while setup.levels
// is unset. Clear it so this measures the beat and not the tutorial.
console.log('levels', await page.evaluate(() => { window.__probe.setFlags(['setup.levels','combat.trained']); return window.__probe.flag('setup.levels'); }));
console.log('recording', await page.evaluate(() => window.__probe.setRecording(true)));

import fs from 'node:fs';
const OUT = 'artifacts/hallucination-review';
fs.mkdirSync(OUT, { recursive: true });
let shots = 0;
const samples = [];
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const frame = await page.evaluate(() => {
    const h = window.__probe.recordingHallucination();
    const r = window.__probe.rec();
    return {
      why: h.why, active: !!h.director.active, kind: h.director.active?.kind || null,
      body: !!h.body, props: h.propInstances.length,
      elapsed: +(r.takeElapsed || 0).toFixed(1), light: r.light, phase: r.phase, spoiled: r.spoiled,
      hushBody: !!(window.__probe.hushBody?.()?.secondary),
    };
  });
  samples.push(frame);
  console.log(i, JSON.stringify(frame));
  if (frame.props > 0 && shots < 4) {
    shots += 1;
    await page.screenshot({ path: `${OUT}/hallucination-${shots}-${frame.why.reason}.png` });
    console.log('  shot', shots, JSON.stringify(await page.evaluate(() => {
      const h = window.__probe.recordingHallucination();
      return { body: h.body && {x:+h.body.x.toFixed(2), y:+h.body.y.toFixed(2), strength:h.body.strength, glow:h.body.glow, mode:h.body.mode},
               props: h.propInstances, hushBody: window.__probe.hushBody?.() || null,
               scene: window.__probe.sceneStats?.() || null, pos: window.__probe.pos() };
    })));
  }
  if (frame.phase !== 'recording') break;
}

await browser.close();
