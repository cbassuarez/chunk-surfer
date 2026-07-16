#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
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

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
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
  if (manifest.schema !== 1 || manifest.serviceSchema !== 2 || manifest.modelId !== 'sd15-hyper4') {
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
