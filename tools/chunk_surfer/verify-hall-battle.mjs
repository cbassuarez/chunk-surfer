// THE CONCERT HALL FIGHT — reported to crash on the way in and on the way out.
//
// maybeBattle fires the recording-2 encounter at takeProgress >= 0.18, which on
// a forty-five second take is 8.1 seconds. That matches the reported "crashes at
// 08 seconds of recording" exactly, so this rolls a take in the hall and
// captures whatever is actually thrown rather than guessing at it.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-hall-battle.mjs
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
// EVERYTHING, verbatim. This is a crash hunt; a truncated stack is useless.
const errors = [];
page.on('pageerror', (e) => { errors.push(String(e.stack || e)); console.log('\n=== PAGEERROR ===\n' + String(e.stack || e).slice(0, 1600)); });
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 300)); });
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

// maybeBattle wants takes.length === 1 and combat.trained, in the hall.
await page.evaluate(() => {
  window.__probe.testRun();
  window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint']);
});
// maybeBattle needs takes.length === 1 — the hall must be your SECOND take.
// __probe.seedTake is a silent no-op (markTake needs a beginTake first), so the
// tape has to be made the way the game makes one.
await page.evaluate(async () => {
  const PB = await import('/src/game/playback.js');
  const REC = await import('/src/game/recordist.js');
  PB.beginTake('main_b3', { x: 2, y: 2 });
  PB.notePresence('main_b3', .4, 10);
  REC.addTake('main_b3');
  PB.sealTake('main_b3');
});
await sleep(400);
console.log('seeded first take ', JSON.stringify(await page.evaluate(() => window.__probe.rec().takes)));
await page.evaluate(() => window.__probe.godWarpHook('concert-hall'));
await sleep(900);
const where = await page.evaluate(() => window.__probe.encounters().gates);
console.log('standing in       ', JSON.stringify(where));

await page.evaluate(() => window.__probe.setRecording(true));
console.log('\nrolling a take — the fight is due at 8.1s\n');
for (let i = 0; i < 20; i += 1) {
  await sleep(700);
  const s = await page.evaluate(() => {
    const rec = window.__probe.rec();
    return { t: +(rec.takeElapsed || 0).toFixed(1), scene: window.__scenes?.top?.()?.id || null,
      active: window.__probe.encounters().active };
  }).catch((e) => ({ dead: String(e).slice(0, 120) }));
  if (s.dead) { console.log(`  t?  <-- the page is gone: ${s.dead}`); break; }
  console.log(`  t=${String(s.t).padStart(5)}s scene=${String(s.scene).padEnd(18)} encounter=${s.active}`);
  if (s.scene && (s.scene.startsWith('battle') || s.scene === 'encounter-start')) {
    console.log('  <-- the fight opened');
    break;
  }
}
await page.screenshot({ path: 'artifacts/hall-battle.png' });

// ── AND OUT THE OTHER SIDE ───────────────────────────────────────────────────
// The second half of the report: it crashes at fight end. Play it rather than
// forcing a result, so the real resolution path runs.
console.log('\nplaying it out:');
await page.keyboard.press('Enter');
await sleep(1200);
console.log(`  confirmed into    ${await top()}`);
let last = null;
for (let i = 0; i < 220; i += 1) {
  const scene = await top().catch(() => 'DEAD');
  if (scene === 'DEAD') { console.log('  <-- the page is gone'); break; }
  if (scene !== last) { console.log(`  scene=${scene}`); last = scene; }
  if (!scene || (!scene.startsWith('battle') && scene !== 'encounter-start')) {
    console.log(`  <-- the fight ended, scene is now ${scene}`);
    break;
  }
  await page.keyboard.press(i % 5 === 4 ? 'Space' : 'Enter');
  await sleep(260);
}
await sleep(1500);
console.log(`\nafter the fight   scene=${await top()}  encounter=${await page.evaluate(() => window.__probe.encounters().active).catch(() => 'DEAD')}`);

// ── THE OTHER SITE ───────────────────────────────────────────────────────────
// The same slip existed in playbackGuest's first-reference spine, behind a
// `firstCompleteReference` gate. Exercise it: play a sealed take back.
console.log('\nplaying a sealed take back (the other roomId site):');
const before = errors.length;
// __probe.play() plays the take in the room you are standing in, so go to B3
// where the seeded tape is.
await page.evaluate(() => window.__probe.godWarpHook('studio-b3'));
await sleep(700);
await page.evaluate(() => window.__probe.play());
await sleep(3000);
console.log(`  errors during playback: ${errors.length - before}`);
console.log(`errors thrown: ${errors.length}`);
await page.screenshot({ path: 'artifacts/hall-battle-end.png' });
await browser.close();
