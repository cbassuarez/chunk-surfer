// Walk the cold open to the booth and photograph the name the rain takes.
// Scratch tool; delete when done.
import puppeteer from 'puppeteer-core';

const OUT = '/private/tmp/claude-501/-Users-seb-chunk-surfer/5c746d6d-4b3f-4112-84ad-a829095a30d1/scratchpad';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => p.evaluate(fn, ...a);
const top = () => ev(() => window.__scenes?.top?.()?.id || null);
const convo = () => ev(() => window.__probe?.convo?.() ?? null);

await p.goto('http://localhost:5173/index.html?nomic=1&sam=0&diffusion=ws://127.0.0.1:8765',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => !!window.__scenes, { timeout: 120000 });
await p.bringToFront();
await p.mouse.click(640, 400).catch(() => {});

// Front matter. The two consent cards take only Y/N.
for (let i = 0; i < 240; i++) {
  const s = await top();
  if (s === 'cold-open') break;
  if (s === 'lens-calibration') { await p.keyboard.press('m'); await wait(400); continue; }
  if (i % 6 === 0) await p.mouse.click(640, 400).catch(() => {});
  await p.keyboard.press('Enter'); await p.keyboard.press(' '); await p.keyboard.press('n');
  await wait(200);
}
console.log('scene', await top());

// Walk the conversation, taking the LAST option at every branch, until the
// booth's name exchange shows up.
let shots = 0;
for (let i = 0; i < 900 && shots < 6; i++) {
  const v = await convo();
  const id = v?.lineSourceId || '';
  if (/threshold\.line\.(name|returned)/.test(id)) {
    await wait(120);
    await p.screenshot({ path: `${OUT}/name-${String(shots).padStart(2, '0')}-${id.split('.').pop()}.png` });
    console.log('shot', id, JSON.stringify(v?.line?.text || '').slice(0, 40), 'mask=', v?.line?.mask || '-');
    shots++;
    await wait(260);
  }
  if (v?.pending?.kind === 'branch' || v?.pending?.kind === 'say') {
    await p.keyboard.press(String(v.pending.options.length));
    await wait(90);
    continue;
  }
  await p.keyboard.press(' ');
  await wait(60);
  if ((await top()) !== 'cold-open') break;
}
console.log('final scene', await top());
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
await b.close();
