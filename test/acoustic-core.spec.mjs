import assert from 'node:assert/strict';
import { ACOUSTIC_CATALOGUE, gameNoiseToDb, inferAcousticKind, validateAcousticCatalogue } from '../src/audio/acoustic-catalogue.js';
import { emitAcousticEvent, normalizeAcousticEvent, onAcousticEvent, resetAcousticEventsForTest, validateAcousticEvent } from '../src/audio/acoustic-events.js';
import { distanceLossDb, isAudibleToHush, propagateNoise } from '../src/audio/acoustic-propagation.js';

assert.equal(validateAcousticCatalogue(ACOUSTIC_CATALOGUE).ok, true);
assert.equal(inferAcousticKind('you could not keep your breath quiet', .2), 'breath_fear');
assert.equal(inferAcousticKind('a page turning', .06), 'page_turn');
assert.equal(inferAcousticKind('you moved', .22, { step: true }), 'footstep_walk');
assert.ok(gameNoiseToDb(.5) > gameNoiseToDb(.2));
assert.ok(distanceLossDb(20) > distanceLossDb(5));

const base = normalizeAcousticEvent({
  kind: 'footstep_walk',
  source: { kind: 'player', id: 'player' },
  spatial: { roomId: 'a', floorId: 'g', position: { x: 0, y: 0 } },
});
assert.equal(validateAcousticEvent(base).ok, true);

const sameRoom = propagateNoise({ event: base, listener: { roomId: 'a', floorId: 'g', position: { x: 8, y: 0 } } });
const crossRoom = propagateNoise({ event: base, listener: { roomId: 'b', floorId: 'g', position: { x: 8, y: 0 } }, occlusionDb: 8 });
const crossFloor = propagateNoise({ event: base, listener: { roomId: 'b', floorId: 'u1', position: { x: 8, y: 0 } }, occlusionDb: 8 });
assert.ok(sameRoom.effectiveLevelDb > crossRoom.effectiveLevelDb);
assert.ok(crossRoom.effectiveLevelDb > crossFloor.effectiveLevelDb);
assert.equal(isAudibleToHush(sameRoom, { hearingThresholdDb: -60 }), true);
assert.equal(isAudibleToHush(sameRoom, { hearingThresholdDb: 0 }), false);

resetAcousticEventsForTest();
const received = [];
const off = onAcousticEvent((event) => received.push(event));
emitAcousticEvent({ kind: 'bag_rummage', source: { kind: 'player', id: 'player' }, spatial: { position: { x: 1, y: 2 } } });
off();
emitAcousticEvent({ kind: 'page_turn', source: { kind: 'player', id: 'player' }, spatial: { position: { x: 1, y: 2 } } });
assert.equal(received.length, 1);
assert.equal(received[0].kind, 'bag_rummage');

console.log('acoustic core tests ok');
