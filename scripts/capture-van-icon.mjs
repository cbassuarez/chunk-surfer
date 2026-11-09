// Capture the app icon from the real renderer: the parked van in the opening
// walk, shot through the game's own R3 + pixel-mesh look in headless Chrome.
// Run with Vite up (scripts/run-icon-capture spawns it); CHUNK_SURFER_URL and
// CHROME_PATH override like tools/chunk_surfer/tests/look-captures.mjs.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets/brand/app-icon-van-render.png');
const BASE = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5173';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    // The game is the only page loaded; the capture runs on machines
    // where Chrome's own sandbox cannot start (containerised hosts).
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,PaintHolding,BackForwardCache',
    '--window-size=1024,1024',
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
  ],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.error('page error:', error.message));
page.on('console', (message) => { if (message.type() === 'error') console.error('console error:', message.text()); });
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
await page.goto(`${BASE}/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0&nodisplaynotice=1&skipwarn=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });

await page.waitForFunction(() => window.__probe && window.__chunkSurferPixelMesh, { timeout: 60000 });
// Headless pages report no focus; the game's input lifecycle reads
// document.hasFocus(), so tell it the truth it needs for the walk to play.
await page.evaluate(() => { document.hasFocus = () => true; });
// Dismiss any first-boot advisory before staging the arrival. The game's
// scene stack routes keys itself, which works even when headless Chrome
// cannot deliver a focused keydown.
for (let i = 0; i < 6; i++) {
  const top = await page.evaluate(() => window.__scenes?.top?.()?.id || null);
  if (top !== 'display-notice' && top !== 'headphone-notice') break;
  await page.evaluate(() => window.__scenes.key({ key: 'Enter' }));
  await new Promise((r) => setTimeout(r, 1200));
}
const afterNotices = await page.evaluate(() => window.__scenes?.top?.()?.id || null);
console.log('top scene after notice dismissal', afterNotices);

// Plain boot: the opening walk spawns the recordist on the street facing the
// parked van. Give the world time to settle, aim at the van, and shoot. No
// staging, no exits.
for (let t = 0; t < 120; t += 5) {
  const top = await page.evaluate(() => window.__scenes?.top?.()?.id || null);
  if (top && !['display-notice', 'headphone-notice', 'opening-credits', 'lens-calibration', 'title'].includes(top)) break;
  await new Promise((r) => setTimeout(r, 5000));
}
await new Promise((r) => setTimeout(r, 5000));
await new Promise((r) => setTimeout(r, 1200));
// Step out through the scene stack itself (headless focus is unreliable),
// let the overture settle on the street (its final shot waits for a fresh
// input with free look on), then turn to face the van and shoot.
// The exit prompt appears only while the head is aimed at the door, so
// sweep the cabin arc for the door focus, then open it.
await page.evaluate(() => {
  const s = window.__scenes.top();
  s?.resume?.();
  s?.lookBy?.(-2.4, 0);
  for (let i = 0; i < 17; i++) {
    const f = s?.view?.()?.focus;
    if (f?.type === 'exit') { window.__scenes.key({ key: 'e' }); return 'exit'; }
    s?.lookBy?.(0.3, 0);
  }
  return null;
});
console.log('boot walk settled; shooting the spawn view (the recordist faces the van)');

const diag = await page.evaluate(() => ({
  scene: window.__scenes?.top?.()?.id || null,
  pos: window.__probe.pos?.() || null,
  vehicle: window.__probe.openingArrival().vehicle?.phase || null,
  look: window.__chunkSurferPixelMesh.lookStatus?.()?.id || null,
}));
console.log('diagnostics', JSON.stringify(diag));

// The game's own look for the shot.
await page.evaluate(() => window.__chunkSurferPixelMesh.setProfile('explore'));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT });
console.log('captured', OUT);
await browser.close();