#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SERVER_DIR = join(ROOT, 'tools/chunk_surfer/diffusion_server');
const RUNTIME_SOURCE_FILES = Object.freeze([
  'cache_contract.py',
  'dream.py',
  'pipeline.py',
  'protocol.py',
  'requirements-local.txt',
  'server.py',
]);

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function sourceAggregate() {
  const files = Object.fromEntries(RUNTIME_SOURCE_FILES.map((name) => [
    name,
    sha256File(join(SERVER_DIR, name)),
  ]));
  const canonical = `{${Object.keys(files).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(files[key])}`).join(',')}}`;
  return sha256Bytes(canonical);
}

function pythonContract() {
  const source = readFileSync(join(SERVER_DIR, 'protocol.py'), 'utf8');
  const number = (name) => Number(source.match(new RegExp(`^${name}\\s*=\\s*(\\d+)`, 'm'))?.[1]);
  const string = (name) => source.match(new RegExp(`^${name}\\s*=\\s*["']([^"']+)["']`, 'm'))?.[1];
  return {
    serviceSchema: number('SERVICE_SCHEMA'),
    cacheSchema: number('CACHE_SCHEMA'),
    serviceRevision: string('SERVER_REV'),
    modelId: string('MODEL_ID'),
  };
}

function hostTarget() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-gnu';
  throw new Error(`No packaged lens target for ${process.platform}-${process.arch}`);
}

function fail(message, target) {
  const command = target === 'aarch64-apple-darwin'
    ? 'npm run lens:bundle:mac'
    : `python tools/chunk_surfer/diffusion_server/build_bundle.py --target ${target}`;
  throw new Error(`${message}. Rebuild it from this checkout with: ${command}`);
}

const target = process.argv.find((value) => value.startsWith('--target='))?.slice('--target='.length) || hostTarget();
const suffix = target.includes('windows') ? '.exe' : '';
const binary = join(ROOT, 'src-tauri/binaries', `chunk-lens-${target}${suffix}`);
const stampPath = `${binary}.contract.json`;
const manifestPath = join(ROOT, 'src-tauri/lens-resources/lens/manifest.json');

for (const path of [binary, stampPath, manifestPath]) {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    fail(`Packaged lens artifact is missing (${basename(path)})`, target);
  }
}

const expected = pythonContract();
const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const [key, value] of Object.entries(expected)) {
  if (stamp[key] !== value) fail(`Lens binary contract has stale ${key} (${stamp[key]} != ${value})`, target);
  if (manifest[key] !== value) fail(`Lens resource manifest has stale ${key} (${manifest[key]} != ${value})`, target);
}
if (stamp.schema !== 1 || stamp.target !== target) fail('Lens binary contract stamp is incompatible', target);
if (stamp.runtimeSourceSha256 !== sourceAggregate()) fail('Lens binary was built from different runtime source', target);
if (stamp.binarySha256 !== sha256File(binary)) fail('Lens binary checksum does not match its build contract', target);

console.log(`Lens bundle contract verified for ${target} (${expected.serviceRevision}, cache schema ${expected.cacheSchema}).`);

