import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(root, 'scripts', 'apply-release-version.mjs');
const crlf = text => text.replace(/\n/g, '\r\n');

const fixtures = {
  'package.json': crlf(JSON.stringify({ name: 'chunk-surfer', version: '0.3.0', private: true }, null, 2) + '\n'),
  'package-lock.json': crlf(JSON.stringify({ name: 'chunk-surfer', version: '0.3.0', lockfileVersion: 3, packages: { '': { name: 'chunk-surfer', version: '0.3.0' } } }, null, 2) + '\n'),
  'src-tauri/Cargo.toml': crlf('[package]\nname = "chunk-surfer"\nversion = "0.3.0"\nedition = "2021"\n\n[dependencies]\nserde = "1"\n'),
  'src-tauri/Cargo.lock': crlf('# lock\n[[package]]\nname = "chunk-surfer"\nversion = "0.3.0"\nsource = "registry"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n'),
  'src-tauri/tauri.conf.json': crlf(JSON.stringify({ productName: 'chunk-surfer', version: '0.3.0', identifier: 'x', build: {} }, null, 2) + '\n'),
  'CHANGELOG.md': crlf('# Changelog\n\n## 0.2.0\n\nold notes\n'),
};

test('version propagation rewrites a CRLF-checked-out tree exactly like the Windows runner', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apply-release-version-'));
  try {
    for (const [rel, content] of Object.entries(fixtures)) {
      const at = join(dir, rel);
      mkdirSync(dirname(at), { recursive: true });
      writeFileSync(at, content);
    }
    const run = spawnSync(process.execPath, [script, 'v1.2.3'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '1.2.3');
    assert.equal(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).packages[''].version, '1.2.3');
    assert.match(readFileSync(join(dir, 'src-tauri/Cargo.toml'), 'utf8'), /^version = "1\.2\.3"\r?$/m);
    assert.match(readFileSync(join(dir, 'src-tauri/Cargo.lock'), 'utf8'), /name = "chunk-surfer"\r?\nversion = "1\.2\.3"/, 'the CRLF lockfile entry is rewritten');
    assert.equal(JSON.parse(readFileSync(join(dir, 'src-tauri/tauri.conf.json'), 'utf8')).version, '1.2.3');
    assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), /\r?\n## 1\.2\.3/, 'the changelog stub lands under CRLF too');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

