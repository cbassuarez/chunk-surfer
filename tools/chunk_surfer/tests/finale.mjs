// M5 — the fifth room, the confrontation, the two endings, the guard.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/finale.mjs
//
// Six claims:
//   · The chapel is locked until the other four takes exist.
//   · Rolling the chapel enters the confrontation, not a take — and it is
//     turn-based, with an anti-reward checkpoint: a wrong read raises threat.
//   · Surviving hands to the ending choice.
//   · [invert the signal] exists only if you took the bent rig; taking it runs
//     the escape (a false door, then a way out you did not open) and writes
//     `inversion` to META.
//   · Feeding it writes `sacrifice`, and the guard epilogue is keyed to the
//     confession (client if you confessed anything, nobody if you gave nothing).
//   · Ending survives into the next title from META.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 130) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const scene = () => ev(() => window.__scenes.top()?.id || null);
const bs = () => ev(() => window.__probe.battleState());
const fin = () => ev(() => window.__probe.finale());

async function boot(flags) {
  const url = `http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0&at=90,66${flags ? `&flags=${flags}` : ''}`;
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await ev(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(15000);
  let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);
}

// Drive the confrontation. rightCP=false makes the wrong (threat-raising) read.
async function driveBattle({ rightCP = true, win = true } = {}) {
  let sawCheckpoint = false, threatAfterWrong = 1;
  for (let i = 0; i < 260 && (await scene() || '').startsWith('battle'); i++) {
    const s = await bs();
    if (!s) { await key(' ', 90); continue; }
    if (s.phase === 'checkpoint') {
      sawCheckpoint = true;
      // option 1 = hold the line (right); option 2 = feed it (wrong, harder)
      await key(rightCP ? '1' : '2', 200);
      const t = (await bs())?.threatMul ?? 1; if (!rightCP) threatAfterWrong = t;
    } else if (s.phase === 'menu') {
      // LISTEN (1) then, once known, NAME IT (4) — the honest, cheap win. To
      // lose on purpose, BREATHE forever (never listen, never name right).
      await key(win ? (s.known ? '4' : '1') : '3', 200);
    } else {
      await key(' ', 90);
    }
  }
  return { sawCheckpoint, threatAfterWrong };
}

// ── run 1: the gate, the checkpoint, and Ending B (inversion) ────────────────
await boot('confession.kind=name,confession.value=Sarah,listened.count=5,has.interface');

// four rooms done, chapel not yet
await ev(() => ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic'].forEach((r) => window.__probe.seedTake(r)));
check('spawned in the chapel', (await ev(() => window.__probe.world())) === 'lux_nova', String(await ev(() => window.__probe.world())));

// rolling the chapel with four takes enters the confrontation, not a take
await key('r', 500);
check('the chapel is the confrontation, not a take', (await scene()) === 'battle:chapel', String(await scene()));

// it is turn-based with a checkpoint, and a wrong read raises threat
const wrong = await driveBattleUntilThreat();
check('a wrong checkpoint read raises threat (never composure)', wrong > 1.001, `threatMul=${wrong.toFixed(2)}`);

// finish winning the fight → the ending choice
await driveBattle({ rightCP: true, win: true });
check('surviving hands to the ending choice', (await scene()) === 'finale', String(await scene()));

// the invert option is present (we have the rig); choose it
const chose = await chooseChoice(/rig/i);
check('[invert the signal] is offered with the rig', chose, JSON.stringify(await convoChoices()));

// walk the escape: INVERT_START → door → false door → rescue → final → guard
await advanceBeats();                                   // INVERT_START
for (let i = 0; i < 30 && !(await fin()).escape; i++) await wait(200);
check('the escape begins at the grey door', (await fin()).escape === 'door', JSON.stringify(await fin()));
await ev(() => window.__probe.escapeWarp()); await wait(600);
check('reaching the grey door triggers the false-door beat', (await scene()) === 'finale', String(await scene()));
await advanceBeats();                                   // FALSE_DOOR
for (let i = 0; i < 20 && (await fin()).escape !== 'rescue'; i++) await wait(200);
check('the waypoint re-routes to the way out', (await fin()).escape === 'rescue', JSON.stringify(await fin()));
await ev(() => window.__probe.escapeWarp()); await wait(600);
await advanceBeats();                                   // rescue + INVERSION_FINAL
// guard epilogue, then title
for (let i = 0; i < 40 && (await scene()) === 'finale'; i++) await key(' ', 130);
const meta1 = (await fin()).endingsSeen;
check('Ending B writes `inversion` to META', meta1.includes('inversion'), JSON.stringify(meta1));

// ── run 2: no rig, confession nothing → Ending A (sacrifice), guard = nobody ──
await boot('confession.kind=nothing,listened.count=5');
await ev(() => ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic'].forEach((r) => window.__probe.seedTake(r)));
await key('r', 500);
check('confrontation again', (await scene()) === 'battle:chapel', String(await scene()));
await driveBattle({ rightCP: true, win: true });
check('ending choice, no rig', (await scene()) === 'finale', String(await scene()));
const choices = await waitForChoices();
check('the invert option is absent without the rig', !choices.some((c) => /rig|invert/i.test(c)), JSON.stringify(choices));
await chooseChoice(/give it/i);
await advanceBeats();                                   // sacrifice ending
for (let i = 0; i < 40 && (await scene()) === 'finale'; i++) await key(' ', 130);
const meta2 = (await fin()).endingsSeen;
check('Ending A writes `sacrifice` to META', meta2.includes('sacrifice'), JSON.stringify(meta2));

// ── run 3: the coffee — drink it, escape → reframed as 'drugged' ─────────────
await boot('has.coffee,confession.kind=name,confession.value=Sarah,has.interface');
const c0 = await ev(() => window.__probe.coffee());
check('the coffee is in the bag, not yet drunk', c0.has && !c0.drank, JSON.stringify(c0));
await ev(() => window.__probe.drinkCoffee());
const c1 = await ev(() => window.__probe.coffee());
check('drinking it starts the lens bloom', c1.drank && c1.target > 0.9, JSON.stringify(c1));
await ev(() => ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic'].forEach((r) => window.__probe.seedTake(r)));
await key('r', 500);
await driveBattle({ rightCP: true, win: true });
await chooseChoice(/rig/i);
await advanceBeats();
for (let i = 0; i < 30 && !(await fin()).escape; i++) await wait(200);
await ev(() => window.__probe.escapeWarp()); await wait(600); await advanceBeats();
for (let i = 0; i < 20 && (await fin()).escape !== 'rescue'; i++) await wait(200);
await ev(() => window.__probe.escapeWarp()); await wait(600); await advanceBeats();
for (let i = 0; i < 50 && (await scene()) === 'finale'; i++) await key(' ', 120);
const meta3 = (await fin()).endingsSeen;
check('drank + escape reframes the ending as `drugged`', meta3.includes('drugged'), JSON.stringify(meta3));

// ── run 4: drink it, stay → reframed as 'helped' ────────────────────────────
await boot('has.coffee,confession.kind=reason,confession.value=craft');
await ev(() => window.__probe.drinkCoffee());
await ev(() => ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic'].forEach((r) => window.__probe.seedTake(r)));
await key('r', 500);
await driveBattle({ rightCP: true, win: true });
await chooseChoice(/give it/i);
await advanceBeats();
for (let i = 0; i < 50 && (await scene()) === 'finale'; i++) await key(' ', 120);
const meta4 = (await fin()).endingsSeen;
check('drank + stay reframes the ending as `helped`', meta4.includes('helped'), JSON.stringify(meta4));

// helpers that need page scope ------------------------------------------------
async function convoChoices() { return ev(() => window.__probe.convo()?.pending?.options || []); }
async function waitForChoices() { for (let i = 0; i < 40; i++) { const o = await convoChoices(); if (o.length) return o; if ((await scene()) !== 'finale') return []; await key(' ', 120); } return []; }
async function chooseChoice(re) {
  const opts = await waitForChoices(); const i = opts.findIndex((o) => re.test(o));
  if (i < 0) return false; await key(String(i + 1), 320); return true;
}
async function advanceBeats() { for (let i = 0; i < 40 && (await scene()) === 'finale' && !(await convoChoices()).length; i++) await key(' ', 120); }
async function driveBattleUntilThreat() {
  for (let i = 0; i < 40 && (await scene() || '').startsWith('battle'); i++) {
    const s = await bs(); if (!s) { await key(' ', 90); continue; }
    if (s.phase === 'checkpoint') { await key('2', 220); return (await bs())?.threatMul ?? 1; }
    if (s.phase === 'menu') { await key(s.known ? '4' : '1', 180); } else await key(' ', 90);
  }
  return 1;
}

console.log(errs.length ? `\nERRORS:\n${[...new Set(errs)].slice(0, 4).join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ FINALE PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);

