// Is the whisper bed firing, and if so how loud is it really?
//
// The bed is designed to sit under the threshold of attention, which makes
// "I can't hear it" indistinguishable from "it is broken" by ear alone. This
// separates the two: it arms the bed, watches the scheduler, and reports the
// actual linear gain reaching the graph alongside the room tone it has to live
// under.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-whisper-bed.mjs
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--use-angle=metal', '--no-sandbox', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
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

console.log('before departing the dock:', JSON.stringify(await page.evaluate(() => window.__probe.whisperBed())));

// Do NOT set dock.departed by hand. Setting it directly is what hid the real
// bug from this harness the first time: it proved the audio graph worked while
// stepping straight over the condition that was actually failing. Walk off the
// dock instead, and let the game decide it has happened.
// The PRECONDITION, not the thing under test: setup being finished is what the
// dock tutorial does, and a player four takes deep has plainly done it. Setting
// dock.departed itself would be cheating; setting the state that legitimately
// precedes it is what lets the rule be exercised at all.
await page.evaluate(() => window.__probe.setFlags(['setup.levels', 'combat.trained']));
await page.evaluate(() => window.__probe.warp(121, 131, 3));
await new Promise((r) => setTimeout(r, 400));
// One ordinary step, in the building, with the portal crossing never observed.
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 600));
await page.keyboard.up('KeyW');
await new Promise((r) => setTimeout(r, 600));
console.log('departed after walking (no flag set by hand):',
  await page.evaluate(() => window.__probe.flag('dock.departed')));
console.log('  inputs:', JSON.stringify(await page.evaluate(() => ({
  setupLevels: window.__probe.flag('setup.levels'),
  combatTrained: window.__probe.flag('combat.trained'),
  savedSteps: window.__chunkParity?.()?.save?.steps,
  pos: window.__probe.pos(),
  world: window.__probe.world(),
}))));
await new Promise((r) => setTimeout(r, 500));
console.log('after  departing the dock:', JSON.stringify(await page.evaluate(() => window.__probe.whisperBed())));

// The first utterance is deliberately delayed 8-25s so it cannot be attributed
// to the door the player just walked through. Wait it out.
let spoke = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const f = await page.evaluate(() => window.__probe.whisperBed());
  if ((f.live || 0) > 0) { spoke = { at: i + 1, ...f }; break; }
}

const dB = (g) => (g > 0 ? (20 * Math.log10(g)).toFixed(1) : '-inf');
if (spoke) {
  console.log(`\nfirst utterance at t+${spoke.at}s`);
  console.log(`  voices live      ${spoke.live}`);
  console.log(`  tide level       ${spoke.level?.toFixed(5)}  (${dB(spoke.level)} dB applied to the take)`);
  console.log(`  files mastered   -25 dBFS RMS`);
  console.log(`  => on the bus    ${(-25 + Number(dB(spoke.level))).toFixed(1)} dBFS RMS, before the Hann envelope`);
  console.log(`  room tone bed    0.010 (${dB(0.010)} dB) for comparison`);
} else {
  console.log('\nno utterance in 40s');
}

const final = await page.evaluate(() => window.__probe.whisperBed());
console.log('\nfinal:', JSON.stringify(final));
if (errors.length) console.log('errors:', errors.slice(0, 3));

let ok = true;
const check = (label, pass) => { console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}`); if (!pass) ok = false; };
console.log();
check('the bed arms once the dock is behind you', !!final.armed);
check('the takes decoded', (final.ready || 0) === 13);
check('it actually speaks', !!spoke);
await browser.close();
process.exit(ok ? 0 : 1);
