// IS THE SHADOW WHITE, AND DOES THE BEAT HOLD LONG ENOUGH TO FIND IT?
//
// Two questions, one room. Both have been answered wrongly by inspection before
// — "the model flashes perfectly" was true every time the picture did not — so
// this measures pixels and nothing else.
//
//   whitePct   percentage of the frame that is bright AND neutral. The emergency
//              circuit can only make red, so neutral brightness in an auditorium
//              lit by nothing else IS the apparition. Should be ~0 in the dark
//              and clearly non-zero during the hold.
//   redPct     the field the body is standing in. If this is 0 the lamp is not
//              reaching the wall and a white silhouette would be a decal.
//   hold/dark  measured off the screen, not off EMERGENCY_CADENCE, by sampling
//              luma at ~60Hz for several cycles.
//
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-apparitions.mjs
import puppeteer from 'puppeteer-core';

// ZONE.hall — see src/data/floorplan/legend.js. Warped by ZONE rather than by
// coordinates on purpose: there are three coordinate spaces here and warping
// with an authored pair drops you inside solid rock, zone 0, silently black.
const HALL = 5;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  // THE LENS GATE, STUBBED — and it is honest to stub it HERE.
  //
  // lens-calibration will not let a run start without a live diffusion server on
  // :8000, and startLens short-circuits on an existing window.__diffusion. What
  // that server supplies is the engraved surface marks; what this harness
  // measures is the emergency lighting pass, which runs identically over the
  // procedural fallback tiles. Anything about the SCREEN (ink, grain, density)
  // must be measured against the real lens instead — see verify-mark-field.
  window.__diffusion = {
    ready: Promise.resolve(), stats: { criticalBank: 'calm' },
    activateBank: async () => true, retry: async () => true,
  };
});
const shaderErrors = [];
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 300)));
page.on('console', (m) => {
  const text = m.text();
  if (/shader|GLSL|compile|ERROR:/i.test(text)) { shaderErrors.push(text); console.log('  GL:', text.slice(0, 400)); }
});

const wait = (f, t = 300000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// RAW=1 renders the raw PBR instead of the one-bit encode (uDebugSource == 1.0
// → finalColor = c). Two different questions: raw answers "is the shader making
// white light", the default answers "does any of it survive the display".
const RAW = process.env.RAW === '1';
await page.goto(`http://127.0.0.1:5199/index.html?nomic=1&sam=0&skiptut=1&nothink=0${RAW ? '&pixelMeshSource=world' : ''}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') {
  await page.keyboard.press('Enter');
  await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000);
}
// The opening is a WALK. Blind Enter presses never reach screen === 'game'.
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);
console.log('in game.');

async function recover(tries = 12) {
  for (let i = 0; i < tries; i++) {
    const at = await page.evaluate(() => ({
      screen: window.__chunkParity?.().screen ?? null,
      scene: window.__scenes?.top?.()?.id ?? null,
    }));
    if (at.screen === 'game' && !at.scene) return true;
    await page.keyboard.press(i % 2 ? 'Escape' : 'Enter');
    await sleep(700);
  }
  return false;
}

// The run has to be INSIDE the building before a zone warp means anything. Fresh
// out of the opening you are standing in the yard, `usingPlan()` is false, and
// godWarpToZone happily reports true after finding nothing.
await page.evaluate(() => window.__probe.testRun());
await sleep(2500);
await recover(6);
const landed = await page.evaluate((z) => window.__probe.godWarpZone(z), HALL);
await sleep(3000);
if (!landed || !await recover()) { console.log('lost the world warping to the auditorium'); await browser.close(); process.exit(1); }
await page.evaluate(() => window.__probe.setTorch(false));
await sleep(1500);

const where = await page.evaluate(() => ({
  zone: window.__probe.light().context.zone,
  effects: window.__probe.light().effectsMode,
  emergency: window.__probe.light().rig.filter((l) => l.kind === 'emergency').map((l) => l.id),
}));
console.log('zone', where.zone, '· flash', where.effects, '·', where.emergency.length, 'emergency lamps resolve here');
if (!where.emergency.length) { console.log('NO EMERGENCY LAMPS HERE — wrong room, nothing to measure.'); }

const staged = await page.evaluate(() => window.__probe.apparitions());
console.log('staged:', JSON.stringify(staged));

// SWEEP, THEN COMMIT. The figures are staged against the hero lamp, not against
// the camera, so where they land in the frame depends on which way the warp left
// you facing — and half this room is an unlit void that reports zero for
// everything. Take the heading with the most red on the wall: that is the
// direction the beat is actually happening in, and it is where a body could
// possibly be silhouetted.
let best = { yaw: 0, redPct: -1 };
// SWEEP=body ranks headings by the silhouette instead of by the red. The red
// picks the wall with the most light on it, which is not always the wall the
// shadow map's 104-degree frustum from the lamp can actually reach.
const rank = process.env.SWEEP === 'body' ? 'whitePct' : 'redPct';
const forced = process.env.YAW ? Number(process.env.YAW) : null;
for (let i = 0; forced == null && i < 24; i++) {
  const yaw = i / 24 * Math.PI * 2;
  await page.evaluate(([y, p]) => window.__probe.lookAtWorld(y, p), [yaw, -.06]);
  await sleep(120);
  // Sample across a whole cycle or the reading is just where the beat was.
  let red = 0, white = 0;
  for (let k = 0; k < 26; k++) {
    const s = await page.evaluate(() => window.__probe.sceneStats(64));
    red = Math.max(red, s.redPct); white = Math.max(white, s.whitePct);
  }
  const here = { yaw, redPct: red, whitePct: white };
  if (here[rank] > (best[rank] ?? -1)) best = here;
}
if (forced != null) best = { yaw: forced, redPct: -1, whitePct: -1 };
console.log(`heading ${best.yaw.toFixed(2)}rad — peak red ${best.redPct}%, peak white ${best.whitePct}%`);
await page.evaluate(([y, p]) => window.__probe.lookAtWorld(y, p), [best.yaw, -.06]);
await sleep(600);

// ── THE BEAT, MEASURED OFF THE SCREEN ────────────────────────────────────────
const trace = [];
const started = Date.now();
while (Date.now() - started < 9000) {
  const s = await page.evaluate(() => ({ t: performance.now() / 1000, ...window.__probe.sceneStats(96) }));
  trace.push(s);
}
const luma = trace.map((s) => s.luma);
const hi = Math.max(...luma), lo = Math.min(...luma);
const gate = lo + (hi - lo) * .5;
let holds = [], darks = [], run = null;
for (const s of trace) {
  const on = s.luma >= gate;
  if (!run || run.on !== on) { if (run) (run.on ? holds : darks).push(run.end - run.start); run = { on, start: s.t, end: s.t }; }
  run.end = s.t;
}
const mid = (xs) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;
// First and last runs are truncated by the sampling window; drop them.
console.log(`\nsampled ${trace.length} frames over 9s (~${(trace.length / 9).toFixed(0)}Hz)`);
console.log(`hold  ${mid(holds.slice(1, -1)).toFixed(3)}s   (authored 1.750)`);
console.log(`dark  ${mid(darks.slice(1, -1)).toFixed(3)}s   (authored 0.672)`);

const lit = trace.filter((s) => s.luma >= gate), dark = trace.filter((s) => s.luma < gate);
const avg = (xs, k) => xs.length ? xs.reduce((a, s) => a + s[k], 0) / xs.length : 0;
console.log(`\n           luma    litPct   redPct   whitePct`);
for (const [name, set] of [['hold', lit], ['dark', dark]]) {
  console.log(`  ${name.padEnd(6)} ${avg(set, 'luma').toFixed(2).padStart(7)} ${avg(set, 'litPct').toFixed(1).padStart(8)} ` +
    `${avg(set, 'redPct').toFixed(1).padStart(8)} ${avg(set, 'whitePct').toFixed(2).padStart(10)}`);
}
const whiteHold = avg(lit, 'whitePct'), whiteDark = avg(dark, 'whitePct');
console.log(`\npeak white during a hold: ${Math.max(...lit.map((s) => s.whitePct)).toFixed(2)}%`);
console.log(whiteHold > .05 && whiteHold > whiteDark * 2
  ? 'WHITE: the apparition is on screen and only during the beat.'
  : 'WHITE: nothing neutral-bright in the frame — the silhouette is not reading.');
if (shaderErrors.length) console.log(`\n${shaderErrors.length} shader diagnostics above.`);

// Screenshot ON the beat. A shot taken at an arbitrary moment is a black frame
// 28% of the time and tells you nothing either way.
for (let i = 0; i < 400; i++) {
  if ((await page.evaluate(() => window.__probe.sceneStats(48).luma)) >= gate) break;
}
await page.screenshot({ path: 'artifacts/apparitions-hold.png' });
console.log('\nartifacts/apparitions-hold.png');
await browser.close();
