import assert from 'node:assert/strict';
import { buildWindowChoreographyLabCases,choreographyLabSummary } from '../src/platform/window-choreography-lab.js';
import { validateFireballCastPlan } from '../src/game/window-channel.js';

const cases=buildWindowChoreographyLabCases(),summary=choreographyLabSummary(cases);
assert.equal(summary.cases,34);assert.equal(summary.valid,34);assert.equal(summary.maxSurfaces,4);
assert.equal(summary.modalPhases,0);assert.equal(summary.mainWindowMutations,0);
assert.ok(cases.every((entry)=>validateFireballCastPlan(entry.plan)));
assert.ok(cases.filter((entry)=>entry.reducedMotion).every((entry)=>entry.plan.reducedMotion));
console.log(`fireball choreography lab covers ${summary.cases} cases`);
