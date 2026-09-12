// Real production workbench rendering and pointer input, disposable state only.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5296';
const output = process.env.VAN_ARTIFACT_DIR || 'artifacts/van-catalog';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, protocolTimeout: 120000, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const debug = () => page.evaluate(() => window.__bench.debugState());
const shot = async name => { await page.screenshot({ path: `${output}/${name}.png` }); console.log('CAPTURE', name); };
async function click(id) {
  const point = await page.evaluate(async id => {
    const hit = window.__bench.debugState().hitRegions.find(region => region.id === id);
    if (!hit) throw new Error(`Missing ${id}`);
    const ui = await import('/src/render/ui.js'), metrics = ui.uiCellMetrics();
    return { x: (hit.x + hit.w / 2) * metrics.cellW, y: (hit.y + hit.h / 2) * metrics.cellH };
  }, id);
  await page.mouse.click(point.x, point.y); await pause(250);
}
try {
  await page.setViewport({ width: 1500, height: 940, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', request => request.url().endsWith('/__bench_catalog__') ? request.respond({ status: 200, contentType: 'text/html', body:
    '<html><head><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#07100c}#bench{width:100vw;height:100vh}</style></head><body><div id="bench"></div></body></html>' }) : request.continue());
  await page.goto(`${base}/__bench_catalog__`);
  await page.evaluate(async () => {
    const ui = await import('/src/render/ui.js'); const { makeVanWorkbenchScene } = await import('/src/game/van-workbench.js');
    const { freshFieldKit } = await import('/src/game/field-kit.js');
    ui.uiInit(document.getElementById('bench')); await document.fonts.load('600 14px "Hardware Sans"');
    window.__benchState = { bagTaken: false, mapTaken: false, difficultyLabel: 'CONTRACT', difficultyConfirmed: false,
      fieldKit: freshFieldKit(), packedGroups: [], requirePacking: true, reduceMotion: true };
    window.__bench = makeVanWorkbenchScene({ getState: () => window.__benchState,
      onTakeCase: () => { window.__benchState.bagTaken = true; }, onTakeMap: () => { window.__benchState.mapTaken = true; },
      onKitChange: (kit, context) => { window.__benchState.fieldKit = kit;
        if (['headphones', 'microphone', 'recorder', 'flashlight'].includes(context?.group)) window.__benchState.packedGroups = [...new Set([...window.__benchState.packedGroups, context.group])]; return true; },
      onChooseDifficulty: () => { window.__benchState.difficultyConfirmed = true; },
      onTakeSpanner: () => { window.__benchState.spannerTaken = true; },
    });
    window.__bench.enter();
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, event => window.__bench.pointer({ type,
      pointerId: event.pointerId, button: event.button, ...ui.uiPointFromClient(event.clientX, event.clientY), originalEvent: event }));
    window.addEventListener('keydown', event => { event.preventDefault(); window.__bench.key(event); });
    window.addEventListener('keyup', event => window.__bench.keyup(event));
    let previous = performance.now(); const frame = now => { window.__bench.update?.(Math.min(.1, (now - previous) / 1000)); previous = now;
      ui.uiClear(); window.__bench.render(ui.uiSize()); requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  });
  await page.waitForFunction(() => window.__bench?.debugState().stage.ready, { timeout: 45000 });
  let value = await debug(); console.log('UNCLAIMED', JSON.stringify(value.stage));
  assert.equal(value.stage.caseOpen, false); assert.deepEqual(value.stage.docked, {});
  assert.deepEqual(value.stage.glowing.sort(), ['case', 'difficulty', 'map']);
  assert.equal(Object.keys(value.stage.models).length, 20);
  assert.equal(value.stage.rendererCount, 1); assert.equal(value.stage.readoutTexture, true);
  await shot('01-closed-unclaimed');
  await click('van:object:case');
  assert.equal((await debug()).stage.caseOpen, true);
  await shot('02-case-open-unpacked');
  for (const [group, option] of [['headphones', 'closed'], ['microphone', 'directional'], ['recorder', 'headroom'], ['flashlight', 'throw']]) {
    await click(`van:object:variant:${group}:${option}`);
    assert.equal((await debug()).stage.destinations[`variant:${group}:${option}`], 'case');
  }
  await click('van:map'); await click('van:difficulty');
  value = await debug(); assert.equal(value.ready, true); assert.deepEqual(value.stage.glowing, []);
  assert.equal(Object.keys(value.stage.docked).length, 7);
  await shot('03-all-packed');
  await page.evaluate(() => { window.__benchState.spannerTaken = true; }); await pause(250);
  assert.equal((await debug()).stage.docked.spanner, 'headphone-lead', 'optional spanner remains visible in the accessory foam bay');
  await shot('03b-spanner-stowed');
  await click('van:object:variant:recorder:low-draw');
  value = await debug(); assert.equal(value.stage.destinations['variant:recorder:headroom'], 'bench');
  assert.equal(value.stage.destinations['variant:recorder:low-draw'], 'case');
  await click('van:object:variant:faceplate:olive');
  assert.equal((await debug()).stage.destinations['variant:faceplate:aluminum'], 'bench');
  assert.equal((await debug()).stage.destinations['variant:faceplate:olive'], 'device');
  await shot('04-swapped-amp-faceplate');
  await click('van:group:flashlight'); await shot('05-flashlight-detail');
  for (const [name, width, height, scale, dpr] of [['06-compact', 960, 600, 1, 1], ['07-large-type-retina', 960, 600, 1.5, 2]]) {
    await page.setViewport({ width, height, deviceScaleFactor: dpr });
    await page.evaluate(async scale => (await import('/src/render/ui.js')).uiSetScale(scale), scale); await pause(500);
    await shot(name); value = await debug();
    assert.ok(value.hitRegions.every(hit => hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= value.layout.size.cols + .01 && hit.y + hit.h <= value.layout.size.rows + .01));
  }
  await pause(300); const resting = (await debug()).stage.renderCount; await pause(300);
  assert.equal((await debug()).stage.renderCount, resting, 'reduced-motion idle reuses its cached frame');
  await page.evaluate(() => window.__bench.exit()); assert.equal((await debug()).stage.rendererCount, 0);
  assert.deepEqual(errors, []); console.log('PASS: catalogue, real pointer packing/swapping, closed case, glows, compact, retina, disposal; disposable scene state.');
} catch (error) { console.error(error.stack); await shot('failure'); process.exitCode = 1; }
finally { await browser.close(); }
