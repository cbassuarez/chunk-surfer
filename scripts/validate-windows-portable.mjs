#!/usr/bin/env node

import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbiddenLensFiles } from './validate-lean-bundle.mjs';

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

export function validateWindowsPortable(appDirectory) {
  const appDir = path.resolve(appDirectory);
  if (!existsSync(appDir) || !lstatSync(appDir).isDirectory()) {
    fail(`application folder is missing: ${appDir}`);
  }
  const exeBytes = requiredFile(path.join(appDir, 'chunk-surfer.exe'), 'chunk-surfer.exe');
  const eulaBytes = requiredFile(path.join(appDir, 'EULA.md'), 'EULA.md');
  requiredFile(path.join(appDir, 'README.txt'), 'README.txt');
  if (existsSync(path.join(appDir, 'steam_api64.dll'))) requiredFile(path.join(appDir, 'steam_api64.dll'), 'steam_api64.dll');
  if (existsSync(path.join(appDir, 'steam_appid.txt'))) fail('steam_appid.txt is a local launch file and must not ship');
  const forbidden = findForbiddenLensFiles(appDir);
  if (forbidden.length) fail(`bundled Stable Diffusion content: ${forbidden.join(', ')}`);
  return { appDir, exeBytes, eulaBytes };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const appDir = process.argv[2] || path.join(process.cwd(), 'release', 'windows', 'Chunk Surfer');
  console.log(JSON.stringify(validateWindowsPortable(appDir)));
}
