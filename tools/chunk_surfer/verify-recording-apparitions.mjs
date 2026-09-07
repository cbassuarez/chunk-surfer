// WHY THE RECORDING APPARITIONS DO NOT SHOW.
//
// The eligibility gate has eight conditions and reports which one refused. This
// rolls a real take and reads that reason every second instead of arguing with
// the conditions from the outside — the last bug in this gate was a threshold
// that only ever passed for players who had declined the microphone.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-recording-apparitions.mjs
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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await sleep(400); }
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);
await page.evaluate(() => window.__probe.testRun());

// PAST THE TUTORIAL FIGHT. The scripted training encounter interrupts the first
// take at about six seconds, and the hallucination gate needs fifteen — so an
// untrained run can never reach it and the harness would only ever measure that.
await page.evaluate(() => window.__probe.setFlags(['combat.trained', 'setup.levels']));
// The gate wants darkness. The torch being on is one of the eight refusals.
await page.evaluate(() => window.__probe.setTorch(false));
const started = await page.evaluate(() => {
  const before = window.__probe.rec();
  window.__probe.setRecording(true);
  const after = window.__probe.rec();
  return { beforePhase: before.phase, afterPhase: after.phase, listening: after.listening };
});
console.log('setRecording  ', JSON.stringify(started));

const seen = new Map();
for (let i = 0; i < 20; i += 1) {
  await sleep(700);
  const s = await page.evaluate(() => {
    const h = window.__probe.recordingHallucination();
    const rec = window.__probe.rec();
    return {
      reason: h.why?.reason, placed: !!h.why?.placed, started: h.why?.started,
      figures: h.propInstances?.length || 0,
      recording: !!rec.recording, elapsed: +(rec.takeElapsed || 0).toFixed(1),
      phase: rec.phase, spoiled: rec.spoiled, spoilReason: rec.spoilReason, stalled: rec.stalled,
      light: window.__probe.torch?.().on,
      scene: window.__scenes?.top?.()?.id || null,
      blocksWorld: !!window.__scenes?.blocksWorld?.(),
    };
  });
  console.log(`t=${String(s.elapsed).padStart(5)}s rec=${String(s.recording).padEnd(5)} phase=${String(s.phase).padEnd(10)} scene=${String(s.scene).padEnd(18)} blocked=${String(s.blocksWorld).padEnd(5)} reason=${String(s.reason).padEnd(14)} fig=${s.figures}`);
  if (s.figures > 0) { console.log(`  <-- APPARITIONS PRESENT: ${s.figures} figures`); break; }
}
await page.screenshot({ path: 'artifacts/recording-apparitions.png' });
await browser.close();
