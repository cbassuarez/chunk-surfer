// Fixed-camera captures of the yard, for the arrival pass.
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node <this> [tag]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const tag = process.argv[2] || 'now';
const output = path.resolve(process.env.OUT || `artifacts/yard-shots/${tag}`);
fs.mkdirSync(output, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (f, t = 240000) => page.waitForFunction(f, { timeout: t });

await page.goto('http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=1&diffusion='
  + encodeURIComponent('ws://127.0.0.1:5198'), { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await page.evaluate(() => window.__scenes?.top?.()?.id) === 'eula') {
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
await page.evaluate(() => { window.__probe.setTorchBattery(1); window.__probe.setTorch(true); });
// Pin the night so two runs of this script are comparable.
const NIGHT = Number(process.env.NIGHT ?? 0.37);
await page.evaluate((n) => window.__probe.nightSeed(n), NIGHT);

// Authored coords. The yard's logical address is origin (50,200) + its local
// cell, so yard-local (lx,ly) is authored (50+lx, 200+ly).
// facing: 0 = -y, 1 = +x (east, the building), 2 = +y (deep yard), 3 = -x (west, the city)
const SHOTS = [
  { id: 'a-mid-yard-east',   at: [75, 207], facing: 1, note: 'mid-yard, down the sightline at the building' },
  { id: 'b-mid-yard-west',   at: [75, 207], facing: 3, note: 'mid-yard, out of the gate at the city' },
  { id: 'c-mid-yard-deep',   at: [75, 207], facing: 2, note: 'mid-yard, along the yard where the phantom cliff was' },
  { id: 'd-deep-yard-east',  at: [78, 240], facing: 1, note: 'deep in the yard, the building broadside' },
  { id: 'e-deep-yard-west',  at: [78, 240], facing: 3, note: 'deep in the yard, looking out' },
  { id: 'f-apron-west',      at: [98, 207], facing: 3, note: 'on the apron, the shot out of the bay mouth' },
  { id: 'g-road-east',       at: [62, 207], facing: 1, note: 'the spawn, facing the way he walks' },
  { id: 'i-far-corner-east',   at: [55, 250], facing: 1, note: 'the far corner: the whole elevation broadside' },
  { id: 'j-far-corner-north',  at: [55, 250], facing: 2, note: 'the far corner, along the back range' },
  { id: 'k-gate-east',         at: [70, 207], facing: 1, note: 'just inside the gate, the approach' },
];

for (const shot of SHOTS) {
  const at = await page.evaluate(([x, y, f]) => window.__probe.warpCell(x, y, f), [...shot.at, shot.facing]);
  // let the VFD memory settle and the rain move
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(output, `${shot.id}.png`) });
  console.log(shot.id.padEnd(20), JSON.stringify(at), shot.note);
}

// The sky, neck as far back as it goes, swept around the compass. This is where
// cloud and the moon have to be findable or they are not in the game.
for (const [name, facing] of [['w', 3], ['sw', 3], ['nw', 3], ['n', 0], ['s', 2]]) {
  await page.evaluate(([f]) => window.__probe.warpCell(75, 207, f), [facing]);
  if (name === 'sw') await page.evaluate(() => window.__probe.look(0.78, 0));
  if (name === 'nw') await page.evaluate(() => window.__probe.look(-0.78, 0));
  for (let i = 0; i < 40; i++) await page.evaluate(() => window.__probe.look(0, 0.05));
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(output, `h-sky-${name}.png`) });
  console.log('sky', name, JSON.stringify(await page.evaluate(() => window.__probe.lookAngles())));
}

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
await browser.close();
