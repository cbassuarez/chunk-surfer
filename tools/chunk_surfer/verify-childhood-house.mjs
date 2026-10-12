// Production-renderer visual/collision review from a disposable home fixture.
// Eligibility flags, doorway entry, gaze, and most travel are injected openly.
// Position changes still use the real local realm collision/ground controller.
// Run only after the final build is ready:
// STATION_VERIFY_URL=http://127.0.0.1:PORT/?nodisplaynotice=1\&skipwarn=1\&nomic=1\&sam=0 node tools/chunk_surfer/verify-childhood-house.mjs
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const url = process.env.STATION_VERIFY_URL;
assert.ok(url, 'Set STATION_VERIFY_URL to the final production preview; no stale default build is selected.');
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Use a local production preview.');
const out = 'artifacts/source-station/house';
const diagnosticOnly = process.env.HOUSE_VERIFY_MODE === 'diagnostic';
await mkdir(out, { recursive: true });
const profile = await mkdtemp('/private/tmp/chunk-surfer-house-');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [], diagnostics = [], checks = [], snapshots = {}, travel = [];
let browser, page, failure = null, forward;

async function state() {
  const value = await page.evaluate(() => ({ realm: window.__probe.stationRealm(), reward: window.__probe.stationErrand(),
    view: window.__probe.lookAngles(), scene: window.__scenes?.top()?.id || null }));
  assert.ok(value.realm.frame, 'the home realm must remain active during the exterior inspection');
  assert.equal(value.realm.frame.stage, 'inside', 'inspection cannot accidentally start departure');
  assert.equal(value.reward.jumper, false, 'inspection cannot grant the jumper before deliberate departure');
  return value;
}

async function aim({ x, y = 1.62, z }, offset = 0) {
  await page.evaluate(({ forward, target, offset }) => {
    const frame = window.__probe.stationRealm().frame;
    const dx = target.x - frame.pose.x, dz = target.z - frame.pose.z;
    const dy = target.y - ((frame.pose.floorY || 0) + frame.eyeHeight);
    window.__probe.lookAtWorld(Math.atan2(forward[0], -forward[1]) + Math.atan2(dx, dz) + offset,
      Math.atan2(dy, Math.hypot(dx, dz)));
    window.__probe.hush();
  }, { forward, target: { x, y, z }, offset });
  await sleep(450);
}

async function windowAim(offset = 0) {
  const frame = (await state()).realm.frame, window = frame.window;
  await aim({ x: window.x, y: (window.bottom + window.top) / 2, z: window.z }, offset);
}

async function straightAhead() {
  await page.evaluate((forward) => {
    window.__probe.lookAtWorld(Math.atan2(forward[0], -forward[1]), 0);
    window.__probe.hush();
  }, forward);
  await sleep(180);
}

async function walkTo(x, z, label) {
  const initial = (await state()).realm.frame.pose;
  for (let batch = 0; batch < 120; batch += 1) {
    const result = await page.evaluate(({ x, z }) => {
      let distance = 0, blocked = false;
      const before = window.__probe.stationRealm().frame.pose;
      for (let n = 0; n < 24; n += 1) {
        const frame = window.__probe.stationRealm().frame;
        if (!frame || frame.stage !== 'inside') break;
        const dx = x - frame.pose.x, dz = z - frame.pose.z, remaining = Math.hypot(dx, dz);
        if (remaining < .012) break;
        const amount = Math.min(.085, remaining);
        const moved = window.__probe.realmMove(dx / remaining * amount, dz / remaining * amount);
        distance += moved?.movedDistance || 0;
        blocked ||= !!moved?.blocked;
      }
      const frame = window.__probe.stationRealm().frame;
      return { before, pose: frame?.pose, stage: frame?.stage, distance, blocked };
    }, { x, z });
    assert.ok(result.pose && result.stage === 'inside', `fixture collision travel must preserve the visit: ${label}`);
    const remaining = Math.hypot(x - result.pose.x, z - result.pose.z);
    if (remaining < .012) {
      travel.push({ label, input: 'fixture realmMove; swept production ground/collision', start: initial,
        target: { x, z }, end: result.pose });
      await sleep(220);
      return;
    }
    assert.ok(result.distance > .002, `valid support route blocked before ${label}: ${JSON.stringify(result)}`);
    await sleep(20);
  }
  throw new Error(`Target not reached by valid collision travel: ${label} (${x}, ${z})`);
}

async function capture(name, raw = false) {
  assert.deepEqual(errors, [], 'no JavaScript or production shader errors before capture');
  snapshots[name] = await state();
  snapshots[name].capture = `${name}.png`;
  snapshots[name].render = 'actual full game post-processing and HUD; no raw-scene substitution';
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('CAPTURE', `${out}/${name}.png`);
  if (raw) {
    const data = await page.evaluate(() => window.__probe.sourceShoreCapture('scene'));
    assert.ok(data?.startsWith('data:image/png;base64,'), 'production diagnostic must provide the actual scene stage');
    await writeFile(`${out}/${name}-raw-scene.png`, Buffer.from(data.split(',')[1], 'base64'));
    snapshots[name].supplementalRaw = { capture: `${name}-raw-scene.png`,
      render: 'DIAGNOSTIC ONLY: raw scene RGB copied to opaque canvas, linear values quantized to PNG without pixel mesh/post or display encoding; not the game appearance' };
    console.log('RAW_DIAGNOSTIC', `${out}/${name}-raw-scene.png`);
  }
}

async function hold(key, ms) {
  await page.keyboard.down(key);
  try { await sleep(ms); } finally { await page.keyboard.up(key); }
  await sleep(180);
}

try {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: profile, headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
      '--disk-cache-size=1', '--media-cache-size=1', '--disable-gpu-shader-disk-cache'] });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  page.on('pageerror', (error) => { errors.push(String(error)); console.error('PAGEERROR', String(error)); });
  page.on('console', (message) => {
    if (/shader.*error|GLSL.*error|ERROR: 0:/i.test(message.text())) errors.push(message.text());
    if (message.type() === 'error' && diagnostics.length < 40) diagnostics.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (diagnostics.length < 40) diagnostics.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response?.ok(), `production preview must serve successfully (${response?.status()})`);
  await page.waitForFunction(() => window.__probe?.testRun
    && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(() => {
    window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.chapelOutskirtsPreset(125);
    window.__probe.hush();
  });
  await sleep(350);
  snapshots.build = await page.evaluate(() => ({ url: location.href, scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').filter((entry) => /\/assets\/.*\.js(?:\?|$)/.test(entry.name)).map((entry) => entry.name) }));
  assert.ok(snapshots.build.scripts.some((src) => /\/assets\/.*\.js(?:\?|$)/.test(src)), 'capture must load a built production bundle');
  assert.ok(!snapshots.build.scripts.some((src) => /\/src\/|@vite/.test(src)), 'development module rendering is outside this check');
  if (process.env.STATION_VERIFY_BUNDLE) assert.ok(snapshots.build.scripts.some((src) => new URL(src).pathname.endsWith(`/assets/${process.env.STATION_VERIFY_BUNDLE}`)),
    `capture must load the intended bundle ${process.env.STATION_VERIFY_BUNDLE}`);
  forward = await page.evaluate(() => {
    window.__probe.stationErrand(['burning', 'flood', 'inverted', 'two-moons', 'glass-storm']);
    const door = window.__probe.doorFieldDoors().find((entry) => !entry.route && !entry.shut && !entry.erased && entry.variant === 5);
    if (!door) throw new Error('No eligible whiteout doorway in the disposable checkpoint');
    window.__probe.crossFieldDoor(door.id);
    return [-door.normal[0], -door.normal[2]];
  });
  await sleep(650);
  assert.equal((await state()).realm.frame.home.eligible, true, 'five injected relic flags must explicitly select the home exception');

  if (diagnosticOnly) {
    await walkTo(0, 66, 'diagnostic whole-house approach');
    await aim({ x: 1.6, y: 1.25, z: 73.7 });
    await capture('diagnostic-whole-house-z66', true);
    await walkTo(3.45, 66.8, 'diagnostic secondary-window approach');
    await aim({ x: 3.45, y: 1.48, z: 70 });
    await capture('diagnostic-upper-front-secondary-window', true);
    await walkTo(-4.2, 66.8, 'diagnostic left front crossing');
    await walkTo(-4.2, 72, 'diagnostic left depressed face-on view');
    assert.ok((await state()).realm.frame.pose.floorY < -.8, 'left face-on view must stand on real depressed ground');
    await aim({ x: -2.2, y: -.72, z: 72 });
    assert.ok((await state()).view.pitch > -.62, 'left lower-window head must fit the real pitch clamp');
    await capture('diagnostic-left-scour-window-head', true);
    await walkTo(-4.2, 66.8, 'diagnostic left return');
    await walkTo(7.2, 66.8, 'diagnostic right front crossing');
    await walkTo(7.2, 73.1, 'diagnostic right depressed face-on view');
    assert.ok((await state()).realm.frame.pose.floorY < -.8, 'right face-on view must stand on real depressed ground');
    await aim({ x: 5.4, y: -.75, z: 73.45 });
    assert.ok((await state()).view.pitch > -.62, 'right lower-door head must fit the real pitch clamp');
    await capture('diagnostic-right-scour-door-head', true);
    checks.push('Diagnostic-only material/post comparison: coherent house and secondary window, plus supported depressed face-on views with unclamped lower-storey head bearings.');
  } else {
  // The central approach stays level. These are actual local positions reached
  // by collision movement, never replacement saved poses or renderer cameras.
  for (const z of [3, 40, 57, 62, 66.8]) {
    await walkTo(0, z, `central approach z${z}`);
    assert.ok(Math.abs((await state()).realm.frame.pose.floorY) < .001, 'central upstairs-window approach must stay level');
    await windowAim();
    await capture(`approach-z${String(z).replace('.', '-')}`);
  }
  checks.push('Collision-ground travel reaches all five central approach distances without a forced local pose.');

  for (const z of [64, 66]) {
    await walkTo(0, z, `whole house z${z}`);
    await aim({ x: 1.6, y: 1.25, z: 73.7 });
    await capture(`whole-house-z${z}`, z === 66);
  }
  await walkTo(0, 66.8, 'clear house after arrival gust');
  await aim({ x: 1.6, y: 1.6, z: 73.7 });
  assert.equal((await state()).realm.frame.home.fold, 1, 'arrival gust must have completed for the clear house frame');
  await capture('whole-house-clear-z66-8', true);
  await walkTo(3.45, 66.8, 'secondary front-window approach');
  await aim({ x: 3.45, y: 1.48, z: 70 });
  await capture('upper-front-secondary-window', true);

  // Reach each side from the open front, then follow its supported scour.
  // Fixture travel omits the home input lifecycle so lateral/backtracking
  // inspection cannot be mistaken for the player's natural departure choice.
  await walkTo(0, 66.8, 'front staging before left side');
  await walkTo(-3.5, 66.8, 'left front crossing');
  for (const z of [70, 72]) {
    await walkTo(-3.5, z, `left side z${z}`);
    await aim({ x: -1.5, y: -.3, z: 73.1 });
    await capture(`left-side-z${z}`);
  }
  await walkTo(-2.65, 72, 'left lower-storey reveal');
  assert.ok((await state()).realm.frame.pose.floorY < -.8, 'left scour must expose a real lower viewpoint');
  snapshots.leftDeepScour = await state();
  await walkTo(-4.2, 72, 'left depressed face-on view');
  assert.ok((await state()).realm.frame.pose.floorY < -.8, 'left face-on view must stand on real depressed ground');
  await aim({ x: -2.2, y: -.72, z: 72 });
  assert.ok((await state()).view.pitch > -.62, 'left lower-window head must fit the real pitch clamp');
  await capture('left-scour-lower-window', true);
  await walkTo(-4.2, 66.8, 'left scour return');
  await walkTo(6.2, 66.8, 'right front crossing');
  for (const z of [70, 72]) {
    await walkTo(6.2, z, `right side z${z}`);
    await aim({ x: 4.9, y: -.3, z: 73.1 });
    await capture(`right-side-z${z}`);
  }
  await walkTo(6.2, 73.1, 'right lower-storey reveal');
  assert.ok((await state()).realm.frame.pose.floorY < -.8, 'right scour must expose a real lower viewpoint');
  snapshots.rightDeepScour = await state();
  await walkTo(7.2, 73.1, 'right depressed face-on view');
  assert.ok((await state()).realm.frame.pose.floorY < -.8, 'right face-on view must stand on real depressed ground');
  await aim({ x: 5.4, y: -.75, z: 73.45 });
  assert.ok((await state()).view.pitch > -.62, 'right lower-door head must fit the real pitch clamp');
  await capture('right-scour-lower-door', true);
  await walkTo(7.2, 66.8, 'right scour return');
  await walkTo(0, 66.8, 'central approach restored');
  checks.push('Both front corners and side scours are reached along supported collision routes; no invalid body pose is injected.');

  const window = (await state()).realm.frame.window;
  await walkTo(window.x, 69.2, 'close bedroom approach');
  await windowAim(); await capture('bedroom-close-z69-2');
  const close = (await state()).realm.frame;
  assert.ok(close.atWindow, 'close bedroom is in the ordinary interaction radius');

  await straightAhead();
  const beforeGlass = (await state()).realm.frame.pose;
  await hold('w', 1200);
  const afterGlass = (await state()).realm.frame.pose;
  assert.ok(afterGlass.z > beforeGlass.z + .2, 'held W must visibly approach the glazing before it blocks');
  assert.ok(afterGlass.z <= window.z - .21, 'closed glazing must keep the real body outside');
  await hold('w', 700);
  const glassBlocked = (await state()).realm.frame.pose;
  assert.ok(Math.hypot(glassBlocked.x - afterGlass.x, glassBlocked.z - afterGlass.z) < .01, 'continued held W must stop at the closed facade');
  snapshots.glazingCollision = { before: beforeGlass, after: afterGlass, blocked: glassBlocked, input: 'real held W' };
  checks.push('Real held W approaches the bedroom, then remains blocked outside closed glazing without entering the room.');

  const beforeRight = (await state()).realm.frame.pose;
  await hold('d', 360);
  const afterRight = (await state()).realm.frame.pose;
  assert.ok(afterRight.x > beforeRight.x + .2, 'real D must sidestep right near the bedroom');
  await windowAim(); await capture('bedroom-real-right');
  await straightAhead(); await hold('a', 360);
  const afterLeft = (await state()).realm.frame.pose;
  assert.ok(afterLeft.x < afterRight.x - .2, 'real A must sidestep left near the bedroom');
  snapshots.realSidesteps = { before: beforeRight, right: afterRight, left: afterLeft, input: 'real held D / A, camera facing the house' };
  checks.push('Real A/D movement near the facade produces lateral parallax and preserves the visit.');

  await windowAim(Math.PI / 2);
  const lookedAside = await state();
  assert.equal(lookedAside.realm.frame.homeState.attention, 0, 'looking aside restores outside attention immediately');
  assert.equal(lookedAside.realm.frame.homeState.departed, false, 'a look aside alone cannot depart');
  snapshots.lookAside = lookedAside; await capture('look-aside');
  await windowAim(Math.PI);
  const lookedBack = await state();
  assert.equal(lookedBack.realm.frame.homeState.departed, false, 'looking into snow without outward walking cannot depart');
  snapshots.lookBack = lookedBack; await capture('look-back-snow');
  checks.push('Stationary looks aside and back into snow release the room attention without false departure or jumper grant.');
  }

  snapshots.loaded = await page.evaluate(() => ({ url: location.href,
    scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').filter((entry) => /\/assets\/.*\.js(?:\?|$)/.test(entry.name)).map((entry) => entry.name) }));
  assert.deepEqual(errors, [], 'no JavaScript or shader errors in the completed production capture');
} catch (error) {
  failure = String(error?.stack || error); console.error(error); process.exitCode = 1;
  if (page) {
    try {
      snapshots.failure = await page.evaluate(() => ({ realm: window.__probe?.stationRealm?.(), reward: window.__probe?.stationErrand?.(), scene: window.__scenes?.top()?.id || null }));
      await page.screenshot({ path: `${out}/failure.png` });
    } catch {}
  }
} finally {
  try {
    if (!failure) await rm(`${out}/failure.png`, { force: true });
    await writeFile(`${out}/${diagnosticOnly ? 'report-diagnostic' : 'report'}.json`, JSON.stringify({ passed: failure === null, failure, diagnosticOnly,
      scope: 'Chromium/Metal actual production game post-processing at 1440x900, disposable chapel checkpoint. Five relic eligibility flags, doorway entry, gaze and capture travel are fixtures. Fixture travel uses real swept realm movement, ground height and collision, bypassing natural-departure input lifecycle deliberately. '
        + (diagnosticOnly ? 'Diagnostic-only run: supplemental raw scene PNGs are explicitly labelled and do not represent the game appearance; no held-key checks in this mode. '
          : 'Near-window W/A/D checks use actual held keyboard input. ')
        + 'No earned errand, uninterrupted route, native/controller, frame-rate or perceptual-audio acceptance claim.',
      checks, errors, diagnostics, snapshots, travel }, null, 2));
  } finally {
    try { await browser?.close(); } finally { await rm(profile, { recursive: true, force: true }); }
  }
}
