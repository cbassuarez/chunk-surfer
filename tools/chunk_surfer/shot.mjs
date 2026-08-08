// A LOOK AT ONE THING.
//
// Boots the game, stands where you say, faces where you say, photographs it.
// Exists because every question in this scene ("can you read the back of the
// van", "does the shelter say stand here") is answered by looking, and the boot
// chain is fiddly enough that nobody should retype it.
//
// AT is a semicolon-separated list of `name:x,y,facing` in RUNTIME cells — that
// is authored cells x PLAN_SCALE (2), one cell being half a metre. Props and
// lights are authored in METRES, so a prop at 66.0 is runtime cell 132. Warping
// with an authored pair drops you inside solid rock without a word of complaint.
// facing: 0=N 1=E 2=S 3=W.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   AT='van-w:127,410,1;van-back:132,417,0' node tools/chunk_surfer/shot.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:8000';
const PORT = Number(process.env.PORT)||5199;
const SOURCE = process.env.SOURCE || 'final';
const TORCH = process.env.TORCH !== '0';
const FAST = process.env.FAST === '1';
const WAIT_LIGHT = process.env.WAIT_LIGHT || '';
const SHOTS = (process.env.AT || 'van-w:127,410,1').split(';').filter(Boolean).map((s) => {
  const [name, coords] = s.split(':');
  const [x, y, f] = coords.split(',').map(Number);
  return { name, x, y, f: Number.isFinite(f) ? f : 1 };
});

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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&skiptut=1&nothink=0&pixelMeshSource=${SOURCE}&diffusion=${encodeURIComponent(LENS)}`,
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

for (let i = 0; !FAST && i < 24; i++) {
  const m = await page.evaluate(() => window.__probe.surfaceDream?.()?.marks || null);
  if (m && (m.engraved ?? 0) > 0) break;
  await new Promise((r) => setTimeout(r, 5000));
}
await page.evaluate((on) => window.__probe.setTorch(on), TORCH);
for (const s of SHOTS) {
  await page.evaluate(([x, y, f]) => window.__probe.warp(x, y, f), [s.x, s.y, s.f]);
  await new Promise((r) => setTimeout(r, 3500));
  if (!await recover()) { console.log(`  (lost the world at ${s.name})`); break; }
  if(WAIT_LIGHT){
    await page.waitForFunction((id)=>window.__probe?.light?.()?.rig?.some((light)=>light.id===id&&light.intensity>.05),{timeout:12000},WAIT_LIGHT);
    await new Promise((r)=>setTimeout(r,120));
  }
  const where = await page.evaluate(() => ({
    zone: window.__probe.whitePointZone?.()?.scale ?? null,
    lights: window.__probe?.light?.()?.rig?.map?.((light) => light.id) ?? [],
    red: window.__probe?.light?.()?.rig?.filter?.((light)=>light.kind==='emergency'&&light.intensity>0) ?? [],
    shadows: window.__probe.props?.()?.pack?.emergencyShadowInstances ?? 0,
  }));
  const file = `artifacts/shot-${s.name}.png`;
  await page.screenshot({ path: file });
  console.log(`${s.name.padEnd(16)} (${s.x},${s.y}) facing ${s.f}  ${file}  ${JSON.stringify(where)}`);
}

await browser.close();
