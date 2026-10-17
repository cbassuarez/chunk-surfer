// Diagnostic only. Build the current FIRST_CONTACT corpus in Node, then measure
// the existing Canvas atlas cell on about:blank. No game renderer or server.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../../../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../../../src/game/source-space-runtime.js';

const output = 'artifacts/lettering-study/evidence';
mkdirSync(output, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const preset = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, { seed: 4417 });
const runtime = createSourceSpaceRuntime({ initialState: preset.state });
runtime.setPlayerPosition(preset.position);
const corpus = [...new Set(runtime.sourceScene({ px: preset.position.x, py: preset.position.y, time: 0 }).corpus)].filter(Boolean);
const sourceFiles = ['src/render/props3d.js', 'src/game/chunk-surf-god.js', 'src/game/source-space-runtime.js', 'content/chunk-surf/source-atlas.json'];
const before = Object.fromEntries(sourceFiles.map(path => [path, sha(readFileSync(path))]));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', timeout: 45000, protocolTimeout: 60000,
  args: ['--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking'],
});
try {
  const page = await browser.newPage();
  const measured = await page.evaluate(corpus => {
    const ctx = document.createElement('canvas').getContext('2d');
    const cellW = 192, cellH = 28, fitBudget = cellW - 8;
    const clip = { x: 1, y: 1, width: cellW - 2, height: cellH - 2 };
    const origin = { x: 4, y: cellH / 2 };
    ctx.textBaseline = 'middle';
    const fits = corpus.map((text, index) => {
      // Exact existing fitting loop. The 184px advance budget is not the
      // clipping boundary: from the draw origin, the right boundary is 187px.
      let font = 14; ctx.font = `${font}px monospace`;
      while (font > 6 && ctx.measureText(text).width > fitBudget) {
        font -= 1; ctx.font = `${font}px monospace`;
      }
      const m = ctx.measureText(text);
      const probe = document.createElement('canvas');
      probe.width = Math.ceil(Math.max(cellW, origin.x + m.width, origin.x + m.actualBoundingBoxRight)) + 4;
      probe.height = cellH;
      const pc = probe.getContext('2d'); pc.textBaseline = 'middle'; pc.font = ctx.font;
      pc.fillStyle = '#fff'; pc.fillText(text, origin.x, origin.y);
      const pixels = pc.getImageData(0, 0, probe.width, cellH).data;
      let cutRightPixels = 0, cutLeftPixels = 0, cutVerticalPixels = 0;
      for (let y = 0; y < cellH; y++) for (let x = 0; x < probe.width; x++) {
        if (!pixels[(y * probe.width + x) * 4 + 3]) continue;
        if (y < clip.y || y >= clip.y + clip.height) cutVerticalPixels++;
        else if (x < clip.x) cutLeftPixels++;
        else if (x >= clip.x + clip.width) cutRightPixels++;
      }
      return {
        index, text, codePoints: [...text].length, font, width: m.width,
        actualBoundingBoxLeft: m.actualBoundingBoxLeft,
        actualBoundingBoxRight: m.actualBoundingBoxRight,
        actualBoundingBoxAscent: m.actualBoundingBoxAscent,
        actualBoundingBoxDescent: m.actualBoundingBoxDescent,
        widthBudgetOverflow: m.width > fitBudget,
        inkExceedsRightClip: m.actualBoundingBoxRight > clip.x + clip.width - origin.x,
        cutRightPixels, cutLeftPixels, cutVerticalPixels,
        actualInkClipped: !!(cutRightPixels || cutLeftPixels || cutVerticalPixels),
      };
    });
    const descending = fits.toSorted((a, b) => b.actualBoundingBoxRight - a.actualBoundingBoxRight);
    const budgetOnly = descending.find(f => f.widthBudgetOverflow && !f.actualInkClipped);
    const nearEdge = descending.find(f => !f.actualInkClipped && !f.widthBudgetOverflow);
    const ordinary = fits.find(f => f.font >= 10 && f.text.trim().length >= 12 && f.width > 70 && f.width < 170) || fits[0];
    const candidates = [
      ['widest-ink', descending[0]],
      [budgetOnly ? 'budget-overflow-only' : 'second-clipped', budgetOnly || descending[1]],
      ['closest-unclipped', nearEdge],
      ['ordinary-line', ordinary],
    ];
    const samples = candidates.map(([id, row]) => {
      const canvas = document.createElement('canvas'); canvas.width = cellW; canvas.height = cellH;
      const c = canvas.getContext('2d'); c.clearRect(0, 0, cellW, cellH);
      c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.save(); c.beginPath();
      c.rect(clip.x, clip.y, clip.width, clip.height); c.clip(); c.font = `${row.font}px monospace`;
      c.fillText(row.text, origin.x, origin.y); c.restore();
      return { id, index: row.index, text: row.text, font: row.font, width: row.width,
        actualBoundingBoxRight: row.actualBoundingBoxRight, actualInkClipped: row.actualInkClipped,
        url: canvas.toDataURL('image/png') };
    });
    return { fits, samples, cellW, cellH, fitBudget, clip, origin,
      canvasState: { fontFamily: 'monospace', textBaseline: ctx.textBaseline, textAlign: ctx.textAlign, direction: ctx.direction, fontKerning: ctx.fontKerning },
      userAgent: navigator.userAgent, platform: navigator.platform };
  }, corpus);
  const { fits, samples } = measured;
  for (const sample of samples) {
    sample.path = `${output}/atlas-cell-${sample.id}.png`;
    writeFileSync(sample.path, Buffer.from(sample.url.split(',')[1], 'base64'));
    delete sample.url;
    sample.entrySha256 = sha(sample.text);
  }
  for (const fit of fits) fit.entrySha256 = sha(fit.text);
  const after = Object.fromEntries(sourceFiles.map(path => [path, sha(readFileSync(path))]));
  const report = {
    date: new Date().toISOString(), preset: 'FIRST_CONTACT', seed: 4417, entries: corpus.length,
    corpusSha256: sha(JSON.stringify(corpus)), sourceHashesBefore: before, sourceHashesAfter: after,
    sourcesUnchanged: JSON.stringify(before) === JSON.stringify(after), browserVersion: await browser.version(),
    method: 'Exact current ensureTextAtlas fitting loop, clip rectangle and draw origin. Width-budget overflow, ink bounding-box overflow and raster pixels actually removed by the clip are reported separately.',
    fontFallbackLimitation: 'Production uses unpinned browser generic monospace. Results are exact for this browser and OS font fallback; another system may choose a different face. No game, renderer, Vite or final shader was booted.',
    interpretation: 'Corpus includes background source fragments, not solely required instructions. Counts do not establish which visible or required gameplay lines are unreadable; projection, placement, narrative intent and human reading are separate questions.',
    counts: {
      widthBudgetOverflow: fits.filter(f => f.widthBudgetOverflow).length,
      inkExceedsRightClip: fits.filter(f => f.inkExceedsRightClip).length,
      actualInkClipped: fits.filter(f => f.actualInkClipped).length,
      actualRightClip: fits.filter(f => f.cutRightPixels).length,
      actualLeftClip: fits.filter(f => f.cutLeftPixels).length,
      actualVerticalClip: fits.filter(f => f.cutVerticalPixels).length,
      budgetOverflowWithoutInkClip: fits.filter(f => f.widthBudgetOverflow && !f.actualInkClipped).length,
    },
    fontHistogram: Object.fromEntries([...new Set(fits.map(f => f.font))].sort((a, b) => a - b).map(n => [n, fits.filter(f => f.font === n).length])),
    fitting: { cellWidth: measured.cellW, cellHeight: measured.cellH, minimumFont: 6, initialFont: 14,
      widthBudget: measured.fitBudget, clip: measured.clip, drawOrigin: measured.origin,
      rightInkLimitFromDrawOrigin: measured.clip.x + measured.clip.width - measured.origin.x,
      canvasState: measured.canvasState },
    environment: { userAgent: measured.userAgent, platform: measured.platform }, samples, fits,
  };
  writeFileSync(`${output}/atlas-fit-exact.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ entries: report.entries, counts: report.counts, corpusSha256: report.corpusSha256, sourcesUnchanged: report.sourcesUnchanged, samples: samples.map(s => ({ id: s.id, font: s.font, width: s.width, inkRight: s.actualBoundingBoxRight, clipped: s.actualInkClipped })) }));
} finally { await browser.close(); }
