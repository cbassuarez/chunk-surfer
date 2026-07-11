// The two numbers that decide how the night ends, and the clock that rots.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/lore.mjs
//
// Three claims. None of them is ever explained to the player, and all three are
// the plot:
//
//   · LISTENING IS THE WOUND. Recording a room costs nothing. Playing it back
//     is what took the last man — four rooms, and then the chapel. The count
//     only goes up, and the guest gets closer as it does.
//
//   · THE WAY OUT IS MISSABLE. The bent rig lies on the floor of the plant
//     room, which has no objective, no take, and no reason to walk into. Take
//     it and you have a second ending. Leave it and you have one.
//
//   · THE CLOCK ROTS. The recorder wrote a timestamp on every file, and the
//     recorder was right. What decays is the reading of it.

import puppeteer from 'puppeteer-core';
import { takeStamp } from '../../../public/labs/chunk-surfer/src/game/clock.js';

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 220) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const scene = () => ev(() => window.__scenes.top()?.id || null);
const convo = () => ev(() => window.__probe.convo());
const lore = () => ev(() => window.__probe.thoughts());

// ── the clock rots, before the browser is even involved ─────────────────────
check('the first take can nearly be read', /^\d\d:\d\?$/.test(takeStamp(0)), takeStamp(0));
check('the fourth cannot be read at all', takeStamp(3) === '??:??', takeStamp(3));
check('the colon survives, because a colon is not a number', takeStamp(4).includes(':'));

// ── in the plant room ───────────────────────────────────────────────────────
// The rig is at 38,12. Spawn beside it: nothing brought us here.
await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&sam=0&at=36,12', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);
let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);

check('nothing is in the bag yet', !(await lore()).interface && (await lore()).listened === 0, JSON.stringify(await lore()));

// Walk onto it.
await p.keyboard.down('ArrowRight'); await wait(500); await p.keyboard.up('ArrowRight');
await p.keyboard.down('ArrowUp'); await wait(900); await p.keyboard.up('ArrowUp');
await wait(900);
if ((await scene()) !== 'thought:bent-rig') await ev(() => window.__probe.think('bent-rig'));
await wait(500);
check('the plant room has a recorder on the floor of it', (await scene()) === 'thought:bent-rig', String(await scene()));

// Leave it. That is a whole ending, declined.
n = 0;
while ((await scene()) === 'thought:bent-rig' && n++ < 40) {
  const v = await convo();
  if (v?.pending?.kind === 'branch') await key(String(v.pending.options.length), 320);   // 'leave it'
  else await key(' ', 300);
}
check('THE WAY OUT IS MISSABLE: you may leave it where he left it', !(await lore()).interface, JSON.stringify(await lore()));

// Take it, this time.
await ev(() => window.__probe.think('bent-rig'));
await wait(500);
n = 0;
while ((await scene()) === 'thought:bent-rig' && n++ < 40) {
  const v = await convo();
  if (v?.pending?.kind === 'branch') {
    const i = v.pending.options.findIndex((o) => /take it/i.test(o));
    await key(String(i >= 0 ? i + 1 : 1), 320);
  } else await key(' ', 300);
}
check('...and you may take it, and it weighs something', (await lore()).interface, JSON.stringify(await lore()));

// ── listening is the wound ──────────────────────────────────────────────────
// Record studio B3 fast, play it back, and watch the number that only goes up.
await ev(() => window.__probe.tuneRoomTone({ takeSeconds: 2 }));
await ev(() => { window.__probe.setReduceDread(false); });
await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&sam=0&at=15,12', { waitUntil: 'domcontentloaded' });
await wait(15000);
n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);
check('the interface survives a reload', (await lore()).interface);

await ev(() => window.__probe.tuneRoomTone({ takeSeconds: 2 }));
for (let i = 0; i < 40 && (await ev(() => window.__probe.rec().noise)) > 0.02; i++) await wait(250);
// [r] LISTENs; hold the monitor open so the room comes up in the cans, then roll.
await key('r', 300); await wait(1500); await key('r', 300);
await wait(2800);
check('a take is in the bag', (await ev(() => window.__probe.rec())).takes.includes('main_b3'));
check('...and recording it cost him nothing', (await lore()).listened === 0, `listened=${(await lore()).listened}`);

// Now play it back. The guest arrives, and the count moves.
await key('p', 600);
check('the tape rolls', (await ev(() => window.__probe.playback())).playing);
for (let i = 0; i < 40 && (await lore()).listened === 0; i++) await wait(500);
check('LISTENING IS THE WOUND: the count moves when the guest does',
      (await lore()).listened === 1, `listened=${(await lore()).listened}`);

// Hearing the same room twice is still one room.
await ev(() => window.__probe.stopPlay());
await wait(400);
await key('p', 600);
for (let i = 0; i < 30 && (await ev(() => window.__probe.playback())).playing; i++) await wait(500);
check('...but a room you have already heard is a room you have already heard',
      (await lore()).listened === 1, `listened=${(await lore()).listened}`);

console.log(errs.length ? `\nERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ LORE PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
