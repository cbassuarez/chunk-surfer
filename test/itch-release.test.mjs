import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ITCH_CHANNELS,
  butlerArgs,
  findItchPayload,
  selectItchChannels,
  stageItchBuilds,
} from '../scripts/itch-release.mjs';

test('itch release channels match the beta storefront upload plan', () => {
  assert.deepEqual(ITCH_CHANNELS.map((entry) => entry.channel), [
    'win-beta',
    'mac-arm64-beta',
    'linux-appimage-beta',
    'linux-deb-beta',
  ]);
});

test('butler commands are previewable and publish package userversion', () => {
  assert.deepEqual(
    butlerArgs({ mode: 'preview', target: 'cbassuarez/chunk-surfer', channel: 'win-beta', dir: 'release/itch/win-beta', version: '0.1.0-beta.5' }),
    ['push-preview', '--changes-only', 'release/itch/win-beta', 'cbassuarez/chunk-surfer:win-beta'],
  );
  assert.deepEqual(
    butlerArgs({ mode: 'push', target: 'cbassuarez/chunk-surfer', channel: 'mac-arm64-beta', dir: 'release/itch/mac-arm64-beta', version: '0.1.0-beta.5' }),
    ['push', 'release/itch/mac-arm64-beta', 'cbassuarez/chunk-surfer:mac-arm64-beta', '--userversion', '0.1.0-beta.5'],
  );
  assert.throws(() => butlerArgs({ mode: 'push', target: '', channel: 'win-beta', dir: '.', version: '1' }), /ITCH_TARGET/);
});

test('itch staging finds expected platform payloads and writes channel markers', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chunk-surfer-itch-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.0-beta.5' }));
  mkdirSync(path.join(root, 'release', 'windows', 'Chunk Surfer'), { recursive: true });
  writeFileSync(path.join(root, 'release', 'windows', 'Chunk Surfer', 'chunk-surfer.exe'), 'exe');
  mkdirSync(path.join(root, 'release-assets'), { recursive: true });
  writeFileSync(path.join(root, 'release-assets', 'Chunk Surfer_0.1.0-beta.5_aarch64.dmg'), 'dmg');
  writeFileSync(path.join(root, 'release-assets', 'Chunk Surfer_0.1.0-beta.5_x64.AppImage'), 'appimage');
  writeFileSync(path.join(root, 'release-assets', 'chunk-surfer_0.1.0-beta.5_amd64.deb'), 'deb');

  const staged = stageItchBuilds({ root });
  assert.equal(staged.version, '0.1.0-beta.5');
  assert.equal(staged.staged.length, 4);
  for (const entry of staged.staged) {
    const marker = readFileSync(path.join(entry.dir, 'ITCH_CHANNEL.txt'), 'utf8');
    assert.match(marker, new RegExp(`Channel: ${entry.channel}`));
  }
});

test('itch payload lookup prefers Windows portable directory over zipped mirror asset', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chunk-surfer-itch-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.0-beta.5' }));
  const spec = ITCH_CHANNELS.find((entry) => entry.channel === 'win-beta');
  mkdirSync(path.join(root, 'release', 'windows', 'Chunk Surfer'), { recursive: true });
  writeFileSync(path.join(root, 'release', 'windows', 'Chunk Surfer', 'chunk-surfer.exe'), 'exe');
  const payload = findItchPayload(root, spec, [path.join(root, 'release-assets', 'chunk-surfer-v0.1.1-beta.7-windows-x64.zip')]);
  assert.equal(payload.type, 'directory');
  assert.match(payload.path, /Chunk Surfer$/);
});

test('itch staging can target a channel subset for local partial publishes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chunk-surfer-itch-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.0-beta.5' }));
  mkdirSync(path.join(root, 'release-assets'), { recursive: true });
  writeFileSync(path.join(root, 'release-assets', 'Chunk Surfer_0.1.0-beta.5_aarch64.dmg'), 'dmg');

  assert.deepEqual(selectItchChannels('mac-arm64-beta').map((entry) => entry.channel), ['mac-arm64-beta']);
  const staged = stageItchBuilds({ root, channels: 'mac-arm64-beta' });
  assert.deepEqual(staged.staged.map((entry) => entry.channel), ['mac-arm64-beta']);
});

test('itch staging rejects stale file payloads from older versions', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'chunk-surfer-itch-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.0-beta.5' }));
  mkdirSync(path.join(root, 'release-assets'), { recursive: true });
  writeFileSync(path.join(root, 'release-assets', 'Chunk Surfer_0.1.0_aarch64.dmg'), 'old dmg');

  assert.equal(
    findItchPayload(root, ITCH_CHANNELS.find((entry) => entry.channel === 'mac-arm64-beta')),
    null,
  );
  assert.throws(
    () => stageItchBuilds({ root, channels: 'mac-arm64-beta' }),
    /Missing itch payloads for 0\.1\.0-beta\.5[\s\S]*ITCH_CHANNELS=mac-arm64-beta/,
  );
});
