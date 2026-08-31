// A TAKE SURVIVES A RELOAD.
//
// The bug: the room ids were saved and the tape was not, so after a quit and
// resume the job sheet said a room was recorded and playback said it was not.
// This rolls a take, reads the save, drops everything the way a reload does,
// loads it back, and asks both stores the same question.
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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent(LENS)}`,
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

const out = await page.evaluate(async () => {
  const PB = await import('/src/game/playback.js');
  const REC = await import('/src/game/recordist.js');
  const room = 'main_b3';
  PB.beginTake(room, { x: 2, y: 2 });
  PB.noteAudible(room, 0, 0.7);
  PB.notePresence(room, 0.5, 9);
  REC.addTake(room, { contaminated: false });
  PB.sealTake(room);
  const before = { job: REC.hasTake(room), tape: PB.hasTake(room) };
  const saved = JSON.parse(JSON.stringify(REC.saveRecState()));
  // Everything a reload forgets.
  PB.loadTakes([]);
  REC.loadRecState({});
  REC.syncTakes();
  const wiped = { job: REC.hasTake(room), tape: PB.hasTake(room) };
  const restored = REC.loadRecState(saved);
  PB.loadTakes(restored.tapes || []);
  if (!restored.tapes) PB.adoptLegacyTakes(restored.legacy);
  REC.syncTakes();
  const after = { job: REC.hasTake(room), tape: PB.hasTake(room) };
  return { before, wiped, after, tapes: saved.tapes.length, audible: saved.tapes[0]?.audible };
});
console.log('rolled  ', JSON.stringify(out.before));
console.log('wiped   ', JSON.stringify(out.wiped));
console.log('reloaded', JSON.stringify(out.after), `tapes=${out.tapes}`, JSON.stringify(out.audible));
console.log(out.after.job && out.after.tape ? 'PASS — the job sheet and the tape agree after a reload'
                                            : 'FAIL — they still disagree');
await browser.close();
