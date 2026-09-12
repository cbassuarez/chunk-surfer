// [R] OUTSIDE ELLERY, in the real build.
//
// Two presses in two places that used to do nothing: on the walk the recorder
// key cycled four lines and then repeated the last for ever, and in the loading
// bay it reached SPEECH.say(LINES.notARoom) — a line that did not exist, so the
// press was silent. Both are a hub about the kit now.
//
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-rig-check.mjs
//
// NOTE: no `nothink=1`. That switch is how the mechanism suites press [r]
// without being asked how they feel about the corridor, and it is exactly what
// this file is here to look at.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const out = process.env.OUT || 'artifacts/rig-check';
await mkdir(out, { recursive: true });
const URL = process.env.GAME_URL || 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { errors.push(String(e.stack || e)); console.log(String(e.stack || e)); });
  page.on('console', (m) => { if (m.type() === 'error' && m.text().includes('LOOP')) errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  await page.goto(`${URL}/?nodisplaynotice=1&nomic=1&sam=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__probe?.testRun && window.__scenes?.top?.());
  await page.evaluate(() => window.__probe.testRun());
  await page.waitForFunction(() => window.__chunkParity?.().screen === 'game', { timeout: 120000 });

  const top = () => page.evaluate(() => window.__scenes?.top?.()?.id ?? null);
  const view = () => page.evaluate(() => window.__scenes?.top?.()?.view?.() ?? null);
  const press = async (key) => { await page.keyboard.press(key); await sleep(450); };
  // The bay has props on it, and props carry their zone. Cheaper and far more
  // robust than a copied coordinate, which has moved before.
  // Props carry their AUTHORED zone and authored coordinates; warpRuntime takes
  // runtime ones. Rather than bake toRuntimeCoord's arithmetic into a harness
  // that will outlive it, try each candidate and ask the game where it landed.
  const bay = await page.evaluate(() => {
    const props = window.__probe.props().instances.filter((p) => p.zone === 1);
    for (const p of props) {
      for (const at of [{ x: Math.round(p.x * 2) + 1, y: Math.round(p.y * 2) + 1 }, { x: p.x, y: p.y }]) {
        window.__probe.warpRuntime(at.x, at.y);
        if (window.__probe.rig().outside) return at;
      }
    }
    return null;
  });
  assert.ok(bay, 'found a cell in the loading bay');
  console.log('BAY', JSON.stringify(bay), JSON.stringify(await page.evaluate(() => window.__probe.rig())));

  // ── the walk: the case is still in the van ────────────────────────────────
  await page.evaluate(({ x, y }) => {
    window.__probe.setFlags([], ['bag.taken']);
    window.__probe.warpRuntime(x, y);
  }, bay);
  await sleep(600);
  await press('r');
  assert.equal(await top(), 'thought:rig:walk', 'the walk press opens the kit hub, not a cycled line');
  await sleep(700);
  await page.screenshot({ path: `${out}/walk-hub.png` });
  let v = await view();
  console.log('WALK', JSON.stringify(v).slice(0, 260));
  await press('Escape');
  assert.notEqual(await top(), 'thought:rig:walk', 'and escape closes it');

  // ── the bay: it is on his shoulder ────────────────────────────────────────
  await page.evaluate(({ x, y }) => {
    window.__probe.setFlags(['bag.taken']);
    window.__probe.warpRuntime(x, y);
  }, bay);
  await sleep(600);
  await press('r');                       // ONE press. The kit, not the machine.
  assert.equal(await top(), 'thought:rig:bay', 'the press outside opens the bay hub');
  await sleep(700);
  await page.screenshot({ path: `${out}/bay-hub.png` });

  // Nothing advances by itself (conversation.js rule 1), so the lines have to be
  // walked before the question board is up.
  const toChoices = async (limit = 24) => {
    for (let i = 0; i < limit; i += 1) {
      const state = await view();
      // The engine calls it `pending`, and a `say` picker is one too — but only
      // a branch is the question board this file is about.
      if (state?.pending?.kind === 'branch' && state.pending.options.length) return state;
      await press('Enter');
    }
    return view();
  };

  const hub = await toChoices();
  const before = hub?.pending?.options?.length ?? 0;
  console.log('HUB', (hub?.pending?.options || []).map((c) => c.text).join(' | '));
  assert.ok(before >= 5, `the bay hub offers the kit (${before} choices)`);
  await page.screenshot({ path: `${out}/bay-hub.png` });

  // A spoke, and then the hub minus the one it spent.
  await press('Enter');
  await sleep(400);
  await page.screenshot({ path: `${out}/bay-spoke.png` });
  const back = await toChoices();
  const after = back?.pending?.options?.length ?? 0;
  console.log('CHOICES', before, '->', after);
  assert.equal(back?.nodeId, 'start', 'a spoke returns to the hub');
  assert.equal(after, before - 1, `a spent question does not come back (${before} -> ${after})`);

  // ...and it stays spent across a fresh press, because the spending is on
  // flags rather than on the conversation's own asked-set, which dies with it.
  await press('Escape');
  await sleep(300);
  await press('r');
  assert.equal(await top(), 'thought:rig:bay');
  const reopened = await toChoices();
  assert.equal(reopened?.pending?.options?.length, after, 'reopening does not restore a spent question');
  await press('Escape');

  assert.deepEqual(errors, [], 'no page errors');
  console.log(`PASS rig check -> ${out}`);
} finally {
  await browser.close();
}
