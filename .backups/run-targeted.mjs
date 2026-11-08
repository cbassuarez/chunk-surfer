import { readFileSync } from 'node:fs';
const files = readFileSync(new URL('./targeted-tests.txt', import.meta.url), 'utf8').split('
').map(s=>s.trim()).filter(Boolean);
const m = await import('./run-all.mjs'.replace('./',''));
process.exitCode = m.runTests(files, { log: ()=>{}, error: console.error });
