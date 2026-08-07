// WHAT DOES THE GET-IN ACTUALLY NEED TO READ?
//
// The zone white point was derived from each room's authored ambient on the
// assumption that ambient predicts screen luminance. It does not: the get-in is
// authored at .028, which the arithmetic said should dither at ~18% ink, and the
// room measures 0.25% — 99.8% pure black, single-pixel marks, anisotropy 1.05.
//
// So stop deriving it and measure it. This sweeps the white-point scale in the
// real room and reports the ink each value buys, which is the only honest way to
// pick ZONE_WHITE_POINT_K.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/sweep-white-point.mjs
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
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)));

const wait = (f, t = 300000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);

await page.goto(`http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') {
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
console.log('in game.');

// Beats keep firing over a stationary player — the lens calibration arrived
// mid-sweep on the last run. Dismiss whatever is on top and get back to the
// world rather than throwing the whole reading away.
async function recover(tries = 12) {
  for (let i = 0; i < tries; i++) {
    const at = await page.evaluate(() => ({
      screen: window.__chunkParity?.().screen ?? null,
      scene: window.__scenes?.top?.()?.id ?? null,
    }));
    if (at.screen === 'game' && !at.scene) return true;
    await page.keyboard.press(i % 2 ? 'Escape' : 'Enter');
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

for (let i = 0; i < 24; i++) {
  const m = await page.evaluate(() => window.__probe.surfaceDream?.()?.marks || null);
  if (m && (m.engraved ?? 0) > 0) { console.log(`  engraved ${m.engraved} slots`); break; }
  await new Promise((r) => setTimeout(r, 5000));
}

// Open floor in the get-in, eleven metres clear of the grey-door seam (whose
// trigger throws the run back to the opening credits).
await page.evaluate(() => window.__probe.warp(118, 27));
await new Promise((r) => setTimeout(r, 5000));
if (!await recover()) throw new Error('could not get back into the world after the warp');

const measure = () => page.evaluate(() => {
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(c.width * 0.10), y0 = Math.round(c.height * 0.28);
  const w = Math.round(c.width * 0.72) - x0, h = Math.round(c.height * 0.80) - y0;
  const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
  let on = 0, sum = 0; const n = w * h;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y; if (y > 40) on++;
  }
  return { onPct: +(100 * on / n).toFixed(2), meanLuma: +(sum / n).toFixed(2) };
});

console.log('\nzone scale in force:', JSON.stringify(await page.evaluate(() => window.__probe.whitePointZone?.())));
console.log('\nscale   whitePoint   ink%    meanLuma');
for (const scale of [0.274, 0.15, 0.08, 0.04, 0.02, 0.012, 0.008, 0.005, 0.003]) {
  await page.evaluate((v) => window.__probe.whitePointScale(v), scale);
  await new Promise((r) => setTimeout(r, 1800));
  if (!await recover(4)) { console.log(`  (lost the world at scale ${scale})`); break; }
  const m = await measure();
  console.log(`${String(scale).padEnd(7)} ${(0.46 * scale).toFixed(4).padEnd(12)} ${String(m.onPct).padEnd(7)} ${m.meanLuma}`);
  await page.screenshot({ path: `artifacts/getin-wp-${String(scale).replace('.', 'p')}.png` });
}
await page.evaluate(() => window.__probe.whitePointScale(null));
await browser.close();
