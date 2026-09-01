import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWindowsPortable } from '../scripts/validate-windows-portable.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function makeFixture() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'chunk-surfer-portable-'));
  const longUnicodeParent = path.join(temp, `Path with spaces – テスト – ${'x'.repeat(80)}`);
  const appDir = path.join(longUnicodeParent, 'Chunk Surfer');
  const modelDir = path.join(appDir, 'lens', 'models');
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(path.join(appDir, 'chunk-surfer.exe'), 'game');
  writeFileSync(path.join(appDir, 'chunk-lens.exe'), 'sidecar');
  writeFileSync(path.join(appDir, 'README.txt'), 'Extract the complete folder.');
  const model = Buffer.from('model fixture');
  writeFileSync(path.join(modelDir, 'fixture.bin'), model);
  const files = { 'models/fixture.bin': sha256(model) };
  const weightsSha256 = sha256(Buffer.from(JSON.stringify(files)));
  writeFileSync(path.join(appDir, 'lens', 'manifest.json'), JSON.stringify({
    schema: 1,
    serviceSchema: 2,
    cacheSchema: 3,
    serviceRevision: 'r16-seamless-banks',
    modelId: 'sd15-hyper4',
    files,
    weightsSha256,
  }));
  return { temp, appDir };
}

test('portable validator accepts spaces, Unicode, long paths, and a complete manifest', () => {
  const fixture = makeFixture();
  try {
    const result = validateWindowsPortable(fixture.appDir);
    assert.equal(result.manifestFiles, 1);
    assert.match(result.appDir, /Path with spaces/);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test('portable validator rejects missing, empty, corrupt, and unsafe payloads', () => {
  for (const mutate of [
    ({ appDir }) => rmSync(path.join(appDir, 'chunk-lens.exe')),
    ({ appDir }) => writeFileSync(path.join(appDir, 'chunk-lens.exe'), ''),
    ({ appDir }) => writeFileSync(path.join(appDir, 'lens', 'models', 'fixture.bin'), 'corrupt'),
    ({ appDir }) => writeFileSync(path.join(appDir, 'lens', 'manifest.json'), JSON.stringify({
      schema: 1,
      serviceSchema: 2,
      cacheSchema: 3,
      serviceRevision: 'r16-seamless-banks',
      modelId: 'sd15-hyper4',
      files: { '../escape.bin': '0'.repeat(64) },
      weightsSha256: '0'.repeat(64),
    })),
  ]) {
    const fixture = makeFixture();
    try {
      mutate(fixture);
      assert.throws(() => validateWindowsPortable(fixture.appDir), /Invalid Windows portable payload/);
    } finally {
      rmSync(fixture.temp, { recursive: true, force: true });
    }
  }
});
