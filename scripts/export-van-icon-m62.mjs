// M62 road plate, shape study. Renders each shape through the approved renderer
// and game acquisition (tools/app-icon/plates.mjs), once per output size, and
// never writes production files. Output: artifacts/van-icon-m62/.
import {mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import sharp from 'sharp';
import {VAN_ICON_LAUNCH} from '../tools/app-icon/motion.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'artifacts/van-icon-m62');
const profile = await mkdtemp(join(tmpdir(), 'chunk-van-m62-'));
// 184 is Steam's app icon; 20/40 are Windows taskbar sizes at 125%/250%.
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 184, 256, 512, 1024];
const ATLAS = ['m62-squircle'];
const {frameCount, cell, columns, rows, durationSeconds: duration} = VAN_ICON_LAUNCH;
const chrome = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const png = value => Buffer.from(value.split(',')[1], 'base64');

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
  const options = await page.evaluate(() => window.__vanPlateStudy.options);
  const names = Object.keys(options).filter(name => name.startsWith('m62-'));
  await mkdir(out, {recursive: true});
  const report = {scope: 'M62 road plate in five shapes, rendered through the approved renderer and game acquisition. Not native acceptance.',
    sizes: SIZES, launch: {frameCount, cell, columns, rows, duration}, options: {}};
  for (const name of names) {
    const dir = join(out, name); await mkdir(dir, {recursive: true});
    const rendered = await page.evaluate(({name, SIZES, atlasWanted, frameCount, cell, columns, rows, duration}) => {
      const study = window.__vanPlateStudy; study.select(name);
      let atlasData = null;
      if (atlasWanted) {
        const atlas = document.createElement('canvas'); atlas.width = columns * cell; atlas.height = rows * cell;
        const ctx = atlas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        for (let index = 0; index < frameCount; index++) {
          study.frame(index / (frameCount - 1) * duration, cell);
          ctx.drawImage(document.querySelector('#stage canvas'), index % columns * cell, Math.floor(index / columns) * cell);
        }
        atlasData = atlas.toDataURL('image/png');
      }
      const stills = {};
      for (const size of SIZES) stills[size] = study.frame(duration, size);
      return {atlas: atlasData, stills, shader: study.acquisition().provenance.shaderFingerprint};
    }, {name, SIZES, atlasWanted: ATLAS.includes(name), frameCount, cell, columns, rows, duration});
    if (rendered.atlas) await writeFile(join(dir, 'launch-atlas.png'), png(rendered.atlas));
    for (const [size, data] of Object.entries(rendered.stills)) await writeFile(join(dir, `icon-${size}.png`), png(data));
    const alpha = await sharp(png(rendered.stills[1024])).extractChannel(3).raw().toBuffer();
    let opaque = 0; for (const v of alpha) if (v > 230) opaque++;
    report.options[name] = {...options[name], atlas: !!rendered.atlas, opaqueFraction: +(opaque / alpha.length).toFixed(3), shader: rendered.shader};
    console.log(JSON.stringify({option: name, opaque: report.options[name].opaqueFraction}));
  }
  // Steam's app icon is a JPG: no alpha. Made from the full-bleed render at exactly 184 px.
  await sharp(join(out, 'm62-bleed/icon-184.png')).flatten({background: '#000'}).jpeg({quality: 92}).toFile(join(out, 'm62-bleed/steam-app-icon-184.jpg'));
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({out, options: Object.keys(report.options)}));
} finally {
  await browser?.close(); await server?.close(); await rm(profile, {recursive: true, force: true});
}
