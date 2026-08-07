// Is the loading bay apron actually outdoors, and does the sky over it read as
// weather rather than as sparkle?
//
// Three claims, none of which any other suite can check — the node tests never
// build a GL context and `vite build` never compiles GLSL:
//
//   1. The shader still compiles. F.WALLED added a flag branch to cellAt and
//      vnoise() added a function; a link failure here is silent everywhere else.
//   2. The apron is open. It was 224 roofed cells, which is why the game opened
//      under a ceiling with no moon in it.
//   3. The bay's walls are the building, not ninety-metre slabs. That is the
//      thing F.WALLED exists to prevent, and the reason the apron was roofed in
//      the first place.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-bay-sky.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const output = path.resolve(process.env.OUT || 'artifacts/tone');
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

const shaderTrouble = [];
page.on('pageerror', (e) => shaderTrouble.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (/shader|GLSL|link|compile/i.test(t)) shaderTrouble.push(`console: ${t}`);
});

const wait = (f, t = 240000) => page.waitForFunction(f, { timeout: t });
await page.goto('http://127.0.0.1:5199/index.html?skiptut=1&nomic=1&sam=0&diffusion='
  + encodeURIComponent('ws://127.0.0.1:5198'), { waitUntil: 'domcontentloaded', timeout: 60000 });
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
for (let i = 0; i < 30 && await page.evaluate(() => !!window.__scenes?.top?.()?.id); i++) {
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 250));
}

const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 45)); };
await page.evaluate(() => { window.__probe.setTorchBattery(1); window.__probe.setTorch(true); });

// Authored (53,7) is the spawn on the apron; (53,10) is deeper toward the mouth.
// Yaw is the look bearing, pitch lifts the eye toward the moon.
const shots = [
  ['tone-01-getin-wall.png', 66, 10, Math.PI / 2, 0.0],
  ['tone-02-getin-floor.png', 66, 10, Math.PI / 2, -0.4],
];
for (const [name, x, y, yaw, pitch] of shots) {
  await page.evaluate((ax, ay) => window.__probe.warpCell(ax, ay, 0), x, y);
  await page.evaluate((ay2, ap) => window.__probe.faceYaw(ay2, ap), yaw, pitch);
  await settle();
  await page.screenshot({ path: path.join(output, name) });
  console.log('captured', name);
}

console.log(shaderTrouble.length ? `SHADER/PAGE TROUBLE:\n  ${shaderTrouble.join('\n  ')}` : 'shader compiled, no page errors');
await browser.close();
if (shaderTrouble.length) process.exit(1);
