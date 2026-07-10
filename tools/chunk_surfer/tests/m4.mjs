// M4.2 — the reader, the radio, the tape.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/m4.mjs
//
// Three systems that only exist to make the content mean something, and three
// claims about them that are load-bearing:
//
//   · The reader does not stop the world. If reading a page paused the
//     building, the pages would be a rest, and they are meant to be a cost.
//   · The radio works twice and then hunts you. It is the one sound made at
//     the cell you are standing in, and it spoils takes, and reduceDread
//     silences it without saving it.
//   · The tape contains what you did not hear. The guest is a voice the
//     monitor never passed, chosen once and sealed, so the same tape plays
//     the same way twice.

import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1000, height: 640 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = true;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const key = async (k, ms = 200) => { await p.keyboard.press(k); await new Promise((r) => setTimeout(r, ms)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn) => p.evaluate(fn);

// Spawn inside studio B3: this is where the first take is made, and the only
// room deep enough that a two-second take can hear anything at all.
await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&at=15,12', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);
let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n < 40) { await key('Enter', 110); n++; }

check('spawned in the conservatory', await ev(() => window.__probe.plan().loaded));
check('and in studio B3', await ev(() => window.__probe.world()) === 'main_b3',
      await ev(() => window.__probe.world()));

// ── the reader ──────────────────────────────────────────────────────────────
await key('e', 400);
check('[e] opens the work order', (await ev(() => window.__probe.scene())) === 'doc:work-order',
      String(await ev(() => window.__probe.scene())));

// The building keeps changing while you read. That is the whole point of the
// page being a place you go.
const mutBefore = await ev(() => window.__probe.mutStats().applied);
await ev(() => window.__probe.forceMutate());
await ev(() => window.__probe.forceMutate());
const mutAfter = await ev(() => window.__probe.mutStats().applied);
check('the world is not frozen while you read', mutAfter > mutBefore, `${mutBefore} → ${mutAfter}`);

const posBefore = await ev(() => window.__probe.pos());
await key('ArrowUp', 260);
const posAfter = await ev(() => window.__probe.pos());
check('...but you cannot walk while reading',
      posBefore.x === posAfter.x && posBefore.y === posAfter.y,
      `${posBefore.x},${posBefore.y} → ${posAfter.x},${posAfter.y}`);

await key('Escape', 500);
check('esc closes the reader', (await ev(() => window.__probe.scene())) === null);

// Reading the order does not mark anything. Marking is a verb HE uses, taught
// once in the dock and his forever after (see prologue.mjs).
const wp = await ev(() => window.__probe.obj());
check('reading the order marks nothing for him', !wp.target, JSON.stringify(wp.wp));

// ── the radio ───────────────────────────────────────────────────────────────
await wait(1600);   // transmission 1 fires 1.2s after the work order is read
let r = await ev(() => window.__probe.radio());
check('reading the work order raises the client, once', r.transmissions === 1 && !r.dead);

await ev(() => window.__probe.radioTransmit(1));
r = await ev(() => window.__probe.radio());
check('the second transmission kills it', r.transmissions === 2 && r.dead);

await ev(() => window.__probe.radioTransmit(0));
check('a dead radio does not transmit', (await ev(() => window.__probe.radio())).transmissions === 2);

// It squelches, and the squelch is a noise event at the cell you stand in.
await ev(() => window.__probe.radioTune({ squelchAfterSec: 0, cooldownSec: 0, expectThreshold: 0 }));
await ev(() => window.__probe.stabRelief(1));
const before = await ev(() => window.__probe.rec().noise);
const sq = await ev(() => window.__probe.radioTick());
check('a dead radio squelches', !!sq, JSON.stringify(sq));
const after = await ev(() => window.__probe.rec().noise);
check('...and the squelch is noise, at you', after > before, `${before.toFixed(3)} → ${after.toFixed(3)}`);

// It spoils takes. Same rule as your own knee.
await ev(() => window.__probe.tuneRoomTone({ takeSeconds: 2 }));
await key('r', 400);
check('recording', (await ev(() => window.__probe.rec())).recording);
await ev(() => window.__probe.radioTune({ duringTakeChance: 1 }));
await ev(() => window.__probe.radioTick());
await wait(300);
check('the radio on your belt spoils your take', (await ev(() => window.__probe.rec())).spoiled,
      (await ev(() => window.__probe.rec())).spoilReason);
await wait(1400);   // the spoiled meter closes itself

// reduceDread silences it. The radio still dies; it just stops hunting.
await ev(() => window.__probe.setReduceDread(true));
const quiet = await ev(() => window.__probe.radioTick());
check('reduce-dread silences the squelch', quiet === null);
check('...and the radio is still dead', (await ev(() => window.__probe.radio())).dead);
await ev(() => window.__probe.setReduceDread(false));

// Put the cooldown back. Left at zero, the radio squelches every frame and the
// room never goes quiet again — which is a good description of the hazard and
// a bad description of the game.
await ev(() => window.__probe.radioTune({ cooldownSec: 600, duringTakeChance: 0 }));

// ── the tape ────────────────────────────────────────────────────────────────
// A real take, two seconds long, with the monitor open. The squelch we just
// fired is still decaying in the room, and a take started now would be spoiled
// by it — so wait for the room, exactly as the recordist has to.
for (let i = 0; i < 60 && (await ev(() => window.__probe.rec().noise)) > 0.02; i++) await wait(250);
check('the room goes quiet again', (await ev(() => window.__probe.rec().noise)) <= 0.02,
      (await ev(() => window.__probe.rec().noise)).toFixed(3));
check('and the recorder is idle', !(await ev(() => window.__probe.rec())).recording);

await ev(() => window.__probe.tuneRoomTone({ takeSeconds: 2 }));
await key('r', 300);
await wait(2600);   // hold still. the take completes and closes itself.
const rec = await ev(() => window.__probe.rec());
check('a clean take is a take', rec.takes.includes('main_b3'), rec.takes.join(','));

const take = await ev(() => window.__probe.take('main_b3'));
check('the take is sealed', !!take && take.sealed);
check('the take contains what you heard', take.audible.length > 0, `${take.audible.length} voices`);
check('...and one voice you did not', take.guest != null, `guest=${take.guest}`);
check('the guest was never in the monitor',
      take.guest != null && !take.audible.some((a) => a.id === take.guest));

const again = await ev(() => window.__probe.take('main_b3'));
check('a tape does not re-roll its guest', again.guest === take.guest, `${take.guest} / ${again.guest}`);

await key('p', 600);
check('[p] plays the take back', (await ev(() => window.__probe.playback())).playing);
await wait(1200);
const prog = await ev(() => window.__probe.playback()).then((x) => x.progress);
check('the tape rolls', prog > 0, prog.toFixed(2));

// Playback is in your headphones. The room cannot hear it.
const nb = await ev(() => window.__probe.rec().noise);
await wait(700);
const na = await ev(() => window.__probe.rec().noise);
check('playback makes no noise in the room', na <= nb + 1e-6, `${nb.toFixed(3)} → ${na.toFixed(3)}`);

await ev(() => window.__probe.stopPlay());
check('and it can be stopped', !(await ev(() => window.__probe.playback())).playing);

console.log(errs.length ? `\nERRORS:\n${errs.join('\n')}` : '\nno page errors');
console.log(pass ? '\n✅ M4.2 PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
