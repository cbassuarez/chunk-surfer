// WHAT YOUR OWN VOICE FETCHES, and that it dies with the take.
//
// A sound during a take used to do exactly one thing: end the take. The hunt
// began afterwards, by which point the minute was over. Now a sound past the
// spoil threshold sends something after you while you are still holding the
// minute — and it must cease to exist the moment the take stops, however it
// stops.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-take-hunter.mjs
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
await page.evaluate(() => {
  window.__probe.testRun();
  // Past the tutorial, which is explicitly not a trap and hunts nobody.
  window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint']);
});

const read = async (label) => {
  const s = await page.evaluate(() => {
    const monitor = window.__probe.micEffective().monitor;
    return {
      h: window.__probe.takeHunter(),
      // THE POINT OF THE WHOLE THING: it is on the player's own instrument.
      // presenceRms is what the LEVEL meter draws, and what notePresence writes
      // onto the tape second by second. A needle climbing in a silent room is
      // this game's central device.
      presence: +(monitor.presenceRms || 0).toFixed(3),
      db: +(monitor.db || -96).toFixed(1),
      hushDb: +(monitor.hushDb || -96).toFixed(1),
    };
  });
  const h = s.h;
  console.log(`${label.padEnd(28)} cells=${h.cells.toFixed(1).padStart(5)} pressure=${String(h.pressure).padEnd(5)}`
    + ` | METER presence=${String(s.presence).padEnd(5)} drawn=${String(s.db).padEnd(6)} heard-of-you=${s.hushDb}`);
  return { ...h, ...s };
};

// ── A LOUD NOISE DURING A TAKE ───────────────────────────────────────────────
await page.evaluate(() => window.__probe.setRecording(true));
await sleep(900);
await read('take rolling');
// Past the spoil threshold: this is the noise the building is supposed to hear.
// Past the monitor trip but UNDER the spoil threshold (0.18): the whole point
// is that the minute keeps running while something comes.
await page.evaluate(() => window.__probe.noise(0.10));
await sleep(400);
const armed = await read('after a loud noise');
console.log(armed.active ? '  <-- something came' : '  <-- NOTHING CAME');

// A frightened man does not fall silent on command. Keep flinching, the way the
// hallucination that fetched this would keep making you, and watch it close AND
// watch the needle climb.
for (let i = 0; i < 9; i += 1) {
  await page.evaluate(() => window.__probe.noise(0.09));
  await sleep(900);
  await read(`  still flinching +${((i + 1) * 0.9).toFixed(1)}s`);
}
await page.screenshot({ path: 'artifacts/take-hunter.png' });

// ── AND THE STOP KEY DOES NOT WORK ───────────────────────────────────────────
// Ending the take yourself is the clean escape, so it is the thing that fails.
console.log('\n  try to stop it:');
for (let i = 1; i <= 10; i += 1) {
  const r = await page.evaluate(() => window.__probe.tryStopTake());
  console.log(`   press ${String(i).padStart(2)}  still recording=${String(r.still).padEnd(5)} tries=${r.tries}/${r.needs}`);
  await sleep(220);
  // The frame that matters is a REFUSED press with the transport still running,
  // not the release afterwards.
  if (i === 3) await page.screenshot({ path: 'artifacts/take-hunter-cancel.png' });
  if (!r.still) { console.log('   <-- it let go on press ' + i); break; }
}
await page.evaluate(() => window.__probe.setRecording(true));
await page.evaluate(() => window.__probe.armTakeHunter('scream'));
await sleep(600);

// ── AND SILENCE SENDS IT AWAY ────────────────────────────────────────────────
// Your voice fetched it; your silence is what shakes it. It has to give back
// what it gained and hold quiet long enough to mean it.
console.log('\n  now hold your breath:');
for (let i = 0; i < 10; i += 1) { await sleep(900); await read(`  silent +${((i + 1) * 0.9).toFixed(1)}s`); }

// ── AND IT DIES WITH THE TAKE ────────────────────────────────────────────────
await page.evaluate(() => window.__probe.setRecording(false));
await sleep(700);
const after = await read('take stopped');
console.log(after.active ? '  <-- IT OUTLIVED THE TAKE (wrong)' : '  <-- gone with the take');

// And it cannot be armed outside one.
await page.evaluate(() => window.__probe.armTakeHunter('probe'));
await sleep(400);
const outside = await read('armed with no take');
console.log(outside.active ? '  <-- ARMED OUTSIDE A TAKE (wrong)' : '  <-- refuses to exist outside a take');
await browser.close();
