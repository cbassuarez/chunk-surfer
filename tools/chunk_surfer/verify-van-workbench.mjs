// Standalone production scenes and real browser pointer dispatch. This uses a
// disposable state adapter, not a claim about the game's opening progression.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5297';
const output = process.env.VAN_ARTIFACT_DIR || 'artifacts';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, protocolTimeout: 120000, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage(), errors = [];
page.on('pageerror', error => { errors.push(error.stack || error.message); console.error('PAGEERROR', error.message); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const shot = async name => { await page.screenshot({ path: `${output}/van-workbench-${name}.png` }); console.log('CAPTURE', name); };
const state = () => page.evaluate(() => ({ state: window.__benchState, debug: window.__bench.debugState(),
  top: window.__benchScenes.top()?.id, calls: window.__benchCalls }));
async function click(id) {
  const point = await page.evaluate(async id => {
    const hit = window.__bench.debugState().hitRegions.find(region => region.id === id);
    if (!hit) throw new Error(`Missing ${id}`);
    const size = (await import('/src/render/ui.js')).uiSize(), rect = document.getElementById('bench').getBoundingClientRect();
    return { x: rect.left + (hit.x + hit.w / 2) / size.cols * rect.width,
      y: rect.top + (hit.y + hit.h / 2) / size.rows * rect.height };
  }, id);
  await page.mouse.click(point.x, point.y); await sleep(250);
}
try {
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await page.goto(`${base}/src/game/van-workbench.js`);
  await page.setContent('<base href="/"><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#07100c}#bench{position:relative;width:100vw;height:100vh}</style><div id="bench"></div>');
  await page.evaluate(async () => {
    const ui = await import('/src/render/ui.js'), scenes = await import('/src/game/scenes.js');
    const { makeVanWorkbenchScene } = await import('/src/game/van-workbench.js');
    const { makeDifficultySelectScene } = await import('/src/game/difficulty-select.js');
    const { makeItemInspectionScene } = await import('/src/game/item-inspection-scene.js');
    const { freshFieldKit } = await import('/src/game/field-kit.js');
    const host = document.getElementById('bench'); ui.uiInit(host); await document.fonts.load('600 14px "Hardware Sans"');
    window.__benchCalls = []; window.__benchScenes = scenes;
    window.__benchState = { bagTaken: false, mapTaken: false, difficultyLabel: 'CONTRACT', difficultyConfirmed: false, fieldKit: freshFieldKit() };
    window.__bench = makeVanWorkbenchScene({
      getState: () => window.__benchState,
      onTakeCase: () => { window.__benchCalls.push('case'); window.__benchState.bagTaken = true; },
      onTakeMap: () => { window.__benchCalls.push('map'); window.__benchState.mapTaken = true; },
      onKitChange: kit => { window.__benchCalls.push('kit'); window.__benchState.fieldKit = kit; },
      onChooseDifficulty: () => scenes.push(makeDifficultySelectScene({ meta: {}, initialPreset: 'contract',
        onConfirm: value => { window.__benchState.difficultyConfirmed = true; window.__benchState.difficultyLabel = value.preset.toUpperCase(); } })),
      onInspect: id => { window.__benchCalls.push(`inspect:${id}`); scenes.push(makeItemInspectionScene({ id, sourceId: id, label: id.toUpperCase() })); },
      onContinue: () => window.__benchCalls.push('continue'), onClose: () => window.__benchCalls.push('back'),
    });
    scenes.push(window.__bench);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => scenes.pointer({
      type, pointerId: event.pointerId, button: event.button, clientX: event.clientX, clientY: event.clientY,
      ...ui.uiPointFromClient(event.clientX, event.clientY), originalEvent: event,
    }));
    window.addEventListener('keydown', event => { event.preventDefault(); scenes.key(event); });
    window.addEventListener('keyup', event => scenes.keyup(event));
    let previous = performance.now();
    const frame = now => { scenes.update(Math.min(.1, (now - previous) / 1000)); previous = now; ui.uiClear(); scenes.render(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await page.waitForFunction(() => window.__bench.debugState().stage.ready, { timeout: 30000 });
  console.log('MODELS', JSON.stringify((await state()).debug.stage));
  assert.equal((await state()).debug.stage.rendererCount, 1);
  assert.equal((await state()).debug.stage.readoutTexture, true, 'actual shared VFD renderer supplies the physical display texture');
  assert.deepEqual(Object.keys((await state()).debug.stage.docked).sort(), ['map', 'microphone', 'radio', 'recorder']);
  await sleep(300); await shot('unclaimed-wide');
  await click('van:continue'); assert.ok(!(await state()).calls.includes('continue'));
  await click('van:map'); assert.equal((await state()).state.bagTaken, false);
  await click('van:case'); await click('van:difficulty');
  assert.equal((await state()).top, 'difficulty-select'); await shot('difficulty');
  await page.keyboard.press('Enter'); await sleep(250);
  assert.equal((await state()).top, 'van-workbench'); assert.equal((await state()).state.difficultyConfirmed, true);
  await click('van:kit:headphones:closed');
  await page.waitForFunction(() => window.__bench.debugState().stage.models.headphones === 'headphones-closed');
  await click('van:object:headphones'); assert.equal((await state()).debug.pickedObject, 'headphones');
  await page.keyboard.press('i'); assert.equal((await state()).top, 'item-inspection');
  await page.waitForFunction(() => window.__benchScenes.top()?.view()?.inspection?.ready, { timeout: 30000 });
  await shot('headphones-inspection'); await page.keyboard.press('Escape'); await sleep(200);
  await click('van:group:microphone'); await click('van:kit:microphone:directional');
  await page.waitForFunction(() => window.__bench.debugState().stage.models.microphone === 'microphone-directional');
  await click('van:group:recorder'); await click('van:kit:recorder:headroom');
  await click('van:group:faceplate'); await click('van:kit:faceplate:olive');
  await click('van:group:buttons'); await click('van:kit:buttons:sea-glass');
  await click('van:group:vfd'); await click('van:kit:vfd:ice'); await shot('fitted-wide');
  const materials = (await state()).debug.stage.materials;
  assert.equal(materials['recorder-faceplate'].color, '#61694b');
  assert.equal(materials['recorder-button-rec'].color, '#d09179');
  assert.equal(materials['recorder-button-stop'].color, '#a7bda0');
  await click('van:inspect:map'); assert.equal((await state()).top, 'item-inspection');
  await page.waitForFunction(() => window.__benchScenes.top()?.view()?.inspection?.ready, { timeout: 30000 });
  await sleep(400); await shot('map-inspection'); await page.keyboard.press('Escape'); await sleep(200);
  assert.equal((await state()).debug.selectedGroup, 'vfd');
  await click('van:inspect:recorder');
  await page.waitForFunction(() => window.__benchScenes.top()?.view()?.inspection?.ready, { timeout: 30000 });
  await sleep(400); await shot('recorder-inspection');
  await page.keyboard.press('Escape'); await sleep(200);
  for (const [name, scale, dpr] of [['compact', 1, 1], ['large-text-retina', 1.5, 2]]) {
    await page.setViewport({ width: 960, height: 600, deviceScaleFactor: dpr });
    await page.evaluate(async scale => (await import('/src/render/ui.js')).uiSetScale(scale), scale); await sleep(350);
    await click('van:group:microphone'); await shot(name);
    const value = await state();
    assert.equal(value.debug.state.fieldKit.microphone, 'directional');
    assert.equal(value.debug.ready, true);
    assert.ok(value.debug.hitRegions.every(hit => hit.x >= 0 && hit.y >= 0
      && hit.x + hit.w <= value.debug.layout.size.cols && hit.y + hit.h <= value.debug.layout.size.rows));
  }
  await click('van:continue'); assert.equal((await state()).calls.filter(call => call === 'continue').length, 1);
  await page.keyboard.press('Escape'); assert.equal((await state()).calls.at(-1), 'back');
  await page.evaluate(() => { window.__benchState.reduceMotion = true; });
  await click('van:group:headphones'); await sleep(250);
  const resting = (await state()).debug.stage.renderCount; await sleep(250);
  assert.equal((await state()).debug.stage.renderCount, resting, 'idle shelf is a cached frame, not continuous GPU rendering');
  await page.evaluate(() => window.__bench.suspend()); const suspended = (await state()).debug.stage.renderCount;
  await sleep(200); assert.equal((await state()).debug.stage.renderCount, suspended);
  await page.evaluate(() => window.__bench.resume()); await sleep(100);
  await page.evaluate(() => window.__benchScenes.pop());
  assert.equal((await state()).debug.stage.disposed, true); assert.equal((await state()).debug.stage.rendererCount, 0);
  // An unavailable mesh is a final honest load failure, not a retry storm or
  // a progression lock. Run this on a fresh scene with browser cache disabled.
  await page.setCacheEnabled(false); let failedRequests = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('/headphones-reference.glb')) { failedRequests++; request.abort(); }
    else request.continue();
  });
  await page.evaluate(async () => {
    const { makeVanWorkbenchScene } = await import('/src/game/van-workbench.js');
    const { freshFieldKit } = await import('/src/game/field-kit.js');
    window.__benchState = { bagTaken: false, mapTaken: false, difficultyConfirmed: false, fieldKit: freshFieldKit(), reduceMotion: true };
    window.__bench = makeVanWorkbenchScene({ getState: () => window.__benchState,
      onTakeCase: () => { window.__benchState.bagTaken = true; }, onTakeMap: () => { window.__benchState.mapTaken = true; },
      onChooseDifficulty: () => { window.__benchState.difficultyConfirmed = true; },
      onContinue: () => window.__benchCalls.push('fallback-continue') });
    window.__benchScenes.push(window.__bench);
  });
  await page.waitForFunction(() => window.__bench.debugState().stage.failed.includes('headphones-reference'), { timeout: 30000 });
  await sleep(400); assert.equal(failedRequests, 1, 'failed model is not retried each render frame');
  await click('van:case'); await click('van:map'); await click('van:difficulty'); await click('van:continue');
  assert.equal((await state()).calls.at(-1), 'fallback-continue'); await shot('load-failure-usable');
  await page.evaluate(() => window.__benchScenes.pop());
  assert.deepEqual(errors, []);
  console.log('PASS: actual browser pointer pickups, difficulty scene/return, all six fitting stations, real map/recorder inspectors, compact +1.5×/DPR2, gated Continue, and Back. Zero page errors. Standalone state adapter; not live opening/native acceptance.');
} catch (error) {
  console.error('FAIL', error.stack); await shot('failure'); process.exitCode = 1;
} finally { await browser.close(); }
