// THE VOCAL FLOOR, WALKED.
//
// The academic floor was eight identical 8x6 rooms on a perfect 2x4 lattice off
// a corridor that ran twenty-seven metres to a blank wall. It is now four vocal
// studios, a theory room bent around a service chase, a store, and a vaulted
// chamber room at the head of the corridor with the gallery beyond it.
//
// The floor has two light fittings, both in the gallery, one of them named
// '-failing'. Everything here is photographed by torch because that is how it is
// actually played — without __probe.setTorch(true) every frame is black.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-academic.mjs
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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&skiptut=1&nothink=1&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
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
await page.evaluate(() => { window.__probe.testRun(); window.__probe.setTorch(true); });

// Authored cells: the academic origin is y240, so local y + 240.
const shot = async (name, x, y, facing, note) => {
  await page.evaluate(([cx, cy, f]) => window.__probe.warpCell(cx, cy, f), [x, y, facing]);
  await sleep(900);
  await page.screenshot({ path: `artifacts/academic-${name}.png` });
  const zone = await page.evaluate(() => window.__probe.light?.()?.zone ?? null);
  console.log(`${name.padEnd(16)} (${x},${y}) f${facing}  ${note}`);
};

//                 name              x    y    facing
await shot('corridor-north', 9, 262, 0, 'the corridor, looking north to the chamber room');
await shot('studio-glass',   9, 256, 3, 'a vocal studio through its wired glass');
await shot('theory-glass',   9, 253, 1, 'the theory room through its wired glass');
await shot('chamber',        8, 245, 0, 'the chamber room, vaulted, looking north');
await shot('chamber-south',  8, 243, 2, 'the chamber room looking back at the corridor mouth');
await shot('vestibule',     20, 244, 1, 'the vestibule, and the door into the gallery');
await shot('breach-room',   16, 265, 0, 'the room the breach opens into');
await browser.close();
