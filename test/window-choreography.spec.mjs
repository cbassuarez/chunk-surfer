import assert from 'node:assert/strict';
import {
  WINDOW_CUE_IDS,
  compileWindowChoreography,
  validateWindowChoreographyPlan,
} from '../src/platform/window-choreography.js';

const token = 'session-12345678';
for (const cueId of WINDOW_CUE_IDS) {
  const plan = compileWindowChoreography({ token, stage: 'control', cueId, intensity: 'hostile', inputLocked: true });
  assert.ok(validateWindowChoreographyPlan(plan), `${cueId} compiles to the allowlisted contract`);
  assert.equal(plan.timing.bpm, 168);
}
assert.equal(compileWindowChoreography({ token, cueId: 'overload', inputLocked: false }), null);
assert.equal(compileWindowChoreography({ token, cueId: 'conceal', intensity: 'standard', inputLocked: true }), null);
assert.equal(compileWindowChoreography({ token, cueId: 'unowned', inputLocked: true }), null);

const pool = compileWindowChoreography({ token, stage: 'recognition', cueId: 'broadcast', intensity: 'hostile', inputLocked: true });
assert.equal(pool.main[1].aperture, 'pool-reflection');
assert.ok(pool.main[1].geometry.width > pool.main[1].geometry.height);
assert.equal(pool.echoes.length, 0, 'the natatorium uses the existing monitor return as its reflection');

const chapel = compileWindowChoreography({ token, stage: 'handoff', cueId: 'broadcast', intensity: 'hostile', inputLocked: true });
assert.equal(chapel.echoes.length, 2);
const finale = compileWindowChoreography({ token, stage: 'handoff', encounterId: 'source-final', cueId: 'loop', intensity: 'hostile', inputLocked: true });
assert.equal(finale.stage, 'finale');
assert.equal(finale.echoes.length, 2, 'monitor plus two echoes keeps the total at four windows');

const held = compileWindowChoreography({
  token,
  stage: 'control',
  cueId: 'overload',
  intensity: 'hostile',
  inputLocked: true,
  hold: true,
  mainGeometry: { x: .31, y: .17, width: .54, height: .71 },
});
assert.equal(held.hold, true);
assert.equal(held.main.length, 2, 'a battle-scoped composition stays displaced until explicit resolution');
assert.deepEqual(held.main.at(-1).geometry, { x: .38, y: .23, width: .4, height: .59 });

assert.equal(compileWindowChoreography({ token, stage: 'handoff', cueId: 'broadcast', intensity: 'low', inputLocked: true }).displayMode, 'internal');
assert.equal(compileWindowChoreography({ token, stage: 'handoff', cueId: 'broadcast', intensity: 'hostile', fullscreen: true, inputLocked: true }).displayMode, 'internal');
assert.equal(compileWindowChoreography({ token, stage: 'handoff', cueId: 'broadcast', intensity: 'hostile', nativePositioning: false, inputLocked: true }).displayMode, 'internal');

console.log('window choreography compiler tests passed');
