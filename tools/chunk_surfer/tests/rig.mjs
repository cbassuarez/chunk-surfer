// The trunk, the torch, and the fork.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/rig.mjs
//
// Five claims:
//   · Nobody is ambushed. There is an advisory and a microphone question in front
//     of the title, and neither of them is skippable by accident.
//   · The bent rig is one decision with two prices. SOLDER it and you have the
//     circuit that gets you out. GUT it and you have light, and no way out.
//   · The light you bought with the good ending is not even loyal: with four takes
//     on the card, at the chapel door, it dies. It was always going to.
//   · A torch is a battery, and a battery is a clock. Burning it costs it.
//   · The fork is where the lore lives, and it hands it over when you strike it.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1000, height: 640 });
const logs = []; p.on('pageerror', (e) => logs.push('PE:' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) logs.push(m.text()); });
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 160) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const torch = () => ev(() => window.__probe.torch());
const top = () => ev(() => window.__scenes.top()?.id || null);

// ── nobody is ambushed ───────────────────────────────────────────────────────
// The unadorned boot, with no ?skipwarn: the first thing in the world is the
// advisory, and the microphone is ASKED FOR, out loud, with a key that means yes.
await p.goto('http://localhost:5173/labs/chunk-surfer/index.html', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(2500);
check('the first thing you see is the advisory', (await top()) === 'warning', String(await top()));
await key('Enter', 400);
check('...then it asks for your microphone', (await top()) === 'warning', String(await top()));
await key('n', 700);                        // "play without it" — a real answer
check('and answering lets you into the title', (await top()) === 'title', String(await top()));

// ── the trunk: two prices, one decision ──────────────────────────────────────
// SOLDER. It costs you nothing you can see, which is the point: the reward for
// doing the job properly is that nothing happens.
const boot = async (q = '') => {
  await p.goto(`http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&skipwarn=1&nomic=1&sam=0&at=15,12${q}`, { waitUntil: 'domcontentloaded' });
  await ev(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(15000);
  let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);
};

// Walk the thought tree with the same fingers the player has: advance until it
// asks a real question, then move the cursor down and press the key.
const options = () => ev(() => (window.__scenes.top()?.view?.()?.pending?.options || []).map((o) => o.text || ''));
const untilBranch = async () => {
  for (let i = 0; i < 60; i++) {
    const o = await ev(() => { const v = window.__scenes.top()?.view?.(); return v?.pending?.kind === 'branch' ? v.pending.options.map((x) => x.text || '') : null; });
    if (o) return o;
    if ((await ev(() => window.__scenes.depth())) === 0) return [];
    await key('Enter', 110);
  }
  return [];
};
const chooseInThought = async (label) => {
  const opts = await untilBranch();
  const idx = opts.findIndex((t) => new RegExp(label, 'i').test(t));
  if (idx < 0) return -1;
  for (let i = 0; i < idx; i++) await key('ArrowDown', 90);
  await key('Enter', 300);
  return idx;
};

// Merely standing on the objects does nothing. The scene begins only when the
// interaction verb is pressed.
await boot();
await ev(() => window.__probe.warpCell(38, 12));
await wait(700);
check('walking onto the bent recorder does not auto-open it', !(await top()), String(await top()));
await key('e', 300);
check('[E] opens the bent recorder', (await top()) === 'thought:bent-rig', String(await top()));

await boot();
await ev(() => window.__probe.warpCell(66, 65));
await wait(700);
check('walking onto the tuning fork does not auto-open it', !(await top()), String(await top()));
await key('e', 300);
check('[E] opens the tuning fork', (await top()) === 'thought:talisman', String(await top()));

await boot();
await ev(() => window.__probe.think('bent-rig'));
await wait(500);
check('the plant room opens the trunk', (await top()) === 'thought:bent-rig', String(await top()));
await chooseInThought('look at it');            // you have to actually crouch and look
const solderIdx = await chooseInThought('reflow');
check('and one of the things you can do is finish his solder', solderIdx >= 0, `idx=${solderIdx}`);
let n = 0; while ((await ev(() => window.__scenes.depth())) > 0 && n++ < 40) await key('Enter', 90);
let t = await torch();
check('SOLDER: you have the circuit that gets you out', t.soldered, JSON.stringify(t));
check('...and you did not steal its cells', !t.gutted && t.battery >= 0.99, JSON.stringify(t));

// GUT. Light now, and the way out goes slack in the tray.
await boot();
await ev(() => window.__probe.think('bent-rig'));
await wait(500);
await chooseInThought('look at it');
const gutIdx = await chooseInThought('strip it');
check('or you can strip it for its cells', gutIdx >= 0, `idx=${gutIdx}`);
n = 0; while ((await ev(() => window.__scenes.depth())) > 0 && n++ < 40) await key('Enter', 90);
t = await torch();
check('GUT: the torch is fed — and it was ALREADY full, so this has to mean something', t.gutted && t.battery > 1.5, JSON.stringify(t));
check('...AND THE WAY OUT IS GONE', !t.soldered, JSON.stringify(t));

// ── the light is not loyal ───────────────────────────────────────────────────
// Four rooms on the card, standing at the chapel door, holding the light you
// traded your ending for. It goes out.
for (const r of ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic'])
  await ev((x) => window.__probe.seedTake(x), r);
await ev(() => window.__probe.warpCell(90, 66));      // the chapel, in the language of the map
await wait(1200);
t = await torch();
check('THE TORCH DIES AT THE CHAPEL DOOR', t.betrayed && t.battery === 0, JSON.stringify(t));
check('...and it cannot be turned back on', !(await ev(() => window.__probe.rec().light)));
await key('f', 300);
check('...pressing the light does nothing at all', !(await ev(() => window.__probe.rec().light)));

// ── a torch is a clock ───────────────────────────────────────────────────────
await boot();
const b0 = (await torch()).battery;
await ev(() => window.__probe.rec());
await key('f', 300);                                   // on
check('the torch lights', (await ev(() => window.__probe.rec().light)));
await ev(() => window.__probe.drainTorch(600));        // ten minutes of burning
const b1 = (await torch()).battery;
check('BURNING IT COSTS IT', b1 < b0, `${b0} → ${b1}`);
await ev(() => window.__probe.drainTorch(3000));
check('and it can be spent to nothing', (await torch()).battery === 0, String((await torch()).battery));
await key('f', 300);
check('a flat torch is not a decision, it is a fact', !(await ev(() => window.__probe.rec().light)));

// ── the fork ─────────────────────────────────────────────────────────────────
await boot();
await ev(() => window.__probe.think('talisman'));
await wait(500);
check('the fork opens', (await top()) === 'thought:talisman', String(await top()));
const forkOpts = await untilBranch();
check('you can pick it up', forkOpts.some((t) => /pick it up/i.test(t)), JSON.stringify(forkOpts));
await chooseInThought('pick it up');
const struckOpts = await untilBranch();
check('...and then you can STRIKE it', struckOpts.some((t) => /strike/i.test(t)), JSON.stringify(struckOpts));
await chooseInThought('strike');
n = 0; while ((await ev(() => window.__scenes.depth())) > 0 && n++ < 60) await key('Enter', 90);
check('and having heard it, the fork is in your pocket', await ev(() => window.__probe.flag('has.fork')));

console.log(logs.length ? `\nconsole errors:\n${[...new Set(logs)].slice(0, 3).join('\n')}` : '\nno console errors');
console.log(pass ? '\n✅ RIG PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
