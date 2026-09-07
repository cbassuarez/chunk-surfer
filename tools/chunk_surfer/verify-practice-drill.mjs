import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base = process.env.GAME_URL || 'http://127.0.0.1:5203';
const output = 'artifacts/practice-drill';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
let page;
try {
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(`${base}/?nomic=1&sam=0&nothink=1`);
  await page.waitForFunction(() => !!window.__probe?.battleId && !!window.__scenes?.top(), { timeout: 90000 });
  // The production battle route supplies the run seed, composure, and director.
  // Leave boot/licence beneath the debug battle; this does not start a real run.
  assert.equal(await page.evaluate(() => window.__probe.battleId('practice', false)), true);
  await page.waitForFunction(() => window.__scenes.top()?.id === 'encounter-start', { timeout: 15000 });
  for (let n = 0; n < 2 && await page.evaluate(() => window.__scenes.top()?.id === 'encounter-start'); n++) {
    await page.keyboard.press('Enter');
    await sleep(150);
  }
  await page.waitForFunction(() => !!window.__scenes.top()?.battleView?.().practice, { timeout: 45000 });
  const view = () => page.evaluate(() => window.__scenes.top()?.battleView?.());
  const ready = () => page.waitForFunction(() => window.__scenes.top()?.battleView?.().phase === 'move', { timeout: 30000 });
  await ready();
  for (const [name, width, height, scale] of [['wide',1280,760,1],['minimum',960,600,1],['large-text',960,600,1.5]]) {
    await page.setViewport({ width, height });
    await page.evaluate(async scale => (await import('/src/render/ui.js')).uiSetScale(scale), scale);
    await sleep(400);
    const snapshot = await view();
    assert.equal(snapshot.controls.length, 4);
    assert.equal(snapshot.inlineClues, false, 'puzzles never replace the adversary');
    assert.equal(snapshot.adversary, 'practice');
    assert.ok(snapshot.actions.every(action => action.enabled));
    const bounds = await page.evaluate(async () => (await import('/src/render/ui.js')).uiSize());
    for (const rect of snapshot.controls) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= bounds.cols && rect.y + rect.h <= bounds.rows, `${name}: visible button bounds`);
    }
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  await page.setViewport({ width:1280, height:760 });
  await page.evaluate(async () => (await import('/src/render/ui.js')).uiSetScale(1));
  await sleep(200);
  const before = await view();
  const wrong = before.actions.findIndex(action => action.id !== before.practice.sequence[before.practice.step]);
  await page.keyboard.press(String(wrong + 1));
  await ready();
  const mistake = await view();
  assert.equal(mistake.practice.mistakes, 1);
  assert.equal(mistake.practice.composure, before.practice.composure - 5);
  assert.deepEqual(mistake.cue, before.cue);
  await page.screenshot({ path: `${output}/mistake.png` });
  const clueSeen = new Set();
  let clicks = 0;
  for (let step = 0; step < 16; step++) {
    const snapshot = await view();
    if (snapshot.state.result) break;
    const answer = snapshot.practice.sequence[snapshot.practice.step];
    if (!clueSeen.has(answer)) {
      await page.screenshot({ path: `${output}/stage-${answer}.png` });
      clueSeen.add(answer);
    }
    const index = snapshot.actions.findIndex(action => action.id === answer);
    if (step % 2 === 0) {
      const point = await page.evaluate(async index => {
        const rect = window.__scenes.top().battleView().controls[index];
        const { uiSize } = await import('/src/render/ui.js');
        const { cols, rows } = uiSize();
        const map = document.getElementById('map').getBoundingClientRect();
        return { x:map.left+(rect.x+rect.w/2)/cols*map.width, y:map.top+(rect.y+rect.h/2)/rows*map.height };
      }, index);
      await page.mouse.click(point.x, point.y); clicks++;
    } else await page.keyboard.press(String(index + 1));
    await page.waitForFunction(() => ['move','result'].includes(window.__scenes.top()?.battleView?.().phase), { timeout:30000 });
  }
  const won = await view();
  assert.equal(won.state.result, 'win');
  assert.equal(won.practice.cycle, won.practice.cycles);
  assert.equal(clueSeen.size, 4); assert.ok(clicks >= 4);
  await page.screenshot({ path: `${output}/complete.png` });
  await sleep(800); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__scenes.top()?.battleView?.().practice);
  const runtimeErrors = errors.filter(error => !/404|WebSocket|diffusion|lens|net::ERR_/i.test(error));
  assert.deepEqual(runtimeErrors, [], 'no renderer or input exceptions');
  console.log(JSON.stringify({ result:'PASS', cycles:won.practice.cycles, phrase:won.practice.sequence, mouseMoves:clicks, mistakes:won.practice.mistakes, screenshots:output, otherConsoleErrors:errors }));
} catch (error) {
  console.error('Practice browser check failed:', errors, await page?.evaluate(() => ({scene:window.__scenes?.top()?.id,view:window.__scenes?.top()?.battleView?.()})));
  await page?.screenshot({path:`${output}/failure.png`});
  throw error;
} finally { await browser.close(); }
