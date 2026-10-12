// The source space path, printed. `npm run source:path`.
//
// The same audit as the page, for a terminal and for the desk's checks: the walk
// in order, what forks where, and then what no longer matches the code. Exits
// non-zero when anything is wrong, so it can gate a commit.

import process from 'node:process';

import { auditById } from '../registry.mjs';
import { buildAudit } from './audit.mjs';

const audit = await buildAudit();
const titles = Object.fromEntries(audit.stages.map((stage) => [stage.id, stage.title]));
const out = [];

out.push('THE SOURCE SPACE PATH', '');
for (const section of audit.sections) {
  out.push(section.title.toUpperCase());
  for (const stage of audit.stages.filter((entry) => entry.section === section.id)) {
    const index = String(audit.stages.indexOf(stage) + 1).padStart(2, '0');
    const length = stage.length > 0 ? stage.rows.find((row) => row.label === 'Length')?.value || '' : 'a moment';
    out.push(`  ${index}  ${stage.title}  (${length})`);
    out.push(`      move on: ${stage.moveOn}`);
    for (const callout of stage.callouts) {
      if (['no-return', 'gate', 'fork', 'can-return'].includes(callout.kind)) out.push(`      ${callout.kind === 'no-return' ? '!' : '·'} ${callout.text}`);
    }
    for (const next of stage.next) {
      const target = next.to.startsWith('ending:') ? `the ${next.to.slice('ending:'.length)} endings` : titles[next.to];
      out.push(`      → ${target} — ${next.when}${next.back ? ' (back)' : next.branch ? ' (branch)' : ''}`);
    }
  }
  out.push('');
}

for (const road of audit.roads) out.push(`${road.title}: ${road.endings.join(', ')}`);
out.push('');

const { broken, unfinished } = audit.global;
if (broken.length) {
  out.push(`WRONG (${broken.length})`);
  for (const line of broken) out.push(`  - ${line}`);
  out.push('');
}
if (unfinished.length) {
  out.push(`NOT FINISHED (${unfinished.length})`);
  for (const entry of unfinished) out.push(`  - ${entry.id}: ${entry.text}`);
  out.push('');
}
out.push(broken.length ? 'The path no longer matches the code.' : 'The whole path matches the code.');
out.push(`The page: npm run source:audit (http://127.0.0.1:${auditById('source-path').port}/)`);

console.log(out.join('\n'));
process.exitCode = broken.length ? 1 : 0;
