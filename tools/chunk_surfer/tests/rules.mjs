// The three recording rules, made testable.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/rules.mjs
//
// Rule 1 is the one with teeth and the one worth asserting on: any noise loses
// the take, but only a LOUD noise — past catchNoise — finds you. A quiet slip is
// a wasted minute and nothing more; a loud one costs you an injury. The radio's
// squelch rides the same additive path (see m4), so here we test the threshold
// itself, cleanly, through the noise probe.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 200) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const rec = () => ev(() => window.__probe.rec());

// Roll a clean take: [r] auditions, [r] rolls (nothink: no listen dialog).
async function roll() {
  for (let i = 0; i < 40 && (await ev(() => window.__probe.rec().noise)) > 0.02; i++) await wait(120);
  await key('r', 500); await key('r', 700);
}
// After a spoil, let it settle back to idle and quiet.
async function settle() {
  for (let i = 0; i < 30 && (await rec()).recording; i++) await wait(150);
  await ev(() => window.__probe.hush?.());
  for (let i = 0; i < 40 && (await ev(() => window.__probe.rec().noise)) > 0.02; i++) await wait(120);
}

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0&at=15,12', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);
let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);
check('spawned in studio B3', (await ev(() => window.__probe.world())) === 'main_b3', String(await ev(() => window.__probe.world())));
await ev(() => window.__probe.tuneRoomTone({ takeSeconds: 45 }));

const inj0 = (await rec()).injuries;

// ── a QUIET spoil: loses the take, does not find you ─────────────────────────
await roll();
check('rolling', (await rec()).recording);
await ev(() => window.__probe.noise(0.30));      // above spoil (0.18), below catch (0.40)
await wait(300);
const quiet = await rec();
check('a quiet noise spoils the take', quiet.spoiled, quiet.spoilReason);
check('...but does NOT injure you', quiet.injuries === inj0, `injuries ${inj0} -> ${quiet.injuries}`);
await settle();

// ── a LOUD spoil: loses the take AND finds you ───────────────────────────────
await roll();
check('rolling again', (await rec()).recording);
await ev(() => window.__probe.noise(0.60));      // past catch (0.40): significant noise
await wait(300);
const loud = await rec();
check('a loud noise spoils the take', loud.spoiled, loud.spoilReason);
check('...and it catches you (an injury)', loud.injuries === inj0 + 1, `injuries ${inj0} -> ${loud.injuries}`);

console.log(errs.length ? `\nERRORS:\n${[...new Set(errs)].slice(0, 4).join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ RECORDING RULES PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
