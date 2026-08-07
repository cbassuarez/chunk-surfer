// IS THE GET-IN WALL BELOW THE HALFTONE FLOOR?
//
// The halftone selects a cell when `tone + (uCoverage-0.5)*0.35` beats the mask.
// For `explore` (blackPoint .005, whitePoint .46, gamma .92, coverage .40) the
// bias is -0.035, so any tone under 0.035 is clamped away entirely. The getIn
// zone is authored at intensity .028 (conservatory-lights.js:52), which predicts
// an on-pixel fraction of roughly 3% — sparse dust, not an engraving.
//
// This measures the real fraction in the room, and A/Bs the grain so we can see
// whether mark direction can reach this frame at all.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-getin-tone.mjs
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
// A shader that fails to compile degrades silently to "continuing without VFD
// mesh", which looks like a look change rather than a break. Surface it.
page.on('console', (m) => {
  const t = m.text();
  if (/shader|unavailable|WebGL|compile|link/i.test(t)) console.log('  CONSOLE:', t.slice(0, 200));
});

const wait = (f, t = 300000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
// Every reading must prove it was taken in the world. A run that quietly falls
// back to the menu still produces a perfectly plausible all-black histogram —
// that is how the first post-fix measurement reported 100% black and meant
// nothing at all.
const where = () => page.evaluate(() => ({
  screen: window.__chunkParity?.().screen ?? null,
  scene: window.__scenes?.top?.()?.id ?? null,
}));
async function assertInWorld(label) {
  const at = await where();
  if (at.screen !== 'game' || at.scene) {
    throw new Error(`${label}: not in the world — ${JSON.stringify(at)}`);
  }
  return at;
}

await page.goto(`http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
// The opening is a walk, not a splash: the scene chain has to be driven the way
// ending-shots.mjs drives it, or `screen === 'game'` never arrives.
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
if (await page.evaluate(() => window.__scenes?.top?.()?.id === 'arrival')) {
  await wait(() => window.__scenes?.top?.()?.id !== 'arrival', 60000);
}
console.log('in game.', JSON.stringify(await where()));

// Let banks stream in before judging the look. The mark stats hang off
// r3dSurfaceDreamStats (probe: surfaceDream), NOT r3dSurfaceStats — reading the
// latter's non-existent `.marks` silently waited the full two minutes every run.
for (let i = 0; i < 24; i++) {
  const m = await page.evaluate(() => window.__probe.surfaceDream?.()?.marks || null);
  if (m && (m.engraved ?? 0) > 0) { console.log(`  engraved ${m.engraved} slots after ${i * 5}s:`, JSON.stringify(m)); break; }
  if (i === 23) console.log('  banks never engraved a slot:', JSON.stringify(m));
  await new Promise((r) => setTimeout(r, 5000));
}
await assertInWorld('after bank wait');

// Stand in the get-in room and face a wall. THREE coordinate spaces have to line
// up to get here and each one silently produces a plausible picture of the wrong
// place:
//   local   (15,9)  — the ground level's own grid
//   authored(65,9)  — plus the level's origin {x:50,y:0}; the grey-door seam
//                     light at x=65.5 confirms it
//   runtime          — times PLAN_SCALE (2), which is what warp() takes, and one
//                     runtime cell is half a metre
// Warping with either of the first two lands you INSIDE SOLID ROCK without a
// word of complaint — zone 0, everything black — which is what the first two
// rounds of these numbers were actually measuring.
//
// And not the middle of the room either: the grey-door seam sits at runtime
// (131,8), and standing on it fires the door beat and throws the run back to the
// opening credits. (118,27) is fully open floor, eleven metres clear of it.
await page.evaluate(() => window.__probe.warp(118, 27));
await new Promise((r) => setTimeout(r, 6000));
await assertInWorld('after warp');
{
  // ZONE.getIn is 16 (see floorplan/legend.js) and its authored ambient is .028,
  // which resolves to a white-point scale of ~0.274. Landing in ZONE.none (~0.215)
  // means the warp missed the room and every number after this is about somewhere
  // else — which is exactly what happened before this check existed.
  const wp = await page.evaluate(() => window.__probe.whitePointZone?.() ?? null);
  console.log('after warp, white point:', JSON.stringify(wp));
  if (!wp || Math.abs(wp.scale - 0.274) > 0.02) {
    throw new Error(`warp did not land in ZONE.getIn — white point scale ${wp?.scale} (expected ~0.274)`);
  }
}

// Fraction of lit pixels. Measured over a central box so the HUD panels and the
// status bars cannot pad the count — a wall reading has to be of the wall.
const measure = () => page.evaluate(() => {
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(c.width * 0.10), x1 = Math.round(c.width * 0.72);
  const y0 = Math.round(c.height * 0.28), y1 = Math.round(c.height * 0.80);
  const d = c.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let on = 0, sum = 0; const n = d.length / 4;
  const hist = new Array(8).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y; if (y > 40) on++;
    hist[Math.min(7, Math.floor(y / 32))]++;
  }
  return { box: `${x1 - x0}x${y1 - y0}`, onPct: +(100 * on / n).toFixed(2), meanLuma: +(sum / n).toFixed(2),
    hist: hist.map((v) => +(100 * v / n).toFixed(1)) };
});

// IS IT A DOT OR IS IT A STROKE?
//
// The whole pointillism argument reduces to one number: how long a run of lit
// pixels is, along its own direction, versus across it. Isolated dots give the
// same short run in every direction (ratio ~1). Hatching gives a long run along
// the stroke and a short one across it (ratio >> 1; 3 is the bar). Sampled along
// four axes so a hatch at any of them is caught.
const strokes = () => page.evaluate(() => {
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
  // Mean length of a maximal run of lit pixels when walking along (dx,dy).
  const meanRun = (dx, dy) => {
    let runs = 0, total = 0, run = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (on(x, y) && !on(x - dx, y - dy)) {          // a run starts here
          run = 0;
          let cx = x, cy = y;
          while (on(cx, cy) && run < 64) { run++; cx += dx; cy += dy; }
          runs++; total += run;
        }
      }
    }
    return runs ? +(total / runs).toFixed(3) : 0;
  };
  const axes = { e: meanRun(1, 0), se: meanRun(1, 1), s: meanRun(0, 1), sw: meanRun(-1, 1) };
  const vals = Object.values(axes).filter((v) => v > 0);
  const ratio = vals.length ? +(Math.max(...vals) / Math.min(...vals)).toFixed(2) : 0;
  return { axes, anisotropy: ratio };
});

console.log('\nmarks:', JSON.stringify((await page.evaluate(() => window.__probe.surfaceDream?.()?.marks || null))));
console.log('white point:', JSON.stringify(await page.evaluate(() => window.__probe.whitePointZone?.() ?? null)));

for (const g of [0.70, 0.0, 2.0]) {
  await page.evaluate((v) => window.__probe.markGrain(v), g);
  await new Promise((r) => setTimeout(r, 2500));
  await assertInWorld(`grain ${g}`);
  console.log(`grain ${g.toFixed(2)} →`, JSON.stringify(await measure()), JSON.stringify(await strokes()));
  await page.screenshot({ path: `artifacts/getin-tone-grain-${String(g).replace('.', 'p')}.png` });
}

await browser.close();
