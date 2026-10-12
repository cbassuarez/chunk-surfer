// Production-browser integration from a disposable chapel checkpoint. Fixtures
// place the station body; held keys and accelerated production step dispatch
// traverse the real realm ground. No relic or home eligibility flags are injected.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const out = 'artifacts/source-station/live';
await mkdir(out, { recursive: true });
const profile = await mkdtemp('/private/tmp/chunk-surfer-station-live-');
let browser;
try {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
      '--disk-cache-size=1', '--media-cache-size=1', '--disable-gpu-shader-disk-cache'] });
} catch (error) { await rm(profile, { recursive: true, force: true }); throw error; }
const page = await browser.newPage(), errors = [], diagnostics = [], checks = [], snapshots = {};
let failure = null, gameplayPassed = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
page.on('pageerror', (error) => { errors.push(String(error)); console.log('PAGEERROR', String(error)); });
page.on('console', (message) => {
  if (/shader.*error|GLSL.*error|ERROR: 0:/i.test(message.text())) errors.push(message.text());
  if (message.type() === 'error' && diagnostics.length < 30) diagnostics.push(message.text());
});
page.on('requestfailed', (request) => { if (diagnostics.length < 30) diagnostics.push(`${request.failure()?.errorText}: ${request.url()}`); });
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.setCacheEnabled(false);
await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('CAPTURE', name); };
const realm = async () => {
  const state = await page.evaluate(() => window.__probe.stationRealm());
  const shaderError = errors.find((error) => /shader|GLSL|ERROR: 0:/i.test(error));
  assert.equal(shaderError, undefined, `production GPU compilation failed: ${shaderError}`);
  return state;
};
const errand = () => page.evaluate(() => window.__probe.stationErrand());
const scene = () => page.evaluate(() => window.__scenes?.top()?.id || null);
const observation = () => page.evaluate(() => {
  const top = window.__scenes?.top(), view = top?.view?.();
  return { scene: top?.id || null, node: view?.nodeId || null,
    sourceId: view?.lineSourceId || null, text: view?.line?.text || null,
    speech: window.__probe.speech?.() || null };
});
const press = async (key) => { await page.keyboard.press(key); await sleep(150); };
async function clearSpeech() {
  // Dismiss the checkpoint's incidental thought without relying on dev-only
  // module URLs. Otherwise Escape correctly dismisses speech before pausing.
  await page.evaluate(() => window.__probe.hush());
}
async function finishDialogue() {
  for (let i = 0; i < 30 && await scene(); i += 1) await press('Enter');
  await clearSpeech();
}
async function saveModule() {
  await page.waitForFunction(() => window.__probe?.stationRealm, { timeout: 90000 });
  // Production bundles have no separately importable save module. The exposed
  // gameplay probes suffice for every assertion below.
  if (await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => new URL(entry.name).pathname === '/src/game/save.js'))) {
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === '/src/game/save.js').name;
      window.__sourceSave = await import(url);
    });
  }
}
async function hold(ms) {
  await page.keyboard.down('w'); await sleep(ms); await page.keyboard.up('w'); await sleep(100);
}
async function lookThroughHomeWindow(forward, offset = 0) {
  await page.evaluate(({ forward, offset }) => {
    const frame = window.__probe.stationRealm().frame, target = frame.window;
    const localYaw = Math.atan2(target.x - frame.pose.x, target.z - frame.pose.z);
    window.__probe.lookAtWorld(Math.atan2(forward[0], -forward[1]) + localYaw + offset, 0);
  }, { forward, offset });
  await sleep(220);
}
async function holdAtHome(key, forward, target, axis) {
  // Keep gaze into the room while advancing or strafing. A waypoint corrector
  // can face back toward snow after a small overshoot and legitimately leave.
  await page.evaluate((forward) => window.__probe.lookAtWorld(Math.atan2(forward[0], -forward[1]), 0), forward);
  const start = (await realm()).frame.pose[axis], direction = Math.sign(target - start);
  if (!direction) return;
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ target, axis, direction }) => {
      const frame = window.__probe.stationRealm().frame;
      return !frame || direction * (frame.pose[axis] - target) >= 0;
    }, { timeout: 10000, polling: 20 }, { target, axis, direction });
  } finally { await page.keyboard.up(key); }
  await sleep(120);
  assert.ok((await realm()).frame, 'forward approach and room-facing strafing preserve the home visit');
}
async function enterWorld(variant, keyboard = false) {
  const door = await page.evaluate((variant) => window.__probe.doorFieldDoors().find((door) => !door.route && !door.shut && !door.erased && door.variant === variant), variant);
  assert.ok(door, `available door for variant ${variant}`);
  if (keyboard) {
    await page.evaluate((door) => {
      const [a, b] = door.threshold, n = door.normal;
      window.__probe.sourceWarp((a.x + b.x) / 2 + n[0] * 2.2, (a.y + b.y) / 2 + n[2] * 2.2);
      window.__probe.lookAtWorld(Math.atan2(-n[0], n[2]), 0);
    }, door);
    await clearSpeech(); await press('e'); await finishDialogue(); await press('e'); await finishDialogue();
    await hold(1100);
    assert.ok((await realm()).frame, 'real E/open and held W must cross the field doorway');
  } else {
    await page.evaluate((id) => window.__probe.crossFieldDoor(id), door.id);
    await sleep(180);
    assert.ok((await realm()).frame, 'authored doorway fixture must create a realm session');
  }
  console.log('ENTER', variant, door.id, keyboard ? 'keyboard doorway' : 'fixture doorway');
  return { door, forward: [-door.normal[0], -door.normal[2]] };
}
async function walkTo(target, forward, realInput = false) {
  let stuck = 0, previous = null;
  for (let i = 0; i < 200; i += 1) {
    const frame = (await realm()).frame;
    if (!frame || frame.stage !== 'inside') return;
    const dx = target[0] - frame.pose.x, dz = target[1] - frame.pose.z, distance = Math.hypot(dx, dz);
    if (distance < .24) return;
    if (previous && Math.hypot(frame.pose.x - previous.x, frame.pose.z - previous.z) < .005) stuck += 1; else stuck = 0;
    if (stuck > 5) throw new Error(`Realm walking blocked ${JSON.stringify({ target, frame })}`);
    previous = frame.pose;
    await page.evaluate(({ dx, dz, forward }) => window.__probe.lookAtWorld(Math.atan2(forward[0], -forward[1]) + Math.atan2(dx, dz), 0), { dx, dz, forward });
    if (realInput) await hold(Math.min(500, Math.max(70, distance / 1.9 * 1000)));
    else await page.evaluate(({ target, forward }) => {
      const right = [-forward[1], forward[0]];
      for (let n = 0; n < 40; n += 1) {
        const frame = window.__probe.stationRealm().frame;
        if (!frame || frame.stage !== 'inside') break;
        const dx = target[0] - frame.pose.x, dz = target[1] - frame.pose.z;
        if (Math.hypot(dx, dz) < .24) break;
        window.__probe.sourceStep(right[0] * dx + forward[0] * dz, right[1] * dx + forward[1] * dz);
      }
    }, { target, forward });
    await sleep(realInput ? 0 : 30);
  }
  throw new Error(`Realm target not reached ${JSON.stringify({ target, realm: await realm() })}`);
}
async function spendBudget(variant, forward, realInput = false) {
  const routes = [ [[1, 7.5], [4, 14.5], [5, 20], [5, 24]], [[1, 9.5], [5, 12], [6, 20]],
    [[1, 8.5], [4, 13], [6, 20]], [[0, 29]], [[1, 9.5], [4, 16], [7, 18.5], [9, 24]], [[0, 29]] ];
  const route = routes[variant];
  for (const target of route) await walkTo(target, forward, realInput);
  for (let n = 0; n < 8 && (await realm()).frame?.stage === 'inside'; n += 1) {
    await walkTo(route.at(-2) || [0, 4], forward, realInput);
    await walkTo(route.at(-1), forward, realInput);
  }
  const folding = (await realm()).frame;
  if (folding) assert.equal(folding.stage, 'decohering', 'actual walking must spend the step allowance');
  await page.waitForFunction(() => !window.__probe.stationRealm().frame, { timeout: 10000 });
  await sleep(150);
}

try {
  const response = await page.goto(process.env.STATION_VERIFY_URL || 'http://127.0.0.1:5298/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response?.ok(), `preview must serve a production document (${response?.status()})`);
  snapshots.build = await page.evaluate(() => ({ url: location.href, scripts: [...document.scripts].map((script) => script.src).filter(Boolean) }));
  await page.waitForFunction(() => window.__probe?.testRun && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(() => { window.__probe.testRun(); window.__probe.tutSkip(); });
  await saveModule(); await page.evaluate(() => window.__probe.chapelOutskirtsPreset(125));
  await clearSpeech(); await sleep(700); await shot('station-start');
  assert.equal((await errand()).relics.length, 0);

  const snow = await enterWorld(5);
  const stationary = (await realm()).frame;
  await sleep(900); await page.evaluate(() => window.__probe.lookAtWorld(.8, .2)); await sleep(900);
  const looked = (await realm()).frame;
  assert.equal(looked.steps, stationary.steps); assert.equal(looked.strideM, stationary.strideM);
  await clearSpeech(); await press('Escape');
  assert.equal(await scene(), 'pause', 'Escape must enter the actual pause scene before the freeze check');
  const paused = (await realm()).frame;
  await hold(500); assert.deepEqual((await realm()).frame.pose, paused.pose, 'pause must stop real held movement');
  await press('Escape'); await clearSpeech();
  await spendBudget(5, snow.forward);
  assert.equal((await errand()).home, false);
  checks.push('Ordinary whiteout ejects on actual steps; standing and looking spend none; real pause blocks held movement.');
  await shot('ordinary-whiteout-return');

  for (let variant = 0; variant < 5; variant += 1) {
    const entered = await enterWorld(variant, variant === 0);
    if (variant === 0) {
      await walkTo([1, 6], entered.forward, true);
      await page.evaluate(() => window.__probe.lookAtWorld(window.__probe.lookAngles().yaw + .35, .17));
      await page.evaluate(({ forward }) => window.__probe.sourceStep(forward[0], forward[1]), entered);
      await sleep(1100);
      const before = await realm();
      before.view = await page.evaluate(() => window.__probe.lookAngles());
      snapshots.beforeReload = before;
      await shot('burning-midvisit');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => window.__probe?.stationRealm && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
      // testRun deliberately bypasses installation setup. After a real reload,
      // use the existing title fixture to bypass those unrelated startup gates
      // without resetting the saved run, then take the real Continue action.
      if (await scene() !== 'title') await page.evaluate(() => window.__probe.returnToTitle());
      assert.equal(await scene(), 'title');
      await press('Enter');
      await page.waitForFunction(() => window.__probe?.stationRealm?.().frame && !window.__scenes?.top(), { timeout: 90000 });
      await sleep(700);
      await saveModule(); await clearSpeech();
      const after = await realm(); after.view = await page.evaluate(() => window.__probe.lookAngles()); snapshots.afterReload = after;
      assert.ok(after.frame, 'Continue must restore the nested realm');
      assert.equal(after.frame.steps, before.frame.steps); assert.equal(after.frame.strideM, before.frame.strideM);
      assert.ok(Math.abs(after.frame.pose.x - before.frame.pose.x) < .001 && Math.abs(after.frame.pose.z - before.frame.pose.z) < .001);
      assert.ok(Math.abs(after.frame.pose.yaw - before.frame.pose.yaw) < .001);
      assert.ok(Math.abs(Math.atan2(Math.sin(after.view.yaw - before.view.yaw), Math.cos(after.view.yaw - before.view.yaw))) < .001, 'rendered camera yaw must also restore');
      assert.ok(Math.abs(after.view.pitch - before.view.pitch) < .001, 'rendered camera pitch must also restore');
      checks.push('Actual page reload and title Continue preserve mid-realm position, gaze, completed steps and partial stride.');
    }
    await shot(`realm-${variant}`);
    await spendBudget(variant, entered.forward, variant === 0);
    const reward = await errand(); snapshots[`return${variant}`] = { realm: await realm(), reward };
    assert.equal(reward.relics.length, variant + 1, 'each ordinary world must leave one distinct relic naturally');
    console.log('RELICS', reward.relics);
  }
  checks.push('All five relics earned in one errand through real collision-ground traversal and automatic ejections; no eligibility injection. Burning uses held input; remaining routes use accelerated production step dispatch.');

  await page.evaluate(() => window.__probe.setComposure(12));
  const home = await enterWorld(5);
  assert.equal((await realm()).frame.home.eligible, true, 'the earlier consumed whiteout must reawaken for the five relics');
  await page.evaluate((forward) => window.__probe.lookAtWorld(Math.atan2(forward[0], -forward[1]), 0), home.forward);
  const homeWalkStarted = performance.now();
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => {
      const frame = window.__probe.stationRealm().frame;
      return !frame || frame.pose.z >= 67.2;
    }, { timeout: 65000, polling: 100 });
  } finally { await page.keyboard.up('w'); }
  snapshots.homeWalkSeconds = (performance.now() - homeWalkStarted) / 1000;
  console.log('HOME_WALK_SECONDS', snapshots.homeWalkSeconds);
  await clearSpeech(); await sleep(400);
  snapshots.window = { realm: await realm(), reward: await errand() };
  assert.equal(snapshots.window.realm.frame.atWindow, true);
  assert.equal(snapshots.window.reward.jumper, false);
  assert.equal(snapshots.window.reward.composure, await page.evaluate(() => window.__probe.composure().ceiling), 'broad arrival restores the deliberately lowered composure');
  snapshots.homeUI = { next: 'Tab', previous: 'Q', activate: 'E', actions: ['LOOK', 'STAY', 'TURN AWAY'] };
  assert.equal((await realm()).action, 'LOOK', 'LOOK is initially selected independently of STAY and departure');

  // Continue using held walking input to a normal close view, then sidestep for
  // architecture/storage parallax. Gaze is aimed by the same fixture used in
  // the realm paths; body position is never warped within the home.
  await holdAtHome('w', home.forward, 69.20, 'z');
  await lookThroughHomeWindow(home.forward);
  snapshots.windowClose = { realm: await realm(), reward: await errand(), screenshot: 'home-window.png' };
  assert.ok(snapshots.windowClose.realm.frame.pose.z > 69.0, 'the close bedroom capture follows actual movement to the glazing');
  await shot('home-window');
  await holdAtHome('d', home.forward, .40, 'x');
  await lookThroughHomeWindow(home.forward);
  snapshots.windowSide = { realm: await realm(), reward: await errand(), screenshot: 'home-bedroom-side.png' };
  assert.ok(snapshots.windowSide.realm.frame.pose.x > .25, 'lateral bedroom view follows actual rightward sidestepping');
  assert.equal(snapshots.windowSide.reward.jumper, false, 'side inspection must not depart or transfer the jumper');
  await shot('home-bedroom-side');
  await holdAtHome('a', home.forward, 0, 'x');
  await lookThroughHomeWindow(home.forward);

  await sleep(23000);
  assert.ok((await realm()).frame, 'home must not retain the former 22-second automatic departure');
  await page.keyboard.down('e'); await sleep(180);
  assert.equal((await errand()).jumper, false); assert.ok((await realm()).frame);
  await page.keyboard.up('e');
  snapshots.firstLook = await observation();
  assert.equal(snapshots.firstLook.scene, 'thought:door-field:home.window', 'fresh E opens the authored LOOK observation');
  assert.equal(snapshots.firstLook.node, 'home.window');
  assert.match(snapshots.firstLook.text, /college/i, 'production LOOK presents the childhood-bedroom revision');
  await finishDialogue();
  assert.equal((await realm()).action, 'LOOK', 'LOOK remains selected and repeatable after dismissal');
  await press('e');
  snapshots.secondLook = await observation();
  assert.equal(snapshots.secondLook.scene, snapshots.firstLook.scene, 'a second fresh E repeats LOOK');
  assert.equal(snapshots.secondLook.sourceId, snapshots.firstLook.sourceId);
  assert.equal(snapshots.secondLook.text, snapshots.firstLook.text);
  await finishDialogue();
  assert.equal((await errand()).jumper, false);

  await press('Tab');
  assert.equal((await realm()).action, 'STAY', 'Tab selects STAY independently');
  const beforeStay = (await realm()).frame.pose;
  await press('e');
  snapshots.stay = { realm: await realm(), reward: await errand(), observation: await observation() };
  assert.equal(snapshots.stay.realm.frame.homeState.settled, true);
  assert.equal(snapshots.stay.realm.frame.homeState.attention, 1);
  assert.deepEqual(snapshots.stay.realm.frame.pose, beforeStay, 'STAY cannot move or zoom the player');
  assert.ok(snapshots.stay.observation.speech?.text, 'STAY presents its authored observation');
  assert.equal(snapshots.stay.reward.jumper, false);
  await clearSpeech();
  await press('q'); assert.equal((await realm()).action, 'LOOK', 'Q selects the previous action');
  await press('Tab'); assert.equal((await realm()).action, 'STAY');
  await press('Tab');
  assert.equal((await realm()).action, 'TURN AWAY');

  await lookThroughHomeWindow(home.forward, Math.PI / 2);
  snapshots.lookAside = { realm: await realm(), reward: await errand() };
  assert.equal(snapshots.lookAside.realm.frame.homeState.attention, 0, 'looking aside immediately releases the local hold');
  assert.equal(snapshots.lookAside.realm.frame.homeState.departed, false, 'looking aside alone is harmless');
  assert.equal(snapshots.lookAside.realm.frame.stage, 'inside');
  assert.equal(snapshots.lookAside.reward.jumper, false);
  checks.push('Held movement reaches close and lateral bedroom views. Tab/Q/E cycle and activate independent LOOK / STAY / TURN AWAY actions; LOOK repeats, STAY changes attention without moving the body, and looking aside restores the outside without departure.');

  // Natural departure uses real held movement away from the fixed window. The
  // explicit TURN AWAY rail action is available but is not activated here.
  await lookThroughHomeWindow(home.forward, Math.PI);
  const beforeLeave = (await realm()).frame;
  assert.equal(beforeLeave.homeState.departed, false, 'facing snow alone must not depart');
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => {
      const frame = window.__probe.stationRealm().frame;
      return frame && frame.stage !== 'inside' && frame.homeState?.departed;
    }, { timeout: 5000, polling: 20 });
  } finally { await page.keyboard.up('w'); }
  const departed = await errand(); snapshots.departure = { realm: await realm(), reward: departed };
  const left = snapshots.departure.realm.frame;
  snapshots.departure.outwardMetres = Math.hypot(left.pose.x - left.window.x, left.pose.z - left.window.z)
    - Math.hypot(beforeLeave.pose.x - beforeLeave.window.x, beforeLeave.pose.z - beforeLeave.window.z);
  assert.ok(snapshots.departure.outwardMetres >= .35 - 1e-6, 'natural departure needs at least .35m of actual outward travel');
  assert.equal(departed.jumper, false, 'jumper must not arrive before the unseen return fold');
  await page.waitForFunction(() => !window.__probe.stationRealm().frame && window.__probe.stationErrand().jumper, { timeout: 10000 });
  await shot('home-return'); snapshots.final = await errand();
  assert.equal(snapshots.final.relics.length, 5); assert.equal(snapshots.final.home, true); assert.equal(snapshots.final.jumper, true);
  checks.push('Held keyboard walking reaches the physical home beyond the ordinary allowance; the window remains through a 23-second wait, facing snow alone preserves the visit, at least .35m of actual outward walking commits natural departure, and the jumper appears only after reassembly. Explicit TURN AWAY is selected but not activated in this run.');

  const chapel = await page.evaluate(() => window.__probe.doorFieldDoors().find((door) => door.route));
  assert.ok(chapel);
  await page.evaluate((door) => { const [a, b] = door.threshold, n = door.normal;
    window.__probe.sourceWarp((a.x + b.x) / 2 + n[0] * 2, (a.y + b.y) / 2 + n[2] * 2);
    window.__probe.lookAtWorld(Math.atan2(-n[0], n[2]), 0);
  }, chapel);
  await clearSpeech(); await hold(1800); await sleep(500);
  assert.equal(await page.evaluate(() => window.__probe.doorFieldDoors().length), 0, 'chapel crossing releases the Source runtime');
  await shot('chapel-arrival');
  checks.push('Fixture placement at the chapel threshold followed by real held movement completes the physical building handoff.');
  gameplayPassed = true;
  assert.deepEqual(errors, [], 'no JavaScript or shader errors');
} catch (error) {
  failure = String(error?.stack || error); console.error(error); process.exitCode = 1;
  try {
    snapshots.failure = await page.evaluate(() => ({ realm: window.__probe?.stationRealm?.(), reward: window.__probe?.stationErrand?.(), scene: window.__scenes?.top()?.id || null, ready: document.readyState }));
    await shot('failure');
  } catch {}
} finally {
  try {
    if (gameplayPassed) await rm(`${out}/failure.png`, { force: true });
    await writeFile(`${out}/report.json`, JSON.stringify({ passed: failure === null, gameplayPassed, failure,
      environmentLimitations: errors.filter((error) => /FILE_ERROR_NO_SPACE|ENOSPC/.test(error)),
      scope: 'Chromium/Metal production renderer from disposable chapel checkpoints. Startup setup, incidental-speech dismissal, station placement, camera aiming and most doorway entries are fixtures; one doorway, one ordinary realm and the home use real keyboard locomotion, including closer/lateral window views and natural outward departure. Other realm paths use accelerated production step dispatch. Includes real browser reload, keyboard title Continue, and keyboard Tab/Q/E home actions. Explicit TURN AWAY is selected but not activated. No native-window, controller, uninterrupted tape-to-chapel or perceptual audio acceptance claim.',
      checks, errors, diagnostics, snapshots }, null, 2));
  } finally {
    try { await browser.close(); } finally { await rm(profile, { recursive: true, force: true }); }
  }
}
