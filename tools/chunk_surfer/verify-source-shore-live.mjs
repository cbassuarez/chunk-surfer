// Actual keyboard traversal of the Hanging Shore, with rendered evidence.
// Start a server separately; this script does not start one or a lens worker.
// SOURCE_SHORE_URL=http://127.0.0.1:5315 SOURCE_SHORE_OUT=/private/tmp/shore \
//   node tools/chunk_surfer/verify-source-shore-live.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.SOURCE_SHORE_URL || 'http://127.0.0.1:5315';
const reduced = process.env.SOURCE_SHORE_REDUCED_MOTION === '1';
const thresholdOnly = process.env.SOURCE_SHORE_THRESHOLD_ONLY === '1';
const out = resolve(process.env.SOURCE_SHORE_OUT || `/private/tmp/source-shore/${reduced ? 'reduced' : 'normal'}`);
const sleep = ms => new Promise(done => setTimeout(done, ms));
const checks = [], errors = [], snapshots = {}, samples = [];
let browser, page, failure = null;
await mkdir(out, { recursive: true });

function check(value, name, details) {
  checks.push({ passed: !!value, name, ...(details === undefined ? {} : { details }) });
  console.log(`${value ? 'PASS' : 'FAIL'} ${name}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}
const position = () => page.evaluate(() => window.__probe.pos());
const local = () => page.evaluate(() => {
  const p = window.__probe, o = p.chunkSurf().landscapeOrigin, at = p.pos();
  return { x: at.x - o.x, y: at.y - o.y };
});
async function aim(yaw = 0, pitch = 0) {
  await page.evaluate(v => window.__probe.lookAtWorld(v.yaw, v.pitch), { yaw, pitch });
  await sleep(90);
}
async function hold(key, ms) {
  await page.keyboard.down(key);
  try { await sleep(ms); } finally { await page.keyboard.up(key); }
}
async function press(key) { await page.keyboard.press(key); await sleep(130); }
async function clearSpeech() { await page.evaluate(() => window.__probe.hush?.()); }
async function torch(on) {
  if (await page.evaluate(() => !!window.__probe.rec().light) !== on) await press('f');
  await clearSpeech(); await sleep(220);
}
async function evidence(name, capture = true) {
  const snapshot = snapshots[name] = await page.evaluate(() => {
    const p = window.__probe, at = p.pos(), view = p.sourceShoreView();
    return {
      source: p.chunkSurf(), position: at, look: p.lookAngles(),
      floor: p.sourceCell(at.x, at.y)?.physical?.floor,
      renderedEye: view.eye, renderedEyeMetres: { x: view.eye.x * .5, y: view.eye.y * .5, z: view.eye.z * .5 }, lighting: p.r3dLighting(),
      torchOn: !!p.rec().light, props: p.sourceProps(), pack: p.props(),
      moveInterval: p.moveInterval(), settings: p.settings(),
      scene: window.__scenes?.top()?.id, performance: p.performance(),
      shoreRender: view, shoreAudio: p.sourceShoreAudio?.() || null,
    };
  });
  const shore = snapshot.source.landing?.shore;
  console.log('EVIDENCE', name, JSON.stringify({ position: snapshot.position, floor: snapshot.floor,
    shore: shore && { active: shore.active, outside: shore.outside, proper: shore.proper,
      whiteout: shore.whiteout, remainingMetres: shore.distanceToLiftMetres,
      lift: shore.lift.phase, liftFloor: shore.lift.floor, bodyFloor: shore.bodyFloor } }));
  if (capture) {
    await page.screenshot({ path: join(out, `${name}.png`) });
    for (const stage of ['props', 'scene', 'vfd']) {
      const data = await page.evaluate(stage => window.__probe.sourceShoreCapture(stage), stage);
      if (data) await writeFile(join(out, `${name}-${stage}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
  }
  return snapshot;
}

// This uses accepted movement through the same WASD handler as ordinary play.
async function walkLocal(target, tolerance = .75) {
  await aim(0, -.04);
  for (let n = 0; n < 120; n++) {
    const at = await local(), dx = target.x - at.x, dy = target.y - at.y;
    if (Math.hypot(dx, dy) <= tolerance) return;
    const key = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'd' : 'a' : dy > 0 ? 's' : 'w';
    const before = await position();
    await press(key);
    const after = await position();
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > .001,
      `walking ${key} toward ${JSON.stringify(target)} blocked at ${JSON.stringify(at)}: ${JSON.stringify(await page.evaluate(() => window.__probe.why()))}`);
  }
  throw new Error(`walking did not reach ${JSON.stringify(target)}`);
}

try {
  browser = await puppeteer.launch({
    executablePath: process.env.SOURCE_SHORE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(m.text())) errors.push(m.text()); });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  const url = new URL(base);
  for (const [key, value] of Object.entries({ nodisplaynotice: '1', skipwarn: '1', nomic: '1', sam: '0', nothink: '1' })) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(async reduced => {
    await window.__probe.testRun(); window.__probe.tutSkip();
    if (window.__probe.settings().shake !== (reduced ? 'reduced' : 'full')) window.__chunkSurferDesktopMenu?.dispatch({ id: 'reduce_motion', checked: reduced });
    if (window.__probe.settings().flash !== (reduced ? 'off' : 'full')) window.__probe.apparitionEffects(reduced ? 'off' : 'full');
    window.__probe.setObjectiveHints('full');
    window.__chunkSurferPixelMesh?.setAccessibility({ reduceMotion: reduced, reduceFlash: reduced });
    window.__probe.propDiagnostics(true); window.__probe.sourcePreset('landing');
  }, reduced);
  await clearSpeech(); await aim(0, -.04); await sleep(400);
  const dock = await evidence('00-dock');
  check(dock.source.landing.void.sceneDock, 'entry is the real remembered room');
  check(dock.source.landing.flashlight.profile === 'dock', 'remembered-room torch profile is preserved');
  const coordinates = await page.evaluate(() => {
    const s = window.__probe.chunkSurf().landing.shore;
    return { door: { x: (s.doorway.centreX - s.originMetres.x) * 2, y: (s.doorway.doorZ - s.originMetres.z) * 2 } };
  });
  // Source's landing preset starts within clear floor near the exit.
  await walkLocal({ x: coordinates.door.x, y: coordinates.door.y + 3 });
  await aim(0, -.035); await clearSpeech();
  await evidence('01-door-closed'); await press('e'); await sleep(1050);
  await evidence('02-door-open');
  await page.evaluate(() => {
    window.__shoreSamples = { started: null, active: true, last: 0, values: [] };
    function collect(now) {
      const a = window.__shoreSamples; if (!a.active) return;
      const p = window.__probe, s = p.chunkSurf(), v = s.landing?.void, shore = s.landing?.shore;
      if (v?.approach && a.started === null) a.started = now;
      if (now - a.last >= 65) {
        const pos = p.pos();
        a.values.push({ now, elapsed: a.started === null ? null : (now - a.started) / 1000, pos, look: p.lookAngles(), floor: p.sourceCell(pos.x, pos.y)?.physical?.floor, eye: p.sourceShoreView().eye, shore, void: v, firstLiftCompleted: s.firstLiftCompleted });
        a.last = now;
      }
      requestAnimationFrame(collect);
    }
    requestAnimationFrame(collect);
  });
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__shoreSamples.started !== null, { timeout: 15000 });
  await page.keyboard.up('w');
  await sleep(2600); await evidence('03-whiteout');
  const displayedPNG=await page.screenshot({encoding:'base64'});
  const blindPixels=await page.evaluate(async png=>{
    const picture=new Image();picture.src=`data:image/png;base64,${png}`;await picture.decode();
    const canvas=document.createElement('canvas');canvas.width=picture.width;canvas.height=picture.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(picture,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let white=0,sum=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i]>253&&pixels[i+1]>253&&pixels[i+2]>253)white++;sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;}
    return {whiteFraction:white/(pixels.length/4),mean:sum/(pixels.length/4)};
  },displayedPNG);
  check(reduced?blindPixels.whiteFraction<.95:blindPixels.whiteFraction>.999,
    reduced?'reduced effects retain the scene during exposure':'normal exposure becomes uninterrupted full white',blindPixels);
  await aim(Math.PI, .06); await evidence('04-whiteout-look-back');
  await sleep(12000); await evidence('05-adapted-room');
  await aim(Math.PI / 2, 0); await torch(false); const emptyOff = await evidence('06-empty-torch-off');
  await torch(true); const emptyOn = await evidence('07-empty-torch-on');
  check(emptyOff.source.landing.flashlight.mode === 'normal' && emptyOn.source.landing.flashlight.xray === false, 'the crossing keeps the ordinary flashlight');
  check(emptyOn.lighting.sourceEmergency === 0, 'the first nothingness has no emergency wash');
  if(!thresholdOnly){
  await aim(0, -.035);
  await hold('w', 3000);
  // Circling has no completion credit. All four sides use actual held keys.
  const circleBefore = await local();
  for (const key of ['d', 's', 'a', 'w']) await hold(key, 450);
  const circleAfter = await evidence('08-after-circle');
  check(!circleAfter.source.sourceApproachComplete, 'circling cannot complete the physical crossing');
  check(Math.hypot((await local()).x - circleBefore.x, (await local()).y - circleBefore.y) < 2.5, 'the circle returns near its real starting place');
  const walkingStart = { position: await position(), now: await page.evaluate(() => performance.now()) };
  const begun = Date.now();
  await page.keyboard.down('w');
  try {
    for (const seconds of [20, 45, 65]) {
      await sleep(Math.max(0, seconds * 1000 - (Date.now() - begun)));
      await evidence(`09-crossing-${seconds}s`);
    }
    await page.waitForFunction(() => {
      const s = window.__probe.chunkSurf().landing?.shore;
      return s?.lift?.boarded && s.lift.phase === 'rising' && s.bodyFloor > .05;
    }, { timeout: 35000 });
  } finally { await page.keyboard.up('w'); }
  const boarding = await evidence('10-boarding');
  const walkingEnd = await page.evaluate(() => ({ now: performance.now(), pos: window.__probe.pos() }));
  const walkedMetres = Math.hypot(walkingEnd.pos.x - walkingStart.position.x, walkingEnd.pos.y - walkingStart.position.y) * .5;
  const heldSeconds = (walkingEnd.now - walkingStart.now) / 1000;
  check(Math.abs(walkedMetres / heldSeconds - 4.8) < .35, 'held movement crosses real distance at ordinary walking speed', { walkedMetres, heldSeconds, metresPerSecond: walkedMetres / heldSeconds });
  await aim(Math.PI, .015); await evidence('11-rising-look-back');
  await sleep(8500); const upper = await evidence('12-upper-look-back');
  check(upper.source.landing.shore?.outside && !upper.source.landing.shore?.proper, 'Source stays concealed after the lift rises');
  check(Math.abs(upper.renderedEyeMetres.y - dock.renderedEyeMetres.y - 4.2) < .1, 'the camera gains the actual 4.2m lift elevation');
  await aim(0, -.06); await torch(false); await evidence('13-upper-torch-off');
  await torch(true); await evidence('14-upper-torch-on');
  check(Math.hypot(upper.position.x - boarding.position.x, upper.position.y - boarding.position.y) < 1.5, 'the lift changes elevation without relocating the body');
  await aim(0, -.035); await hold('s', 1600); await sleep(1500);
  const fallen = await evidence('15-step-off');
  check(fallen.renderedEyeMetres.y < upper.renderedEyeMetres.y - 3.5, 'stepping off loses real elevation safely');
  check(!fallen.source.firstLiftCompleted, 'stepping off cannot activate Source proper');
  await sleep(6500);
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => {
      const phase = window.__probe.chunkSurf().landing?.shore?.lift?.phase;
      return phase === 'boarding' || phase === 'rising';
    }, { timeout: 15000 });
  } finally { await page.keyboard.up('w'); }
  await sleep(7500); const recovered = await evidence('15-recalled-lift');
  check(recovered.renderedEyeMetres.y > fallen.renderedEyeMetres.y + 3.5, 'the lift remains available after stepping off');
  await walkLocal({ x: 8, y: -776 });
  await aim(Math.PI / 2, -.08); await evidence('15-exterior-ledge-side');
  await walkLocal({ x: 18, y: -776 });
  await walkLocal({ x: 18, y: -783 });
  const concealed = await evidence('16-before-entry-turn');
  check(!concealed.source.firstLiftCompleted, 'reaching the return does not reveal Source before the turn');
  const beforeTurn = await position();
  await walkLocal({ x: 10, y: -783 });
  const proper = await evidence('17-after-entry-turn');
  check(proper.source.firstLiftCompleted && proper.source.landing.shore?.proper, 'walking the concealed turn enters Source proper');
  check(Math.hypot(proper.position.x - beforeTurn.x, proper.position.y - beforeTurn.y) < 10, 'entry into Source is a continuous walked turn');
  const values = await page.evaluate(() => { window.__shoreSamples.active = false; return window.__shoreSamples.values; });
  samples.push(...values);
  const jumps = values.slice(1).map((v, i) => ({ a: values[i], b: v, delta: Math.hypot(v.pos.x - values[i].pos.x, v.pos.y - values[i].pos.y) })).filter(v => v.delta > 2.5);
  check(jumps.length === 0, 'the entire crossing has no teleport discontinuities', jumps.map(v => v.delta));
  // Separate diagnostic viewpoints inspect the finite ends and room shell.
  // These warps are not included in the keyboard route or continuity proof.
  await page.evaluate(() => window.__probe.sourcePreset('first-lift')); await clearSpeech();
  await page.evaluate(() => { const p = window.__probe, o = p.chunkSurf().landscapeOrigin; p.sourceWarp(o.x + 120, o.y - 776); });
  await sleep(1800); await aim(-1.42, .03); await torch(false);
  const side = await evidence('18-finite-bank-end');
  check(side.source.landing.shore.outside && side.renderedEyeMetres.y < 2, 'the bank end can be seen from the dependable lower plane');
  await page.evaluate(() => { const p = window.__probe, o = p.chunkSurf().landscapeOrigin; p.sourceWarp(o.x + 40, o.y - 48); });
  await aim(-2.45, .015); await evidence('19-finite-room-exterior');
  }
  check(errors.length === 0, 'the actual WebGL route has no JS or shader errors', errors);
} catch (error) {
  failure = String(error?.stack || error); process.exitCode = 1; console.error(failure);
  if (page) try { await evidence('failure'); } catch (e) { console.error(String(e)); }
} finally {
  if (page) for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key).catch(() => {});
  await writeFile(join(out, 'report.json'), JSON.stringify({ base, reduced, thresholdOnly, checks, errors, failure, snapshots, samples }, null, 2));
  await browser?.close();
  if (checks.some(c => !c.passed)) process.exitCode = 1;
}
