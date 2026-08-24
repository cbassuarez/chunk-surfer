// Reproducible hero vegetation pack. Poly Haven source files are SHA-256 pinned;
// local copies are preferred and the small direct glTF sources may be fetched
// from their manifest URLs when they are not already present.

import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = path.join(import.meta.dirname, 'vegetation-sources.json');
const BLENDER_SCRIPT = path.join(import.meta.dirname, 'build-vegetation.py');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const sourceDir = process.env[manifest.sourceDirectoryEnv] || manifest.defaultSourceDirectory;
const output = path.join(ROOT, manifest.output);
const outputBase = output.replace(/\.glb$/i, '');
const statsPath = `${outputBase}.stats.json`;
const creditsPath = `${outputBase}.credits.json`;
const artifactPath = path.join(ROOT, manifest.artifactReport);
const blender = process.env.BLENDER_BIN
  || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');

const BASE_MESHES = [
  'yard_hedge_run', 'yard_hedge_dense', 'yard_hedge_corner', 'opening_park_laurel',
  'opening_street_tree_small', 'opening_street_tree_small_b', 'opening_street_tree_small_c',
  'vegetation_nettle_cluster', 'vegetation_weed_cluster', 'vegetation_grass_edge', 'vegetation_leaf_scatter',
  'academic_planter', 'academic_dead_tree', 'academic_dead_tree_b', 'academic_leaf_litter',
];
const LOD_MESHES = BASE_MESHES.filter((name) => name !== 'academic_planter')
  .flatMap((name) => [`${name}_lod1`, `${name}_lod2`]);
const EXPECTED_MESHES = BASE_MESHES.flatMap((name) => name === 'academic_planter'
  ? [name]
  : [name, `${name}_lod1`, `${name}_lod2`]);

function fail(message) { throw new Error(`vegetation: ${message}`); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fileSha256(file) { return sha256(fs.readFileSync(file)); }

function safeExtract(archive, destination) {
  const members = childProcess.execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  for (const member of members) {
    const normal = path.posix.normalize(member);
    if (path.posix.isAbsolute(member) || normal === '..' || normal.startsWith('../')) fail(`unsafe archive member ${member}`);
  }
  fs.mkdirSync(destination, { recursive: true });
  childProcess.execFileSync('unzip', ['-q', '-o', archive, '-d', destination]);
}

async function obtainFile(record, destination) {
  const candidates = [path.join(sourceDir, record.path), path.join(sourceDir, path.basename(record.path))];
  const local = candidates.find((candidate) => fs.existsSync(candidate));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (local) fs.copyFileSync(local, destination);
  else {
    let response;
    try { response = await fetch(record.url); }
    catch (error) { fail(`${record.path}: unavailable locally and download failed (${error.message})`); }
    if (!response.ok) fail(`${record.path}: download returned ${response.status}`);
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  }
  const actual = fileSha256(destination);
  if (actual !== record.sha256) fail(`${record.path}: sha256 ${actual} != ${record.sha256}`);
  return { path: record.path, url: record.url, sha256: actual, bytes: fs.statSync(destination).size, local: !!local };
}

async function rgbaCell(albedoFile, alphaFile, size, destination, tune = {}) {
  const { data: rgb } = await sharp(albedoFile).resize(size, size, { fit: 'fill' })
    .modulate({ brightness: tune.brightness ?? 1, saturation: tune.saturation ?? 1 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: alpha } = await sharp(alphaFile).resize(size, size, { fit: 'fill' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    rgba[pixel * 4] = rgb[pixel * 3]; rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2]; rgba[pixel * 4 + 3] = alpha[pixel];
  }
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 }).toFile(destination);
}

async function dataCell(input, size, destination) {
  await sharp(input).resize(size, size, { fit: 'fill' }).removeAlpha()
    .png({ compressionLevel: 9 }).toFile(destination);
}

async function roughnessCell(input, size, destination) {
  const { data: rough } = await sharp(input).resize(size, size, { fit: 'fill' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const orm = Buffer.alloc(size * size * 3);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    orm[pixel * 3] = 255; orm[pixel * 3 + 1] = rough[pixel]; orm[pixel * 3 + 2] = 0;
  }
  await sharp(orm, { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 9 }).toFile(destination);
}

async function atlas(cells, cellSize, destination, background) {
  await sharp({ create: { width: cellSize * 2, height: cellSize * 2, channels: 4, background } })
    .composite(cells.map((input, index) => ({ input, left: (index % 2) * cellSize, top: Math.floor(index / 2) * cellSize })))
    .png({ compressionLevel: 9 }).toFile(destination);
}

function treeMap(root, source, key) {
  const file = path.join(root, source.maps[key]);
  if (!fs.existsSync(file)) fail(`smallTree: missing ${source.maps[key]}`);
  return file;
}

async function buildTextures(workDir, sourceRoots) {
  const textureDir = path.join(workDir, 'textures');
  const cellDir = path.join(workDir, 'atlas-cells');
  fs.mkdirSync(textureDir, { recursive: true }); fs.mkdirSync(cellDir, { recursive: true });
  const tree = manifest.sources.find((source) => source.role === 'smallTree');
  const treeRoot = sourceRoots.smallTree;
  const roles = ['smallTree', 'shrub', 'nettle', 'weed'];
  const liveCells = [], normalCells = [], ormCells = [];
  for (const [index, role] of roles.entries()) {
    const source = manifest.sources.find((entry) => entry.role === role);
    const root = sourceRoots[role];
    const maps = role === 'smallTree'
      ? { albedo: treeMap(treeRoot, tree, 'leafAlbedo'), alpha: treeMap(treeRoot, tree, 'leafAlpha'), normal: treeMap(treeRoot, tree, 'leafNormal'), roughness: treeMap(treeRoot, tree, 'leafRoughness') }
      : { albedo: path.join(root, source.maps.albedo), alpha: path.join(root, source.maps.alpha), normal: path.join(root, source.maps.normal), orm: path.join(root, source.maps.orm) };
    const albedo = path.join(cellDir, `${index}-albedo.png`), normal = path.join(cellDir, `${index}-normal.png`), orm = path.join(cellDir, `${index}-orm.png`);
    await rgbaCell(maps.albedo, maps.alpha, 1024, albedo, role === 'smallTree' ? { brightness: .72, saturation: .58 } : { brightness: .70, saturation: .62 });
    await dataCell(maps.normal, 512, normal);
    if (maps.orm) await dataCell(maps.orm, 512, orm); else await roughnessCell(maps.roughness, 512, orm);
    liveCells.push(albedo); normalCells.push(normal); ormCells.push(orm);
  }
  await atlas(liveCells, 1024, path.join(textureDir, 'foliage-albedo.png'), { r: 0, g: 0, b: 0, alpha: 0 });
  await atlas(normalCells, 512, path.join(textureDir, 'foliage-normal.png'), { r: 128, g: 128, b: 255, alpha: 1 });
  await atlas(ormCells, 512, path.join(textureDir, 'foliage-orm.png'), { r: 255, g: 235, b: 0, alpha: 1 });

  await sharp(treeMap(treeRoot, tree, 'branchAlbedo')).resize(1024, 1024, { fit: 'fill' })
    .modulate({ brightness: .68, saturation: .52 }).removeAlpha().jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toFile(path.join(textureDir, 'branch-albedo.jpg'));
  await dataCell(treeMap(treeRoot, tree, 'branchNormal'), 512, path.join(textureDir, 'branch-normal.png'));
  await roughnessCell(treeMap(treeRoot, tree, 'branchRoughness'), 512, path.join(textureDir, 'branch-orm.png'));

  const weed = manifest.sources.find((source) => source.role === 'weed');
  const weedRoot = sourceRoots.weed;
  const deadBase = path.join(cellDir, 'dead-base.png');
  await rgbaCell(path.join(weedRoot, weed.maps.albedo), path.join(weedRoot, weed.maps.alpha), 512, deadBase, { brightness: .58, saturation: .12 });
  const { data: deadRgba } = await sharp(deadBase).raw().toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < 512 * 512; pixel += 1) {
    const luma = Math.round(deadRgba[pixel * 4] * .2126 + deadRgba[pixel * 4 + 1] * .7152 + deadRgba[pixel * 4 + 2] * .0722);
    deadRgba[pixel * 4] = Math.round(luma * .52); deadRgba[pixel * 4 + 1] = Math.round(luma * .39); deadRgba[pixel * 4 + 2] = Math.round(luma * .25);
  }
  await sharp(deadRgba, { raw: { width: 512, height: 512, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(textureDir, 'dead-leaf-albedo.png'));
  await dataCell(path.join(weedRoot, weed.maps.normal), 512, path.join(textureDir, 'dead-leaf-normal.png'));
  await dataCell(path.join(weedRoot, weed.maps.orm), 512, path.join(textureDir, 'dead-leaf-orm.png'));
  return textureDir;
}

function findChunks(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) fail('Blender did not produce GLB 2');
  if (bytes.readUInt32LE(8) !== bytes.length) fail('GLB header length is false');
  let cursor = 12, json = null, bin = null;
  while (cursor < bytes.length) {
    const length = bytes.readUInt32LE(cursor), type = bytes.readUInt32LE(cursor + 4), chunk = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    else if (type === 0x004e4942) bin = Buffer.from(chunk);
    cursor += 8 + length;
  }
  if (!json || !bin) fail('GLB is missing JSON or BIN');
  return { json, bin };
}

function stripExtensions(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(stripExtensions); return; }
  delete value.extensions;
  for (const child of Object.values(value)) stripExtensions(child);
}

const MATERIAL_METADATA = {
  'vegetation.live': { vegetationClass: 'leaf', vegetationTransmission: .30, vegetationWetness: .74, vegetationAoStrength: .22 },
  'vegetation.blade': { vegetationClass: 'leaf', vegetationTransmission: .18, vegetationWetness: .78, vegetationAoStrength: .16 },
  'vegetation.branch': { vegetationClass: 'stem', vegetationTransmission: 0, vegetationWetness: .62, vegetationAoStrength: .28 },
  'vegetation.stem': { vegetationClass: 'stem', vegetationTransmission: 0, vegetationWetness: .58, vegetationAoStrength: .24 },
  'vegetation.deadStem': { vegetationClass: 'stem', vegetationTransmission: 0, vegetationWetness: .04, vegetationAoStrength: .34 },
  'vegetation.deadLeaf': { vegetationClass: 'dead-leaf', vegetationTransmission: .05, vegetationWetness: .03, vegetationAoStrength: .30 },
  'vegetation.soil': { vegetationClass: 'soil', vegetationTransmission: 0, vegetationWetness: .08, vegetationAoStrength: .34 },
  'vegetation.stone': { vegetationClass: 'stone', vegetationTransmission: 0, vegetationWetness: .08, vegetationAoStrength: .20 },
};

function meshWind(name) {
  if (name.startsWith('academic_')) return { amplitudeM: name.includes('dead_tree') ? .002 : 0, frequencyHz: .11, anchorY: 0, heightM: 4.0 };
  if (name.includes('tree_small')) return { amplitudeM: .038, frequencyHz: .16, anchorY: 0, heightM: 4.6 };
  if (name.includes('hedge') || name.includes('laurel')) return { amplitudeM: .024, frequencyHz: .19, anchorY: 0, heightM: 2.2 };
  if (name.includes('nettle')) return { amplitudeM: .042, frequencyHz: .24, anchorY: 0, heightM: 1.0 };
  if (name.includes('weed') || name.includes('grass')) return { amplitudeM: .034, frequencyHz: .28, anchorY: 0, heightM: .72 };
  return { amplitudeM: 0, frequencyHz: 0, anchorY: 0, heightM: 1 };
}

function sanitise(json) {
  delete json.extensionsUsed; delete json.extensionsRequired; delete json.animations; delete json.skins;
  stripExtensions(json);
  for (const material of json.materials || []) {
    const metadata = MATERIAL_METADATA[material.name];
    if (metadata) material.extras = { ...(material.extras || {}), ...metadata };
    if (['vegetation.live', 'vegetation.deadLeaf'].includes(material.name)) {
      material.alphaMode = 'MASK'; material.alphaCutoff = material.name === 'vegetation.deadLeaf' ? .38 : .43;
      material.doubleSided = true;
    } else if (material.alphaMode === 'BLEND') material.alphaMode = 'MASK';
    const pbr = material.pbrMetallicRoughness ||= {};
    pbr.metallicFactor = 0; pbr.roughnessFactor = material.name === 'vegetation.stone' ? .88 : .96;
    if (pbr.metallicRoughnessTexture?.index != null) material.occlusionTexture = { index: pbr.metallicRoughnessTexture.index, strength: metadata?.vegetationAoStrength ?? 0 };
    material.emissiveFactor = [0, 0, 0]; delete material.emissiveTexture;
  }
  for (const mesh of json.meshes || []) {
    const base = mesh.name.replace(/_lod[12]$/, '');
    mesh.extras = { ...(mesh.extras || {}), vegetationWind: meshWind(mesh.name) };
    if (BASE_MESHES.includes(mesh.name) && mesh.name !== 'academic_planter') {
      mesh.extras.vegetationLods = {
        medium: `${base}_lod1`, far: `${base}_lod2`,
        mediumDistanceM: manifest.lod.mediumDistanceM,
        farDistanceM: manifest.lod.farDistanceM,
        hysteresisM: manifest.lod.hysteresisM,
      };
    }
  }
}

function buildGlb(json, bin) {
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonLength = Math.ceil(rawJson.length / 4) * 4, binLength = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + binLength, out = Buffer.alloc(total);
  out.write('glTF', 0, 4, 'ascii'); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonLength, 12); out.writeUInt32LE(0x4e4f534a, 16); out.fill(0x20, 20, 20 + jsonLength); rawJson.copy(out, 20);
  const binHeader = 20 + jsonLength; out.writeUInt32LE(binLength, binHeader); out.writeUInt32LE(0x004e4942, binHeader + 4); bin.copy(out, binHeader + 8);
  return out;
}

function imageSize(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let cursor = 2;
  while (cursor + 9 < bytes.length) {
    if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
    const marker = bytes[cursor + 1]; cursor += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(cursor);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3), format: 'jpeg' };
    cursor += length;
  }
  return null;
}

function collectStats(bytes, json, bin) {
  const meshes = {};
  for (let index = 0; index < (json.meshes || []).length; index += 1) {
    const mesh = json.meshes[index]; let triangles = 0, vertices = 0, primitives = 0;
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (const primitive of mesh.primitives || []) {
      if (!Number.isInteger(primitive.indices) || !Number.isInteger(primitive.attributes?.POSITION)
        || !Number.isInteger(primitive.attributes?.NORMAL) || !Number.isInteger(primitive.attributes?.TEXCOORD_0)) fail(`${mesh.name}: incomplete indexed primitive`);
      triangles += json.accessors[primitive.indices].count / 3; primitives += 1;
      const position = json.accessors[primitive.attributes.POSITION]; vertices += position.count;
      for (let axis = 0; axis < 3; axis += 1) { low[axis] = Math.min(low[axis], position.min[axis]); high[axis] = Math.max(high[axis], position.max[axis]); }
    }
    meshes[mesh.name] = { index, triangles, vertices, primitives, bounds: { min: low, max: high }, extras: mesh.extras || {} };
  }
  const images = (json.images || []).map((image, index) => {
    if (!Number.isInteger(image.bufferView)) fail(`image ${index} is not embedded`);
    const view = json.bufferViews[image.bufferView], start = view.byteOffset || 0, size = imageSize(bin.subarray(start, start + view.byteLength));
    if (!size) fail(`image ${index} is not PNG or JPEG`);
    return { index, name: image.name || `image-${index}`, mimeType: image.mimeType, bytes: view.byteLength, ...size };
  });
  const totalTriangles = Object.values(meshes).reduce((sum, mesh) => sum + mesh.triangles, 0);
  const estimatedMipmappedTextureBytes = Math.ceil(images.reduce((sum, image) => sum + image.width * image.height * 4, 0) * 4 / 3);
  const additionalMainPassDrawCalls = Math.max(
    meshes.yard_hedge_run?.primitives || 0,
    meshes.yard_hedge_dense?.primitives || 0,
    meshes.yard_hedge_corner?.primitives || 0,
  ) + Math.max(meshes.opening_street_tree_small?.primitives || 0, meshes.opening_street_tree_small_b?.primitives || 0, meshes.opening_street_tree_small_c?.primitives || 0)
    + (meshes.vegetation_nettle_cluster?.primitives || 0) + (meshes.vegetation_weed_cluster?.primitives || 0)
    + (meshes.vegetation_grass_edge?.primitives || 0) + (meshes.vegetation_leaf_scatter?.primitives || 0);
  return { bytes: bytes.length, sha256: sha256(bytes), totalTriangles, textureCount: images.length, estimatedMipmappedTextureBytes, additionalMainPassDrawCalls, meshes, images };
}

function assertOutput(stats, json) {
  const limits = manifest.limits;
  if (stats.bytes > limits.bytes) fail(`${stats.bytes} bytes exceeds ${limits.bytes}`);
  if (stats.totalTriangles > limits.triangles) fail(`${stats.totalTriangles} triangles exceeds ${limits.triangles}`);
  if (stats.estimatedMipmappedTextureBytes > limits.estimatedMipmappedTextureBytes) fail('estimated texture allocation exceeds limit');
  if (stats.additionalMainPassDrawCalls > limits.additionalMainPassDrawCalls) fail(`${stats.additionalMainPassDrawCalls} representative draws exceeds ${limits.additionalMainPassDrawCalls}`);
  if (stats.images.some((image) => Math.max(image.width, image.height) > limits.textureDimension)) fail('texture dimension limit exceeded');
  const names = (json.meshes || []).map((mesh) => mesh.name);
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_MESHES)) fail(`mesh catalogue mismatch: ${names.join(', ')}`);
  if ((json.materials || []).some((material) => !['OPAQUE', 'MASK'].includes(material.alphaMode || 'OPAQUE'))) fail('unsupported alpha mode survived sanitisation');
  for (const name of BASE_MESHES.filter((mesh) => mesh !== 'academic_planter')) {
    const lod = stats.meshes[name]?.extras?.vegetationLods;
    if (!lod || !stats.meshes[lod.medium] || !stats.meshes[lod.far]) fail(`${name}: missing LOD metadata or tiers`);
  }
  const materialClasses = new Set((json.materials || []).map((material) => material.extras?.vegetationClass).filter(Boolean));
  for (const role of ['leaf', 'stem', 'dead-leaf', 'soil', 'stone']) if (!materialClasses.has(role)) fail(`missing vegetation material class ${role}`);
}

async function main() {
  if (!fs.existsSync(blender)) fail(`Blender executable does not exist: ${blender}`);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunk-surfer-vegetation-'));
  const sourceRoots = {}, sourceReports = [];
  try {
    for (const source of manifest.sources) {
      const root = path.join(workDir, 'sources', source.role); sourceRoots[source.role] = root;
      fs.mkdirSync(root, { recursive: true });
      if (source.kind === 'archive') {
        const archive = path.join(sourceDir, source.archive);
        if (!fs.existsSync(archive)) fail(`missing source archive ${archive}`);
        const actual = fileSha256(archive);
        if (actual !== source.sha256) fail(`${source.archive}: sha256 ${actual} != ${source.sha256}`);
        safeExtract(archive, root);
        sourceReports.push({ role: source.role, source: source.source, archive: source.archive, sha256: actual, local: true });
      } else {
        const files = [];
        for (const record of source.files) files.push(await obtainFile(record, path.join(root, record.path)));
        sourceReports.push({ role: source.role, source: source.source, files });
      }
      console.log(`VEGETATION SOURCE ${source.role}: verified`);
    }
    await buildTextures(workDir, sourceRoots);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const blenderReportPath = path.join(workDir, 'blender-report.json');
    const result = childProcess.spawnSync(blender, [
      '--background', '--factory-startup', '--python', BLENDER_SCRIPT, '--',
      '--manifest', MANIFEST_PATH, '--work-dir', workDir, '--output', output, '--report', blenderReportPath,
    ], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(`Blender exited ${result.status}`);
    if (!fs.existsSync(output) || !fs.existsSync(blenderReportPath)) fail('Blender did not produce output/report');
    const first = findChunks(fs.readFileSync(output)); sanitise(first.json);
    const sanitised = buildGlb(first.json, first.bin); fs.writeFileSync(output, sanitised);
    const final = findChunks(sanitised), stats = collectStats(sanitised, final.json, final.bin); assertOutput(stats, final.json);
    const blenderReport = JSON.parse(fs.readFileSync(blenderReportPath, 'utf8'));
    const fullStats = { file: path.basename(output), ...stats, limits: manifest.limits, lod: manifest.lod, build: blenderReport };
    const sources = manifest.sources.map((source) => ({
      role: source.role, sourceName: source.source, sourceUrl: source.url, authors: source.authors,
      license: source.license, licenseUrl: source.licenseUrl,
      archive: source.archive || null, archiveSha256: source.sha256 || null,
      files: source.files?.map(({ path: file, url, sha256: digest }) => ({ file, url, sha256: digest })) || null,
    }));
    const credits = { file: path.basename(output), pack: { sha256: stats.sha256, bytes: stats.bytes, triangles: stats.totalTriangles }, license: manifest.license, sources };
    const artifact = { generatedAt: new Date().toISOString(), file: path.basename(output), build: fullStats, ingestion: sourceReports, credits: sources };
    fs.writeFileSync(statsPath, `${JSON.stringify(fullStats, null, 2)}\n`);
    fs.writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true }); fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`Vegetation: ${(stats.bytes / 1048576).toFixed(2)} MiB, ${stats.totalTriangles} triangles, ${stats.textureCount} textures, ${stats.additionalMainPassDrawCalls} representative draws.`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

await main();
