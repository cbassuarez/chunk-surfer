import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

// Real Canvas2D regression: a readout must not acquire pixels from a title or
// meter rendered earlier. Run with GAME_URL pointing to the development server.
const base = process.env.GAME_URL || 'http://127.0.0.1:5203';
const out = 'artifacts/vfd-glow';
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--use-angle=metal'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 550, deviceScaleFactor: 1 });
  await page.goto(`${base}/src/render/vfd-font.js`);
  await page.setContent('<body style="margin:28px;background:#0c1710;color:#ded9aa;font:16px monospace"><h2>Readouts after mixed-size text</h2></body>');
  const report = await page.evaluate(async () => {
    const reused = await import('/src/render/vfd-font.js?glow-qa=reused');
    function glyph(api, ch, w, h, options = {}) {
      const c = document.createElement('canvas');
      const pad = Math.ceil(Math.max(w, h) * 2.5);
      c.width = Math.ceil(w + pad * 2); c.height = Math.ceil(h + pad * 2);
      api.drawVfdGlyph(c.getContext('2d'), ch, pad, pad, w, h, options);
      return c;
    }
    const checks = [];
    for (const dpr of [1, 2, 3]) {
      for (const width of [8.45, 13, 22]) {
        for (const color of ['#f2a81e', '#94d995']) {
          // Exercise both scratch surfaces, growth, and shrinking mip levels.
          for (const size of [60, 45, 100, 16.9, 33, 50]) {
            for (const ch of 'RECORDER+8') glyph(reused, ch, size, size * 1.42, { color: '#ffffff', dpr });
          }
          const fresh = await import(`/src/render/vfd-font.js?glow-qa=fresh-${checks.length}`);
          const options = { color, dim: '#352807', dpr, blur: 3.2 };
          const a = glyph(fresh, 'E', width * dpr, width * 1.42 * dpr, options);
          const b = glyph(reused, 'E', width * dpr, width * 1.42 * dpr, options);
          const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          const ad = pixels(a), bd = pixels(b);
          let changedAlphaPixels = 0, maxColorDifference = 0;
          for (let i = 0; i < ad.length; i += 4) {
            if (ad[i + 3] !== bd[i + 3]) changedAlphaPixels++;
            for (let channel = 0; channel < 3; channel++) {
              const difference = Math.abs(ad[i + channel] * ad[i + 3] - bd[i + channel] * bd[i + 3]) / 255;
              maxColorDifference = Math.max(maxColorDifference, difference);
            }
          }
          checks.push({ dpr, width, color, changedAlphaPixels, maxColorDifference });
        }
      }
    }
    for (const [dpr, width] of [[1, 8.45], [2, 8.45], [2, 13]]) {
      const label = document.createElement('p'); label.textContent = `Glyph width ${width} · DPR ${dpr}`;
      const c = document.createElement('canvas'); c.width = 1020; c.height = 100;
      document.body.append(label, c);
      const text = 'FUNCTION · CAPTURE / MONITOR';
      for (let i = 0; i < text.length; i++) reused.drawVfdGlyph(c.getContext('2d'), text[i], 20 + i * width * dpr, 30,
        width * dpr, width * 1.42 * dpr, { color: '#f2a81e', dim: '#352807', dpr });
    }
    return { checks };
  });
  await page.screenshot({ path: `${out}/readouts.png`, fullPage: true });
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  for (const check of report.checks) {
    assert.equal(check.changedAlphaPixels, 0,
      `Reused glow changes the glyph's footprint: ${JSON.stringify(check)}`);
    // Different backing sizes can round interpolated colour by a byte. Compare
    // premultiplied colour, while requiring the opacity footprint to be exact.
    assert.ok(check.maxColorDifference <= 2,
      `Reused glow changes the glyph's colour: ${JSON.stringify(check)}`);
  }
  console.log(`PASS ${report.checks.length} pixel comparisons across text sizes, colours and DPR 1–3`);
} finally {
  await browser.close();
}
