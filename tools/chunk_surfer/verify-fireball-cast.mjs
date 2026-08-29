// WHAT A FIREBALL ACTUALLY LOOKS LIKE ON THE STAGE.
//
// Opens a fight, waits for the ranged clock to put comets in the air, and
// screenshots them mid-flight. The layers only read as layers at speed, so
// arbitrary frames are the wrong thing to look at: this shoots on the beat and
// records what the exchange thought was in the air at that moment.
//
//   npx vite --port 5199 --host 127.0.0.1
//   npm run verify:fireball
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.URL || 'http://127.0.0.1:5199';
const OUT = 'artifacts/fireball-review';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

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
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const wait = (fn, t = 300000) => page.waitForFunction(fn, { timeout: t });

await page.goto(`${BASE_URL}/index.html?nomic=1&sam=0&skiptut=1`, { waitUntil:'domcontentloaded', timeout:60000 });
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
await page.evaluate(() => window.__probe.testRun());
await sleep(1500);
for (let i = 0; i < 8; i += 1) {
  if (await page.evaluate(() => window.__chunkParity?.().screen === 'game' && !window.__scenes?.top?.()?.id)) break;
  await page.keyboard.press(i % 2 ? 'Escape' : 'Enter'); await sleep(400);
}

const which = process.env.BATTLE || 'hall';
console.log('battle', await page.evaluate((id) => window.__probe.battleId(id, false, 'pre-recording-4'), which));
await sleep(1200);
// Past the arrival/dialogue into the live deck.
for (let i = 0; i < 40; i += 1) {
  const phase = await page.evaluate(() => window.__scenes.top()?.battleView?.()?.phase || null);
  if (['tool', 'move'].includes(phase)) break;
  await page.keyboard.press('Enter'); await sleep(220);
}
console.log('phase', await page.evaluate(() => window.__scenes.top()?.battleView?.()?.phase || null));

let shot = 0;
for (let i = 0; i < 400 && shot < 8; i += 1) {
  await sleep(90);
  const frame = await page.evaluate(() => {
    const view = window.__scenes.top()?.battleView?.();
    const fire = view?.fireball;
    if (!fire?.active) return null;
    return {
      rays: fire.active.rays.map((ray) => `${ray.id}:${ray.state}@${ray.progress.toFixed(2)}`),
      inflight: fire.active.rays.filter((ray) => ray.state === 'inflight').length,
      charge: fire.charge,
    };
  });
  if (!frame) continue;
  // Two things are worth looking at: a comet well clear of the Surfer's hand,
  // and the frame a comet lands on, which is the only time the panel-wide
  // engulf is on screen.
  const landing = frame.rays.some((r) => /:impact/.test(r));
  const spread = frame.rays.filter((r) => /inflight@0\.[3-8]/.test(r)).length;
  if (!landing && !spread) continue;
  shot += 1;
  await page.screenshot({ path: `${OUT}/fireball-${shot}${landing ? '-impact' : ''}.png` });
  console.log(shot, landing ? 'IMPACT' : 'flight', frame.rays.join(' '));
}
console.log('shots', shot, '→', OUT);
await browser.close();
