import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const args = process.argv.slice(2);
const sdkArg = args.find((arg) => !arg.startsWith('--')) || process.env.STEAMWORKS_SDK;
const platformArg = args.find((arg) => arg.startsWith('--platform='))?.split('=')[1];
const platform = platformArg || process.platform;

if (!sdkArg) {
  console.error('usage: npm run steamworks:stage -- /path/to/steamworks_sdk [--platform=all|darwin|win32|linux]');
  process.exit(2);
}

const sdk = resolve(sdkArg);
const specs = {
  darwin: ['redistributable_bin/osx/libsteam_api.dylib', 'libsteam_api.dylib'],
  win32: ['redistributable_bin/win64/steam_api64.dll', 'steam_api64.dll'],
  linux: ['redistributable_bin/linux64/libsteam_api.so', 'libsteam_api.so'],
};
const targets = platform === 'all' ? Object.keys(specs) : [platform];
if (targets.some((target) => !specs[target])) {
  console.error(`unsupported Steamworks target: ${platform}`);
  process.exit(2);
}

const roots = [sdk, resolve(sdk, 'sdk')];
const destinationDir = resolve('src-tauri/steamworks-runtime');
mkdirSync(destinationDir, { recursive: true });
for (const target of targets) {
  const spec = specs[target];
  const source = roots.map((root) => resolve(root, spec[0])).find(existsSync);
  if (!source) {
    console.error(`Steamworks redistributable not found: ${spec[0]}`);
    process.exit(1);
  }
  const destination = resolve(destinationDir, spec[1]);
  copyFileSync(source, destination);
  console.log(`staged ${basename(destination)} for ${target}`);
}
