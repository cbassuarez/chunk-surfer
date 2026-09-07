// Real launch/input/render checks. Native fullscreen commands remain covered by
// the director tests; this browser check exercises the advisory's presentation.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const origin = process.env.GAME_URL || 'http://127.0.0.1:5199';
const out = 'artifacts/advisories';
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=metal'],
});
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(`${origin}/?nomic=1&sam=0&nothink=1`, { waitUntil: 'domcontentloaded' });
  const waitScene = id => page.waitForFunction(id => window.__scenes?.top()?.id === id, { timeout: 60000 }, id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  await waitScene('display-notice');
  await sleep(600);
  await page.screenshot({ path: `${out}/window-browser.png` });
  // Keep Enter held across the boundary; its repeats must not dismiss screen 2.
  await page.keyboard.down('Enter');
  await waitScene('headphone-notice');
  await sleep(700);
  await page.keyboard.down('Enter');
  assert.equal(await page.evaluate(() => window.__scenes.top().id), 'headphone-notice');
  await page.keyboard.up('Enter');
  await page.screenshot({ path: `${out}/headphones.png` });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__scenes?.top()?.id !== 'headphone-notice');
  assert.equal(await page.evaluate(() => window.__scenes.top().id), 'eula', 'normal launch reaches licence only after both advisories');

  // Fixture scenes use the production renderer and input routing. Pause the
  // transition promise so both pending and failure layouts can be inspected.
  for (const [label, width, height, scale] of [
    ['wide', 1280, 760, 1], ['minimum', 960, 600, 1],
    ['large-text', 960, 600, 1.5], ['fullhd', 1920, 1080, 1],
  ]) {
    await page.setViewport({ width, height });
    for (const kind of ['window', 'headphones', 'transition', 'retry']) {
      await page.waitForFunction(() => !!window.__scenes, { timeout: 60000 });
      await page.evaluate(async ({ kind, scale }) => {
        const { makeDisplayNoticeScene, makeHeadphoneNoticeScene } = await import('/src/game/display-notice.js');
        const { uiSetScale } = await import('/src/render/ui.js');
        uiSetScale(scale);
        const options = { desktop: true, getReducedMotion: () => true };
        if (kind === 'transition') options.transition = () => new Promise(() => {});
        if (kind === 'retry') options.transition = () => false;
        window.__scenes.replace(kind === 'headphones' ? makeHeadphoneNoticeScene(options) : makeDisplayNoticeScene(options));
        if (kind === 'retry') window.__scenes.top().update(3);
      }, { kind, scale });
      await sleep(300);
      await page.screenshot({ path: `${out}/${kind}-${label}.png` });
    }
  }

  // The real keyboard handler must not open pause over an automatic transition.
  await page.evaluate(async () => {
    const { makeDisplayNoticeScene } = await import('/src/game/display-notice.js');
    const { uiSetScale } = await import('/src/render/ui.js');
    uiSetScale(1);
    window.__advisoryDone = 0;
    window.__advisoryCalls = 0;
    window.__scenes.replace(makeDisplayNoticeScene({
      transition: () => { window.__advisoryCalls++; return new Promise(resolve => { window.__releaseAdvisory = resolve; }); },
      onDone: () => { window.__advisoryDone++; },
    }));
  });
  await sleep(700);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__scenes.top().id), 'window-transition');
  assert.equal(await page.evaluate(() => window.__advisoryCalls), 0, 'readable lead-in before OS action');
  await page.waitForFunction(() => window.__advisoryCalls === 1);
  await page.evaluate(() => window.__releaseAdvisory(false));
  await sleep(100);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__advisoryCalls), 2);
  await page.evaluate(() => window.__releaseAdvisory(true));
  assert.equal(await page.evaluate(() => window.__advisoryDone), 0);
  await page.waitForFunction(() => window.__advisoryDone === 1);
  assert.equal(await page.evaluate(() => window.__scenes.depth()), 0);
  assert.deepEqual(errors, [], 'no browser module or runtime errors');
  console.log(`Advisory sequence, held key, mouse, transition/retry checks passed. Screenshots: ${out}`);
} finally {
  await browser.close();
}
