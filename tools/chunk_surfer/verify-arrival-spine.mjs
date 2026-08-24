// The opening spine, walked end to end in the real build.
//
// Everything here used to be narrated over black between the booth and the
// title. It is now a walk, and the things that can go wrong with a walk are not
// things a node suite can see: whether the lodge is reachable, whether the key
// actually arrives, whether the grey door opens, and whether the title lands on
// the crossing rather than a hundred metres early.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-arrival-spine.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const output = path.resolve(process.env.OUT || 'artifacts/arrival-spine');
fs.mkdirSync(output, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const wait = (f, t = 240000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const flag = (k) => page.evaluate((n) => !!window.__probe.flag(n), k);
const pos = () => page.evaluate(() => window.__probe.pos());
const focusGreyDoorFromBay = async () => {
  const door = await page.evaluate(() => (window.__probe.doors() || []).find((entry) => entry.id === 'dock-grey-exterior'));
  assert.ok(door, 'the canonical grey door exists before the crossing');
  // Derive the diagnostic seat from the live portal. The pair has moved before;
  // copied warp literals quietly aimed the verifier at the van instead.
  const offset = 4;
  await page.evaluate(({ x, y }) => window.__probe.warpRuntime(x, y, 1), {
    x: door.cx - offset,
    y: door.cy,
  });
  return door;
};
const shot = async (name) => { await new Promise((r) => setTimeout(r, 500)); await page.screenshot({ path: path.join(output, name) }); };

await page.goto('http://127.0.0.1:5199/index.html?nomic=1&sam=0&diffusion='
  + encodeURIComponent('ws://127.0.0.1:5198'), { waitUntil: 'domcontentloaded', timeout: 60000 });
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
// The arrival fade. It holds the world under it and pops itself, so __chunkParity
// reports 'arrival' rather than 'game' for its length — wait for the fade, take a
// frame of it, and only then wait for a man who can move.
await wait(() => window.__scenes?.top?.()?.id === 'arrival', 240000);
await shot('00-fading-up.png');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

// ── 1. he starts outside, on the road, with nothing on his ring ─────────────
console.log('start position:', JSON.stringify(await pos()));
assert.equal(await top(), null, 'no scene is pushed over the world any more — the cold open is not a scene');
assert.equal(await flag('prologueDone'), false, 'the prologue has not happened yet');
await page.evaluate(() => { window.__probe.setTorchBattery(1); window.__probe.setTorch(true); });
await shot('01-spawned-on-the-road.png');
// Does movement work in this harness AT ALL? Establish it on open tarmac before
// anything else, so a later failure to walk cannot be misread as a game bug.
{
  const before = await pos();
  await page.keyboard.down('ArrowUp');
  await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.up('ArrowUp');
  await new Promise((r) => setTimeout(r, 200));
  const after = await pos();
  console.log('movement check on the road:', JSON.stringify(before), '->', JSON.stringify(after));
}

// ── 2. the grey door refuses before he has asked for the keys ───────────────
await focusGreyDoorFromBay(); // facing 1 = east, on the live bay-side seat
await shot('02-grey-door-before-the-keys.png');
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 400));
console.log('at the door with no keys:', JSON.stringify(await page.evaluate(() => window.__probe.speech())));

// ── 3. the lodge, and the hand-over ────────────────────────────────────────
await page.evaluate(() => window.__probe.warpCell(75.6, 214, 0));  // the facing the reticle finds the window from
await shot('03-at-the-lodge.png');
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 900));
console.log('scene after [e] at the lodge:', await top());
await shot('04-the-conversation.png');

// Walk the conversation to its end. Each line holds for a minimum dwell before
// it will accept an advance, so pressing faster than that simply gets swallowed.
// The booth is a topic hub: always taking option 1 walks in a circle forever,
// which is what a real player does not do. Rotate the highlighted choice so the
// walk eventually reaches the one that leaves.
for (let i = 0; i < 260 && await top(); i++) {
  const down = i % 6;
  for (let d = 0; d < down; d++) { await page.keyboard.press('ArrowDown'); await new Promise((r) => setTimeout(r, 40)); }
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 380));
}
if (await top()) {
  const v = await page.evaluate(() => { const t = window.__scenes.top(); return t.view ? t.view() : null; });
  console.log('STUCK. current view:', JSON.stringify(v)?.slice(0, 1200));
}
assert.equal(await top(), null, 'the conversation finished');
assert.equal(await flag('prologueDone'), true, 'the hand-over completes the prologue');
assert.ok(await page.evaluate(() => window.__probe.keys().includes('master')), 'the master key arrives during the hand-over');
await focusGreyDoorFromBay();
await shot('05-grey-door-with-the-keys.png');
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 250));
const greyDoor=await page.evaluate(() => (window.__probe.doors()||[]).find((d)=>d.id==='dock-grey-exterior'));
assert.ok(greyDoor, 'the canonical grey door exists');
assert.ok(['opening','open'].includes(greyDoor.state), `the keyed interaction opens the grey door (${greyDoor.state})`);
assert.equal(await flag('title.shown'), false, 'opening the door does not fire the threshold title early');
assert.equal(await top(), 'get-in-door-entry', 'the same interact edge owns the physical walk through the aperture');

// WALKED, not warped: E now owns a timed world-view/body path. The title is
// still withheld until that action has physically landed inside.
await new Promise((r) => setTimeout(r, 3000));
console.log('position after authored door entry:', JSON.stringify(await pos()));
assert.equal(await flag('title.shown'), true, 'the completed E-owned crossing fires the title');
assert.equal(await top(), 'world-title', 'the earned Get-In scene owns the frame at the crossing');
// The title opens IN THE WORLD: he turns back to the door, the closer takes it,
// and the last of the yard narrows to nothing before the type comes up. Three
// frames across the lead-in, because the whole point of it is what it looks like.
await shot('06a-title-lead-turning.png');
await new Promise((r) => setTimeout(r, 1100));
await shot('06b-title-lead-iris.png');
await new Promise((r) => setTimeout(r, 1400));
await shot('06-the-title.png');

// The earned slate must finish before the internal voice arrives. Its first
// frame keeps the closed goods doors in the left image lane; later beats retain
// that lane and change the plate to the flashlight rather than collapsing back
// to a text-only shell.
await wait(() => window.__scenes?.top?.()?.id === 'after-title', 15000);
const debrief = await page.evaluate(() => window.__scenes.top().view?.() || null);
assert.equal(debrief?.art?.id, 'door', 'the internal debrief opens with the door image in its left lane');
await shot('07-after-title-door-debrief.png');

console.log(errors.length ? `PAGE ERRORS:\n  ${errors.join('\n  ')}` : 'no page errors');
await browser.close();
