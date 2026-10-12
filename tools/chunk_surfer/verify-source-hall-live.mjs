// The Held Breath hall, through the actual renderer and held movement input.
// Start a dev server separately. Nothing here starts a server or a lens worker.
//
// SOURCE_HALL_URL=http://127.0.0.1:5311 SOURCE_HALL_OUT=/private/tmp/source-hall \
//   node tools/chunk_surfer/verify-source-hall-live.mjs
// SOURCE_HALL_REDUCED_MOTION=1 runs the same route with reduced motion/flash.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.SOURCE_HALL_URL || 'http://127.0.0.1:5311';
const reducedMotion = process.env.SOURCE_HALL_REDUCED_MOTION === '1';
const out = resolve(process.env.SOURCE_HALL_OUT || `/private/tmp/chunk-surfer-source-hall-live/${reducedMotion ? 'reduced' : 'normal'}`);
const expectedSeconds = Number(process.env.SOURCE_HALL_EXPECTED_SECONDS || 50);
const minimumSeconds = Number(process.env.SOURCE_HALL_MIN_SECONDS || expectedSeconds * .8);
const maximumSeconds = Number(process.env.SOURCE_HALL_MAX_SECONDS || expectedSeconds * 1.5);
const timeoutMs = Number(process.env.SOURCE_HALL_TIMEOUT_MS || 120000);
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const errors = [], checks = [], failures = [], snapshots = {}, routeSamples = [];
let browser, page, failure = null, traversal = null, frameSamples = [];

await mkdir(out, { recursive: true });
function check(condition, name, details = null) {
  checks.push({ name, passed: !!condition, ...(details == null ? {} : { details }) });
  if (!condition) failures.push(name);
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${details == null ? '' : ` ${JSON.stringify(details)}`}`);
}
function frameSummary(values) {
  if (!values.length) return { frames: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return {
    frames: values.length,
    meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
    maximumMs: sorted.at(-1), framesAbove50Ms: values.filter(value => value > 50).length,
  };
}
const top = () => page.evaluate(() => window.__scenes?.top()?.id || null);
const position = () => page.evaluate(() => window.__probe.pos());
async function press(key) { await page.keyboard.press(key); await sleep(180); }
async function clearSpeech() {
  await page.evaluate(async () => {
    if (window.__probe.hush) { window.__probe.hush(); return; }
    const url = performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === '/src/game/speech.js')?.name;
    if (url) (await import(url)).clearSpeech?.();
  });
}
async function aim(yaw = 0, pitch = 0) {
  await page.evaluate(({ yaw, pitch }) => window.__probe.lookAtWorld(yaw, pitch), { yaw, pitch });
  await sleep(120);
}
async function screenshot(name) {
  const path = join(out, `${name}.png`);
  await page.screenshot({ path });
  console.log('CAPTURE', path);
}
async function evidence(name) {
  snapshots[name] = await page.evaluate(() => {
    const probe = window.__probe, renderer = window.__sourceHallRenderer;
    const source = probe.chunkSurf(), props = probe.sourceProps() || [];
    // Read submitted instances through the live game's closure. A Vite HMR
    // URL can otherwise import a separate, cold renderer or save module.
    const liveProps = probe.props();
    return {
      source, position: probe.pos(), look: probe.lookAngles(), scene: window.__scenes?.top()?.view?.() || null,
      moveIntervalMs: probe.moveInterval(), torchOn: !!probe.rec().light,
      settings: probe.settings(), lookProfile: probe.lookProfile(), lighting: probe.r3dLighting(),
      lights: probe.sourceLights(), performance: probe.performance(),
      frontEndPlate: renderer.r3dFrontEndPlate(), liveFrontEndNegative: probe.frontEndGrade(),
      rendererLook: window.__chunkSurferPixelMesh?.lookStatus?.() || null,
      rendererEye: renderer.r3dEyePoint(), propStats: liveProps.pack,
      submittedIds: liveProps.renderedIds, propCount: props.length,
      importedModuleUrls: window.__sourceHallModuleUrls,
      importedRendererMatchesLiveProps: JSON.stringify(renderer.r3dPropStats()) === JSON.stringify(liveProps.pack),
      stillProp: props.find(prop => prop.id === 'source-sheet-interactive') || null,
      anchorSheet: props.find(prop => prop.id === 'source-sheet-3') || null,
    };
  });
  const snapshot = snapshots[name];
  console.log('EVIDENCE', name, JSON.stringify({
    phase: snapshot.source.phase, distance: snapshot.source.hallDistance,
    position: snapshot.position, moveIntervalMs: snapshot.moveIntervalMs,
    torchOn: snapshot.torchOn, propCount: snapshot.propCount,
  }));
  return snapshot;
}
async function setTorch(on) {
  const before = await page.evaluate(() => !!window.__probe.rec().light);
  if (before !== on) { await press('f'); await clearSpeech(); }
  await sleep(250);
  check(await page.evaluate(() => !!window.__probe.rec().light) === on, `real F input turns the carried torch ${on ? 'on' : 'off'}`);
}
async function routeSample() {
  return page.evaluate(() => {
    const probe = window.__probe, state = probe.chunkSurf();
    return {
      now: performance.now(), position: probe.pos(), phase: state.phase,
      hallDistance: state.hallDistance, pageStage: state.pageStage,
      moveIntervalMs: probe.moveInterval(), scene: window.__scenes?.top()?.id || null,
    };
  });
}

try {
  browser = await puppeteer.launch({
    executablePath: process.env.SOURCE_HALL_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.SOURCE_HALL_HEADFUL !== '1', protocolTimeout: 120000,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  page = await browser.newPage();
  page.on('pageerror', error => { errors.push(String(error)); console.error('PAGEERROR', String(error)); });
  page.on('console', message => {
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(message.text())) errors.push(message.text());
  });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  const url = new URL(base);
  for (const [key, value] of Object.entries({ nodisplaynotice: '1', skipwarn: '1', nomic: '1', sam: '0', nothink: '1' })) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun && ['eula', 'opening-credits', 'title'].includes(window.__scenes?.top()?.id), { timeout: 90000 });
  await page.evaluate(async reduced => {
    await window.__probe.testRun();
    window.__probe.tutSkip();
    const moduleUrl = path => performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === path)?.name || path;
    window.__sourceHallModuleUrls = { save: moduleUrl('/src/game/save.js'), renderer: moduleUrl('/src/render/r3d.js') };
    window.__sourceHallSave = await import(window.__sourceHallModuleUrls.save);
    window.__sourceHallRenderer = await import(window.__sourceHallModuleUrls.renderer);
    const save = window.__sourceHallSave;
    const desired = { shake: reduced ? 'reduced' : 'full', flash: reduced ? 'off' : 'full', objectiveHints: 'full' };
    save.saveCommit({ settings: { ...window.__probe.settings(), ...desired } });
    // Validate against the authoritative closure, and use its setters if HMR
    // has left the imported save module distinct from the active game module.
    if (window.__probe.settings().shake !== desired.shake) window.__chunkSurferDesktopMenu?.dispatch({ id: 'reduce_motion', checked: reduced });
    if (window.__probe.settings().flash !== desired.flash) window.__probe.apparitionEffects(desired.flash);
    if (window.__probe.settings().objectiveHints !== desired.objectiveHints) window.__probe.setObjectiveHints(desired.objectiveHints);
    window.__chunkSurferPixelMesh?.setAccessibility({ reduceMotion: reduced, reduceFlash: reduced });
    const actual = window.__probe.settings();
    if (Object.entries(desired).some(([key, value]) => actual[key] !== value)) throw new Error(`Live hall settings did not apply: ${JSON.stringify({ desired, actual })}`);
    window.__probe.propDiagnostics(true);
    window.__probe.sourcePreset('hall-entry');
    const frames = window.__sourceHallFrames = { active: false, last: null, samples: [] };
    function collect(now) {
      if (frames.active && frames.last != null && frames.samples.length < 20000) frames.samples.push(now - frames.last);
      frames.last = frames.active ? now : null;
      requestAnimationFrame(collect);
    }
    requestAnimationFrame(collect);
  }, reducedMotion);
  await clearSpeech(); await aim(); await sleep(650);
  const entry = await evidence('entry'); await screenshot('00-entry');
  check(entry.source.phase === 'hall', 'review entry starts in the actual physical hall');
  check(entry.liveFrontEndNegative === false && entry.frontEndPlate.negative === 0 && entry.frontEndPlate.amount === 0, 'title exposure is released before hall rendering');
  check(entry.settings.shake === (reducedMotion ? 'reduced' : 'full') && entry.settings.flash === (reducedMotion ? 'off' : 'full'), 'the live game uses the requested motion and flash settings');
  check(entry.importedRendererMatchesLiveProps, 'renderer diagnostics refer to the same renderer instance as the live game');
  check(entry.source.landing.flashlight.mode === 'normal', 'the physical hall uses the ordinary carried torch');
  check(entry.lights?.lights?.length > 0, 'the hall submits practical lights');

  // Leave W held throughout the entire route, including milestone captures.
  // A rapid keyboard.press loop does not exercise frame-sampled locomotion.
  const milestones = [{ metres: 12, name: '01-hall-12m' }, { metres: 40, name: '02-hall-40m' }, { metres: 70, name: '03-hall-70m' }, { metres: 96, name: '04-hall-96m' }];
  let nextMilestone = 0, sawEarlyStill = false, lastProgressLogSeconds = -10;
  await page.evaluate(() => { window.__probe.performanceReset(); window.__sourceHallFrames.active = true; });
  const routeStarted = (await routeSample()).now;
  await page.keyboard.down('w');
  try {
    while (true) {
      await sleep(200);
      const sample = await routeSample();
      sample.elapsedSeconds = (sample.now - routeStarted) / 1000;
      routeSamples.push(sample);
      if (sample.elapsedSeconds - lastProgressLogSeconds >= 10) {
        lastProgressLogSeconds = sample.elapsedSeconds;
        console.log('ROUTE', JSON.stringify(sample));
      }
      if (sample.elapsedSeconds * 1000 > timeoutMs) throw new Error(`Held W did not cross the hall before ${timeoutMs}ms: ${JSON.stringify({ sample, why: await page.evaluate(() => window.__probe.why()) })}`);
      while (nextMilestone < milestones.length && sample.hallDistance >= milestones[nextMilestone].metres) {
        const milestone = milestones[nextMilestone++];
        const snapshot = await evidence(milestone.name);
        await screenshot(milestone.name);
        if (snapshot.stillProp && snapshot.source.hallDistance < 112) sawEarlyStill = true;
      }
      if (sample.hallDistance >= 112 - 1e-6) {
        traversal = {
          elapsedSeconds: sample.elapsedSeconds, expectedSeconds,
          acceptableSeconds: [minimumSeconds, maximumSeconds],
          distanceMetres: sample.hallDistance, uninterruptedHeldInput: true,
          includesLiveScreenshotOverhead: true,
        };
        break;
      }
      if (!['hall', 'haystack'].includes(sample.phase)) throw new Error(`The route left the hall without still-page input: ${JSON.stringify(sample)}`);
    }
  } finally {
    await page.keyboard.up('w');
    frameSamples = await page.evaluate(() => { window.__sourceHallFrames.active = false; return window.__sourceHallFrames.samples; });
  }
  await sleep(250); await evidence('endpoint'); await screenshot('05-hall-endpoint');
  check(nextMilestone === milestones.length, 'held movement reaches every authored hall milestone');
  check(traversal.elapsedSeconds >= minimumSeconds && traversal.elapsedSeconds <= maximumSeconds, 'uninterrupted crossing stays near the authored fifty-second target', traversal);
  check(sawEarlyStill, 'the still sheet is present in the rendered prop set before the physical endpoint');
  const anchors = [snapshots.entry, ...milestones.map(milestone => snapshots[milestone.name])].map(snapshot => snapshot?.anchorSheet).filter(Boolean);
  check(anchors.length >= 2 && anchors.every(anchor => Math.hypot(anchor.x - anchors[0].x, anchor.z - anchors[0].z) < 1e-6), 'an authored sheet retains its world address while the body advances');

  // A separate 96m checkpoint lets the real interaction prove that taking the
  // sheet is possible BEFORE 112m, after the first route measured the full walk.
  await page.evaluate(() => window.__probe.sourcePreset('hall-storm'));
  await clearSpeech(); await sleep(400);
  const search = await evidence('earlySearch');
  const target = search.source.realPage || (search.source.objective?.id === 'still-page' ? search.source.objective.target : null);
  assert.ok(target && Number.isFinite(target.x) && Number.isFinite(target.y), 'the 96m hall exposes the actual still-page target');
  check(search.source.hallDistance < 112 && !!search.stillProp, 'the 96m checkpoint has a real still sheet before the wall');
  await page.evaluate(target => window.__probe.sourceWarp(target.x, target.y + 4, 0), target);
  await clearSpeech(); await aim(0, -.18); await sleep(350);
  const beforePage = await position();
  const focused = await evidence('earlyStillFocused');
  check(focused.source.hallDistance < 112 && (focused.source.focus?.kind === 'haystack-page' || focused.source.focus?.id === 'source-page'), 'the still sheet acquires interaction focus before the physical endpoint', focused.source.focus);
  await screenshot('06-still-sheet-before-endpoint');
  await setTorch(false); await evidence('torchOff'); await screenshot('07-hall-torch-off');
  await setTorch(true); await evidence('torchOn'); await screenshot('08-hall-torch-on');
  check(Math.hypot((await position()).x - beforePage.x, (await position()).y - beforePage.y) < 1e-9, 'torch comparison keeps the same physical viewpoint');
  await clearSpeech(); await press('e');
  assert.equal(await top(), 'source-still-page', 'one real E raises the still sheet rather than a decoy');
  check((await position()).x === beforePage.x && (await position()).y === beforePage.y, 'raising the still sheet preserves body coordinates');
  await sleep(600); await evidence('pageRaised'); await screenshot('09-still-sheet-reading');
  await press('e');
  check(await top() !== 'source-still-page', 'real E lowers the held sheet');
  await page.waitForFunction(() => window.__probe.chunkSurf().phase === 'landscape', { timeout: 30000 });
  await sleep(650);
  const dock = await evidence('sceneDock'); await screenshot('10-scene-dock');
  check(dock.position.x === beforePage.x && dock.position.y === beforePage.y, 'lowering the still sheet reveals Scene Dock at the same body coordinates');
  check(dock.source.landing.void.sceneDock === true, 'the revealed world is the physical Scene Dock');
  check(dock.submittedIds.some(id => id.startsWith('source-landing:')), 'Scene Dock meshes reach the actual renderer');
  check(errors.length === 0, 'the route, torch comparison, sheet and Scene Dock produce no JavaScript or shader errors', errors);
  assert.deepEqual(failures, [], 'Source hall live acceptance checks');
} catch (error) {
  failure = String(error?.stack || error);
  process.exitCode = 1;
  console.error(failure);
  if (page) {
    try { await evidence('failure'); await screenshot('failure'); } catch (captureError) { console.error('FAILURE CAPTURE', String(captureError)); }
  }
} finally {
  if (page) {
    try { await page.keyboard.up('w'); } catch { /* The browser may have closed. */ }
  }
  const report = {
    passed: failure === null, failure, checks, errors,
    scope: 'Chromium/Metal WebGL2; disposable authored checkpoint entry; full uninterrupted held-key hall crossing, then an early still-page interaction using real E and F. Diagnostic sourceWarp positions only the second interaction viewpoint. No lens inference, perceptual audio, native OS-window placement, or complete-run acceptance.',
    base, out, reducedMotion, traversal, frameTiming: frameSummary(frameSamples), routeSamples, snapshots,
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(out, 'frame-samples.json'), JSON.stringify({ scope: 'requestAnimationFrame callback intervals during the held-W route, including captures; these are not display scanout measurements', milliseconds: frameSamples }, null, 2));
  if (browser) await browser.close();
  console.log('REPORT', join(out, 'report.json'));
  console.log('RESULT', JSON.stringify({ passed: report.passed, reducedMotion, traversal, frameTiming: report.frameTiming, errors: errors.length, failedChecks: failures }));
}
