// HOW MUCH LIGHT IS ACTUALLY ON A WALL?
//
// Everything so far has inferred the scene luminance from the ink it produced.
// This reads it directly: ?pixelMeshSource=world renders the raw PBR instead of
// the one-bit encode (uDebugSource == 1.0 → finalColor = c), so the numbers below
// ARE the y the halftone is handed.
//
// The two numbers to compare against, for `explore`:
//   blackPoint 0.005  → byte 1.3   — under this, tone is exactly 0, no marks ever
//   whitePoint 0.46   → byte 117   — at this, solid white
// A room whose walls sit under byte 1.3 cannot be dithered by any screen, at any
// exposure. That is the difference between "the style is wrong" and "there is no
// light in here".
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-room-light.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:8000';
// name → runtime cell. See the coordinate note in verify-getin-tone.mjs: these
// are runtime cells (authored × PLAN_SCALE), and one cell is half a metre.
const ROOMS = [
  ['get-in (ambient .028, one seam)', 118, 27],
  ['loading bay (ambient .17, sky)', 149, 402],
];

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

await page.goto(`http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0&pixelMeshSource=world&diffusion=${encodeURIComponent(LENS)}`,
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
console.log('in game, rendering raw PBR.');
console.log('source:', JSON.stringify(await page.evaluate(() => window.__probe.pixelMesh?.() ?? null)));

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

// Split the frame into bands. The camera looks level, so the top of the view is
// ceiling, the middle is wall, the bottom is floor — crude, but it is the
// difference the complaint is about.
const bands = () => page.evaluate(() => {
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const x0 = Math.round(c.width * 0.10), w = Math.round(c.width * 0.60);
  const read = (y0, y1) => {
    const h = y1 - y0;
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
    const vals = [];
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      vals.push(y); sum += y;
    }
    vals.sort((a, b) => a - b);
    const pct = (p) => +vals[Math.floor(p * (vals.length - 1))].toFixed(2);
    // Under byte 1.3 the tone curve's black point zeroes it outright.
    const dead = vals.filter((v) => v < 1.3).length / vals.length;
    return {
      mean: +(sum / vals.length).toFixed(2), p50: pct(0.5), p90: pct(0.9), max: pct(1),
      underBlackPoint: +(100 * dead).toFixed(1),
    };
  };
  const H = c.height;
  return {
    ceiling: read(Math.round(H * 0.05), Math.round(H * 0.28)),
    wall: read(Math.round(H * 0.34), Math.round(H * 0.60)),
    floor: read(Math.round(H * 0.66), Math.round(H * 0.92)),
  };
});

for (const [name, x, y] of ROOMS) {
  await page.evaluate(([a, b]) => window.__probe.warp(a, b), [x, y]);
  await new Promise((r) => setTimeout(r, 5000));
  if (!await recover()) { console.log(`  (lost the world warping to ${name})`); break; }
  for (const torch of [false, true]) {
    await page.evaluate((v) => window.__probe.setTorch(v), torch);
    await new Promise((r) => setTimeout(r, 2500));
    await recover(4);
    const b = await bands();
    console.log(`\n${name} — torch ${torch ? 'ON' : 'OFF'}`);
    for (const k of ['ceiling', 'wall', 'floor']) {
      const v = b[k];
      console.log(`  ${k.padEnd(8)} mean ${String(v.mean).padStart(6)}  p50 ${String(v.p50).padStart(6)}  p90 ${String(v.p90).padStart(6)}  max ${String(v.max).padStart(6)}  under black point ${v.underBlackPoint}%`);
    }
    await page.screenshot({ path: `artifacts/roomlight-${name.split(' ')[0]}-${torch ? 'on' : 'off'}.png` });
  }
}

await browser.close();
