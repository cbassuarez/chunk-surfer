// THE BACK OF THE RECORDER, PHOTOGRAPHED.
//
// The patchbay is the one part of this that a unit test cannot see: whether the
// cable reads as a cable, whether a run looks like a run, and whether pulling
// the head of one warns before it takes the rest. Four frames.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-patchbay.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;

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
const press = async (key, code = key) => { await page.evaluate(([k, c]) => window.__scenes.top()?.key?.({ key: k, code: c }), [key, code]); await sleep(260); };

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

// Hand the run every lead the world grants, so the whole panel is reachable.
await page.evaluate(() => {
  window.__probe.setFlags(['bag.taken', 'has.interface', 'pin.academic', 'pin.tower', 'pin.gallery', 'pin.yard']);
});
await sleep(400);
console.log('leads:', JSON.stringify(await page.evaluate(() => window.__probe.build?.() ?? null)));

const shot = async (name) => {
  await sleep(500);
  await page.screenshot({ path: `artifacts/patchbay-${name}.png` });
  console.log(`${name.padEnd(14)} artifacts/patchbay-${name}.png  scene=${await top()}`);
};

await page.evaluate(() => window.__probe.bagOpen?.('skills'));
await sleep(900);
await press('4', 'Digit4');
await shot('open');                      // nothing patched

// Patch a run three deep down the torch column.
for (let i = 0; i < 3; i += 1) { await press('Enter', 'Enter'); await press('ArrowDown', 'ArrowDown'); }
await shot('run-patched');               // the cable, lit

// Back to the head of the run and ask to pull it.
for (let i = 0; i < 3; i += 1) await press('ArrowUp', 'ArrowUp');
await press('Enter', 'Enter');
await shot('pull-confirm');              // the warning that names what it drops

await press('Enter', 'Enter');
await shot('pulled');                    // every lead back

await browser.close();
