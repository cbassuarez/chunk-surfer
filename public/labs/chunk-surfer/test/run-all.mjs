import { spawnSync } from 'node:child_process';
import process from 'node:process';

const tests = [
  'test/bag.spec.mjs',
  'test/progression-pure.spec.mjs',
  'test/progression-profile.spec.mjs',
  'test/progression-runtime.spec.mjs',
  'test/progression-migration.spec.mjs',
  'test/platform-sync.spec.mjs',
];

for (const file of tests) {
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`all ${tests.length} test files passed`);
