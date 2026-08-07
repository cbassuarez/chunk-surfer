// Every ending, played and photographed.
//
// The endings are the least-walked part of the game — three hours and a specific
// route each — so they were also the least LOOKED at, which is most of how they
// stayed four lines long. playEnding() is the whole path now (dossier, flags,
// arrival passage, timeline, coda), so driving it from here exercises exactly
// what a real run reaches.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/tests/ending-shots.mjs [tag]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const tag = process.argv[2] || 'now';
const output = path.resolve(process.env.OUT || `artifacts/ending-shots/${tag}`);
fs.mkdirSync(output, { recursive: true });

// ending id, arrival, and the run history the ending is being asked to read.
const RUNS = [
  { id: 'sacrifice', arrival: 'agreed', note: 'chose to stay, named her' },
  { id: 'sacrifice', arrival: 'defeated', note: 'beaten into staying' },
  { id: 'sacrifice', arrival: 'timed-out', note: 'ran and was short' },
  { id: 'helped', arrival: 'agreed', note: 'the coffee' },
  { id: 'inversion', arrival: 'escaped', note: 'out through the other door' },
  { id: 'drugged', arrival: 'escaped', note: 'out, and it was nothing' },
  { id: 'surfaced', arrival: 'carried', note: 'carried him out' },
];

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

await page.goto('http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0&diffusion='
  + encodeURIComponent('ws://127.0.0.1:5198'), { waitUntil: 'domcontentloaded', timeout: 60000 });
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
if (await page.evaluate(() => window.__scenes?.top?.()?.id === 'arrival')) {
  await wait(() => window.__scenes?.top?.()?.id !== 'arrival', 30000);
}

// A night worth reading back. Without this every ending is handed an empty
// dossier and every conditional limb reads as the "did nothing" branch.
await page.evaluate(() => window.__probe.setFlags([
  'confession.kind=name', 'confession.value=Sarah',
  'door.grey.searched=tried', 'dock.haunting.spent',
]));

for (const run of RUNS) {
  const started = await page.evaluate(([id, arrival]) => window.__probe.playEnding(id, arrival), [run.id, run.arrival]);
  await new Promise((r) => setTimeout(r, 900));
  const dossier = await page.evaluate(() => {
    const d = window.__probe.endingDossier();
    return d && { arrival: d.arrival, confession: d.confession, takes: d.takes.completed, coffee: d.coffee };
  });
  const stem = `${run.id}--${run.arrival}`;
  await page.screenshot({ path: path.join(output, `${stem}-01.png`) });

  // Page through it. Every press advances one beat; the ending ends when the
  // scene stack empties or the credits take over.
  let frame = 1;
  for (let i = 0; i < 60; i += 1) {
    const top = await page.evaluate(() => window.__scenes?.top?.()?.id || null);
    if (!top || top === 'credits' || top === 'return-report') break;
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 190));
    if (i % 6 === 5) {
      frame += 1;
      await page.screenshot({ path: path.join(output, `${stem}-${String(frame).padStart(2, '0')}.png`) });
    }
  }
  console.log(stem.padEnd(28), run.note.padEnd(28), JSON.stringify(dossier), 'frames', frame);
  // Back to a clean world for the next one.
  while (await page.evaluate(() => !!window.__scenes?.top?.())) {
    await page.evaluate(() => window.__scenes.pop());
  }
  await new Promise((r) => setTimeout(r, 400));
}

// ── the playable legs ───────────────────────────────────────────────────────
// The three objectives are the part of an ending the player is IN, and until now
// nothing looked at them: the carry went at walking pace and the building did not
// close behind anybody. Set each one up and let its clock run.
for (const leg of [
  { id: 'sacrifice', set: () => window.__probe.endObjective('stay'), note: 'the walk back to the screen' },
  { id: 'surfaced', set: () => window.__probe.endObjective('surfaced'), note: 'the carry' },
  { id: 'inversion', set: () => window.__probe.endObjective('inversion'), note: 'the collapse under the run' },
]) {
  const state = await page.evaluate(leg.set);
  const paceBefore = await page.evaluate(() => window.__probe.moveInterval());
  await new Promise((r) => setTimeout(r, 6000));
  await page.screenshot({ path: path.join(output, `leg-${leg.id}.png`) });
  console.log(`leg ${leg.id}`.padEnd(20), leg.note.padEnd(30), JSON.stringify(state), 'moveMs', paceBefore);
  await page.evaluate(() => window.__probe.endObjective(null));
}

console.log(errors.length ? `page errors: ${errors.slice(0, 4).join(' | ')}` : 'no page errors');
await browser.close();
