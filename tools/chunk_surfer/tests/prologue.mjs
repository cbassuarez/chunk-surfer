// The cold open and the setup.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/prologue.mjs
//
// The prologue is the only place the game teaches, and it teaches by wanting
// something. Six claims:
//
//   · There is no system text. Every line the game says has a speaker.
//   · NOTHING ADVANCES BY ITSELF, and [esc] does not exist.
//   · YOU CHOOSE TO SPEAK. A `me` line is offered before it is said, even when
//     there is only one thing to say.
//   · The trunk you took at the booth decides which question the building asks
//     you at the door.
//   · The tutorial never takes a key away. Steps can be done out of order and
//     nothing is refused.
//   · The level check is a real take that costs nothing to spoil, and nothing
//     hunts a man who has not started.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 190) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Movement is sampled from HELD keys once a frame, so a press that lands
// between two frames is never seen. Walking means holding the key down.
const walkKey = async (k, ms) => { await p.keyboard.down(k); await wait(ms); await p.keyboard.up(k); await wait(120); };
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const scene = () => ev(() => window.__scenes.top()?.id || null);
const convo = () => ev(() => window.__probe.convo());
const speech = () => ev(() => window.__probe.speech());
const tut = () => ev(() => window.__probe.tut());

// Drive a conversation to its end. `trunk` is the option taken at the FIRST
// branch; after that we always take the last option, which is the one that
// leaves.
async function walk(sceneId, trunk = 1, limit = 400) {
  let branches = 0;
  for (let i = 0; i < limit && (await scene()) === sceneId; i++) {
    const v = await convo();
    if (v?.pending?.kind === 'branch') {
      branches++;
      await key(String(branches === 1 ? trunk : v.pending.options.length), 110);
    } else await key(' ', 80);
  }
  return branches;
}

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&sam=0', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);

let n = 0;
while (await scene() === 'title' && n++ < 8) await key('Enter', 300);
await wait(900);

check('the game opens cold, on a black screen', (await scene()) === 'cold-open');
check('and the tutorial has not begun', !(await tut()).active);

// ── nothing advances by itself ──────────────────────────────────────────────
const first = await convo();
await wait(7000);
const later = await convo();
check('NOTHING ADVANCES BY ITSELF: idle seven seconds, same line',
      first.text === later.text && !later.typing, JSON.stringify(first.text.slice(0, 36)));

for (let i = 0; i < 5; i++) await key('Escape', 80);
check('[esc] does not end the cold open', (await scene()) === 'cold-open');
check('...and does not skip a line', (await convo()).text === first.text);

// ── you choose to speak ─────────────────────────────────────────────────────
let sawSay = null;
for (let i = 0; i < 24 && !sawSay; i++) {
  const v = await convo();
  if (v?.pending?.kind === 'say') sawSay = v;
  else await key(' ', 150);
}
check('YOU CHOOSE TO SPEAK: a `me` line is offered, not spoken',
      !!sawSay && sawSay.pending.options.length === 1, sawSay ? JSON.stringify(sawSay.pending.options[0]) : '');
// Nothing of it is on screen: the line exists, but not one character of it.
check('...and not a letter of it is out of his mouth', sawSay && sawSay.typed === 0, `typed=${sawSay?.typed}`);
await key(' ', 450);
const said = await convo();
check('...until you choose it', said.who === 'me' && said.typed > 0, `typed=${said.typed}`);

// ── walk the booth by the guard trunk ───────────────────────────────────────
const branches = await walk('cold-open', 2);
check('the cold open ends', (await scene()) !== 'cold-open', `${branches} branches`);

// The world-title is an authored ~12s cinematic and is now un-skippable: no key
// collapses it, so we wait it out rather than pressing through.
n = 0; while ((await scene()) === 'world-title' && n++ < 30) await wait(600);
check('the title comes before the door', (await scene()) === 'after-title', String(await scene()));

// The door shuts AFTER the title, into a mix the song has just vacated.
n = 0; while ((await scene()) === 'after-title' && n++ < 60) await key(' ', 130);
await wait(700);

// ── the door, and what he says into the dark ────────────────────────────────
check('the push bar is not where the push bar is', (await scene()) === 'thought:post-door', String(await scene()));
check('the guard trunk asks him WHO would notice', (await convo()).node === 'guard', (await convo()).node);

for (let i = 0; i < 30; i++) {
  const v = await convo();
  if (v?.pending?.kind === 'branch') break;
  await key(' ', 130);
}
const opts = (await convo()).pending.options;
check('and offers him a name to say', opts.some((o) => /Sarah/.test(o)), JSON.stringify(opts));
await key(String(opts.findIndex((o) => /Sarah/.test(o)) + 1), 600);

const conf = (await ev(() => window.__probe.thoughts())).confession;
check('THE BUILDING HEARD IT', conf.kind === 'name' && conf.value === 'Sarah', JSON.stringify(conf));

n = 0; while ((await scene() || '').startsWith('thought') && n++ < 14) await key(' ', 170);
check('and then he reaches for the torch', !(await scene()), String(await scene()));

// ── the setup ───────────────────────────────────────────────────────────────
await wait(500);
let t = await tut();
check('the setup begins in the dark', t.active && t.step === 'light', JSON.stringify(t));
check('and he says so, in his own voice', (await speech())?.who === 'you', JSON.stringify(await speech()));
check('nothing addresses the player', !/\[|press |you can/i.test((await speech())?.text || ''), (await speech())?.text);
check('he starts with the light off', !(await ev(() => window.__probe.rec())).light);

// The tutorial never locks input: you can walk while it wants the torch.
const p0 = await ev(() => window.__probe.pos());
await walkKey('ArrowUp', 400);
const p1 = await ev(() => window.__probe.pos());
check('you may walk before you are told how', p0.x !== p1.x || p0.y !== p1.y, `${p0.x},${p0.y} → ${p1.x},${p1.y}`);
check('...and the prompt is still waiting for the torch', (await tut()).step === 'light');

await key('f', 500);
check('[f] satisfies the room', (await tut()).step !== 'light', (await tut()).step);
check('the torch is on', (await ev(() => window.__probe.rec())).light);

await key('b', 500);
check('[b] opens the bag', (await scene()) === 'bag', String(await scene()));
await ev(() => window.__probe.read());       // the work order, from the bag
await wait(400);
await key('Escape', 300);
check('reading it satisfies the next step', (await tut()).step === 'mark', (await tut()).step);

// ── the one step he must do himself ─────────────────────────────────────────
// Nothing is greyed out. He simply does not get on with the night until he has
// used the only navigation verb the game has, on the room the order named first.
check('the work order did not mark B3 for him', !(await ev(() => window.__probe.obj())).target);
check('and the tutorial is waiting on it', (await tut()).prompt.includes('mark'), (await tut()).prompt);

check('still in the bag', (await scene()) === 'bag', String(await scene()));

// He will not write down another room until the basement is done. Not a locked
// door: every door in the building is open. A man declining to plan.
// Cursor order is now [radio] → studio B3 → work-order note → the natatorium: the
// live radio is a selectable GEAR item, so it takes one more step down to reach
// a room that is not the basement.
await key('ArrowDown', 200);                  // studio B3 (room)
await key('ArrowDown', 200);                  // the work order note
await key('ArrowDown', 200);                  // the natatorium
await ev(() => window.__probe.hush());        // clear the queue so we hear HIM
await key(' ', 600);
check('BASEMENT FIRST: he refuses to mark another room', !(await ev(() => window.__probe.obj())).target);
check('...and says why', /basement/i.test((await speech())?.text || ''), (await speech())?.text);
await ev(() => window.__probe.hush());

await key('ArrowUp', 200); await key('ArrowUp', 200);   // back to studio B3
await key(' ', 600);
const obj = await ev(() => window.__probe.obj());
check('MARKING IS A VERB HE USES: studio B3 is marked', obj.target === 'main_b3', JSON.stringify(obj.wp));
await key('b', 500);
check('marking satisfies the step', (await tut()).step === 'level', (await tut()).step);

// ── the level check: a real tree, then a real take that may fail ────────────
await ev(() => window.__probe.hush());
await key('r', 700);
check('[r] in the dock opens the level check', (await scene()) === 'thought:level-check', String(await scene()));
check('...and does not roll yet', !(await ev(() => window.__probe.rec())).recording);

// Walk it, always taking the last option, which is the one that rolls.
n = 0;
while ((await scene()) === 'thought:level-check' && n++ < 40) {
  const v = await convo();
  if (v?.pending?.kind === 'branch') await key(String(v.pending.options.length), 320);
  else await key(' ', 300);
}
await wait(600);
// The level-check tree IS the guided listen and ends on "roll", so it hands
// straight into a recording.
check('the level check ends by rolling', (await ev(() => window.__probe.rec())).recording, `${n} presses`);

await walkKey('ArrowUp', 300);
check('moving spoils the level check, as it will spoil every take',
      (await ev(() => window.__probe.rec())).spoiled, (await ev(() => window.__probe.rec())).spoilReason);
await wait(1800);
check('spoiling the level check costs nothing', (await tut()).step === 'level');

await ev(() => window.__probe.hush());
for (let i = 0; i < 40 && (await ev(() => window.__probe.rec().noise)) > 0.02; i++) await wait(250);
// The tree is spent now; a retry in the dock rolls straight (the tutorial owns
// the level check, and the dock is not a room you LISTEN in).
await key('r', 500);
await wait(7500);
check('six clean seconds is a level check', (await tut()).step === 'go', (await tut()).step);
check('and the recorder is handed back', !(await ev(() => window.__probe.rec())).recording);
check('the level check is not a take', !(await ev(() => window.__probe.rec())).takes.length);
check('the level check does not summon the presence', !(await ev(() => window.__probe.presence())).active);

// Leaving the dock ends the setup. Hold it down and walk.
await ev(() => window.__probe.hush());
for (let i = 0; i < 6 && (await tut()).active; i++) await walkKey('ArrowDown', 900);
check('walking out of the dock ends the setup', !(await tut()).active, JSON.stringify(await tut()));
check('you are out of the dock', (await ev(() => window.__probe.pos())).y > 15);

const r = await ev(() => window.__probe.radio());
check('the client answered exactly once', r.transmissions === 1 && !r.dead, JSON.stringify(r));

console.log(errs.length ? `\nERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ PROLOGUE PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
