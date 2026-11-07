import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { paperVenvPython, paperPython, commandExists } from '../scripts/paper/paper-runtime.mjs';

test('the repo-local paper venv is found at each platform own layout', () => {
  const layouts = [
    ['darwin', ['.paper-venv', 'bin', 'python']],
    ['linux', ['.paper-venv', 'bin', 'python']],
    ['win32', ['.paper-venv', 'Scripts', 'python.exe']],
  ];
  for (const [platform, rel] of layouts) {
    const root = mkdtempSync(path.join(tmpdir(), 'paper-runtime-'));
    try {
      assert.equal(paperVenvPython(root, platform), null, platform + ' finds nothing when no venv exists');
      const at = path.join(root, ...rel);
      mkdirSync(path.dirname(at), { recursive: true });
      writeFileSync(at, '');
      assert.equal(paperVenvPython(root, platform), at, platform + ' resolves its own venv layout');
      assert.equal(paperPython(root, { env: {}, platform }), at, platform + ' prefers the local venv');
      assert.equal(paperPython(root, { env: { PAPER_PYTHON: '/custom/python' }, platform }), '/custom/python', 'env override wins');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('the fallback is each platform default interpreter', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'paper-runtime-'));
  try {
    assert.equal(paperPython(root, { env: {}, platform: 'win32' }), 'python');
    assert.equal(paperPython(root, { env: {}, platform: 'darwin' }), 'python3');
    assert.equal(paperPython(root, { env: {}, platform: 'linux' }), 'python3');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('commandExists answers with each platform own lookup, never bash', () => {
  assert.equal(typeof commandExists('node', { platform: 'darwin' }), 'boolean');
  assert.equal(commandExists('node', { platform: 'linux' }), true, 'POSIX lookup finds an installed command');
  assert.equal(commandExists('node', { platform: 'win32' }), false, 'where.exe does not exist on a POSIX host');
});
