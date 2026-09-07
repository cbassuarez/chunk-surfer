// THE POOL COMES FOR YOU.
//
// The natatorium fight used to be a RECORDING battle, fired only when the tub
// happened to be your second take. Now the place is the danger: you cannot get a
// take from the coping, you have to be out in the middle of the basin, and the
// middle of the basin is what comes.
//
// This walks it. Basin runtime bounds are 156,66 -> 180,98; the centre is
// (168,82); the west access stair is at x156, y66..86.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-natatorium.mjs
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
  // Past the tutorial, or the training fight owns every first take.
  window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint']);
});

const read = async (label) => {
  const n = await page.evaluate(() => window.__probe.natatorium());
  console.log(`${label.padEnd(22)} inBasin=${String(n.inBasin).padEnd(5)} centrality=${n.centrality.toFixed(2)}`
    + ` place=${String(n.place).padEnd(7)} take=${String(n.takeAllowed).padEnd(5)}`
    + ` pressure=${String(n.pressure).padEnd(5)} refusal=${n.refusal?.reason || '—'}`);
  return n;
};

// ── ON THE DECK: no take, and nothing may ever come of standing here ─────────
await page.evaluate(() => window.__probe.warpRuntime(168, 60, 2));
await sleep(700);
await read('deck, north of it');
await sleep(6000);
const deck = await read('deck, six seconds on');

// ── THE RIM: inside, but the image is still all room ─────────────────────────
await page.evaluate(() => window.__probe.warpRuntime(158, 82, 1));
await sleep(700);
await read('just inside the rim');

// ── THE MIDDLE: the take he came for, and it comes for him ───────────────────
await page.evaluate(() => window.__probe.warpRuntime(168, 82, 1));
await sleep(700);
const middle = await read('the middle');
await page.screenshot({ path: 'artifacts/natatorium-middle.png' });

for (let i = 0; i < 24; i += 1) {
  await sleep(700);
  const scene = await top();
  const n = await page.evaluate(() => window.__probe.natatorium());
  if (i % 3 === 0) console.log(`   t+${((i + 1) * 0.7).toFixed(1)}s pressure=${n.pressure} fired=${n.fired} cleared=${n.cleared} scene=${scene}`);
  // `encounter-start` is the loadout screen the fight opens with, and it cannot
  // be declined (test/encounter-start.spec.mjs). ENTER confirms it into the
  // fight proper — an earlier version of this harness only watched for
  // `battle:` and reported that nothing came while the fight was on screen.
  if (scene === 'encounter-start') {
    const rec = await page.evaluate(() => window.__probe.rec().recording);
    console.log(`\n  <-- IT CAME at pressure ${n.pressure}, water=${n.water}`);
    console.log(`      and no take was running: recording=${rec}`);
    await page.screenshot({ path: 'artifacts/natatorium-encounter.png' });
    await page.keyboard.press('Enter');
    await sleep(1500);
    console.log(`      confirmed into ${await top()}`);
    await page.screenshot({ path: 'artifacts/natatorium-fight.png' });
    break;
  }
  if (scene && scene.startsWith('battle')) {
    console.log(`\n  <-- ${scene} at pressure ${n.pressure}, water=${n.water}`);
    console.log(`      no take was running: recording=${(await page.evaluate(() => window.__probe.rec().recording))}`);
    await page.screenshot({ path: 'artifacts/natatorium-encounter.png' });
    break;
  }
}
const ended = await top();
if (!ended || !(ended.startsWith('battle') || ended === 'encounter-start')) console.log('\n  <-- NOTHING CAME');

// ── AND AGAIN WITH THE POOL FULL ─────────────────────────────────────────────
//
// The pool is DRAINED on a first run and only fills once the player has seen an
// ending, so the two states are two different rooms and BOTH have to carry the
// beat. Forced here rather than played through five endings to reach it.
console.log('\n── murky ──');
// Forced in-session rather than by rebooting: the fill state is decided from the
// PREVIOUS run's ending, so reaching it honestly means finishing the game first.
// The encounter is once per run by design, so the dread is re-armed too.
await page.evaluate(() => {
  window.__probe.setNatatoriumWater('murky');
  window.__probe.resetNatatoriumDread();
});
await page.evaluate(() => window.__probe.warpRuntime(150, 82, 1));
await sleep(900);
await page.evaluate(() => window.__probe.warpRuntime(168, 82, 1));
await sleep(900);
await read('the middle, flooded');
// NOT RE-RUN TO A SECOND FIGHT, deliberately: the drained encounter is still
// open, and `armed` is false while activeBattleId is set — a second fight may
// not start on top of the first. What this pass proves is that the position
// logic is water-independent, which is the design: natatoriumDreadInput never
// consults the fill state. Only the CHARACTER differs (stair vs surface), and
// that is pinned in test/natatorium-dread.spec.mjs.
const wet = await page.evaluate(() => window.__probe.natatorium());
console.log(`  water=${wet.water} inBasin=${wet.inBasin} centrality=${wet.centrality.toFixed(2)}`
  + ` place=${wet.place} take=${wet.takeAllowed}`);
console.log(wet.water === 'murky' && wet.centrality === 1 && wet.place === 'centre'
  ? '  <-- the flooded pool reads identically; only the fear differs'
  : '  <-- UNEXPECTED');
await page.screenshot({ path: 'artifacts/natatorium-murky.png' });
await browser.close();
