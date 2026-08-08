// HOW MUCH BOUNCE DOES THE ROOM NEED?
//
// Every get-in reading so far was taken with the recorder's light OFF, standing
// eleven metres from the room's only fitting. The white-point sweep is what gave
// it away: dropping the ceiling thirty-fold moved the ink from 0.27% to 0.39%,
// and a surface with any luminance at all would have blown out long before that.
// A scene that does not respond to exposure is a scene with no light in it.
//
// So this measures the room torch-off against torch-on, which is how it is
// actually played, and reports the stroke anisotropy for each.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-getin-torch.mjs
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

await page.evaluate(() => window.__probe.warp(118, 27));
await new Promise((r) => setTimeout(r, 5000));
if (!await recover()) throw new Error('lost the world after the warp');

const read = () => page.evaluate(() => {
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(c.width * 0.10), y0 = Math.round(c.height * 0.28);
  const w = Math.round(c.width * 0.72) - x0, h = Math.round(c.height * 0.80) - y0;
  const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
  const on = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 40;
  };
  const meanRun = (dx, dy) => {
    let runs = 0, total = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (!on(x, y) || on(x - dx, y - dy)) continue;
      let n = 0, cx = x, cy = y;
      while (on(cx, cy) && n < 64) { n++; cx += dx; cy += dy; }
      runs++; total += n;
    }
    return runs ? +(total / runs).toFixed(2) : 0;
  };
  let lit = 0, sum = 0; const n = w * h;
  const hist = new Array(8).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y; if (y > 40) lit++;
    hist[Math.min(7, Math.floor(y / 32))]++;
  }
  const axes = { e: meanRun(1, 0), se: meanRun(1, 1), s: meanRun(0, 1), sw: meanRun(-1, 1) };
  const vals = Object.values(axes).filter((v) => v > 0);
  return {
    onPct: +(100 * lit / n).toFixed(2), meanLuma: +(sum / n).toFixed(2),
    hist: hist.map((v) => +(100 * v / n).toFixed(1)),
    axes, anisotropy: vals.length ? +(Math.max(...vals) / Math.min(...vals)).toFixed(2) : 0,
  };
});

await page.evaluate(() => window.__probe.setTorch(true));
await new Promise((r) => setTimeout(r, 2000));
console.log('zone bounce:', JSON.stringify(await page.evaluate(() => window.__probe.bounce())));
console.log('\namount  ink%   meanLuma  hist0(black%)');
for (const amount of [0, 1, 2, 4, 6]) {
  await page.evaluate((v) => window.__probe.bounce(v), amount);
  await new Promise((r) => setTimeout(r, 2200));
  if (!await recover(6)) { console.log(`  (lost the world at ${amount})`); break; }
  const r = await read();
  console.log(`${String(amount).padEnd(7)} ${String(r.onPct).padEnd(6)} ${String(r.meanLuma).padEnd(9)} ${r.hist[0]}`);
  await page.screenshot({ path: `artifacts/getin-bounce-${amount}.png` });
}
await page.evaluate(() => window.__probe.bounce(1));
await browser.close();
