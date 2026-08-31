// THE MIC TEST, ADVANCING ON ITS OWN.
//
// The complaint this fixes: acknowledgement needed 0.45s continuously above an
// RMS the player's "check, one, two" often never reached, and if it never
// tripped you sat through fifteen seconds of a panel that looked stuck — which
// is exactly when a player presses [R] a second time. Now the bar is what a
// spoken phrase actually produces, the panel says whether it has heard you yet,
// and hearing you is what starts the take. No second press.
//
// The level here is INJECTED (`MIC.micTest`), not recorded. Nothing the
// player's room makes is read, held or written by this harness, which is the
// same rule the feature itself keeps: the microphone is analyser-only and the
// test is never saved.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-mic-test.mjs
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

// NOTE: no ?nomic — the mic test must actually run. The level is injected below.
await page.goto(`http://127.0.0.1:${PORT}/index.html?sam=0&skiptut=1&nothink=0&diffusion=${encodeURIComponent(LENS)}`,
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
// [y] at the mic card. It is what makes the mic test run at all — [n] writes
// settings.mic='off' and beginMicTest correctly declines to test a mic the
// player has switched off. Answering yes here does NOT open a microphone in
// this harness: the level is injected below, and getUserMedia is never granted
// in headless Chrome, so nothing of the real room is ever heard.
await page.keyboard.press('Enter'); await page.keyboard.press('y');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

// A mic that is present and silent. Injected, not opened: `micTest` makes
// micActive() true without ever calling getUserMedia, so no real room is heard.
await page.evaluate(() => window.__probe.micDrive(0));
await sleep(400);

const probe = () => page.evaluate(() => {
  const rec = window.__probe.rec();
  return {
    scene: window.__scenes?.top?.()?.id || null,
    mic: window.__probe.micCheck(),
    rolling: !!rec.recording, listening: !!rec.listening,
  };
});
const shot = async (name) => {
  await sleep(400);
  await page.screenshot({ path: `artifacts/mictest-${name}.png` });
  console.log(`${name.padEnd(10)} ${JSON.stringify(await probe())}`);
};

// The mic test, wired exactly as the level check wires it: the callback that
// ends the test is `beginTakeNow`. (Driven directly rather than through [r] at
// the level check, because ?skiptut has already set `setup.levels` and the
// check is correctly not offered twice — the wiring under test is the same.)
const began = await page.evaluate(() => window.__probe.micTestNow());
if (!began) throw new Error('the mic test declined to run; nothing below is meaningful');
await sleep(900);

// NO KEY IS PRESSED AFTER THIS LINE. If a take rolls, it rolled itself.
await shot('silent');                   // waiting, and saying that it is waiting

await page.evaluate(() => window.__probe.micDrive({ rms: 0.09, peak: 0.16 }));  // "check, one two"
await sleep(500);
await shot('heard');                    // LEVEL OK

await page.evaluate(() => window.__probe.micDrive(0.004));                      // stop talking
await sleep(2600);
await shot('advanced');                 // ...and it went by itself

await browser.close();
