// THE MACHINE, SITTING THERE.
//
// The A-1000 in MONITOR — the state a player looks at longest and the one no
// other harness reaches: verify-take-screen forces a take, which is RECORD.
// This opens the face the way a player does, with [r], and shoots it at both
// supported widths.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-recorder-face.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;
const TAG = process.env.TAG || 'recorder';
const MODE = process.env.MODE || 'monitor';

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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent(LENS)}`,
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

// Stand where the player stood in the report, with the setup behind him so [r]
// is the machine rather than the level check.
await page.evaluate(() => {
  window.__probe.testRun();
  window.__probe.godWarpGetIn();
  window.__probe.setFlags(['setup.levels', 'setup.waypoint', 'combat.trained', 'bag.taken']);
});
await sleep(1200);

for (const [name, w, h] of [['wide', 1280, 760], ['narrow', 960, 600]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(600);
  if (MODE === 'record') {
    await page.evaluate(() => window.__probe.setRecording(true));
    await sleep(2200);
    await page.evaluate(() => window.__probe.noise(0.09));
    await sleep(1200);
  } else if (MODE === 'battle') {
    await page.evaluate(() => window.__probe.battle(false));
    await sleep(9000);
  } else if (MODE === 'hud') {
    await sleep(1200);
  } else {
    await page.keyboard.press('r');
    await sleep(1600);
  }
  const scene = await top();
  await page.screenshot({ path: `artifacts/${TAG}-${MODE}-${name}.png` });
  console.log(`  ${TAG}-${MODE}-${name}.png   scene=${scene}`);
  if (MODE === 'monitor') { await page.keyboard.press('Escape'); await sleep(700); }
}
await browser.close();
