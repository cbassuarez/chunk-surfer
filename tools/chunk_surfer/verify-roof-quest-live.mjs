// Native browser acceptance for Ren's roof quests. The fixture supplies one
// accepted take and a read demolition notice; every Ren/office/ending decision
// below is made through the game's ordinary world and conversation input.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ACADEMIC_ROOF } from '../../src/data/academic-roof.js';

const out = resolve(process.env.ROOF_QUEST_OUT || 'artifacts/roof-floor-design/live-quest');
const port = Number(process.env.ROOF_QUEST_PORT || 5354);
const renderer = process.env.ROOF_QUEST_RENDERER || '3d';
const angle = process.env.ROOF_QUEST_ANGLE || 'swiftshader';
const resumeOnly = process.env.ROOF_QUEST_RESUME === 'ending';
const lockedOnly = process.env.ROOF_QUEST_LOCK_CASE === 'warning';
const officeFocusOnly = process.env.ROOF_QUEST_PROBE_OFFICE === '1';
const baseUrl = process.env.ROOF_QUEST_BASE_URL || `http://127.0.0.1:${port}`;
const url = `${baseUrl}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&renderer=${encodeURIComponent(renderer)}`;
await mkdir(out, { recursive: true });
const report = { url, renderer, checks: [], actions: [], captures: [], errors: [] };
const server = process.env.ROOF_QUEST_BASE_URL ? null
  : await createServer({ configFile: 'vite.config.js', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
if (server) await server.listen();
const profile = process.env.ROOF_QUEST_PROFILE || await mkdtemp(join(tmpdir(), 'chunk-roof-quest-'));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, userDataDir: profile, protocolTimeout: 120000,
  args: renderer === '3d'
    ? ['--no-sandbox', '--enable-webgl', `--use-angle=${angle}`, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []), '--autoplay-policy=no-user-gesture-required']
    : ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
const sleep = ms => new Promise(done => setTimeout(done, ms));
let stage = 'boot';
let memoryFoldCaptured = false;
page.on('pageerror', error => report.errors.push({ stage, type: 'pageerror', message: String(error.stack || error) }));
page.on('requestfailed', request => report.errors.push({
  stage, type: 'requestfailed', url: request.url(), message: request.failure()?.errorText || 'failed',
}));
page.on('console', message => {
  const value = message.text();
  if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(value))
    report.errors.push({ stage, type: 'console', message: value });
});
function check(pass, name, detail) {
  report.checks.push({ pass: !!pass, name, detail });
  console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? null));
  return !!pass;
}
async function snapshot() {
  return page.evaluate(() => ({
    pos: window.__probe?.pos?.(),
    focus: window.__probe?.interactionFocus?.(),
    scene: window.__scenes?.top?.()?.id || null,
    view: window.__scenes?.top?.()?.view?.() || null,
    flags: { roofAccess: window.__probe?.flag?.('roof.access') },
    keys: window.__probe?.keys?.(),
    ending: window.__probe?.endingCutscene?.(),
    meta: (() => {
      const meta = window.__probe?.meta?.();
      const id = meta?.returns?.history?.at(-1);
      return { achievements: Object.keys(meta?.achievements || {}),
        lastReturn: id ? meta.returns.records?.[id] || null : null };
    })(),
    save: (() => {
      const raw = localStorage.getItem('chunk-surfer:save:v4');
      return raw ? JSON.parse(raw) : null;
    })(),
  }));
}
async function shot(name) {
  stage = name; await sleep(200);
  const state = await snapshot();
  const path = join(out, `${name}.webp`);
  await page.screenshot({ path, type: 'webp', quality: 85 });
  report.captures.push({ name, path, pos: state.pos, scene: state.scene, focus: state.focus,
    roofRen: state.save?.roofRen, endingCutscene: state.save?.endingCutscene });
  console.log('CAPTURE', name, path);
  return state;
}
async function press(key) { await page.keyboard.press(key); }
async function aimFrom(x, y, targetX, targetY, pitch = -.03) {
  await page.evaluate(({ x, y, targetX, targetY, pitch }) => {
    window.__probe.warpCell(x, y);
    const here = window.__probe.pos();
    // inspectAt is authored in metres; +1 would aim at the next cell centre.
    const to = { x: targetX * 2, y: targetY * 2 };
    window.__probe.lookAtWorld(Math.atan2(to.x - here.x, -(to.y - here.y)), pitch);
  }, { x, y, targetX, targetY, pitch });
  await sleep(120);
  return snapshot();
}
async function focusProp(id, positions, target) {
  for (const [x, y] of positions) {
    for (const pitch of [-.03, -.15, .08]) {
      const state = await aimFrom(x, y, target[0], target[1], pitch);
      if (state.focus?.propId === id) return state;
    }
  }
  return snapshot();
}
async function officeFocusDiagnostic(ids, target) {
  return page.evaluate(async ({ ids, target }) => {
    const resource = path => performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === path)?.name || path;
    const props = await import(resource('/src/game/props.js'));
    const pos = window.__probe.pos();
    const heading = Math.atan2(target[0] * 2 - pos.x, -(target[1] * 2 - pos.y));
    const direct = props.pickProp(pos.x, pos.y, window.__probe.facing(), 3.2, { yaw: heading, pitch: -.03 });
    return { pos, floor: window.__probe.floorH(), heading, look: window.__probe.lookAngles(), direct: direct?.id || null,
      props: ids.map(id => {
        const p = props.propById(id);
        return p ? { id, x: p.x, y: p.y, interactionX: p.interactionX, interactionY: p.interactionY,
          floor: p.floor, elevation: p.elevation, interactive: p.interactive,
          verticallyReachable: props.propWithinVerticalReach(pos.x, pos.y, p) } : { id, missing: true };
      }) };
  }, { ids, target });
}
async function interact(id, positions, target) {
  stage = `focus:${id}`;
  const state = await focusProp(id, positions, target);
  if (!check(state.focus?.propId === id && !state.focus?.doorWins, `${id} focuses in world`,
    { focus: state.focus, at: state.pos, target })) return false;
  await press('e'); await sleep(120);
  report.actions.push({ type: 'world-e', id, pos: state.pos });
  return true;
}
async function conversation(route, expectedScene) {
  const thoughtScene = `thought:${expectedScene}`;
  let choice = 0;
  const visited = [];
  for (let guard = 0; guard < 500; guard++) {
    const s = await snapshot();
    if (s.scene !== thoughtScene) {
      check(choice === route.length, `${expectedScene} choices completed`, { choice, expected: route.length, scene: s.scene });
      return { choice, visited, exit: s.scene };
    }
    const view = s.view;
    if (!view) throw new Error(`No view for ${expectedScene}`);
    if (view.pending?.kind === 'branch') {
      const wanted = route[choice];
      if (!wanted) throw new Error(`Unexpected branch at ${view.nodeId}: ${view.pending.options.map(c => c.id).join(', ')}`);
      const index = view.pending.options.findIndex(option => option.id === `roof-ren.${wanted}`);
      if (index < 0) throw new Error(`Choice ${wanted} absent at ${view.nodeId}: ${view.pending.options.map(c => c.id).join(', ')}`);
      if (index >= 9) throw new Error(`Choice ${wanted} requires unsupported key ${index + 1}`);
      await press(String(index + 1));
      report.actions.push({ type: 'choice', scene: expectedScene, node: view.nodeId, id: wanted, index });
      choice++; continue;
    }
    if (!visited.some(item => item.node === view.nodeId && item.text === view.line?.text))
      visited.push({ node: view.nodeId, text: view.line?.text || '' });
    if (!memoryFoldCaptured && view.line?.text?.startsWith('Ren answers her before')) {
      memoryFoldCaptured = true;
      await sleep(1000);
      await shot('memory-fold-pulse');
    }
    if (view.lineAge < .26 && !view.typing) await sleep(Math.ceil((.27 - view.lineAge) * 1000));
    await press('Enter');
    await sleep(8);
  }
  throw new Error(`${expectedScene} did not exit in 500 input steps; choice ${choice}/${route.length}`);
}
async function noticeFixture() {
  return page.evaluate(async () => {
    const resource = path => performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === path)?.name || path;
    const props = await import(resource('/src/game/props.js'));
    const save = await import(resource('/src/game/save.js'));
    const line = props.inspectProp('yard-sign');
    save.saveCommit({ props: props.savePropState() });
    return { line, inspected: props.propState().inspected.has('yard-sign') };
  });
}

async function finishCenturyEnding() {
  let held = false;
  for (let guard = 0; guard < 180; guard++) {
    const s = await snapshot();
    if (s.save?.roofRen?.ritualComplete) return s;
    if (s.scene === 'finale') {
      if (s.view?.lineAge < .26 && !s.view?.typing) await sleep(Math.ceil((.27 - s.view.lineAge) * 1000));
      await press('Enter');
      await sleep(12);
    } else if (s.scene === 'ending-action:sacrifice') {
      if (!held) {
        held = true;
        const heldAt = Date.now();
        await page.keyboard.down('e');
        try {
          await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'ending-action:sacrifice',
            { timeout: 20000, polling: 100 });
        } catch (error) {
          await shot('ending-action-still-held');
          throw new Error(`Palm hold did not finish after ${Date.now() - heldAt}ms: ${String(error.message || error)}`);
        }
        await page.keyboard.up('e');
        report.actions.push({ type: 'hold', id: 'keep-palm-on-roof-glass', ms: Date.now() - heldAt });
      } else await sleep(200);
    } else if (s.scene?.startsWith('ending-resolution:') || s.scene?.startsWith('ending-hold:')) {
      await sleep(300);
    } else if (s.scene) {
      // Guard epilogue begins after commit; this route is already complete.
      await sleep(100);
    } else await sleep(100);
  }
  throw new Error(`Century ending did not commit within 180 steps; current scene ${(await snapshot()).scene}`);
}

try {
  console.log('SERVER READY', server?.resolvedUrls?.local?.[0] || baseUrl);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__probe?.testRun && window.__scenes?.top?.()?.id, { timeout: 120000 });
  await page.evaluate(async () => {
    await window.__probe.testRun();
    window.__probe.tutSkip();
    window.__probe.hush?.();
  });
  if (officeFocusOnly) {
    await page.evaluate(() => window.__probe.setFlags(['setup.levels', 'combat.trained', 'setup.waypoint', 'academic.entered']));
    const office = [
      ['academic-roof-effects-index', [[16, 275], [15.5, 275], [16, 274]], [16, 274]],
      ['academic-roof-pressure-pad', [[12, 275], [11.5, 275], [12, 274]], [12, 274]],
      ['academic-stripped-office-cabinet', [[14, 273], [13.5, 273], [14, 272]], [14, 272]],
    ];
    for (const [id, positions, target] of office) {
      const s = await focusProp(id, positions, target);
      check(s.focus?.propId === id && !s.focus?.doorWins,
        `${id} focuses in native office`, { focus: s.focus, at: s.pos, target,
          ...(s.focus?.propId !== id ? { diagnostic: await officeFocusDiagnostic(office.map(row => row[0]), target) } : {}) });
      await shot(`office-focus-${id}`);
    }
  } else if (resumeOnly) {
    const resumed = await snapshot();
    check(resumed.save?.endingCutscene?.variant === 'century-stay',
      'saved century-stay checkpoint restored', { scene: resumed.scene, checkpoint: resumed.save?.endingCutscene });
    await shot('01-resumed-century-seal');
    const finished = await finishCenturyEnding();
    await shot('02-century-seal-return-committed');
    check(finished.save?.roofRen?.ritualComplete && !finished.save?.endingCutscene,
      'ritual completes and checkpoint clears after ending return',
      { ren: finished.save?.roofRen, endingCutscene: finished.save?.endingCutscene });
    check(finished.meta?.lastReturn?.endingId === 'sacrifice'
      && finished.meta?.lastReturn?.endingVariant === 'century-stay',
      'existing Seal ending is filed with century-stay variant', finished.meta?.lastReturn);
    check(finished.meta?.achievements?.includes('ACH_CENTURY_STAY'),
      'A Hundred More Years achievement unlocked by committed return', finished.meta?.achievements);
  } else {
  await page.evaluate(() => {
    window.__probe.setFlags(['setup.levels', 'combat.trained', 'setup.waypoint', 'academic.entered'], ['roof.access']);
  });
  const gateTarget = [ACADEMIC_ROOF.gate.x, ACADEMIC_ROOF.gate.y];
  const gatePositions = [[46,258],[45,258],[46,259],[46,257],[45,259]];
  if (await interact('roof-gate', gatePositions, gateTarget)) {
    const denied = await shot('01-gate-before-take');
    check(denied.flags.roofAccess === false, 'gate refuses before accepted take', denied.flags);
  }
  const fixture = await page.evaluate(() => window.__probe.setTakes(['main_b3', 'the_tub'], true));
  check(fixture?.ok && ['main_b3', 'the_tub'].every(id => fixture.takes?.includes(id)), 'two accepted take fixtures installed', fixture);
  check((await noticeFixture()).inspected, 'demolition notice fixture installed');
  if (await interact('roof-gate', gatePositions, gateTarget)) {
    const opened = await shot('02-gate-after-take');
    check(opened.flags.roofAccess === true && opened.keys?.includes('master'),
      'east-gallery door opens with school key and accepted take', {flags:opened.flags,keys:opened.keys});
  }

  const renTarget = [ACADEMIC_ROOF.ren.x, ACADEMIC_ROOF.ren.y + 1];
  const renPositions = [[210, 275], [209, 275], [211, 275], [210, 276], [209, 276]];
  if (await interact('roof-ren', renPositions, renTarget)) {
    await shot('03-ren-first-request');
    await conversation(['ask-person', 'ask-want', 'want-risk', 'accept-memory'], 'roof-ren');
    const s = await snapshot();
    check(s.save?.roofRen?.stage === 'accepted', 'first request accepted through dialogue', s.save?.roofRen);
  }

  const indexPositions = [[16, 275], [15.5, 275], [16, 274], [15, 274]];
  if (await interact('academic-roof-effects-index', indexPositions, [16, 274])) {
    await shot('04-office-index');
    await conversation(['office-index'], 'roof-office:academic-roof-effects-index');
  }
  const padPositions = [[12, 275], [11.5, 275], [12, 274], [11, 274]];
  if (await interact('academic-roof-pressure-pad', padPositions, [12, 274])) {
    await shot('04a-reception-pressure-pad');
    await conversation(['office-trace'], 'roof-office:academic-roof-pressure-pad');
    const s = await snapshot();
    check(s.save?.roofRen?.indexRead && s.save?.roofRen?.traceRead,
      'index and separate reception-pad indentation saved', s.save?.roofRen);
  }
  const cabinetPositions = [[14, 273], [13.5, 273], [14, 272], [15, 273], [13, 272]];
  if (await interact('academic-stripped-office-cabinet', cabinetPositions, [14, 272])) {
    await shot('05-office-warning');
    await conversation(['office-cabinet', 'office-envelope', 'office-leave-warning'], 'roof-office:academic-stripped-office-cabinet');
    const s = await snapshot();
    check(s.save?.roofRen?.stage === 'accepted' && s.save?.roofRen?.warningRespected,
      'respecting written refusal remains a playable decision', s.save?.roofRen);
  }
  if (await interact('roof-ren', renPositions, renTarget)) {
    await shot('06-ren-warning-respected');
    await conversation(['left-tell', 'left-change'], 'roof-ren');
    const s = await snapshot();
    check(s.save?.roofRen?.stage === 'accepted' && !s.save?.roofRen?.rewardGranted,
      'telling Ren about refusal does not force cassette handoff', s.save?.roofRen);
  }
  if (await interact('academic-stripped-office-cabinet', cabinetPositions, [14, 272])) {
    await shot('07-office-release');
    await conversation(['office-cabinet', 'office-envelope', 'office-take', 'office-keep-private'], 'roof-office:academic-stripped-office-cabinet');
    const s = await snapshot();
    check(s.save?.roofRen?.stage === 'carrying' && s.save?.items?.includes('ren-home-cassette'),
      'signed release grants the private cassette', { ren: s.save?.roofRen, items: s.save?.items });
  }
  if (await interact('roof-ren', renPositions, renTarget)) {
    await shot('08-return-cassette');
    await conversation(['return-sealed', 'memory-complete', 'reward-leave'], 'roof-ren');
    const s = await snapshot();
    check(s.save?.roofRen?.stage === 'returned' && s.save?.roofRen?.rewardGranted,
      'honest return grants independent reward', s.save?.roofRen);
    check(s.keys?.includes('ren-service') && s.save?.items?.includes('ren-service-key') && !s.save?.items?.includes('ren-home-cassette'),
      'reward is in keyring and cassette returned', { keys: s.keys, items: s.save?.items });
  }

  // The ladder is deliberately tested before the larger ask: Ren's useful
  // reward must not be held hostage by the century seal.
  const ladderTop = ACADEMIC_ROOF.ladderTop;
  const ladderBottom = ACADEMIC_ROOF.ladderBottom;
  if (await interact('roof-shortcut-top', [[ladderTop.x - 1, ladderTop.y + 1], [ladderTop.x, ladderTop.y + 1], [ladderTop.x - 1, ladderTop.y], [ladderTop.x, ladderTop.y - 1]], [ladderTop.x - 1, ladderTop.y])) {
    await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'academic-roof-ladder',
      { timeout: 15000, polling: 100 });
    const s = await shot('09-shortcut-descended');
    check(s.pos && Math.hypot(s.pos.x - (ladderBottom.x * 2 + 1), s.pos.y - (ladderBottom.y * 2 + 1)) < 4,
      'keyed shortcut reaches lower gallery', s.pos);
  }
  const savedBeforeReload = await snapshot();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__probe?.testRun && window.__scenes?.top?.()?.id, { timeout: 120000 });
  await page.evaluate(async () => { await window.__probe.testRun(); window.__probe.tutSkip(); });
  const restored = await snapshot();
  check(restored.save?.roofRen?.stage === 'returned' && restored.save?.roofRen?.rewardGranted,
    'quest and reward survive reload', restored.save?.roofRen);
  check(restored.keys?.includes('ren-service'), 'shortcut key restores after reload', restored.keys);
  check(savedBeforeReload.save?.roofRen?.stage === restored.save?.roofRen?.stage, 'reload preserves same quest stage');
  if (await interact('roof-shortcut-bottom', [[ladderBottom.x - 1, ladderBottom.y + 1], [ladderBottom.x, ladderBottom.y + 1], [ladderBottom.x - 1, ladderBottom.y], [ladderBottom.x, ladderBottom.y - 1]], [ladderBottom.x - 1, ladderBottom.y - 1])) {
    await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'academic-roof-ladder',
      { timeout: 15000, polling: 100 });
    const s = await shot('10-shortcut-ascended');
    check(s.pos && Math.hypot(s.pos.x - (ladderTop.x * 2 + 1), s.pos.y - (ladderTop.y * 2 + 1)) < 4,
      'keyed shortcut returns to roof', s.pos);
  }

  if (await interact('roof-ren', renPositions, renTarget)) {
    await shot('11-ren-second-request');
    if (lockedOnly) {
      await conversation([
        'resume', 'mother', 'home-boundary', 'boundary-clear', 'warning-dismiss',
      ], 'roof-ren');
      const missed = await shot('12-warning-confidence-missed');
      check(missed.save?.roofRen?.locks?.warningDismissed === true
        && missed.save?.roofRen?.rewardGranted === true
        && missed.keys?.includes('ren-service')
        && !missed.save?.roofRen?.sealOffered,
      'explicitly dismissing the double refusal closes the seal without revoking the cassette reward',
      { ren: missed.save?.roofRen, keys: missed.keys });
    } else {
      await conversation([
        'resume', 'mother', 'home-boundary', 'boundary-clear', 'warning-hold-boundary',
        'witness-skeptic', 'witness-careful-next', 'city-consequence',
        'uncertainty-demand', 'dissent-seek',
      ], 'roof-ren');
      const beforeDissent=await shot('11a-ren-sends-to-contrary-witness');
      check(!beforeDissent.save?.roofRen?.sealOffered && !beforeDissent.save?.roofRen?.contraryAccountHeard,
        'Ren cannot offer a seal before the contrary witness', beforeDissent.save?.roofRen);
      if(await interact('academic-roof-contrary-account',[[18,266],[18.5,266],[19,266],[18,267]], [18.4,266.2])){
        await conversation(['contrary-listen','contrary-remember'],'roof-evidence:academic-roof-contrary-account');
        const evidence=await shot('11b-cleared-room-contrary-account');
        check(evidence.save?.roofRen?.contraryAccountHeard,
          'opposed spirit account earned by reading in the cleared room', evidence.save?.roofRen);
      }
      if(await interact('roof-ren',renPositions,renTarget)){
        await conversation([
          'resume','dissent-account','dissent-ask-ren','motives-suspicion',
          'admission-accountable','guarantor-seek',
        ],'roof-ren');
        const beforeTrace=await shot('11c-ren-sends-to-prior-guarantor');
        check(!beforeTrace.save?.roofRen?.sealOffered && !beforeTrace.save?.roofRen?.guarantorTraceRead,
          'Ren cannot offer a seal before the earlier guarantor is known', beforeTrace.save?.roofRen);
      }
      if(await interact('academic-roof-guarantor-trace',[[5,245],[5,244],[4.5,245],[6,245]], [5,245.2])){
        await conversation(['guarantor-read','guarantor-remember'],'roof-evidence:academic-roof-guarantor-trace');
        const evidence=await shot('11d-chamber-guarantor-trace');
        check(evidence.save?.roofRen?.guarantorTraceRead,
          'prior guarantor trace earned by reading in the chamber room', evidence.save?.roofRen);
      }
      if(await interact('roof-ren',renPositions,renTarget)){
        await conversation([
          'resume','previous-question','previous-terms','seal-hear-terms','terms-cost',
          'cost-read-back','cost-right-to-no','freedom-consent','consent-explicit',
        ],'roof-ren');
      }
    await sleep(600);
    const rite = await shot('12-century-seal-start');
    check(rite.save?.roofRen?.sealConsented && rite.save?.endingCutscene?.variant === 'century-stay',
      'explicit dialogue consent starts century-stay ending cutscene',
      { ren: rite.save?.roofRen, endingCutscene: rite.save?.endingCutscene, scene: rite.scene });
    const finished = await finishCenturyEnding();
    await shot('13-century-seal-return-committed');
    check(finished.save?.roofRen?.ritualComplete && !finished.save?.endingCutscene,
      'ritual completes and checkpoint clears after ending return',
      { ren: finished.save?.roofRen, endingCutscene: finished.save?.endingCutscene });
    check(finished.meta?.lastReturn?.endingId === 'sacrifice'
      && finished.meta?.lastReturn?.endingVariant === 'century-stay',
    'existing Seal ending is filed with century-stay variant', finished.meta?.lastReturn);
    check(finished.meta?.achievements?.includes('ACH_CENTURY_STAY'),
      'A Hundred More Years achievement unlocked by committed return', finished.meta?.achievements);
    }
  }
  }
} catch (error) {
  report.errors.push({ stage, type: 'fatal', message: String(error.stack || error) });
  console.error('FATAL', error);
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', join(out, 'report.json'));
  await browser.close();
  if (!process.env.ROOF_QUEST_PROFILE) await rm(profile, { recursive: true, force: true });
  if (server) await server.close();
}
if (report.errors.length || report.checks.some(item => !item.pass)) process.exitCode = 1;
