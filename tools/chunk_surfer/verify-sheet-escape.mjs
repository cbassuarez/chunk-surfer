// ESCAPE BACKS OUT OF WHAT YOU ARE IN.
//
// main.js hands Escape to the pause menu unless the top scene claims it, and the
// bag never claimed it — so reading a sheet and pressing Escape opened the PAUSE
// MENU over the sheet. The only way out of a document was [E], which nobody
// guesses, because E is the interact key everywhere else.
//
// The unit test cannot see this: the intercept lives in main.js's key router,
// above the scene. It has to be pressed in a real browser.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-sheet-escape.mjs
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
const route = () => page.evaluate(() => window.__probe?.bag?.()?.route?.type ?? null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`http://127.0.0.1:${PORT}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await sleep(400); }
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

await page.evaluate(() => window.__probe.bagOpen('sheets'));
await sleep(600);
console.log(`bag open          scene=${await top()}  route=${await route()}`);

await page.keyboard.press('Enter');
await sleep(600);
console.log(`opened a sheet    scene=${await top()}  route=${await route()}`);
await page.screenshot({ path: 'artifacts/sheet-open.png' });

await page.keyboard.press('Escape');
await sleep(600);
const after = await top();
const r = await route();
console.log(`pressed ESC       scene=${after}  route=${r}`);
console.log(after === 'pause'
  ? '  <-- STILL OPENS THE PAUSE MENU (wrong)'
  : `  <-- backed out of the sheet, stayed in the bag (${r})`);
await page.screenshot({ path: 'artifacts/sheet-escape.png' });
await browser.close();
