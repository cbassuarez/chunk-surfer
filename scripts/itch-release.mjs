#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const ITCH_CHANNELS = [
  {
    channel: 'win-beta',
    label: 'Windows x64 portable',
    kind: 'directory-or-file',
    directory: ['release', 'windows', 'Chunk Surfer'],
    fileMatchers: [
      (file) => /windows-x64\.zip$/i.test(file),
    ],
  },
  {
    channel: 'mac-arm64-beta',
    label: 'macOS Apple Silicon DMG',
    kind: 'file',
    fileMatchers: [
      (file) => /\.dmg$/i.test(file) && /aarch64|arm64|apple/i.test(file),
      (file) => /\.dmg$/i.test(file),
    ],
  },
  {
    channel: 'linux-appimage-beta',
    label: 'Linux x64 AppImage',
    kind: 'file',
    fileMatchers: [
      (file) => /\.AppImage$/i.test(file),
    ],
  },
  {
    channel: 'linux-deb-beta',
    label: 'Linux x64 deb',
    kind: 'file',
    fileMatchers: [
      (file) => /\.deb$/i.test(file),
    ],
  },
];

function versionTokens(version) {
  const v = String(version || '').trim();
  return [v, v.replaceAll('-', '.')].filter(Boolean);
}

const SEARCH_ROOTS = [
  'release-assets',
  'release',
  path.join('src-tauri', 'target', 'aarch64-apple-darwin', 'release', 'bundle'),
  path.join('src-tauri', 'target', 'release', 'bundle'),
];

function readVersion(root) {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

function walkFiles(root, dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(root, full, out);
    else if (stat.isFile()) out.push(full);
  }
  return out;
}

function copyDirectoryContents(source, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(source)) {
    cpSync(path.join(source, name), path.join(dest, name), { recursive: true });
  }
}

function allCandidateFiles(root) {
  return SEARCH_ROOTS.flatMap((relative) => walkFiles(root, path.join(root, relative)));
}

export function findItchPayload(root, spec, files = allCandidateFiles(root), version = readVersion(root)) {
  const tokens = versionTokens(version);
  const directDir = spec.directory ? path.join(root, ...spec.directory) : null;
  if (directDir && existsSync(directDir) && statSync(directDir).isDirectory()) {
    return { type: 'directory', path: directDir };
  }
  for (const matcher of spec.fileMatchers || []) {
    const match = files.find((file) => {
      const name = path.basename(file);
      return tokens.some((token) => name.includes(token)) && matcher(name, file);
    });
    if (match) return { type: 'file', path: match };
  }
  return null;
}

export function selectItchChannels(channels = '') {
  const requested = String(channels || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (!requested.length) return ITCH_CHANNELS;
  const known = new Map(ITCH_CHANNELS.map((entry) => [entry.channel, entry]));
  const selected = requested.map((channel) => {
    const spec = known.get(channel);
    if (!spec) throw new Error(`Unknown itch channel: ${channel}. Expected one of: ${ITCH_CHANNELS.map((entry) => entry.channel).join(', ')}`);
    return spec;
  });
  return selected;
}

function missingPayloadMessage(missing, version, files) {
  const found = files.map((file) => path.relative(process.cwd(), file)).sort();
  return [
    `Missing itch payloads for ${version}:`,
    ...missing.map((entry) => `- ${entry.channel}: ${entry.label}`),
    '',
    'Build or download release artifacts first. For a partial local publish, set ITCH_CHANNELS to a comma-separated subset, for example:',
    '  ITCH_CHANNELS=mac-arm64-beta npm run itch:preview',
    '',
    'Expected current-version artifacts under release-assets/, release/, or src-tauri/target/**/bundle/.',
    found.length ? `Detected candidate files:\n${found.map((file) => `  ${file}`).join('\n')}` : 'Detected candidate files: none',
  ].join('\n');
}

export function stageItchBuilds({
  root = process.cwd(),
  outDir = path.join(root, 'release', 'itch'),
  channels = process.env.ITCH_CHANNELS || '',
} = {}) {
  const version = readVersion(root);
  const files = allCandidateFiles(root);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const staged = [];
  const specs = selectItchChannels(channels);
  const missing = [];

  for (const spec of specs) {
    const payload = findItchPayload(root, spec, files, version);
    if (!payload) {
      missing.push(spec);
      continue;
    }
    const channelDir = path.join(outDir, spec.channel);
    mkdirSync(channelDir, { recursive: true });
    if (payload.type === 'directory') {
      copyDirectoryContents(payload.path, channelDir);
    } else {
      cpSync(payload.path, path.join(channelDir, path.basename(payload.path)));
    }
    writeFileSync(
      path.join(channelDir, 'ITCH_CHANNEL.txt'),
      [
        `Chunk Surfer ${version}`,
        `Channel: ${spec.channel}`,
        `Payload: ${spec.label}`,
        '',
      ].join('\n'),
    );
    staged.push({ ...spec, dir: channelDir, payload });
  }
  if (missing.length) throw new Error(missingPayloadMessage(missing, version, files));
  return { version, outDir, staged };
}

export function butlerArgs({ mode, target, channel, dir, version }) {
  if (!target) throw new Error('ITCH_TARGET is required, for example cbassuarez/chunk-surfer.');
  if (mode === 'preview') return ['push-preview', '--changes-only', dir, `${target}:${channel}`];
  if (mode === 'push') return ['push', dir, `${target}:${channel}`, '--userversion', version];
  throw new Error(`Unknown Butler mode: ${mode}`);
}

function requirePublishEnvironment(mode) {
  const target = process.env.ITCH_TARGET || '';
  if (!target) throw new Error('ITCH_TARGET is required, for example cbassuarez/chunk-surfer.');
  if (!process.env.BUTLER_API_KEY) throw new Error('BUTLER_API_KEY is required for itch preview/push.');
  if (mode === 'push' && !process.env.ITCH_CONFIRM_PUSH) {
    throw new Error('Set ITCH_CONFIRM_PUSH=1 to publish live itch builds.');
  }
  return target;
}

function runButler(args, { dryRun = false } = {}) {
  const command = ['butler', ...args].join(' ');
  if (dryRun) {
    console.log(command);
    return;
  }
  const result = spawnSync('butler', args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

function main() {
  const [mode = 'stage', ...rest] = process.argv.slice(2);
  const dryRun = rest.includes('--dry-run');
  const channelArg = rest.find((arg) => arg.startsWith('--channels='));
  const channels = channelArg ? channelArg.slice('--channels='.length) : process.env.ITCH_CHANNELS || '';
  if (!['stage', 'preview', 'push'].includes(mode)) {
    throw new Error('Usage: node scripts/itch-release.mjs stage|preview|push [--dry-run] [--channels=win-beta,mac-arm64-beta]');
  }
  const staged = stageItchBuilds({ channels });
  console.log(`Staged itch builds in ${path.relative(process.cwd(), staged.outDir)} for ${staged.version}`);
  for (const entry of staged.staged) {
    console.log(`- ${entry.channel}: ${path.relative(process.cwd(), entry.payload.path)}`);
  }
  if (mode === 'stage') return;

  const target = dryRun ? (process.env.ITCH_TARGET || 'user/game') : requirePublishEnvironment(mode);
  for (const entry of staged.staged) {
    runButler(butlerArgs({
      mode,
      target,
      channel: entry.channel,
      dir: entry.dir,
      version: staged.version,
    }), { dryRun });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
