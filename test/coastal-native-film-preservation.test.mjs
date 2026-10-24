import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

test('an over-budget native film keeps its original bytes, metadata and trace before failing', async () => {
  const source = await readFile(new URL('../tools/chunk_surfer/source-drive-study/coastal-memory-native.mjs', import.meta.url), 'utf8');
  const functionSource = source.slice(source.indexOf('async function endFilm()'), source.indexOf('\nasync function cameraReceipt()'));
  const run = await mkdtemp(join(tmpdir(), 'coastal-film-budget-test-'));
  const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const report = { films: [{ name: 'over-budget' }], inputs: [{ film: 'over-budget', type: 'keydown', key: 'w' }] };
  const context = vm.createContext({ Buffer, join, writeFile, run, report, attempt: 'fixture', film: 'over-budget', filmBytes: 0, filmBudget: 1,
    hash: value => createHash('sha256').update(value).digest('hex'),
    page: { evaluate: async () => ({ base64: bytes.toString('base64'), frames: [{ t: 0, ms: 0 }], layers: [], start: 0, end: 1, mime: 'video/webm' }) },
    execFileSync: () => { throw Error('An already over-budget film must not start further decoding.'); },
  });
  try {
    await assert.rejects(vm.runInContext(functionSource + '\nendFilm()', context), /original bytes and trace were preserved/);
    assert.deepEqual(await readFile(join(run, 'over-budget.webm')), bytes);
    const trace = JSON.parse(await readFile(join(run, 'over-budget-trace.json'), 'utf8'));
    assert.equal(trace.frames.length, 1);
    assert.equal(trace.inputs[0].key, 'w');
    assert.equal(report.films[0].bytes, bytes.length);
    assert.equal(report.films[0].preservedBeforeBudgetCheck, true);
    assert.equal(report.films[0].sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(report.films[0].fullDecode, undefined);
    assert.equal(context.film, null);
  } finally { await rm(run, { recursive: true, force: true }); }
});
