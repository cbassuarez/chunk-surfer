// Actual game character acceptance. Diagnostic warps visit only the woman's
// existing authored placements; every capture uses the game's own material,
// scene composition and VFD/dither targets.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { CELL } from '../../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../../src/data/source-level.js';
import { OUTSKIRT_STRETCH_START, OUTSKIRT_STRETCH_METRES } from '../../src/data/source-outskirts-arrival.js';

const url = process.env.BUS_WOMAN_VERIFY_URL || 'http://127.0.0.1:5330/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local verification only.');
const out = resolve(process.env.BUS_WOMAN_VERIFY_OUT || 'artifacts/bus-woman-design/production/live');
const expectedAssetHash = createHash('sha256').update(await readFile(resolve('public/assets/bus-woman-character.glb'))).digest('hex');
const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const checks = [], captures = [], errors = [], diagnostics = [], assets = [], requests = new Set();
let browser, page, profile, fatal = null, failureState = null, bootCheckpoint = null, stage = 'boot', propsModuleUrl, renderModuleUrl;
function check(pass, name, detail) {
  checks.push({ pass: !!pass, name, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail) : '');
  assert.ok(pass, name);
}
async function state() {
  return page.evaluate(async ({ propsModuleUrl, renderModuleUrl }) => {
    const P = propsModuleUrl ? await import(propsModuleUrl) : null;
    const R = renderModuleUrl ? await import(renderModuleUrl) : null;
    const p = window.__probe;
    return { pos: p.pos(), look: p.lookAngles(), scene: window.__scenes.top({ includeOverlay: true })?.id,
      light: !!p.rec().light, presentation: p.busWomanPresentation(), convo: p.convo(),
      source: p.chunkSurf(), props: p.sourceProps(), reflection: p.reflection(),
      dither: R?.r3dPixelMeshStatus(), lookProfile: R?.r3dLookStatus(),
      characters: P ? { ...P.characterStats(), poses: P.characterStats().poses.filter(p => /bus_woman/.test(p.mesh)) } : null };
  }, { propsModuleUrl, renderModuleUrl });
}
async function until(predicate, timeout = 15000) {
  const stop = Date.now() + timeout; let current;
  while (Date.now() < stop) { current = await state(); if (predicate(current)) return current; await sleep(80); }
  throw new Error(`Timed out at ${stage}; scene=${current?.scene}; source=${current?.presentation?.source}; clock=${current?.presentation?.clock?.clock}`);
}
const body = (s, id) => s.presentation.instances.find(p => p.id === id && /^(exterior_bus_woman|outskirts_bus_woman)$/.test(p.mesh));
function frame(p) {
  if (p.matrix) return { x: p.matrix[12], y: p.matrix[13], z: p.matrix[14],
    front: [-p.matrix[8], -p.matrix[10]], right: [p.matrix[0], p.matrix[2]] };
  return { x: p.x, y: p.y, z: p.z, front: [Math.sin(p.yaw || 0), -Math.cos(p.yaw || 0)], right: [Math.cos(p.yaw || 0), Math.sin(p.yaw || 0)] };
}
async function aim(target, camera, targetHeight = 1.05) {
  const distance = Math.hypot(target.x - camera.x, target.z - camera.z);
  const yaw = Math.atan2(target.x - camera.x, -(target.z - camera.z));
  const pitch = Math.atan2(target.y + targetHeight - (camera.y + 1.62), distance);
  await page.evaluate(({ yaw, pitch }) => window.__probe.lookAtWorld(yaw, pitch), { yaw, pitch });
  await sleep(220);
}
async function placeWorld(camera, source) {
  await page.evaluate(({ x, z, source, cell }) => {
    const p = window.__probe;
    if (source) p.sourceWarp(x / cell - .5, z / cell - .5);
    else p.warpRuntime(x / cell - .5, z / cell - .5);
    p.hush();
  }, { ...camera, source, cell: CELL });
  await sleep(220);
}
async function view(id, { front = 2.3, right = 0, height = 1.05, explicit = null } = {}) {
  const s = await until(s => !!body(s, id)); const target = frame(body(s, id));
  const camera = explicit ? { ...explicit, y: explicit.y ?? target.y } : {
    x: target.x + target.front[0] * front + target.right[0] * right,
    z: target.z + target.front[1] * front + target.right[1] * right, y: target.y };
  await placeWorld(camera, s.presentation.source); await aim(target, camera, height);
  return { target, camera };
}
async function torch(on) {
  if ((await state()).light !== on) await page.keyboard.press('f');
  await sleep(250); check((await state()).light === on, `ordinary F sets torch ${on ? 'on' : 'off'}`);
}
async function capture(name, id) {
  stage = name;
  const current = await state(); check(!!body(current, id), `${name}: existing authored body submitted`, id);
  check(current.characters?.poses.some(p => p.id === id), `${name}: production renderer prepared her rig`);
  check(!current.characters?.poseErrors?.length, `${name}: no character pose errors`, current.characters?.poseErrors);
  check(current.dither?.enabled === true, `${name}: shared pixel-mesh/dither pass is active`, current.dither);
  const file = join(out, `${name}.png`); await page.screenshot({ path: file });
  const pipeline = {};
  for (const renderStage of ['props', 'vfd']) {
    const encoded = await page.evaluate(stage => window.__probe.sourceShoreCapture(stage), renderStage);
    check(typeof encoded === 'string' && encoded.startsWith('data:image/png;base64,'), `${name}: actual ${renderStage} target is available`);
    const bytes = Buffer.from(encoded.split(',')[1], 'base64'), path = join(out, `${name}-${renderStage}.png`);
    await writeFile(path, bytes); pipeline[renderStage] = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  check(pipeline.props.sha256 !== pipeline.vfd.sha256, `${name}: the final actor passes through scene encoding`);
  check(errors.length === 0, `${name}: no JavaScript/WebGL/character errors`, errors);
  captures.push({ name, file, pipeline, state: current }); console.log('CAPTURE', file);
  return current;
}
async function pausedCapture(name, id) {
  if ((await state()).scene !== 'pause') await page.keyboard.press('Escape');
  await until(s => s.scene === 'pause'); await sleep(100);
  const before = await state(); await sleep(700); const after = await state();
  check(JSON.stringify(before.presentation.clock) === JSON.stringify(after.presentation.clock), `${name}: pause freezes saved performance state`);
  check(JSON.stringify(before.characters.poses) === JSON.stringify(after.characters.poses), `${name}: pause freezes actual character palettes`);
  await capture(name, id);
  await page.keyboard.press('Escape'); await until(s => s.scene !== 'pause');
}
async function road(pass) {
  stage = `road-pass-${pass + 1}`;
  const depth = SOURCE_PRE_TAPE.stillLength + (OUTSKIRT_STRETCH_START + pass * OUTSKIRT_STRETCH_METRES + 23.4) / CELL;
  await page.evaluate(async depth => { await window.__probe.preTapePreset(depth); window.__probe.hush(); }, depth);
  await until(s => s.presentation.source === true);
}
async function boot() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun && window.__probe.busWomanPresentation, { timeout: 90000 });
  // Wait until the asynchronous licence gate has actually appeared. The
  // existing testRun checkpoint can then bypass unavailable local material
  // calibration without a delayed EULA stealing ordinary game input.
  await page.waitForFunction(() => ['eula', 'lens-calibration', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  for (let n = 0; n < 180; n++) {
    const scene = await page.evaluate(() => window.__scenes?.top()?.id);
    if (scene === 'title' || scene === 'lens-calibration') { bootCheckpoint = scene; break; }
    if (scene === 'eula') await page.keyboard.press('Enter');
    await sleep(300);
  }
  assert.ok(bootCheckpoint, 'Settled title or real material-calibration checkpoint is available.');
  console.log('BOOT CHECKPOINT', bootCheckpoint);
  propsModuleUrl = [...requests].find(value => new URL(value).pathname === '/src/render/props3d.js');
  renderModuleUrl = [...requests].find(value => new URL(value).pathname === '/src/render/r3d.js');
  assert.ok(propsModuleUrl && renderModuleUrl, 'Observed the actual game module URLs.');
  await page.evaluate(async () => {
    await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.hush();
    window.__probe.setFlags(['van.closed', 'kit.fitted']); window.__probe.setReduceMotion(false);
    window.__probe.warpCell(54.15, 206.55, 0);
  });
  await until(s => ['exterior_bus_woman', 'outskirts_bus_woman', 'bus_woman_bag', 'bus_woman_ticket'].every(mesh => s.characters?.assets?.some(a => a.mesh === mesh)), 60000);
  check(assets.some(asset => asset.sha256 === expectedAssetHash), 'browser loaded the exact selected production GLB bytes', { expectedAssetHash, assets });
  await until(s => !!body(s, 'yard-bus-waiter'), 30000);
}
async function giveTicket() {
  stage = 'existing-ticket-choice';
  // Set only the inventory fixture; ordinary E and the existing choice must
  // perform the physical receipt. This is not evidence of finding the paper.
  await page.evaluate(() => window.__probe.setFlag('outskirts.ticket.found', true));
  await view('r0-bus-woman', { front: 1.45, right: .10, height: 1.10 });
  await page.keyboard.press('e');
  await until(s => String(s.scene).startsWith('thought:'), 10000);
  for (let n = 0; n < 15; n++) {
    const s = await state(), options = s.convo?.pending?.options || [];
    if (options.some(option => /Give her the return half/i.test(option))) {
      const index = options.findIndex(option => /Give her the return half/i.test(option)), at = s.convo.pending.index || 0;
      for (let k = 0; k < (index - at + options.length) % options.length; k++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter'); break;
    }
    await page.keyboard.press('Enter'); await sleep(160);
  }
  check((await state()).presentation.ticketReturned, 'ordinary E and the existing dialogue choice give her the return half');
  const receipt = (await state()).presentation.clock?.woman;
  check(receipt?.receiveId === 'r0-bus-woman' && receipt.receivedAt != null, 'the physical choice starts receipt at this existing woman', receipt);
  check(body(await state(), 'r0-bus-woman')?.character?.clip === 'bus_woman_receive', 'the authored choice samples the actual receive clip');
  if (String((await state()).scene).startsWith('thought:')) await page.keyboard.press('Escape');
  await until(s => !String(s.scene).startsWith('thought:'));
  for (const [target, name] of [[.95, '09-receive-grasp'], [1.9, '10-receive-carry'], [2.65, '11-receive-right-pocket']]) {
    await until(s => body(s, 'r0-bus-woman')?.character?.clip === 'bus_woman_receive' && body(s, 'r0-bus-woman').character.time >= target, 15000);
    await pausedCapture(name, 'r0-bus-woman');
  }
  await until(s => body(s, 'r0-bus-woman')?.character?.clip === 'bus_woman_ready' && body(s, 'r0-bus-woman').character.time >= 1, 20000);
  check((await state()).presentation.instances.some(p => p.id === 'r0-bus-woman:return-half'), 'the later ready gesture retrieves the existing right-pocket paper');
  await pausedCapture('12a-retrieve-ticket-ready', 'r0-bus-woman');
  await until(s => body(s, 'r0-bus-woman')?.character?.clip === 'bus_woman_ticket_wait', 30000);
  await capture('12b-returned-ticket-held-ready', 'r0-bus-woman');
}
async function run() {
  await boot();
  if (process.env.BUS_WOMAN_VERIFY_MODE === 'receipt') { await road(0); await torch(true); await giveTicket(); return; }
  if (process.env.BUS_WOMAN_VERIFY_MODE !== 'views') {
  const yard = await until(s => !!body(s, 'yard-bus-waiter'));
  check(yard.presentation.instances.filter(p => p.mesh === 'exterior_bus_woman').length === 1, 'the existing yard placement owns exactly one body');
  await view('yard-bus-waiter'); await torch(false); await capture('01-yard-front-ambient', 'yard-bus-waiter');
  await torch(true); await capture('02-yard-front-torch', 'yard-bus-waiter');
  await view('yard-bus-waiter', { front: .95, right: .15, height: 1.50 }); await capture('03-yard-face-close', 'yard-bus-waiter');
  await view('yard-bus-waiter', { front: .2, right: 2.0 }); await capture('04-yard-profile', 'yard-bus-waiter');
  await road(0); await view('r0-bus-woman'); await torch(true); await capture('06-outskirts-shelter-front', 'r0-bus-woman');
  await view('r0-bus-woman', { front: .1, right: 2.0 }); await capture('07-outskirts-shelter-profile', 'r0-bus-woman');
  await view('r0-bus-woman', { front: -.8, right: 1.9 }); await capture('05-outskirts-shelter-back', 'r0-bus-woman');
  await view('r0-bus-woman', { front: .95, right: .15, height: 1.50 }); await capture('05b-outskirts-face-close', 'r0-bus-woman');
  await view('r0-bus-woman', { front: 1.35, height: 1.17 }); await pausedCapture('08-outskirts-saved-search', 'r0-bus-woman');
  await giveTicket();
  } else await page.evaluate(() => window.__probe.setFlag('outskirts.ticket.returned', true));
  await road(1);
  const aboard = frame(body(await until(s => !!body(s, 'r1-bus-woman-aboard')), 'r1-bus-woman-aboard'));
  await view('r1-bus-woman-aboard', { explicit: { x: aboard.x, z: aboard.z - 1.45, y: aboard.y }, height: 1.05 });
  await torch(true); await capture('13-aboard-existing-pass-two', 'r1-bus-woman-aboard');
  await road(7);
  const close = frame(body(await until(s => !!body(s, 'r7-bus-woman')), 'r7-bus-woman'));
  await view('r7-bus-woman', { explicit: { x: close.x + 1.33, z: close.z + 1.0, y: close.y - .5 }, height: 1.22 });
  await capture('14-existing-bus-gap-acknowledgement', 'r7-bus-woman');
  await pausedCapture('15-bus-gap-saved-attention', 'r7-bus-woman');
  await view('r7-bus-woman', { explicit: { x: close.x + 1.33, z: close.z - 3, y: close.y - .5 }, height: 1.05 });
  await sleep(1000); await capture('16-existing-bus-gap-retained-step', 'r7-bus-woman');
  await page.evaluate(() => window.__probe.setReduceMotion(true));
  await capture('17-reduced-motion-same-existing-woman', 'r7-bus-woman');
  check(captures.every(capture => capture.state.characters.poseErrors.length === 0), 'all existing appearances sampled without pose errors');
}

await mkdir(out, { recursive: true });
try {
  profile = await mkdtemp('/private/tmp/chunk-surfer-bus-woman-');
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] });
  page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: .8 }); await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    const NativeSocket = window.WebSocket;
    class QuietSocket extends EventTarget { constructor() { super(); this.readyState = 1; queueMicrotask(() => this.dispatchEvent(new Event('open'))); } send() {} close() {} }
    window.WebSocket = class extends NativeSocket { constructor(url, protocols) { if (protocols === 'vite-hmr') return new QuietSocket(); super(url, protocols); } };
  });
  page.on('request', request => requests.add(request.url()));
  page.on('response', async response => {
    if (!new URL(response.url()).pathname.endsWith('/bus-woman-character.glb')) return;
    try { const bytes = await response.buffer(); assets.push({ url: response.url(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    catch (error) { diagnostics.push({ stage, assetResponse: String(error) }); }
  });
  page.on('pageerror', error => { errors.push({ stage, error: String(error) }); console.error('GAME PAGE ERROR', stage, String(error)); });
  page.on('console', message => {
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID|character pose unavailable|bus woman character pack unavailable/i.test(message.text())) errors.push({ stage, error: message.text() });
    if (message.type() === 'error') diagnostics.push({ stage, error: message.text() });
  });
  await run();
} catch (error) {
  fatal = String(error.stack || error); console.error(fatal);
  failureState = await state().catch(() => null);
  if (page && !page.isClosed()) await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close(); if (profile) await rm(profile, { recursive: true, force: true });
  if (!fatal) await rm(join(out, 'failure.png'), { force: true });
  await writeFile(join(out, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url, propsModuleUrl, renderModuleUrl,
    scope: 'Actual Chromium/Metal game renderer at localhost5330, existing yard/shelter/aboard/bus-gap placements, GLB skinning, props and shared VFD/dither targets, ordinary torch input and pause. The existing testRun diagnostic checkpoint bypasses unavailable local material calibration at ws://127.0.0.1:8000. Diagnostic warps shorten travel; the ticket inventory flag is a fixture, while the existing ordinary E/dialogue choice performs receipt. No alternate model renderer or additional live character placement.',
    bootCheckpoint,unverified: ['Native-window rendering', 'Local AI material-bank generation', 'Full uninterrupted journey pacing', 'Captured-recording playback'],
    verificationMode:process.env.BUS_WOMAN_VERIFY_MODE||'full',expectedAssetHash, assets, checks, captures, errors, diagnostics, fatal, failureState, cleanup: { browserClosed: true, disposableProfileRemoved: true } }, null, 2));
}
process.exit(fatal || errors.length || checks.some(check => !check.pass) ? 1 : 0);
