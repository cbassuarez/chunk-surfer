// THE VAN SHUTS, AND YOU WATCH IT SHUT.
//
// Two things this proves that a unit test cannot: the leaves are actually in the
// frame at both poses, and the swing between them is visible rather than a
// single-frame snap. It photographs the back of the van open, three moments
// through the swing, and shut.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-van-doors.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;
// Behind the van, looking at the doors. The van is authored (66,208), which is
// runtime (132,416); facing 2 is south, back up the road toward the gate.
const AT = (process.env.AT || '132,426,0').split(',').map(Number);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
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

async function recover(tries = 10) {
  for (let i = 0; i < tries; i++) {
    const at = await page.evaluate(() => ({ screen: window.__chunkParity?.().screen ?? null, scene: window.__scenes?.top?.()?.id ?? null }));
    if (at.screen === 'game' && !at.scene) return true;
    await page.keyboard.press(i % 2 ? 'Escape' : 'Enter');
    await sleep(700);
  }
  return false;
}

await page.evaluate((on) => window.__probe.setTorch(on), true);
await page.evaluate(([x, y, f]) => window.__probe.warpRuntime(x, y, f), AT);
await sleep(3000);
if (!await recover()) { console.log('lost the world'); await browser.close(); process.exit(1); }

const shot = async (name) => {
  const state = await page.evaluate(() => window.__probe.vanDoors());
  await page.screenshot({ path: `artifacts/van-${name}.png` });
  console.log(`${name.padEnd(10)} open=${state.open.toFixed(3)} shut=${state.shut} landed=${state.landed} waypoint=${state.waypoint}  artifacts/van-${name}.png`);
  return state;
};

await shot('open');
// The bag has to come off the shelf before the doors can be shut, the same way
// the player has to do it. The waypoint stays on the van across that.
await page.evaluate(() => window.__probe.setFlags(['bag.taken']));
await sleep(200); await shot('bag-taken');
await page.evaluate(() => window.__probe.shutVan());
await sleep(380); await shot('swing-1');
await sleep(380); await shot('swing-2');
await sleep(380); await shot('swing-3');
await sleep(1200); await shot('shut');

await browser.close();
