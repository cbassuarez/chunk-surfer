// THE MACHINE, OPENED WITH [R].
//
// Everything here is a keypress the player makes, because the point of the
// change is that the recorder is now an object you operate rather than a verb
// you fire. Four frames: the machine idle, browsing the tapes, playing a chosen
// one, and refusing with the reason on the panel.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-recorder.mjs
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
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
const press = async (key, code) => { await page.keyboard.press(key); await sleep(300); };

await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&skiptut=1&nothink=0&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000); }
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

// Give the run a couple of tapes so the machine has something to list.
await page.evaluate(async () => {
  const PB = await import('/src/game/playback.js');
  const REC = await import('/src/game/recordist.js');
  for (const [room, print] of [['main_b3', true], ['the_tub', false]]) {
    PB.beginTake(room, { x: 2, y: 2 });
    if (print) { PB.noteAudible(room, 0, .7); PB.noteAudible(room, 1, .4); }
    PB.notePresence(room, .5, 11);
    REC.addTake(room, { contaminated: !print });
    PB.sealTake(room);
  }
});
await sleep(400);

const shot = async (name) => {
  await sleep(450);
  await page.screenshot({ path: `artifacts/recorder-${name}.png` });
  const st = await page.evaluate(() => window.__scenes?.top?.()?.debugState?.() || null);
  console.log(`${name.padEnd(9)} scene=${await top()}  ${st ? JSON.stringify({ sel: st.selectedKey, browsing: st.browsing, notice: st.notice }) : ''}`);
};

await press('r');                 // take the machine out
await shot('idle');
await press('ArrowDown'); await press('ArrowDown');   // cursor to TAKES
await press('Enter');
await shot('browse');
await press('Enter');             // play the highlighted tape
await sleep(1500);
await shot('playing');
await browser.close();
