#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const expectedTag = process.argv[2] || `v${pkg.version}`;
// Every release up to 0.1.2 was a beta, and the guard only knew that shape.
// A plain vX.Y.Z is now a valid tag too; the beta suffix stays legal so a
// v0.2.1-beta.1 can still go out between releases.
if (!/^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(expectedTag)) {
  throw new Error(`Expected a SemVer release tag (vX.Y.Z or vX.Y.Z-beta.N), received ${expectedTag}`);
}
export const IS_PRERELEASE = /-beta\./.test(expectedTag);
const expectedVersion = expectedTag.slice(1);
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const windowsTauri = JSON.parse(readFileSync('src-tauri/tauri.windows.conf.json', 'utf8'));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const releaseMatrix = readFileSync('scripts/release-matrix.mjs', 'utf8');
const portablePackager = readFileSync('scripts/package-windows-portable.mjs', 'utf8');
const portableValidator = readFileSync('scripts/validate-windows-portable.mjs', 'utf8');
const vite = readFileSync('vite.config.js', 'utf8');
const eula = readFileSync('LEGAL/EULA.md', 'utf8');
const surfacesManifest = JSON.parse(readFileSync('public/assets/surfaces/surfaces.json', 'utf8'));

const packageLock=JSON.parse(readFileSync('package-lock.json','utf8'));
const cargoLock=readFileSync('src-tauri/Cargo.lock','utf8');
const cargoLockVersion=cargoLock.match(/\[\[package\]\]\nname = "chunk-surfer"\nversion = "([^"]+)"/)?.[1];
const versions = { package: pkg.version, packageLock: packageLock.version, packageLockRoot: packageLock.packages?.['']?.version, tauri: tauri.version, cargo: cargoVersion, cargoLock: cargoLockVersion };
for (const [source, version] of Object.entries(versions)) {
  if (version !== expectedVersion) {
    throw new Error(`${source} version is ${version}; ${expectedTag} requires ${expectedVersion}`);
  }
}
// Ordinary releases must stay independent of the local development lens, even
// if a developer has staged model resources or exported VITE_STABLE_DIFFUSION=1.
// Tauri embeds frontend assets into the executable. Inspecting only the outer
// .app/portable tree cannot detect a model accidentally copied into public/.
if (!/vite build\s*&&\s*npm run lean:verify -- dist$/.test(pkg.scripts?.build || '')) {
  throw new Error('production frontend build must reject SD payloads before Tauri embeds dist');
}
if (pkg.scripts?.['tauri:build'] !== 'tauri build') {
  throw new Error('tauri:build must use the lean base Tauri config without a lens overlay');
}
if (pkg.scripts?.['beta:build:mac']?.includes('lens:bundle') ||
    pkg.scripts?.['tauri:build:steam']?.includes('tauri.lens.conf.json')) {
  throw new Error('release build scripts must never package model resources');
}
if (existsSync('src-tauri/tauri.lens.conf.json') ||
    tauri.bundle?.externalBin?.length ||
    Object.keys(tauri.bundle?.resources || {}).some((key) => /lens-resources|models|chunk-lens/i.test(key))) {
  throw new Error('Tauri production bundle still contains a Stable Diffusion payload');
}
if (/build_bundle\.py|install_torch\.py|lens-bundle-v2|tauri\.lens\.conf\.json/.test(workflow)) {
  throw new Error('release workflow still installs or bundles Stable Diffusion');
}
if (!workflow.includes('npm run tauri:build --') || !workflow.includes('npm run lean:verify --')) {
  throw new Error('release workflow must build and validate lean Tauri artifacts');
}
const windowsJob = releaseMatrix.match(/windows: \{[\s\S]*?(?=\n  linux: \{)/)?.[0] || '';
if (!windowsJob.includes("args: '--no-bundle'")) {
  throw new Error('Windows release workflow must skip installer bundling and package the portable zip');
}
if (windowsJob.includes('nsis') || windowsJob.includes('msi')) {
  throw new Error('Windows portable release must continue to avoid untested NSIS or MSI targets');
}
if (!workflow.includes('scripts/package-windows-portable.mjs') || !workflow.includes('*windows-x64.zip')) {
  throw new Error('Windows release workflow must upload and verify the portable zip artifact');
}
if (!pkg.scripts?.['windows:validate']?.includes('validate-windows-portable.mjs')) {
  throw new Error('Windows portable payload validator script is missing');
}
if (!portablePackager.includes('validateWindowsPortable(appDir)') ||
    !portableValidator.includes('findForbiddenLensFiles') ||
    !portablePackager.includes("cpSync(eula, path.join(appDir, 'EULA.md'))")) {
  throw new Error('Windows portable packaging must ship the general EULA and reject SD payloads');
}
if (workflow.includes('Compress-Archive')) {
  throw new Error('Windows portable zip creation must use the verified 7-Zip packaging path');
}
if (!workflow.includes('Get-Command 7z') || !workflow.includes('& $sevenZip a -tzip') || !workflow.includes('& $sevenZip t')) {
  throw new Error('Windows release workflow must create and verify the portable zip with 7-Zip');
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
const defaultTargets = tauri.bundle?.targets || [];
const windowsTargets = windowsTauri.bundle?.targets || [];
if (defaultTargets.includes('nsis')) {
  throw new Error('Default Tauri bundle targets must exclude NSIS');
}
if (windowsTargets.length !== 1 || windowsTargets[0] !== 'app') {
  throw new Error('Windows Tauri config must use the app target; release CI packages the portable zip itself');
}
if (!vite.includes('__APP_VERSION__') || !vite.includes('package.json')) {
  throw new Error('runtime About/version display is not sourced from the package release version');
}
const bundledResources = tauri.bundle?.resources || {};
if (bundledResources['../LEGAL/EULA.md'] !== 'EULA.md' ||
    bundledResources['steamworks-runtime/'] !== 'steamworks/') {
  throw new Error('base Tauri resources must retain the general EULA and optional Steamworks runtime');
}
if (!/^Version:\s*\S+/m.test(eula)) {
  throw new Error('EULA must carry a Version: line; acceptance is recorded against it');
}
{
  const mainSource = readFileSync('src/main.js', 'utf8');
  const policy = readFileSync('src/platform/stable-diffusion-policy.js', 'utf8');
  const eulaText = readFileSync('src/game/eula-text.js', 'utf8');
  if (!eulaText.includes('LEGAL/EULA.md?raw') ||
      !mainSource.includes('eulaAccepted(getMeta(),EULA_TEXT)')) {
    throw new Error('game EULA gate must use the shipped agreement');
  }
  if (!mainSource.includes('const SD_DEV_ENABLED=import.meta.env.DEV') ||
      !/if\(stableDiffusionOff\(\)\)\{afterCalibration\(\);return;\}/.test(mainSource) ||
      !mainSource.includes('if(!SD_DEV_ENABLED)return null') ||
      !policy.includes('if (!available')) {
    throw new Error('production startup must forbid lens services and bypass SD calibration');
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

// THE TAG HAS TO SAY WHAT IT IS.
//
// The release job builds its GitHub notes by reading the section for this
// version out of CHANGELOG.md. Checking it here rather than there means a tag
// with no notes fails before anything is built, instead of after four
// platforms have compiled and the itch channels have already been pushed.
const changelog = readFileSync('CHANGELOG.md', 'utf8');
// Split rather than match: a lookahead for "the next heading OR the end" needs
// the `m` flag for the heading and NOT for the end, and `$` under `m` matches
// the first line break, which silently returns an empty section for a file that
// has one.
const notes = changelog.split(/^## /m)
  .find((block) => new RegExp(`^${expectedVersion}(?:\\s|$)`).test(block))
  ?.split('\n').slice(1).join('\n').trim() || '';
if (!notes) {
  throw new Error(`CHANGELOG.md has no "## ${expectedVersion}" section; the release notes are read from it`);
}
if (notes.length < 120) {
  throw new Error(`the CHANGELOG.md section for ${expectedVersion} is too short to be release notes`);
}

if (process.env.CI !== 'true') {
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (dirty) {
    throw new Error(`worktree is not clean; commit the verified ${expectedTag} source before tagging`);
  }
}

console.log(`Release preflight passed for ${expectedTag} (${notes.split('\n').length} lines of notes).`);
