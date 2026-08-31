// THE RECORDING SCREEN.
//
// The one surface a screenshot is the only test for: whether the LEVEL row is
// inside its own panel, and whether anything runs past the bezel at a narrow
// viewport. Shot at two widths, because the clipping only showed at one of them.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-take-screen.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;
const TAG = process.env.TAG || 'take';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&skiptut=1&nothink=0&diffusion=${encodeURIComponent(LENS)}`,
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

// 960x600 is the game's own minimum safe viewport (below it every surface is
// replaced by a display-fault panel), so that is the narrow case the layout
// actually has to survive.
for (const [name, w, h] of [['wide', 1280, 760], ['narrow', 960, 600]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(500);
  await page.evaluate(() => window.__probe.setRecording(true));
  await sleep(1400);
  await page.screenshot({ path: `artifacts/${TAG}-${name}.png` });
  const rec = await page.evaluate(() => window.__probe.rec());
  console.log(`${name.padEnd(7)} ${w}x${h}  elapsed=${(rec.takeElapsed ?? 0).toFixed(1)}  artifacts/${TAG}-${name}.png`);
  await page.evaluate(() => window.__probe.setRecording(false));
  await sleep(300);
}

// THE OTHER TRANSPORT, on the same face. Seal a take, then play it.
await page.setViewport({ width: 1280, height: 760 });
await sleep(400);
console.log(await page.evaluate(async () => {
  const PB = await import('/src/game/playback.js');
  const REC = await import('/src/game/recordist.js');
  const room = 'main_b3';
  PB.beginTake(room, { x: 2, y: 2 });
  for (let i = 0; i < 4; i += 1) PB.noteAudible(room, i, 0.4 + i * 0.1);
  PB.notePresence(room, 0.55, 14);
  REC.addTake(room, {});
  PB.sealTake(room);
  return `sealed ${room}, playing=${!!window.__probe.play()}`;
}));
await sleep(2600);
await page.screenshot({ path: `artifacts/${TAG}-play.png` });
console.log(`play    1280x760  artifacts/${TAG}-play.png`, JSON.stringify(await page.evaluate(() => window.__probe.playback())));
await browser.close();
