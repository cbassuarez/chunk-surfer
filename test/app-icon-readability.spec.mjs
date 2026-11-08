import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const geometryPath = resolve(root, 'assets/brand/van-icon-geometry.json');
const svgPath = resolve(root, 'assets/brand/van-icon.svg');
const pngPath = resolve(root, 'assets/brand/app-icon-cutout.png');
const includePath = resolve(root, 'src-tauri/macos/DockTile/DockAssemblyGeometry.inc');

test('the generator is deterministic: rerunning writes identical bytes for every product', () => {
  const before = [svgPath, pngPath, includePath].map((p) => readFileSync(p).toString('hex'));
  execFileSync(process.execPath, ['scripts/generate-van-icon-art.mjs'], { cwd: root, stdio: 'ignore' });
  const after = [svgPath, pngPath, includePath].map((p) => readFileSync(p).toString('hex'));
  assert.deepEqual(after, before, 'svg, png and dock include are reproducible');
});

test('the dock assembly include carries the same contours as the geometry source', () => {
  const geometry = JSON.parse(readFileSync(geometryPath, 'utf8'));
  const source = readFileSync(includePath, 'utf8');
  const names = { body: 'CSVanBody', seam: 'CSVanSeam', bumper: 'CSVanBumper', lampL: 'CSVanLampL', lampR: 'CSVanLampR' };
  for (const [key, cname] of Object.entries(names)) {
    const block = source.split('static const CSPoint ' + cname + '[]')[1]?.split('};')[0];
    assert.ok(block, cname + ' block present');
    const parsed = [...block.matchAll(/\{([0-9.]+),([0-9.]+)\}/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.deepEqual(parsed, geometry[key].map((p) => [Number(p[0].toFixed(3)), Number(p[1].toFixed(3))]), cname + ' matches the JSON');
  }
});

test('the icon reads at every dock size: lamps survive, the body holds its mass', async () => {
  const svg = readFileSync(svgPath);
  for (const size of [16, 32, 64, 128]) {
    const { data, info } = await sharp(svg, { density: 144 }).resize(size, size).png().toBuffer({ resolveWithObject: true });
    const pixels = await sharp(data).raw().toBuffer({ resolveWithObject: true });
    const raw = pixels.data;
    const { width, height, channels } = pixels.info;
    let opaque = 0, lamp = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const a = channels > 3 ? raw[i + 3] : 255;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];
      if (a > 10) opaque++;
      if (a > 10 && r > 140 && g < 90 && b < 90) lamp++;
    }
    const total = width * height;
    assert.ok(opaque / total > 0.25 && opaque / total < 0.85, size + 'px body occupancy ' + (opaque / total).toFixed(2));
    assert.ok(lamp / total > 0.004 && lamp / total < 0.2, size + 'px lamp presence ' + (lamp / total).toFixed(3));
    // Two separated lamps: red in the lamp band on both halves of the body.
    const bandTop = Math.floor(height * 0.42), bandBottom = Math.floor(height * 0.62);
    let left = 0, right = 0;
    for (let y = bandTop; y < bandBottom; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const a = channels > 3 ? raw[i + 3] : 255;
      if (a > 10 && raw[i] > 140 && raw[i + 1] < 90 && raw[i + 2] < 90) {
        if (x < width / 2) left++; else right++;
      }
    }
    assert.ok(left > 0 && right > 0, size + 'px keeps two lamps, one per side');
  }
});

test('the ear art is preserved for the settings ritual', () => {
  assert.ok(existsSync(resolve(root, 'assets/brand/app-icon-ear-cutout.png')), 'the ear cut-out remains in the repo');
});

