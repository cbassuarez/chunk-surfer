// THE GLYPHS THAT WERE NOT THERE.
//
// Fifty-three characters were being drawn with no glyph behind them, so they
// rendered as nothing at all: right cell, right colour, no pixels. A unit test
// proves the ROM has them now (test/vfd-glyph-coverage.spec.mjs). This proves
// they reach the screen, by photographing the same surface twice — once with
// the ROM as it is, once with the additions reverted — and diffing.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-glyphs.mjs out.png
import puppeteer from 'puppeteer-core';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:5198';
const PORT = Number(process.env.PORT) || 5199;
const OUT = process.argv[2] || 'artifacts/vfd-rom.png';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/index.html?nomic=1&sam=0&diffusion=${encodeURIComponent(LENS)}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__scenes?.top?.()?.id === 'eula', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1400));
await page.screenshot({ path: OUT });
console.log(`${OUT}`);
await browser.close();
