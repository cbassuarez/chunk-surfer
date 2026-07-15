#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expectedTag = process.argv[2] || 'v0.1.0-beta.6';
if (!/^v\d+\.\d+\.\d+-beta\.\d+$/.test(expectedTag)) {
  throw new Error(`Expected a beta SemVer tag, received ${expectedTag}`);
}
const expectedVersion = expectedTag.slice(1);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const lensTauri = JSON.parse(readFileSync('src-tauri/tauri.lens.conf.json', 'utf8'));
const windowsTauri = JSON.parse(readFileSync('src-tauri/tauri.windows.conf.json', 'utf8'));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const releaseMatrix = readFileSync('scripts/release-matrix.mjs', 'utf8');
const vite = readFileSync('vite.config.js', 'utf8');

const versions = { package: pkg.version, tauri: tauri.version, cargo: cargoVersion };
for (const [source, version] of Object.entries(versions)) {
  if (version !== expectedVersion) {
    throw new Error(`${source} version is ${version}; ${expectedTag} requires ${expectedVersion}`);
  }
}
if (!pkg.scripts?.['tauri:build']?.includes('src-tauri/tauri.lens.conf.json')) {
  throw new Error('tauri:build does not merge the mandatory lens bundle config');
}
if (!workflow.includes('build_bundle.py --target')) {
  throw new Error('release workflow does not build target-specific lens sidecars');
}
if (!workflow.includes('npm run tauri:build --')) {
  throw new Error('release workflow does not call the mandatory bundled Tauri build script');
}
const windowsJob = releaseMatrix.match(/windows: \{[\s\S]*?(?=\n  linux: \{)/)?.[0] || '';
if (!windowsJob.includes("args: '--no-bundle'")) {
  throw new Error('Windows release workflow must skip installer bundling and package the portable zip');
}
if (windowsJob.includes('nsis') || windowsJob.includes('msi')) {
  throw new Error('Windows release workflow must not build NSIS or MSI installers for the current offline lens payload');
}
if (!workflow.includes('scripts/package-windows-portable.mjs') || !workflow.includes('*windows-x64.zip')) {
  throw new Error('Windows release workflow must upload and verify the portable zip artifact');
}
if (!workflow.includes('Prepare release upload assets') || !workflow.includes('split -b 1900M')) {
  throw new Error('release workflow must split assets that exceed GitHub release file limits');
}
if (!workflow.includes('gh release delete-asset')) {
  throw new Error('release workflow must clear stale prerelease assets before uploading the current set');
}
const defaultTargets = tauri.bundle?.targets || [];
const lensTargets = lensTauri.bundle?.targets || [];
const windowsTargets = windowsTauri.bundle?.targets || [];
if (defaultTargets.includes('nsis')) {
  throw new Error('Default Tauri bundle targets must exclude NSIS');
}
if (lensTargets.includes('nsis')) {
  throw new Error('Lens Tauri bundle overlay must exclude NSIS');
}
if (windowsTargets.length !== 1 || windowsTargets[0] !== 'app') {
  throw new Error('Windows Tauri config must use the app target; release CI packages the portable zip itself');
}
if (!vite.includes('__APP_VERSION__') || !vite.includes('package.json')) {
  throw new Error('runtime About/version display is not sourced from the package release version');
}

if (process.env.CI !== 'true') {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (dirty) {
    throw new Error(`worktree is not clean; commit the verified ${expectedTag} source before tagging`);
  }
}

console.log(`Beta release preflight passed for ${expectedTag}.`);
