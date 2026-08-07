// What does the engraving cost the frame, really?
//
// material-mutation.js disables the entire lens FOR THE SESSION if generation
// overlaps a frame longer than 33ms, so this is not a performance nicety — it
// is the difference between the feature existing and silently switching itself
// off in play. Node benchmarks do not answer it: canvas drawImage/getImageData
// is a different path in Chrome, and the spikes come from tiles arriving in
// bursts rather than from any single derivation.
//
// The history this guards, measured on this machine:
//   deriving inline at 512px          worst frame 49ms   (lens-killer)
//   inline at 256px, flushed at commit worst frame 56ms  (moved the burst)
//   amortised on a frame budget        worst frame 9.3ms (baseline is 9.3ms)
//
// Re-run it after ANY change to the mark pipeline — above all when the mark
// field gains its render target, which is the next thing that costs per-frame
// bandwidth rather than per-tile CPU.
//
// Needs the mock lens and dev server:
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/measure-mark-field-cost.mjs
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,PaintHolding,BackForwardCache',
    '--window-size=1280,800', '--use-angle=metal'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
const wait = (fn, t = 240000) => page.waitForFunction(fn, { timeout: t });

await page.goto(`${base}/index.html?skiptut=1&nomic=1&sam=0&diffusion=${encodeURIComponent('ws://127.0.0.1:5198')}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await page.evaluate(() => window.__scenes.top().id) === 'eula') {
  await page.keyboard.press('Enter');
  await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000);
}
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
console.log('opening credits reached — banks are streaming');

// Tiles arrive during the opening and the menu. Watch the derivation counter.
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const s = await page.evaluate(() => window.__probe?.surfaceDream?.()?.marks || null);
  if (s?.derived > 0) {
    console.log(`derived ${s.derived} mark fields  |  last ${s.lastMs}ms  avg ${s.avgMs}ms  ` +
      `|  ${s.source}px source -> ${s.size}px field  |  ready=${s.ready}`);
    if (s.derived >= 10) break;
  }
  await page.evaluate(() => window.__scenes?.top?.()?.update?.(2));
}

// Measure STEADY STATE. Without the reset the window spans the whole session,
// so one-time boot costs — shader compilation, atlas upload, the first texture
// allocations — land in maxFrameMs and read as a per-frame regression. That
// produced a 53.7ms "spike" that was entirely boot and did not reproduce.
await page.evaluate(() => window.__probe.performanceReset());
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => window.__scenes?.top?.()?.update?.(1));
}

const final = await page.evaluate(() => ({
  marks: window.__probe?.surfaceDream?.()?.marks || null,
  lens: window.__diffusion?.stats?.state || null,
  mutationDisabled: window.__diffusion?.stats?.mutationDisabled ?? null,
  perf: window.__probe?.performance?.() || null,
}));
console.log('\nfinal:', JSON.stringify(final, null, 2));
console.log('\npage errors:', errors.length ? errors.slice(0, 5) : 'none');

const marks = final.marks;
let ok = true;
const check = (label, pass) => { console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}`); if (!pass) ok = false; };
console.log();
check('mark textures exist', !!marks?.ready);
check('fields were derived from real tiles', (marks?.derived || 0) > 0);
check(`derivation stays well under the 33ms lens-killer (${marks?.avgMs}ms avg)`, (marks?.avgMs ?? 99) < 16);
check(`steady-state frames stay clear of the gate (max ${final.perf?.maxFrameMs?.toFixed?.(1)}ms)`, (final.perf?.maxFrameMs ?? 99) < 33);
check('the lens did not disable mutation', final.mutationDisabled !== true);
// The two 404s are pre-existing on this dev server (they appear with the mark
// field removed too), so only unexpected errors count.
const unexpected = errors.filter((e) => !/404 \(Not Found\)/.test(e));
check(`no unexpected page errors${unexpected.length ? `: ${unexpected[0]}` : ''}`, unexpected.length === 0);

await browser.close();
process.exit(ok ? 0 : 1);
