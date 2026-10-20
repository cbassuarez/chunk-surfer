// THE EAR ROOM, WALKED INTO, IN EACH OF THE FOUR ROOMS IT CAN BE.
//
// For each candidate: two other rooms on tape, the room forgotten, then in
// through its door. B3 is walked into for real (the passage has no leaf); the
// others are warped inside and given the same entry check the step makes. Then
// photographed by torch at a few headings, with the sound's own report beside
// each shot, and the take sheet is picked up and read.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-stop-listening.mjs [room ...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { STOP_LISTENING_ROOMS } from '../../src/data/stop-listening.js';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;
const OUT = 'artifacts/stop-listening/shots';
fs.mkdirSync(OUT, { recursive: true });

const ALL = ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'];
const N = 0, E = Math.PI / 2, S = Math.PI, W = -Math.PI / 2;
// After B3, every room is reached with only B3 on tape. Each room's own set
// piece is settled first (a busy room is never dressed); the skip itself is
// walked separately below.
const ROOMS = [
  { id: 'the_tub', inside: [84, 28.6, 2], encounters: ['natatorium-approach'],
    views: [['ahead', S, -.35], ['floor', S + .3, -.8], ['west', W, -.05], ['east', E, -.05]] },
  { id: 'amplifications', inside: [99.6, 24.5, 1],
    views: [['aisle-stage', N, -.25], ['aisle-back', S, -.3], ['floor', E + .6, -.85], ['wall', W + .3, -.05]] },
  { id: 'soundnoisemusic', inside: [74.4, 54.5, 3], flags: ['practice.metronomes.quieted', 'practice.student.heard'],
    views: [['corridor', W, -.3], ['floor', W, -.8], ['north-wall', N + .4, -.05], ['south-wall', S - .4, -.05]] },
];
const only = process.argv.slice(2);

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
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 240)));
page.on('console', (m) => { const t = m.text(); if (/ear room|stop-listening/i.test(t)) console.log('  CONSOLE:', t.slice(0, 240)); });
const wait = (f, t = 300000, ...args) => page.waitForFunction(f, { timeout: t }, ...args);
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = (name, ...args) => page.evaluate((n, a) => window.__probe[n](...a), name, args);

await page.goto(`http://127.0.0.1:${PORT}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=1&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') { await page.keyboard.press('Enter'); await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000); }
// The credits plate can take more than one push once the lens has settled.
for (let i = 0; i < 120 && await top() !== 'title'; i++) {
  if (await top() === 'opening-credits') await page.evaluate(() => window.__scenes.top().update(30));
  await sleep(500);
}
// Title, then the content warning ([N] declines the reduced-dread variant).
// Older builds had a difficulty menu between them; press through whatever is up.
for (let i = 0; i < 40 && await page.evaluate(() => window.__chunkParity?.().screen) !== 'game'; i++) {
  const id = await top();
  await page.keyboard.press('Enter');
  if (id === 'warning') await page.keyboard.press('n');
  await sleep(700);
}
await wait(() => window.__chunkParity?.().screen === 'game', 240000);
await page.evaluate(() => { window.__probe.testRun(); window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint']); });
// Let the packs land: the ear room's is loaded after the gallery's.
await sleep(4000);

const results = [];
for (const room of ROOMS) {
  if (only.length && !only.includes(room.id)) continue;
  await probe('setTakes', ALL, false);
  await probe('setTakes', ['main_b3'], true);
  if (room.flags) await probe('setFlags', room.flags);
  for (const id of room.encounters || []) await probe('clearEncounter', id);
  let state = await probe('stopListeningReset');
  console.log(`\n${room.id}: takes ${state.takes.join(',')} → staged ${state.staged.join(',')} (${state.props} props)`);
  if (!state.staged.includes(room.id)) { console.log('  FAIL: not staged'); results.push({ room: room.id, ok: false }); continue; }

  await probe('warpCell', ...room.inside);
  await page.evaluate(() => window.__probe.setTorch(true));
  await probe('stopListeningEnterHere');
  await sleep(2600);
  state = await probe('stopListening');
  const ok = state.state.room === room.id && state.staged.length === 1;
  console.log(`  entered: room=${state.state.room} here=${state.here} spoken=${state.state.arrivalSpoken} props=${JSON.stringify(state.byKind)} ${ok ? 'OK' : 'FAIL'}`);
  console.log(`  audio: loaded=${state.audio?.loaded} audible=${state.audio?.audible} fired=${state.audio?.fired} failed=${state.audio?.failed || '-'}`);

  for (const [name, yaw, pitch] of room.views) {
    await probe('lookAtWorld', yaw, pitch);
    await page.evaluate(() => window.__probe.setTorch(true));
    await sleep(900);
    const file = `${OUT}/${room.id}-${name}.png`;
    await page.screenshot({ path: file });
    const s = await probe('stopListening');
    const voices = (s.audio?.voices || []).map((v) => `${v.id.split(':')[1]}:g${v.gain} p${v.pan} r${v.rear}`).join('  ');
    const diag = await page.evaluate(() => ({ torch: window.__probe.torch?.(), stats: window.__probe.sceneStats?.(96), look: window.__probe.lookAngles?.() }));
    console.log(`  ${name.padEnd(12)} yaw ${yaw.toFixed(2)} (local ${diag.look?.yaw?.toFixed?.(2)})  torch ${JSON.stringify(diag.torch)} luma ${diag.stats?.luma?.toFixed?.(3)} lit ${diag.stats?.litPct?.toFixed?.(1)}`);
    console.log(`               ${voices}`);
  }
  // Close: a metre short of the first heap, looking down at it.
  const h = STOP_LISTENING_ROOMS[room.id].heaps[0], e = STOP_LISTENING_ROOMS[room.id].entry;
  const d = Math.hypot(h.x - e.x, h.y - e.y) || 1, ux = (h.x - e.x) / d, uy = (h.y - e.y) / d;
  await probe('warpCell', h.x - ux * 0.9, h.y - uy * 0.9);
  await page.evaluate(() => window.__probe.setTorch(true));
  await probe('lookAtWorld', Math.atan2(ux, -uy), -1.0);
  await page.evaluate(() => window.__probe.propDiagnostics(true));
  await sleep(900);
  await page.screenshot({ path: `${OUT}/${room.id}-close.png` });
  const drawn = await page.evaluate(() => {
    const d = window.__probe.propDiagnostics();
    window.__probe.propDiagnostics(false);
    return Object.fromEntries(Object.entries(d?.mainDrawCallsByMesh || {}).filter(([k]) => k.startsWith('stop_listening')));
  });
  console.log(`  close: drawn ${JSON.stringify(drawn)}`);
  results.push({ room: room.id, ok, byKind: state.byKind, audio: state.audio });
}

// THE SKIP: B3 on tape, the wing's metronomes still going. He walks into the
// wing (the step-entry check, for real), it is passed over, and the hall he
// walks into next is the room.
if (!only.length || only.includes('skip')) {
  await probe('setTakes', ALL, false);
  await probe('setTakes', ['main_b3'], true);
  await probe('setFlags', [], ['practice.metronomes.quieted', 'practice.student.heard', 'practice.student.pending']);
  await probe('clearEncounter', 'natatorium-approach');
  let s = await probe('stopListeningReset');
  const before = s.staged.join(',');
  await probe('warpCell', 77.5, 54.5, 3);
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 40 && (await probe('stopListening')).here !== 'soundnoisemusic'; i++) await sleep(100);
  await page.keyboard.up('ArrowUp');
  await sleep(300);
  s = await probe('stopListening');
  const passed = s.state.skipped.includes('soundnoisemusic') && !s.state.room && !s.staged.includes('soundnoisemusic');
  console.log(`\nskip: staged ${before} → walked into ${s.here} (busy ${s.busy.soundnoisemusic}) → skipped ${s.state.skipped.join(',')} staged ${s.staged.join(',')} props ${s.props}`);
  await probe('warpCell', 99.6, 24.5, 1);
  await probe('stopListeningEnterHere');
  s = await probe('stopListening');
  const next = s.state.room === 'amplifications';
  console.log(`skip: then the hall → room ${s.state.room}, staged ${s.staged.join(',')}`);
  results.push({ room: 'skip', ok: passed && next });
}

// The sheet, in the hall (lit): stand over it, [E], read it, put it down.
if (!only.length || only.includes('sheet')) {
  await probe('setTakes', ALL, false);
  await probe('setTakes', ['main_b3'], true);
  await probe('stopListeningReset');
  await probe('warpCell', 99.6, 24.5, 1);
  await probe('stopListeningEnterHere');
  const sheet = STOP_LISTENING_ROOMS.amplifications.sheet;
  await probe('warpCell', sheet.x - .2, sheet.y - .9);
  await page.evaluate(() => window.__probe.setTorch(true));
  await probe('lookAtWorld', Math.atan2(.2, -.9), -.95);
  await sleep(900);
  await page.screenshot({ path: `${OUT}/sheet-floor.png` });
  await page.keyboard.press('e');
  await sleep(1200);
  const opened = await top();
  await page.screenshot({ path: `${OUT}/sheet-object.png` });
  await page.keyboard.press('z');
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/sheet-reading.png` });
  // Z backs out of the reading, E puts the sheet down. Escape belongs to the pause menu.
  await page.keyboard.press('z'); await sleep(300); await page.keyboard.press('e');
  await sleep(1500);
  const after = await probe('stopListening');
  console.log(`\nsheet: opened ${opened}; read=${after.state.sheetRead}; now ${await top()}`);
  results.push({ room: 'sheet', ok: String(opened).startsWith('doc:') && after.state.sheetRead });
}
await browser.close();
console.log('\n' + results.map((r) => `${r.room}: ${r.ok ? 'OK' : 'FAIL'}`).join('\n'));
