// IS THE ENGRAVING'S GRAIN ACTUALLY LIVE?
//
// formStipple() elongates marks along a surface's grain, and without that grain
// every mark is round — "isotropic gravel", in its own words, which is the
// pointillism. The grain comes from deriveMarkField() over GENERATED BANK
// PIXELS, so it only exists once the real lens has produced banks. The mock lens
// never does, which means every capture taken against it has been measuring the
// sentinel path (markSample.r == 0) rather than the look.
//
// This points the game at the real lens and reports what the mark field actually
// contains. Everything about mark style is downstream of this reading.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-mark-field.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:8000';
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
page.on('console', (m) => { if (/mark|lens|shader/i.test(m.text())) console.log('  page:', m.text().slice(0, 160)); });

const wait = (f, t = 600000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);

await page.goto(`http://127.0.0.1:5199/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') {
  await page.keyboard.press('Enter');
  await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000);
}
await wait(() => window.__chunkParity?.().screen === 'game', 600000);
for (let i = 0; i < 40 && await top(); i++) { await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 250)); }

console.log('in game. waiting on the real lens to populate banks…');
let last = '';
for (let i = 0; i < 90; i++) {
  const s = await page.evaluate(() => {
    const surf = window.__probe.surfaces?.() || {};
    const d = window.__diffusion?.stats || {};
    return {
      marks: surf.marks || null,
      banksReady: d.banksReady, completed: d.completed, total: d.total,
      state: d.state, criticalReady: d.criticalReady,
    };
  });
  const line = JSON.stringify(s);
  if (line !== last) { console.log(`  [${i * 10}s]`, line); last = line; }
  if (s.marks?.ready && s.criticalReady) break;
  await new Promise((r) => setTimeout(r, 10000));
}

const verdict = await page.evaluate(() => {
  const surf = window.__probe.surfaces?.() || {};
  return { marks: surf.marks || null, surfaces: surf.ready ?? null };
});
console.log('\nFINAL:', JSON.stringify(verdict, null, 1));
await browser.close();
