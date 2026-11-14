// Shipping-renderer visual plate only. Real game input acceptance is separate.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const base = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-angle=metal'],
});
const page = await browser.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  for (const [name, width, height] of [['wide', 1280, 760], ['compact', 960, 600]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${base}/src/render/patchbay-material.js`);
    await page.setContent(`<link rel="stylesheet" href="/styles.css"><div id="plate" style="position:relative;width:${width}px;height:${height}px;background:#080c09"></div>`);
    const evidence = await page.evaluate(async (textScale) => {
      const ui = await import('/src/render/ui.js');
      const { makeBagScene } = await import('/src/game/bag.js');
      const { normalizeCombatBuild, learnCombatTechnique, TECHNIQUE_DEFS, PIN_SOURCES } = await import('/src/game/combat-progression.js');
      ui.uiInit(document.getElementById('plate'));
      ui.uiSetScale(textScale);
      await document.fonts.load('600 14px "Hardware Sans"');
      await document.fonts.load('400 14px "Hardware Sans"');
      let build = normalizeCombatBuild(null, PIN_SOURCES.encounters, { 'pin.academic': true, 'pin.tower': true, 'pin.gallery': true });
      const torch = TECHNIQUE_DEFS.find((entry) => entry.branch === 'torch' && !entry.requires);
      const torchNext = TECHNIQUE_DEFS.find((entry) => entry.requires === torch.id);
      const recorder = TECHNIQUE_DEFS.find((entry) => entry.branch === 'recorder' && !entry.requires);
      const nerve = TECHNIQUE_DEFS.find((entry) => entry.branch === 'nerve' && entry.tier === 2);
      for (const entry of [torch, torchNext, recorder, nerve]) build = learnCombatTechnique(build, entry.id, { hasRig: true }).build;
      const bag = makeBagScene({
        getBuild: () => build,
        hasRig: () => true,
        focus: { sectionId: 'skills', entryId: `skill:${torchNext.id}` },
      });
      bag.enter();
      const draw = () => {
        ui.uiClear();
        bag.render();
      };
      const before = performance.now();
      draw();
      const coldMs = performance.now() - before;
      const timings = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        draw();
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      const hits = bag.debugState().hitRegions;
      const outputs = hits.filter(hit => hit.id.startsWith('bag:patch:output:skill:')).length;
      const inputs = hits.filter(hit => hit.kind === 'bag-patch-input').length;
      return { coldMs, p95Ms: timings[28], inputs, outputs };
    }, name === 'compact' ? 1.5 : 1);
    assert.equal(evidence.outputs, 4);
    assert.ok(evidence.inputs > evidence.outputs);
    assert.ok(evidence.p95Ms < 16.7);
    await page.screenshot({ path: `artifacts/patchbay-material-${name}.png` });
    console.log(name, evidence);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
