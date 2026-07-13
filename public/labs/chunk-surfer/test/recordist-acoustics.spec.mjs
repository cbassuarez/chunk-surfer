import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import { NOISE } from '../src/config.js';

const events = [];
REC.setAcousticEmitter((event) => { events.push(event); return event; });
REC.loadRecState({ injuries: 1, takes: [], battery: 1 });

REC.emitNoise(.10, 3, 4, 'a door opened', {
  kind: 'door_open',
  sourceKind: 'environment',
  sourceId: 'door:test',
  playerGenerated: true,
  deliberate: true,
});

// Semantic source labels must not alter the established recording envelope.
assert.equal(REC.currentNoise(), .10 + NOISE.perInjury);
assert.equal(events.length, 1);
assert.equal(events[0].kind, 'door_open');
assert.equal(events[0].source.kind, 'environment');
assert.equal(events[0].playerGenerated, true);
assert.equal(events[0].audibleToHush, true);

REC.emitNoise(.20, 3, 4, 'bookkeeping reinforcement', {
  sourceKind: 'system',
  sourceId: 'take-break',
  playerGenerated: false,
  audibleToHush: false,
});
assert.equal(events.at(-1).audibleToHush, false);

REC.setAcousticEmitter(null);
console.log('recordist acoustic tests ok');
