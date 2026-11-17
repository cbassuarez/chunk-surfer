// Turns artifacts/lighting-audit/raw into images and numbers.
//   node tools/chunk_surfer/lighting-audit/analyse.mjs
// Output: artifacts/lighting-audit/img/<station>/*.png and metrics.json
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {STATIONS} from './stations.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const raw = path.join(root, 'artifacts/lighting-audit/raw'), out = path.join(root, 'artifacts/lighting-audit');
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const FLOOR = 1e-4; // linear scene units; below this a pixel is treated as black
const stops = (a, b) => Math.log2(Math.max(a, FLOOR) / Math.max(b, FLOOR));
const round = (value, digits = 2) => value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);

let STAGE = '';
function grid(dir, name, info) {
  const file = path.join(dir, `${name}${STAGE}.f32`);
  if (STAGE && info?.props) info = info.props;
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file), rgb = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const count = info.columns * info.rows, y = new Float32Array(count);
  for (let i = 0; i < count; i++) y[i] = luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  return {rgb, y, columns: info.columns, rows: info.rows, count};
}
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
const mean = values => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

// One exposure per station, taken from the ordinary frame, so every image of
// that station (clay, each light alone) is directly comparable.
function toPng(g, exposure, file) {
  const data = Buffer.alloc(g.count * 3);
  for (let i = 0; i < g.count * 3; i++) data[i] = Math.round(255 * Math.min(1, Math.max(0, g.rgb[i] * exposure)) ** (1 / 2.2));
  return sharp(data, {raw: {width: g.columns, height: g.rows, channels: 3}}).resize(640, null, {kernel: 'nearest'}).png().toFile(file);
}
// False colour: stops above/below the frame median. Blue is under, red is over.
const RAMP = [[-4, [10, 10, 60]], [-2, [30, 70, 200]], [-1, [40, 160, 200]], [0, [90, 190, 90]], [1, [230, 220, 60]], [2, [240, 130, 40]], [4, [230, 30, 30]]];
function falseColour(g, median, file) {
  const data = Buffer.alloc(g.count * 3);
  for (let i = 0; i < g.count; i++) {
    const s = Math.max(-4, Math.min(4, stops(g.y[i], median)));
    let k = 0; while (k < RAMP.length - 2 && s > RAMP[k + 1][0]) k++;
    const [s0, c0] = RAMP[k], [s1, c1] = RAMP[k + 1], t = (s - s0) / (s1 - s0);
    for (let c = 0; c < 3; c++) data[i * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * Math.max(0, Math.min(1, t)));
    if (g.y[i] <= FLOOR) data.fill(0, i * 3, i * 3 + 3);
  }
  return sharp(data, {raw: {width: g.columns, height: g.rows, channels: 3}}).resize(640, null, {kernel: 'nearest'}).png().toFile(file);
}

// Tones after the dither. The screen is averaged over 8 px cells (roughly what
// the eye fuses at arm's length), converted to CIE L*, and binned 4 L* wide.
// A tone counts when at least 1% of the frame sits in its bin.
async function ditheredTones(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const cell = 8, columns = Math.floor(info.width / cell), rows = Math.floor(info.height / cell), bins = new Array(26).fill(0);
  const linear = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < columns; gx++) {
    let sum = 0;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = ((gy * cell + y) * info.width + gx * cell + x) * 3;
      sum += luma(linear(data[i]), linear(data[i + 1]), linear(data[i + 2]));
    }
    const Y = sum / (cell * cell), L = Y > .008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    bins[Math.min(25, Math.floor(L / 4))]++;
  }
  const total = columns * rows, share = bins.map(n => n / total);
  const Ys = []; for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < columns; gx++) {
    let sum = 0; for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) { const i = ((gy * cell + y) * info.width + gx * cell + x) * 3; sum += luma(linear(data[i]), linear(data[i + 1]), linear(data[i + 2])); }
    Ys.push(sum / (cell * cell)); }
  Ys.sort((a, b) => a - b);
  const screenRange = round(Math.log2(Math.max(percentile(Ys, .95), 1e-4) / Math.max(percentile(Ys, .05), 1e-4)), 1);
  return {screenRange, tones: share.filter(s => s >= .01).length, darkestShare: round(share[0], 3), bins: share.map(s => round(s, 3)), meanL: round(share.reduce((a, s, i) => a + s * (i * 4 + 2), 0), 1)};
}

// SCENE LIGHT -> SCREEN. For every scene block (linear luminance relative to
// the frame's median, in half stops) the median CIE L* the dithered screen
// shows over the same pixels. Where this curve sits at 0 the light exists in
// the scene and never reaches the player.
async function transfer(file, g) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const sorted = Float32Array.from(g.y).filter(v => v > FLOOR).sort(), median = sorted.length ? percentile(sorted, .5) : FLOOR;
  const bins = new Map();
  for (let gy = 0; gy < g.rows; gy++) for (let gx = 0; gx < g.columns; gx++) {
    const v = g.y[gy * g.columns + gx]; if (v <= FLOOR) continue;
    const x0 = Math.floor(gx * info.width / g.columns), x1 = Math.floor((gx + 1) * info.width / g.columns);
    const y0 = Math.floor(gy * info.height / g.rows), y1 = Math.floor((gy + 1) * info.height / g.rows);
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * info.width + x) * 3; sum += luma(lin(data[i]), lin(data[i + 1]), lin(data[i + 2])); n++; }
    const Y = sum / Math.max(1, n), L = Y > .008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    const key = Math.max(-8, Math.min(5, Math.round(stops(v, median) * 2) / 2));
    if (!bins.has(key)) bins.set(key, []); bins.get(key).push(L);
  }
  const curve = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([stop, list]) => ({stop, share: round(list.length / g.count, 3), L: round(percentile(list.sort((a, b) => a - b), .5), 1)}));
  const visible = curve.find(point => point.L >= 8);
  // Share of the scene's lit blocks that land on a visible screen value.
  const visibleShare = curve.filter(point => point.L >= 8).reduce((a, point) => a + point.share, 0);
  return {curve, visibleFromStop: visible ? visible.stop : null, visibleShare: round(visibleShare, 2)};
}

const metrics = {generatedAt: new Date().toISOString(), environment: JSON.parse(fs.readFileSync(path.join(raw, 'environment.json'), 'utf8')), stations: []};
for (const station of STATIONS) {
  const dir = path.join(raw, station.id), file = path.join(dir, 'station.json');
  if (!fs.existsSync(file)) continue;
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record.failed) { metrics.stations.push({id: station.id, title: station.title, space: station.space, failed: record.failed.split('\n')[0]}); continue; }
  const images = path.join(out, 'img', station.id); fs.mkdirSync(images, {recursive: true});
  // Which linear buffer is the picture? The world march's float target holds
  // the composite in the building; Source's void and the drive composite from
  // the mesh pass's own target. Pick the one whose log luminance best follows
  // the on-screen frame (averaged over the same blocks).
  STAGE = '';
  const screen = await sharp(path.join(dir, 'final.png')).removeAlpha().resize(record.captures.final.columns, record.captures.final.rows, {fit: 'fill', kernel: 'cubic'}).raw().toBuffer();
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const screenY = Float32Array.from({length: screen.length / 3}, (_, i) => luma(lin(screen[i * 3]), lin(screen[i * 3 + 1]), lin(screen[i * 3 + 2])));
  const correlation = g => {
    if (!g || g.count !== screenY.length) return -1;
    const a = Array.from(g.y, v => Math.log(Math.max(v, 1e-4))), b = Array.from(screenY, v => Math.log(Math.max(v, 1e-4)));
    const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return n / Math.sqrt(Math.max(da * db, 1e-12));
  };
  const sceneCorrelation = correlation(grid(dir, 'final', record.captures.final));
  STAGE = '.props';
  const propsCorrelation = record.captures.final.props ? correlation(grid(dir, 'final', record.captures.final)) : -1;
  STAGE = propsCorrelation > sceneCorrelation + .2 ? '.props' : '';
  const buffer = {used: STAGE ? 'mesh pass (RGBA8 linear)' : 'world march (float)', sceneCorrelation: round(sceneCorrelation, 2), propsCorrelation: round(propsCorrelation, 2)};
  const final = grid(dir, 'final', record.captures.final), clay = grid(dir, 'clay', record.captures.clay), none = grid(dir, 'solo-none', record.captures['solo-none']);
  const sorted = Float32Array.from(final.y).sort(), p = q => percentile(sorted, q);
  const median = Math.max(p(.5), FLOOR), exposure = .85 / Math.max(p(.99), 1e-3);
  await toPng(final, exposure, path.join(images, 'scene.png'));
  await toPng(clay, exposure, path.join(images, 'clay-scene.png'));
  await falseColour(final, median, path.join(images, 'false-colour.png'));
  fs.copyFileSync(path.join(dir, 'final.png'), path.join(images, 'final.png'));
  fs.copyFileSync(path.join(dir, 'clay.png'), path.join(images, 'clay.png'));

  // Each light group's own contribution: its solo frame minus the frame with
  // every controllable light off (what is left there is sky, emissive and fog).
  const residual = mean(none.y), groups = [];
  const lights = record.meta.renderer?.lights || [];
  for (const solo of record.solos) {
    if (solo === 'none') continue;
    const g = grid(dir, `solo-${solo}`, record.captures[`solo-${solo}`]); if (!g) continue;
    let sum = 0, peak = 0; for (let i = 0; i < g.count; i++) { const d = Math.max(0, g.y[i] - none.y[i]); sum += d; if (d > peak) peak = d; }
    const light = typeof solo === 'number' ? lights[solo] : null;
    const label = solo === 'ambient' ? 'Ambient + bounce' : solo === 'torch' ? 'Torch' : `Light ${solo}`;
    await toPng(g, exposure, path.join(images, `solo-${solo}.png`));
    groups.push({solo, label, mean: sum / g.count, peak, light: light && {radius: round(light.radius, 1), intensity: round(light.intensity, 2), colour: light.color?.map(c => round(c, 2)), emergency: light.emergency, cone: light.coneOuterCos > -1 ? round(light.coneOuterCos, 2) : null}});
  }
  await toPng(none, exposure, path.join(images, 'solo-none.png'));
  const ranked = [...groups].sort((a, b) => b.mean - a.mean), key = ranked[0] || null;
  const total = groups.reduce((a, g) => a + g.mean, 0) + residual, fill = total - (key?.mean || 0);
  const ambient = groups.find(g => g.solo === 'ambient')?.mean || 0;
  const directional = groups.filter(g => g.solo !== 'ambient').reduce((a, g) => a + g.mean, 0);

  // Clay: how much the light alone models the frame.
  const claySorted = Float32Array.from(clay.y).filter(v => v > FLOOR).sort(), clayMedian = claySorted.length ? percentile(claySorted, .5) : FLOOR;
  let within = 0; for (const v of claySorted) if (Math.abs(stops(v, clayMedian)) <= .5) within++;
  // Round 2 where it exists: the first round after the captures runs slow.
  const t = name => record.timing[`${name}2`] || record.timing[`${name}1`];
  const ms = (entry, key) => entry?.passes?.gpu?.[key]?.median ?? null, wall = entry => entry?.frame?.wallMs?.median ?? null;
  // Albedo the light is falling on: frame / clay x 18%, where clay is lit.
  const albedo = [];
  let litPixels = 0, changed = 0;
  for (let i = 0; i < clay.count; i++) {
    if (clay.y[i] <= 1e-3 && final.y[i] <= 1e-3) continue;
    litPixels++;
    // Only where clay changed the pixel: what clay leaves alone (sky, emitters,
    // screens) is not a lit surface and says nothing about reflectance.
    if (Math.abs(final.y[i] - clay.y[i]) <= .05 * Math.max(final.y[i], clay.y[i])) continue;
    changed++;
    if (clay.y[i] > 1e-3 && final.y[i] > FLOOR) albedo.push(.18 * final.y[i] / clay.y[i]);
  }
  albedo.sort((a, b) => a - b);
  metrics.stations.push({
    id: station.id, title: station.title, space: station.space, where: record.meta.where, scene: record.meta.scene,
    uniforms: record.captures.final.seen, lightCount: record.captures.final.seen.localLightCount || 0,
    shadowCaster: lights.length ? (record.meta.renderer?.shadowIndex ?? null) : null,
    luminance: {p1: round(p(.01), 4), p5: round(p(.05), 4), p50: round(p(.5), 4), p95: round(p(.95), 4), p99: round(p(.99), 4), rangeStops: round(stops(p(.95), p(.05)), 1), blackShare: round(sorted.filter(v => v <= FLOOR).length / sorted.length, 3)},
    contributions: groups.map(g => ({...g, mean: round(g.mean, 5), peak: round(g.peak, 4), share: round(g.mean / Math.max(total, 1e-9), 3)})),
    residualShare: round(residual / Math.max(total, 1e-9), 3),
    key: key && {label: key.label, share: round(key.mean / Math.max(total, 1e-9), 3)},
    keyToFillStops: key ? round(Math.log2(Math.max(key.mean, 1e-9) / Math.max(fill, 1e-9)), 1) : null,
    directionalToAmbientStops: round(Math.log2(Math.max(directional, 1e-9) / Math.max(ambient + residual, 1e-9)), 1),
    clay: {flatShare: round(claySorted.length ? within / claySorted.length : null, 2), rangeStops: round(claySorted.length ? stops(percentile(claySorted, .95), percentile(claySorted, .05)) : null, 1), litShare: round(claySorted.length / clay.count, 2)},
    dither: await ditheredTones(path.join(dir, 'final.png')),
    transfer: await transfer(path.join(dir, 'final.png'), final),
    buffer,
    clayCoverage: round(changed / Math.max(1, litPixels), 2),
    albedo: albedo.length > 200 ? {p25: round(percentile(albedo, .25), 3), median: round(percentile(albedo, .5), 3), p75: round(percentile(albedo, .75), 3)} : null,
    cost: {round: record.timing.all2 ? 2 : 1, frameWallMs: round(wall(t('all')), 1), frameWallNoLightsMs: round(wall(t('noLights')), 1),
      marchMs: round(ms(t('all'), 'march'), 1), marchNoLocalMs: round(ms(t('noLocal'), 'march'), 1), marchNoLightsMs: round(ms(t('noLights'), 'march'), 1),
      propsMs: round(ms(t('all'), 'props'), 1), propsNoLocalMs: round(ms(t('noLocal'), 'props'), 1), propsNoLightsMs: round(ms(t('noLights'), 'props'), 1),
      marchRound1Ms: round(ms(record.timing.all1, 'march'), 1), propsRound1Ms: round(ms(record.timing.all1, 'props'), 1)},
    renderedLights: lights.map((l, i) => ({i, radius: round(l.radius, 1), intensity: round(l.intensity, 2), colour: l.color?.map(c => round(c, 2)), emergency: l.emergency})),
  });
  // Light with no source: the march's rim pattern and chunk glows (inject.js
  // noSelf), as a share of the frame's light, and the frame without them.
  const residualFile = path.join(dir, 'residual.json');
  if (fs.existsSync(residualFile)) {
    const residualRecord = JSON.parse(fs.readFileSync(residualFile, 'utf8')), c = residualRecord.captures;
    const meanY = name => { const g = grid(dir, name, c[name.replace('residual-', '').replace('all-noself', 'allNoSelf').replace('noself', 'noSelf')]); return g ? mean(g.y) : null; };
    const all = meanY('residual-all'), allNoSelf = meanY('residual-all-noself'), none = meanY('residual-none'), noneNoSelf = meanY('residual-noself');
    const withPng = path.join(dir, 'residual-all.png'), withoutPng = path.join(dir, 'residual-all-noself.png');
    fs.copyFileSync(withPng, path.join(images, 'residual-all.png')); fs.copyFileSync(withoutPng, path.join(images, 'residual-all-noself.png'));
    const without = await ditheredTones(withoutPng), withSelf = await ditheredTones(withPng);
    const skyNone = c.noSky ? mean(grid(dir, 'residual-nosky', c.noSky).y) : null, skyAll = c.allNoSky ? mean(grid(dir, 'residual-all-nosky', c.allNoSky).y) : null;
    let skyTerm = null;
    if (skyAll != null) {
      const skyPng = path.join(dir, 'residual-all-nosky.png');
      fs.copyFileSync(skyPng, path.join(images, 'residual-all-nosky.png'));
      const withoutSky = await ditheredTones(skyPng);
      skyTerm = {share: round((all - skyAll) / all, 3), shareOfLeftover: none ? round((none - skyNone) / none, 3) : null, tonesWithout: withoutSky.tones, darkWithout: withoutSky.darkestShare};
    }
    metrics.stations.at(-1).skyTerm = skyTerm;
    metrics.stations.at(-1).selfLight = {patched: residualRecord.patched.includes('march-self'), share: all ? round((all - allNoSelf) / all, 3) : null,
      shareOfLeftover: none ? round((none - noneNoSelf) / none, 3) : null, tonesWith: withSelf.tones, tonesWithout: without.tones, darkWith: withSelf.darkestShare, darkWithout: without.darkestShare};
  }
  // Live rig previews (capture.mjs LIGHT_AUDIT_MODE=preview), measured the same way.
  const previewFile = path.join(dir, 'preview.json');
  if (fs.existsSync(previewFile)) {
    const preview = JSON.parse(fs.readFileSync(previewFile, 'utf8'));
    metrics.stations.at(-1).previews = [];
    for (const variant of preview.previews) {
      const info = preview.captures[variant.id]; if (!info) continue;
      const g = grid(dir, `preview-${variant.id}`, info), png = path.join(dir, `preview-${variant.id}.png`);
      fs.copyFileSync(png, path.join(images, `preview-${variant.id}.png`));
      const tones = await ditheredTones(png), carried = g ? await transfer(png, g) : null;
      metrics.stations.at(-1).previews.push({id: variant.id, title: variant.title, gain: variant.gain, tones: tones.tones, darkestShare: tones.darkestShare, screenRange: tones.screenRange, visibleShare: carried?.visibleShare ?? null});
    }
  }
  const sweepFile = path.join(dir, 'sweep.json');
  if (fs.existsSync(sweepFile)) {
    const sweep = JSON.parse(fs.readFileSync(sweepFile, 'utf8'));
    metrics.stations.at(-1).sweep = [];
    for (const variant of sweep.previews) {
      const info = sweep.captures[variant.id]; if (!info) continue;
      const g = grid(dir, `preview-${variant.id}`, info), png = path.join(dir, `preview-${variant.id}.png`);
      fs.copyFileSync(png, path.join(images, `preview-${variant.id}.png`));
      const tones = await ditheredTones(png), carried = g ? await transfer(png, g) : null;
      metrics.stations.at(-1).sweep.push({id: variant.id, title: variant.title, gain: variant.gain, tones: tones.tones, darkestShare: tones.darkestShare, screenRange: tones.screenRange, visibleShare: carried?.visibleShare ?? null});
    }
  }
  const s = metrics.stations.at(-1);
  console.log(station.id.padEnd(24), `lights ${String(s.lightCount).padStart(2)}`, `key ${s.key?.label} ${s.key?.share}`, `k:f ${s.keyToFillStops}`, `dir:amb ${s.directionalToAmbientStops}`, `clayFlat ${s.clay.flatShare}`, `range ${s.luminance.rangeStops}`, `tones ${s.dither.tones}`, `scrRange ${s.dither.screenRange}`, `visibleFrom ${s.transfer.visibleFromStop} visShare ${s.transfer.visibleShare}`, `dark ${s.dither.darkestShare}`, `buf ${STAGE || 'scene'} ${buffer.sceneCorrelation}/${buffer.propsCorrelation}`, `clayCov ${s.clayCoverage}`, `self ${s.selfLight ? s.selfLight.share + '/' + s.selfLight.shareOfLeftover : '-'}`, `sky ${s.skyTerm ? s.skyTerm.share + '/' + s.skyTerm.shareOfLeftover : '-'}`, `albedo ${s.albedo?.p25}/${s.albedo?.median}/${s.albedo?.p75}`, `wall ${s.cost.frameWallMs}/${s.cost.frameWallNoLightsMs}`, `march ${s.cost.marchMs}/${s.cost.marchNoLightsMs}`, `props ${s.cost.propsMs}/${s.cost.propsNoLightsMs}`);
}
fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 1));
