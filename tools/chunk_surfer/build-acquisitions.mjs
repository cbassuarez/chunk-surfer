// Reproducible wrapper for the thirteen Poly Haven acquisition models. Raw
// source archives stay outside the repository; the manifest fixes their hash,
// licence, conversion budget and runtime identity, while Blender produces the
// checked-in GLB and this file enforces the runtime's strict glTF subset.

import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = path.join(import.meta.dirname, 'acquisition-sources.json');
const BLENDER_SCRIPT = path.join(import.meta.dirname, 'build-acquisitions.py');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const sourceDir = process.env[manifest.sourceDirectoryEnv]
  || manifest.defaultSourceDirectory;
const output = path.join(ROOT, manifest.output);
const outputBase = output.replace(/\.glb$/i, '');
const statsPath = `${outputBase}.stats.json`;
const creditsPath = `${outputBase}.credits.json`;
const blender = process.env.BLENDER_BIN
  || (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');

function fail(message) {
  throw new Error(`acquisition pack: ${message}`);
}

function findChunks(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) fail('Blender did not produce GLB 2');
  if (bytes.readUInt32LE(8) !== bytes.length) fail('GLB header length is false');
  let cursor = 12;
  let json = null;
  let bin = null;
  while (cursor + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(cursor);
    const type = bytes.readUInt32LE(cursor + 4);
    const chunk = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 0x004e4942) bin = Buffer.from(chunk);
    cursor += 8 + length;
  }
  if (!json || !bin) fail('GLB is missing JSON or BIN chunk');
  return { json, bin };
}

function stripExtensions(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(stripExtensions);
    return;
  }
  delete value.extensions;
  for (const child of Object.values(value)) stripExtensions(child);
}

function sanitise(json) {
  delete json.extensionsUsed;
  delete json.extensionsRequired;
  delete json.animations;
  delete json.skins;
  stripExtensions(json);
  for (const material of json.materials || []) {
    if (material.alphaMode === 'BLEND') {
      material.alphaMode = 'MASK';
      material.alphaCutoff = material.alphaCutoff ?? 0.45;
    }
    material.emissiveFactor = [0, 0, 0];
    delete material.emissiveTexture;
  }
}

function buildGlb(json, bin) {
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonLength = Math.ceil(rawJson.length / 4) * 4;
  const binLength = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 4, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(0x20, 20, 20 + jsonLength);
  rawJson.copy(out, 20);
  const binHeader = 20 + jsonLength;
  out.writeUInt32LE(binLength, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(out, binHeader + 8);
  return out;
}

function pngSize(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  }
  return null;
}

function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let cursor = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (cursor + 9 < bytes.length) {
    if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
    const marker = bytes[cursor + 1];
    cursor += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(cursor);
    if (length < 2 || cursor + length > bytes.length) break;
    if (sof.has(marker)) {
      return { width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3), format: 'jpeg' };
    }
    cursor += length;
  }
  return null;
}

function imageStats(json, bin) {
  return (json.images || []).map((image, index) => {
    if (!Number.isInteger(image.bufferView)) fail(`image ${index} is not embedded`);
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    const bytes = bin.subarray(start, start + view.byteLength);
    const size = pngSize(bytes) || jpegSize(bytes);
    if (!size) fail(`image ${index} is not PNG or JPEG`);
    return { index, name: image.name || `image-${index}`, mimeType: image.mimeType, bytes: view.byteLength, ...size };
  });
}

function meshStats(json) {
  return (json.meshes || []).map((mesh, index) => {
    let triangles = 0;
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode != null && primitive.mode !== 4) fail(`${mesh.name}: triangles only`);
      if (!Number.isInteger(primitive.indices)) fail(`${mesh.name}: indices required`);
      if (!Number.isInteger(primitive.attributes?.POSITION) || !Number.isInteger(primitive.attributes?.NORMAL)) fail(`${mesh.name}: positions and normals required`);
      if (!Number.isInteger(primitive.attributes?.TEXCOORD_0)) fail(`${mesh.name}: texture coordinates required`);
      triangles += json.accessors[primitive.indices].count / 3;
      const position = json.accessors[primitive.attributes.POSITION];
      if (!position.min || !position.max) fail(`${mesh.name}: position bounds required`);
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], position.min[axis]);
        high[axis] = Math.max(high[axis], position.max[axis]);
      }
    }
    return {
      index,
      name: mesh.name || `mesh-${index}`,
      triangles,
      primitives: mesh.primitives?.length || 0,
      bounds: { min: low.map((value) => +value.toFixed(6)), max: high.map((value) => +value.toFixed(6)) },
    };
  });
}

function assertOutput(bytes, json, meshes, images) {
  const expected = new Set(manifest.sources.map((source) => source.mesh));
  const actual = new Set(meshes.map((mesh) => mesh.name));
  if (expected.size !== actual.size || [...expected].some((name) => !actual.has(name))) {
    fail(`mesh catalogue mismatch; expected ${[...expected].join(', ')}, got ${[...actual].join(', ')}`);
  }
  const totalTriangles = meshes.reduce((sum, mesh) => sum + mesh.triangles, 0);
  if (totalTriangles > manifest.limits.triangles) fail(`${totalTriangles} triangles exceeds ${manifest.limits.triangles}`);
  if (bytes.length > manifest.limits.bytes) fail(`${bytes.length} bytes exceeds ${manifest.limits.bytes}`);
  if (images.some((image) => Math.max(image.width, image.height) > manifest.limits.textureDimension)) fail('texture dimension limit exceeded');
  if (json.animations?.length || json.skins?.length || json.extensionsUsed?.length || json.extensionsRequired?.length) fail('unsupported runtime feature survived sanitisation');
  if ((json.materials || []).some((material) => !['OPAQUE', 'MASK'].includes(material.alphaMode || 'OPAQUE'))) fail('unsupported alpha mode survived sanitisation');
}

function writeMetadata(bytes, json, meshes, images, blenderReport) {
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const totalTriangles = meshes.reduce((sum, mesh) => sum + mesh.triangles, 0);
  const sources = manifest.sources.map((source) => {
    const mesh = meshes.find((entry) => entry.name === source.mesh);
    const build = blenderReport.meshes.find((entry) => entry.mesh === source.mesh);
    return {
      mesh: source.mesh,
      source: source.url,
      license: source.license,
      archive: source.archive,
      archiveSha256: source.sha256,
      anchor: source.anchor,
      triangleBudget: source.triangleBudget,
      sourceTriangles: build?.sourceTriangles,
      triangles: mesh?.triangles,
      bounds: mesh?.bounds,
      textureSize: source.textureSize,
    };
  });
  const stats = {
    file: path.basename(output),
    bytes: bytes.length,
    sha256,
    totalTriangles,
    textureCount: images.length,
    maxTextureDimension: Math.max(0, ...images.map((image) => Math.max(image.width, image.height))),
    limits: manifest.limits,
    meshes: Object.fromEntries(meshes.map((mesh) => [mesh.name, mesh])),
    images,
  };
  const credits = {
    file: path.basename(output),
    pack: { sha256, bytes: bytes.length, triangles: totalTriangles },
    licence: 'All source models are Poly Haven CC0 1.0 assets; conversion and placement metadata are project-authored.',
    sources,
  };
  fs.writeFileSync(statsPath, `${JSON.stringify(stats, null, 2)}\n`);
  fs.writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);
}

function main() {
  if (!fs.existsSync(sourceDir)) fail(`source directory does not exist: ${sourceDir}`);
  if (!fs.existsSync(blender)) fail(`Blender executable does not exist: ${blender}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunk-surfer-acquisitions-'));
  const reportPath = path.join(workDir, 'blender-report.json');
  try {
    const result = childProcess.spawnSync(blender, [
      '--background', '--factory-startup', '--python', BLENDER_SCRIPT, '--',
      '--manifest', MANIFEST_PATH,
      '--source-dir', sourceDir,
      '--work-dir', workDir,
      '--output', output,
      '--report', reportPath,
    ], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(`Blender exited ${result.status}`);
    if (!fs.existsSync(output) || !fs.existsSync(reportPath)) fail('Blender did not produce the pack and report');
    const first = findChunks(fs.readFileSync(output));
    sanitise(first.json);
    const sanitised = buildGlb(first.json, first.bin);
    fs.writeFileSync(output, sanitised);
    const final = findChunks(sanitised);
    const meshes = meshStats(final.json);
    const images = imageStats(final.json, final.bin);
    assertOutput(sanitised, final.json, meshes, images);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    writeMetadata(sanitised, final.json, meshes, images, report);
    console.log(`\nAcquisition pack: ${(sanitised.length / 1024 / 1024).toFixed(2)} MiB, ${meshes.reduce((sum, mesh) => sum + mesh.triangles, 0)} triangles, ${images.length} embedded textures.`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main();
