import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const cliArgs = process.argv.slice(2);
const root = resolve(cliArgs.find((arg) => !arg.startsWith('--')) || 'src-tauri/steamworks-runtime');
const platformArg = cliArgs.find((arg) => arg.startsWith('--platform='))?.split('=')[1] || process.platform;
if (!existsSync(root)) {
  console.error(`package path does not exist: ${root}`);
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(root);

if (files.some((path) => basename(path).toLowerCase() === 'steam_appid.txt')) {
  console.error('steam_appid.txt must never be included in a shipped package');
  process.exit(1);
}
const expectedByPlatform = {
  win32: 'steam_api64.dll',
  darwin: 'libsteam_api.dylib',
  linux: 'libsteam_api.so',
};
const expected = expectedByPlatform[platformArg];
if (!expected) {
  console.error(`unsupported Steamworks target: ${platformArg}`);
  process.exit(2);
}
const found = files.filter((path) => basename(path) === expected);
if (!found.length) {
  console.error(`Steamworks redistributable is missing from the package: ${expected}`);
  process.exit(1);
}
console.log(`Steamworks package verified: ${found.map((path) => basename(path)).join(', ')}`);
