// Actual game render acceptance for the recordist character pair. Diagnostic
// placements shorten walks; E/W/R/Escape remain ordinary game input.
// RECORDIST_CHARACTERS_VERIFY_URL=http://127.0.0.1:5330/?nodisplaynotice=1\&skipwarn=1\&nomic=1\&sam=0\&nothink=1 node tools/chunk_surfer/verify-recordist-characters-live.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const url = process.env.RECORDIST_CHARACTERS_VERIFY_URL;
assert.ok(url, 'Set RECORDIST_CHARACTERS_VERIFY_URL to the integrated local preview.');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local verification only.');
const out = resolve('artifacts/recordist-characters/live');
const expectedAssetHash = createHash('sha256').update(await readFile(resolve('public/assets/recordist-characters.glb'))).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], captures = [], errors = [], diagnostics = [], requests = new Set();
const assets = [];
let browser, page, profile, fatal = null, stage = 'boot', propsModuleUrl;
function check(pass, name, detail) {
  checks.push({ pass: !!pass, name, detail });
  console.log(pass ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail) : '');
  assert.ok(pass, name);
}
async function state() {
  return page.evaluate(async moduleUrl => {
    const p = window.__probe, personal = p.towerPersonal();
    const renderer = moduleUrl ? await import(moduleUrl) : null;
    const stats = renderer?.characterStats();
    return { pos: p.pos(), look: p.lookAngles(), personal, scene: window.__scenes.top({ includeOverlay: true })?.id,
      light: !!p.rec().light, doors: p.doorFieldDoors(), source: p.chunkSurf(),
      props: (p.sourceProps() || []).map(({ id, mesh }) => ({ id, mesh })),
      characters: stats ? { ...stats, poses: stats.poses.filter(p => /^recordist_/.test(p.mesh)) } : null };
  }, propsModuleUrl);
}
async function until(predicate, timeout = 15000) {
  const stop = Date.now() + timeout;
  let current;
  while (Date.now() < stop) { current = await state(); if (predicate(current)) return current; await sleep(80); }
  throw new Error(`Timed out at ${stage}; scene=${current?.scene}, stage=${current?.personal?.frame?.stage}`);
}
async function aim(yaw, pitch = -.12) {
  await page.evaluate(({ yaw, pitch }) => window.__probe.lookAtWorld(yaw, pitch), { yaw, pitch });
  await sleep(120);
}
async function face(target, pitch = -.12) {
  const s = await state(); await aim(Math.atan2(target.x - s.pos.x, -(target.y - s.pos.y)), pitch);
}
async function hold(key, duration) {
  await page.keyboard.down(key);
  try { await sleep(duration); } finally { await page.keyboard.up(key); }
  await sleep(120);
}
async function torch(on) {
  if ((await state()).light !== on) await page.keyboard.press('f');
  await sleep(200); check((await state()).light === on, `torch ${on ? 'on' : 'off'} input`);
}
async function place(x, z) {
  const s = await state(), f = s.personal.frame;
  await page.evaluate(({ x, y }) => { window.__probe.sourceWarp(x, y); window.__probe.hush(); },
    { x: f.pose.x + (x - f.localPose.x) * 2, y: f.pose.y + (z - f.localPose.z) * 2 });
  await sleep(160);
  const placed = await state();
  check(Math.hypot(placed.personal.frame.localPose.x - x, placed.personal.frame.localPose.z - z) < .03,
    'supported diagnostic viewpoint', { requested: { x, z }, actual: placed.personal.frame.localPose });
  return placed;
}
async function capture(name, stages = true) {
  stage = name;
  const current = await state(), file = join(out, `${name}.png`);
  await page.screenshot({ path: file });
  const pipeline = {};
  if (stages) for (const renderStage of ['props', 'vfd']) {
    const encoded = await page.evaluate(s => window.__probe.sourceShoreCapture(s), renderStage);
    check(typeof encoded === 'string' && encoded.startsWith('data:image/png;base64,'), `${name}: actual ${renderStage} target available`);
    const path = join(out, `${name}-${renderStage}.png`);
    const bytes = Buffer.from(encoded.split(',')[1], 'base64'); await writeFile(path, bytes);
    pipeline[renderStage] = { path, bytes: bytes.length };
  }
  check(errors.length === 0, `${name}: no JavaScript/WebGL errors`, errors);
  check(!current.characters?.poseErrors?.length, `${name}: no character pose errors`, current.characters?.poseErrors);
  captures.push({ name, file, pipeline, state: current });
  console.log('CAPTURE', file);
  return current;
}
async function assertActors(expected) {
  const s = await until(s => s.characters?.poses?.length === expected.length);
  check(JSON.stringify(s.characters.poses.map(p => [p.mesh, p.clip]).sort()) === JSON.stringify(expected.sort()),
    'actual renderer prepared the expected physical actors', s.characters.poses);
  return s;
}
async function pauseCheck(label) {
  await page.keyboard.press('Escape'); await until(s => s.scene === 'pause'); await sleep(100);
  const before = await state(); await sleep(1100); const after = await state();
  check(JSON.stringify(before.characters.poses) === JSON.stringify(after.characters.poses), `${label}: pause freezes actual prepared character poses`);
  check(before.personal.saved.time === after.personal.saved.time, `${label}: pause freezes saved scene clock`);
  await page.keyboard.press('Escape'); await until(s => s.scene !== 'pause');
}
async function passDoor(id, destination) {
  const before = await state(), door = before.personal.frame.doors.find(d => d.id === id);
  assert.ok(door, `${id} exists`);
  await place(door.center.x - door.normal.x * .8, door.center.z - door.normal.z * .8);
  await aim(Math.atan2(door.normal.x, -door.normal.z), -.02); await hold('w', 1050);
  const after = await until(s => s.personal.frame.stage === destination);
  check(after.personal.frame.transition.serial > before.personal.frame.transition.serial,
    `ordinary W crossed ${id} to ${destination}`);
  return after;
}
async function boot() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun, { timeout: 90000 });
  for (let n = 0; n < 180; n++) {
    const scene = await page.evaluate(() => window.__scenes?.top()?.id);
    if (scene === 'title') break;
    if (scene === 'eula') await page.keyboard.press('Enter');
    await sleep(300);
  }
  await page.waitForFunction(() => window.__scenes?.top()?.id === 'title', { timeout: 12000 });
  // Use the URL the game actually loaded. Importing an unversioned diagnostic
  // fallback can create a second, empty props3d module during Vite development.
  propsModuleUrl = [...requests].find(value => new URL(value).pathname === '/src/render/props3d.js');
  assert.ok(propsModuleUrl, 'Observed live renderer module URL; this harness targets the development preview.');
  await page.evaluate(async () => { await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.bellsPreset(440); window.__probe.hush(); });
  await until(s => s.source?.phase === 'bells');
  await until(s => ['recordist_boy', 'recordist_contractor'].every(mesh => s.characters?.assets?.some(a => a.mesh === mesh)), 60000);
  check(assets.some(a => a.sha256 === expectedAssetHash), 'browser loaded the exact current production GLB bytes', assets);
  await page.evaluate(() => window.__probe.setReduceMotion(false));
  check(true, 'both production GLB characters loaded in the game renderer');
  const invitation = (await state()).doors.find(d => d.personal);
  assert.ok(invitation, 'Personal-world invitation exists');
  await page.evaluate(d => {
    const [a, b] = d.threshold, n = d.normal;
    window.__probe.sourceWarp((a.x + b.x) / 2 + n[0] * 3, (a.y + b.y) / 2 + n[2] * 3);
    window.__probe.hush();
  }, invitation);
  await aim(Math.atan2(-invitation.normal[0], invitation.normal[2]));
  for (let n = 0; n < 5; n++) {
    await page.keyboard.press('e'); await sleep(300);
    if ((await state()).doors.find(d => d.id === invitation.id)?.opened) break;
    await page.evaluate(() => window.__probe.hush());
  }
  check((await state()).doors.find(d => d.id === invitation.id)?.opened, 'ordinary E opened the invitation');
  await hold('w', 650); await until(s => s.personal.frame.active && s.personal.frame.stage === 'school-hall');
  check(true, 'ordinary W entered the school hall');
}
async function run() {
  await boot(); await assertActors([['recordist_boy', 'boy_wait']]);
  const boy = (await state()).personal.frame.targets.boy;
  await torch(false); await place(-.9, -1.0); await face(boy, -.18); await capture('01-boy-front-ambient');
  await torch(true); await capture('02-boy-front-torch');
  await place(-.9, .15); await face(boy, -.26); await capture('02b-boy-face-close-torch');
  await place(-3, 1.8); await face(boy, -.20); await capture('03-boy-profile');
  await place(-.9, 4.5); await face(boy, -.20); await capture('04-boy-back');
  await pauseCheck('boy wait');
  await place(0, 17); await aim(0, 0);
  await page.evaluate(() => {
    const sample = window.__characterWalkSample = {};
    const down = e => { if (e.code === 'KeyW' && !e.repeat && !sample.down) sample.down = { time: e.timeStamp, pos: window.__probe.pos() }; };
    const up = e => { if (e.code === 'KeyW') { sample.up = { time: e.timeStamp, pos: window.__probe.pos() }; window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); } };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
  });
  await hold('w', 1200);
  const walk = await page.evaluate(() => window.__characterWalkSample);
  const seconds = (walk.up.time - walk.down.time) / 1000;
  const moved = Math.hypot(walk.up.pos.x - walk.down.pos.x, walk.up.pos.y - walk.down.pos.y) * .5;
  check(seconds >= 1 && moved / seconds > 1.05 && moved / seconds < 1.7,
    'ordinary W remains freely walkable during boy performance', { metres: moved, seconds, metresPerSecond: moved / seconds });
  await passDoor('onward', 'tape-field');
  await passDoor('onward', 'dead-broadcast');
  await passDoor('onward', 'ash-room');
  await assertActors([['recordist_contractor', 'contractor_work']]);
  const contractor = (await state()).personal.frame.targets.recordist;
  await place(6.2, -48.5); await face(contractor, -.16); await torch(false); await capture('05-contractor-work-ambient');
  await torch(true); await capture('06-contractor-work-torch');
  await place(5, -53.6); await face(contractor, -.34); await capture('06b-contractor-work-hands-close');
  await place(2.4, -52); await face(contractor, -.16); await capture('07-contractor-profile');
  await place(5, -49); await face(contractor, -.16); await capture('08-contractor-back');
  await pauseCheck('contractor work');
  await place(6.2, -48.5); await face(contractor, -.12); await page.keyboard.press('r');
  await until(s => s.personal.saved.recordingHeard && s.personal.take, 25000);
  check(true, 'ordinary R earned the recording before return');
  if ((await state()).personal.held) await page.keyboard.press('r');
  await passDoor('onward', 'return-hall');
  await assertActors([['recordist_boy', 'boy_transfer'], ['recordist_contractor', 'contractor_transfer']]);
  await place(-.9, -2.2); await face((await state()).personal.frame.targets.boy, -.25);
  await capture('09-transfer-000');
  // Pause on the actual shared handover clock. Milestones are observed quarter
  // thresholds (within one browser polling interval), not fabricated fixtures.
  await page.keyboard.down('w');
  try { await until(s => s.personal.frame.handover > 0, 8000); } finally { await page.keyboard.up('w'); }
  for (const target of [.25, .5, .75, 1]) {
    await page.waitForFunction(p => window.__probe.towerPersonal().frame.handover >= p, { polling: 'raf', timeout: 10000 }, target);
    await page.keyboard.press('Escape'); await until(s => s.scene === 'pause');
    const current = await state(), p = current.personal.frame.handover;
    check(p >= target && p - target < .14, `transfer quarter ${target}: captured actual shared clock`, { target, actual: p });
    check(current.characters.poses.length === 2 && current.characters.poses.every(a => Math.abs(a.time - p * 4) < .02),
      `transfer quarter ${target}: both prepared clips follow saved time`, current.characters.poses);
    check(current.props.filter(a => a.id === 'land-handover-machine').length === 1, `transfer quarter ${target}: exactly one recorder`);
    await capture(`transfer-${String(Math.round(target * 100)).padStart(3, '0')}`);
    if (target === .5) {
      const quarterView = current.personal.frame.localPose;
      await place(-.5, .05); await face(current.personal.frame.targets.boy, -.48); await capture('transfer-050-hands-front-close');
      await place(.75, 1.1); await face(current.personal.frame.targets.boy, -.48); await capture('transfer-050-hands-side-close');
      await place(quarterView.x, quarterView.z); await face(current.personal.frame.targets.boy, -.25);
    }
    const still = await state(); await sleep(500);
    check(JSON.stringify((await state()).characters.poses) === JSON.stringify(still.characters.poses), `transfer quarter ${target}: pause preserves both poses`);
    if (target < 1) { await page.keyboard.press('Escape'); await until(s => s.scene !== 'pause'); }
  }
}
await mkdir(out, { recursive: true });
try {
  profile = await mkdtemp('/private/tmp/chunk-surfer-recordist-characters-');
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
  page.on('request', r => requests.add(r.url()));
  page.on('response', async response => {
    if (!new URL(response.url()).pathname.endsWith('/recordist-characters.glb')) return;
    try { const bytes = await response.buffer(); assets.push({ url: response.url(), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') }); }
    catch (error) { diagnostics.push({ stage, assetResponse: String(error) }); }
  });
  page.on('pageerror', e => errors.push({ stage, error: String(e) }));
  page.on('console', message => {
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(message.text())) errors.push({ stage, error: message.text() });
    if (message.type() === 'error') diagnostics.push({ stage, error: message.text() });
  });
  await run();
} catch (error) {
  fatal = String(error.stack || error); console.error(fatal);
  if (page && !page.isClosed()) await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
} finally {
  if (browser) await browser.close(); if (profile) await rm(profile, { recursive: true, force: true });
  if (!fatal) await rm(join(out, 'failure.png'), { force: true });
  await writeFile(join(out, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url, propsModuleUrl,
    scope: 'Actual Chromium/Metal game renderer, GLB skinning, material target, shared pixel-mesh target, torch and physical walking. Diagnostic placements shorten travel; ordinary E/W/R/Escape input enters, crosses thresholds, hears the recording and pauses actual transfer milestones. No standalone model renderer or substituted shader.',
    unverified: ['Native-window rendering', 'Full uninterrupted journey pacing', 'Human headphone listening'],
    assets, checks, captures, errors, diagnostics, fatal, cleanup: { browserClosed: true, disposableProfileRemoved: true } }, null, 2));
}
process.exit(fatal || errors.length || checks.some(c => !c.pass) ? 1 : 0);
