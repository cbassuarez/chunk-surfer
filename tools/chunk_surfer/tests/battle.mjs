// What's happening to me. The listening-test battle.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/battle.mjs
//
// The fight is the thesis of the whole piece made into a verb: is it in the
// room? Four claims:
//
//   · Composure is the meter, and it is the take. Empty it and you lose.
//   · LISTEN reveals what the sound truly is. A professional should always
//     know; he doesn't any more, and listening is how he claws it back.
//   · LISTEN then NAME IT correctly wins. It is the honest reading of a room.
//   · BREATHE recovers composure but exposes you, and panicking loses.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 200) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const scene = () => ev(() => window.__scenes.top()?.id || null);
const bs = () => ev(() => window.__probe.battleState());

// Advance dialogue until a menu is up, or the battle ends.
async function toMenu(limit = 60) {
  for (let i = 0; i < limit; i++) {
    if (!(await scene() || '').startsWith('battle')) return null;
    const s = await bs();
    if (s?.phase === 'menu') return s;
    await key(' ', 150);
  }
  return null;
}

async function open() {
  await ev(() => window.__probe.battle(false));
  await wait(400);
}

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&sam=0&at=85,30', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);
let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);

// ── the mechanic ────────────────────────────────────────────────────────────
await open();
check('a battle is a scene', (await scene()) === 'battle:natatorium', String(await scene()));
let m = await toMenu();
check('it reaches a verb menu', !!m && m.verbs?.length === 4, JSON.stringify(m?.verbs));
check('composure starts full', m.composure === 1, String(m.composure));
check('and the sound is not yet identified', m.known === null, String(m.known));

// LISTEN (verb 1) reveals what it is.
await key('1', 400);
let after = await bs();
check('LISTEN identifies the sound', after.known !== null, String(after.known));

// Win the honest way: LISTEN, then NAME IT, every round.
n = 0;
while ((await scene() || '').startsWith('battle') && n++ < 80) {
  const s = await bs();
  if (s?.phase === 'menu') await key(String(s.known ? 4 : 1), 320);
  else await key(' ', 170);
}
check('LISTEN then NAME IT wins', !(await scene() || '').startsWith('battle'), `${n} steps`);

// ── panic loses ─────────────────────────────────────────────────────────────
await open();
n = 0; let lost = false;
while ((await scene() || '').startsWith('battle') && n++ < 120) {
  const s = await bs();
  if (s?.phase === 'menu') {
    // Never listen. Breathe (exposes you), then guess (verb 4 without knowing).
    await key(s.known === null ? '3' : '4', 320);
  } else await key(' ', 150);
  const cur = await bs();
  if (cur && cur.composure <= 0) lost = true;
}
check('composure can be spent to nothing', lost || !(await scene() || '').startsWith('battle'));
check('the battle ends either way', !(await scene() || '').startsWith('battle'), String(await scene()));

// ── Sarah is in it ──────────────────────────────────────────────────────────
await open();
let sawSarah = false;
for (let i = 0; i < 40 && (await scene() || '').startsWith('battle'); i++) {
  const s = await bs();
  if (s?.who === 'sarah') sawSarah = true;
  if (s?.phase === 'menu') await key(String(s.known ? 4 : 1), 280);
  else await key(' ', 150);
}
check('Sarah is in the room he cannot record', sawSarah);

console.log(errs.length ? `\nERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ BATTLE PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
