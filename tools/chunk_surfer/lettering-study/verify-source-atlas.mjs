import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../../../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../../../src/game/source-space-runtime.js';

const root = resolve('.'), out = 'artifacts/lettering-study/evidence'; mkdirSync(out, { recursive: true });
const preset = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, { seed: 4417 });
const runtime = createSourceSpaceRuntime({ initialState: preset.state }); runtime.setPlayerPosition(preset.position);
const corpus = [...new Set(runtime.sourceScene({ px: preset.position.x, py: preset.position.y, time: 0 }).corpus)];
const files = ['src/render/source-text-atlas.js', 'src/render/source-surface-lettering.js', 'src/render/world-lettering-fonts.js', 'src/render/world-lettering-layout.js', 'src/render/source-desktop-view.js'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const before = Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://test.local');
  if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Source atlas Canvas validation</title>'); return; }
  const relative = decodeURIComponent(url.pathname).slice(1);
  const file = resolve(root, relative.startsWith('assets/fonts/') ? `public/${relative}` : relative);
  if (!file.startsWith(root + '/') || !/^(src\/|content\/|assets\/fonts\/)/.test(relative)) { response.writeHead(404); response.end(); return; }
  try { const bytes = readFileSync(file); response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.otf': 'font/otf' })[extname(file)] || 'application/octet-stream'); response.end(bytes); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', timeout: 45000,
    args: ['--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async (corpus,surfaceLines) => {
    const Fonts = await import('/src/render/world-lettering-fonts.js');
    const Atlas = await import('/src/render/source-text-atlas.js');
    const Desktop = await import('/src/render/source-desktop-view.js');
    const Surface = await import('/src/render/source-surface-lettering.js');
    const loaded = await Fonts.ensureWorldLetteringFonts();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    const variants = [{ text: '  return ███████; // authored omission', interactiveId: 'validation-interactive' }, { text: '[PRE-ROLL OMITTED]' }];
    const start = performance.now(), plan = Atlas.planSourceTextAtlas(ctx, { corpus, instances: variants });
    const planningMs = performance.now() - start; Atlas.paintSourceTextAtlas(ctx, plan);
    const details = [], clipped = [], overlaps = [];
    const entries = [...plan.entries.values()];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      for (let j = i + 1; j < entries.length; j++) {
        const other = entries[j];
        if (!(entry.x + entry.width <= other.x || other.x + other.width <= entry.x || entry.y + entry.height <= other.y || other.y + other.height <= entry.y)) overlaps.push([entry.text, other.text]);
      }
      // Independent unbounded reference raster. Test actual alpha outside the
      // sampled content rectangle,not merely our own layout arithmetic.
      const probe = document.createElement('canvas'); probe.width = entry.contentWidth + 32; probe.height = entry.contentHeight + 32;
      const c = probe.getContext('2d'); c.font = plan.font; c.fontKerning = 'none'; c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
      entry.lines.forEach((line, row) => c.fillText(line.text, 16 + entry.inkInset + line.left, 16 + entry.inkInset + entry.ascent + row * entry.lineHeight));
      const bytes = c.getImageData(0, 0, probe.width, probe.height).data;
      let outside = 0, ink = 0;
      for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) {
        if (!bytes[(y * probe.width + x) * 4 + 3]) continue;
        ink++;
        if (x < 16 || x >= 16 + entry.contentWidth || y < 16 || y >= 16 + entry.contentHeight) outside++;
      }
      if (outside) clipped.push({ text: entry.text, outside });
      const matrix = new Float32Array([8.2, 0, 0, 0, 0, .52, 0, 0, 0, 0, 1, 0, 3, 5, 7, 1]);
      const fitted = Atlas.sourceTextQuadMatrix(matrix, entry);
      details.push({ text: entry.text, fontSize: entry.fontSize, contentWidth: entry.contentWidth, contentHeight: entry.contentHeight,
        aspect: entry.aspect, inkPixels: ink, outsidePixels: outside, physicalWidth: Math.hypot(...fitted.slice(0, 3)), physicalHeight: Math.hypot(...fitted.slice(4, 7)) });
    }
    const desktop = document.createElement('canvas'); desktop.width = 1024; desktop.height = 512;
    const desktopRows = Desktop.paintSourceDesktopGlyphCanvas(desktop.getContext('2d'));
    const colour=document.createElement('canvas'),mask=document.createElement('canvas');
    colour.width=mask.width=2048;colour.height=mask.height=2048;
    const c=colour.getContext('2d',{alpha:false,willReadFrequently:true}),m=mask.getContext('2d',{willReadFrequently:true});
    const surfaceRows=Surface.paintSourceSurfaceLettering(c,m,surfaceLines);
    const originalRGB=c.getImageData(0,0,2048,2048).data,originalMask=m.getImageData(0,0,2048,2048).data;
    const surface=Surface.sourceSurfaceLetteringPixels(surfaceLines),flipped=Surface.sourceSurfaceLetteringPixels(surfaceLines,{flipY:true});
    let rgbMismatches=0,maskMismatches=0,flipMismatches=0,inkPixels=0,partialInkPixels=0;
    for(let i=0;i<originalRGB.length;i++){
      if(i%4===3){if(surface.pixels[i]!==originalMask[i])maskMismatches++;if(originalMask[i])inkPixels++;if(originalMask[i]>0&&originalMask[i]<255)partialInkPixels++;}
      else if(surface.pixels[i]!==originalRGB[i])rgbMismatches++;
      const row=Math.floor(i/(2048*4)),column=i%(2048*4),other=(2047-row)*2048*4+column;
      if(flipped.pixels[i]!==surface.pixels[other])flipMismatches++;
    }
    const surfaceClipped=[];
    for(const row of surfaceRows){
      const probe=document.createElement('canvas'),w=Math.ceil(row.width)+2,h=Math.ceil(row.ascent+row.descent)+2;
      probe.width=w+32;probe.height=h+32;const p=probe.getContext('2d');
      p.font=row.font;p.fontKerning='none';p.textBaseline='alphabetic';p.fillStyle='#fff';p.fillText(row.text,17+row.left,17+row.ascent);
      const bytes=p.getImageData(0,0,probe.width,probe.height).data;let outside=0;
      for(let y=0;y<probe.height;y++)for(let x=0;x<probe.width;x++)if(bytes[(y*probe.width+x)*4+3]&&(x<16||x>=16+w||y<16||y>=16+h))outside++;
      if(outside)surfaceClipped.push({layer:row.layer,row:row.row,text:row.text,outside});
    }
    const samples = [entries.toSorted((a, b) => b.contentWidth - a.contentWidth)[0], entries.find(e => e.text.includes('███████')), entries.find(e => e.text === '[PRE-ROLL OMITTED]')].map(entry => {
      const c = document.createElement('canvas'); c.width = entry.width; c.height = entry.height;
      c.getContext('2d').drawImage(canvas, entry.x, entry.y, entry.width, entry.height, 0, 0, entry.width, entry.height);
      return { text: entry.text, width: c.width, height: c.height, url: c.toDataURL() };
    });
    return { entries: corpus.length, requested: plan.requested, accepted: plan.accepted, omitted: plan.omitted,
      font: plan.font, fontSize: plan.fontSize, size: plan.size, bytes: plan.bytes, gpuBytesWithMipmaps: plan.gpuBytesWithMipmaps, mipLevelCount: plan.mipLevelCount, occupancy: plan.occupancy,
      cacheKey: plan.cacheKey, fontKey: plan.fontKey, planningMs, overlaps, clipped, details,
      loadedFonts: loaded.faces.map(face => ({ role: face.role, family: face.family, ready: document.fonts.check(Fonts.worldLetteringFont(12, face.role)) })),
      desktopRows, surface:{inputLines:surfaceLines.length,rows:surfaceRows,rgbMismatches,maskMismatches,flipMismatches,inkPixels,partialInkPixels,clipped:surfaceClipped,
        rowOrigin:surface.rowOrigin,flippedRowOrigin:flipped.rowOrigin,key:surface.key},
      atlasPng: canvas.toDataURL(), desktopPng: desktop.toDataURL(), surfaceColourPng:colour.toDataURL(),surfaceMaskPng:mask.toDataURL(),samples };
  }, corpus,runtime.sourceSurfaceLines());
  assert.equal(result.entries, 642); assert.equal(result.accepted, result.requested);
  assert.deepEqual(result.omitted, []); assert.deepEqual(result.overlaps, []); assert.deepEqual(result.clipped, []);
  assert.ok(result.loadedFonts.every(face => face.ready)); assert.deepEqual(errors, []);
  assert.equal(result.surface.inputLines,96);assert.equal(result.surface.rows.length,88);
  assert.equal(result.surface.rgbMismatches,0);assert.equal(result.surface.maskMismatches,0);assert.equal(result.surface.flipMismatches,0);
  assert.ok(result.surface.inkPixels>0&&result.surface.partialInkPixels>0,'separate glyph mask retains real antialiasing');
  assert.deepEqual(result.surface.clipped,[]);
  for(const row of result.surface.rows){assert.equal(row.fits,true);assert.ok(row.fontSize<=20);assert.ok(row.bottom<=row.y+22);}
  for (const item of result.details) {
    assert.ok(item.physicalWidth <= 8.2 + 1e-5 && item.physicalHeight <= .52 + 1e-5);
    assert.ok(Math.abs(item.physicalWidth / item.physicalHeight - item.aspect) < 1e-4);
  }
  for (const row of result.desktopRows) {
    assert.equal(row.fits, true); assert.ok(row.x + row.left + row.width <= 1024 + 1e-5);
    assert.ok(row.top + row.ascent + row.descent <= 512);
  }
  writeFileSync(`${out}/source-atlas-lossless.png`, Buffer.from(result.atlasPng.split(',')[1], 'base64')); delete result.atlasPng;
  writeFileSync(`${out}/source-desktop-pinned.png`, Buffer.from(result.desktopPng.split(',')[1], 'base64')); delete result.desktopPng;
  writeFileSync(`${out}/source-surface-pinned-colour.png`,Buffer.from(result.surfaceColourPng.split(',')[1],'base64'));delete result.surfaceColourPng;
  writeFileSync(`${out}/source-surface-pinned-mask.png`,Buffer.from(result.surfaceMaskPng.split(',')[1],'base64'));delete result.surfaceMaskPng;
  for (const [i, sample] of result.samples.entries()) { sample.path = `${out}/source-atlas-lossless-sample-${i + 1}.png`; writeFileSync(sample.path, Buffer.from(sample.url.split(',')[1], 'base64')); delete sample.url; }
  const after = Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
  assert.deepEqual(after, before, 'no concurrent source changes contaminate the measurement');
  const report = { date: new Date().toISOString(), browser: await browser.version(), corpusSha256: sha(JSON.stringify(corpus)), sourceHashes: before,
    scope: 'Real pinned-font Canvas raster,full current base corpus plus live variant fixtures. No game renderer booted; world final-shader acceptance remains separate.', errors, ...result };
  writeFileSync(`${out}/source-atlas-lossless.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ entries: result.entries, requested: result.requested, accepted: result.accepted, font: result.font, size: result.size, occupancy: result.occupancy, clipped: result.clipped.length, overlaps: result.overlaps.length, planningMs: result.planningMs, desktopRows: result.desktopRows.length,
    surfaceRows:result.surface.rows.length,surfaceRgbMismatches:result.surface.rgbMismatches,surfaceMaskMismatches:result.surface.maskMismatches,surfaceClipped:result.surface.clipped.length }));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
