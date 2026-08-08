// THE ENCOUNTER TRANSITION, FRAME BY FRAME.
//
// The lead-in is under a second — hold .18, loss .42, tear .30 — so it cannot be
// caught by taking one screenshot and hoping. This triggers a real fight and
// then photographs as fast as it can, tagging every frame with the phase the
// scene reports, so each beat gets at least one picture.
//
//   (real lens on :8000)   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/shot-encounter.mjs
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

for (let i = 0; i < 20; i += 1) {
  const m = await page.evaluate(() => window.__probe.surfaceDream?.()?.marks || null);
  if (m && (m.engraved ?? 0) > 0) break;
  await new Promise((r) => setTimeout(r, 5000));
}

// Stand somewhere lit so the frozen world frame is worth freezing, then pick a
// fight. This is the same trigger the regression smoke uses.
await page.evaluate(() => window.__probe.warpCell?.(80, 31, 2));
await new Promise((r) => setTimeout(r, 2500));
const started = await page.evaluate(() => window.__probe.battleId('natatorium', false));
console.log('battle triggered:', started);

const phase = () => page.evaluate(() => {
  const s = window.__scenes?.top?.();
  return { id: s?.id ?? null, phase: s?.view?.()?.phase ?? null, leadIn: s?.view?.()?.leadIn ?? null };
});

const seen = new Set();
for (let i = 0; i < 26; i += 1) {
  const at = await phase();
  if (at.id === 'encounter-start' && at.phase && !seen.has(at.phase)) {
    seen.add(at.phase);
    const file = `artifacts/encounter-${seen.size}-${at.phase}.png`;
    await page.screenshot({ path: file });
    console.log(`  ${at.phase.padEnd(7)} → ${file}`);
  }
  if (at.phase === 'select') break;
  await new Promise((r) => setTimeout(r, 60));
}

// And the fight it hands off to, so the tiles can be compared with the tool rail
// they are supposed to look like.
await page.keyboard.press('Enter');
await page.waitForFunction(() => /^battle:/.test(window.__scenes?.top?.()?.id || ''), { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: 'artifacts/encounter-5-fight.png' });
console.log('  fight   → artifacts/encounter-5-fight.png');

await browser.close();
