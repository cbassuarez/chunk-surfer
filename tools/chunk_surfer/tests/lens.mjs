// The lens sleeps in the dock.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/lens.mjs
//
// Two claims, one of which is a bug that shipped and would ship again:
//
//   · The title, the cold open, the door and the whole of the setup run on the
//     raymarcher's raw geometry. The building has not met him yet. It wakes the
//     first time he steps out of the loading dock, and never sleeps again.
//
//   · A preset that carries a prompt (booth, battle, rupture, hush) OWNS the
//     lens while it is up, and MUST hand the prompt back when it leaves.
//     `updateZonePrompt` only fires on a zone change, so without an explicit
//     reset the booth's coffee cup and key hooks keep painting the dock.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const scene = () => ev(() => window.__scenes.top()?.id || null);
const convo = () => ev(() => window.__probe.convo());
const bypassed = () => ev(() => window.__diffusion.isBypassed());
const prompt = () => ev(() => String(window.__diffusion.tune({}).prompt || ''));
const walk = async (k, ms) => { await p.keyboard.down(k); await wait(ms); await p.keyboard.up(k); await wait(150); };

// `lens=1` so there is a lens at all. No token is needed: setBypass never
// opens the socket, and after it wakes the connection simply fails to a base
// render, which is the state we are asserting about anyway.
await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&lens=1&sam=0', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);

check('the lens is asleep before the game begins', await bypassed());

let n = 0; while ((await scene()) === 'title' && n++ < 8) { await p.keyboard.press('Enter'); await wait(280); }
await wait(1000);
check('asleep through the cold open', (await scene()) === 'cold-open' && await bypassed());

// ── the handback, tested where it lives ─────────────────────────────────────
// `applyLensPreset` is what shipped the bug, so drive it directly rather than
// waiting for a scene to mount at the exact moment the lens happens to exist.
check('a preset with a prompt locks the lens', await ev(() => window.__probe.lensPreset('booth')));
check('...and owns the frame', (await prompt()).includes('security booth'), (await prompt()).slice(0, 40));
check('a preset without one unlocks it', !(await ev(() => window.__probe.lensPreset('explore'))));
await wait(400);   // one frame of updateZonePrompt
check('THE HANDBACK: the zone gets its prompt back at once',
      !(await prompt()).includes('security booth'), (await prompt()).slice(0, 44));

let branches = 0;
for (let i = 0; i < 400 && (await scene()) === 'cold-open'; i++) {
  const v = await convo();
  if (v?.pending?.kind === 'branch') { branches++; await p.keyboard.press(String(branches === 1 ? 2 : v.pending.options.length)); }
  else await p.keyboard.press(' ');
  await wait(80);
}
n = 0; while ((await scene()) === 'world-title' && n++ < 8) { await p.keyboard.press(' '); await wait(200); }
check('asleep through the title', await bypassed());
n = 0; while ((await scene()) === 'after-title' && n++ < 60) { await p.keyboard.press(' '); await wait(130); }
await wait(700);

check('asleep behind the door', (await scene()) === 'thought:post-door' && await bypassed());

// Get through the post-door tree.
for (let i = 0; i < 30; i++) {
  const v = await convo();
  if (v?.pending?.kind === 'branch') break;
  await p.keyboard.press(' '); await wait(120);
}
await p.keyboard.press('1'); await wait(600);
n = 0; while (((await scene()) || '').startsWith('thought') && n++ < 14) { await p.keyboard.press(' '); await wait(160); }
await wait(500);

check('asleep in the loading dock', await bypassed(), `pos ${JSON.stringify(await ev(() => window.__probe.pos()))}`);
check('THE BOOTH HANDED THE PROMPT BACK', !(await prompt()).includes('security booth'), (await prompt()).slice(0, 44));

// Out of the dock. The building starts dreaming.
await ev(() => window.__probe.tutSkip());
for (let i = 0; i < 6; i++) { await walk('ArrowDown', 900); if ((await ev(() => window.__probe.pos())).y > 15) break; }
await wait(700);

const pos = await ev(() => window.__probe.pos());
check('you are past the inner door', pos.y > 15, `${pos.x},${pos.y}`);
check('THE LENS WAKES, and never sleeps again', !(await bypassed()));
check('...and it dreams the room it is standing in', (await prompt()).includes('sub-basement recording studio'),
      (await prompt()).slice(0, 44));

console.log(errs.length ? `\nERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ LENS PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
