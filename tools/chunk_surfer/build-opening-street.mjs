// Reproducible opening-street asset build. The 4K Poly Haven archives remain
// external; this wrapper verifies their pinned bytes, normalises the selected
// maps, delegates mesh work to Blender, and enforces the runtime GLB contract.

import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = path.join(import.meta.dirname, 'opening-street-sources.json');
const BLENDER_SCRIPT = path.join(import.meta.dirname, 'build-opening-street.py');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const sourceDir = process.env[manifest.sourceDirectoryEnv] || manifest.defaultSourceDirectory;
const output = path.join(ROOT, manifest.output);
const outputBase = output.replace(/\.glb$/i, '');
const statsPath = `${outputBase}.stats.json`;
const creditsPath = `${outputBase}.credits.json`;
const artifactPath = path.join(ROOT, manifest.artifactReport);
const blender = process.env.BLENDER_BIN
  || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const EXPECTED_MESHES = [
  'opening_street_ground',
  'opening_street_frontage',
  'opening_street_service_history',
  'opening_street_review_plate',
  'opening_street_tree_small',
];

function fail(message) { throw new Error(`opening street: ${message}`); }
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

function readableImage(file, workDir) {
  if (!/\.exr$/i.test(file)) return file;
  const destination = path.join(workDir, 'converted', `${path.basename(file, '.exr')}-${sha256(file).slice(0, 10)}.png`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) {
    childProcess.execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, destination]);
  }
  return destination;
}

async function rawChannel(file, size, workDir, fallback) {
  if (!file) return Buffer.alloc(size * size, fallback);
  const { data } = await sharp(readableImage(file, workDir))
    .resize(size, size, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function writeAlbedo({ input, alpha = null, size, destination, tune }, workDir) {
  let image = sharp(readableImage(input, workDir)).resize(size, size, { fit: 'fill' })
    .modulate({ brightness: tune?.brightness ?? 1, saturation: tune?.saturation ?? 1 });
  if (!alpha) {
    await image.removeAlpha().jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toFile(destination);
    return;
  }
  const rgb = await image.removeAlpha().raw().toBuffer();
  const mask = await rawChannel(alpha, size, workDir, 255);
  const rgba = Buffer.alloc(size * size * 4);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    rgba[pixel * 4] = rgb[pixel * 3]; rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1];
    rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2]; rgba[pixel * 4 + 3] = mask[pixel];
  }
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toFile(destination);
}

async function writeNormal(input, size, destination, workDir) {
  await sharp(readableImage(input, workDir)).resize(size, size, { fit: 'fill' })
    .removeAlpha().png({ compressionLevel: 9 }).toFile(destination);
}

async function writeOrm({ roughness, metallic, size, destination }, workDir) {
  const rough = await rawChannel(roughness, size, workDir, 230);
  const metal = await rawChannel(metallic, size, workDir, 0);
  const rgb = Buffer.alloc(size * size * 3);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    rgb[pixel * 3] = 255; rgb[pixel * 3 + 1] = rough[pixel]; rgb[pixel * 3 + 2] = metal[pixel];
  }
  await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 9 }).toFile(destination);
}

async function normaliseSource(source, extracted, textureDir, workDir) {
  const locate = (relative) => relative ? path.join(extracted, relative) : null;
  const requireMap = (relative, label) => {
    const file = locate(relative);
    if (relative && !fs.existsSync(file)) fail(`${source.role}: missing ${label} map ${relative}`);
    return file;
  };
  const records = [];
  if (source.kind === 'prop') {
    for (const part of ['branch', 'leaves']) {
      const leaf = part === 'leaves';
      const stem = `smallTree-${part}`;
      const albedo = path.join(textureDir, `${stem}-albedo.${leaf ? 'png' : 'jpg'}`);
      const normal = path.join(textureDir, `${stem}-normal.png`);
      const orm = path.join(textureDir, `${stem}-orm.png`);
      await writeAlbedo({
        input: requireMap(source.maps[`${leaf ? 'leaf' : 'branch'}Albedo`], `${part} albedo`),
        alpha: leaf ? requireMap(source.maps.leafAlpha, 'leaf alpha') : null,
        size: source.albedoResolution, destination: albedo, tune: source.tune,
      }, workDir);
      await writeNormal(requireMap(source.maps[`${leaf ? 'leaf' : 'branch'}Normal`], `${part} normal`), source.dataResolution, normal, workDir);
      await writeOrm({
        roughness: requireMap(source.maps[`${leaf ? 'leaf' : 'branch'}Roughness`], `${part} roughness`),
        metallic: null, size: source.dataResolution, destination: orm,
      }, workDir);
      records.push({ part, albedo: path.basename(albedo), normal: path.basename(normal), orm: path.basename(orm) });
    }
    return records;
  }
  const alpha = requireMap(source.maps.alpha, 'alpha');
  const albedo = path.join(textureDir, `${source.role}-albedo.${alpha ? 'png' : 'jpg'}`);
  const normal = path.join(textureDir, `${source.role}-normal.png`);
  const orm = path.join(textureDir, `${source.role}-orm.png`);
  await writeAlbedo({
    input: requireMap(source.maps.albedo, 'albedo'), alpha,
    size: source.albedoResolution, destination: albedo, tune: source.tune,
  }, workDir);
  await writeNormal(requireMap(source.maps.normal, 'normal'), source.dataResolution, normal, workDir);
  await writeOrm({
    roughness: requireMap(source.maps.roughness, 'roughness'),
    metallic: requireMap(source.maps.metallic, 'metallic'),
    size: source.dataResolution, destination: orm,
  }, workDir);
  return [{ albedo: path.basename(albedo), normal: path.basename(normal), orm: path.basename(orm) }];
}

function findChunks(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) fail('Blender did not produce GLB 2');
  if (bytes.readUInt32LE(8) !== bytes.length) fail('GLB header length is false');
  let cursor = 12, json = null, bin = null;
  while (cursor + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(cursor), type = bytes.readUInt32LE(cursor + 4);
    const chunk = bytes.subarray(cursor + 8, cursor + 8 + length);
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

function sanitise(json) {
  delete json.extensionsUsed; delete json.extensionsRequired; delete json.animations; delete json.skins;
  stripExtensions(json);
  const byRole = new Map(manifest.sources.map((source) => [source.role, source]));
  for (const material of json.materials || []) {
    const match = /^openingStreet\.([A-Za-z0-9]+)(?:\.(branch|leaves))?$/.exec(material.name || '');
    const role = match?.[1], source = byRole.get(role);
    if (source) {
      material.extras = { ...(material.extras || {}), openingStreetRole: role, openingStreetAoStrength: source.aoStrength ?? 0 };
      if (material.normalTexture) material.normalTexture.scale = source.normalStrength ?? 1;
      const pbr = material.pbrMetallicRoughness ||= {};
      pbr.roughnessFactor = source.roughnessFactor ?? 1;
      pbr.metallicFactor = source.metallicFactor ?? 0;
      if (pbr.metallicRoughnessTexture?.index != null) material.occlusionTexture = {
        index: pbr.metallicRoughnessTexture.index,
        ...(pbr.metallicRoughnessTexture.texCoord == null ? {} : { texCoord: pbr.metallicRoughnessTexture.texCoord }),
        strength: source.aoStrength ?? 0,
      };
    }
    const alphaMasked = role === 'smallTree' ? match?.[2] === 'leaves' : source?.alphaCutoff != null;
    if (alphaMasked) {
      material.alphaMode = 'MASK'; material.alphaCutoff = source?.alphaCutoff ?? 0.45;
    } else if (material.alphaMode === 'BLEND') material.alphaMode = 'MASK';
    material.emissiveFactor = [0, 0, 0]; delete material.emissiveTexture;
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
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let cursor = 2;
  while (cursor + 9 < bytes.length) {
    if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
    const marker = bytes[cursor + 1]; cursor += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(cursor);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3), format: 'jpeg' };
    }
    cursor += length;
  }
  return null;
}

function collectStats(bytes, json, bin) {
  const meshes = (json.meshes || []).map((mesh, index) => {
    let triangles = 0, vertices = 0;
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (const primitive of mesh.primitives || []) {
      if (!Number.isInteger(primitive.indices) || !Number.isInteger(primitive.attributes?.POSITION)
        || !Number.isInteger(primitive.attributes?.NORMAL) || !Number.isInteger(primitive.attributes?.TEXCOORD_0)) fail(`${mesh.name}: incomplete indexed primitive`);
      triangles += json.accessors[primitive.indices].count / 3;
      const position = json.accessors[primitive.attributes.POSITION]; vertices += position.count;
      for (let axis = 0; axis < 3; axis += 1) { low[axis] = Math.min(low[axis], position.min[axis]); high[axis] = Math.max(high[axis], position.max[axis]); }
    }
    return { index, name: mesh.name, triangles, vertices, primitives: mesh.primitives.length, bounds: { min: low, max: high } };
  });
  const images = (json.images || []).map((image, index) => {
    if (!Number.isInteger(image.bufferView)) fail(`image ${index} is not embedded`);
    const view = json.bufferViews[image.bufferView], start = view.byteOffset || 0;
    const size = imageSize(bin.subarray(start, start + view.byteLength));
    if (!size) fail(`image ${index} is not PNG or JPEG`);
    return { index, name: image.name || `image-${index}`, mimeType: image.mimeType, bytes: view.byteLength, ...size };
  });
  const totalTriangles = meshes.reduce((sum, mesh) => sum + mesh.triangles, 0);
  const estimatedMipmappedTextureBytes = Math.ceil(images.reduce((sum, image) => sum + image.width * image.height * 4, 0) * 4 / 3);
  return { bytes: bytes.length, sha256: sha256(bytes), totalTriangles, textureCount: images.length, estimatedMipmappedTextureBytes, meshes, images };
}

function assertOutput(stats, json) {
  if (stats.bytes > manifest.limits.bytes) fail(`${stats.bytes} bytes exceeds ${manifest.limits.bytes}`);
  if (stats.totalTriangles > manifest.limits.triangles) fail(`${stats.totalTriangles} triangles exceeds ${manifest.limits.triangles}`);
  if (stats.estimatedMipmappedTextureBytes > manifest.limits.estimatedMipmappedTextureBytes) fail('estimated texture allocation exceeds limit');
  if (stats.images.some((image) => Math.max(image.width, image.height) > manifest.limits.textureDimension)) fail('texture dimension limit exceeded');
  if (JSON.stringify(stats.meshes.map((mesh) => mesh.name)) !== JSON.stringify(EXPECTED_MESHES)) fail(`mesh catalogue mismatch: ${stats.meshes.map((mesh) => mesh.name).join(', ')}`);
  const gameplayDraws = stats.meshes.filter((mesh) => mesh.name !== 'opening_street_review_plate').reduce((sum, mesh) => sum + mesh.primitives, 0);
  if (gameplayDraws > manifest.limits.mainPassDrawCalls) fail(`${gameplayDraws} gameplay primitives exceeds draw-call limit`);
  if ((json.materials || []).some((material) => !['OPAQUE', 'MASK'].includes(material.alphaMode || 'OPAQUE'))) fail('unsupported alpha mode survived sanitisation');
  const roles = new Set((json.materials || []).map((material) => material.extras?.openingStreetRole).filter(Boolean));
  for (const source of manifest.sources) if (!roles.has(source.role)) fail(`runtime material role missing: ${source.role}`);
}

async function main() {
  if (!fs.existsSync(sourceDir)) fail(`source directory does not exist: ${sourceDir}`);
  if (!fs.existsSync(blender)) fail(`Blender executable does not exist: ${blender}`);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunk-surfer-opening-street-'));
  const textureDir = path.join(workDir, 'textures'), sourceRoot = path.join(workDir, 'sources');
  const blenderReportPath = path.join(workDir, 'blender-report.json');
  fs.mkdirSync(textureDir, { recursive: true });
  const sourceReports = [];
  try {
    for (const source of manifest.sources) {
      const archive = path.join(sourceDir, source.archive);
      if (!fs.existsSync(archive)) fail(`missing source archive ${archive}`);
      const actual = fileSha256(archive);
      if (actual !== source.sha256) fail(`${source.archive}: sha256 ${actual} != ${source.sha256}`);
      const extracted = path.join(sourceRoot, source.role); safeExtract(archive, extracted);
      const blend = path.join(extracted, source.blend);
      if (!fs.existsSync(blend)) fail(`${source.role}: missing ${source.blend}`);
      const textures = await normaliseSource(source, extracted, textureDir, workDir);
      sourceReports.push({ role: source.role, source: source.source, archive: source.archive, sha256: actual, blend: source.blend, textures });
      console.log(`OPENING SOURCE ${source.role}: verified and normalised`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
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
    const gameplayDrawCalls = stats.meshes.filter((mesh) => mesh.name !== 'opening_street_review_plate').reduce((sum, mesh) => sum + mesh.primitives, 0);
    const fullStats = { file: path.basename(output), ...stats, gameplayDrawCalls, limits: manifest.limits, materialAreas: blenderReport.materialAreas, tree: blenderReport.tree };
    const sources = manifest.sources.map((source) => ({
      role: source.role, sourceName: source.source, sourceUrl: source.url, license: source.license,
      licenseUrl: source.licenseUrl, archive: source.archive, archiveSha256: source.sha256,
      sourceResolution: 4096, runtimeResolution: { albedo: source.albedoResolution, normalOrm: source.dataResolution },
      uvScaleMetres: source.metresPerTile ?? null, targetHeight: source.targetHeight ?? null,
      colorSpace: source.colorSpace, normalStrength: source.normalStrength, aoStrength: source.aoStrength,
      heightTreatment: 'build metadata only; no runtime displacement', maps: source.maps,
    }));
    const credits = { file: path.basename(output), pack: { sha256: stats.sha256, bytes: stats.bytes, triangles: stats.totalTriangles }, license: manifest.license, sources };
    const artifact = { generatedAt: new Date().toISOString(), file: path.basename(output), build: fullStats, sources, ingestion: sourceReports, credits: sources };
    fs.writeFileSync(statsPath, `${JSON.stringify(fullStats, null, 2)}\n`);
    fs.writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true }); fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`Opening street: ${(stats.bytes / 1048576).toFixed(2)} MiB, ${stats.totalTriangles} triangles, ${stats.textureCount} textures, ${gameplayDrawCalls} gameplay draws.`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

await main();
