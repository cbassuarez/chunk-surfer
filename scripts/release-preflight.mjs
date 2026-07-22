#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expectedTag = process.argv[2] || 'v0.1.1-beta.10';
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
const portablePackager = readFileSync('scripts/package-windows-portable.mjs', 'utf8');
const portableValidator = readFileSync('scripts/validate-windows-portable.mjs', 'utf8');
const vite = readFileSync('vite.config.js', 'utf8');
const eula = readFileSync('LEGAL/EULA.md', 'utf8');
const lensNotices = readFileSync('THIRD_PARTY_LENS_NOTICES.md', 'utf8');
const buildBundle = readFileSync('tools/chunk_surfer/diffusion_server/build_bundle.py', 'utf8');
const taesdMit = readFileSync('third_party/licenses/TAESD-MIT.txt', 'utf8');
const surfacesManifest = JSON.parse(readFileSync('public/assets/surfaces/surfaces.json', 'utf8'));

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
if (!pkg.scripts?.['windows:validate']?.includes('validate-windows-portable.mjs')) {
  throw new Error('Windows portable payload validator script is missing');
}
if (!portablePackager.includes('validateWindowsPortable(appDir)') || !portableValidator.includes('weightsSha256')) {
  throw new Error('Windows portable packaging must validate the staged payload and model manifest');
}
if (!workflow.includes('Expand-Archive') || !workflow.includes('$verifyRoot/Chunk Surfer')) {
  throw new Error('Windows release workflow must validate a clean extraction of the portable zip');
}
if (!workflow.includes('Prepare release upload assets') || !workflow.includes('split -b 1900M')) {
  throw new Error('release workflow must split assets that exceed GitHub release file limits');
}
if (!workflow.includes('gh release delete-asset')) {
  throw new Error('release workflow must clear stale prerelease assets before uploading the current set');
}
if (!workflow.includes('third_party/licenses/*')) {
  throw new Error('release workflow lens cache key must include tracked third-party license files');
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
const lensResources = lensTauri.bundle?.resources || {};
if (lensResources['../LEGAL/EULA.md'] !== 'EULA.md') {
  throw new Error('bundled Tauri resources must ship LEGAL/EULA.md as EULA.md');
}
if (!eula.includes('Mandatory model-use restrictions') || !eula.includes('Stable Diffusion 1.5') || !eula.includes('TAESD')) {
  throw new Error('EULA must carry bundled model stack restrictions and identify the local model resources');
}
if (!/^Version:\s*\S+/m.test(eula)) {
  throw new Error('EULA must carry a Version: line; acceptance is recorded against it');
}
// Bundling the agreement is distribution. OpenRAIL-M also requires notice, so
// the build must ship a gate that presents it before the model does any work.
{
  const mainSource = readFileSync('src/main.js', 'utf8');
  const eulaText = readFileSync('src/game/eula-text.js', 'utf8');
  if (!eulaText.includes('LEGAL/EULA.md?raw')) {
    throw new Error('the licence screen must render the bundled LEGAL/EULA.md, not a copy');
  }
  if (!mainSource.includes('eulaAccepted(getMeta(),EULA_TEXT)') || !mainSource.includes('makeEulaScene')) {
    throw new Error('boot must gate lens calibration behind EULA acceptance');
  }
  if (mainSource.indexOf('makeEulaScene') > mainSource.indexOf('pushCalibration()')) {
    throw new Error('the EULA gate must be presented before lens calibration runs');
  }
}
if (!buildBundle.includes('TAESD-MIT.txt') || !taesdMit.includes('Copyright (c) 2023 Ollin Boer Bohan')) {
  throw new Error('lens bundle must distribute the full TAESD MIT notice');
}
for (const required of [
  '451f4fe16113bff5a5d2269ed5ad43b0592e9a14',
  'bc08d970a87c74c71209491d64e3525845698863',
  '539f99181d33db39cf1af2e517cd8056785f0a87',
  '614f76814bbe30edbe2e627ace1c2234c81a2c0e',
  'lens/CREATIVEML_OPEN_RAIL_M.txt',
  'lens/TAESD-MIT.txt',
]) {
  if (!lensNotices.includes(required)) {
    throw new Error(`third-party lens notices are missing ${required}`);
  }
}
const surfaceEntries = Object.values(surfacesManifest.surfaces || {});
if (surfaceEntries.length < 10 || !surfaceEntries.every((surface) =>
  surface.source?.startsWith('Poly Haven: ') &&
  surface.sourcePackage?.endsWith('_4k.blend.zip') &&
  surface.sourceUrl?.startsWith('https://polyhaven.com/a/') &&
  surface.license === 'CC0' &&
  surface.licenseUrl === 'https://polyhaven.com/license'
)) {
  throw new Error('all architectural PBR surfaces must be documented as Poly Haven CC0 sources');
}
if (/Poliigon_|StoneBricksSplitface001|TilesSquarePoolMixed001|TilesTravertine001|RammedEarth018/.test(JSON.stringify(surfacesManifest))) {
  throw new Error('surface manifest still references replaced Poliigon or SketchUp Texture Club sources');
}

if (process.env.CI !== 'true') {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (dirty) {
    throw new Error(`worktree is not clean; commit the verified ${expectedTag} source before tagging`);
  }
}

console.log(`Beta release preflight passed for ${expectedTag}.`);
