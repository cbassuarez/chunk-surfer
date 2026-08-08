// IS THE RAIN DRAWN, OR DRAWN AND THEN LOST?
//
// The gate is intact — every walkable dock cell carries F.SKY, the new district
// glyphs set sky:true, visualEffectsEnabled() defaults true, and a sky ray leaves
// tHit < 0 so zView is uPropFar and all three sheets are admitted. Yet there is
// no rain outdoors.
//
// Two candidates, and one run separates them:
//   * NOT DRAWN     — sweeping __probe.rain() changes nothing in the RAW pass
//   * DRAWN, EATEN  — the raw pass changes and the encoded frame does not, which
//                     means the one-bit halftone is swallowing it. Rain is added
//                     as `col += vec3(.30,.33,.40)*rain*backlight` where backlight
//                     rises with scene luminance, so it is loudest over the sky
//                     the halftone has already driven to solid white and quietest
//                     over the dark ground where a streak could actually show.
//
// Run with SOURCE=world for the raw PBR and SOURCE=final for the encode.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   SOURCE=world node tools/chunk_surfer/verify-rain.mjs
//   SOURCE=final node tools/chunk_surfer/verify-rain.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:8000';
const SOURCE = process.env.SOURCE || 'final';

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

await page.goto(`http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0&pixelMeshSource=${SOURCE}&diffusion=${encodeURIComponent(LENS)}`,
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
console.log(`in game, source=${SOURCE}`);

async function recover(tries = 10) {
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

// Stand in the yard proper. Runtime cells: the spawn is authored (57,207) →
// runtime (115,415), and vigilEligible wants ZONE.dock with py >= 400.
await page.evaluate(() => window.__probe.warp(149, 402));
await new Promise((r) => setTimeout(r, 4000));
if (!await recover()) throw new Error('lost the world after the warp');

// Rain is the only thing in a still frame that MOVES, so two frames a moment
// apart tell you whether anything is falling. Reported per band because the
// hypothesis is specifically that rain reads over dark ground and not over the
// sky the halftone has already saturated.
const sample = () => page.evaluate(() => {
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(c.width * 0.08), w = Math.round(c.width * 0.64);
  const y0 = Math.round(c.height * 0.06), h = Math.round(c.height * 0.86);
  const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
  return { w, h, px: Array.from(out) };
});

function compare(a, b) {
  const h = a.h, w = a.w;
  const band = (lo, hi) => {
    let diff = 0, sum = 0, n = 0;
    for (let y = Math.floor(h * lo); y < Math.floor(h * hi); y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        diff += Math.abs(a.px[i] - b.px[i]); sum += a.px[i]; n++;
      }
    }
    return { moved: +(diff / n).toFixed(3), luma: +(sum / n).toFixed(2) };
  };
  return { sky: band(0, 0.42), ground: band(0.52, 1) };
}

console.log('\nrain  band    meanLuma  frame-to-frame movement');
for (const amount of [0, 1, 4]) {
  await page.evaluate((v) => window.__probe.rain(v), amount);
  await new Promise((r) => setTimeout(r, 1200));
  if (!await recover(4)) { console.log(`  (lost the world at rain ${amount})`); break; }
  const a = await sample();
  await new Promise((r) => setTimeout(r, 260));
  const b = await sample();
  const r = compare(a, b);
  console.log(`${String(amount).padEnd(5)} sky     ${String(r.sky.luma).padEnd(9)} ${r.sky.moved}`);
  console.log(`${String(amount).padEnd(5)} ground  ${String(r.ground.luma).padEnd(9)} ${r.ground.moved}`);
  await page.screenshot({ path: `artifacts/rain-${SOURCE}-${amount}.png` });
}
await page.evaluate(() => window.__probe.rain(1));
await browser.close();
