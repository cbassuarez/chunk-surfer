// THE GAIT LADDER, MEASURED (game/locomotion.js).
//
// Walks the real game headless in a handful of places, first on the movement
// key and then with the run key, and reports what the body and the eye
// actually did in metres per second: speed, how even it is frame to frame
// (a lunge-and-settle shows up as a big spread), how far and how long the eye
// travels after the key comes up, footstep contacts per second, and how long
// a chase sprint lasts before the breath drops him to a run.
//
//   npx vite --config <frozen config> --port 5231 --strictPort --host 127.0.0.1 &
//   PORT=5231 node tools/chunk_surfer/measure-gait.mjs [--json out.json]
//
// Use a frozen vite (hmr:false, watch:null): another agent's edit must not
// reload the page halfway through a walk. Boots with ?nosd=1 — no lens.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.PORT) || 5231;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : '';
const PLACES = (process.env.PLACES || 'basement-corridor,ground-spine,concert-hall,main-stair-ground,yard-road,ellery-esplanade').split(',');

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  Document.prototype.hasFocus = () => true;
});
const errors = [];
page.on('pageerror', (e) => { errors.push(String(e).slice(0, 240)); console.log('  PAGEERROR:', String(e).slice(0, 200)); });
const wait = (f, t = 300000) => page.waitForFunction(f, { timeout: t });
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosd=1&nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1`,
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
  window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint']);
});

// Sample on the page's own frames, so frame-to-frame evenness is real.
await page.evaluate(() => {
  window.__gait = { samples: [], on: false };
  const tick = () => {
    if (window.__gait.on) {
      const l = window.__probe.locomotion();
      window.__gait.samples.push({ t: performance.now(), eye: l.eye, body: l.body, gait: l.gait, place: l.place, reason: l.reason,
        speed: l.speed, steps: l.steps, winded: l.breath.winded, reserve: l.breath.reserve, exertion: l.exertion,
        cycles: l.breathAudio?.cycles || 0, glide: l.glide });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // Footstep plants, counted where the audio layer receives them.
  window.__gaitPlants = [];
});

async function clearScenes() {
  await page.evaluate(() => {
    for (let n = 0; n < 8 && window.__scenes?.blocksInput?.(); n++) {
      const scene = window.__scenes.top({ includeOverlay: true });
      if (scene?.close) scene.close(); else window.__scenes.pop();
    }
  });
}

function summarise(samples, releaseAt) {
  const moving = [], all = samples;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i], dt = (b.t - a.t) / 1000;
    if (b.t > releaseAt || dt <= 0) continue;
    const d = Math.hypot(b.eye.x - a.eye.x, b.eye.z - a.eye.z);
    if (d > 1e-4) moving.push({ v: d / dt, dt, d });
  }
  const time = moving.reduce((s, m) => s + m.dt, 0), dist = moving.reduce((s, m) => s + m.d, 0);
  const mean = time ? dist / time : 0;
  const sd = moving.length ? Math.sqrt(moving.reduce((s, m) => s + m.dt * (m.v - mean) ** 2, 0) / Math.max(1e-9, time)) : 0;
  const atRelease = all.filter((s) => s.t <= releaseAt).at(-1), after = all.filter((s) => s.t > releaseAt);
  let stopMs = 0, stopM = 0;
  if (atRelease) {
    for (let i = 0; i < after.length; i++) {
      const prev = i ? after[i - 1] : atRelease, d = Math.hypot(after[i].eye.x - prev.eye.x, after[i].eye.z - prev.eye.z);
      if (d > 1e-4) { stopMs = after[i].t - releaseAt; stopM += d; }
    }
  }
  const first = all[0], last = all.filter((s) => s.t <= releaseAt).at(-1) || first;
  const steps = last.steps - first.steps, span = (last.t - first.t) / 1000;
  return {
    place: last.place, reason: last.reason, gait: last.gait, declared: +last.speed.toFixed(2),
    eyeMps: +mean.toFixed(2), eyeSpread: +(mean ? sd / mean : 0).toFixed(2), movingFraction: +(span ? time / span : 0).toFixed(2),
    stepsPerSec: +(span ? steps / span : 0).toFixed(2), stopMetres: +stopM.toFixed(3), stopMs: Math.round(stopMs),
  };
}

async function walk(label, { run = false, seconds = 3, chase = 0 } = {}) {
  await clearScenes();
  await page.evaluate((chaseSeconds) => {
    window.__gait.samples = []; window.__gait.on = true;
    if (chaseSeconds) window.__probe.locomotionChase(chaseSeconds);
  }, chase);
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await sleep(seconds * 1000);
  const releaseAt = await page.evaluate(() => performance.now());
  await page.keyboard.up('KeyW');
  if (run) await page.keyboard.up('ShiftLeft');
  await sleep(1200);
  const samples = await page.evaluate(() => { window.__gait.on = false; return window.__gait.samples; });
  const result = { label, run, ...summarise(samples, releaseAt) };
  if (chase) {
    const firstWinded = samples.find((s) => s.winded), firstSprint = samples.find((s) => s.gait === 'sprint');
    result.sprintSeconds = firstWinded && firstSprint ? +((firstWinded.t - firstSprint.t) / 1000).toFixed(2) : null;
    result.gaitAfter = samples.filter((s) => s.t <= releaseAt).at(-1)?.gait;
    result.breathCycles = samples.at(-1)?.cycles || 0;
    result.peakExertion = +Math.max(...samples.map((s) => s.exertion)).toFixed(2);
  }
  console.log(`${label.padEnd(30)} ${String(result.place).padEnd(9)} ${String(result.gait).padEnd(6)} declared ${String(result.declared).padStart(5)} eye ${String(result.eyeMps).padStart(5)} m/s`
    + ` spread ${String(result.eyeSpread).padStart(4)} moving ${String(result.movingFraction).padStart(4)} cells/s ${String(result.stepsPerSec).padStart(5)}`
    + ` stop ${result.stopMetres}m/${result.stopMs}ms${chase ? ` sprint ${result.sprintSeconds}s → ${result.gaitAfter}, breath cycles ${result.breathCycles}` : ''}`);
  return result;
}

const results = [];
for (const hook of PLACES) {
  await clearScenes();
  const ok = await page.evaluate((id) => window.__probe.godWarpHook(id), hook);
  if (!ok) { console.log(`${hook}: warp failed`); continue; }
  await sleep(1500);
  results.push(await walk(`${hook} / W`));
  results.push(await walk(`${hook} / Shift+W`, { run: true }));
}
// The chase rung: sprint until the breath goes.
await clearScenes();
if (await page.evaluate(() => window.__probe.godWarpHook('yard-road'))) {
  await sleep(1500);
  results.push(await walk('yard-road / chase sprint', { run: true, seconds: 11, chase: 30 }));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ results, errors }, null, 1));
await browser.close();
