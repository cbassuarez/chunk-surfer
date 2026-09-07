// THE FIRST SCREEN, and the opening scene's music.
//
// Two things this proves:
//   · the display notice stands ahead of the licence and the lens, on its own
//     ground — no tableau plate, no boot weather, no faceplate;
//   · the opening scene bed actually starts on the front-end path, which is the
//     path every ordinary launch takes. It used to start only in the arrival
//     scene, which that path never pushes.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-display-notice.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)));
const wait = (f, t = 300000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// NOTE: no ?nodisplaynotice here — the notice is the thing under test.
await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&nothink=1&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
await sleep(700);

console.log('first scene   ', await top(), '  <-- must be display-notice');
// Three frames, seconds apart: the preview windows have to actually move, or it
// is a diagram again.
for (const [n, waitMs] of [['a', 0], ['b', 2600], ['c', 2600]]) {
  if (waitMs) await sleep(waitMs);
  await page.screenshot({ path: `artifacts/display-notice-${n}.png` });
}
await page.screenshot({ path: 'artifacts/display-notice.png' });

// IT MUST NOT AUTOSKIP. Nothing about this screen is on a timer; the only way
// past it is a key. Sat on for fifteen seconds it is still there.
await sleep(15000);
const held = await top();
console.log('after 15s idle', held, held === 'display-notice' ? '  <-- did not autoskip' : '  <-- AUTOSKIPPED');
if (held !== 'display-notice') { await browser.close(); throw new Error('the display notice skipped itself'); }

// It ignores the key that launched the game, then takes any key.
await page.keyboard.press('Enter');
await sleep(400);
console.log('after a key   ', await top());

if (await top() !== 'headphone-notice') throw new Error('headphone advisory must follow window advisory');
await page.screenshot({ path: 'artifacts/headphone-notice.png' });
await page.keyboard.press('Enter');
await sleep(400);

if (await top() === 'eula') { await page.keyboard.press('Enter'); await sleep(400); }
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits', 120000);
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);
await sleep(2500);

// ── DOES THE OPENING SCENE HAVE ITS MUSIC ────────────────────────────────────
// __probe.audio() surfaces story-audio's own audioState(), which reports the
// opening bed directly.
const bed = await page.evaluate(() => {
  const a = window.__probe?.audio?.() || null;
  if (!a) return null;
  return { ctx: a.ctx, openingBedLoaded: a.openingBedLoaded, openingBed: a.openingBed, song: a.songTrack };
});
console.log('opening bed   ', JSON.stringify(bed));
console.log(bed?.openingBed ? '  <-- the opening scene has its music' : '  <-- STILL SILENT');
await browser.close();
