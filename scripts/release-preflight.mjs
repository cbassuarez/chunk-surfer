#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expectedTag = process.argv[2] || 'v0.1.0-beta.3';
if (!/^v\d+\.\d+\.\d+-beta\.\d+$/.test(expectedTag)) {
  throw new Error(`Expected a beta SemVer tag, received ${expectedTag}`);
}
const expectedVersion = expectedTag.slice(1);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const vite = readFileSync('vite.config.js', 'utf8');

const versions = { package: pkg.version, tauri: tauri.version, cargo: cargoVersion };
for (const [source, version] of Object.entries(versions)) {
  if (version !== expectedVersion) {
    throw new Error(`${source} version is ${version}; ${expectedTag} requires ${expectedVersion}`);
  }
}
if (!workflow.includes('src-tauri/tauri.lens.conf.json')) {
  throw new Error('release workflow does not merge the mandatory lens bundle config');
}
if (!workflow.includes('build_bundle.py --target')) {
  throw new Error('release workflow does not build target-specific lens sidecars');
}
if (!vite.includes('__APP_VERSION__') || !vite.includes('package.json')) {
  throw new Error('runtime About/version display is not sourced from the package release version');
}

if (process.env.CI !== 'true') {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (dirty) {
    throw new Error('worktree is not clean; commit the verified Beta 3 source before tagging');
  }
}

console.log(`Beta release preflight passed for ${expectedTag}.`);
