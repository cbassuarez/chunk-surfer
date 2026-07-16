import assert from 'node:assert/strict';

globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
globalThis.window ||= globalThis;

const PRES = await import('../src/game/presence.js');

PRES.spawnBehind(0, 0, 0, 1);
const before = PRES.distanceTo(0, 0);
assert.ok(before <= 23 * 2, 'HUSH spawns within the revised encounter distance');

for (let i = 0; i < 40; i += 1) PRES.updatePresence(0.25, 0, 0, null);
const after = PRES.distanceTo(0, 0);
assert.ok(after < before - 8, 'HUSH closes meaningful distance even when the player stays silent');
assert.equal(PRES.presenceState().motionMode, 'stalk');

PRES.despawn();
console.log('presence pursuit specs passed');
