// Production physical inspector, real GLB/Three renderer and browser input.
// Explicit fixtures do not alter an existing save or claim a full run unlock.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5296';
const output = resolve('artifacts/witness-edition');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, protocolTimeout: 60000, args: ['--use-angle=metal'] });
const page = await browser.newPage(), errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const fixture = `${base}/__witness-inspector-fixture__.html`;
await page.setRequestInterception(true);
page.on('request', request => request.url() === fixture ? request.respond({ status: 200, contentType: 'text/html',
  body: '<!doctype html><html><head><style>html,body{margin:0;background:#080c09}#plate{position:relative;width:100vw;height:100vh}</style></head><body><div id="plate"></div></body></html>' }) : request.continue());
const capture = async name => { const path = `${output}/${name}.png`; await page.screenshot({ path }); return path; };
const draw = () => page.evaluate(() => { window.fixtureUi.uiClear(); window.inspector.render(); });
try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const ui = await import('/src/render/ui.js'), { makeWitnessInspectionScene } = await import('/src/game/witness-inspection.js');
    ui.uiInit(document.querySelector('#plate')); window.fixtureUi = ui; window.inspectorEvents = [];
    window.newInspector = async options => {
      window.inspector?.exit();
      window.inspector = makeWitnessInspectionScene({ cosmetics: { buttons: 'sea-glass', vfd: 'ice' },
        endingIds: ['sacrifice', 'helped'], count: 2, owned: true,
        onFit: () => window.inspectorEvents.push('fit'), onClose: () => window.inspectorEvents.push('close'), ...options });
      await window.inspector.ready; ui.uiClear(); window.inspector.render();
    };
    document.addEventListener('keydown', event => { event.preventDefault(); window.inspector.key(event); ui.uiClear(); window.inspector.render(); });
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, event => {
      window.inspector.pointer({ type, ...ui.uiPointFromClient(event.clientX, event.clientY), clientX: event.clientX, clientY: event.clientY,
        pointerId: event.pointerId, button: event.button }); ui.uiClear(); window.inspector.render();
    });
    await window.newInspector();
  });
  let state = await page.evaluate(() => window.inspector.view());
  assert.equal(state.ready, true); assert.equal(state.contexts, 1); assert.equal(state.failed, false);
  results.push({ kind: 'front', state, screenshot: await capture('inspector-front') });
  const point = await page.evaluate(() => { const r = window.inspector.view().layout.portrait, m = window.fixtureUi.uiCellMetrics(); return { x: (r.x + r.w / 2) * m.cellW, y: (r.y + r.h / 2) * m.cellH }; });
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 77, point.y + 15, { steps: 8 }); await page.mouse.up();
  state = await page.evaluate(() => window.inspector.view()); assert.ok(state.yaw > .4); assert.ok(state.pitch > .2);
  results.push({ kind: 'oblique-pointer', state, screenshot: await capture('inspector-oblique') });
  await page.keyboard.press('r'); await page.keyboard.press('t');
  results.push({ kind: 'back', state: await page.evaluate(() => window.inspector.view()), screenshot: await capture('inspector-back') });
  await page.keyboard.press('v'); await page.keyboard.press('r');
  state = await page.evaluate(() => window.inspector.view()); assert.equal(state.mode, 'plate');
  results.push({ kind: 'sleeve', state, screenshot: await capture('inspector-sleeve') });
  await page.keyboard.press('v'); await page.keyboard.press('k');
  await page.evaluate(() => { window.inspector.update(.09); window.fixtureUi.uiClear(); window.inspector.render(); });
  state = await page.evaluate(() => window.inspector.view()); assert.equal(state.testing, true);
  results.push({ kind: 'physical-key-test', state, screenshot: await capture('inspector-key-travel') });
  await page.evaluate(() => { for (let i = 0; i < 10; i++) window.inspector.update(.1); }); await draw();
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.inspectorEvents), ['fit', 'close']);
  assert.equal(await page.evaluate(() => window.inspector.view().contexts), 0);
  await page.evaluate(() => window.newInspector({ owned: false, endingIds: ['sacrifice'], count: 1 }));
  assert.equal(await page.evaluate(() => window.inspector.view().canFit), false);
  results.push({ kind: 'locked-first-ending', state: await page.evaluate(() => window.inspector.view()), screenshot: await capture('inspector-locked') });
  await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 2 });
  await page.evaluate(async () => { window.fixtureUi.uiSetScale(1.5); await window.newInspector({ onFit: null }); }); await draw();
  state = await page.evaluate(() => window.inspector.view()); assert.equal(state.canFit, false);
  results.push({ kind: 'readonly-retina-large-text', state, screenshot: await capture('inspector-retina-large-text') });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.inspector.view().disposed), true);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/inspector-report.json`, JSON.stringify({ scope: 'Real GLB production inspector, browser pointer/keys, isolated fixture profile. No complete game or native controller claim.', results, pageErrors: errors }, null, 2) + '\n');
  console.log(`PASS: ${results.length} physical inspection views; fit/close order, locked/read-only gating, pointer orbit and disposed contexts. ${output}/inspector-report.json`);
} catch (error) {
  await capture('inspector-failure'); console.error(error); process.exitCode = 1;
  await writeFile(`${output}/inspector-failure.json`, JSON.stringify({ error: error.stack, results, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
