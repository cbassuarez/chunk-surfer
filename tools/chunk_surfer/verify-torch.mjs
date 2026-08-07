// Does the flashlight light the room?
//
// This exists because of a real failure: a shader edit left `oMark` declared in
// the wrong one of this file's seven fragment programs, the scene program failed
// to compile, and r3d init died. The game still booted, still ran its loop, and
// the torch key still flipped REC.lightOn() — it simply could not light anything,
// because there was no renderer. Every state flag said the torch was on.
//
// So this measures the only thing that settles it: mean luminance of the actual
// rendered canvas, torch off versus torch on. A renderer that is silently dead
// cannot pass it.
//
// Needs the mock lens and dev server (lens=0 stalls at lens calibration):
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-torch.mjs
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--use-angle=metal', '--no-sandbox', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
const wait = (fn, t = 240000) => page.waitForFunction(fn, { timeout: t });

await page.goto(`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await page.evaluate(() => window.__scenes.top().id) === 'eula') {
  await page.keyboard.press('Enter');
  await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000);
}
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 40)); };
// Somewhere with walls in front of the camera: the practice-wing corridor.
await page.evaluate(() => window.__probe.warp(121, 131, 3));
await settle();

// Mean luminance of the actual rendered canvas.
const brightness = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const off = document.createElement('canvas');
  off.width = 160; off.height = 100;
  const cx = off.getContext('2d');
  cx.drawImage(c, 0, 0, off.width, off.height);
  const d = cx.getImageData(0, 0, off.width, off.height).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
});

const before = await brightness();
const stateBefore = await page.evaluate(() => window.__probe.torch());
await page.keyboard.press('f');
await settle(40);
const after = await brightness();
const stateAfter = await page.evaluate(() => window.__probe.torch());

console.log(`torch off : state.on=${stateBefore.on}  frame luminance ${before.toFixed(2)}`);
console.log(`torch on  : state.on=${stateAfter.on}  frame luminance ${after.toFixed(2)}`);
console.log(`delta     : ${(after - before).toFixed(2)}`);
console.log(`battery   : ${stateAfter.battery}   soldered=${stateAfter.soldered} gutted=${stateAfter.gutted}`);
if (errors.length) console.log('errors:', errors.slice(0, 3));

const toggled = stateBefore.on !== stateAfter.on;
const lit = after > before + 1.0;
console.log(`\n  ${toggled ? 'ok  ' : 'FAIL'}  the key toggles torch state`);
console.log(`  ${lit ? 'ok  ' : 'FAIL'}  turning it on actually lights the room`);
await browser.close();
process.exit(toggled && lit ? 0 : 1);
