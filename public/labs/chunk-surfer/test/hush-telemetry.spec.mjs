import assert from 'node:assert/strict';
import { createHushTelemetry, measureAcousticEvidence } from '../src/game/hush-telemetry.js';

let now = 0;
const clock = () => now;
const telemetry = createHushTelemetry({
  clock,
  random: () => 0,
  config: { sampleMinMs: 100, sampleMaxMs: 100, acquireMinMs: 100, acquireMaxMs: 100, liveHoldMs: 500, decayMs: 600, historyMs: 1200 },
});

const fixture = {
  hush: { active: true, floorId: 'b1', roomId: 'main_b3', position: { x: 20, y: 10 }, emittedEnergy: .9, detectionRadius: 100 },
  player: { position: { x: 5, y: 10 } },
  recorder: { monitorOpen: true, available: true },
  story: { contactDisplayEnabled: true },
  policy: { contactHoldScale: 1, contactResolveBias: 0 },
};

let contact = telemetry.sample(fixture);
assert.equal(contact.state, 'acquiring');
now = 110;
contact = telemetry.sample(fixture);
assert.equal(contact.state, 'locked');
assert.deepEqual(contact.observation.position, fixture.hush.position);

// Line of sight is deliberately irrelevant to acoustic evidence.
now = 220;
contact = telemetry.sample({ ...fixture, hush: { ...fixture.hush, visibleToPlayer: false } });
assert.equal(contact.state, 'locked');
assert.deepEqual(contact.observation.position, fixture.hush.position);

// Weak evidence never fabricates a precise point.
const weak = measureAcousticEvidence({
  hush: { active: true, position: { x: 70, y: 10 }, emittedEnergy: .42, detectionRadius: 100 },
  player: { position: { x: 5, y: 10 } }, recorder: { monitorOpen: true }, policy: {},
});
assert.equal(weak.lockable, false);
if (weak.detectable) assert.ok(weak.region || weak.bearing);

const thresholded = measureAcousticEvidence({
  hush: { active: true, position: { x: 15, y: 10 }, emittedEnergy: .7, detectionRadius: 100 },
  player: { position: { x: 5, y: 10 } }, recorder: { monitorOpen: true }, policy: {},
  thresholds: { detectThreshold: .99, lockThreshold: 1.1 },
});
assert.equal(thresholded.detectable, false);
assert.equal(thresholded.lockable, false);

now = 900;
contact = telemetry.sample({ ...fixture, hush: { ...fixture.hush, active: false } });
assert.equal(contact.state, 'decaying');
assert.ok(contact.observation.observedAt < now);

assert.equal(telemetry.forceLock({ beatId: 'same-room', floorId: 'b1', roomId: 'main_b3', position: { x: 8, y: 8 }, duration: 500 }), true);
assert.equal(telemetry.forceLock({ beatId: 'same-room', floorId: 'b1', position: { x: 9, y: 9 } }), false);
contact = telemetry.sample(fixture);
assert.equal(contact.state, 'locked');
assert.deepEqual(contact.observation.position, { x: 8, y: 8 });

console.log('hush telemetry tests ok');
