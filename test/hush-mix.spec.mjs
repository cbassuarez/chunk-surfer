import assert from 'node:assert/strict';
import { hushMixTargets } from '../src/audio/hush-mix.js';

const field = {
  absorption: { audio: .8, monitor: .9 },
  presentation: { audio: .8, monitor: .9, hiss: 1, softenCuts: false },
};
const full = hushMixTargets(field, {}, { monitorGain: 1, monitorOpen: true });
const reducedMonitor = hushMixTargets(field, {}, { monitorGain: .2, monitorOpen: true });
const closedMonitor = hushMixTargets(field, {}, { monitorGain: 1, monitorOpen: false });
assert.equal(full.worldGain, reducedMonitor.worldGain);
assert.equal(full.worldLowpassHz, reducedMonitor.worldLowpassHz);
assert.ok(reducedMonitor.monitorDryGain < full.monitorDryGain);
assert.ok(closedMonitor.monitorDryGain < full.monitorDryGain);
assert.ok(full.hissGain > 0);

const neutral = hushMixTargets(null, {}, { monitorGain: 1, monitorOpen: true });
assert.equal(neutral.worldGain, 1);
assert.equal(neutral.directGain, 1);
assert.equal(neutral.hissGain, 0);

console.log('hush mix tests ok');
