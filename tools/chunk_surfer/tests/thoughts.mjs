// The interior. Four thought trees, drawn over a world that does not stop.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/thoughts.mjs
//
// Four claims, each of which is a design decision that would rot silently:
//
//   · NOTHING ADVANCES BY ITSELF. Idle on a line and it is still that line.
//   · YOU CHOOSE TO SPEAK. A `me` line is offered before it is said.
//   · THE BUILDING DOES NOT WAIT. `blocksWorld: false` — the presence keeps
//     closing while you decide what to tell yourself about the noise.
//   · SHAKING THE RADIO COSTS YOU. The guard told you twice.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 220) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...args) => p.evaluate(fn, ...args);
const scene = () => ev(() => window.__scenes.top()?.id || null);
const convo = () => ev(() => window.__probe.convo());

// Spawn in studio B3, past the prologue. Thought trees are armed.
await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&sam=0&at=15,12', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);
let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 40) await key('Enter', 110);

check('in the conservatory, in studio B3', (await ev(() => window.__probe.world())) === 'main_b3');
check('no thought has been had yet', (await ev(() => window.__probe.thoughts())).had.length === 0);

// ── the first take intercepts [r] once ──────────────────────────────────────
await key('r', 700);
check('[r] in B3 opens the first-take tree', (await scene()) === 'thought:first-take', String(await scene()));
check('...and did not start a take', !(await ev(() => window.__probe.rec())).recording);

// It does not advance on its own.
const a = await convo();
await wait(6000);
const c = await convo();
check('a thought does not advance by itself', a.text === c.text && !c.typing, JSON.stringify(a.text.slice(0, 34)));

// Walk it: every step is a picker. `roll` is the last one and it starts a take.
n = 0;
while ((await scene()) === 'thought:first-take' && n++ < 40) await key(' ', 200);
check('the tree ends', (await scene()) !== 'thought:first-take', `${n} presses`);
await wait(500);
check('...and rolling actually rolls', (await ev(() => window.__probe.rec())).recording);

// Never twice.
await key('r', 500);   // stop
await wait(1600);
await key('r', 600);
check('the second [r] is a bare take, no tree',
      !(await scene()) && (await ev(() => window.__probe.rec())).recording, String(await scene()));
await key('r', 400);
await wait(1400);

// ── the world does not wait for a thought ───────────────────────────────────
await ev(() => window.__probe.stopPlay?.());
// Put it across studio B3 and give it somewhere to walk to: it hunts the cell
// where noise was last made, which is where the player is standing.
await ev(() => { window.__probe.placePresence(22, 12); window.__probe.noise(0.5); });
await ev(() => window.__probe.think('hush'));
await wait(400);
check('the hush tree opens', (await scene()) === 'thought:hush', String(await scene()));

const before = await ev(() => window.__probe.presence());
await wait(2500);                       // stand there. think about it.
const after = await ev(() => window.__probe.presence());
check('THE BUILDING DOES NOT WAIT: it kept moving while you thought',
      before.x !== after.x || before.y !== after.y,
      `${before.x.toFixed(1)},${before.y.toFixed(1)} → ${after.x.toFixed(1)},${after.y.toFixed(1)}`);

check('but you cannot walk while you think', await ev(() => window.__scenes.blocksInput()));
n = 0; while ((await scene()) === 'thought:hush' && n++ < 30) await key(' ', 180);
check('the hush tree closes', (await scene()) !== 'thought:hush');

// ── the radio: he was told twice ────────────────────────────────────────────
await ev(() => window.__probe.think('radio-dead'));
await wait(500);
check('the radio tree opens', (await scene()) === 'thought:radio-dead', String(await scene()));

// Advance to the first picker, then choose "shake it" (option 2).
n = 0; while (!(await convo())?.pending && n++ < 12) await key(' ', 180);
const opts = (await convo()).pending.options;
check('you may shake it', opts.some((o) => /shake/i.test(o)), JSON.stringify(opts));

const noiseBefore = await ev(() => window.__probe.rec().noise);
const shakeIdx = opts.findIndex((o) => /shake/i.test(o)) + 1;
// Noise decays at 0.45/sec (config.js), so a squelch of 0.34 is gone inside a
// second. Sample it while it is still in the room.
await key(String(shakeIdx), 100);
const noiseAfter = await ev(() => window.__probe.rec().noise);
check('SHAKING IT COSTS YOU: the building heard that', noiseAfter > noiseBefore,
      `${noiseBefore.toFixed(3)} → ${noiseAfter.toFixed(3)}`);

// The heard map decays far more slowly, and it is what the building reads.
const here = await ev(() => window.__probe.pos());
const heard = await ev((c) => window.__probe.heardAt(c.x, c.y), here);
check('...and the cell you stand in is pinned', heard > 0.5, `heard=${heard.toFixed(2)}`);

console.log(errs.length ? `\nERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ THOUGHTS PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
