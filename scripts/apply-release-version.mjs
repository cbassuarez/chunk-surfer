#!/usr/bin/env node

// One-stop version propagation for release builds.
//
// The release workflow takes one version field (with or without a leading
// `v`) and this script writes it into every file that carries it, so the
// requested version, the built binaries and the release tag all agree without
// hand-editing five files:
//
//   package.json, package-lock.json, src-tauri/Cargo.toml,
//   src-tauri/Cargo.lock, src-tauri/tauri.conf.json
//
// A missing CHANGELOG.md section for the version gets a placeholder, because
// release-preflight refuses to validate a version without release notes and
// the GitHub prerelease job reads its notes from that section. Replace the
// placeholder before a real publish.
//
// Under GitHub Actions the script also exports RELEASE_VERSION and
// RELEASE_TAG (v-prefixed) through GITHUB_ENV for the remaining steps.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const requested = String(process.argv[2] || '').trim();
const version = requested.replace(/^v(?=\d)/, '');
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)) {
  console.error(
    `Invalid release version ${JSON.stringify(requested)}: expected vX.Y.Z, vX.Y.Z-beta.N, X.Y.Z or X.Y.Z-beta.N`,
  );
  process.exit(1);
}

const failures = [];
const changed = [];

function rewrite(file, edit, verify = () => {}) {
  const source = readFileSync(file, 'utf8');
  let next;
  try {
    next = edit(source);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
    return;
  }
  try {
    verify(next);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
    return;
  }
  // Already at the requested version: nothing to write, nothing failed.
  if (next !== source) {
    writeFileSync(file, next);
    changed.push(file);
  }
}

// package.json: the root "version" is the first occurrence in the file.
rewrite(
  'package.json',
  (source) => {
    const pattern = /"version":\s*"[^"]+"/;
    if (!pattern.test(source)) throw new Error('no root version line');
    return source.replace(pattern, `"version": "${version}"`);
  },
  (source) => JSON.parse(source),
);

// package-lock.json: the root version first, then the packages[""] entry.
rewrite(
  'package-lock.json',
  (source) => {
    const pattern = /"version":\s*"[^"]+"/;
    if (!pattern.test(source)) throw new Error('no root version line');
    const next = source.replace(pattern, `"version": "${version}"`);
    const marker = '"": {';
    const at = next.indexOf(marker);
    if (at === -1) throw new Error('no packages[""] entry');
    if (!pattern.test(next.slice(at))) throw new Error('no packages[""] version line');
    return next.slice(0, at) + next.slice(at).replace(pattern, `"version": "${version}"`);
  },
  (source) => JSON.parse(source),
);

// Cargo.toml: the package version is the only line-start `version =` line;
// dependency versions are inline shorthand or inside `{ ... }` braces.
rewrite('src-tauri/Cargo.toml', (source) => {
  const pattern = /^version = "[^"]+"/m;
  if (!pattern.test(source)) throw new Error('no package version line');
  return source.replace(pattern, `version = "${version}"`);
});

// Cargo.lock: the entry for the workspace's own package.
rewrite('src-tauri/Cargo.lock', (source) => {
  // Git for Windows checks text files out CRLF; the lockfile match must accept
  // either ending or the Windows release job fails at the first rewrite.
  const pattern = /(name = "chunk-surfer"\r?\nversion = )"[^"]+"/;
  if (!pattern.test(source)) throw new Error('no chunk-surfer package entry');
  return source.replace(pattern, `$1"${version}"`);
});

rewrite(
  'src-tauri/tauri.conf.json',
  (source) => {
    const pattern = /"version":\s*"[^"]+"/;
    if (!pattern.test(source)) throw new Error('no root version line');
    return source.replace(pattern, `"version": "${version}"`);
  },
  (source) => JSON.parse(source),
);

function ensureChangelogSection() {
  const file = 'CHANGELOG.md';
  const source = readFileSync(file, 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|\\r?\\n)## ${escaped}(?:\\s|$)`).test(source)) return;
  const stub = [
    `## ${version}`,
    '',
    `Automated pipeline placeholder notes for version ${version}. The release`,
    'workflow wrote this section because the version field was bumped before',
    'the changelog described it. Replace these lines with the real changes',
    'before publishing this version.',
    '',
  ].join('\n');
  const firstSection = source.search(/\r?\n## /);
  const next =
    firstSection === -1
      ? source.replace(/\s*$/, `\n\n${stub}`)
      : source.slice(0, firstSection) + `\n\n${stub}` + source.slice(firstSection);
  writeFileSync(file, next);
  changed.push(file);
}
ensureChangelogSection();

if (process.env.GITHUB_ENV) {
  writeFileSync(process.env.GITHUB_ENV, `RELEASE_VERSION=${version}\nRELEASE_TAG=v${version}\n`, { flag: 'a' });
}

if (failures.length) {
  console.error(failures.map((failure) => `apply-release-version: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(
  changed.length
    ? `Applied version ${version} (tag v${version}) to: ${changed.join(', ')}`
    : `Version ${version} (tag v${version}) is already applied everywhere.`,
);
