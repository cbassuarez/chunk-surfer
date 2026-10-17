import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

// Production-page acceptance: a God checkpoint establishes a won fight only.
// Actual E/W, reload + the title's Continue, and ordinary narrative input do
// all extraction and return work. No served source, shader or module is replaced.
const out = resolve(process.env.TOWER_ENDING_OUT || 'artifacts/tower-route-implementation/live-endings');
const url = process.env.TOWER_ENDING_URL || 'http://127.0.0.1:5299/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1';
const only = process.env.TOWER_ENDING_ONLY || '';
const recordingCheck = process.env.TOWER_ENDING_RECORDING_CHECK === '1';
const exposureAB = process.env.TOWER_ENDING_EXPOSURE_AB === '1';
const presentationOnly = process.env.TOWER_ENDING_PRESENTATION_ONLY === '1';
const holdOnly = presentationOnly && process.env.TOWER_ENDING_HOLD_ONLY === '1';
const presentationSeedPath = process.env.TOWER_ENDING_PRESENTATION_SEED || '';
const presentationSeedReport = presentationSeedPath ? JSON.parse(await readFile(resolve(presentationSeedPath), 'utf8')) : null;
const presentationSeed = () => presentationSeedReport?.captures?.find(c => c.mode === mode && c.name === '09-two-bodies-extracted');
const checks = [], captures = [], traces = [], errors = [], pendingImages = [], production = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const near = (a, b, radius = .03) => !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) <= radius;
const doorOpen = door => door?.state === 'open' || Number(door?.openFraction) >= .9;
let browser, page, profile, mode = 'normal', stage = 'boot', fatal = null;
function check(pass, name, detail) {
  checks.push({ pass: !!pass, mode, name, detail });
  console.log(pass ? 'PASS' : 'FAIL', mode, name, JSON.stringify(detail));
  return !!pass;
}
async function state() {
  return page.evaluate(() => {
    const p = window.__probe, cathedral = p?.cathedralState?.();
    const saved = JSON.parse(localStorage.getItem('chunk-surfer:save:v4') || 'null');
    return { pos: p?.pos?.(), look: p?.lookAngles?.(), cathedral, finale: p?.finale?.(),
      scene: window.__scenes?.top({ includeOverlay: true })?.id,
      dialogue: window.__scenes?.top()?.view?.(), cutscene: p?.endingCutscene?.(),
      storedExtraction: saved?.chunkSurf?.finale?.cathedral?.extraction || null,
      sourceStatus: { active: saved?.chunkSurf?.active, phase: saved?.chunkSurf?.phase, completed: saved?.chunkSurf?.completed, area: saved?.area },
      savedFinale: saved?.chunkSurf?.finale, run: saved?.run, doors: p?.doors?.(),
      settings: p?.settings?.(), meta: p?.meta?.(), props: p?.props?.(), tape: p?.tape?.(),
      recording: p?.towerEndingRecording?.(),
      frontEndGrade: p?.frontEndGrade?.(),
      lighting: p?.r3dLighting?.(),
      weather: p?.storm?.(),
    };
  });
}
function carry(s) { return typeof s.cathedral?.carry === 'object' ? s.cathedral.carry : s.storedExtraction; }
async function shot(name) {
  stage = `${mode}:${name}`;
  const s = await state(), path = join(out, `${mode}-${name}.webp`);
  const bytes = await page.screenshot({ type: 'webp', quality: 82 });
  if (name === '10-won-final-hold' || name === '24-lost-final-hold' || name === '25-lost-final-wide-last-camera') {
    s.sceneAfterCapture = (await state()).scene;
  }
  const capture = { name, mode, path, surface: 'full-production-player-view', ...s };
  try {
    if (presentationOnly) { capture.path = null; capture.pendingPath = path; pendingImages.push({ path, bytes, capture }); }
    else await writeFile(path, bytes);
  }
  catch (error) {
    if (error.code !== 'ENOSPC') throw error;
    capture.path = null; capture.pendingPath = path; pendingImages.push({ path, bytes, capture });
  }
  captures.push(capture); console.log('CAPTURE', stage, JSON.stringify({ pos: s.pos, scene: s.scene, cursor: s.cutscene?.state?.cursor }));
  if (process.env.TOWER_ENDING_STAGES === '1' && /10-won-final-hold|25-lost-final-wide-last-camera/.test(name)) {
    for (const renderStage of ['props', 'scene', 'vfd']) {
      const data = await page.evaluate(stage => window.__probe.sourceShoreCapture(stage), renderStage);
      if (data) {
        const diagnostic = { name: `${name}-${renderStage}`, mode, path: null, surface: `actual-${renderStage}-render-target` };
        const diagnosticPath = join(out, `${mode}-${diagnostic.name}.png`);
        pendingImages.push({ path: diagnosticPath, bytes: Buffer.from(data.split(',')[1], 'base64'), capture: diagnostic });
        captures.push(diagnostic);
      }
    }
  }
  return s;
}
async function aim(yaw, pitch = -.08) { await page.evaluate(v => window.__probe.lookAtWorld(v.yaw, v.pitch), { yaw, pitch }); await sleep(80); }
async function face(target, pitch = -.08) {
  const s = await state(); await aim(Math.atan2(target.x - s.pos.x, -(target.y - s.pos.y)), pitch);
}
async function hold(key, ms) {
  await page.keyboard.down(key); try { await sleep(ms); } finally { await page.keyboard.up(key); }
  await sleep(100);
}
async function until(predicate, { timeout = 20000, interval = 200 } = {}) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) { const s = await state(); if (predicate(s)) return s; await sleep(interval); }
  return state();
}
function churchPoint(s, x, y) {
  const here = s.cathedral?.here;
  if (!here || here.level !== 'ground') throw new Error('Expected actual church ground coordinate');
  return { x: s.pos.x + (x - here.x) * 2, y: s.pos.y + (y - here.y) * 2 };
}
async function walkTo(target, name, { radius = .85, limit = 150 } = {}) {
  stage = `${mode}:walk-${name}`; let last = null, stuck = 0;
  for (let i = 0; i < limit; i++) {
    const s = await state(), d = Math.hypot(s.pos.x - target.x, s.pos.y - target.y);
    if (d <= radius) { traces.push({ mode, name, target, final: s.pos, iterations: i }); return true; }
    if (last && near(last, s.pos, .045)) stuck++; else stuck = 0;
    if (stuck >= 8 || s.scene) { traces.push({ mode, name, target, stuck, final: s.pos, distance: d, scene: s.scene, carry: carry(s) }); return false; }
    last = s.pos; await face(target); await hold('w', Math.min(400, Math.max(70, d * 43)));
  }
  traces.push({ mode, name, target, limit: true, state: await state() }); return false;
}
async function boot(reduced, { carryPreset = true } = {}) {
  const context = await browser.createBrowserContext(); page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: .575 }); await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  const record = error => { const seen = errors.find(e => e.mode === mode && e.error === error); if (seen) seen.count++; else errors.push({ mode, stage, error, count: 1 }); };
  page.on('pageerror', e => record(String(e)));
  page.on('console', msg => { if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(msg.text())) record(msg.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun, { timeout: 240000 });
  for (let i = 0; i < 180; i++) {
    const id = await page.evaluate(() => window.__scenes?.top()?.id);
    if (id === 'title') break;
    if (id === 'eula') await page.keyboard.press('Enter');
    if (i % 25 === 0) console.log('BOOT', mode, id);
    await sleep(500);
  }
  await page.waitForFunction(() => window.__scenes?.top()?.id === 'title', { timeout: 15000 });
  production.push({ mode, ...await page.evaluate(() => {
    const gl = document.querySelector('canvas.r3d')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { url: location.href, scripts: [...document.scripts].map(script => script.src).filter(Boolean),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null };
  }) });
  await page.evaluate(async ({ reduced, carryPreset }) => {
    await window.__probe.testRun(); window.__probe.tutSkip();
    window.__probe.setReduceMotion(reduced);
    if (carryPreset) await window.__probe.cathedralPreset('carry');
    window.__probe.hush();
    window.__probe.setTorch(true);
  }, { reduced, carryPreset });
  if (recordingCheck && !reduced) {
    // Conditional coda acceptance only: the personal journey's actual earning
    // is proved separately. This flag does not bypass the extraction below.
    const earned = await page.evaluate(() => window.__probe.setFlag('station.recordist.complete', true));
    check(earned, 'conditional recording coda establishes the explicit earned-flag precondition');
    traces.push({ mode, precondition: 'station.recordist.complete=true', scope: 'Conditional ending callback; actual personal-journey earning is separate.' });
  }
  await sleep(1400); return context;
}
async function reloadContinue(name) {
  // A look-only turn uses the game's ordinary four-second camera autosave.
  // Steps, grip actions and score beats persist immediately.
  stage = `${mode}:reload-${name}`; await sleep(4500);
  const before = await state(), beforeCarry = carry(before);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.cathedralState, { timeout: 90000 });
  for (let i = 0; i < 180; i++) {
    const id = await page.evaluate(() => window.__scenes?.top()?.id);
    if (id === 'eula') { await page.keyboard.press('Enter'); await sleep(300); continue; }
    if (id === 'title') { await page.evaluate(() => window.__chunkSurferDesktopMenu.dispatch('continue')); break; }
    await sleep(400);
  }
  await until(s => s.cathedral?.finale?.stage === 'tower-escape' && !s.scene, { timeout: 30000 });
  const settled = await until(s => s.frontEndGrade === false, { timeout: 15000 });
  check(settled.frontEndGrade === false, `${name}: native Continue settles into the live-world grade`, settled.frontEndGrade);
  await sleep(350); const after = await state(), afterCarry = carry(after);
  check(near(before.pos, after.pos), `${name}: actual reload + Continue preserves player position`, { before: before.pos, after: after.pos, scene: after.scene });
  check(near(beforeCarry?.drag?.position, afterCarry?.drag?.position), `${name}: body remains where it was left`, { before: beforeCarry?.drag, after: afterCarry?.drag });
  check(beforeCarry?.drag?.gripped === afterCarry?.drag?.gripped && JSON.stringify(beforeCarry?.drag?.trail) === JSON.stringify(afterCarry?.drag?.trail),
    `${name}: grip and full follower trail survive`, { before: beforeCarry?.drag?.gripped, after: afterCarry?.drag?.gripped });
  check(JSON.stringify(beforeCarry?.dragVector) === JSON.stringify(afterCarry?.dragVector),
    `${name}: dragged body orientation survives`, { before: beforeCarry?.dragVector, after: afterCarry?.dragVector });
  check(Math.abs(before.look?.yaw - after.look?.yaw) < .02 && Math.abs(before.look?.pitch - after.look?.pitch) < .02,
    `${name}: player viewing pose survives`, { before: before.look, after: after.look });
  check(after.cutscene?.state?.cursor === before.cutscene?.state?.cursor && JSON.stringify(after.cutscene?.state?.fired) === JSON.stringify(before.cutscene?.state?.fired),
    `${name}: physical cutscene progress survives`, { before: before.cutscene?.state, after: after.cutscene?.state });
  return after;
}
async function seedPresentationBoundary() {
  const earned = presentationSeed();
  if (!earned?.storedExtraction || earned.savedFinale?.stage !== 'resolved' || !earned.cathedral?.physical?.bothOutside) {
    throw new Error(`Missing a real completed extraction capture for ${mode} in ${presentationSeedPath}`);
  }
  const storageBoundary = async label => traces.push({ mode, storageBoundary: label, ...await page.evaluate(() => {
    const legacyRaw = localStorage.getItem('chunk-surfer:save:v4');
    const autosaveRaw = localStorage.getItem('chunk-surfer:save:autosave:v1');
    const saved = JSON.parse(autosaveRaw || 'null')?.data || JSON.parse(legacyRaw || 'null');
    return { legacyRaw, autosaveRaw, run: saved?.run, area: saved?.area,
      meta: window.__probe?.meta?.(), frontEndGrade: window.__probe?.frontEndGrade?.(),
      frontEndScene: window.__scenes?.top({ includeOverlay: true })?.id,
      titleView: window.__scenes?.top()?.view?.(),
      fixtureInstalledAtBootstrap: window.__towerEndingFixtureBootstrap || null };
  }) });
  await storageBoundary('fresh-run-before-fixture');
  const fixture = await page.evaluate(earned => {
    const legacyKey = 'chunk-surfer:save:v4', autosaveKey = 'chunk-surfer:save:autosave:v1';
    const envelope = JSON.parse(localStorage.getItem(autosaveKey) || 'null');
    if (!envelope?.data) throw new Error('Expected the current authoritative autosave envelope');
    const saved = envelope.data;
    saved.chunkSurf.finale = earned.savedFinale;
    saved.chunkSurf.active = false; saved.chunkSurf.completed = true; saved.chunkSurf.phase = 'completed';
    saved.px = earned.storedExtraction.player.x; saved.py = earned.storedExtraction.player.y;
    saved.view = { yaw: earned.storedExtraction.playerPose.yaw, pitch: earned.storedExtraction.playerPose.pitch };
    saved.facing = earned.storedExtraction.playerPose.facing;
    saved.area = 'conservatory';
    saved.endingCutscene = { schema: 1, endingId: 'tower-won', arrival: 'carried' };
    saved.steps = Math.max(saved.steps || 0, earned.storedExtraction.drag.trail.length);
    envelope.data = saved;
    return { legacyKey, autosaveKey, legacyRaw: JSON.stringify(saved), autosaveRaw: JSON.stringify(envelope) };
  }, earned);
  await page.evaluate(fixture => {
    localStorage.setItem(fixture.legacyKey, fixture.legacyRaw);
    localStorage.setItem(fixture.autosaveKey, fixture.autosaveRaw);
  }, fixture);
  await storageBoundary('seeded-before-reload');
  // The current page has its own in-memory save. Install the complete explicit
  // fixture in both storage keys at document start, before saveLoadAsync can
  // prefer the authoritative autosave envelope over the legacy probe mirror.
  const hook = await page.evaluateOnNewDocument(fixture => {
    localStorage.setItem(fixture.legacyKey, fixture.legacyRaw);
    localStorage.setItem(fixture.autosaveKey, fixture.autosaveRaw);
    window.__towerEndingFixtureBootstrap = { legacyRaw: localStorage.getItem(fixture.legacyKey),
      autosaveRaw: localStorage.getItem(fixture.autosaveKey) };
  }, fixture);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.removeScriptToEvaluateOnNewDocument(hook.identifier);
  await page.waitForFunction(() => window.__probe?.cathedralState, { timeout: 90000 });
  await storageBoundary('after-bootstrap-before-continue');
  for (let i = 0; i < 180; i++) {
    const id = await page.evaluate(() => window.__scenes?.top()?.id);
    if (id === 'eula') { await page.keyboard.press('Enter'); await sleep(300); continue; }
    if (id === 'title') {
      await storageBoundary('title-before-native-continue');
      await page.evaluate(() => window.__chunkSurferDesktopMenu.dispatch('continue')); break;
    }
    await sleep(400);
  }
  const loaded = await until(s => s.cutscene?.id === 'tower-won' && s.scene === 'finale' && s.frontEndGrade === false, { timeout: 45000 });
  await storageBoundary('after-native-continue');
  check(loaded.frontEndGrade === false && near(loaded.storedExtraction?.player, earned.storedExtraction.player)
    && near(loaded.storedExtraction?.drag?.position, earned.storedExtraction.drag.position),
  'actual reload + Continue loads the real completed extraction into its pending won ending', {
    sourceReport: resolve(presentationSeedPath), earnedPhysical: earned.cathedral.physical,
    loadedPlayer: loaded.storedExtraction?.player, loadedBody: loaded.storedExtraction?.drag?.position, grade: loaded.frontEndGrade,
  });
  check(loaded.cutscene?.state?.complete && loaded.cutscene.state.cursor === 5
    && ['grip-surfer', 'drag-through-nave', 'west-threshold', 'open-west-doors', 'ordinary-weight'].every(id => loaded.cutscene.state.fired.includes(id)),
  'completed extraction reload restores all earned spatial beats without another grip or walk', loaded.cutscene?.state);
  await page.evaluate(() => window.__probe.setTorch(true));
  traces.push({ mode, presentationSeed: { sourceReport: resolve(presentationSeedPath), capture: earned.name,
    player: earned.storedExtraction.player, body: earned.storedExtraction.drag.position,
    note: 'Explicit pending-ending reload precondition copied from an actual completed E/W extraction; no new physical completion or earning claim.' } });
  return true;
}
async function exerciseEndingRecording() {
  const start = await until(s => s.recording?.active && s.recording.elapsed >= 2, { timeout: 5000, interval: 50 });
  check(start.recording?.contextState === 'running' && start.dialogue?.lineSourceId === 'start.line.10',
    'guard coda starts the real recording through its authored line callback', { recording: start.recording, dialogue: start.dialogue });
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Enter'); await sleep(65); }
  const fast = await shot('11-recording-fast-enter-held');
  check(fast.dialogue?.lineSourceId === 'start.line.10' && fast.recording?.remaining > 0,
    'rapid ordinary Enter cannot acknowledge the recording before playback finishes', { recording: fast.recording, dialogue: fast.dialogue });
  await page.keyboard.press('Escape'); await sleep(200);
  const paused = await shot('12-recording-paused');
  await sleep(2100); const still = await state();
  check(paused.scene === 'pause' && still.scene === 'pause' && paused.recording?.paused && still.recording?.paused
    && Math.abs(paused.recording.elapsed - still.recording.elapsed) < .08,
  'Escape pause freezes the PCM acknowledgment clock', { before: paused.recording, after: still.recording });
  await page.keyboard.press('Escape'); await sleep(700); const resumed = await shot('13-recording-resumed');
  check(resumed.recording?.active && !resumed.recording.paused && resumed.recording.contextState === 'running'
    && resumed.recording.elapsed > still.recording.elapsed + .35 && resumed.recording.elapsed < still.recording.elapsed + 1.1,
  'ordinary resume continues from the saved PCM offset', { paused: still.recording, resumed: resumed.recording });
  traces.push({ mode, recordingPause: { paused: paused.recording, still: still.recording, resumed: resumed.recording } });
}
async function finishReturn(id, { terminal = false } = {}) {
  stage = `${mode}:finish-${id}`; const started = Date.now(); let capturedPeal = false, sawCredits = false, sawReturn = false;
  const checkRecordingHere = recordingCheck && mode === 'normal' && !terminal;
  let recordingExercised = false, recordingCompleted = false;
  let capturedHold = false;
  const visited = [], pealStages = new Set();
  for (let i = 0; Date.now() - started < 130000; i++) {
    const s = await state();
    if (!visited.includes(s.scene)) visited.push(s.scene);
    if (!capturedHold && s.scene === `ending-hold:${id}` && s.cutscene?.embodiment?.finalHold) {
      // Capture within the authored three-second hold, before the following
      // prose. Waiting here can miss it on a busy rendering machine.
      const held = await shot(id === 'tower-won' ? '10-won-final-hold' : '24-lost-final-hold');
      capturedHold = true;
      check(held.scene === `ending-hold:${id}` && held.sceneAfterCapture === held.scene,
        `${id}: the captured frame remains inside its unobstructed world hold`,
        { before: held.scene, after: held.sceneAfterCapture });
      const expected = id === 'tower-won' ? ['ending-tower-won-surfer', 'ending-tower-won-player'] : ['tower-lost-surfer', 'tower-lost-player'];
      check(!!held.cutscene?.worldView && expected.every(actor => held.cutscene.props.some(prop => prop.id === actor)),
        `${id}: actual final hold submits its camera and both bodies`, { worldView: held.cutscene?.worldView, props: held.cutscene?.props });
      const subjectLight=held.lighting?.lights?.[0];
      check(subjectLight?.radius===Math.fround(2.3)&&Math.abs(subjectLight.intensity-1.1)<1e-5,
        `${id}: the localized actor key reaches the actual renderer within its light budget`,subjectLight);
      if (presentationOnly && id === 'tower-won' && presentationSeedReport) {
        const earned = presentationSeed().cathedral.physical;
        const body = held.cutscene.props.find(p => p.id === 'ending-tower-won-surfer');
        const player = held.cutscene.props.find(p => p.id === 'ending-tower-won-player');
        check(Math.hypot(player.x - earned.player.x, player.z - earned.player.z) < .01
          && Math.hypot(body.x - earned.body.x, body.z - earned.body.z) < .01,
        'won held actors use the exact earned exit positions rather than the review fallback', { earned, player, body });
      }
      if (exposureAB && mode === 'normal') {
        // Explicit diagnostic A/B only. The first capture above is the authored
        // grade; renderer overrides are restored before completion continues.
        for (const value of [4.5, 2, 1]) {
          await page.evaluate(value => window.__probe.captureExposure(value), value);
          await sleep(180);
          await shot(`${id === 'tower-won' ? '10' : '24'}-exposure-diagnostic-${value}`);
        }
        await page.evaluate(() => window.__probe.captureExposure(null));
        traces.push({ mode, exposureDiagnostic: { ending: id, values: [4.5, 2, 1], restoredAuthored: true } });
      }
      if (id === 'tower-lost') {
        // The reveal drifts for2.85s after strike eight. Keep the ordinary
        // final hold running until its actual last camera, without Enter.
        await until(s => s.cutscene?.elapsedMs >= 10600 || s.scene !== 'ending-hold:tower-lost', { timeout: 3500, interval: 50 });
        const last = await shot('25-lost-final-wide-last-camera');
        const view = last.cutscene?.worldView;
        check(last.scene === 'ending-hold:tower-lost' && last.cutscene.elapsedMs >= 10550
          && Math.abs(view?.x - 250.2) < .04 && Math.abs(view?.y - 391.8) < .04,
        'lost held image reaches the authored last camera clear of the crossing pier', { scene: last.scene, elapsedMs: last.cutscene?.elapsedMs, worldView: view });
      }
      if (holdOnly) return held;
      continue;
    }
    if (checkRecordingHere && !recordingExercised && s.recording?.active && s.dialogue?.lineSourceId === 'start.line.10') {
      await exerciseEndingRecording(); recordingExercised = true; continue;
    }
    if (recordingExercised && !recordingCompleted && s.recording?.active && s.recording.elapsed >= 14 && s.recording.remaining === 0) {
      await shot('14-recording-fourteen-seconds-complete'); recordingCompleted = true;
      check(s.recording.contextState === 'running' && s.dialogue?.lineSourceId === 'start.line.10',
        'both notes and recorder set-down finish on the actual 14-second AudioContext clock before acknowledgment',
        { recording: s.recording, authoredPcmCueSeconds: { firstNote: 3.1, secondNote: 7.4, recorderSetDown: 11.7 } });
    }
    if (s.cutscene?.id === 'tower-lost') {
      pealStages.add(s.cutscene.embodiment?.syncStage);
      if (s.cutscene.state?.fired?.length === 8 && !capturedPeal) {
        await shot('21-eight-strike-terminal-wide'); capturedPeal = true;
        check(s.cutscene.embodiment?.syncStage === 8, 'all eight terminal strikes reach physical embodiment', s.cutscene);
        check(JSON.stringify(s.cutscene.bellStrikes) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]),
          'eight terminal strikes invoke the actual bell audio callback in order', s.cutscene.bellStrikes);
        check(s.recording?.contextState === 'running', 'terminal bell callbacks use a running AudioContext', s.recording?.contextState);
      }
    }
    if (s.scene === 'credits') {
      if (!sawCredits) { await shot(id === 'tower-won' ? '15-won-credits' : '22-lost-credits'); sawCredits = true; }
      if (checkRecordingHere) check(recordingCompleted && s.recording?.active === false,
        'credits starts after the recording finishes and cleans up its playback handle', s.recording);
      await page.keyboard.press('Escape');
    } else if (s.scene === 'return-report') {
      if (!sawReturn) { await shot(id === 'tower-won' ? '16-won-return-report' : '23-lost-return-report'); sawReturn = true; }
      break;
    } else if (String(s.scene).startsWith('ending-final-action:')) {
      check(false, `${id}: no mandatory final hold`, { scene: s.scene }); break;
    } else {
      // Enter advances the actual transcript. No E is pressed or held during
      // terminal loss, including its optional resistance window.
      await page.keyboard.press('Enter');
    }
    await sleep(450);
  }
  const done = await state();
  check(sawCredits && sawReturn, `${id}: ordinary narrative input reaches credits and return report`, { visited, elapsedMs: Date.now() - started });
  check(capturedHold, `${id}: the actual final held image is captured after the choreography clears`);
  check(done.meta?.endingsSeen?.includes(id), `${id}: persistent profile records the earned outcome`, done.meta?.endingsSeen);
  check(Object.values(done.meta?.returns?.records || {}).some(record => record.endingId === id), `${id}: return record is committed`, done.meta?.returns?.history);
  if (terminal) check(capturedPeal && !visited.some(scene => String(scene).startsWith('ending-final-action:')), 'terminal peal resolves without any resistance hold', { pealStages: [...pealStages], visited });
  if (checkRecordingHere) check(recordingExercised && recordingCompleted, 'conditional earned recording receives its full ending callback', { recordingExercised, recordingCompleted });
  traces.push({ mode, id, visited, pealStages: [...pealStages] }); return done;
}
async function optionalResistanceGesture() {
  // This second presentation is isolated from the completed no-E acceptance.
  // It checks only the optional gesture, not a second earned return.
  await page.evaluate(async () => { await window.__probe.reviewEnding('tower-lost', 'defeated'); });
  const before = await until(s => s.cutscene?.embodiment?.syncStage === 4, { timeout: 6500, interval: 35 });
  check(before.cutscene?.embodiment?.syncStage === 4, 'optional gesture review reaches the fourth strike without input');
  await page.keyboard.press('e'); await sleep(90);
  const expressed = await shot('26-optional-resistance-gesture');
  const player = expressed.cutscene?.props?.find(prop => prop.id === 'tower-lost-player');
  check(expressed.cutscene?.embodiment?.finalActionId === 'resist-eighth-strike' && player?.mesh === 'apparition_pose_arm_out',
    'one ordinary E produces the optional player arm deviation', { embodiment: expressed.cutscene?.embodiment, player });
  await sleep(800); const settled = await shot('27-resistance-settles');
  check(settled.cutscene?.props?.find(prop => prop.id === 'tower-lost-player')?.mesh !== 'apparition_pose_arm_out',
    'optional resistance is a brief gesture rather than a held completion task', settled.cutscene?.props);
  const complete = await until(s => s.cutscene?.state?.complete, { timeout: 6000 });
  check(complete.cutscene?.state?.complete, 'the physical peal continues automatically after optional expression');
}
async function run(reduced) {
  mode = reduced ? 'reduced' : 'normal'; let context;
  try {
    context = await boot(reduced, { carryPreset: !presentationOnly && only !== 'lost' });
    if (presentationOnly) {
      // This bounded follow-up validates authored rendering after a presentation
      // fix. Full physical earning/reload/exit evidence remains in the preceding
      // frozen run; the existing God review supplies the ending boundary here.
      const resumedWon = presentationSeedReport && only !== 'lost' ? await seedPresentationBoundary() : false;
      for (const id of only === 'won' ? ['tower-won'] : only === 'lost' ? ['tower-lost'] : ['tower-won', 'tower-lost']) {
        if(id==='tower-lost'&&only!=='lost'){
          // A finalized won run retains its own return record. Lost review
          // requires an independent active run, as in the full-route verifier.
          await context.close();context=await boot(reduced,{carryPreset:false});
        }
        if (!(id === 'tower-won' && resumedWon)) {
          await page.evaluate(async id => window.__probe.reviewEnding(id, id === 'tower-won' ? 'carried' : 'defeated'), id);
        }
        const review = await state();
        traces.push({ mode, presentationPrecondition: { kind: id === 'tower-won' && resumedWon ? 'real completed extraction fixture + actual pending-ending reload' : 'existing God ending review', ending: id, pos: review.pos,
          note: 'Earned ending-boundary location only. Full extraction and defeat earning are not re-proved in this presentation follow-up.' } });
        await finishReturn(id, { terminal: id === 'tower-lost' });
      }
      return;
    }
    let s;
    if (only !== 'lost') {
    s = await shot('01-collapsed-at-crossing');
    check(s.cathedral?.here?.level === 'ground' && carry(s)?.drag && !carry(s).drag.gripped, 'won checkpoint establishes a real collapsed body at the crossing', { cathedral: s.cathedral, carry: carry(s) });
    check(s.sourceStatus?.active === false && s.sourceStatus.phase === 'completed', 'the review checkpoint completes Source exactly like the real tower crossing', s.sourceStatus);
    check((s.settings?.shake !== 'full') === reduced, 'actual motion preference applies', s.settings);
    check(s.cutscene?.state?.reducedMotion === reduced, 'the physical extraction uses the selected motion preference', s.cutscene?.state?.reducedMotion);
      const nave = churchPoint(s, 16, 65), firstLeg = churchPoint(s, 16, 69);
      await aim(0, -.32); await page.keyboard.press('e'); await sleep(350);
      check(carry(await state())?.drag?.gripped, 'ordinary E grips the collapsed Surfer');
      check(await walkTo(firstLeg, 'first-nave-leg'), 'ordinary W moves both bodies down the nave');
      s = await shot('02-first-drag'); const body = carry(s)?.drag?.position;
      await page.keyboard.press('e'); await sleep(200); await aim(0); await hold('w', 450);
      await face(body, -.5);
      const dropped = await shot('03-body-left-on-floor');
      check(!carry(dropped)?.drag?.gripped && near(carry(dropped)?.drag?.position, body), 'ordinary E drops him and walking leaves his body in place');
      const reloadedDrop = await reloadContinue('dropped-body');
      if (carry(reloadedDrop)?.drag?.position) await face(carry(reloadedDrop).drag.position, -.5);
      await shot('04-dropped-body-restored');
      check(carry(reloadedDrop)?.drag?.gripped === false, 'Continue does not silently regrip the body');
      check(await walkTo(carry(reloadedDrop).drag.position, 'return-within-grip-reach', { radius: 2.6 }), 'walk back within ordinary grip reach');
      await face(carry(reloadedDrop).drag.position, -.32); await page.keyboard.press('e'); await sleep(300);
      check(carry(await state())?.drag?.gripped, 'ordinary E takes hold again');
      check(await walkTo(nave, 'actual-nave-anchor'), 'ordinary W reaches the actual mapped nave');
      s = await shot('05-real-nave-beat');
      check(s.cutscene?.state?.cursor >= 2 && s.cutscene.state.fired.includes('drag-through-nave'), 'the actual nave satisfies the physical score', s.cutscene?.state);
      await reloadContinue('gripped-nave'); s = await shot('06-gripped-nave-restored');
      // Stay in the centre aisle until below the last pew at y62.3. Only
      // then move aside to pass the font at y59.2.
      const bypassFont = [churchPoint(s, 16, 61), churchPoint(s, 17.6, 61), churchPoint(s, 17.6, 57.5), churchPoint(s, 16, 57.5), churchPoint(s, 16, 56.3)];
      for (let i = 0; i < bypassFont.length; i++) {
        if (!check(await walkTo(bypassFont[i], `west-approach-${i + 1}`), `ordinary carry clears west approach ${i + 1}`)) {
          throw new Error(`Actual west approach ${i + 1} blocked; inspect preserved trace and player view`);
        }
      }
      s = await shot('07-west-threshold');
      const west = s.doors.find(door => door.id === 'brendan-west-door');
      await face({ x: west.cx, y: west.cy }, -.08);
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('e'); await sleep(250);
        const leaf = (await state()).doors.find(door => door.id === west.id);
        if (doorOpen(leaf) || leaf?.state === 'opening') break;
      }
      await until(s => doorOpen(s.doors.find(door => door.id === west.id)), { timeout: 8000 });
      s = await shot('08-west-door-open');
      check(doorOpen(s.doors.find(door => door.id === west.id)), 'ordinary E opens the actual west leaf', s.doors.find(door => door.id === west.id));
      check(carry(s)?.drag?.gripped, 'opening the threshold does not force a dropped grip');
      await aim(0, -.08);
      for (let i = 0; i < 18; i++) { await hold('w', 250); s = await state(); if (s.scene || s.cathedral?.finale?.stage === 'resolved') break; }
      s = await shot('09-two-bodies-extracted');
      check(s.cathedral?.finale?.stage === 'resolved' && s.cathedral.finale.result === 'won', 'both bodies crossing the actual west door resolves the tower route', { finale: s.cathedral?.finale, pos: s.pos, cutscene: s.cutscene });
      const physical = s.cathedral?.physical;
      check(physical?.bothOutside && physical.player.z <= physical.westPlane.z - .25 + 1e-6
        && physical.body.z <= physical.westPlane.z - 1.1 + 1e-6
        && physical.player.z <= 54.75 + 1e-6 && physical.body.z <= 53.9 + 1e-6,
      'the player and complete prone-body footprint clear the actual west leaf', physical);
      check(s.storedExtraction?.drag?.gripped === true && s.cutscene?.embodiment?.thresholdRegripped === false,
        'the ordinary grip stays continuous through the west threshold', { drag: s.storedExtraction?.drag, embodiment: s.cutscene?.embodiment });
      await finishReturn('tower-won');
    }
    if (only !== 'won') {
      if (only !== 'lost') { await context.close(); context = await boot(reduced, { carryPreset: false }); }
      await page.evaluate(async () => { await window.__probe.reviewEnding('tower-lost', 'defeated'); });
      await sleep(300); s = await shot('20-terminal-peal-start');
      check(s.cutscene?.id === 'tower-lost' && s.cutscene.state.reducedMotion === reduced,
        'isolated terminal review starts its own score with the selected motion preference', s.cutscene?.state);
      await finishReturn('tower-lost', { terminal: true });
      if (!reduced) await optionalResistanceGesture();
    }
  } catch (error) {
    traces.push({ mode, failureState: await state().catch(() => null) }); await shot('failure').catch(() => {}); throw error;
  } finally { if (context) await context.close(); }
}

await mkdir(out, { recursive: true });
try {
  profile = await mkdtemp(join(tmpdir(), 'chunk-surfer-tower-ending-'));
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    protocolTimeout: 120000, userDataDir: profile,
    args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disk-cache-size=1048576', '--media-cache-size=1048576', '--disable-gpu-shader-disk-cache'] });
  await run(false); if (!process.env.TOWER_ENDING_NORMAL_ONLY) await run(true);
} catch (error) { fatal = String(error.stack || error); errors.push({ mode, stage, fatal }); console.error(fatal); }
finally {
  if (browser) await browser.close(); if (profile) await rm(profile, { recursive: true, force: true });
  for (const pending of pendingImages) {
    try { await writeFile(pending.path, pending.bytes); pending.capture.path = pending.path; delete pending.capture.pendingPath; }
    catch (error) { errors.push({ mode: pending.capture.mode, stage: pending.capture.name, artifactError: String(error) }); }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url,
    scope: presentationOnly
      ? 'Frozen production page in actual Chromium/Metal. Bounded presentation follow-up: when an earned-position fixture is selected, its real completed extraction plus pending Tower-won ending is loaded through an actual page reload and native Continue; otherwise the existing God review supplies the won boundary. The isolated God ending review establishes the lost crossing boundary. Ordinary Enter reaches the actual authored held image, credits and return. Default choreography remains enabled; no exposure override is used unless a separately labeled diagnostic A/B is selected. Whole-route earning is not re-proved here. No served source, shader or module substitution.'
      : 'Frozen production page in actual Chromium/Metal. When selected, a diagnostic won-fight checkpoint establishes the collapsed body; ordinary E/W performs extraction and actual reload + title Continue verifies persistence. An isolated terminal review establishes the defeat-ending presenter precondition; ordinary Enter completes it without E/resistance. A separate fourth-strike E tests optional expression. No served source, shader or module substitution. This does not prove a whole campaign, three earned combat defeats or perceptual headphone acceptance.',
    selected: { only: only || 'won-and-lost', normalOnly: !!process.env.TOWER_ENDING_NORMAL_ONLY,
      presentationOnly,
      holdOnly,
      presentationSeed: presentationSeedPath ? resolve(presentationSeedPath) : null,
      recordingFlagPrecondition: recordingCheck ? 'station.recordist.complete=true; personal-journey earning proved separately' : null },
    exposureAB,
    recordingCheck, production, checks, captures, traces, errors }, null, 2));
}
process.exit(fatal || errors.length || checks.some(item => !item.pass) ? 1 : 0);
