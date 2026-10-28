#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateWindowsPortable } from './validate-windows-portable.mjs';

const root = process.cwd();
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const appName = 'Chunk Surfer';
const releaseRoot = path.join(root, 'release', 'windows');
const appDir = path.join(releaseRoot, appName);
const exe = path.join(root, 'src-tauri', 'target', 'release', 'chunk-surfer.exe');
const eula = path.join(root, 'LEGAL', 'EULA.md');
const steamworks = path.join(root, 'src-tauri', 'steamworks-runtime', 'steam_api64.dll');

for (const [label, file] of Object.entries({ exe, eula })) {
  if (!existsSync(file)) throw new Error(`Missing Windows portable ${label}: ${file}`);
}

// Never reuse a staging directory from the old multi-gigabyte lens release.
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(exe, path.join(appDir, 'chunk-surfer.exe'));
cpSync(eula, path.join(appDir, 'EULA.md'));
if (existsSync(steamworks)) {
  // The SDK staging directory may hold several platforms and local launch
  // files. Only the optional Windows redistributable belongs in this archive.
  cpSync(steamworks, path.join(appDir, 'steam_api64.dll'));
}
writeFileSync(path.join(appDir, 'README.txt'), [
  `${appName} ${version}`,
  '',
  'Extract the complete Chunk Surfer folder before running. Do not run the game from Windows Explorer\'s zip preview.',
  'Run chunk-surfer.exe from the extracted folder.',
  'Uses the authored materials renderer. No Stable Diffusion model or NVIDIA CUDA GPU is required.',
  'Requires Windows x64 and Microsoft Edge WebView2 Runtime.',
  'To uninstall, quit and delete the extracted Chunk Surfer folder. This retains your saves.',
  'To erase progress, settings and local recordings first, choose Settings > Memory > Erase all data & restart on the title screen and confirm. Then quit and delete the folder.',
  '',
].join('\r\n'));

const validation = validateWindowsPortable(appDir);
console.log(`Prepared lean Windows portable app at ${path.relative(root, appDir)} (${validation.exeBytes} executable bytes)`);
