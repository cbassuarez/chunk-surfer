// Live frames of the two flesh reveals, through the game's own display:
// the bus woman's opening (staged by the tower-warning review, then TRY and
// OPEN pressed as a player would) and a torch-lit emergency apparition at
// range and at the nearest distance its no-loom clamp allows.
//   FLESH_LABEL=before|after  FLESH_MODE=bus|apparition|all  FLESH_URL=http://127.0.0.1:5201
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { CELL } from '../../src/data/floorplan/legend.js';
import sharp from 'sharp';

const BASE = process.env.FLESH_URL || 'http://127.0.0.1:5201';
const LABEL = process.env.FLESH_LABEL || 'before';
const MODE = process.env.FLESH_MODE || 'all';
const OUT = path.resolve(process.env.FLESH_OUT || `artifacts/flesh-reveal/${LABEL}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(done => setTimeout(done, ms));
const errors = [], records = [];

const profile = fs.mkdtempSync('/private/tmp/chunk-surfer-flesh-');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  userDataDir: profile, headless: true, protocolTimeout: 300000,
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }); });
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (/shader|GLSL|ERROR: 0:|link.*fail|INVALID/i.test(message.text())) errors.push(message.text()); });

async function boot() {
  await page.goto(`${BASE}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nosd=1&towerWarningReview=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun, { timeout: 120000 });
  await page.waitForFunction(() => ['eula', 'lens-calibration', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 120000 });
  for (let n = 0; n < 180; n++) {
    const scene = await page.evaluate(() => window.__scenes?.top()?.id);
    if (scene === 'title' || scene === 'lens-calibration') break;
    if (scene === 'eula') await page.keyboard.press('Enter');
    await sleep(300);
  }
  await page.evaluate(async () => { await window.__probe.testRun(); window.__probe.tutSkip?.(); window.__probe.hush?.();
    window.__probe.setFlags?.(['van.closed', 'kit.fitted']); window.__probe.setReduceMotion?.(false); });
  await sleep(1500);
}

// burst > 1 takes several frames ~350ms apart and keeps the best lit: the
// bus encounter dips its light at moments, and a dip is not the subject.
async function shot(name, extra = {}, burst = 1) {
  await page.evaluate(() => { const p = document.getElementById('tower-warning-review-tools'); if (p) p.style.visibility = 'hidden'; });
  const file = path.join(OUT, `${name}.png`);
  let best = null;
  for (let n = 0; n < burst; n++) {
    const bytes = await page.screenshot();
    const { data } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0; for (const v of data) sum += v; const mean = sum / data.length;
    if (!best || mean > best.mean) best = { bytes, mean };
    if (n < burst - 1) await sleep(350);
  }
  fs.writeFileSync(file, best.bytes); extra = { ...extra, meanLuma: +best.mean.toFixed(2), burst };
  await page.evaluate(() => { const p = document.getElementById('tower-warning-review-tools'); if (p) p.style.visibility = 'visible'; });
  records.push({ name, file, ...extra }); console.log('CAPTURE', name, JSON.stringify(extra));
}

// ---------------------------------------------------------------- the bus
async function click(label) {
  const ok = await page.evaluate(label => { const b = [...document.querySelectorAll('#tower-warning-review-tools button')].find(b => b.textContent === label); if (!b) return false; b.click(); return true; }, label);
  assert.ok(ok, `review button ${label}`);
}
async function telemetry() {
  return page.evaluate(() => { try { return JSON.parse(document.querySelector('#tower-warning-review-tools pre')?.textContent || 'null'); } catch { return null; } });
}
async function busRun() {
  await click('Bus / rear bay');
  await page.waitForFunction(() => /Staged bus-rear/.test(document.querySelector('#tower-warning-review-tools div')?.textContent || ''), { timeout: 180000 });
  await sleep(2500);
  const first = await telemetry(), o = first?.street?.bus?.lighting?.origin;
  assert.ok(o, 'bus origin from review telemetry');
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), floor = o.y + .5;
  const world = (x, z) => ({ x: o.x + x * c + z * s, z: o.z - x * s + z * c });
  const stand = async (x, z) => { const p = world(x, z); await page.evaluate(([a, b]) => window.__probe.sourceWarp(a, b), [p.x / CELL - .5, p.z / CELL - .5]); await sleep(350); };
  const look = async (from, at, height) => {
    const a = world(...from), b = world(...at), d = Math.hypot(b.x - a.x, b.z - a.z);
    await page.evaluate(([yaw, pitch]) => window.__probe.lookAtWorld(yaw, pitch), [Math.atan2(b.x - a.x, -(b.z - a.z)), Math.atan2(floor + height - (floor + 1.62), d)]);
    await sleep(250);
  };
  const transit = async () => (await telemetry())?.street?.bus?.transit || null;
  const refresh = async () => click('Look down aisle').catch(() => {});

  await page.evaluate(() => window.__probe.setTorch?.(true));
  await stand(0, 2.5); await look([0, 2.5], [0, 4.3], 1.45); await shot('bus-00-closed', { opening: 0 });
  await refresh(); console.log('TRANSIT0', JSON.stringify(await transit()));
  for (const [x, z] of [[.7, 4.0], [.62, 3.95], [.75, 4.05]]) {
    await stand(x, z); await look([x, z], [1.175, 4.16], 1.03);
    if (process.env.FLESH_DEBUG) await shot(`debug-handle-${x}-${z}`);
    await page.keyboard.press('e'); await sleep(400);
    await refresh(); const tryAt = (await transit())?.tryAt; console.log('TRY', x, z, JSON.stringify(tryAt), JSON.stringify(await page.evaluate(() => window.__probe.pos())));
    if (tryAt != null) break;
  }
  await sleep(2000);
  await stand(0, 2.5); await look([0, 2.5], [-.57, 3.55], 1.2); await page.keyboard.press('e');
  const openedAt = Date.now(); await sleep(150); await refresh();
  const t = await transit(); console.log('OPEN', JSON.stringify({ tryAt: t?.tryAt, openAt: t?.openAt, clock: t?.clock }));
  await look([0, 2.5], [0, 4.3], 1.45);
  for (const [at, name] of [[1.05, 'bus-01-parting'], [1.85, 'bus-02-half'], [3.3, 'bus-03-open']]) {
    const wait = openedAt + at * 1000 - Date.now(); if (wait > 0) await sleep(wait);
    await shot(name, { secondsAfterOpen: (Date.now() - openedAt) / 1000 });
  }
  await stand(.2, 3.45); await look([.2, 3.45], [0, 4.3], 1.5); await shot('bus-04-open-close', { from: [.2, 3.45] }, 6);
  await stand(-.25, 1.9); await look([-.25, 1.9], [.1, 4.3], 1.3); await shot('bus-05-open-aisle-angle', { from: [-.25, 1.9] }, 6);
  await page.evaluate(() => window.__probe.setTorch?.(false)); await sleep(300);
  await stand(0, 2.5); await look([0, 2.5], [0, 4.3], 1.45); await shot('bus-06-open-torch-off', { torch: false });
  await page.evaluate(() => window.__probe.setTorch?.(true)); await sleep(300);
  await stand(0, 2.5); await look([0, 2.5], [0, 4.3], 1.45); await shot('bus-07-open-settled', { secondsAfterOpen: (Date.now() - openedAt) / 1000 }, 6);
  await refresh(); records.push({ name: 'bus-final-telemetry', bus: (await telemetry())?.street?.bus || null });
}

// ------------------------------------------------------------ the film
// The scene as a player plays it, from the approach: board, the trap, the
// walk to the back, the struggle with the rear door, OPEN, and through her.
// Frames go to OUT/film/ as numbered JPEGs with their wall-clock offsets.
async function filmRun() {
  const dir = path.join(OUT, 'film'); fs.mkdirSync(dir, { recursive: true });
  await click('Bus / approach');
  await page.waitForFunction(() => /Staged bus-approach/.test(document.querySelector('#tower-warning-review-tools div')?.textContent || ''), { timeout: 180000 });
  await sleep(2500);
  const o = (await telemetry())?.street?.bus?.lighting?.origin; assert.ok(o, 'bus origin');
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), floor = o.y + .5, t0 = Date.now();
  const world = (x, z) => ({ x: o.x + x * c + z * s, z: o.z - x * s + z * c });
  const here = async () => { const p = await page.evaluate(() => window.__probe.pos()), wx = (p.x + .5) * CELL, wz = (p.y + .5) * CELL, dx = wx - o.x, dz = wz - o.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
  const lookAt = async (at, height = 1.45) => { const h = await here(), b = world(...at), a = world(h.x, h.z), d = Math.hypot(b.x - a.x, b.z - a.z);
    await page.evaluate(([yaw, pitch]) => window.__probe.lookAtWorld(yaw, pitch), [Math.atan2(b.x - a.x, -(b.z - a.z)), Math.atan2(height - 1.62, Math.max(.2, d))]); };
  let n = 0; const frames = [];
  const frame = async label => {
    await page.evaluate(() => { const p = document.getElementById('tower-warning-review-tools'); if (p) p.style.visibility = 'hidden'; });
    const file = path.join(dir, `${String(n++).padStart(3, '0')}-${label}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 }); frames.push({ file, label, t: (Date.now() - t0) / 1000 });
    await page.evaluate(() => { const p = document.getElementById('tower-warning-review-tools'); if (p) p.style.visibility = 'visible'; });
  };
  const walkTo = async (x, z, label, look = null) => {
    let best = Infinity, stalled = 0;
    for (let i = 0; i < 40; i++) {
      const h = await here(), d = Math.hypot(h.x - x, h.z - z); if (d < .28) break;
      if (d > best - .02) { if (++stalled > 6) { console.log('STALL', label, JSON.stringify(h)); break; } } else { best = d; stalled = 0; }
      await lookAt([x, z], 1.5);
      await page.keyboard.down('w'); await sleep(130); await page.keyboard.up('w'); await sleep(40);
      if (look) await lookAt(look);
      if (i % 2 === 0) await frame(label);
    }
  };
  const stay = async (seconds, label, every = .16) => { const end = Date.now() + seconds * 1000; while (Date.now() < end) { await frame(label); await sleep(every * 1000); } };
  await page.evaluate(() => window.__probe.setTorch?.(true));
  await lookAt([-1.0, -3.15]); await frame('approach');
  await walkTo(-1.9, -3.15, 'to-door');
  await walkTo(-.2, -3.15, 'boarding');
  await lookAt([0, 3.6]); await walkTo(0, -1.0, 'aisle', [0, 3.6]);
  await stay(3.4, 'trap');
  await walkTo(0, 2.4, 'down-aisle', [-.57, 3.55, 1.6]);
  await stay(1.2, 'her');
  // The lattice walk cannot always land on the release bar's reach; place
  // the body where the bus-mode check found TRY and OPEN to register.
  const stand = async (x, z) => { const p = world(x, z); await page.evaluate(([a, b]) => window.__probe.sourceWarp(a, b), [p.x / CELL - .5, p.z / CELL - .5]); await sleep(300); };
  const closeOverlay = async () => { for (let i = 0; i < 4; i++) { const top = await page.evaluate(() => window.__scenes?.top()?.id || null); if (!top || top === 'pause') break; console.log('OVERLAY', top); await page.keyboard.press('Escape'); await sleep(300); } };
  await walkTo(.45, 3.2, 'to-rear-door'); await stand(.7, 4.0);
  await lookAt([1.175, 4.16], 1.03); await frame('at-handle');
  await page.keyboard.press('e'); await stay(2.7, 'struggle', .10); await closeOverlay();
  // No warp from here on: the recoil has to have put the body where OPEN works.
  const landed = await here(); console.log('RECOIL', JSON.stringify(landed)); records.push({ name: 'recoil-landing', ...landed });
  await frame('facing-her');
  await page.keyboard.press('e'); await sleep(120); await closeOverlay(); await lookAt([0, 4.3]);
  await stay(3.6, 'opening', .14);
  await stay(1.0, 'open');
  for (let i = 0; i < 24; i++) { const h = await here(); if (Math.abs(h.x) > 50 || Math.abs(h.z) > 50) break;
    await lookAt([0, 4.6], 1.6); await page.keyboard.down('w'); await sleep(130); await page.keyboard.up('w'); await sleep(60); await frame('through'); }
  await stay(1.4, 'inside');
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(frames, null, 1));
  console.log('FILM', frames.length, 'frames');
}

// --------------------------------------------------------- reachability
// Can ordinary movement keys get a player from the aisle to a TRY at the
// rear door? Plain key presses only; no warps after staging.
async function reachRun() {
  await click('Bus / aisle');
  await page.waitForFunction(() => /Staged bus-aisle/.test(document.querySelector('#tower-warning-review-tools div')?.textContent || ''), { timeout: 180000 });
  await sleep(2500);
  const o = (await telemetry())?.street?.bus?.lighting?.origin; assert.ok(o, 'bus origin');
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  const here = async () => { const p = await page.evaluate(() => window.__probe.pos()), wx = (p.x + .5) * CELL, wz = (p.y + .5) * CELL, dx = wx - o.x, dz = wz - o.z; return { x: +(dx * c - dz * s).toFixed(2), z: +(dx * s + dz * c).toFixed(2) }; };
  const face = async (x, z) => { const h = await here(), a = { x: o.x + h.x * c + h.z * s, z: o.z - h.x * s + h.z * c }, b = { x: o.x + x * c + z * s, z: o.z - x * s + z * c };
    await page.evaluate(y => window.__probe.lookAtWorld(y, -.1), Math.atan2(b.x - a.x, -(b.z - a.z))); };
  const tap = async key => { await page.keyboard.down(key); await sleep(150); await page.keyboard.up(key); await sleep(250); };
  const trail = [await here()];
  // Down the aisle facing the rear, then sidestep and edge toward the bar.
  await face(0, 4.4); for (let i = 0; i < 12; i++) { await tap('w'); trail.push(await here()); }
  for (const key of ['d', 'd', 'w', 'd', 'w', 'w', 'd']) { await face(1.175, 4.16); await tap(key); trail.push(await here()); }
  console.log('TRAIL', JSON.stringify(trail));
  await face(1.175, 4.16); await sleep(300);
  const before = (await telemetry())?.street?.bus?.transit?.tryAt ?? null;
  await page.keyboard.press('e'); await sleep(500);
  await click('Look at rear handle').catch(() => {});
  const after = (await telemetry())?.street?.bus?.transit?.tryAt ?? null;
  await shot('reach-final', { at: await here(), tryAt: after });
  console.log('REACH', JSON.stringify({ final: await here(), tryBefore: before, tryAfter: after }));
}

// ------------------------------------------------------------- the dips
// What lines up with the moments the bus goes dark? Samples screen, torch,
// HUSH presence and Source's fault clock together, about ten times a second.
async function dipsRun() {
  await click('Bus / rear bay');
  await page.waitForFunction(() => /Staged bus-rear/.test(document.querySelector('#tower-warning-review-tools div')?.textContent || ''), { timeout: 180000 });
  await sleep(2500);
  await page.evaluate(() => window.__probe.setTorch?.(true));
  const rows = [], end = Date.now() + 16000;
  while (Date.now() < end) {
    rows.push(await page.evaluate(async () => {
      const F = await import('/src/game/source-faults.js'), P = window.__probe, s = P.sceneStats(64), pr = P.presence?.() || {}, l = P.light?.() || {};
      const fault = F.sourceFaultFrame({ sourcePhase: true, proper: true, timeMs: performance.now() });
      return { t: +(performance.now() / 1000).toFixed(2), luma: +(s?.luma ?? 0).toFixed(2), lit: +(s?.litPct ?? 0).toFixed(1), on: !!P.rec?.().light,
        overflow: !!fault.overflowActive, hushActive: !!pr.active, hushDist: pr.dist == null ? null : +Number(pr.dist).toFixed(1), pressure: pr.pressure == null ? null : +Number(pr.pressure).toFixed(2), torch: l.torch ?? l.beam ?? null };
    }));
    await sleep(70);
  }
  fs.writeFileSync(path.join(OUT, 'dips.json'), JSON.stringify(rows));
  const lumas = rows.map(r => r.luma).sort((a, b) => a - b), median = lumas[lumas.length >> 1], dark = rows.filter(r => r.luma < median * .6);
  const share = (list, f) => list.length ? +(100 * list.filter(f).length / list.length).toFixed(0) : null;
  console.log('DIPS', JSON.stringify({ samples: rows.length, median, darkSamples: dark.length, darkWithOverflow: share(dark, r => r.overflow), allWithOverflow: share(rows, r => r.overflow),
    darkWithHush: share(dark, r => r.hushActive), allWithHush: share(rows, r => r.hushActive), sample: rows.slice(0, 2), keys: Object.keys(rows[0]) }));
}

// --------------------------------------------------------- the apparition
async function apparitionRun() {
  await page.evaluate(() => { window.__probe.apparitionCaptureLight?.(null); window.__probe.setPower?.('sp02', true); window.__probe.setPower?.('sp03', true);
    window.__probe.apparitionEffects?.('full'); window.__probe.setReduceDread?.(false); window.__probe.setTorch?.(true); });
  assert.ok(await page.evaluate(() => window.__probe.godWarpHook('concert-hall')), 'hall warp');
  await sleep(1500);
  await page.evaluate(() => window.__probe.apparitionReset?.('review:flesh'));
  await page.waitForFunction(() => window.__probe.apparitionGate()?.submitted?.active, { timeout: 30000 });
  const lightId = await page.evaluate(() => window.__probe.apparitionGate()?.submitted?.lightId || null);
  await page.evaluate(id => window.__probe.apparitionCaptureLight(id), lightId);
  // Walk at the nearest figure the way a player would. The station clamp
  // keeps it at least 2.2m away, so the last step is the closest it allows.
  const target = async () => { const d = await page.evaluate(() => window.__probe.apparitions());
    const bodies = (d.bodies || []).filter(b => !b.shadowOnly), body = bodies.sort((a, b) => a.distance - b.distance)[0];
    const i = d.bodies?.indexOf(body) ?? -1; return { d, body, yaw: d.bearings?.[i], pitch: d.pitches?.[i] }; };
  console.log('APPARITIONS', JSON.stringify((await target()).d.bodies));
  const step = async (key, yaw) => { await page.evaluate(y => window.__probe.lookAtWorld(y, 0), yaw); await page.keyboard.down(key); await sleep(140); await page.keyboard.up(key); };
  // Far first: back away until the nearest figure is beyond the gore radius.
  for (let n = 0; n < 60; n++) { const t = await target(); if (!t.body || t.body.distance >= 5.0) break; await step('s', t.yaw); }
  for (const [stop, name] of [[Infinity, 'app-00-far'], [3.9, 'app-01-range'], [3.3, 'app-02-mid'], [2.3, 'app-03-closest']]) {
    if (Number.isFinite(stop)) {
      let best = Infinity;
      for (let n = 0; n < 160; n++) {
        const t = await target(); if (!t.body || t.body.distance <= stop) break;
        // The crowd re-stages on the far side once there is no room in front
        // of the lamp; a jump means the last step was one too many.
        if (t.body.distance > best + .8) { await step('s', t.yaw); break; }
        best = Math.min(best, t.body.distance);
        await step('w', t.yaw);
      }
      console.log('APPROACH', name, (await target()).body?.distance);
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      const t = await target(), d = t.d;
      if (Number.isFinite(t.yaw)) await page.evaluate(([y, p]) => window.__probe.lookAtWorld(y, p), [t.yaw, Number.isFinite(t.pitch) ? t.pitch : -.05]);
      const state = await page.evaluate(() => window.__probe.apparitionGate()?.submitted?.lightingState);
      if (state !== 'emergency-off') { await sleep(60); continue; }
      await shot(name, { lightingState: state, distance: t.body?.distance, bodies: d.bodies });
      const after = await page.evaluate(() => window.__probe.apparitionGate()?.submitted?.lightingState);
      if (after === 'emergency-off') break;
      records.pop();
    }
  }
}

try {
  await boot();
  if (MODE === 'film') await filmRun();
  if (MODE === 'reach') await reachRun();
  if (MODE === 'dips') await dipsRun();
  if (MODE === 'bus' || MODE === 'all') await busRun();
  if (MODE === 'apparition' || MODE === 'all') { if (MODE === 'all') await boot(); await apparitionRun(); }
} catch (error) {
  errors.push(String(error.stack || error)); console.error(error);
  await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(OUT, `report-${MODE}.json`), JSON.stringify({ label: LABEL, mode: MODE, records, errors }, null, 2));
  await browser.close(); fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(errors.length ? 1 : 0);
