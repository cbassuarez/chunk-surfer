#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`Invalid Windows portable payload: ${message}`);
}

function requiredFile(file, label) {
  if (!existsSync(file)) fail(`${label} is missing`);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} is not a regular file`);
  if (stat.size === 0) fail(`${label} is empty`);
  return stat.size;
}

// Chunked for the same reason as scripts/validate-lens-bundle-contract.mjs: the
// manifest covers the offline lens payload, and readFileSync cannot return a
// Buffer over two gigabytes. Latent here rather than observed -- the v0.2.0
// Windows job failed at the test step before it ever reached this -- but it is
// the same payload that broke Linux at 4,023,938,128 bytes.
const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

function sha256(file) {
  const hash = createHash('sha256');
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    let read = 0;
    while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(read === buffer.length ? buffer : buffer.subarray(0, read));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function manifestFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':')) {
    fail('manifest contains an unsafe relative path');
  }
  const pieces = relative.split('/');
  if (pieces.some((piece) => !piece || piece === '.' || piece === '..')) {
    fail(`manifest contains an unsafe relative path: ${relative}`);
  }
  const resolved = path.resolve(root, ...pieces);
  const boundary = path.relative(root, resolved);
  if (!boundary || boundary.startsWith(`..${path.sep}`) || path.isAbsolute(boundary)) {
    fail(`manifest path escapes lens/: ${relative}`);
  }
  return resolved;
}

export function validateWindowsPortable(appDirectory) {
  const appDir = path.resolve(appDirectory);
  if (!existsSync(appDir) || !lstatSync(appDir).isDirectory()) {
    fail(`application folder is missing: ${appDir}`);
  }

  const exeBytes = requiredFile(path.join(appDir, 'chunk-surfer.exe'), 'chunk-surfer.exe');
  const sidecarBytes = requiredFile(path.join(appDir, 'chunk-lens.exe'), 'chunk-lens.exe');
  requiredFile(path.join(appDir, 'README.txt'), 'README.txt');

  const lensDir = path.join(appDir, 'lens');
  if (!existsSync(lensDir) || !lstatSync(lensDir).isDirectory()) fail('lens/ is missing');
  const modelRoot = path.join(lensDir, 'models');
  if (!existsSync(modelRoot) || !lstatSync(modelRoot).isDirectory()) fail('lens/models/ is missing');

  const manifestPath = path.join(lensDir, 'manifest.json');
  requiredFile(manifestPath, 'lens/manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`lens/manifest.json is malformed (${error.message})`);
  }
  if (manifest.schema !== 1 || manifest.serviceSchema !== 2 || manifest.cacheSchema !== 3 ||
      manifest.serviceRevision !== 'r16-seamless-banks' || manifest.modelId !== 'sd15-hyper4') {
    fail('lens/manifest.json describes an incompatible runtime');
  }
  const entries = Object.entries(manifest.files || {});
  if (entries.length === 0) fail('lens/manifest.json has no files');

  const actual = {};
  let resourceBytes = 0;
  for (const [relative, expected] of entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!/^[0-9a-f]{64}$/.test(expected)) fail(`manifest checksum is invalid: ${relative}`);
    const file = manifestFile(lensDir, relative);
    resourceBytes += requiredFile(file, `lens/${relative}`);
    const digest = sha256(file);
    if (digest !== expected) fail(`checksum mismatch: lens/${relative}`);
    actual[relative] = digest;
  }
  const aggregate = createHash('sha256').update(JSON.stringify(actual)).digest('hex');
  if (aggregate !== manifest.weightsSha256) fail('aggregate model checksum mismatch');

  return {
    appDir,
    manifestFiles: entries.length,
    exeBytes,
    sidecarBytes,
    resourceBytes,
    weightsSha256: aggregate,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const appDir = process.argv[2] || path.join(process.cwd(), 'release', 'windows', 'Chunk Surfer');
  console.log(JSON.stringify(validateWindowsPortable(appDir)));
}
