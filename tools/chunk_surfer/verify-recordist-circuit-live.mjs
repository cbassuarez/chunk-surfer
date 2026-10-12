// Functional/visual verification of the actual game, using disposable Chrome.
// Diagnostic placements shorten travel; ordinary E/W/R/ESC input crosses every
// portal, listens, pauses and leaves. This does not measure 12–18-minute pacing.
// RECORDIST_VERIFY_URL=http://127.0.0.1:5298/?nodisplaynotice=1\&skipwarn=1\&nomic=1\&sam=0\&nothink=1 node tools/chunk_surfer/verify-recordist-circuit-live.mjs
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const url = process.env.RECORDIST_VERIFY_URL;
assert.ok(url, 'Set RECORDIST_VERIFY_URL explicitly to the integrated game preview.');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Verification is local only.');
const out = resolve('artifacts/recordist-circuit-implementation/live');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [], captures = [], diagnostics = [], errors = [], placements = [], builds = [];
let browser, page, profile, fatal = null, stage = 'boot', mode = 'normal';

function check(pass, name, detail = null) {
  checks.push({ pass: !!pass, mode, name, detail });
  console.log(pass ? 'PASS' : 'FAIL', mode, name, detail ? JSON.stringify(detail) : '');
  assert.ok(pass, name);
}

async function state() {
  return page.evaluate(() => {
    const p = window.__probe, personal = p?.towerPersonal?.(), hud = document.getElementById('tower-personal-quiet');
    const stored = JSON.parse(localStorage.getItem('chunk-surfer:save:v4') || 'null');
    return { pos: p?.pos?.(), look: p?.lookAngles?.(), source: p?.chunkSurf?.(), personal,
      storedPersonal: stored?.chunkSurf?.station?.personal || null,
      scene: window.__scenes?.top({ includeOverlay: true })?.id || null,
      visibility: document.visibilityState, settings: p?.settings?.(), doors: p?.doorFieldDoors?.(),
      props: (p?.sourceProps?.() || []).map(({ id, mesh }) => ({ id, mesh })),
      hud: hud ? { hidden: hud.hidden, text: hud.innerText,
        machineHidden: hud.querySelector('.personal-quiet-machine')?.hidden,
        recorder: hud.querySelector('.personal-quiet-recorder')?.textContent,
        state: hud.querySelector('.personal-quiet-state')?.textContent,
        levels: [...hud.querySelectorAll('[data-channel]')].map((node) => ({ channel: node.dataset.channel, width: node.style.width })) } : null };
  });
}

async function until(predicate, timeout = 12000) {
  const stop = Date.now() + timeout;
  let s;
  while (Date.now() < stop) { s = await state(); if (predicate(s)) return s; await sleep(120); }
  return s || state();
}

async function aim(yaw, pitch = 0) {
  await page.evaluate(({ yaw, pitch }) => window.__probe.lookAtWorld(yaw, pitch), { yaw, pitch });
  await sleep(160);
}

async function face(target, pitch = 0) {
  const s = await state(); await aim(Math.atan2(target.x - s.pos.x, -(target.y - s.pos.y)), pitch);
}

async function hold(key, milliseconds) {
  await page.keyboard.down(key);
  try { await sleep(milliseconds); } finally { await page.keyboard.up(key); }
  await sleep(180);
}

async function dismissNarration() { await page.evaluate(() => window.__probe.hush()); await sleep(100); }

async function torch(on = true) {
  const light = await page.evaluate(() => !!window.__probe.rec().light);
  if (light !== on) await page.keyboard.press('f');
  await sleep(180);
}

function worldAt(frame, x, z) {
  return { x: frame.pose.x + (x - frame.localPose.x) * 2, y: frame.pose.y + (z - frame.localPose.z) * 2 };
}

async function placeLocal(x, z, label) {
  const before = await state(), target = worldAt(before.personal.frame, x, z);
  await page.evaluate(({ x, y }) => { window.__probe.sourceWarp(x, y); window.__probe.hush(); }, target);
  await sleep(220);
  const after = await state();
  check(Math.hypot(after.personal.frame.localPose.x - x, after.personal.frame.localPose.z - z) < .02,
    `${label}: diagnostic supported local placement`, { target: { x, z }, actual: after.personal.frame.localPose });
  placements.push({ mode, label, kind: 'diagnostic sourceWarp; no portal crossing substituted',
    stage: after.personal.frame.stage, target: { x, z }, actual: after.personal.frame.localPose });
  return after;
}

async function capture(name, { allowErrors = false } = {}) {
  stage = `${mode}:${name}`;
  const s = await state(), path = join(out, `${mode}-${name}.png`);
  if (!allowErrors) check(errors.length === 0, `${name}: no game JavaScript/shader error before capture`, errors);
  await page.screenshot({ path });
  captures.push({ mode, name, path, surface: 'actual game viewport including pixel mesh/post and Quiet Threshold HUD', state: s });
  console.log('CAPTURE', path);
  return s;
}

async function passDoor(id, expectedStage, label, { inspect = false } = {}) {
  stage = `${mode}:pass-${label}`;
  let before = await state();
  const door = before.personal.frame.doors.find((door) => door.id === id);
  check(!!door, `${label}: authored door exists`, id);
  await placeLocal(door.center.x - door.normal.x * .8, door.center.z - door.normal.z * .8, `${label} approach`);
  await aim(Math.atan2(door.normal.x, -door.normal.z), -.02); await dismissNarration();
  before = await state();
  if (inspect) {
    await page.keyboard.press('e'); await sleep(400);
    const inspected = await state();
    check(inspected.personal.frame.stage === before.personal.frame.stage
      && Math.hypot(inspected.pos.x - before.pos.x, inspected.pos.y - before.pos.y) < .02,
    `${label}: E inspection cannot teleport`, { before: before.pos, after: inspected.pos });
    await dismissNarration();
  }
  await hold('w', 1050);
  const after = await until((s) => s.personal?.frame?.stage === expectedStage
    && s.personal?.frame?.transition?.serial > before.personal.frame.transition.serial);
  check(after.personal.frame.stage === expectedStage
    && after.personal.frame.transition.serial > before.personal.frame.transition.serial,
  `${label}: actual W crosses the physical threshold`, { before: before.personal.frame.stage,
    after: after.personal.frame.stage, transition: after.personal.frame.transition });
  check(after.personal.frame.active, `${label}: commitment remains active`);
  return after;
}

async function reloadAndContinue(label) {
  stage = `${mode}:reload-${label}`;
  const before = await state();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.towerPersonal, { polling: 100, timeout: 240000 });
  // The probe exists while material calibration is still pending. Its restored
  // save is not evidence that the live world has resumed. Wait for the actual
  // title, then exercise Continue exactly once.
  await page.waitForFunction(() => window.__scenes?.top({ includeOverlay: true })?.id === 'title',
    { polling: 100, timeout: 240000 });
  await page.evaluate(() => window.__chunkSurferDesktopMenu.dispatch('continue'));
  const after = await until((s) => s.source?.phase === 'bells'
    && !s.scene, 120000);
  check(!after.scene && after.source?.phase === 'bells', `${label}: Continue reaches the live world`, { scene: after.scene });
  check(after.personal?.frame?.active === before.personal?.frame?.active
    && after.personal?.frame?.stage === before.personal?.frame?.stage,
  `${label}: actual reload + Continue restores the circuit stage`, { before: before.personal?.saved, after: after.personal?.saved });
  if (before.personal.frame.active) {
    check(Math.hypot(after.personal.frame.localPose.x - before.personal.frame.localPose.x,
      after.personal.frame.localPose.z - before.personal.frame.localPose.z) < .08,
    `${label}: local body pose survives reload`, { before: before.personal.frame.localPose, after: after.personal.frame.localPose });
    check(after.personal.frame.transition.serial === before.personal.frame.transition.serial,
      `${label}: reload cannot replay a transition receipt`);
  }
  check(!after.personal.held, `${label}: reload cannot automatically raise or play the recorder`);
  await torch(true); await dismissNarration(); return after;
}

async function boot() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun
    && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { polling: 100, timeout: 240000 });
  for (let n = 0; n < 500; n++) {
    let id;
    try { id = await page.evaluate(() => window.__scenes?.top()?.id); }
    catch (error) {
      if (!/Execution context was destroyed|Cannot find context/i.test(String(error))) throw error;
      await sleep(500); continue;
    }
    if (id === 'title') break;
    if (n % 25 === 0) console.log('BOOT', id);
    if (id === 'eula') { await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__scenes?.top()?.id !== 'eula', { polling: 100, timeout: 30000 }); }
    await sleep(500);
  }
  check(await page.evaluate(() => window.__scenes?.top()?.id === 'title'), 'normal startup reaches the title');
  // Development integration may complete one known HMR write during initial
  // boot. Re-establish only this openly diagnostic preset; later reload tests
  // never reapply it or reset progress.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForFunction(() => window.__probe?.testRun && window.__probe?.bellsPreset, { polling: 100, timeout: 240000 });
    try {
      await page.evaluate(async () => { await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.bellsPreset(440); window.__probe.hush(); });
      await sleep(1200);
      if (await page.evaluate(() => !!window.__probe?.setReduceMotion && window.__probe.chunkSurf()?.phase === 'bells')) break;
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context/i.test(String(error))) throw error;
      await sleep(500);
    }
  }
  await page.waitForFunction(() => window.__probe?.setReduceMotion && window.__probe.chunkSurf()?.phase === 'bells', { polling: 100, timeout: 60000 });
  await page.evaluate(() => window.__probe.setReduceMotion(false)); await torch(true);
  builds.push(await page.evaluate(() => ({ url: location.href,
    scripts: [...document.scripts].map((s) => s.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').filter((e) => /\.(?:m?js)(?:\?|$)/.test(e.name)).map((e) => e.name) })));
  if (process.env.RECORDIST_VERIFY_BUNDLE) check(builds[0].scripts.some((src) => src.endsWith(`/assets/${process.env.RECORDIST_VERIFY_BUNDLE}`)),
    'the intended production bundle is loaded', builds[0]);
}

async function normalCircuit() {
  mode = 'normal'; await boot();
  const initial = await state(), invitation = initial.doors.find((door) => door.personal);
  check(!!invitation && !invitation.shut && !invitation.barred, 'optional invitation is physically available', invitation);
  await page.evaluate((door) => {
    const [a, b] = door.threshold, n = door.normal;
    window.__probe.sourceWarp((a.x + b.x) / 2 + n[0] * 3, (a.y + b.y) / 2 + n[2] * 3);
    window.__probe.hush();
  }, invitation);
  placements.push({ mode, label: 'initial service-field approach', kind: 'diagnostic sourceWarp', doorId: invitation.id });
  await aim(Math.atan2(-invitation.normal[0], invitation.normal[2]), -.12);
  for (let n = 0; n < 5; n++) {
    await page.keyboard.press('e'); await sleep(300);
    if ((await state()).doors.find((door) => door.id === invitation.id)?.opened) break;
    await dismissNarration();
  }
  check((await state()).doors.find((door) => door.id === invitation.id)?.opened, 'ordinary E opens the invitation');
  await hold('w', 650);
  const entered = await until((s) => s.personal?.frame?.active);
  check(entered.personal.frame.active && entered.personal.frame.stage === 'school-hall', 'ordinary W commits entry into the school hall');
  const returnPose = { ...entered.personal.frame.returnPose };
  await face(entered.personal.frame.targets.boy, -.08); await capture('01-first-hall');
  await placeLocal(0, 5.6, 'first hall chair and hands viewpoint');
  await face(entered.personal.frame.targets.boy, -.12); await capture('01-chair-and-loose-lead');
  await placeLocal(0, 17, 'open aisle locomotion sample'); await aim(0, 0);
  await page.evaluate(() => {
    const sample = window.__recordistPaceSample = {};
    const down = event => { if (event.code === 'KeyW' && !event.repeat && !sample.down) sample.down = { time: event.timeStamp, pos: window.__probe.pos() }; };
    const up = event => { if (event.code === 'KeyW') { sample.up = { time: event.timeStamp, pos: window.__probe.pos() }; window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); } };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
  });
  await hold('w', 4000);
  const pace = await page.evaluate(() => window.__recordistPaceSample);
  const heldSeconds = (pace.up.time - pace.down.time) / 1000;
  const paceMetres = Math.hypot(pace.up.pos.x - pace.down.pos.x, pace.up.pos.y - pace.down.pos.y) * .5;
  const metresPerSecond = paceMetres / heldSeconds;
  check(heldSeconds >= 3.9 && metresPerSecond > 1.05 && metresPerSecond < 1.7, 'held W has the authored pace measured between actual browser key events',
    { requestedMilliseconds: 4000, heldSeconds, movedMetres: paceMetres, metresPerSecond, targetMetresPerSecond: 1.35,
      note: 'Actual browser event timestamps avoid CDP acknowledgement latency. Discrete steps include a responsive first step. This is not independent full-circuit pacing acceptance.' });
  await passDoor('entrance', 'school-hall', 'first entrance loop', { inspect: true });
  check((await state()).personal.frame.transition.kind === 'loop', 'original entrance loops within the hall rather than restoring the road');
  await passDoor('onward', 'tape-field', 'hall to tape', { inspect: true });
  await placeLocal(-23, -49, 'tape reel viewpoint');
  let s = await state(); await face(worldAt(s.personal.frame, -29, -54), .02); await capture('02-tape-field');
  await passDoor('back', 'school-hall', 'tape reverse');
  await passDoor('onward', 'tape-field', 'hall to tape revisited');
  const transitionReload = await reloadAndContinue('tape transition');
  check(transitionReload.personal.frame.visited['tape-field'], 'world receipt remains durable after backtracking and reload');
  await passDoor('onward', 'dead-broadcast', 'tape to broadcast');
  await placeLocal(-14, -132, 'broadcast mast viewpoint');
  s = await state(); await face(worldAt(s.personal.frame, -20, -145), .14); await capture('03-dead-broadcast');
  await passDoor('onward', 'ash-room', 'broadcast to ash');
  await passDoor('onward', 'ash-room', 'ash unreceived local loop');
  check(!(await state()).personal.frame.recordingHeard, 'walking through every world cannot grant the recording');
  await placeLocal(6.2, -48.5, 'recordist ordinary listening distance');
  s = await state(); await face(s.personal.frame.targets.recordist, -.12); await capture('04-ash-room');
  check(s.personal.frame.canListen, 'visible working recordist offers the listening action');
  const stationary = await state(); await page.keyboard.press('e'); await sleep(350);
  check(Math.hypot((await state()).pos.x - stationary.pos.x, (await state()).pos.y - stationary.pos.y) < .02,
    'recordist E inspection cannot teleport or start a handover'); await dismissNarration();
  await page.keyboard.press('r'); await sleep(2200);
  s = await capture('05-partial-monitor');
  check(s.personal.held && !s.hud.machineHidden && s.personal.frame.listenedSeconds > .5
    && s.personal.frame.listenedSeconds < 8, 'one R press raises the live Quiet Threshold strip and earns partial audible evidence', s.personal.monitor);
  check(!/\b(?:\d+\s*\/\s*9|seconds remaining|objective|world \d)\b/i.test(s.hud.text), 'Quiet Threshold exposes no progress/checklist/countdown');
  await page.keyboard.press('r'); await sleep(350);
  const lowered = await state();
  check(!lowered.personal.held && lowered.hud.machineHidden, 'second R press lowers the instrument without a modal');
  const heardPartial = lowered.personal.frame.listenedSeconds, pcmPartial = lowered.personal.frame.recordingOffset;
  s = await reloadAndContinue('partial listening');
  check(Math.abs(s.personal.frame.listenedSeconds - heardPartial) < .15
    && Math.abs(s.personal.frame.recordingOffset - pcmPartial) < .15,
  'partial evidence and exact PCM offset survive reload', { heardPartial, pcmPartial, actual: s.personal.frame });
  await page.keyboard.press('r'); await sleep(550); await capture('06-listening-resumed');
  await page.keyboard.press('Escape'); await sleep(400);
  const paused = await state(); await sleep(1200); const stillPaused = await state();
  check(!stillPaused.personal.held && Math.abs(stillPaused.personal.frame.listenedSeconds - paused.personal.frame.listenedSeconds) < .001
    && Math.abs(stillPaused.personal.frame.recordingOffset - paused.personal.frame.recordingOffset) < .001,
  'actual pause lowers the recorder and freezes evidence/PCM offset', { paused: paused.personal.frame, after: stillPaused.personal.frame });
  await page.keyboard.press('Escape'); await sleep(400); await dismissNarration();
  check(!(await state()).personal.held, 'unpausing cannot resume audio without R');
  await page.keyboard.press('r');
  const heard = await until((s) => s.personal?.saved?.recordingHeard && s.personal?.take, 20000);
  check(heard.personal.saved.recordingHeard && heard.personal.take, 'audible listening archives the same authored recording durably');
  await capture('07-recording-kept'); await page.keyboard.press('r'); await sleep(300);
  await passDoor('onward', 'return-hall', 'ash to changed hall');
  const changed = await capture('08-changed-hall');
  check(changed.personal.frame.handover === 0 && !changed.personal.frame.exitAvailable,
    'changed hall has no unseen handover timer');
  const reducedFixture = JSON.parse(JSON.stringify(changed.personal.saved));
  reducedFixture.pose = { x: 0, z: 6.6, yaw: 0, pitch: -.08 };
  reducedFixture.handoverSeconds = 0; reducedFixture.collapseSeconds = 0;
  reducedFixture.active = true; reducedFixture.completed = false; reducedFixture.rewardEarned = false; reducedFixture.rewardConsumed = false;
  await placeLocal(0, 6.6, 'handover clear aisle approach');
  s = await state(); await face(s.personal.frame.targets.boy, -.12);
  await hold('w', 1800); await capture('09-handover-start');
  await until((s) => s.personal?.frame?.handover >= 1, 10000); await capture('10-handover-finished');
  await until((s) => s.personal?.frame?.collapse >= 1, 12000); s = await capture('11-cleared-safe-floor');
  check(s.personal.frame.exitAvailable && s.personal.frame.collapse === 1, 'complete collapse retains a supported, permanently available exit');
  // A physical walk on the now clear central aisle also catches vanished chairs
  // which remain collidable after the renderer has removed them.
  await placeLocal(0, 10, 'cleared aisle collision check'); await aim(0, 0);
  const beforeWalk = await state(); await hold('w', 600); const afterWalk = await state();
  check(Math.hypot(afterWalk.pos.x - beforeWalk.pos.x, afterWalk.pos.y - beforeWalk.pos.y) > .6,
    'ordinary W still walks the cleared floor after collapse');
  await placeLocal(0, 18.7, 'surviving road exit approach'); await aim(Math.PI, -.02); await capture('12-surviving-exit');
  await page.evaluate(() => {
    window.__recordistVerifyExit = null;
    const sample = () => {
      const p = window.__probe, personal = p.towerPersonal();
      if (personal.frame.active) { requestAnimationFrame(sample); return; }
      window.__recordistVerifyExit = { pos: p.pos(), look: p.lookAngles(), transition: personal.frame.transition };
    };
    requestAnimationFrame(sample);
  });
  await hold('w', 1050);
  const road = await until((s) => !s.personal?.frame?.active && s.personal?.saved?.completed);
  check(!road.personal.frame.active && road.personal.saved.completed && road.personal.saved.rewardEarned,
    'final ordinary W exits with exactly-once durable completion');
  const exitSample = await page.evaluate(() => window.__recordistVerifyExit);
  const yawError = Math.abs(Math.atan2(Math.sin(exitSample.look.yaw - returnPose.yaw), Math.cos(exitSample.look.yaw - returnPose.yaw)));
  check(Math.hypot(exitSample.pos.x - returnPose.x, exitSample.pos.y - returnPose.y) < .06
    && yawError < .003 && Math.abs(exitSample.look.pitch - returnPose.pitch) < .003,
  'final physical exit restores exact original road position and gaze', { expected: returnPose, firstExitFrame: exitSample,
    note: 'Continued held W may subsequently walk on the road; the first rendered exit frame measures restoration.' });
  await capture('13-road-return'); await reloadAndContinue('completed circuit');
  return reducedFixture;
}

async function reducedCollapse(fixture) {
  mode = 'reduced'; stage = 'reduced:diagnostic-save-fixture';
  const fixtureSave = await page.evaluate((personal) => {
    window.__probe.setReduceMotion(true);
    const key = 'chunk-surfer:save:v4', save = JSON.parse(localStorage.getItem(key));
    save.chunkSurf.station.personal = personal;
    return save;
  }, fixture);
  // The outgoing live game saves again during pagehide. Install this diagnostic
  // fixture in the next document before game startup, after that final save.
  const fixtureScript = await page.evaluateOnNewDocument((save) => {
    localStorage.setItem('chunk-surfer:save:v4', JSON.stringify(save));
  }, fixtureSave);
  placements.push({ mode, label: 'reduced-motion changed hall',
    kind: 'explicit diagnostic saved-state fixture copied from the normal circuit; no claim of a second earned traversal' });
  // Load the fixture with the actual title/Continue path; avoid comparing it to
  // the outgoing completed state as reloadAndContinue normally does.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.towerPersonal, { polling: 100, timeout: 240000 });
  await page.removeScriptToEvaluateOnNewDocument(fixtureScript.identifier);
  await page.waitForFunction(() => window.__scenes?.top({ includeOverlay: true })?.id === 'title',
    { polling: 100, timeout: 240000 });
  await page.evaluate(() => window.__chunkSurferDesktopMenu.dispatch('continue'));
  let s = await until((s) => s.personal?.frame?.active && s.personal?.frame?.stage === 'return-hall' && !s.scene, 120000);
  check(s.personal.frame.active && s.settings.shake !== 'full', 'actual reduced-motion setting applies to the diagnostic changed hall');
  await torch(true); await dismissNarration(); await placeLocal(0, 6.6, 'reduced handover approach');
  s = await state(); await face(s.personal.frame.targets.boy, -.12); await hold('w', 1800);
  await capture('01-handover'); await until((s) => s.personal?.frame?.collapse >= 1, 15000);
  s = await capture('02-cleared-floor-and-exit');
  check(s.personal.frame.collapse === 1 && s.personal.frame.exitAvailable,
    'reduced motion reaches the same safe collapse and permanent exit');
}

await mkdir(out, { recursive: true });
try {
  profile = await mkdtemp('/private/tmp/chunk-surfer-recordist-');
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: .575 }); await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  page.on('pageerror', (e) => { errors.push({ stage, error: String(e) }); console.error('PAGEERROR', String(e)); });
  page.on('console', (message) => {
    if (/\[vite\]|page reload/i.test(message.text())) { diagnostics.push({ stage, info: message.text() }); console.log('DEV', message.text()); }
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(message.text())) errors.push({ stage, error: message.text() });
    if (message.type() === 'error' && diagnostics.length < 30) diagnostics.push({ stage, error: message.text() });
  });
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) console.log('NAVIGATION', stage, frame.url()); });
  page.on('requestfailed', (request) => { if (diagnostics.length < 30) diagnostics.push({ stage, request: request.url(), error: request.failure()?.errorText }); });
  const fixture = await normalCircuit(); await reducedCollapse(fixture);
} catch (error) {
  fatal = String(error.stack || error); console.error(fatal);
  if (page && !page.isClosed()) await capture('failure', { allowErrors: true }).catch(() => {});
} finally {
  if (browser) await browser.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  await writeFile(join(out, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url, builds,
    scope: 'Actual Chromium/Metal game viewport and Quiet Threshold HUD. Disposable diagnostic checkpoint/placements shorten travel; actual E/W/R/ESC input crosses all forward thresholds, reverse threshold, entrance/ash loops, partial listening, pause, reload/Continue and final exit. A copied changed-hall save separately checks reduced motion. No substituted renderer, shader or user profile; no full earned campaign or 12–18-minute pacing claim.',
    openAcceptance: ['Independent 12–18-minute uninterrupted human pacing observations', 'Headphone perceptual listening',
      'Controller and remapped-binding playthrough', 'Native-window behavior'],
    checks, captures, placements, diagnostics, errors, fatal, cleanup: { browserClosed: true, disposableProfileRemoved: true } }, null, 2));
}
process.exit(fatal || errors.length || checks.some((item) => !item.pass) ? 1 : 0);
