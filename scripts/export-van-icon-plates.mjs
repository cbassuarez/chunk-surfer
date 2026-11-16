// Plate options study. Renders each option through the approved renderer and
// game acquisition (via tools/app-icon/plates.mjs) and never writes production
// files. Output: artifacts/van-icon-plates/ with a self-contained review page.
import {mkdir, mkdtemp, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import sharp from 'sharp';
import {VAN_ICON_LAUNCH} from '../tools/app-icon/motion.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'artifacts/van-icon-plates');
const profile = await mkdtemp(join(tmpdir(), 'chunk-van-plates-'));
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
// Sizes the Dock actually draws the tile at: 64pt and 128pt (magnified), @1x and @2x.
const HANDOFF_SIZES = [128, 256, 512];
const {frameCount, cell, columns, rows, durationSeconds: duration} = VAN_ICON_LAUNCH;
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const chrome = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const png = value => Buffer.from(value.split(',')[1], 'base64');

async function handoffDiff(atlasCell, still, size) {
  // NSImageInterpolationHigh is approximated by Lanczos. Straight alpha in, compare premultiplied.
  const resampled = size === cell ? atlasCell : await sharp(atlasCell).resize(size, size, {kernel: 'lanczos3'}).png().toBuffer();
  const [a, b] = await Promise.all([resampled, still].map(buffer => sharp(buffer).ensureAlpha().raw().toBuffer()));
  const diff = Buffer.alloc(size * size * 4);
  let sum = 0, changed = 0;
  for (let i = 0; i < size * size; i++) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(a[i*4+c]*a[i*4+3] - b[i*4+c]*b[i*4+3]) / 255);
    delta = Math.max(delta, Math.abs(a[i*4+3] - b[i*4+3]));
    sum += delta; if (delta > 24) changed++;
    const v = Math.min(255, delta * 3);
    diff[i*4] = v; diff[i*4+1] = v * .35; diff[i*4+2] = 0; diff[i*4+3] = 255;
  }
  return {
    size, meanDelta: +(sum / (size * size) / 255).toFixed(4), changedPixels: +(changed / (size * size)).toFixed(4),
    png: await sharp(diff, {raw: {width: size, height: size, channels: 4}}).png().toBuffer(),
  };
}

let browser, server;
try {
  server = await createServer({root, configFile: false, cacheDir: join(profile, 'vite-cache'), logLevel: 'error',
    optimizeDeps: {entries: ['tools/app-icon/plate-study.html']}, server: {host: '127.0.0.1', port: 0}});
  await server.listen();
  browser = await puppeteer.launch({executablePath: chrome, headless: true, userDataDir: profile, protocolTimeout: 600000,
    args: ['--mute-audio', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--no-first-run']});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/app-icon/plate-study.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__vanPlateStudy?.ready || window.__vanPlateStudyError, {timeout: 180000});
  const failed = await page.evaluate(() => window.__vanPlateStudyError);
  if (failed) throw Error(failed);
  const {options, approved, body} = await page.evaluate(() => ({options: window.__vanPlateStudy.options, approved: window.__vanPlateStudy.approved, body: window.__vanPlateStudy.body}));
  const names = Object.keys(options).filter(name => !only.length || only.includes(name));
  await mkdir(out, {recursive: true});
  const report = {scope: 'Plate options rendered through the approved renderer and game acquisition. Not native Dock acceptance.',
    approvedCamera: approved, body, launch: {frameCount, cell, columns, rows, duration}, options: {}, errors};

  for (const name of names) {
    const dir = join(out, name); await mkdir(dir, {recursive: true});
    const rendered = await page.evaluate(({name, SIZES, frameCount, cell, columns, rows, duration}) => {
      const study = window.__vanPlateStudy; study.select(name);
      const atlas = document.createElement('canvas'); atlas.width = columns * cell; atlas.height = rows * cell;
      const ctx = atlas.getContext('2d'); ctx.imageSmoothingEnabled = false;
      for (let index = 0; index < frameCount; index++) {
        study.frame(index / (frameCount - 1) * duration, cell);
        ctx.drawImage(document.querySelector('#stage canvas'), index % columns * cell, Math.floor(index / columns) * cell);
      }
      const stills = {};
      for (const size of SIZES) stills[size] = study.frame(duration, size);
      return {atlas: atlas.toDataURL('image/png'), stills, acquisition: study.acquisition()};
    }, {name, SIZES, frameCount, cell, columns, rows, duration});
    const atlas = png(rendered.atlas);
    await writeFile(join(dir, 'launch-atlas.png'), atlas);
    for (const [size, data] of Object.entries(rendered.stills)) await writeFile(join(dir, `icon-${size}.png`), png(data));
    const last = frameCount - 1;
    const lastCell = await sharp(atlas).extract({left: last % columns * cell, top: Math.floor(last / columns) * cell, width: cell, height: cell}).png().toBuffer();
    await writeFile(join(dir, 'handoff-last-frame.png'), lastCell);
    const handoff = [];
    for (const size of HANDOFF_SIZES) {
      const result = await handoffDiff(lastCell, png(rendered.stills[size]), size);
      await writeFile(join(dir, `handoff-diff-${size}.png`), result.png);
      handoff.push({size: result.size, meanDelta: result.meanDelta, changedPixels: result.changedPixels});
    }
    const alpha = await sharp(png(rendered.stills[1024])).extractChannel(3).raw().toBuffer();
    let opaque = 0; for (const v of alpha) if (v > 230) opaque++;
    report.options[name] = {...options[name], handoff, opaqueFraction: +(opaque / alpha.length).toFixed(3),
      shader: rendered.acquisition.provenance.shaderFingerprint};
    console.log(JSON.stringify({option: name, handoff, opaque: report.options[name].opaqueFraction}));
  }

  // The shipped artwork, for side-by-side comparison. Copied, never re-rendered.
  const shipped = join(out, 'shipped'); await mkdir(shipped, {recursive: true});
  await copyFile(join(root, 'src-tauri/macos/DockTile/VanLaunch.png'), join(shipped, 'launch-atlas.png'));
  for (const size of SIZES) await copyFile(join(root, size === 1024 ? 'assets/brand/app-icon-van.png' : `assets/brand/app-icon-van-rasters/${size}.png`), join(shipped, `icon-${size}.png`))
    .catch(async () => sharp(join(root, 'assets/brand/app-icon-van.png')).resize(size, size).png().toFile(join(shipped, `icon-${size}.png`)));
  const shippedAtlas = await readFile(join(shipped, 'launch-atlas.png')), last = frameCount - 1;
  const shippedLast = await sharp(shippedAtlas).extract({left: last % columns * cell, top: Math.floor(last / columns) * cell, width: cell, height: cell}).png().toBuffer();
  await writeFile(join(shipped, 'handoff-last-frame.png'), shippedLast);
  const shippedHandoff = [];
  for (const size of HANDOFF_SIZES) {
    const result = await handoffDiff(shippedLast, await readFile(join(shipped, `icon-${size}.png`)), size);
    await writeFile(join(shipped, `handoff-diff-${size}.png`), result.png);
    shippedHandoff.push({size: result.size, meanDelta: result.meanDelta, changedPixels: result.changedPixels});
  }
  report.options.shipped = {label: 'Shipped today', summary: 'Current production artwork, copied unchanged for comparison.', handoff: shippedHandoff};
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({out, options: Object.keys(report.options)}));
} finally {
  await browser?.close(); await server?.close(); await rm(profile, {recursive: true, force: true});
}
