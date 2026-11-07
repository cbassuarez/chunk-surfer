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
// PLACES takes god hooks, plus `water` (the pool, flooded) and `source:<preset>`
// (a Source god preset). Source goes last: it does not come back to the building.
//
// Use a frozen vite (hmr:false, watch:null): another agent's edit must not
// reload the page halfway through a walk. Boots with ?nosd=1 — no lens.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.PORT) || 5231;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : '';
const PLACES = (process.env.PLACES || 'basement-corridor,ground-spine,concert-hall,main-stair-ground,cathedral-belfry,water,yard-road,ellery-esplanade').split(',');
const SOURCE_PLACES = (process.env.SOURCE_PLACES ?? 'source:hall-entry,source:landscape,source:last-reception').split(',').filter(Boolean);
const WINDOWS = process.platform === 'win32';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || (WINDOWS ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  headless: 'new', protocolTimeout: 900000,
  args: [WINDOWS ? '--use-angle=vulkan' : '--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosd=1&nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&skiptut=1&nothink=1&noprologue=1`,
  { waitUntil: 'domcontentloaded', timeout: 120000 });
await wait(() => window.__probe?.testRun && window.__scenes?.top?.()?.id, 120000);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await sleep(400); }
await page.evaluate(async () => {
  await window.__probe.testRun();
  window.__probe.tutSkip?.();
  window.__probe.hush?.();
  window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint', 'title.shown', 'setup.case.closed', 'setup.case.arrived', 'setup.case.skills-closed']);
});
await wait(() => window.__chunkParity?.().screen === 'game' || window.__probe?.locomotion?.()?.cell, 120000);
await sleep(3000);

// Sample on the page's own frames, so frame-to-frame evenness is real.
await page.evaluate(() => {
  window.__gait = { samples: [], on: false, releasedAt: 0 };
  addEventListener('keyup', (e) => { if (e.code === 'KeyW') window.__gait.releasedAt = performance.now(); }, true);
  const tick = () => {
    if (window.__gait.on) {
      const l = window.__probe.locomotion();
      window.__gait.samples.push({ t: performance.now(), eye: l.eye, body: l.body, gait: l.gait, place: l.place, reason: l.reason,
        speed: l.speed, factors: l.factors, steps: l.steps, plants: l.plants, winded: l.breath.winded, reserve: l.breath.reserve, exertion: l.exertion,
        cycles: l.breathAudio?.cycles || 0, glide: l.glide });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
    if (d > 1.5) continue;
    if (d > 1e-4) moving.push({ v: d / dt, dt, d });
  }
  const time = moving.reduce((s, m) => s + m.dt, 0), dist = moving.reduce((s, m) => s + m.d, 0);
  const mean = time ? dist / time : 0;
  const sd = moving.length ? Math.sqrt(moving.reduce((s, m) => s + m.dt * (m.v - mean) ** 2, 0) / Math.max(1e-9, time)) : 0;
  const windows = [];
  let windowT = 0, windowD = 0;
  for (const m of moving) {
    windowT += m.dt; windowD += m.d;
    if (windowT >= 0.1) { windows.push(windowD / windowT); windowT = 0; windowD = 0; }
  }
  const trimmed = windows.slice(1, -1), windowMean = trimmed.reduce((a, b) => a + b, 0) / Math.max(1, trimmed.length);
  const surge = trimmed.length > 2 && windowMean ? Math.sqrt(trimmed.reduce((a, b) => a + (b - windowMean) ** 2, 0) / trimmed.length) / windowMean : 0;
  const atRelease = all.filter((s) => s.t <= releaseAt).at(-1), after = all.filter((s) => s.t > releaseAt);
  let stopMs = 0, stopM = 0;
  if (atRelease) {
    for (let i = 0; i < after.length; i++) {
      const prev = i ? after[i - 1] : atRelease, d = Math.hypot(after[i].eye.x - prev.eye.x, after[i].eye.z - prev.eye.z);
      if (d > 1.5) break;
      if (d > 1e-4) { stopMs = after[i].t - releaseAt; stopM += d; }
    }
  }
  const first = all[0], last = all.filter((s) => s.t <= releaseAt).at(-1) || first;
  const frames = all.filter((s) => s.t <= releaseAt).length;
  const steps = last.steps - first.steps, plants = last.plants - first.plants, span = (last.t - first.t) / 1000;
  return {
    place: last.place, reason: last.reason, gait: last.gait, declared: +last.speed.toFixed(2), fps: +((frames / Math.max(.001, (last.t - first.t) / 1000)).toFixed(0)),
    eyeMps: +mean.toFixed(2), eyeSpread: +(mean ? sd / mean : 0).toFixed(2), surge: +surge.toFixed(2), movingFraction: +(span ? time / span : 0).toFixed(2),
    stepsPerSec: +(span ? steps / span : 0).toFixed(2), contactsPerSec: +(span ? plants / span : 0).toFixed(2), stopMetres: +stopM.toFixed(3), stopMs: Math.round(stopMs),
  };
}

// The longest clear heading from here, tried with real keys. A hook can face a wall.
async function clearHeading() {
  const start = await page.evaluate(() => window.__probe.locomotion().cell);
  let best = { facing: null, cells: 0 };
  for (const facing of [0, 1, 2, 3]) {
    await page.evaluate((c, f) => window.__probe.warp(c.x, c.y, f), start, facing);
    await sleep(150);
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
    await sleep(2200);
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    await sleep(300);
    const at = await page.evaluate(() => window.__probe.locomotion().cell);
    const cells = Math.hypot(at.x - start.x, at.y - start.y);
    if (cells > best.cells) best = { facing, cells };
  }
  await page.evaluate((c, f) => window.__probe.warp(c.x, c.y, f ?? 0), start, best.facing);
  await sleep(300);
  return { ...start, facing: best.facing ?? 0 };
}
const back = (spot) => page.evaluate((c) => window.__probe.warp(c.x, c.y, c.facing), spot);

async function walk(label, { run = false, seconds = 4, chase = 0, spot = null, diagonal = false } = {}) {
  await clearScenes();
  if (spot) { await back(spot); await sleep(300); }
  await page.evaluate((chaseSeconds) => {
    window.__gait.samples = []; window.__gait.on = true;
    if (chaseSeconds) window.__probe.locomotionChase(chaseSeconds);
  }, chase);
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  if (diagonal) await page.keyboard.down('KeyD');
  if (chase && spot) {
    // A sprint outruns any street. Back to the start on a timer, well short of the
    // wall: stopping against one would give breath back and flatter the number.
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      await sleep(1100);
      await back(spot);
    }
  } else await sleep(seconds * 1000);
  const releaseAt = await page.evaluate(() => performance.now());
  await page.keyboard.up('KeyW');
  if (diagonal) await page.keyboard.up('KeyD');
  if (run) await page.keyboard.up('ShiftLeft');
  await sleep(1200);
  const { samples, releasedAt } = await page.evaluate(() => { window.__gait.on = false; return { samples: window.__gait.samples, releasedAt: window.__gait.releasedAt }; });
  const result = { label, run, ...summarise(samples, releasedAt || releaseAt) };
  result.factors = samples.filter((s) => s.t <= releaseAt).at(-1)?.factors || [];
  if (process.env.TRACE) result.trace = samples.map((s) => [+s.t.toFixed(1), +s.eye.x.toFixed(3), +s.eye.z.toFixed(3), s.steps, s.glide ? 1 : 0, s.gait]);
  if (!result.eyeMps) result.stuck = await page.evaluate(() => {
    const s = window.__scenes, top = s?.top?.({ includeOverlay: true });
    return { top: top?.id || null, blocksInput: !!s?.blocksInput?.(), allowsLook: !!s?.allowsLook?.(), screen: window.__chunkParity?.().screen,
      cell: window.__probe.locomotion().cell, hasFocus: document.hasFocus(), hidden: document.hidden, lock: !!document.pointerLockElement };
  });
  if (chase) {
    const firstWinded = samples.find((s) => s.winded), firstSprint = samples.find((s) => s.gait === 'sprint');
    result.sprintSeconds = firstWinded && firstSprint ? +((firstWinded.t - firstSprint.t) / 1000).toFixed(2) : null;
    result.gaitAfter = samples.filter((s) => s.t <= releaseAt).at(-1)?.gait;
    result.breathCycles = samples.at(-1)?.cycles || 0;
    result.peakExertion = +Math.max(...samples.map((s) => s.exertion)).toFixed(2);
  }
  if (result.stuck) console.log(`  did not move: ${JSON.stringify(result.stuck)}`);
  console.log(`${label.padEnd(30)} ${String(result.place).padEnd(9)} ${String(result.gait).padEnd(6)} fps ${String(result.fps).padStart(3)} declared ${String(result.declared).padStart(5)} eye ${String(result.eyeMps).padStart(5)} m/s`
    + ` spread ${String(result.eyeSpread).padStart(4)} surge ${String(result.surge).padStart(4)} moving ${String(result.movingFraction).padStart(4)} cells/s ${String(result.stepsPerSec).padStart(5)} contacts/s ${String(result.contactsPerSec).padStart(4)}`
    + ` stop ${result.stopMetres}m/${result.stopMs}ms${chase ? ` sprint ${result.sprintSeconds}s → ${result.gaitAfter}, breath cycles ${result.breathCycles}` : ''}`);
  return result;
}

const results = [];
async function goTo(place) {
  if (place === 'water') {
    // In the middle of the flooded bath, on the bottom.
    return page.evaluate(async () => {
      if (!await window.__probe.godWarpHook('natatorium')) return false;
      window.__probe.setNatatoriumWater('murky');
      const b = window.__chunkParity().natatoriumWater?.basin;
      if (!b) return false;
      window.__probe.warp((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 2);
      return true;
    });
  }
  if (place.startsWith('source:')) return page.evaluate((preset) => { window.__probe.sourcePreset(preset); return true; }, place.slice(7));
  return page.evaluate((id) => window.__probe.godWarpHook(id), place);
}
// What the per-frame reader costs here, in microseconds a call.
const readCost = () => page.evaluate(() => {
  const time = (fn, n = 2000) => { for (let k = 0; k < 200; k++) fn(); const t = performance.now(); for (let k = 0; k < n; k++) fn(); return +((performance.now() - t) / n * 1000).toFixed(1); };
  return `reader ${time(window.__probe.moveInterval)} / probe ${time(window.__probe.locomotion)}`;
});
for (const hook of PLACES) {
  await clearScenes();
  const ok = await goTo(hook);
  if (!ok) { console.log(`${hook}: warp failed`); continue; }
  await sleep(1500);
  await clearScenes();
  console.log(`${hook}: reading locomotion costs ${await readCost()} us a call`);
  const spot = await clearHeading();
  results.push(await walk(`${hook} / W`, { spot }));
  results.push(await walk(`${hook} / Shift+W`, { run: true, spot }));
  if (process.env.DIAGONAL) {
    results.push(await walk(`${hook} / W+D diagonal`, { spot, diagonal: true }));
    results.push(await walk(`${hook} / Shift+W+D diagonal`, { run: true, spot, diagonal: true }));
  }
}
// The chase rung: sprint until the breath goes.
await clearScenes();
if (process.env.CHASE !== '0' && await page.evaluate(() => window.__probe.godWarpHook('yard-road'))) {
  await sleep(1500);
  const spot = await clearHeading();
  results.push(await walk('yard-road / chase sprint', { run: true, seconds: 11, chase: 30, spot }));
  // Off the key: how long until the sprint is his again.
  const recovery = await page.evaluate(() => new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      const b = window.__probe.locomotion().breath;
      if (!b.winded) return resolve({ free: +((performance.now() - started) / 1000).toFixed(2), reserve: b.reserve });
      if (performance.now() - started > 20000) return resolve({ free: null, reserve: b.reserve });
      requestAnimationFrame(tick);
    };
    tick();
  }));
  console.log(`winded to sprint-again, standing: ${JSON.stringify(recovery)}`);
  results.push({ label: 'recovery', ...recovery });
}
for (const place of SOURCE_PLACES) {
  try {
    await clearScenes();
    await goTo(place);
    await sleep(3500);
    await clearScenes();
    console.log(`${place}: reading locomotion costs ${await readCost()} us a call`);
    results.push(await walk(`${place} / W`));
    results.push(await walk(`${place} / Shift+W`, { run: true }));
  } catch (error) { console.log(`${place}: ${String(error).slice(0, 200)}`); }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ results, errors }, null, 1));
await browser.close();
