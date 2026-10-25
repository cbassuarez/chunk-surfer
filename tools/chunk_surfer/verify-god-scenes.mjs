// THE GOD MENU'S NEWER ROWS AND THE NO-SD BASELINE, checked in a real page with
// no diffusion lens at all: no server, no stub where the check is about rows.
//
//   node_modules/.bin/vite --host 127.0.0.1 --port 5202 --strictPort
//   node tools/chunk_surfer/verify-god-scenes.mjs [rows|baseline|all]
//
//   rows      boots with ?nosd=1 (which is itself the boot gate's no-SD path),
//             then runs every new God row through __probe.godRow exactly as the
//             menu would: each warp must land on its hook, each scene row must
//             open something. The NUKE row is never pressed here: it ends every
//             copy of this game's lens on the machine, including one another
//             agent started. The process check (a dry run) is.
//   baseline  boots with a lens-shaped stub full of real bitmaps, switches SD
//             off, and reads what was released; then reloads and checks the
//             choice survived, the boot gate passed, and no socket was opened.
//
// Writes artifacts/god-scenes/report.json.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { GOD_LOCATION_HOOKS } from '../../src/data/god-hooks.js';
import * as FP from '../../src/world/floorplan.js';

const BASE = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5202';
const OUT = 'artifacts/god-scenes';
const mode = process.argv[2] || 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function socketTap() {
  const Native = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = function (url, ...rest) { window.__sockets.push(String(url)); return new Native(url, ...rest); };
  window.WebSocket.prototype = Native.prototype;
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
}

async function boot(page, query) {
  await page.goto(`${BASE}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const deadline = Date.now() + 300000, seen = new Set();
  for (;;) {
    if (Date.now() > deadline) throw new Error(`boot never reached the game (saw ${[...seen].join(' > ')})`);
    const at = await page.evaluate(() => ({ id: window.__scenes?.top?.()?.id || null, screen: window.__chunkParity?.().screen || null })).catch(() => ({}));
    if (at.id) seen.add(at.id);
    if (at.screen === 'game') return [...seen];
    if (at.id === 'opening-credits') await page.evaluate(() => window.__scenes.top().update(30));
    else if (['eula', 'title', 'difficulty-select'].includes(at.id)) await page.keyboard.press('Enter');
    else if (at.id === 'warning') { await page.keyboard.press('Enter'); await page.keyboard.press('n'); }
    await sleep(400);
  }
}

const readState = (page) => page.evaluate(() => {
  const parity = window.__chunkParity?.();
  return {
    top: window.__scenes?.top?.({ includeOverlay: true })?.id || null, depth: window.__scenes?.depth?.() || 0,
    area: parity?.save?.area || null, pos: window.__probe?.pos?.() || null,
  };
});

async function rows(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(socketTap);
  const scenesSeen = await boot(page, '&nosd=1');
  const atBoot = await page.evaluate(() => window.__probe.stableDiffusion.state());
  await page.evaluate(() => window.__probe.testRun());
  await sleep(4000);
  const ids = await page.evaluate(() => window.__probe.godRowIds());
  const pick = (tab, filter = () => true) => (ids.find((t) => t.tab === tab)?.rows || []).filter(filter);
  const building = [
    ...pick('places'), ...pick('quests'), ...pick('academic'),
    ...pick('scenes', (id) => /^(tutorial-|arrival-title|transfer-room|archive)/.test(id)),
    'roof-word-lock', 'roof-city-seat-sit', 'drive-opening-van', 'drive-getin-teaser', ...pick('drives', (id) => id === 'drive-street-study'),
  ];
  const source = [
    'drive-source-cut', 'drive-source-resume', 'drive-coastal-memory',
    ...pick('source-space', (id) => /^(source-(coastal-memory|earthfall|pub-door|pub-inside|drive)|bust-)/.test(id)),
  ];
  const results = [];
  for (const id of [...building, ...source, 'sd-processes']) {
    const before = errors.length;
    await page.evaluate(() => { try { window.__scenes.clear(); } catch {} });
    const topBefore = (await readState(page)).top;
    const ret = await Promise.race([
      page.evaluate(async (rowId) => { try { const r = await window.__probe.godRow(rowId); return r && typeof r === 'object' ? (r.id || r.ready || r.phase || 'object') : r; } catch (e) { return `THREW ${e?.message || e}`; } }, id),
      sleep(60000).then(() => 'TIMEOUT'),
    ]);
    await sleep(1800);
    const state = await readState(page);
    const hookId = id.startsWith('place-') ? id.slice(6) : id.startsWith('academic-') && GOD_LOCATION_HOOKS[id.slice(9)] ? id.slice(9) : id === 'quest-pub-bar' ? 'pub-bar' : null;
    let verdict;
    if (hookId) {
      const want = FP.toRuntimePoint(GOD_LOCATION_HOOKS[hookId].at);
      verdict = ret === true && state.pos?.x === want.x && state.pos?.y === want.y ? 'LANDED' : `MISSED want ${want.x},${want.y}`;
    } else if (/^(THREW|TIMEOUT)/.test(String(ret)) || ret === false) verdict = 'FAILED';
    // Some entries open a scene and return nothing (openTransferRoom).
    else verdict = ret != null || (state.top && state.top !== topBefore) ? 'OPENED' : 'FAILED';
    const row = { id, ret, verdict, ...state, errors: errors.slice(before) };
    if (id === 'sd-processes') row.scan = await page.evaluate(() => window.__probe.stableDiffusion.state().lastScan);
    results.push(row);
    console.log(`${verdict.padEnd(8)} ${id.padEnd(30)} ret=${String(ret).slice(0, 24).padEnd(24)} top=${state.top || '-'} area=${state.area}${row.errors.length ? `  ERR ${row.errors[0]}` : ''}`);
  }
  // The dev server's own client socket is not a lens.
  const sockets = (await page.evaluate(() => window.__sockets)).filter((url) => new URL(url).host !== new URL(BASE).host);
  const after = await page.evaluate(() => window.__probe.stableDiffusion.state());
  await context.close();
  return { scenesSeen, atBoot, after, sockets, results };
}

async function baseline(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(socketTap);
  // A stand-in client shaped like the lens, carrying six banks of real 512px
  // bitmaps, so the switch has something real to close. Only while SD is on.
  await page.evaluateOnNewDocument(() => {
    try {
      // This isolated fixture deliberately opts in once. Missing preferences
      // now mean OFF; preserve the OFF written by the switch for the reload.
      if (localStorage.getItem('chunk-surfer.sd-off') == null) localStorage.setItem('chunk-surfer.sd-off', '0');
      if (localStorage.getItem('chunk-surfer.sd-off') !== '0') return;
    } catch { return; }
    const banks = new Map(), stats = { criticalBank: 'calm', resident: true, state: 'stand-in', banksReady: 6, framesOut: 0, framesIn: 0 };
    const ready = (async () => {
      const canvas = new OffscreenCanvas(512, 512), g = canvas.getContext('2d');
      for (const bank of ['calm', 'dark', 'warm', 'cold', 'hot', 'void']) {
        const stack = [];
        for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(${i * 40},50%,50%)`; g.fillRect(0, 0, 512, 512); stack.push(await createImageBitmap(canvas)); }
        banks.set(bank, [stack]);
      }
    })();
    const timer = setInterval(() => { stats.framesOut++; stats.framesIn++; }, 100);
    window.__diffusion = { ready, stats, banks, activateBank: async () => true, retry: async () => true, stop: () => clearInterval(timer) };
  });
  await boot(page, '');
  await page.evaluate(() => window.__diffusion.ready);
  const heap = () => page.evaluate(() => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? null; });
  // The building finishes loading after the game screen comes up; read the heap
  // only once it has stopped moving, or the comparison measures the load.
  const settled = async () => {
    let last = await heap();
    for (let calm = 0, i = 0; calm < 3 && i < 40; i++) { await sleep(2000); const now = await heap(); calm = Math.abs(now - last) / last < .01 ? calm + 1 : 0; last = now; }
    return last;
  };
  const on = { ...(await page.evaluate(() => window.__probe.stableDiffusion.state())), heap: await settled() };
  await sleep(1000);
  const onLater = await page.evaluate(() => window.__probe.stableDiffusion.state().framesOut);
  const offReport = await page.evaluate(() => window.__probe.stableDiffusion.off());
  await sleep(1500);
  const off = { ...(await page.evaluate(() => window.__probe.stableDiffusion.state())), heap: await settled() };
  // The choice is kept in this browser: a reload boots straight past the gate.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadScenes = await boot(page, '');
  const reloaded = await page.evaluate(() => ({ ...window.__probe.stableDiffusion.state(), sockets: window.__sockets.filter((url) => new URL(url).host !== location.host), client: !!window.__diffusion }));
  await context.close();
  return { on, onFramesAfter1s: onLater, offReport, off, reloadScenes, reloaded, errors };
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  protocolTimeout: 600000,
});
const report = {};
try {
  if (mode === 'rows' || mode === 'all') report.rows = await rows(browser);
  if (mode === 'baseline' || mode === 'all') report.baseline = await baseline(browser);
} catch (error) {
  console.error('FAIL', error.stack); process.exitCode = 1;
} finally {
  await browser.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  // A closed browser can leave a pipe that keeps node waiting; the report is out.
  process.exit();
}
