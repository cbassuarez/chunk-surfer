import assert from 'node:assert/strict';
import { buildWindowChoreographyLabCases, choreographyLabSummary } from '../src/platform/window-choreography-lab.js';
import { validateWindowChoreographyPlan } from '../src/platform/window-choreography.js';

const cases = buildWindowChoreographyLabCases();
const summary = choreographyLabSummary(cases);
assert.ok(summary.cases > 4000, 'the lab crosses every authored axis');
assert.equal(summary.maxEchoes, 2, 'monitor plus two echoes is the three-auxiliary ceiling');
assert.ok(summary.native > 0 && summary.internal > 0);
for (const entry of cases) {
  if (entry.cueId === 'conceal' && entry.intensity !== 'hostile') assert.equal(entry.plan, null);
  else assert.ok(validateWindowChoreographyPlan(entry.plan), entry.id);
  if (entry.fullscreen || !entry.windowMovement || !entry.monitor.nativePositioning || entry.intensity === 'low') {
    if (entry.plan) assert.equal(entry.plan.displayMode, 'internal', entry.id);
  }
}
console.log(`window choreography lab covers ${summary.cases} cases`);
