// THE IMPOSSIBLE STAIR, ENTERED ON FOOT.
//
// Two things this proves that a unit test cannot:
//
//   · The west stair — basement to the floor above, CLIMBING — is the one that
//     opens it, by walking east across the trigger seam at x=95.
//   · The main open-well spiral does not, at any of its flights. It used to be
//     the default, which is what this change is undoing: a helix sweeps 180
//     degrees a flight, so an impossibly long one reads as a camera stuck in a
//     turn rather than a building that has grown, and after the second
//     revolution the length stops meaning anything at all.
//
// It also walks the whole flight at the ordinary cadence and reports how long
// that actually took, because "too long" is a stopwatch question.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-stair-anomaly.mjs
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
await page.evaluate(() => window.__probe.testRun());
// The stair is unlit and darkness is its escape, so a torchless test run
// photographs as a black frame. Light it, or the shots say nothing.
await page.evaluate(() => window.__probe.setTorch(true));

const stair = () => page.evaluate(() => {
  const s = window.__probe.stairAnomaly();
  return { active: s.active, stairId: s.environment.stairId, travel: s.environment.travel, status: s.ledger.status };
});

console.log('selected  ', JSON.stringify(await stair()));

// ── THE SPIRAL MUST NOT OPEN IT ──────────────────────────────────────────────
// Stand on the main open-well stair and climb. This was the default trigger.
await page.evaluate(() => window.__probe.warpCell(134, 52, 0));
await sleep(500);
for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowUp'); await sleep(110); }
const afterSpiral = await stair();
console.log('spiral    ', JSON.stringify(afterSpiral), afterSpiral.active ? '  <-- WRONG, the helix opened it' : '  (correctly inert)');

// ── THE WEST STAIR MUST ──────────────────────────────────────────────────────
// Walk east across the seam at x=95, y 44..49, climbing out of the basement.
//
// NOTE: the trigger compares RUNTIME coordinates (`px===95 && nx===96`), not
// logical plan cells, so this warps with warpRuntime. Warping by logical cell
// lands somewhere else entirely and the seam is never crossed.
const at = () => page.evaluate(() => {
  const p = window.__probe.pos();
  return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
});
await page.evaluate(() => window.__probe.warpRuntime(94, 46, 1));
await sleep(600);
console.log('standing  ', JSON.stringify(await at()), 'facing east, one cell west of the seam');
for (let i = 0; i < 8 && !(await stair()).active; i++) {
  await page.keyboard.press('ArrowUp');
  await sleep(220);
  console.log(`  step ${i}   `, JSON.stringify(await at()), JSON.stringify(await stair()));
}
const opened = await stair();
console.log('west stair', JSON.stringify(opened), opened.active ? '  <-- opened on foot' : '  <-- FAILED to open');
if (!opened.active) { await browser.close(); throw new Error('the west stair did not open the anomaly'); }
await page.screenshot({ path: 'artifacts/stair-anomaly-entered.png' });

// ── HOW LONG IS IT, REALLY ───────────────────────────────────────────────────
//
// Counted in TREADS, and the seconds derived from the game's own move interval.
// Wall clock here is the harness's key-press rate, not a player's walk, so
// reporting it would overstate or understate the climb depending on how fast
// this loop happens to run.
// Read in Node, not in the page: a dynamic import inside page.evaluate makes
// vite re-serve the module graph and the execution context goes out from under
// the harness mid-climb.
const { MOVE_MS: interval } = await import('../../src/config.js');
let treads = 0;
while ((await stair()).active && treads < 1200) {
  await page.keyboard.press('ArrowUp');
  treads += 1;
  await sleep(30);
}
const climbed = await page.evaluate(() => window.__probe.stairAnomaly());
console.log(`climb      ${treads} treads x ${interval}ms = ${(treads * interval / 1000).toFixed(1)}s at the ordinary walk`);
console.log(`           active=${climbed.active} (it ends rather than looping)`);
await page.screenshot({ path: 'artifacts/stair-anomaly-out.png' });
await browser.close();
