// You are scared, and it takes things from you.
//
//   npm run dev   &&   node tools/chunk_surfer/tests/fear.mjs
//
// Six claims:
//   · Fear is a real number: it rises when you hear something and it falls slowly.
//   · Past the top of the scale he BREATHES, and a breath is noise, and noise
//     kills a take. Being frightened costs you the job.
//   · The hush does not always hurt you. When it TAKES you, you wake somewhere
//     you did not walk to, with time gone.
//   · It takes one of your things, and the waypoint it leaves is his GUESS.
//   · What it took actually blocks you: no recorder, no take. No torch, no torch.
//   · Finding it gives it back.

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
const fear = () => ev(() => window.__probe.fear());
const rec = () => ev(() => window.__probe.rec());

await p.goto('http://localhost:5173/labs/chunk-surfer/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0&at=15,12', { waitUntil: 'domcontentloaded' });
await ev(() => localStorage.clear());
await p.reload({ waitUntil: 'domcontentloaded' });
await wait(15000);
let n = 0; while (await ev(() => window.__scenes.depth()) > 0 && n++ < 20) await key('Enter', 110);

// the post pass now carries fear — it must still compile
const shader = logs.filter((l) => /uniform|WebGLProgram|shader|compile|link|loop error/i.test(l));
check('the fear post-pass compiles', shader.length === 0, shader.slice(0, 2).join(' | '));

// ── fear is a real number ────────────────────────────────────────────────────
check('you start calm', (await fear()).level < 0.05, JSON.stringify(await fear()));
await ev(() => window.__probe.bumpFear(0.5));
check('hearing something frightens you', (await fear()).level >= 0.5, String((await fear()).level));
const f0 = (await fear()).level;
await wait(3000);
const f1 = (await fear()).level;
check('and it falls slowly, the way a body does', f1 < f0 && f1 > 0, `${f0} → ${f1}`);

// ── fear spoils takes: he breathes, and a breath is noise ────────────────────
await ev(() => window.__probe.tuneRoomTone({ takeSeconds: 45 }));
await ev(() => window.__probe.setFear(0));
for (let i = 0; i < 40 && (await ev(() => window.__probe.rec().noise)) > 0.02; i++) await wait(120);
await key('r', 500); await key('r', 700);                    // listen, roll
check('rolling', (await rec()).recording);
await ev(() => window.__probe.setFear(1));                   // terrified, mid-take
await wait(3200);                                            // he cannot hold his breath
const br = await rec();
check('BEING FRIGHTENED SPOILS THE TAKE', br.spoiled, br.spoilReason);
check('...because he could not keep his breath quiet', /breath/i.test(br.spoilReason || ''), br.spoilReason);
await wait(1600);

// ── it takes you ─────────────────────────────────────────────────────────────
const before = await ev(() => ({ pos: window.__probe.pos(), secs: JSON.parse(localStorage.getItem('chunk-surfer:save:v2') || '{}').playSeconds || 0 }));
await ev(() => window.__probe.takeMe());
await wait(80);
check('TAKEN becomes a blocking jumpscare scene',await ev(()=>window.__scenes.top()?.id)==='taken-flash');
await wait(1850);                                            // flash → black → wake
check('wake-up account is a focused transcript, not radio HUD speech',await ev(()=>window.__scenes.top()?.id)==='taken-dialogue');
for(let i=0;i<24&&await ev(()=>window.__scenes.top()?.id)==='taken-dialogue';i++)await key('Space',90);
const after = await ev(() => ({ pos: window.__probe.pos(), secs: JSON.parse(localStorage.getItem('chunk-surfer:save:v2') || '{}').playSeconds || 0 }));
check('TAKEN: you wake somewhere you did not walk to',
  after.pos.x !== before.pos.x || after.pos.y !== before.pos.y, `${JSON.stringify(before.pos)} → ${JSON.stringify(after.pos)}`);
check('...and the night is shorter than it was', after.secs > before.secs, `${before.secs}s → ${after.secs}s`);

const fs = await fear();
check('and one of your things is gone', !!fs.lost && !!fs.lostAt, JSON.stringify(fs.lost));
const marked = await ev(() => window.__probe.obj());
check('he marks where he THINKS it went', !!marked.wp, JSON.stringify(marked.wp));

// ── what it took actually blocks you ─────────────────────────────────────────
const lost = fs.lost;
if (lost === 'recorder') {
  await key('r', 400);
  check('no recorder, no take', !(await rec()).recording && !(await rec()).listening);
} else if (lost === 'torch') {
  const lit0 = (await rec()).light;
  await key('f', 400);
  check('no torch, no light', (await rec()).light === lit0);
} else {
  check(`it took the ${lost} — the game continues`, true, lost);
}

// ── and finding it gives it back ─────────────────────────────────────────────
await ev(() => window.__probe.warpToLost());
await wait(900);
check('finding it gives it back', !(await fear()).lost, JSON.stringify((await fear()).lost));

console.log(logs.length ? `\nconsole errors:\n${[...new Set(logs)].slice(0, 3).join('\n')}` : '\nno console errors');
console.log(pass ? '\n✅ FEAR PASSED' : '\n❌ FAILURES');
await b.close();
process.exit(pass ? 0 : 1);
