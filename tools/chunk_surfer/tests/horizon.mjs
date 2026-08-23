#!/usr/bin/env node
// PAST THE PERIMETER — that it draws, and that leaving it gives the renderer back.
//
// Three separate faults met here and every one of them presented as "black":
//
//   1. The tape never drew. The scene framebuffer is MRT (colour + engraving)
//      and the horizon's fragment shader declared one output, so every splat
//      draw was rejected with "Active draw buffers with missing fragment shader
//      outputs". What anyone ever saw was the void clear behind the picture.
//   2. The camera was in the wrong space. The tape is baked in its own metres
//      (z 0..-512 back from the head); the world camera was passed straight in,
//      putting the eye 293 metres behind a far plane of 120.
//   3. The screen froze. Restoring `gl.enable(DEPTH_TEST)` at the end of the
//      splat pass — which looks like tidy state hygiene — put depth testing on
//      for the datamosh and present passes that follow it in the same frame.
//      The default framebuffer's depth is never cleared, so the first present
//      wrote depth and every one after it failed the LESS test. The pass kept
//      running and kept drawing all 46 slices into a buffer nothing was
//      showing; the canvas held frame one forever.
//   4. Leaving never turned it off. Only syncSourceRender cleared the horizon
//      and it begins `if(!usingSourceSpace()) return false`, so once the runtime
//      went the clear became unreachable and the renderer took the horizon
//      branch forever — void clear, no pixel mesh, no room, in every part of the
//      building you walked into next. Only a reload cleared it.
//
// Needs a dev server: CHUNK_SURFER_URL, or 127.0.0.1:5173.

import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';

const BASE = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5173';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 640 });
const glErrors = [];
page.on('console', (m) => { if (/GL_INVALID|missing fragment shader outputs/i.test(m.text())) glErrors.push(m.text()); });

// A dev server reloads the page whenever the module graph changes, and it will
// do it in the middle of a run — which surfaces as "Execution context was
// destroyed" from whichever evaluate happened to be in flight, i.e. as a
// failure in an unrelated assertion. Wait for the page to stop moving before
// trusting anything on it.
let lastNavigation = Date.now();
page.on('framenavigated', (f) => { if (f === page.mainFrame()) lastNavigation = Date.now(); });
const ready = async () => {
  await page.waitForFunction(() => window.__chunkSurferPixelMesh?.status?.()?.framesRendered > 4,
    { timeout: 20 * 60 * 1000, polling: 500 });
};
await page.goto(`${BASE}/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await ready();
for (let i = 0; i < 40 && Date.now() - lastNavigation < 2500; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  await ready().catch(() => {});
}

const settle = (n = 60) => page.evaluate((n) => new Promise((r) => {
  let i = 0; const step = () => (++i >= n ? r() : requestAnimationFrame(step)); requestAnimationFrame(step);
}), n);
const frame = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const o = document.createElement('canvas'); o.width = 96; o.height = 60;
  const cx = o.getContext('2d'); cx.drawImage(c, 0, 0, 96, 60);
  const d = cx.getImageData(0, 0, 96, 60).data;
  let sum = 0, max = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > max) max = l; }
  const st = window.__chunkSurferPixelMesh?.status?.() || {};
  return { luma: sum / (d.length / 4), max, frames: st.framesRendered };
});

await page.evaluate(() => window.__probe.testRun());
await settle(); await page.evaluate(() => window.__probe.godWarpBay());
await settle(); const bay = await frame();
check(bay.luma > 20, `the loading bay renders before the horizon (luma ${bay.luma.toFixed(1)})`);
// Sampled here, while the body is still in the building — once it is on the
// tape this reads the horizon's own pace and the comparison is against itself.
const indoorStep = await page.evaluate(() => window.__probe.moveInterval());

await page.evaluate(() => {
  window.__probe.godMenu('source-space');
  const scene = window.__scenes.top();
  for (let i = 0; i < 80; i += 1) {
    if (scene.view?.()?.row === 'horizon-head') { scene.key({ key: 'Enter', code: 'Enter', preventDefault() {} }); return; }
    scene.key({ key: 'ArrowDown', code: 'ArrowDown', preventDefault() {} });
  }
});
await settle(150);
const state = await page.evaluate(() => window.__probe.horizon());
const out = await frame();
check(!!state?.ready, 'the tape loads');
// The void clear alone measures about 7.3 (HORIZON_VOID at 8-bit). Anything at
// that value is the empty backdrop, not the recording.
check(out.luma > 20, `the tape actually draws rather than leaving the void clear (luma ${out.luma.toFixed(1)})`);
check(out.max > 60, `and it has real range in it (max ${out.max})`);
check(!glErrors.some((e) => /missing fragment shader outputs/i.test(e)),
  'no draw is rejected for missing fragment shader outputs');

// THE CANVAS HAS TO MOVE WHEN THE HEAD DOES.
//
// Brightness alone cannot see a frozen screen — the first version of this test
// passed against a canvas that had been showing one stale frame for four
// hundred frames, because that stale frame was a picture and pictures are
// bright. Turning the body has to produce a different image; three views that
// hash the same are a still, whatever their luma says.
// THE TAIL HAS TO GO OUT.
//
// The last 12% of the tape is authored as a collapse and the renderer has always
// supported it — it dims the void by `1 - collapse*0.85` and fades every splat
// by `1 - collapse*0.92`. But `horizonFrame()` returned `collapsing` (a boolean)
// where `r3dSetHorizon` reads `collapse` (a 0..1), so it was pinned at zero and
// the score faded out over a picture that never changed. Brightness at the head
// against brightness at the tail is the assertion that catches that.
const atStopRaw = async (row) => {
  await page.evaluate((want) => {
    window.__probe.godMenu('source-space');
    const scene = window.__scenes.top();
    for (let i = 0; i < 80; i += 1) {
      if (scene.view?.()?.row === want) { scene.key({ key: 'Enter', code: 'Enter', preventDefault() {} }); return; }
      scene.key({ key: 'ArrowDown', code: 'ArrowDown', preventDefault() {} });
    }
  }, row);
  await settle(20);
  await page.evaluate(() => window.__probe.closeGodMenu?.());
  await settle(40);
};

const atStop = async (row) => {
  await page.evaluate((want) => {
    window.__probe.godMenu('source-space');
    const scene = window.__scenes.top();
    for (let i = 0; i < 80; i += 1) {
      if (scene.view?.()?.row === want) { scene.key({ key: 'Enter', code: 'Enter', preventDefault() {} }); return; }
      scene.key({ key: 'ArrowDown', code: 'ArrowDown', preventDefault() {} });
    }
  }, row);
  await settle(20);
  await page.evaluate(() => window.__probe.closeGodMenu?.());
  await settle(60);
  return { ...(await frame()), state: await page.evaluate(() => window.__probe.horizon()) };
};

// THE TAPE IS WALKED, NOT SPRINTED.
//
// The crossing used to take ~23 seconds against a 259-second score, so the
// recording played at eleven times speed and nobody ever heard it. The pace
// multiplier that fixes it was silently clipped by the default move-interval
// clamp the first time it was set, which is why this asserts the MEASURED
// interval rather than the constant.
await atStopRaw('horizon-head');
const tapeStep = await page.evaluate(() => window.__probe.moveInterval());
const crossingSec = (512 - 6) * tapeStep / 1000;
check(tapeStep > indoorStep * 3,
  `the tape is walked, not sprinted (${indoorStep}ms indoors -> ${tapeStep}ms out here)`);
check(crossingSec > 100 && crossingSec < 200,
  `and the crossing lands near the score's own length (${crossingSec.toFixed(0)}s against 259s)`);

const head = await atStop('horizon-head');
const tail = await atStop('horizon-tail');
check(head.state.collapse === 0, `the head of the tape is not collapsing (${head.state.collapse})`);
check(tail.state.collapse > 0.2, `the tail is collapsing (${tail.state.collapse.toFixed(2)})`);
check(tail.luma < head.luma * 0.75,
  `and the picture actually goes out with it (${head.luma.toFixed(1)} -> ${tail.luma.toFixed(1)})`);

await atStop('horizon-head');

const shot = async (deg) => {
  await page.evaluate((d) => window.__probe.look(d * Math.PI / 180, 0), deg);
  await settle(30);
  return createHash('md5').update(await page.screenshot()).digest('hex');
};
const views = [await shot(0), await shot(90), await shot(180)];
check(new Set(views).size === 3,
  `the view is live: three headings give three images (${new Set(views).size}/3 distinct)`);

// THE PROJECTOR IS RUNNING.
//
// The horizon presents through a pass of its own — halation, gate weave,
// emulsion grain, edge burn, dither — rather than the plain texture copy it
// used to use. The first version of that pass referenced grain helpers that
// lived inside POST_FRAG rather than in shared GLSL, so it failed to compile;
// a failed program leaves the previously bound one in place, and the horizon
// went on presenting through the copy and looked exactly as it had. Nothing
// said so. Measuring the edge burn is what says so.
const burn = async (params) => {
  await page.evaluate((p) => window.__probe.horizonProjection(p), params);
  await settle(25);
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const o = document.createElement('canvas'); o.width = 96; o.height = 60;
    const cx = o.getContext('2d'); cx.drawImage(c, 0, 0, 96, 60);
    const d = cx.getImageData(0, 0, 96, 60).data;
    const at = (x, y) => { const i = (y * 96 + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
    let centre = 0, corner = 0;
    for (let y = 25; y < 35; y += 1) for (let x = 43; x < 53; x += 1) centre += at(x, y);
    for (let y = 0; y < 6; y += 1) for (let x = 0; x < 6; x += 1) corner += at(x, y);
    return { centre: centre / 100, corner: corner / 36 };
  });
};
const flat = await burn({ halation: 0, weave: 0, grain: 0, burn: 0 });
const lit = await burn({ halation: 0.34, weave: 0.9, grain: 0.055, burn: 0.30 });
check(lit.corner / lit.centre < flat.corner / flat.centre - 0.1,
  `the projection pass reaches the screen (edge falloff ${(flat.corner / flat.centre).toFixed(2)} -> ${(lit.corner / lit.centre).toFixed(2)})`);

// THE ONE THING OUT THERE HAS A BODY.
//
// The bust is the only authored beat in the whole crossing and he had no
// representation of any kind — the prop pass never runs past the perimeter, so
// he was an [F] prompt in a void thirteen metres off the walking line. He is
// built as splats in the tape's own space now, out of the same material as
// everything else out there.
//
// Placed straight ahead for the measurement, because whether he is VISIBLE is
// the question, not whether he happens to be in shot from a fixed stop.
await atStopRaw('horizon-bust');
// Facing matters: the heading sweep above leaves the head turned, and "ahead"
// is measured down the tape.
await page.evaluate(() => window.__probe.look(0, 0));
await settle(30);
const here = await page.evaluate(() => window.__probe.horizon());
const ahead = here.slice * here.tape.sliceMetres + 24;
// Diffed rather than sampled at a fixed spot: where exactly he lands depends on
// the heading, and the question is only whether he puts anything on the screen.
const grab = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const o = document.createElement('canvas'); o.width = 96; o.height = 60;
  const cx = o.getContext('2d'); cx.drawImage(c, 0, 0, 96, 60);
  const d = cx.getImageData(0, 0, 96, 60).data;
  const out = [];
  for (let i = 0; i < d.length; i += 4) out.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  return out;
});
await page.evaluate((d) => window.__probe.horizonBust({ lateral: 0, depth: d }), ahead);
await settle(30);
const withBust = await grab();
await page.evaluate(() => window.__probe.horizonBust({ depth: 99999 }));
await settle(30);
const withoutBust = await grab();
let peak = 0, moved = 0;
for (let i = 0; i < withBust.length; i += 1) {
  const delta = Math.abs(withBust[i] - withoutBust[i]);
  if (delta > peak) peak = delta;
  if (delta > 12) moved += 1;
}
check(peak > 40 && moved > 20,
  `the bust has a body you can see (peak change ${peak.toFixed(0)}, ${moved} cells moved)`);

await page.evaluate(() => { window.__probe.closeGodMenu(); window.__probe.godWarpBay(); });
await settle(90); const back = await frame();
check(back.frames > out.frames, `the renderer is still running after the horizon (frames ${out.frames} -> ${back.frames})`);
check(Math.abs(back.luma - bay.luma) < 12,
  `and the loading bay comes back the way it went (luma ${bay.luma.toFixed(1)} -> ${back.luma.toFixed(1)})`);

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nhorizon ok');
process.exit(failures.length ? 1 : 0);
