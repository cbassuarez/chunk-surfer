import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner=readFileSync('scripts/run-latest.mjs','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));

assert.equal(pkg.scripts['tauri:dev'],'node scripts/run-latest.mjs');
assert.match(runner,/port:\s*0/,'dev launcher asks the OS for free ports');
assert.match(runner,/randomBytes\(24\)/,'dev lens uses a per-launch token');
assert.match(runner,/devUrl:`http:\/\/127\.0\.0\.1:\$\{frontendPort\}`/);
assert.match(runner,/LENS_PORT:String\(lensPort\)/);
assert.doesNotMatch(runner,/frontendPort\s*=\s*5173/);

console.log('development launch contract tests ok');
