// WHICH CUES ACTUALLY FIRE, stage by stage through the opening.
//
// Written because static analysis missed the last one. The opening scene bed
// had a caller, in coldopen.js — inside makeArrivalScene, which the front-end
// path never pushes. Grepping for callers said it was wired; the game was
// silent. So this samples story-audio's own audioState() at each stage and
// prints what is actually running.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-audio-cues.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)));
const wait = (f, t = 300000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const live = async (stage) => {
  const a = await page.evaluate(() => window.__probe?.audio?.() || null);
  if (!a) { console.log(`${stage.padEnd(18)} (no probe yet)`); return; }
  const on = [];
  if (a.song > 0.0005) on.push(`song:${a.songTrack}`);
  if (a.openingBed && !a.openingBed.stopping) on.push('openingBed');
  if (a.booth > 0.0005) on.push('booth');
  if (a.tape > 0.0005) on.push('tape');
  if (a.typing?.playing) on.push('typing');
  console.log(`${stage.padEnd(18)} ctx=${String(a.ctx).padEnd(9)} ${on.length ? on.join(' · ') : '— silent —'}`);
};

await page.goto(`http://127.0.0.1:${PORT}/index.html?nodisplaynotice=1&nomic=1&sam=0&nothink=1&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await sleep(500); }
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits', 120000);
await sleep(1200); await live('opening-credits');
// Boot weather is its own audio system; audioState never sees it, and it is
// torn down when the credits end — so it has to be asked HERE.
const weatherNow = await page.evaluate(() => window.__probe?.bootWeather?.() || null);
console.log('  boot weather    ', weatherNow ? JSON.stringify(weatherNow).slice(0, 160) : 'NONE');

await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await sleep(1200); await live('title');

await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await live('difficulty-select');
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await live('warning');
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

await sleep(2500); await live('arrival walk');

// THE HANDOFF. At the lodge window the opening bed is supposed to hand off to
// the title track on a downbeat — commitOpeningSceneBedToColdOpenTitle — and
// park the guard conversation behind a hold scene until that beat lands. With
// no bed running it used to report scheduled:false and skip the hold, so the
// beat lost its timing as well as its music.
// commitOpeningSceneBedToColdOpenTitle schedules the downbeat only when BOTH a
// bed is running and the title buffer is loaded; miss either and it drops to a
// 0.04s crossfade and reports scheduled:false, which is what skipped the hold.
const pre = await page.evaluate(() => {
  const S = window.__probe.audio();
  return { bed: !!S.openingBed && !S.openingBed.stopping, titleLoaded: !!S.songLoaded };
});
console.log(`handoff ready     bed=${pre.bed} titleLoaded=${pre.titleLoaded}`
  + (pre.bed && pre.titleLoaded ? '   <-- the downbeat can schedule' : '   <-- IT WILL FALL BACK'));

await browser.close();
