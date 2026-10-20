// The get-in dream, live: the light step, the real [R] level check (which must
// leave the light on), the ripple, and the figure walking up his beam. Two runs
// on disposable saves with the mock lens:
//
//   lit  — the player puts the light on as taught and never puts it out. The
//          figure is measured in the beam (the same frame drawn with and without
//          the body), then measured again with the torch off, then allowed to
//          arrive. The drill must open with it as the opponent, and the light
//          must still be on.
//   dark — [F] while it walks. It must pass through, no fight may open, and the
//          opening must carry on to the case with the achievement awarded.
//   walkout — setup done, Martin's first call answered, torch on in the get-in:
//          nothing counts. Out into the building: the cells start running down
//          and Martin rings about the light.
//
// Neither run may spend any battery before the walk out.
//
// Needs the mock lens on 5198 and vite on 5199:
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs
//   npx vite --host 127.0.0.1 --port 5199 --strictPort
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5199';
const out = process.env.DREAM_FIGURE_OUT || 'artifacts/dream-figure';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot(browser) {
  // Its own context: a run must not inherit the last run's save or meta.
  const context = await (browser.createBrowserContext?.() ?? browser.createIncognitoBrowserContext());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => { errors.push(error.stack || error.message); console.error('PAGEERROR', error.message); });
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  await page.goto(`${base}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`, { waitUntil: 'domcontentloaded' });
  // Press through whatever front end this build has (the difficulty screen
  // comes and goes), rather than a fixed recipe that goes stale.
  const deadline = Date.now() + 120000;
  for (;;) {
    assert.ok(Date.now() < deadline, 'boot reached the game');
    const at = await page.evaluate(() => ({ id: window.__scenes?.top?.()?.id || null, screen: window.__chunkParity?.().screen || null })).catch(() => ({}));
    if (at.screen === 'game') break;
    if (at.id === 'opening-credits') await page.evaluate(() => window.__scenes.top().update(30));
    else if (['eula', 'title', 'difficulty-select'].includes(at.id)) await page.keyboard.press('Enter');
    else if (at.id === 'warning') { await page.keyboard.press('Enter'); await page.keyboard.press('n'); }
    await sleep(400);
  }
  await page.evaluate(() => {
    window.__probe.testRun(); window.__probe.godWarpGetIn();
    window.__probe.setFlags(['bag.taken', 'title.shown', 'kit.fitted'], ['setup.levels', 'combat.trained', 'setup.waypoint', 'setup.dream.spared']);
    window.__probe.tutSkip(); window.__probe.setComposure(40);
  });
  return { page, errors };
}

// The real path in: [R], the level-check menus, six clean seconds, the count,
// the ripple. Records every scene id seen so a fight can never slip past.
async function intoDream(page, seen) {
  // The setup teaches ON: "It's dark in here." [F].
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => window.__probe.torch().on), true, 'the light step');
  const battery = await page.evaluate(() => window.__probe.torch().battery);
  let litThroughTake = true, rolled = false;
  await page.keyboard.press('r');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const value = await page.evaluate(() => ({ id: window.__scenes.top()?.id, dream: window.__probe.dreamFigure() }));
    seen.add(value.id);
    const rec = await page.evaluate(() => window.__probe.rec());
    if (rec.recording) { rolled = true; litThroughTake &&= rec.light === true; }
    if (value.dream.active) {
      assert.ok(rolled && litThroughTake, 'the level check never puts his light out');
      assert.equal(await page.evaluate(() => window.__probe.torch().battery), battery, 'the setup never counts the battery');
      return { ...value.dream, battery };
    }
    assert.ok(!String(value.id || '').startsWith('battle:'), 'the ripple must hand to the figure, not straight to the drill');
    await page.keyboard.press('2'); await page.keyboard.press('Enter'); await sleep(30);
  }
  throw new Error('never reached the dream');
}

// Mean luma in a box around a 0..1 screen point, read from the scene FBO.
async function lumaAt(page, point, half = .035) {
  return page.evaluate(async ({ point, half }) => {
    const url = window.__probe.sceneImage(384);
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.floor((point.x - half) * c.width)), x1 = Math.min(c.width, Math.ceil((point.x + half) * c.width));
    const y0 = Math.max(0, Math.floor((point.y - half * 2) * c.height)), y1 = Math.min(c.height, Math.ceil((point.y + half * 2) * c.height));
    const data = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
    let sum = 0; for (let i = 0; i < data.length; i += 4) sum += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    return sum / (data.length / 4);
  }, { point, half });
}
async function frames(page) { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))); await sleep(120); }
async function difference(page, point) {
  await page.evaluate(() => window.__probe.dreamFigureHide(false)); await frames(page);
  const shown = await lumaAt(page, point);
  await page.evaluate(() => window.__probe.dreamFigureHide(true)); await frames(page);
  const hidden = await lumaAt(page, point);
  await page.evaluate(() => window.__probe.dreamFigureHide(false)); await frames(page);
  return { shown, hidden, delta: Math.abs(shown - hidden) };
}

async function lit(browser) {
  const { page, errors } = await boot(browser), seen = new Set();
  try {
    const start = await intoDream(page, seen);
    assert.equal(start.lightOn, true, 'the dream turns his torch on');
    assert.equal(start.phase, 'walking');
    console.log('SPAWN', JSON.stringify({ distanceM: +start.distanceM.toFixed(2), throughWall: start.throughWall }));
    // Measure a little way into the walk, where it is well inside the beam.
    await page.waitForFunction(() => window.__probe.dreamFigure().distanceM < 4.6, { timeout: 30000 });
    const frozen = await page.evaluate(() => window.__probe.dreamFigureFreeze(true));
    assert.ok(frozen.screen?.visible, 'the body is in front of him');
    await frames(page);
    await page.screenshot({ path: `${out}/lit-walk.png` });
    const onBeam = await difference(page, frozen.screen);
    await page.keyboard.press('f'); await frames(page);
    assert.equal((await page.evaluate(() => window.__probe.dreamFigure())).lightOn, false);
    await page.screenshot({ path: `${out}/lit-walk-torch-off.png` });
    const offBeam = await difference(page, frozen.screen);
    console.log('READBACK', JSON.stringify({ torchOn: onBeam, torchOff: offBeam }));
    assert.ok(onBeam.delta > 6, `his torch picks the body out (${onBeam.delta.toFixed(1)} luma)`);
    assert.ok(offBeam.delta < onBeam.delta * .35, `with the torch off it is mostly dark (${offBeam.delta.toFixed(1)} vs ${onBeam.delta.toFixed(1)})`);
    await page.keyboard.press('f'); await frames(page);
    assert.equal((await page.evaluate(() => window.__probe.dreamFigure())).lightOn, true);
    await page.evaluate(() => window.__probe.dreamFigureFreeze(false));
    await page.waitForFunction(() => window.__probe.dreamFigure().reaching === true, { timeout: 30000 });
    await page.screenshot({ path: `${out}/lit-reaching.png` });
    await page.waitForFunction(() => String(window.__scenes.top()?.id || '').startsWith('battle:'), { timeout: 30000 });
    const battle = await page.evaluate(() => {
      const top = window.__scenes.top(), view = top.battleView?.();
      return { id: top.id, enemy: view?.state?.def?.enemy || view?.state?.enemy || null, light: window.__probe.rec().light, dream: window.__probe.dreamFigure() };
    });
    await sleep(400); await page.screenshot({ path: `${out}/lit-fight.png` });
    console.log('FIGHT', JSON.stringify(battle));
    assert.equal(battle.light, true, 'the light is still on: nothing in the tutorial puts it out');
    assert.equal(await page.evaluate(() => window.__probe.torch().battery), start.battery, 'the dream spent no battery');
    assert.equal(battle.dream.active, false);
    const named = await page.evaluate(() => JSON.stringify(window.__scenes.top().battleView?.()).includes('THE THING IN THE LIGHT'));
    assert.ok(named, 'the opponent is the figure');
    const ach = await page.evaluate(() => !!window.__probe.meta().achievements?.ACH_LIGHT_OFF);
    assert.equal(ach, false, 'no achievement for being caught');
    assert.deepEqual(errors, []);
    console.log('PASS lit');
  } finally { await page.browserContext().close(); }
}

async function dark(browser) {
  const { page, errors } = await boot(browser), seen = new Set();
  try {
    await intoDream(page, seen);
    await sleep(900);
    await page.keyboard.press('f');
    assert.equal((await page.evaluate(() => window.__probe.dreamFigure())).lightOn, false, '[F] puts the dream light out');
    let passing = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const value = await page.evaluate(() => ({ id: window.__scenes.top()?.id, dream: window.__probe.dreamFigure() }));
      seen.add(value.id);
      if (value.dream.phase === 'passing' && !passing) { passing = true; await page.screenshot({ path: `${out}/dark-through.png` }); }
      if (!value.dream.active) break;
      await sleep(40);
    }
    // His lines after it has gone through are read at the player's pace, and
    // the case waits for them.
    await page.waitForFunction(() => window.__scenes.top()?.id === 'thought:dream-spared', { timeout: 10000 });
    await page.screenshot({ path: `${out}/dark-spared-lines.png` });
    for (let i = 0; i < 12 && await page.evaluate(() => window.__scenes.top()?.id === 'thought:dream-spared'); i++) {
      await page.keyboard.press('Enter'); await sleep(260);
    }
    await sleep(300);
    const after = await page.evaluate(() => ({
      id: window.__scenes.top()?.id, dream: window.__probe.dreamFigure(), handoff: window.__probe.setupHandoff(),
      ach: window.__probe.meta().achievements?.ACH_LIGHT_OFF || null,
    }));
    await page.screenshot({ path: `${out}/dark-after.png` });
    console.log('SPARED', JSON.stringify({ passing, seen: [...seen], after }));
    assert.ok(passing, 'it walked through him');
    assert.ok(![...seen].some((id) => String(id || '').startsWith('battle:')), 'no fight opened');
    assert.equal(after.dream.trained, true, 'the rehearsal is behind him');
    assert.equal(after.dream.spared, true);
    assert.ok(after.ach, 'the achievement is awarded');
    assert.equal(after.handoff.stage, 'open-bag', 'the opening carries on to the case');

    assert.deepEqual(errors, []);
    console.log('PASS dark');
  } finally { await page.browserContext().close(); }
}

async function answerRadio(page, cueId) {
  await page.waitForFunction((id) => window.__probe.radio().pendingCue?.id === id && window.__probe.radio().call.status === 'calling', { timeout: 30000 }, cueId);
  await page.keyboard.press('v');
  await page.waitForFunction(() => /radio/.test(String(window.__scenes.top()?.id || '')), { timeout: 10000 });
  const lines = [];
  for (let i = 0; i < 40 && /radio/.test(String(await page.evaluate(() => window.__scenes.top()?.id || ''))); i++) {
    const text = await page.evaluate(() => JSON.stringify(window.__scenes.top()?.view?.() || window.__scenes.top()?.debugState?.() || {}));
    lines.push(text);
    await page.keyboard.press('1'); await page.keyboard.press('Enter'); await sleep(320);
  }
  return lines.join('\n');
}

async function walkout(browser) {
  const { page, errors } = await boot(browser);
  try {
    await page.evaluate(() => window.__probe.setFlags(['setup.levels', 'combat.trained', 'setup.waypoint', 'radio.work-order-read'], []));
    await answerRadio(page, 'initial_checkin');
    await page.evaluate(() => window.__probe.setTorch(true));
    const inside = await page.evaluate(() => window.__probe.torch().battery);
    await sleep(2500);
    assert.equal(await page.evaluate(() => window.__probe.torch().battery), inside, 'in the get-in with the light on, nothing is counted');
    await page.evaluate(() => window.__probe.godWarpHook('studio-b3'));
    await page.waitForFunction(() => window.__probe.radio().pendingCue?.id === 'light_checkin', { timeout: 15000 });
    await sleep(2000);
    const outside = await page.evaluate(() => window.__probe.torch().battery);
    assert.ok(outside < inside, `out of the get-in, the cells run down (${inside} -> ${outside})`);
    const heard = await answerRadio(page, 'light_checkin');
    await page.screenshot({ path: `${out}/walkout-after-call.png` });
    console.log('WALK OUT', JSON.stringify({ inside, outside, milestone: await page.evaluate(() => window.__probe.radio().milestones.light_checkin) }));
    assert.match(heard, /Keep it off as much as you can/, 'Martin says it');
    assert.match(heard, /\[F\] puts the light out/, 'with the key');
    assert.equal(await page.evaluate(() => window.__probe.radio().milestones.light_checkin), true);
    assert.deepEqual(errors, []);
    console.log('PASS walkout');
  } finally { await page.browserContext().close(); }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 120000,
});
try {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === 'lit') await lit(browser);
  if (which === 'all' || which === 'dark') await dark(browser);
  if (which === 'all' || which === 'walkout') await walkout(browser);
} catch (error) {
  console.error('FAIL', error.stack); process.exitCode = 1;
} finally { await browser.close(); }
