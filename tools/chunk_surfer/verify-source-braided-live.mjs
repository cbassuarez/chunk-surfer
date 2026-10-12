// Braided Divide through the running game. Start the server separately.
// SOURCE_BRAIDED_URL=http://127.0.0.1:5315 SOURCE_BRAIDED_OUT=/private/tmp/source-braided \
//   node tools/chunk_surfer/verify-source-braided-live.mjs
// Optional: SOURCE_BRAIDED_REDUCED_MOTION=1, SOURCE_BRAIDED_CHROME, SOURCE_BRAIDED_HEADFUL=1.
// SOURCE_BRAIDED_MODE=smoke captures the entry, torch, look and consent only;
// visual stops after entry/torch/look. The default full mode walks every level.
// facade walks the unchanged shore/lift and Exposed Strata cleft only.
// optical walks the cleft to a matched (4,-399), yaw pi, pitch .06 bank view.
// SOURCE_BRAIDED_REVEAL_EDGES=1 adds a separate first-lift checkpoint to short
// visual proof, testing the west mouth's early sightline and reversible return.
// Presets establish disposable checkpoints; every route segment and interaction
// below uses the ordinary keyboard handler. No sourceWarp/sourceStep is used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { SOURCE_HANGING_SHORE } from '../../src/data/source-hanging-shore.js';
import { sourceStrataEntryAt, sourceStrataGeometry, sourceStrataRaycast } from '../../src/data/source-exposed-strata.js';

const base = process.env.SOURCE_BRAIDED_URL || 'http://127.0.0.1:5315';
const reduced = process.env.SOURCE_BRAIDED_REDUCED_MOTION === '1';
const mode = process.env.SOURCE_BRAIDED_MODE || 'full';
const revealEdges = process.env.SOURCE_BRAIDED_REVEAL_EDGES === '1';
assert.ok(['full', 'smoke', 'visual', 'facade', 'optical'].includes(mode), 'unknown SOURCE_BRAIDED_MODE');
const out = resolve(process.env.SOURCE_BRAIDED_OUT || `/private/tmp/source-braided/${mode === 'full' ? '' : `${mode}-`}${reduced ? 'reduced' : 'normal'}`);
const sleep = ms => new Promise(done => setTimeout(done, ms));
const checks = [], errors = [], captureErrors = [], snapshots = {}, routes = [];
let browser, page, failure = null, capturesAvailable = true;
await mkdir(out, { recursive: true });

function check(condition, name, details) {
  checks.push({ passed: !!condition, name, ...(details === undefined ? {} : { details }) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}
const top = () => page.evaluate(() => window.__scenes?.top()?.id || null);
const sceneView = () => page.evaluate(() => window.__scenes?.top()?.view?.() || null);
const position = () => page.evaluate(() => window.__probe.pos());
const local = () => page.evaluate(() => {
  const p = window.__probe, at = p.pos(), o = p.chunkSurf().landscapeOrigin;
  return { x: (at.x - o.x) * .5, z: (at.y - o.y) * .5 };
});
async function aim(yaw = 0, pitch = -.04) {
  await page.evaluate(v => window.__probe.lookAtWorld(v.yaw, v.pitch), { yaw, pitch });
  await sleep(90);
}
async function hold(key, ms) {
  await page.keyboard.down(key);
  try { await sleep(ms); } finally { await page.keyboard.up(key); }
}
async function press(key) { await page.keyboard.press(key); await sleep(170); }
async function clearSpeech() { await page.evaluate(() => window.__probe.hush?.()); }
async function torch(on) {
  if (await page.evaluate(() => !!window.__probe.rec().light) !== on) await press('f');
  await clearSpeech(); await sleep(250);
  check(await page.evaluate(() => !!window.__probe.rec().light) === on, `real F input turns torch ${on ? 'on' : 'off'}`);
}
async function propImageStats() {
  return page.evaluate(async () => {
    const data = window.__probe.sourceShoreCapture?.('props');
    if (!data) return null;
    const img = new Image(); img.src = data; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0, 160, 100);
    const pixels = context.getImageData(0, 0, 160, 100).data;
    let luminance = 0, hash = 2166136261;
    for (let n = 0; n < pixels.length; n += 4) {
      luminance += pixels[n] * .2126 + pixels[n + 1] * .7152 + pixels[n + 2] * .0722;
      for (let c = 0; c < 3; c++) hash = Math.imul(hash ^ pixels[n + c], 16777619);
    }
    return { meanLuminance: luminance / (pixels.length / 4), hash: hash >>> 0, samples: pixels.length / 4 };
  });
}
async function evidence(name, capture = true) {
  const snapshot = snapshots[name] = await page.evaluate(() => {
    const p = window.__probe, at = p.pos(), s = p.chunkSurf(), eye = p.sourceShoreView?.()?.eye;
    const { instances, learned, ...pack } = p.props() || {};
    return {
      source: s, position: at,
      localMetres: { x: (at.x - s.landscapeOrigin.x) * .5, z: (at.y - s.landscapeOrigin.y) * .5 },
      floor: p.sourceCell(at.x, at.y)?.physical?.floor, renderedFloor: p.floorH?.(),
      bodyFloor: s.divide?.active ? s.divide.body.feet : s.landing?.shore?.active ? s.landing.shore.bodyFloor : p.floorH?.(),
      renderedEye: eye || null,
      renderedEyeMetres: eye ? { x: eye.x * .5, y: eye.y * .5, z: eye.z * .5 } : null,
      look: p.lookAngles(), lighting: p.r3dLighting(), torchOn: !!p.rec().light,
      props: p.sourceProps(), pack: { ...pack, instanceCount: instances?.length, learnedCount: learned?.length }, moveInterval: p.moveInterval(),
      settings: p.settings(), performance: p.performance(),
      scene: window.__scenes?.top()?.id || null, sceneView: window.__scenes?.top()?.view?.() || null,
      shoreAudio: p.sourceShoreAudio?.() || null,
      roomMemories: p.sourceRoomMemories?.() || null,
      sourceLights: p.sourceLights?.() || null,
      shoreRender: p.sourceShoreView?.() || null,
    };
  });
  console.log('EVIDENCE', name, JSON.stringify({ local: snapshot.localMetres, floor: snapshot.floor,
    eye: snapshot.renderedEyeMetres, phase: snapshot.source.phase,
    firstLift: snapshot.source.firstLiftCompleted, scene: snapshot.scene, props: snapshot.props?.length }));
  if (capture && capturesAvailable) try {
    await page.screenshot({ path: join(out, `${name}.png`) });
    const stages = /reveal|torch-|crossing|case-over|case-under|piano-over|piano-under|listening-court|contact-|failure|facade-(below-bank|cleft|look-back|joined)/.test(name) ? ['props', 'scene'] : [];
    for (const stage of stages) {
      const data = await page.evaluate(stage => window.__probe.sourceShoreCapture?.(stage), stage);
      if (data) await writeFile(join(out, `${name}-${stage}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
  } catch (error) {
    if (error?.code !== 'ENOSPC') throw error;
    capturesAvailable = false;
    captureErrors.push({ name, message: String(error) });
    console.error('CAPTURE_WARNING', name, String(error));
  }
  return snapshot;
}

// Authoring and targets are local metres; the authoritative body's probe is
// Source cells. Face north so D/A/S also prove lateral movement and retreat.
async function walkLocal(target, { tolerance = .34, capture = true } = {}) {
  await clearSpeech(); await aim(0, -.04);
  const begun = Date.now(), start = await local();
  let previousLog = begun, still = 0, iterations = 0;
  const keys = new Set();
  while (Date.now() - begun < 120000) {
    const at = await local(), dx = target.x - at.x, dz = target.z - at.z;
    if (Math.hypot(dx, dz) <= tolerance) {
      const record = { id: target.id, start, end: at, target, seconds: (Date.now() - begun) / 1000, keys: [...keys], iterations };
      routes.push(record);
      console.log('WALK', JSON.stringify(record));
      return capture ? evidence(target.id) : record;
    }
    const key = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? 'd' : 'a' : dz > 0 ? 's' : 'w';
    keys.add(key);
    const interval = await page.evaluate(() => window.__probe.moveInterval());
    const remaining = Math.abs(key === 'd' || key === 'a' ? dx : dz);
    // A near target needs a brief held frame. The main movement handler can
    // accept several source steps during 100 ms, overshooting narrow waypoints
    // forever even though the same physical route is entirely traversable.
    const ms = Math.max(24, Math.min(500, remaining / .5 * Math.max(20, interval) * .35));
    const before = await position();
    await hold(key, ms); await sleep(65); iterations++;
    const after = await position();
    still = Math.hypot(after.x - before.x, after.y - before.y) < .001 ? still + 1 : 0;
    if (still >= 6) throw new Error(`Held ${key} blocked toward ${JSON.stringify(target)} at ${JSON.stringify(at)}: ${JSON.stringify(await page.evaluate(() => ({ why: window.__probe.why(), source: window.__probe.chunkSurf(), at: window.__probe.pos() })))}`);
    if (Date.now() - previousLog >= 10000) {
      previousLog = Date.now();
      console.log('PROGRESS', JSON.stringify({ target: target.id, at: await local(), key, seconds: (Date.now() - begun) / 1000 }));
    }
  }
  throw new Error(`Timed out walking to ${JSON.stringify(target)} at ${JSON.stringify(await local())}`);
}
async function choose(id) {
  for (let n = 0; n < 100; n++) {
    const view = await sceneView(), options = view?.pending?.options || [];
    if (options.some(option => typeof option.id === 'string')) {
      const index = options.findIndex(option => option.id === id);
      assert.ok(index >= 0, `choice ${id} missing from actual ${await top()}: ${JSON.stringify(options)}`);
      for (let i = 0; i < (index - (view.pending.index || 0) + options.length) % options.length; i++) await press('ArrowDown');
      await press('Enter'); return;
    }
    assert.ok((await top())?.startsWith('source-contact:'), `contact dialogue ended before ${id}`);
    await press('Enter');
  }
  throw new Error(`Choice ${id} never arrived`);
}
async function reachOptions(id) {
  for (let n = 0; n < 100; n++) {
    const view = await sceneView(), options = view?.pending?.options || [];
    if (options.some(option => typeof option.id === 'string')) {
      assert.ok(options.some(option => option.id === id), `${id} not offered: ${JSON.stringify(options)}`);
      return view;
    }
    await press('Enter');
  }
  throw new Error(`Options ${id} never arrived`);
}
async function finishContact() {
  for (let n = 0; n < 100 && (await top())?.startsWith('source-contact:'); n++) await press('Enter');
  assert.ok(!(await top())?.startsWith('source-contact:'), 'terminal contact did not relinquish input');
  await clearSpeech();
}
async function meet() {
  await clearSpeech();
  await page.waitForFunction(() => window.__probe.chunkSurf().hush?.contactAvailable && window.__probe.presence()?.active,
    { timeout: 15000 });
  await page.evaluate(() => {
    const p = window.__probe, at = p.pos(), body = p.presence();
    p.lookAtWorld(Math.atan2(body.x - at.x, -(body.y - at.y)), 0);
  });
  await sleep(200); await clearSpeech(); await press('e');
  assert.ok((await top())?.startsWith('source-contact:'), `E did not open actual contact: ${await top()}`);
}

async function heldForwardTo(z, id, timeout = 110000) {
  await clearSpeech(); await aim(0, -.04);
  const start = await local(), begun = Date.now();
  const progress = setInterval(() => local().then(at => console.log('PROGRESS', JSON.stringify({
    target: id, at, seconds: (Date.now() - begun) / 1000,
  }))).catch(() => {}), 10000);
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(targetZ => {
      const p = window.__probe, s = p.chunkSurf(), at = p.pos();
      return (at.y - s.landscapeOrigin.y) * .5 <= targetZ;
    }, { timeout, polling: 'raf' }, z);
  } finally { clearInterval(progress); await page.keyboard.up('w'); }
  const end = await local();
  const record = { id, start, end, target: { x: 4, z }, seconds: (Date.now() - begun) / 1000, keys: ['w'], continuousHeldInput: true };
  routes.push(record); console.log('WALK', JSON.stringify(record));
  return evidence(id);
}

async function bumpFacadeFace({ id, key, start, bounds }) {
  await walkLocal({ id: `${id}-approach`, ...start }, { capture: false });
  await clearSpeech(); await aim(0, -.035);
  const approach = await local(); await hold(key, 1200);
  const settled = await position(); await hold(key, 700);
  const after = await position();
  const step = await page.evaluate(key => window.__probe.sourceStepInfo(
    key === 'a' ? -1 : key === 'd' ? 1 : 0, key === 'w' ? -1 : key === 's' ? 1 : 0), key);
  const snapshot = await evidence(id);
  check(Math.hypot(after.x - settled.x, after.y - settled.y) < .001 && step?.move?.ok === false,
    `${id} physically blocks sustained input instead of admitting a wall ghost`,
    { approach, stopped: snapshot.localMetres, nextMove: step?.move, finalHeldSeconds: .7 });
  check(Math.abs(snapshot.bodyFloor - 4.2) < .15 && !snapshot.source.divide?.body?.falling,
    `${id} keeps the body supported at 4.2m`, snapshot.bodyFloor);
  if (bounds) check(snapshot.localMetres.x >= bounds.minX && snapshot.localMetres.x <= bounds.maxX &&
    snapshot.localMetres.z >= bounds.minZ && snapshot.localMetres.z <= bounds.maxZ,
  `${id} stops at the authored cutting extent`, snapshot.localMetres);
  return snapshot;
}

async function verifyFacade() {
  const dock = await evidence('facade-00-dock');
  check(dock.source.landing?.void?.sceneDock, 'facade route starts inside the actual remembered room');
  const shore = dock.source.landing.shore, o = shore.originMetres, lift = shore.lift;
  const liftLocal = { minX: lift.minX - o.x, maxX: lift.maxX - o.x,
    minZ: lift.minZ - o.z, maxZ: lift.maxZ - o.z, top: lift.top,
    speed: lift.speed, boardingSeconds: lift.boardingSeconds, callRadius: lift.callRadius };
  check(JSON.stringify(liftLocal) === JSON.stringify({ minX: 0, maxX: 8, minZ: -386, maxZ: -382,
    top: 4.2, speed: .7, boardingSeconds: .8, callRadius: 34 }),
  'live lift dimensions, rise, speed, boarding and call radius retain the existing contract', liftLocal);
  check(SOURCE_HANGING_SHORE.walkMetresPerSecond === 4.8, 'ordinary shore pace remains 4.8 metres per second');
  await walkLocal({ id: 'facade-door-approach', x: 4, z: -6.5 }, { capture: false });
  await clearSpeech(); await aim(0, -.035); await press('e'); await sleep(850);
  await walkLocal({ id: 'facade-outside-door', x: 4, z: -9.5 }, { capture: false });
  await page.evaluate(() => {
    const frames = window.__sourceFacadeFrames = { active: true, last: null, lastSample: 0, samples: [] };
    function collect(now) {
      if (!frames.active) return;
      if (now - frames.lastSample >= 100) {
        const p = window.__probe, at = p.pos(), s = p.chunkSurf(), shore = s.landing?.shore;
        frames.samples.push({ t: now, dt: frames.last == null ? null : now - frames.last,
          x: at.x, y: at.y, floor: s.divide?.active ? s.divide.body.feet : shore?.bodyFloor ?? p.floorH?.(),
          supportFloor: s.divide?.active ? s.divide.support?.floor : null,
          liftPhase: shore?.lift?.phase, liftFloor: shore?.lift?.floor, boarded: shore?.lift?.boarded,
          firstLiftCompleted: s.firstLiftCompleted });
        frames.lastSample = now;
      }
      frames.last = now; requestAnimationFrame(collect);
    }
    requestAnimationFrame(collect);
  });
  await torch(false);
  // A real approach keeps the new silhouette tied to the unchanged 374m shore.
  // No preset/warp skips the call, descent, boarding or rise of this lift.
  const below = await heldForwardTo(-340, 'facade-below-bank');
  check(below.source.landing.shore.outside && below.bodyFloor < .1 && !below.source.firstLiftCompleted,
    'below-bank approach remains on the lower plane before Source is revealed');
  const authoredPieces = sourceStrataGeometry().map(piece => ({ id: piece.id, triangles: piece.i.length / 3 }));
  check(below.source.landing.shore.facade === 'exposed-strata' && below.shoreRender?.active &&
    JSON.stringify(below.shoreRender?.strata) === JSON.stringify(authoredPieces) && authoredPieces.length === 27,
  'actual shore renderer submits all twenty-seven shared geological pieces', below.shoreRender);
  await aim(0, .12); await evidence('facade-below-bank-silhouette');
  await walkLocal({ id: 'facade-lift-call', x: 4, z: -351 }, { capture: false });
  const lowering = await evidence('facade-lowering');
  check(lowering.source.landing.shore.lift.phase === 'lowering' && lowering.source.landing.shore.lift.floor < 4.2,
    'ordinary held approach calls the unchanged lift down', lowering.source.landing.shore.lift);
  await page.waitForFunction(() => {
    const lift = window.__probe.chunkSurf().landing?.shore?.lift;
    return lift?.phase === 'waiting' && lift.floor < .001;
  }, { timeout: 12000 });
  await evidence('facade-lift-waiting');
  await clearSpeech(); await aim(0, -.035); await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => {
      const l = window.__probe.chunkSurf().landing?.shore?.lift;
      return l?.boarded && l.phase === 'rising' && l.floor > .05;
    }, { timeout: 20000, polling: 'raf' });
  } finally { await page.keyboard.up('w'); }
  const rising = await evidence('facade-rising');
  check(rising.source.landing.shore.lift.boarded && rising.bodyFloor > .05 && rising.bodyFloor < 4.2,
    'ordinary W boards and rises on the physical deck', rising.bodyFloor);
  check((await page.evaluate(() => window.__probe.sourceStepInfo(0, 0)))?.frame?.locksMovement === false,
    'the rising lift retains the ordinary unlocked movement controller');
  await page.waitForFunction(() => window.__probe.chunkSurf().landing?.shore?.lift?.phase === 'upper', { timeout: 12000 });
  const upper = await evidence('facade-upper-deck');
  check(Math.abs(upper.bodyFloor - 4.2) < .05 && Math.hypot(upper.position.x - rising.position.x, upper.position.y - rising.position.y) < .001,
    'the lift gains its real 4.2m elevation without planar relocation', { rising: rising.position, upper: upper.position, floor: upper.bodyFloor });
  check(!upper.source.firstLiftCompleted, 'lift height alone does not release Source proper');
  check(JSON.stringify(below.source.landing.shore.bank) === JSON.stringify(upper.source.landing.shore.bank),
    'the new bank remains fixed while only the lift moves');

  await walkLocal({ id: 'facade-receiving-ledge', x: 4, z: -388 });
  const front = await bumpFacadeFace({ id: 'facade-west-front-cut', key: 'w', start: { x: 4, z: -388 },
    bounds: { minX: 3, maxX: 5, minZ: -390, maxZ: -388.5 } });
  check(!front.source.firstLiftCompleted, 'walking into the closed course cannot prematurely reveal Source');
  for (const point of [
    { id: 'facade-ledge-return', x: 4, z: -388 },
    { id: 'facade-cleft-mouth', x: 10, z: -388 },
    { id: 'facade-cleft-sky', x: 10, z: -392 },
    { id: 'facade-cleft-open', x: 4, z: -396 },
  ]) {
    const at = await walkLocal(point);
    check(Math.abs(at.bodyFloor - 4.2) < .15, `${point.id} remains supported at 4.2m`, at.bodyFloor);
    if (point.id === 'facade-cleft-sky') {
      const cell = await page.evaluate(() => { const p = window.__probe, at = p.pos(); return p.sourceCell(at.x, at.y); });
      check(cell?.physical?.ceil - at.bodyFloor > 35, 'cleft centre has open vertical physical clearance', cell);
      const skyHit = sourceStrataRaycast([at.localMetres.x, at.bodyFloor + 1.62, at.localMetres.z], [0, 1, 0]);
      const mouthHit = sourceStrataRaycast([10, 5.82, -389], [0, 0, -1]);
      check(skyHit === null && /^strata-cut-tongue-/.test(mouthHit?.id),
        'shared rendered triangles keep the cleft open to sky while the oblique tongue veils the straight sightline', { skyHit, mouthHit });
      await aim(Math.PI, .65); await evidence('facade-cleft-sky-up');
    }
  }
  await bumpFacadeFace({ id: 'facade-west-inner-cut', key: 'a', start: { x: 4, z: -396 },
    bounds: { minX: 1.5, maxX: 4, minZ: -396.5, maxZ: -395.5 } });
  await bumpFacadeFace({ id: 'facade-east-inner-cut', key: 'd', start: { x: 20, z: -396 },
    bounds: { minX: 20, maxX: 22.7, minZ: -396.5, maxZ: -395.5 } });
  await walkLocal({ id: 'facade-cleft-return', x: 4, z: -396 }, { capture: false });
  const joined = await walkLocal({ id: 'facade-joined-braided', x: 4, z: -399 });
  check(joined.source.firstLiftCompleted && joined.source.landing.shore.proper &&
    joined.source.divide?.active && Math.abs(joined.bodyFloor - 4.2) < .15,
  'the broad cleft joins Braided Divide continuously on its 4.2m floor');
  check(JSON.stringify(joined.shoreRender?.strata) === JSON.stringify(authoredPieces),
    'the physical geological bank remains drawn after the walked reveal');
  await torch(false); await evidence('facade-cleft-torch-off');
  await torch(true); await evidence('facade-cleft-torch-on');
  const fixed = await position(); await aim(Math.PI, .06); await clearSpeech();
  await evidence('facade-look-back');
  const looked = await position();
  check(Math.hypot(looked.x - fixed.x, looked.y - fixed.y) < .001, 'looking back at the cutting keeps the same physical body position');
  const values = await page.evaluate(() => { window.__sourceFacadeFrames.active = false; return window.__sourceFacadeFrames.samples; });
  snapshots.facadeFrames = frameSummary(values);
  snapshots.facadeSamples = values;
  const phases = [...new Set(values.map(value => value.liftPhase))];
  check(['lowering', 'waiting', 'boarding', 'rising', 'upper'].every(phase => phases.includes(phase)),
    'live frame samples observed the unchanged lift sequence', phases);
  check(snapshots.facadeFrames.maxPlanarStepCells < 5 && snapshots.facadeFrames.maxFloorStepMetres < .5,
    'the facade approach, lift and cleft contain no hidden body relocation', snapshots.facadeFrames);
  const missedReleases = values.filter(value => value.floor >= 4.1 && !value.firstLiftCompleted &&
    sourceStrataEntryAt((value.x - dock.source.landscapeOrigin.x) * .5, (value.y - dock.source.landscapeOrigin.y) * .5));
  check(missedReleases.length === 0, 'the supported physical sightline releases Source without an additional walking quota', missedReleases);
  check(errors.length === 0, 'facade traversal has no JavaScript, shader, or WebGL context errors', errors);
}

async function verifyRevealEdges() {
  // The main route sampler has stopped. This distinct disposable checkpoint
  // tests free walking at the early western sightline rather than teleporting
  // within, or appending a discontinuity to, the physical facade route.
  await page.evaluate(() => window.__probe.sourcePreset('first-lift'));
  await clearSpeech(); await sleep(350);
  const before = await evidence('facade-west-edge-checkpoint', false);
  check(!before.source.firstLiftCompleted && Math.abs(before.bodyFloor - 4.2) < .1,
    'western sightline test starts on the unrevealed physical receiving ledge');
  await page.evaluate(() => {
    window.__sourceStrataEdgeSamples = [];
    window.__sourceStrataEdgeTimer = setInterval(() => {
      const p = window.__probe, at = p.pos(), s = p.chunkSurf();
      window.__sourceStrataEdgeSamples.push({ x: at.x, y: at.y,
        floor: s.divide?.active ? s.divide.body.feet : s.landing?.shore?.active ? s.landing.shore.bodyFloor : p.floorH(),
        falling: !!(s.divide?.active && s.divide.body.falling),
        firstLiftCompleted: s.firstLiftCompleted, proper: s.landing?.shore?.proper });
    }, 65);
  });
  for (const point of [
    { id: 'facade-west-edge-ledge', x: 4, z: -388 },
    { id: 'facade-west-edge-mouth-line', x: 7, z: -388 },
  ]) await walkLocal(point, { capture: false });
  const revealed = await walkLocal({ id: 'facade-west-early-reveal', x: 7, z: -390.5 });
  const sightline = sourceStrataRaycast([revealed.localMetres.x, revealed.bodyFloor + 1.62, revealed.localMetres.z], [0, 0, -1]);
  check(sightline === null && revealed.source.firstLiftCompleted && revealed.source.landing.shore.proper &&
    Math.abs(revealed.bodyFloor - 4.2) < .1,
  'walking the clear western mouth releases Source without a late field pop',
  { position: revealed.localMetres, firstLiftCompleted: revealed.source.firstLiftCompleted, proper: revealed.source.landing.shore.proper, sightline });
  const returned = await walkLocal({ id: 'facade-west-return', x: 7, z: -389.5 });
  check(returned.source.firstLiftCompleted && returned.source.landing.shore.active &&
    !returned.source.landing.shore.proper && Math.abs(returned.bodyFloor - 4.2) < .1,
  'walking back across the same sightline restores shore control without losing elevation',
  { position: returned.localMetres, floor: returned.bodyFloor, active: returned.source.landing.shore.active });
  const samples = snapshots.releaseEdgeSamples = await page.evaluate(() => {
    clearInterval(window.__sourceStrataEdgeTimer); return window.__sourceStrataEdgeSamples;
  });
  const summary = frameSummary(samples);
  check(samples.some(value => !value.firstLiftCompleted) && samples.some(value => value.firstLiftCompleted) &&
    samples.every(value => !value.falling && Math.abs(value.floor - 4.2) < .1) &&
    summary.maxPlanarStepCells < 5,
  'western release and return preserve continuous body support without relocation', summary);
}

async function verifyFacadeOptics() {
  await walkLocal({ id: 'optical-joined-braided', x: 4, z: -399 }, { capture: false });
  await aim(Math.PI, .06); await sleep(700);
  const fixed = await position();
  await torch(false); const off = await evidence('facade-look-back-torch-off');
  await torch(true); const on = await evidence('facade-look-back');
  check(on.source.landing.shore.proper && on.source.divide.active && Math.abs(on.bodyFloor - 4.2) < .1 &&
    Math.hypot(on.localMetres.x - 4, on.localMetres.z + 399) < .1 &&
    Math.hypot(on.position.x - fixed.x, on.position.y - fixed.y) < .001 &&
    on.look.yaw === Math.PI && on.look.pitch === .06,
  'matched bank optics capture keeps the actual body at (4,-399) and original lookback angle');
  if (!capturesAvailable) return;
  const sharp = (await import('sharp')).default;
  async function pixels(path, exposure = 1) {
    const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const areas = { full: { pixels: 0, nearWhite: 0, luminanceSum: 0 }, rightBank: { pixels: 0, nearWhite: 0, luminanceSum: 0 } };
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const n = (y * info.width + x) * info.channels;
      const luminance = (data[n] * .2126 + data[n + 1] * .7152 + data[n + 2] * .0722) * exposure;
      for (const area of [areas.full, ...(x >= info.width * .55 && y < info.height * .75 ? [areas.rightBank] : [])]) {
        area.pixels++; area.luminanceSum += luminance; if (luminance >= 240) area.nearWhite++;
      }
    }
    return { width: info.width, height: info.height, exposure,
      ...Object.fromEntries(Object.entries(areas).map(([name, value]) => [name, {
        nearWhitePixels: value.nearWhite, nearWhiteFraction: value.nearWhite / value.pixels,
        meanLuminance: value.luminanceSum / value.pixels,
      }])) };
  }
  const baseline = process.env.SOURCE_BRAIDED_OPTICAL_BASELINE || join(dirname(out), 'normal', 'facade-look-back-scene.png');
  const finalBaseline = baseline.replace(/-scene\.png$/, '.png');
  const comparison = snapshots.opticalComparison = {
    baseline, scene: { before: await pixels(baseline, 8), after: await pixels(join(out, 'facade-look-back-scene.png'), 8) },
    final: { before: await pixels(finalBaseline), after: await pixels(join(out, 'facade-look-back.png')) },
    note: 'The scene target precedes the Source recording pass. Its near-white estimate applies the matched recording exposure of 8; final PNG counts measure displayed luminance directly. The right-bank region is x>=55%, y<75%.',
  };
  check(comparison.final.after.rightBank.nearWhitePixels < comparison.final.before.rightBank.nearWhitePixels &&
    comparison.scene.after.rightBank.nearWhitePixels < comparison.scene.before.rightBank.nearWhitePixels,
  'matched bank highlight shoulder reduces the near-white right-face area in scene and final output', comparison);
  check(off.torchOn === false && on.torchOn === true, 'matched bank views include actual torch off and on states');
}

function frameSummary(samples) {
  const frameTimes = samples.map(sample => sample.dt).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = p => frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * p))] || null;
  let maxPlanarStepCells = 0, maxFloorStepMetres = 0, maxSupportGapMetres = 0;
  for (const sample of samples) if (Number.isFinite(sample.supportFloor)) maxSupportGapMetres = Math.max(maxSupportGapMetres, sample.floor - sample.supportFloor);
  for (let i = 1; i < samples.length; i++) {
    maxPlanarStepCells = Math.max(maxPlanarStepCells, Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
    maxFloorStepMetres = Math.max(maxFloorStepMetres, Math.abs(samples[i].floor - samples[i - 1].floor));
  }
  return { samples: samples.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxFrameMs: frameTimes.at(-1), maxPlanarStepCells, maxFloorStepMetres, maxSupportGapMetres };
}

async function run() {
  const authored = await import('../../src/data/source-braided-divide.js');
  const authoredRoute = authored.SOURCE_BRAIDED_REVIEW_WALK;
  assert.ok(Array.isArray(authoredRoute) && authoredRoute.length >= 8, 'Braided Divide review walk must supply concrete local-metre waypoints');
  const roles = { reveal: 'reveal', 'west-ramp-foot': 'ascent-foot', 'west-ramp-head': 'ascent-top',
    'case-over': 'crossing-over', 'case-under': 'crossing-under' };
  const reviewRoute = [
    { id: '01-ledge-to-entry', x: 10, z: -388, floor: 4.2 },
    { id: '02-entry-passage', x: 10, z: -392, floor: 4.2 },
    ...authoredRoute.flatMap(point => point.id === 'reveal' ? [
      { ...point, x: 4, z: -396, role: 'reveal' },
      { id: 'cleft-to-braided', x: 4, z: -399, floor: 4.2 },
    ] : [{ ...point, role: roles[point.id] || point.role }]),
  ];
  browser = await puppeteer.launch({
    executablePath: process.env.SOURCE_BRAIDED_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.SOURCE_BRAIDED_HEADFUL !== '1', protocolTimeout: 120000,
    args: [`--use-angle=${process.env.SOURCE_BRAIDED_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader')}`,
      '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disk-cache-size=1048576', '--media-cache-size=1048576'],
  });
  page = await browser.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(message.text())) errors.push(message.text()); });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  const url = new URL(base);
  for (const [key, value] of Object.entries({ nodisplaynotice: '1', skipwarn: '1', nomic: '1', sam: '0', nothink: '1' })) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(async (reduced, mode) => {
    const p = window.__probe;
    await p.testRun(); p.tutSkip();
    if (p.settings().shake !== (reduced ? 'reduced' : 'full')) window.__chunkSurferDesktopMenu?.dispatch({ id: 'reduce_motion', checked: reduced });
    if (p.settings().flash !== (reduced ? 'off' : 'full')) p.apparitionEffects(reduced ? 'off' : 'full');
    p.setObjectiveHints('full');
    window.__chunkSurferPixelMesh?.setAccessibility({ reduceMotion: reduced, reduceFlash: reduced });
    p.propDiagnostics(true); p.sourcePreset(mode === 'facade' ? 'landing' : 'first-lift');
  }, reduced, mode);
  await clearSpeech(); await aim(); await sleep(450);
  const settings = await page.evaluate(() => window.__probe.settings());
  check(settings.shake === (reduced ? 'reduced' : 'full') && settings.flash === (reduced ? 'off' : 'full'), 'requested live motion and flash settings applied', settings);
  if (mode === 'facade') { await verifyFacade(); return; }
  const ledge = await evidence('00-upper-ledge', mode !== 'optical');
  check(!ledge.source.firstLiftCompleted, 'upper lift ledge has not prematurely revealed Source proper');
  check(Math.abs(ledge.floor - 4.2) < .1, 'checkpoint is standing on actual receiving ledge', ledge.floor);
  await page.evaluate(() => {
    const frames = window.__sourceBraidedFrames = { active: true, last: null, lastSample: 0, samples: [] };
    function collect(now) {
      if (frames.active && frames.samples.length < 18000 && now - frames.lastSample >= 65) {
        const p = window.__probe, at = p.pos(), source = p.chunkSurf();
        frames.samples.push({ t: now, dt: frames.last == null ? null : now - frames.last,
          x: at.x, y: at.y, floor: source.divide?.body?.feet ?? p.floorH?.() ?? p.sourceCell(at.x, at.y)?.physical?.floor ?? 0,
          supportFloor: source.divide?.active ? source.divide?.support?.floor : null,
          falling: !!source.divide?.body?.falling,
          phase: source.phase, firstLiftCompleted: source.firstLiftCompleted });
        frames.lastSample = now;
      }
      frames.last = now; requestAnimationFrame(collect);
    }
    requestAnimationFrame(collect);
  });

  // The route below is supplied by the authored data module, in local metres.
  // Keep rendered/body route assertions beside these concrete milestones.
  const milestones = {};
  for (const point of reviewRoute) {
    assert.ok(typeof point.id === 'string' && Number.isFinite(point.x) && Number.isFinite(point.z), 'invalid authored review waypoint');
    await walkLocal(point, { capture: mode !== 'optical' });
    const snapshot = snapshots[point.id] || await evidence(point.id, false);
    if (point.role) milestones[point.role] = snapshot;
    if (Number.isFinite(point.floor)) check(Math.abs(snapshot.floor - point.floor) < .3, `${point.id} has its physical authored elevation`, { expected: point.floor, actual: snapshot.floor });
    if (point.id === '02-entry-passage') check(!snapshot.source.firstLiftCompleted, 'walking into the opaque entry passage has not revealed Source before the turn');
    if (point.role === 'reveal') {
      check(snapshot.source.firstLiftCompleted && snapshot.source.landing?.shore?.proper, 'walked opaque turn reveals Source proper without relocation');
      check((snapshot.props || []).some(prop => /braid|divide/i.test(prop.id)), 'actual renderer receives Braided Divide geometry');
      check(snapshot.pack?.renderedIds?.some(id => id.startsWith('source-divide-')) &&
        snapshot.pack?.pack?.diagnostics?.visibleMaterialRoles?.includes('source-divide'),
      'actual prop draw submits finite Braided Divide masonry with its material');
      check(snapshot.roomMemories?.survivors?.filter(prop => prop.id.startsWith('divide-')).length === 19 &&
        snapshot.roomMemories?.fixtures?.filter(prop => prop.id.startsWith('divide-')).length === 5,
      'actual Source frame retains all nineteen room survivors and their five fixtures',
      { survivors: snapshot.roomMemories?.survivors?.length, fixtures: snapshot.roomMemories?.fixtures?.length });
      if (mode === 'optical') { await verifyFacadeOptics(); break; }
      await torch(false); const off = await evidence('torch-off');
      off.propImage = await propImageStats();
      await torch(true); const on = await evidence('torch-on');
      on.propImage = await propImageStats();
      check(off.propImage && on.propImage && off.propImage.hash !== on.propImage.hash,
        'torch off/on captures differ in the actual prop render at the same view', { off: off.propImage, on: on.propImage });
      const at = await position(); await aim(Math.PI, -.08); await evidence('look-back-to-shore');
      check(Math.hypot((await position()).x - at.x, (await position()).y - at.y) < .001, 'turning back keeps the physical body fixed');
      await aim(0, -.04);
      const beforeLook = await page.evaluate(() => window.__probe.lookAngles());
      await page.mouse.click(720, 450); await sleep(180);
      await page.mouse.move(900, 430, { steps: 8 }); await sleep(200);
      const afterLook = await page.evaluate(() => window.__probe.lookAngles());
      check(Math.abs(afterLook.yaw - beforeLook.yaw) > .001, 'ordinary mouse look can turn within Source proper', { before: beforeLook, after: afterLook });
      if (mode !== 'full') break;
    }
  }

  if (mode === 'full') {
  assert.ok(milestones['ascent-foot'] && milestones['ascent-top'], 'review route must exercise the modelled ascent');
  check(milestones['ascent-top'].floor - milestones['ascent-foot'].floor > 2, 'held movement climbs the authored three-dimensional ascent',
    { foot: milestones['ascent-foot'].floor, top: milestones['ascent-top'].floor });
  assert.ok(milestones['crossing-over'] && milestones['crossing-under'], 'review route must traverse both crossing levels');
  for (const id of ['case', 'piano']) {
    const over = snapshots[`${id}-over`], under = snapshots[`${id}-under`];
    assert.ok(over && under, `${id} must be crossed at both levels`);
    check(Math.hypot(over.localMetres.x - under.localMetres.x, over.localMetres.z - under.localMetres.z) < .7 && over.bodyFloor - under.bodyFloor > 2,
      `${id} crossing is physically traversed over and under at the same x/z`,
      { over: { ...over.localMetres, floor: over.bodyFloor }, under: { ...under.localMetres, floor: under.bodyFloor } });
    check(over.source.divide?.support?.kind === 'model', `${id} over crossing is supported by the actual instrument mesh`, over.source.divide?.support);
    check(over.pack?.renderedIds?.some(renderedId => renderedId.startsWith(`divide-${id}-crossing-`)),
      `${id} native model is actually drawn at the crossing`, over.pack?.pack?.diagnostics);
  }

  const doorBefore = await page.evaluate(() => ({ source: window.__probe.chunkSurf(), door: window.__probe.edgeDoor() }));
  check(doorBefore.source.sourceContacts.captures === 0 && doorBefore.source.contact.captures === 0, 'entire braided route reaches grey doors without talking', doorBefore.source.contact);
  await aim(0, -.02); await clearSpeech(); await press('e'); await sleep(650);
  const opened = await evidence('grey-door-opened');
  check(await page.evaluate(() => !!window.__probe.edgeDoor()?.passable), 'actual E opens usable grey doors with zero talks');
  const threshold = doorBefore.door?.threshold;
  assert.ok(threshold?.length === 2, 'grey-door plane is available');
  const o = opened.source.landscapeOrigin;
  await walkLocal({ id: 'grey-door-crossed', x: ((threshold[0].x + threshold[1].x) / 2 - o.x) * .5,
    z: (threshold[0].y - o.y) * .5 - 2.5 });
  check(await page.evaluate(() => window.__probe.chunkSurf().phase === 'horizon'), 'held movement physically crosses grey door into the outskirts without a talk quota');
  await page.evaluate(() => { window.__sourceBraidedFrames.active = false; });
  const samples = await page.evaluate(() => window.__sourceBraidedFrames.samples);
  snapshots.routeFrames = frameSummary(samples);
  await writeFile(join(out, 'route-samples.json'), JSON.stringify(samples));
  check(snapshots.routeFrames.maxPlanarStepCells < 5, 'walked route has no hidden planar relocation', snapshots.routeFrames);
  check(snapshots.routeFrames.maxFloorStepMetres < .8 && snapshots.routeFrames.maxSupportGapMetres <= .45,
    'walked ascent and descent keep ordinary-step support within the vertical clock', snapshots.routeFrames);
  check(routes.some(route => route.keys.includes('d')) && routes.some(route => route.keys.includes('a')) && routes.some(route => route.keys.includes('s')), 'route includes real lateral movement and retreat');
  } else {
    await page.evaluate(() => { window.__sourceBraidedFrames.active = false; });
    if (mode === 'visual' || mode === 'optical') {
      if (revealEdges) await verifyRevealEdges();
      check(errors.length === 0, 'no JavaScript, shader, or WebGL context errors', errors); return;
    }
  }

  // A separate checkpoint tests consent and actual combat without rewriting the
  // movement evidence or spending three conversations to make a choice exist.
  await page.evaluate(() => window.__probe.sourcePreset('first-contact'));
  await clearSpeech(); await sleep(600);
  const contactBefore = await evidence('contact-before');
  check(contactBefore.source.contact.captures === 0, 'fresh contact starts with zero conversations');
  await meet(); await choose('contact.warning');
  await reachOptions('contact.confirm');
  const warning = await evidence('contact-explicit-warning');
  check((await top())?.startsWith('source-contact:') && warning.source.phase === 'landscape', 'warning presents explicit confirm and leaves the world uncommitted');
  check(/fight[\s\S]*retreat[\s\S]*die/i.test(JSON.stringify(warning.sceneView?.history)) &&
    warning.sceneView?.pending?.options?.[0]?.id === 'contact.lower-hand', 'actual warning states fight, no retreat and death with a safe default');
  await choose('contact.lower-hand'); await reachOptions('contact.warning');
  await choose('contact.warning'); await reachOptions('contact.leave-warning');
  await choose('contact.leave-warning'); await finishContact();
  const declined = await evidence('contact-withdrawn');
  check(declined.source.phase === 'landscape' && !declined.source.finale.route &&
    declined.source.attempts === contactBefore.source.attempts &&
    Math.hypot(declined.position.x - contactBefore.position.x, declined.position.y - contactBefore.position.y) < .001,
  'lowering the hand and walking away spends no retry, movement, or route commitment');
  await meet(); await choose('contact.warning'); await reachOptions('contact.confirm');
  await choose('contact.confirm'); await finishContact();
  await page.waitForFunction(() => window.__scenes?.top()?.id === 'battle:source-final', { timeout: 15000 });
  const committed = await evidence('contact-confirmed-battle');
  check(committed.scene === 'battle:source-final', 'explicit warned keyboard confirmation starts actual Source combat');
  check(errors.length === 0, 'no JavaScript, shader, or WebGL context errors', errors);
}

try {
  await run();
  assert.ok(checks.every(result => result.passed), 'one or more live checks failed; see report.json');
  assert.equal(captureErrors.length, 0, 'artifact capture failed; functional checks continued and are preserved in report.json');
} catch (error) {
  failure = String(error?.stack || error); process.exitCode = 1; console.error(failure);
  if (page) await evidence('failure').catch(() => {});
} finally {
  // Closing the owned browser also removes its disposable profile. Do this
  // before writing the compact proof so a full cache cannot strand the report.
  if (browser) await browser.close();
  await writeFile(join(out, 'report.json'), JSON.stringify({ passed: failure === null, failure,
    scope: 'Chromium through the actual running game; authored first-lift and contact checkpoints, held WASD, actual E/F and dialogue keys. No warps or synthetic onStep progression. Screenshots include actual renderer stages. This is not a full Source playthrough or native OS-window acceptance.',
    settings: { base, reduced, mode, revealEdges, headless: process.env.SOURCE_BRAIDED_HEADFUL !== '1' }, checks, errors, captureErrors, routes, snapshots,
  }));
  console.log(`REPORT ${join(out, 'report.json')}`);
}
