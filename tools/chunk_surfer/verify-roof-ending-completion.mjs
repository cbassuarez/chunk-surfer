// Bounded native-3D browser proof of the already-consented Ren ending. The
// personal errand is an explicit fixture; dialogue, palm action, held image,
// return commit, coda and credits use the ordinary game input/update path.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const out = resolve(process.env.ROOF_COMPLETION_OUT || 'artifacts/roof-floor-design/live/ending-native-completion');
const port = Number(process.env.ROOF_COMPLETION_PORT || 5360);
const reducedMotion = process.env.ROOF_COMPLETION_REDUCED === '1';
const baseUrl = process.env.ROOF_COMPLETION_BASE_URL || `http://127.0.0.1:${port}`;
const url = `${baseUrl}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&renderer=3d`;
const report = {
  url, renderer: '3d', angle: 'metal', reducedMotion, viewport: { width: 960, height: 600 },
  scope: 'Headless Chrome with the native WebGL renderer; an already-consented personal-errand fixture. This does not prove earning the quest, the Tauri shell, or human perception.',
  checks: [], actions: [], captures: [], errors: [],
};
const sleep = ms => new Promise(done => setTimeout(done, ms));
const pendingFrames = [];
let server, browser, profile, page, stage = 'boot';
const sourcePaths = ['src/main.js', 'src/data/endings.js', 'src/data/academic-roof.js',
  'src/game/roof-ren.js', 'src/render/props3d.js', 'src/render/tower-personal-meshes.js',
  'content/narrative/ending.sacrifice.century-stay.story.json',
  'content/narrative/ending.epilogue.century-stay.story.json', 'public/assets/conservatory-props.glb'];
async function hashes() {
  return Object.fromEntries(await Promise.all(sourcePaths.map(async path => {
    const bytes = await readFile(path);
    return [path, { bytes: bytes.length, sha1: createHash('sha1').update(bytes).digest('hex'),
      sha256: createHash('sha256').update(bytes).digest('hex') }];
  })));
}
function check(pass, name, detail = null) {
  report.checks.push({ pass: !!pass, name, detail });
  console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail));
}
async function state() {
  return page.evaluate(() => {
    const meta = window.__probe?.meta?.();
    const records = Object.values(meta?.returns?.records || {});
    const raw = localStorage.getItem('chunk-surfer:save:v4');
    const save = raw ? JSON.parse(raw) : null;
    return {
      scene: window.__scenes?.top?.()?.id || null,
      view: window.__scenes?.top?.()?.view?.() || null,
      ending: window.__probe?.endingCutscene?.() || null,
      choreography: window.__probe?.windowChoreographyDebug?.() || null,
      pos: window.__probe?.pos?.(), floor: window.__probe?.floorH?.(),
      heldImage: document.documentElement.dataset.endingWorldHold === 'true',
      save: { roofRen: save?.roofRen, endingCutscene: save?.endingCutscene, run: save?.run },
      meta: { achievements: Object.keys(meta?.achievements || {}),
        lastReturn: records.find(record => record.id === meta?.returns?.history?.at(-1)) || null,
        returnCount: records.length, history: meta?.returns?.history || [] },
    };
  });
}
async function shot(name) {
  stage = name;
  const snapshot = await state();
  const path = join(out, `${name}.webp`);
  // Keep image bytes in memory until Chrome closes to avoid a large swap and
  // screenshot write competing during Metal captures on a nearly full disk.
  pendingFrames.push({ path, bytes: await page.screenshot({ type: 'webp', quality: 88 }) });
  report.captures.push({ name, path, state: snapshot });
  console.log('CAPTURE', name, JSON.stringify({ scene: snapshot.scene,
    roofSealStage: snapshot.ending?.embodiment?.roofSealStage, heldImage: snapshot.heldImage }));
  return snapshot;
}
async function advanceTranscript(expectedPrefix, maxMs = 45000) {
  const seen = new Map(), started = Date.now();
  for (let count = 0; count < 240 && Date.now() - started < maxMs; count++) {
    const snapshot = await state();
    if (snapshot.scene !== 'finale') return { snapshot, seen: [...seen.values()] };
    const view = snapshot.view;
    if (!view?.lineContentId?.startsWith(expectedPrefix))
      throw new Error(`Unexpected transcript: ${view?.lineContentId}`);
    seen.set(view.lineSourceId, { id: view.lineSourceId, text: view.line?.text });
    if ((view.lineAge || 0) < .28) await sleep(Math.ceil((.29 - (view.lineAge || 0)) * 1000));
    await page.keyboard.press('Enter');
    await sleep(20);
  }
  throw new Error(`Transcript did not finish within bound: ${expectedPrefix}`);
}

try {
  await mkdir(out, { recursive: true });
  report.startedAt = new Date().toISOString();
  report.sourceStart = await hashes();
  if (!process.env.ROOF_COMPLETION_BASE_URL) {
    server = await createServer({ configFile: 'vite.config.js',
      server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
    await server.listen();
  }
  profile = await mkdtemp(join(tmpdir(), 'chunk-roof-completion-'));
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, userDataDir: profile, protocolTimeout: 120000,
    args: ['--no-sandbox', '--enable-webgl', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  await page.setViewport({ ...report.viewport, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  page.on('pageerror', error => report.errors.push({ stage, type: 'pageerror', message: String(error.stack || error) }));
  page.on('console', message => {
    const text = message.text();
    if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(text))
      report.errors.push({ stage, type: 'console', message: text });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__probe?.testRun && window.__scenes?.top?.()?.id, { timeout: 120000 });
  if ((await state()).scene === 'eula') {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'eula', { timeout: 20000 });
  }
  const fixture = await page.evaluate(async reducedMotion => {
    await window.__probe.testRun();
    window.__probe.tutSkip(); window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels', 'combat.trained', 'setup.waypoint', 'academic.entered', 'roof.access']);
    const resource = path => performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === path)?.name || path;
    const { freshRoofRenState, reduceRoofRen } = await import(resource('/src/game/roof-ren.js'));
    const { CENTURY_STAY_STAGING } = await import(resource('/src/data/endings.js'));
    const { saveCommit, getSave } = await import(resource('/src/game/save.js'));
    // Match the actual, supported-glass ritual position used by the ending.
    window.__probe.warpCell(CENTURY_STAY_STAGING.player.x, CENTURY_STAY_STAGING.player.y);
    const seed = freshRoofRenState();
    Object.assign(seed, { stage: 'returned', met: true, indexRead: true, traceRead: true,
      cabinetOpened: true, envelopeRead: true, releaseSigned: true, tapeHonesty: 'respected',
      rewardGranted: true, sealOffered: true });
    for (const key of Object.keys(seed.history)) seed.history[key] = true;
    const withContrary = reduceRoofRen(seed, 'evidence-contrary');
    const withGuarantor = reduceRoofRen(withContrary.state, 'evidence-guarantor');
    const consent = reduceRoofRen(withGuarantor.state, 'consent-seal', { acceptedTakes: 2, noticeRead: true });
    saveCommit({ roofRen: consent.state, settings: { ...getSave().settings, shake: reducedMotion ? 'reduced' : 'full' } });
    window.__probe.playEnding('sacrifice', 'agreed', { variant: 'century-stay' });
    return consent;
  }, reducedMotion);
  report.fixture = fixture;
  check(fixture.state.sealConsented && fixture.effects.some(effect => effect.type === 'start-ritual'),
    'explicit fixture consent passes the real Ren reducer');
  // The directed scene starts under a brief black transition. Capture the
  // first visible Ren/glass frame rather than the transition's empty frame.
  await sleep(1100);
  const early = await shot('01-ritual-start');
  check(early.save.endingCutscene?.variant === 'century-stay', 'century-stay checkpoint written', early.save.endingCutscene);
  check(early.choreography?.composition === null, 'generic media panes absent', early.choreography?.composition);
  const ritual = await advanceTranscript('finale:ending:ending.sacrifice.century-stay:');
  report.ritualLines = ritual.seen;
  check(ritual.seen.length === 18, 'all eighteen ritual lines traversed by ordinary Enter input', ritual.seen.map(line => line.id));
  await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'ending-action:sacrifice', { timeout: 15000 });
  const awaitingPalm = await shot('02-palm-action-ready');
  check(awaitingPalm.ending?.state?.complete && awaitingPalm.ending?.embodiment?.roofSealStage === 5,
    'all five embodied ritual beats resolve before palm action', awaitingPalm.ending?.embodiment);
  await sleep(700);
  const idle = await state();
  check(idle.scene === 'ending-action:sacrifice' && !idle.save.roofRen.ritualComplete
    && !idle.ending.embodiment.finalActionId, 'palm action waits for actual held input');
  const palmStarted = Date.now();
  await page.keyboard.down('e');
  await sleep(650);
  const midway = await shot('03-palm-held-midway');
  check(midway.scene === 'ending-action:sacrifice' && !midway.save.roofRen.ritualComplete,
    'a partial palm hold cannot commit the return');
  await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'ending-hold:sacrifice',
    { timeout: 20000, polling: 50 });
  await page.keyboard.up('e');
  const palmMs = Date.now() - palmStarted;
  report.actions.push({ type: 'hold', input: 'E', id: 'keep-palm-on-roof-glass', wallMs: palmMs });
  const holdStarted = Date.now();
  const held = await shot('04-final-world-hold');
  check(held.heldImage && held.ending?.embodiment?.finalHold
    && held.ending?.embodiment?.finalActionId === 'keep-palm-on-roof-glass',
    'actual palm hold enters the authored final world image', { palmMs, embodiment: held.ending?.embodiment });
  check(held.ending?.props?.some(prop => prop.id === 'ending-roof-ren')
    && held.ending?.props?.some(prop => prop.id === 'ending-roof-guarantor')
    && held.ending?.props?.some(prop => prop.id === 'ending-roof-imprint'),
    'Ren, guarantor and bound imprint share the final physical scene', held.ending?.props);
  check(!held.save.roofRen.ritualComplete && held.save.endingCutscene?.variant === 'century-stay',
    'return remains uncommitted while final image is held');
  await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'finale'
    && window.__scenes.top().view?.().lineContentId?.startsWith('finale:guard-epilogue:sacrifice:'),
    { timeout: 20000, polling: 50 });
  const holdObservedMs = Date.now() - holdStarted;
  const committed = await shot('05-committed-century-coda');
  report.actions.push({ type: 'natural-final-hold', observedWallMs: holdObservedMs, input: null });
  check(holdObservedMs >= 3200, 'final image receives its natural 4.2-second hold without confirm input', { holdObservedMs });
  check(committed.save.roofRen.ritualComplete && !committed.save.endingCutscene,
    'ritual completes and checkpoint clears only after held image', committed.save);
  check(committed.meta.lastReturn?.endingId === 'sacrifice'
    && committed.meta.lastReturn?.endingVariant === 'century-stay'
    && committed.meta.lastReturn?.seal?.years === 100,
    'return files the existing Seal with the century-stay variant', committed.meta.lastReturn);
  check(committed.meta.achievements.includes('ACH_CENTURY_STAY'),
    'committed return unlocks ACH_CENTURY_STAY', committed.meta.achievements);
  const coda = await advanceTranscript('finale:guard-epilogue:sacrifice:');
  report.codaLines = coda.seen;
  check(coda.seen.length === 11 && coda.seen.some(line => /funeral notice/.test(line.text || '')),
    'all eleven century coda lines traverse including the personal cost', coda.seen.map(line => line.id));
  await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'credits', { timeout: 20000 });
  const credits = await shot('06-credits-after-coda');
  check(credits.meta.returnCount === committed.meta.returnCount
    && credits.meta.lastReturn?.id === committed.meta.lastReturn?.id,
    'coda reaches credits without filing another return', { before: committed.meta.returnCount, after: credits.meta.returnCount });
  check(report.errors.length === 0, 'no shader or page errors', report.errors);
} catch (error) {
  report.errors.push({ stage, type: 'fatal', message: String(error.stack || error) });
  console.error('FATAL', error);
} finally {
  await browser?.close();
  await server?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  report.sourceEnd = await hashes();
  check(sourcePaths.every(path => report.sourceStart?.[path]?.sha256 === report.sourceEnd[path].sha256),
    'verified source and GLB remained stable during the run');
  for (const frame of pendingFrames) await writeFile(frame.path, frame.bytes);
  report.finishedAt = new Date().toISOString();
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', join(out, 'report.json'));
}
// Vite or Chrome can leave a live handle after their close promises resolve.
// The report has been flushed, so make this bounded verifier's result final.
process.exit(report.errors.length || report.checks.some(item => !item.pass) ? 1 : 0);
