#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

const targets = Object.freeze({
  macos: {
    name: 'macOS Apple Silicon',
    // macOS 14 runners retired on 2026-11-02; macos-15 is the current
    // Apple Silicon image.
    platform: 'macos-15',
    artifact: 'chunk-surfer-macos-arm64',
    target: 'aarch64-apple-darwin',
    rust_target: 'aarch64-apple-darwin',
    args: '--target aarch64-apple-darwin --bundles dmg',
    bundle_glob: 'src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg',
  },
  windows: {
    name: 'Windows x64',
    // windows-latest now ships the VS 18 Enterprise toolchain, whose link.exe
    // chokes on rustc 1.98's rlib templates; windows-2022 keeps the VS 17
    // toolchain the last green release (2026-11-02) built with.
    platform: 'windows-2022',
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
