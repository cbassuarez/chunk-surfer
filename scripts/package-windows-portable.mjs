#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateWindowsPortable } from './validate-windows-portable.mjs';

const root = process.cwd();
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const target = 'x86_64-pc-windows-msvc';
const appName = 'Chunk Surfer';
const releaseRoot = path.join(root, 'release', 'windows');
const appDir = path.join(releaseRoot, appName);
const exe = path.join(root, 'src-tauri', 'target', 'release', 'chunk-surfer.exe');
const sidecar = path.join(root, 'src-tauri', 'binaries', `chunk-lens-${target}.exe`);
const resources = path.join(root, 'src-tauri', 'lens-resources', 'lens');

for (const [label, file] of Object.entries({ exe, sidecar, resources })) {
  if (!existsSync(file)) {
    throw new Error(`Missing Windows portable ${label}: ${file}`);
  }
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(exe, path.join(appDir, 'chunk-surfer.exe'));
cpSync(sidecar, path.join(appDir, 'chunk-lens.exe'));
cpSync(resources, path.join(appDir, 'lens'), { recursive: true });
writeFileSync(
  path.join(appDir, 'README.txt'),
  [
    `${appName} ${version}`,
    '',
    'Extract the complete Chunk Surfer folder before running. Do not run the game from Windows Explorer\'s zip preview.',
    'Run chunk-surfer.exe from the extracted folder.',
    'Keep chunk-lens.exe and the lens folder next to the game executable; they are the bundled offline lens runtime.',
    'Requires Windows x64, Microsoft Edge WebView2 Runtime, and an NVIDIA CUDA-capable GPU with a compatible driver.',
    '',
  ].join('\r\n'),
);

const validation = validateWindowsPortable(appDir);
console.log(`Prepared Windows portable app at ${path.relative(root, appDir)} (${validation.manifestFiles} manifest files verified)`);
