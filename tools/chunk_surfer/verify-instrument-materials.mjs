// Shipping Canvas material/readability acceptance. Recorder state boards are
// explicit presentation fixtures; R/B, transport presses, and the patch drag
// use the actual game scenes. Disposable save + mock lens, not native evidence.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5297';
const lens = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const output = process.env.INSTRUMENT_ARTIFACT_DIR || 'artifacts';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, protocolTimeout: 120000,
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage(), errors = [], measurements = [];
page.on('pageerror', error => { errors.push(error.stack || error.message); console.error('PAGEERROR', error.message); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = (fn, ...args) => page.waitForFunction(fn, { timeout: 120000 }, ...args);
const top = () => page.evaluate(() => window.__scenes?.top()?.id);
const shot = async name => { await page.screenshot({ path: `${output}/instrument-${name}.png` }); console.log('CAPTURE', name); };
const sizes = [
  { name: 'wide', width: 1280, height: 760, deviceScaleFactor: 1, scale: 1 },
  { name: 'compact', width: 960, height: 600, deviceScaleFactor: 1, scale: 1 },
  { name: 'large-text-retina', width: 960, height: 600, deviceScaleFactor: 2, scale: 1.5 },
];

async function resize(size, isolated = false) {
  const { width, height, deviceScaleFactor, scale } = size;
  await page.setViewport({ width, height, deviceScaleFactor });
  await page.evaluate(async ({ scale, isolated }) => {
    if (isolated) (await import('/src/render/ui.js')).uiSetScale(scale);
    else window.__chunkSurferDisplay.setUiScale(scale);
  }, { scale, isolated });
  await sleep(260);
}

async function point(id) {
  return page.evaluate(async id => {
    const hit = window.__scenes.top().debugState().hitRegions.find(region => region.id === id);
    if (!hit) throw new Error(`Missing rendered control ${id}`);
    const size = (await import('/src/render/ui.js')).uiSize();
    const rect = document.getElementById('map').getBoundingClientRect();
    return { x: rect.left + (hit.x + hit.w * .5) / size.cols * rect.width,
      y: rect.top + (hit.y + hit.h * .5) / size.rows * rect.height };
  }, id);
}
async function click(id) { const p = await point(id); await page.mouse.click(p.x, p.y); await sleep(200); }

async function recorderBoard(mode, size) {
  const value = await page.evaluate(async ({ mode }) => {
    const ui = await import('/src/render/ui.js');
    const r = await import('/src/render/recorder-view.js');
    const controls = await import('/src/game/recorder-scene.js');
    const { monitorSnapshotForRms } = await import('/src/audio/monitor.js');
    const dimensions = ui.uiSize();
    const rect = r.recorderPanelRect({ ...dimensions, rowsNeeded: mode === 'listen' ? 15 : mode === 'check' ? 8 : 10 });
    const rolling = mode === 'record', playing = mode === 'play';
    const live = { recording: rolling, playing, browsing: mode === 'browse', playableHere: true, tapes: 2 };
    const view = {
      rect, mode, source: 'ROOM', counter: '03:24', counterTotal: '/ 05:00',
      progress: .42, spin: .27, locationSeconds: 45,
      levels: playing ? { left: .54, right: .32 } : null,
      meter: rolling ? monitorSnapshotForRms(.17) : null,
      roomMeter: mode === 'check' ? monitorSnapshotForRms(.12) : null,
      check: { heard: true, line: 'The room mic is working. This is not a take.' },
      note: 'STUDIO B3 / ROOM MIC', lamp: { text: rolling ? 'ROLLING' : 'READY' },
      footer: 'UP DOWN SELECT · ENTER PRESS · R CLOSE',
      guide: { history: [{ who: 'direction', text: 'Kill the light and roll.' }],
        line: { who: 'player', text: 'The headphones settle against your ears.' }, typing: false,
        pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }, { text: 'CHECK THE ROOM' }] } },
      rows: [{ ordinal: '01', label: 'STUDIO B3', status: 'PRINTED', selected: true, playable: true },
        { ordinal: '02', label: 'THE TUB', status: 'CONTAMINATED', warn: true, playable: true }],
      buttons: mode === 'check' ? null : rolling ? r.recordingOverlayButtons({ rolling: true })
        : { keys: controls.recorderKeys(live).map(key => ({ ...key, ...controls.recorderControlState(key.id, live) })) },
    };
    ui.uiClear();
    const coldStart = performance.now();
    const body = r.drawRecorderFace(view), coldMs = performance.now() - coldStart;
    const samples = [];
    for (let index = 0; index < 40; index++) {
      ui.uiClear(); const start = performance.now(); r.drawRecorderFace(view); samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return { dimensions, rect, body, hits: r.recorderHitRegions(view), coldMs, p95Ms: samples[38], maxMs: samples.at(-1) };
  }, { mode });
  measurements.push({ state: mode, size: size.name, ...value });
  assert.ok(value.hits.filter(hit => hit.kind === 'transport').every(hit => hit.w >= 7), 'transport legend cap retains its width');
  assert.ok(value.rect.y + value.rect.h <= value.dimensions.rows, `${mode}/${size.name}: complete bezel stays onscreen`);
  if (mode === 'listen') {
    const choices = value.hits.filter(hit => hit.kind === 'choice');
    assert.equal(choices.length, 2);
    assert.ok(choices.every(hit => hit.y + hit.h <= value.rect.y + value.rect.h - 2), 'both pre-roll options remain above the footer');
  }
  await shot(`recorder-${mode}-${size.name}`);
  return value;
}

async function assertTour() {
  const value = await page.evaluate(() => window.__scenes.top().debugState());
  const tour = value.guidePresentation;
  assert.ok(tour?.callouts?.length, 'exterior callout still rendered');
  for (const callout of tour.callouts) assert.ok(callout.rect.x + callout.rect.w < tour.outer.x, 'guide stays outside physical case');
  for (const target of tour.targets) assert.ok(value.hitRegions.some(hit => hit.id === target.id), 'highlight still follows an actual hit target');
}

try {
  await page.setViewport(sizes[0]);
  await page.goto(`${base}/src/render/recorder-view.js`);
  await page.setContent('<link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#080c09}#plate{position:relative;width:100vw;height:100vh}</style><div id="plate"></div>');
  await page.evaluate(async () => {
    (await import('/src/render/ui.js')).uiInit(document.getElementById('plate'));
    await document.fonts.load('600 14px "Hardware Sans"');
  });
  for (const size of sizes) {
    await resize(size, true);
    for (const mode of ['monitor', 'record', 'play', 'browse', 'check', 'listen']) await recorderBoard(mode, size);
  }
  console.log('RECORDER MATERIAL FIXTURES', JSON.stringify(measurements.map(({ state, size, coldMs, p95Ms, rect, dimensions }) =>
    ({ state, size, coldMs, p95Ms, overflowRows: Math.max(0, rect.y + rect.h - dimensions.rows) }))));

  await page.setViewport(sizes[0]);
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  await page.goto(`${base}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent(lens)}`, { waitUntil: 'domcontentloaded' });
  await wait(() => !!window.__scenes?.top()?.id);
  if (await top() === 'eula') await page.keyboard.press('Enter');
  await wait(() => window.__scenes.top()?.id === 'opening-credits');
  await page.evaluate(() => window.__scenes.top().update(30)); // boot credits only, never transport time
  await wait(() => window.__scenes.top()?.id === 'title');
  for (const size of sizes) { await resize(size); await shot(`title-${size.name}`); }
  await resize(sizes[0]);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await wait(() => window.__scenes.top()?.id === 'difficulty-select'); await page.keyboard.press('Enter');
  await wait(() => window.__scenes.top()?.id === 'warning'); await page.keyboard.press('Enter'); await page.keyboard.press('n');
  await wait(() => window.__chunkParity?.().screen === 'game');
  await page.evaluate(async () => {
    const radio = await import('/src/game/radio.js'), save = await import('/src/game/save.js');
    const progression = await import('/src/game/combat-progression.js');
    window.__probe.testRun(); window.__probe.godWarpGetIn(); window.__probe.tutSkip();
    window.__probe.setFlags(['bag.taken', 'title.shown', 'setup.levels', 'combat.trained', 'setup.waypoint',
      'setup.case.started', 'setup.case.opened', 'setup.case.skills-opened', 'setup.case.skills-done', 'setup.case.map-opened', 'setup.case.closed', 'setup.case.arrived']);
    radio.loadRadioState({ schema: 4, milestones: { [radio.RADIO_CUES.INITIAL]: true } });
    save.saveCommit({ radio: radio.saveRadioState(), combatBuild: progression.normalizeCombatBuild(null, [], null,
      { tutorialComplete: true, combatAssistance: 'guided' }) });
  });
  await sleep(600);
  await page.keyboard.press('r'); await wait(() => window.__scenes.top()?.id === 'recorder');
  assert.equal(await page.evaluate(() => document.pointerLockElement === null), true, 'R releases the pointer');
  for (const size of sizes) { await resize(size); await shot(`live-recorder-${size.name}`); }
  await resize(sizes[0]); await click('play');
  assert.match(await page.evaluate(() => window.__scenes.top().debugState().notice), /TAPE|NOTHING/);
  await shot('live-recorder-refused');
  await page.evaluate(async () => {
    const playback = await import('/src/game/playback.js'), recordist = await import('/src/game/recordist.js');
    for (const [room, contaminated] of [['main_b3', false], ['the_tub', true]]) {
      playback.beginTake(room, { x: 2, y: 2 }); playback.noteAudible(room, 0, .7); playback.notePresence(room, .5, 11);
      recordist.addTake(room, { contaminated }); playback.sealTake(room);
    }
  });
  await click('takes');
  assert.equal(await page.evaluate(() => window.__scenes.top().debugState().browsing), true);
  await shot('live-recorder-browse');
  const tapeId = await page.evaluate(() => window.__scenes.top().debugState().hitRegions.find(hit => hit.kind === 'take').id);
  await click(tapeId); await wait(() => window.__probe.playback().playing); await shot('live-recorder-play');
  await click('stop'); await page.keyboard.press('r'); await wait(() => window.__scenes.top()?.id !== 'recorder');
  await page.keyboard.press('b'); await wait(() => window.__scenes.top()?.id === 'bag');
  for (const size of sizes) {
    await resize(size); await click('bag:tab:kit'); await shot(`bag-inventory-${size.name}`);
    await click('bag:tab:skills'); await shot(`bag-skills-${size.name}`);
  }
  await page.keyboard.press('b'); await wait(() => window.__scenes.top()?.id !== 'bag');

  // A disposable post-fight fixture isolates the tour's materials. The actual
  // fight/reward contract is covered by verify-training-handoff.mjs, not here.
  await page.evaluate(async () => {
    const recordist = await import('/src/game/recordist.js'), save = await import('/src/game/save.js');
    const progression = await import('/src/game/combat-progression.js');
    window.__probe.testRun(); window.__probe.godWarpGetIn(); window.__probe.tutSkip();
    for (const room of ['main_b3', 'the_tub']) recordist.setTake(room, false);
    window.__probe.setFlags(['bag.taken', 'title.shown', 'setup.levels', 'combat.trained', 'setup.case.started', 'setup.case.opened'],
      ['setup.waypoint', 'setup.case.skills-opened', 'setup.case.skills-done', 'setup.case.map-opened', 'setup.case.closed', 'setup.case.arrived']);
    save.saveCommit({ combatBuild: progression.normalizeCombatBuild(null, [], null, { tutorialComplete: true, combatAssistance: 'guided' }) });
  });
  await resize(sizes[0]); await page.keyboard.press('b'); await wait(() => window.__scenes.top()?.id === 'bag');
  await assertTour(); await shot('tour-select-skills');
  await click('bag:tab:skills'); await assertTour(); await shot('tour-unpatched');
  const source = await point('bag:patch:supply:torch'), target = await point('bag:patch:input:skill:torch.afterimage');
  await page.mouse.move(source.x, source.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 10 });
  await shot('tour-dragging'); await page.mouse.up(); await sleep(240);
  assert.deepEqual(await page.evaluate(() => window.__scenes.top().debugState().workingBuild.techniques), ['torch.afterimage']);
  for (const size of sizes) { await resize(size); await assertTour(); await shot(`tour-patched-${size.name}`); }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/instrument-material-measurements.json`, JSON.stringify({ measurements, errors }, null, 2));
  console.log('PASS: all six production recorder states, title and Bag at three display scales; actual R/transport/B and cable drag. Zero page errors. Material fixtures and mock lens, not native acceptance.');
} catch (error) {
  console.error('FAIL', error.stack);
  console.error('STATE', await top());
  await shot('failure'); process.exitCode = 1;
} finally { await browser.close(); }
