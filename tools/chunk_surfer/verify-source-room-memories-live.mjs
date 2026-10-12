// Actual Chromium/Metal validation of Source's room memories. No shader or
// production module substitution. Start a stable server separately.
// SOURCE_ROOMS_BASE=http://127.0.0.1:5297 node tools/chunk_surfer/verify-source-room-memories-live.mjs
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const base = process.env.SOURCE_ROOMS_BASE || 'http://127.0.0.1:5297/';
const out = resolve(process.env.SOURCE_ROOMS_OUT || 'artifacts/source-room-memories');
const baselineOnly = process.env.SOURCE_ROOMS_BASELINE === '1';
const bootOnly = process.env.SOURCE_ROOMS_BOOT_ONLY === '1';
const quick = process.env.SOURCE_ROOMS_QUICK === '1';
const fixtureQuick = process.env.SOURCE_ROOMS_FIXTURES_QUICK === '1';
const exposureValues = (process.env.SOURCE_ROOMS_EXPOSURES || '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
const modes = bootOnly || quick || fixtureQuick || exposureValues.length ? [] : process.env.SOURCE_ROOMS_MODES?.split(',') || ['normal', 'reduced'];
const sleep = ms => new Promise(done => setTimeout(done, ms));
const files = [], captures = [], checks = [], errors = [], movement = [];
let browser, page, activeMode = '', failure = null, environment = null;
function recordError(error) {
  const prior = errors.find(entry => entry.mode === activeMode && entry.error === error);
  if (prior) { prior.count++; return; }
  errors.push({ mode: activeMode, error, count: 1 }); console.error('GPUERROR', error);
}
function check(passed, name, details) {
  checks.push({ passed: !!passed, name, mode: activeMode, ...(details === undefined ? {} : { details }) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${activeMode} ${name}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`);
}
async function aim(yaw = 0, pitch = 0) {
  await page.evaluate(v => window.__probe.lookAtWorld(v.yaw, v.pitch), { yaw, pitch });
  await sleep(450);
}
async function torch(on) {
  if (await page.evaluate(() => !!window.__probe.rec().light) !== on) await page.keyboard.press('f');
  await sleep(220);
}
async function hold(key, ms) {
  await page.keyboard.down(key);
  try { await sleep(ms); } finally { await page.keyboard.up(key); }
  await sleep(200);
}
async function waitFixtureOn(id) {
  await page.waitForFunction(id => {
    const p = window.__probe, light = p.sourceLights().lights.find(l => l.anchorPropId === id);
    return light?.intensity > .1 && p.r3dLighting().lights.some(l => l.emergency === 1 && l.intensity > .1);
  }, { timeout: 10000 }, id);
}
async function exposureCapture(name) {
  for (const exposure of exposureValues) {
    await page.evaluate(value => { window.__probe.captureExposure(value); window.__chunkSurferPixelMesh.resetMemory(); }, exposure);
    await sleep(850);
    const capture = await evidence(`${name}-exposure-${exposure}`, { stages: exposure === exposureValues[0] });
    checkAcquisition(capture);
    if (name.startsWith('doors-')) checkDoors(capture);
  }
}
async function preset(id, { yaw = 0, pitch = 0, warp = null } = {}) {
  await page.evaluate(({ id, warp }) => {
    const p = window.__probe; p.sourcePreset(id);
    if (warp === 'door-row') { const at = p.edgeDoorApproach(); p.sourceWarp(at.x, at.y + 6); }
    else if (warp === 'lift-entry') { const at = p.pos(); p.sourceWarp(at.x + 18, at.y); }
    else if (warp === 'nothingness') { const o = p.chunkSurf().landscapeOrigin; p.sourceWarp(o.x + 8, o.y - 400); }
    else if (warp) p.sourceWarp(warp.x, warp.y);
  }, { id, warp });
  // Arrival's deferred facing reset must settle before choosing the camera.
  await sleep(1250); await torch(false); await aim(yaw, pitch);
}
async function memoryPose(entry, distance, targetHeight = 0, maxDistance = distance) {
  const pose = await page.evaluate(({ entry, distance, targetHeight, maxDistance }) => {
    const p = window.__probe;
    const candidates = [];
    // Large surviving instruments can occupy each cardinal approach. Search
    // the same radius, then only an explicitly permitted outward ring.
    for (let radius = distance; radius <= maxDistance + .001; radius += .5) {
      candidates.push([-radius, 0], [0, radius], [0, -radius], [radius, 0]);
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16;
        if (i % 8) candidates.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
    }
    let selected = null;
    for (const [dx, dz] of candidates) {
      p.sourceWarp((entry.x + dx) * 2, (entry.z + dz) * 2);
      const cell = p.sourceCell(p.pos().x, p.pos().y)?.physical;
      const steps = [[.5, 0], [-.5, 0], [0, .5], [0, -.5]].map(v => p.sourceStepInfo(...v));
      if (cell && p.sourceRoomMemories()?.active && steps.some(s => s?.move?.ok)) {
        selected = { dx, dz, requestedDistance: distance, actualDistance: Math.hypot(dx, dz), cell, steps }; break;
      }
    }
    if (!selected) throw new Error(`No open diagnostic viewpoint near ${entry.id}`);
    const eye = p.sourceLights().eye, dx = entry.x - eye.x, dz = entry.z - eye.z;
    return { ...selected, target: entry, yaw: Math.atan2(dx, -dz),
      pitch: Math.max(-.65, Math.min(.65, Math.atan2(entry.y + targetHeight - eye.y, Math.hypot(dx, dz)))) };
  }, { entry, distance, targetHeight, maxDistance });
  await sleep(650); await torch(false); await aim(pose.yaw, pose.pitch);
  return pose;
}
async function evidence(name, { stages = false } = {}) {
  const result = await page.evaluate(() => {
    const p = window.__probe, canvas = document.querySelector('canvas.r3d');
    if (!canvas) throw new Error('No actual game renderer canvas');
    return {
      webp: canvas.toDataURL('image/webp', .82), png: canvas.toDataURL('image/png'),
      width: canvas.width, height: canvas.height, position: p.pos(), camera: p.lookAngles(),
      torch: !!p.rec().light, source: p.chunkSurf(), scene: window.__scenes?.top()?.id,
      presence: p.presence(), body: p.hushBody?.(), lighting: p.r3dLighting?.(),
      lights: p.sourceLights?.(), props: p.sourceProps?.(), shore: p.sourceShoreView?.(),
      settings: p.settings(), pixelMesh: window.__chunkSurferPixelMesh?.status?.(),
      roomMemories: p.sourceRoomMemories?.() || null,
      roomRender: p.sourceRoomRender?.({ sample: true }) || null,
      power: p.power?.(), performance: p.performance?.(),
    };
  });
  const { webp, png, ...meta } = result;
  const prefix = `${activeMode}-${name}`;
  for (const [extension, data] of [['webp', webp], ['png', png]]) {
    const bytes = Buffer.from(data.split(',')[1], 'base64'), path = join(out, `${prefix}.${extension}`);
    files.push({ path, bytes });
    if (extension === 'webp') Object.assign(meta, { path, bytes: bytes.length });
  }
  if (stages) {
    for (const stage of ['props', 'scene', 'marks', 'openingMask', 'vfd']) {
      const data = await page.evaluate(stage => window.__probe.sourceShoreCapture(stage), stage);
      if (data) files.push({ path: join(out, `${prefix}-${stage}.png`), bytes: Buffer.from(data.split(',')[1], 'base64') });
    }
  }
  const capture = { name, mode: activeMode, ...meta }; captures.push(capture);
  console.log('CAPTURE', prefix, JSON.stringify({ position: meta.position, camera: meta.camera, torch: meta.torch, pixelMesh: meta.pixelMesh?.enabled, bytes: meta.bytes }));
  return capture;
}
function checkAcquisition(capture, { requireDerived = false } = {}) {
  const p = capture.pixelMesh;
  check(p?.enabled === true && p?.supported === true && p?.shaderReady === true && p?.bypassedByTextSpace === false,
    `${capture.name}: actual shared acquisition runs`, p && { enabled: p.enabled, supported: p.supported, shaderReady: p.shaderReady, bypassed: p.bypassedByTextSpace, frames: p.framesRendered, error: p.lastError });
  check(!p?.lastError && p?.lastGlError === 0, `${capture.name}: shared acquisition reports no GL error`, p && { error: p.lastError, glError: p.lastGlError });
  const r = capture.roomRender, s = r?.samples;
  check(r?.active === true && r?.acquisition === 'overworld-pixel-mesh' && r?.depthSource === 'current-prop-depth' && r?.finalIdentityPass === true,
    `${capture.name}: actual Source material/depth acquisition and final identities are active`, r && { active: r.active, acquisition: r.acquisition, depthSource: r.depthSource, marksSource: r.marksSource, finalIdentityPass: r.finalIdentityPass });
  check(s?.pixels > 0 && s.validDepth === s.pixels && s.surfaceDepth > 0 && s.glError === 0,
    `${capture.name}: acquisition contains valid depth and physical surfaces`, s && { pixels: s.pixels, validDepth: s.validDepth, surfaceDepth: s.surfaceDepth, packedDepthRange: s.packedDepthRange, glError: s.glError });
  check(r?.marksSource === 'current-prop-material-marks' && s?.derivedMarks + s?.sentinelMarks === s?.pixels && (!requireDerived || s.derivedMarks > 0),
    `${capture.name}: acquisition contains valid current material marks or their explicit sentinel`, s && { derived: s.derivedMarks, sentinel: s.sentinelMarks, requireDerived });
}
function checkDoors(capture) {
  const s = capture.roomRender?.samples;
  check(s?.doorCore > 0 && s.exactBlackCore === s.doorCore && s.finalNonBlackPixels > 0,
    `${capture.name}: final door cores remain exactly RGB000 after recording and torch`, s && { core: s.doorCore, exactBlack: s.exactBlackCore, finalNonBlackPixels: s.finalNonBlackPixels, sample: s.doorCoreSample });
}
function checkPressure(capture) {
  const p = capture.body?.projection;
  check(capture.presence?.active === true && p?.amount > .9 && p?.w > .02 && p?.h > .15 && p?.x > .25 && p?.x < .75 && p?.y > 0 && p?.y < 1,
    `${capture.name}: Pressure projects visibly into forward view`, p);
}

try {
  browser = await puppeteer.launch({
    executablePath: process.env.SOURCE_ROOMS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: .575 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  page.on('pageerror', error => recordError(String(error)));
  page.on('console', message => {
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost|GL_INVALID_OPERATION/i.test(message.text())) recordError(message.text());
  });
  const url = new URL(base);
  for (const [key, value] of Object.entries({ nodisplaynotice: '1', skipwarn: '1', nomic: '1', sam: '0', nothink: '1' })) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(async () => { await window.__probe.testRun(); window.__probe.tutSkip(); });
  environment = await page.evaluate(() => {
    const c = document.querySelector('canvas.r3d'), gl = c?.getContext('webgl2'), info = gl?.getExtension('WEBGL_debug_renderer_info');
    return { url: location.href, userAgent: navigator.userAgent, devicePixelRatio,
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
      vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : null,
      resources: performance.getEntriesByType('resource').map(e => e.name).filter(s => /\.(?:m?js)(?:[?#]|$)/.test(s)) };
  });
  if (bootOnly) {
    activeMode = 'bootstrap'; await sleep(1500);
    const status = await page.evaluate(() => window.__chunkSurferPixelMesh?.status?.());
    check(status?.supported && status?.shaderReady && !status?.lastError, 'ordinary GPU boot compiles shared recording programs', status);
  }
  if (quick) {
    activeMode = 'normal';
    for (const view of [
      { name: 'landing-off', preset: 'first-contact', yaw: 0 },
      { name: 'field-off', preset: 'all-insights', yaw: .7 },
      { name: 'doors-off', preset: 'final', yaw: .65, warp: 'door-row' },
    ]) {
      await preset(view.preset, view);
      const capture = await evidence(view.name, { stages: true });
      if (!baselineOnly) { checkAcquisition(capture); if (view.name === 'landing-off') checkPressure(capture); if (view.name === 'doors-off') checkDoors(capture); }
      await torch(true); const lit = await evidence(view.name.replace('-off', '-on'), { stages: true });
      if (!baselineOnly) { checkAcquisition(lit); if (view.name === 'landing-off') checkPressure(lit); if (view.name === 'doors-off') checkDoors(lit); }
    }
  }
  if (fixtureQuick) {
    activeMode = 'normal'; await preset('all-insights');
    const memories = await page.evaluate(() => window.__probe.sourceRoomMemories());
    const string = memories.fixtures.find(f => f.anchorId === 'source-hero-string-fall-2');
    const piano = memories.fixtures.find(f => f.anchorId === 'source-hero-piano-rise-0');
    await memoryPose(string, 12, -.8);
    for (const live of [false, true]) {
      await page.evaluate(({ circuit, live }) => window.__probe.setPower(circuit, live), { circuit: string.circuit, live }); await sleep(650);
      if (live) await waitFixtureOn(string.id);
      const capture = await evidence(`strings-circuit-${live ? 'on' : 'off'}`, { stages: true }); checkAcquisition(capture);
    }
    await memoryPose(piano, 8.5, -.8);
    const pianoOff = await evidence('piano-torch-off', { stages: true }); checkAcquisition(pianoOff);
    await torch(true); const pianoOn = await evidence('piano-torch-on', { stages: true }); checkAcquisition(pianoOn);
  }
  if (exposureValues.length) {
    activeMode = 'normal';
    await preset('all-insights', { yaw: .7 });
    await exposureCapture('field-off'); await torch(true); await exposureCapture('field-on');
    await preset('final', { warp: 'door-row', yaw: .65 });
    await exposureCapture('doors-off'); await torch(true); await exposureCapture('doors-on');
    await preset('all-insights');
    const memories = await page.evaluate(() => window.__probe.sourceRoomMemories());
    const string = memories.fixtures.find(f => f.anchorId === 'source-hero-string-fall-2');
    const piano = memories.fixtures.find(f => f.anchorId === 'source-hero-piano-rise-0');
    await memoryPose(string, 12, -.8);
    await page.evaluate(circuit => window.__probe.setPower(circuit, true), string.circuit); await sleep(650);
    await exposureCapture('strings-circuit-on');
    await memoryPose(piano, 8.5, -.8); await exposureCapture('piano-torch-off');
    await page.evaluate(() => window.__probe.captureExposure(null));
  }

  for (activeMode of modes) {
    const reduced = activeMode === 'reduced';
    await page.evaluate(reduced => {
      const p = window.__probe;
      if (p.settings().shake !== (reduced ? 'reduced' : 'full')) window.__chunkSurferDesktopMenu?.dispatch({ id: 'reduce_motion', checked: reduced });
      p.apparitionEffects(reduced ? 'off' : 'full');
      window.__chunkSurferPixelMesh?.setAccessibility({ reduceMotion: reduced, reduceFlash: reduced });
    }, reduced);
    if (!reduced) {
      await preset('first-lift', { warp: 'lift-entry', yaw: Math.PI + .5, pitch: -.12 });
      const lift = await evidence('first-lift-outward');
      check(!lift.source.firstLiftCompleted && lift.source.landing?.shore?.outside && !lift.source.landing.shore.proper,
        'first lift retains the concealed physical shore');
      check(lift.roomMemories?.active === false && lift.roomRender?.active === false, 'new room memories are gated outside the first lift');
      await torch(true); await evidence('first-lift-outward-on');
      await preset('first-lift', { warp: 'nothingness', yaw: 0, pitch: 0 });
      const empty = await evidence('nothingness-off');
      await torch(true); const emptyOn = await evidence('nothingness-on');
      check(empty.lighting.sourceEmergency === 0 && emptyOn.lighting.sourceEmergency === 0, 'nothingness has no emergency colour wash');
      check(!empty.source.firstLiftCompleted && !emptyOn.source.firstLiftCompleted, 'diagnostic lower-plane views do not enter Source proper');
      check(empty.roomMemories?.active === false && emptyOn.roomMemories?.active === false, 'first nothingness retains its separate physical presentation');
    }

    await preset('first-contact');
    const landing = await evidence('landing-off', { stages: !reduced });
    check(landing.settings.flash === (reduced ? 'off' : 'full') && landing.settings.shake === (reduced ? 'reduced' : 'full') && landing.pixelMesh.settings.reduceFlash === reduced && landing.pixelMesh.settings.reduceMotion === reduced,
      'actual accessibility state matches the requested capture mode', { flash: landing.settings.flash, shake: landing.settings.shake, recording: landing.pixelMesh.settings });
    if (!baselineOnly) { checkAcquisition(landing); checkPressure(landing); }
    await torch(true); const landingOn = await evidence('landing-on');
    if (!baselineOnly) { checkAcquisition(landingOn); checkPressure(landingOn); }
    if (!reduced) {
      await aim(Math.PI, 0); const returnWall = await evidence('landing-return-wall', { stages: true });
      if (!baselineOnly) checkAcquisition(returnWall);
      await aim(0, 0);
    }
    const before = await page.evaluate(() => ({ pos: window.__probe.pos(), source: window.__probe.chunkSurf() }));
    await hold('d', 650);
    const moved = await page.evaluate(() => ({ pos: window.__probe.pos(), source: window.__probe.chunkSurf() }));
    await hold('a', 650);
    const after = await page.evaluate(() => ({ pos: window.__probe.pos(), source: window.__probe.chunkSurf() }));
    movement.push({ mode: activeMode, before, moved, after });
    check(Math.hypot(before.pos.x - moved.pos.x, before.pos.y - moved.pos.y) > .5 && Math.hypot(before.pos.x - after.pos.x, before.pos.y - after.pos.y) < 2 && before.source.phase === after.source.phase,
      'ordinary movement advances and returns near the landing without checkpoint reset', { before: before.pos, moved: moved.pos, after: after.pos });

    await preset('all-insights', { yaw: .7 });
    const field = await evidence('field-off', { stages: !reduced });
    if (!baselineOnly) checkAcquisition(field);
    if (!reduced) { await torch(true); await evidence('field-on'); }

    if (!baselineOnly) {
      const memories = field.roomMemories;
      check(memories?.active && memories.medium === 'overworld' && memories.survivors?.length > 0 && memories.fixtures?.length >= 4,
        'Source contains explicit surviving-room provenance and reconstructed physical fittings', memories && { survivors: memories.survivors?.length, fixtures: memories.fixtures?.length, origins: [...new Set(memories.survivors?.map(s => s.originId))] });
      if (!reduced) {
        const string = memories.fixtures.find(f => f.anchorId === 'source-hero-string-fall-2');
        const piano = memories.fixtures.find(f => f.anchorId === 'source-hero-piano-rise-0');
        if (!string || !piano) throw new Error('Authored string/piano fixtures absent from runtime snapshot');
        const originalPower = await page.evaluate(() => window.__probe.power());
        const stringPose = await memoryPose(string, 12, -.8);
        await page.evaluate(circuit => window.__probe.setPower(circuit, false), string.circuit); await sleep(650);
        const stringOff = await evidence('strings-circuit-off', { stages: true });
        await page.evaluate(circuit => window.__probe.setPower(circuit, true), string.circuit); await sleep(650);
        await waitFixtureOn(string.id);
        const stringOn = await evidence('strings-circuit-on', { stages: true });
        const offLight = stringOff.lights.lights.find(l => l.anchorPropId === string.id);
        const onLight = stringOn.lights.lights.find(l => l.anchorPropId === string.id);
        check(!offLight && onLight?.reach > 0 && onLight?.circuit === string.circuit && onLight?.roomMemory?.originalLightId === string.originalLightId,
          'real practice circuit controls the reconstructed string fitting and finite local illumination', { fixture: string, pose: stringPose, off: offLight || null, on: onLight || null });
        checkAcquisition(stringOn, { requireDerived: true });
        await torch(true); await evidence('strings-torch-on');
        const outsidePose = await memoryPose(string, (onLight?.radius || 42) + 6, -.8);
        const outside = await evidence('strings-outside-light');
        check(!outside.lights.lights.some(l => l.anchorPropId === string.id),
          'practice light stops outside its physical radius', { radius: onLight?.radius, pose: outsidePose });
        await page.evaluate(({ circuit, originalPower }) => window.__probe.setPower(circuit, originalPower.live.includes(circuit)), { circuit: string.circuit, originalPower });

        const pianoPose = await memoryPose(piano, 8.5, -.8);
        const pianoOff = await evidence('piano-torch-off', { stages: true });
        const pianoLight = pianoOff.lights.lights.find(l => l.anchorPropId === piano.id);
        check(pianoLight?.reach > 0 && pianoLight?.powerMode === 'maintained' && pianoLight?.roomMemory?.originalLightId === piano.originalLightId,
          'piano retains the original maintained hall fitting and its local reach', { fixture: piano, pose: pianoPose, light: pianoLight || null });
        checkAcquisition(pianoOff, { requireDerived: true });
        await torch(true); await evidence('piano-torch-on');
        const pianoNearPose = await memoryPose(piano, 3.5, -.8, 8.5);
        const pianoNear = await evidence('piano-near-torch-off', { stages: true });
        const pianoNearLight = pianoNear.lights.lights.find(l => l.anchorPropId === piano.id);
        check(pianoNearLight?.reach > pianoLight?.reach && pianoNearLight?.powerMode === 'maintained',
          'approaching the maintained piano fitting increases physical illumination without an exposure change',
          { pose: pianoNearPose, farReach: pianoLight?.reach, nearReach: pianoNearLight?.reach,
            farExposure: pianoOff.lighting.captureExposure, nearExposure: pianoNear.lighting.captureExposure });
        checkAcquisition(pianoNear, { requireDerived: true });
        await torch(true); await evidence('piano-near-torch-on');

        const leak = memories.survivors.filter(s => s.id.startsWith('source-leak-'))
          .sort((a, b) => Math.hypot(a.x - field.position.x * .5, a.z - field.position.y * .5) - Math.hypot(b.x - field.position.x * .5, b.z - field.position.y * .5))[0];
        if (!leak) throw new Error('No authored surviving leak found');
        const leakPose = await memoryPose(leak, 5, 1);
        const leakOff = await evidence('leak-torch-off', { stages: true });
        await torch(true); const leakOn = await evidence('leak-torch-on');
        check(!!leak.originId && !!leak.sourcePropId && ['asset-reuse', 'derived-fragment'].includes(leak.relation),
          'a nearby half-sunk leak carries actual room and asset provenance', { leak, pose: leakPose });
        checkAcquisition(leakOff); checkAcquisition(leakOn, { requireDerived: true });
      }
    }

    await preset('final', { warp: 'door-row', yaw: .65 });
    const doors = await evidence('doors-off', { stages: !reduced });
    if (!baselineOnly) { checkAcquisition(doors); checkDoors(doors); }
    const row = await page.evaluate(() => window.__probe.edgeDoorField());
    check(row.length >= 30 && row.filter(d => d.real).length === 1, 'door field contains many pairs and one real pair', { count: row.length, real: row.filter(d => d.real).length });
    await torch(true); const doorsOn = await evidence('doors-on');
    if (!baselineOnly) checkDoors(doorsOn);

    if (!reduced && !baselineOnly) {
      const fake = row.find(d => d.index === 1);
      await page.evaluate(fake => { const p = window.__probe; p.sourceWarp(Math.round(fake.x), Math.ceil(fake.y) + 1); }, fake);
      await sleep(650); await torch(false); await aim(0, 0);
      await evidence('fake-close-off');
      await torch(true); await evidence('fake-close-on');
      await torch(false); await hold('w', 400);
      const erased = await page.evaluate(() => ({ row: window.__probe.edgeDoorField(), props: window.__probe.sourceProps(), source: window.__probe.chunkSurf() }));
      check(erased.row.find(d => d.index === 1)?.erased === true && !erased.props.some(p => p.id === fake.id) && erased.source.phase === doors.source.phase,
        'ordinary W touch erases a fake pair without leaving Source');
      await evidence('fake-erased');
      await page.evaluate(() => { const p = window.__probe, at = p.edgeDoorApproach(); p.sourceWarp(at.x, at.y); });
      await sleep(650); await aim(0, 0); await page.keyboard.press('e'); await sleep(1100);
      check(await page.evaluate(() => !!window.__probe.edgeDoor()?.passable), 'ordinary E opens the sole real pair');
      await evidence('real-open');
      await hold('w', 1800);
      check(await page.evaluate(() => window.__probe.chunkSurf().phase === 'horizon'), 'ordinary W crosses the sole real pair into the telephone walk');
    }
  }
} catch (error) {
  failure = String(error?.stack || error); errors.push({ fatal: failure }); console.error(failure);
} finally {
  if (browser) await browser.close();
  // Nothing is written until Chrome closes, preventing local Vite HMR from
  // replacing a module or resetting a camera in the middle of an evidence run.
  await mkdir(out, { recursive: true });
  for (const file of files) await writeFile(file.path, file.bytes);
  await writeFile(join(out, 'live.json'), JSON.stringify({
    scope: 'Actual game renderer with no response/shader substitutions. Chromium/Metal native736x460 captures. God presets/warps establish diagnostic viewpoints; WASD/E/F use ordinary input. Raw canvas excludes UI overlays only. This is browser GPU evidence, not native acceptance or a complete earned playthrough.',
    base, baselineOnly, bootOnly, quick, fixtureQuick, exposureValues, modes, generatedAt: new Date().toISOString(), environment, captures, checks, movement, errors,
    limitations: ['Headless Chromium does not establish native builds, audio/perceptual experience, or full earned progression.', 'Diagnostic warps are not movement proof; only separately recorded ordinary keyboard actions establish movement.'],
    files: files.map(({ path, bytes }) => ({ path, bytes: bytes.length })),
  }, null, 2));
}
process.exit(failure || errors.length || checks.some(c => !c.passed) ? 1 : 0);
