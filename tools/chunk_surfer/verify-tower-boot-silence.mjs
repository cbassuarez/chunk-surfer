// THE TOWER MUST BE SILENT OUTSIDE A RUN.
//
// Reaches a save whose chapel tower is past the foreshadow — the state the
// world-wash director restores itself from — then leaves the run and reloads
// the app, asserting the bell bus does not exist at either the title or the
// boot log. Both leaks were real: loadBuilding() restores the transport during
// app boot, and the frame loop keeps ticking the world under a title scene.
//
//   npx vite --port 5199 --host 127.0.0.1
//   node tools/chunk_surfer/verify-tower-boot-silence.mjs
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

const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const wait = (fn, t = 300000) => page.waitForFunction(fn, { timeout: t });
const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failures.push(label);
};
const bells = () => page.evaluate(() => {
  const t = window.__probe?.chapelTower?.() || {};
  return { phase: t.phase, audio: t.audio, director: t.director, peal: t.peal };
});

async function toTitle() {
  await wait(() => !!window.__scenes?.top?.()?.id);
  if (await top() === 'eula') { await page.keyboard.press('Enter'); await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000); }
  await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
  await page.evaluate(() => window.__scenes.top().update(30));
  await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
}

await page.goto(`${BASE_URL}/index.html?nomic=1&sam=0&skiptut=1`, { waitUntil:'domcontentloaded', timeout:60000 });
await toTitle();
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);
await page.evaluate(() => window.__probe.testRun());
await sleep(1500);
for (let i = 0; i < 8; i++) {
  if (await page.evaluate(() => window.__chunkParity?.().screen === 'game' && !window.__scenes?.top?.()?.id)) break;
  await page.keyboard.press(i % 2 ? 'Escape' : 'Enter'); await sleep(400);
}

// Put the tower past the foreshadow. This is the state the world wash restores.
console.log('preset', await page.evaluate(() => window.__probe.towerPreset('tower-arrival')?.phase));
await sleep(1500);
const live = await bells();
check('the tower rings inside a run', !!live.audio, { phase: live.phase, mode: live.audio?.audioMode });

// Leave the run.
console.log("title", await page.evaluate(() => window.__probe.returnToTitle()));
await sleep(1500);
if (await top() !== 'title') { await page.evaluate(() => window.__scenes.replace?.(null)); }
await sleep(2500);
const atTitle = await bells();
check('nothing rings at the title', !atTitle.audio && !atTitle.director, atTitle);

// Boot the app again against that save.
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
const atBoot = await bells();
check('nothing rings during boot', !atBoot.audio && !atBoot.director, atBoot);
await toTitle();
await sleep(2500);
const afterCredits = await bells();
check('nothing rings after the credits', !afterCredits.audio && !afterCredits.director, afterCredits);

await browser.close();
if (failures.length) { console.error('FAILED:', failures.join(', ')); process.exit(1); }
console.log('all clear');
