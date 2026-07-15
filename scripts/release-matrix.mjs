#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

const targets = Object.freeze({
  macos: {
    name: 'macOS Apple Silicon',
    platform: 'macos-14',
    artifact: 'chunk-surfer-macos-arm64',
    target: 'aarch64-apple-darwin',
    rust_target: 'aarch64-apple-darwin',
    args: '--target aarch64-apple-darwin --bundles dmg',
    bundle_glob: 'src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg',
  },
  windows: {
    name: 'Windows x64',
    platform: 'windows-latest',
    artifact: 'chunk-surfer-windows-x64',
    target: 'x86_64-pc-windows-msvc',
    rust_target: 'x86_64-pc-windows-msvc',
    args: '--no-bundle',
    bundle_glob: 'release/windows/*.zip',
  },
  linux: {
    name: 'Linux x64',
    platform: 'ubuntu-22.04',
    artifact: 'chunk-surfer-linux-x64',
    target: 'x86_64-unknown-linux-gnu',
    rust_target: 'x86_64-unknown-linux-gnu',
    args: '--bundles appimage,deb',
    bundle_glob: [
      'src-tauri/target/release/bundle/appimage/*.AppImage',
      'src-tauri/target/release/bundle/deb/*.deb',
    ].join('\n'),
  },
});

const requested = process.env.RELEASE_PLATFORM || 'all';
const publish = process.env.RELEASE_PUBLISH === 'true';
if(requested !== 'all' && !Object.hasOwn(targets,requested)){
  throw new Error(`Unknown release platform ${requested}`);
}
if(publish && requested !== 'all'){
  throw new Error('Publishing requires the complete macOS, Windows, and Linux matrix');
}

const include = requested === 'all' ? Object.values(targets) : [targets[requested]];
const matrix = JSON.stringify({include});
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`matrix=${matrix}\n`);
else process.stdout.write(`${matrix}\n`);
