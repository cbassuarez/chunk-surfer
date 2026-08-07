// Does the engraving reach the screen?
//
// Every previous step in this work was plumbing that could be proved headlessly.
// This is the one that cannot: the whole claim is that the generated material
// now decides WHERE MARKS FALL, and the only way to know is to look at the
// pixels the recorder produced.
//
// The test is an A/B against the thing it replaced. markGain(0) restores the
// procedural hash the walls were drawn with before the lens ever reached them,
// so the same camera, same frame, same everything, differing only in whether
// the model gets a say. If the two images are identical, the engraving is not
// connected. If they differ wildly, it has stopped being an engraving and
// become a filter.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-engraving.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const base = 'http://127.0.0.1:5199';
const out = process.env.OUT || '/tmp';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--use-angle=metal', '--no-sandbox', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('CONSOLE:', m.text().slice(0, 240)); });
let navigations = 0;
// Fires once for the initial load; more than that means the page reloaded under
// us, which silently invalidates every sample taken afterwards.
page.on('framenavigated', () => { if (++navigations > 1) console.log('!! the page reloaded mid-run — samples are void'); });
const wait = (fn, t = 240000) => page.waitForFunction(fn, { timeout: t });

await page.goto(`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
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
await page.keyboard.press('f');

const settle = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 40)); };
// A dressed, well-lit wall: the practice wing's service room, which also holds
// the material with the strongest measured grain.
await page.evaluate(() => window.__probe.warp(113, 130, 3));
await settle(60);

// Let the banks arrive so there is an engraving to show at all.
for (let i = 0; i < 20 && (await page.evaluate(() => window.__probe.surfaceDream()?.marks?.engraved || 0)) < 4; i++) {
  await new Promise((r) => setTimeout(r, 1000));
}
const marks = await page.evaluate(() => window.__probe.surfaceDream()?.marks || null);
console.log('marks:', JSON.stringify(marks));
console.log('scene before shots:', await page.evaluate(() => window.__scenes?.top?.()?.id),
  '| screen:', await page.evaluate(() => window.__chunkParity?.()?.screen));

const shoot = async (gain, name) => {
  const applied = await page.evaluate((g) => window.__probe.markGain(g), gain);
  await settle(30);
  console.log(`  shot ${name}: gain=${applied} scene=${await page.evaluate(() => window.__scenes?.top?.()?.id)}`);
  const png = await page.screenshot({ encoding: 'base64' });
  writeFileSync(`${out}/engraving-${name}.png`, Buffer.from(png, 'base64'));
  // Compare the recorder's own output, not the HUD: sample the canvas.
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const off = document.createElement('canvas');
    off.width = 320; off.height = 200;
    const cx = off.getContext('2d');
    cx.drawImage(c, 0, 0, off.width, off.height);
    return Array.from(cx.getImageData(0, 0, off.width, off.height).data);
  });
};

const off = await shoot(0, 'off');
const on = await shoot(0.55, 'on');

let changed = 0;
let sumOff = 0;
let sumOn = 0;
for (let i = 0; i < off.length; i += 4) {
  const a = 0.2126 * off[i] + 0.7152 * off[i + 1] + 0.0722 * off[i + 2];
  const b = 0.2126 * on[i] + 0.7152 * on[i + 1] + 0.0722 * on[i + 2];
  sumOff += a; sumOn += b;
  if (Math.abs(a - b) > 24) changed += 1;
}
const texels = off.length / 4;
const pct = (changed / texels) * 100;
console.log(`\nprocedural hash : mean luminance ${(sumOff / texels).toFixed(2)}`);
console.log(`engraved        : mean luminance ${(sumOn / texels).toFixed(2)}`);
console.log(`marks that moved: ${pct.toFixed(2)}% of the frame`);
console.log(`wrote ${out}/engraving-off.png and ${out}/engraving-on.png`);

const engraved = (marks?.engraved || 0) > 0;
let ok = true;
const check = (label, pass) => { console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}`); if (!pass) ok = false; };
console.log();
check('the page did not reload mid-run', navigations <= 1);
check('material slots are engraved', engraved);
// It has to change the image, or it is not connected...
check(`the engraving changes which marks fall (${pct.toFixed(2)}%)`, pct > 0.5);
// ...but it must remain an engraving. The recorder's exposure is the form
// model; the material decides where marks clot WITHIN it, never how bright the
// room is. A large luminance shift means it has become a filter.
check(`overall exposure is preserved (${Math.abs(sumOn - sumOff) / texels < 6 ? 'held' : 'drifted'})`,
  Math.abs(sumOn - sumOff) / texels < 6);

await browser.close();
process.exit(ok ? 0 : 1);
