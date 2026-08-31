import assert from 'node:assert/strict';

import * as PB from '../src/game/playback.js';
import * as REC from '../src/game/recordist.js';

// ── ONE STORE ────────────────────────────────────────────────────────────────
//
// There were two, and they disagreed. The room ids went into the save and came
// back; the sealed tape lived in a Map that did not, because a tape was assumed
// to be session furniture. So after a quit and resume the recordist said the
// room was recorded and playback said it was not, and pressing playback in a
// room on your own job sheet answered "nothing recorded in this room".
//
// These tests are that bug, written down.

// A pretend catalogue. Samples are resolved by NAME on the way back, because a
// manifest index moves the moment a sample is added.
const catalogue = [
  { idx: 0, name: 'b3_floor.mp3', buffer: {} },
  { idx: 1, name: 'b3_pipes.mp3', buffer: {} },
  { idx: 2, name: 'tub_drip.mp3', buffer: {} },
  { idx: 3, name: 'tub_far.mp3', buffer: {} },
];
const byIdx = new Map(catalogue.map((c) => [c.idx, c]));
const byName = new Map(catalogue.map((c) => [c.name, c]));

const wire = () => {
  PB.playbackInit({
    chunkById: (i) => byIdx.get(i) || null,
    chunkByKey: (k) => byName.get(k) || null,
    keyOf: (c) => c?.name || null,
    pickGuest: (roomId, heard) => catalogue.find((c) => !heard.includes(c.idx)) || null,
  });
  REC.setTakeSink({
    roomIds: () => PB.takeRoomIds(),
    contaminated: () => PB.contaminatedRooms(),
    places: () => PB.takePlaces(),
    mark: (roomId, opts) => PB.markTake(roomId, opts),
    forget: (roomId) => PB.forgetTake(roomId),
    serialize: () => PB.serializeTakes(),
  });
};

const rollTake = (roomId, { levels = [], contaminated = false, place = null } = {}) => {
  PB.beginTake(roomId, { x: 4, y: 5 });
  for (const [idx, gain] of levels) PB.noteAudible(roomId, idx, gain);
  PB.notePresence(roomId, 0.4, 12);
  REC.addTake(roomId, { contaminated, place });   // the job counts it…
  PB.sealTake(roomId);                            // …then the transport settles
};

// ── the two questions a take answers ─────────────────────────────────────────
wire();
PB.loadTakes([]);
PB.beginTake('main_b3', { x: 1, y: 1 });
REC.addTake('main_b3');
assert.equal(REC.hasTake('main_b3'), true,
  'the job counts the room the moment the minute completes, before the tape closes');
assert.equal(PB.hasTake('main_b3'), false,
  'and there is still no tape to play until it is sealed');
PB.sealTake('main_b3');
assert.equal(PB.hasTake('main_b3'), true, 'sealed, and now it plays');

// ── it survives the save ─────────────────────────────────────────────────────
wire();
PB.loadTakes([]);
rollTake('main_b3', { levels: [[0, 0.8], [1, 0.3]], place: 'orchestra' });
rollTake('the_tub', { levels: [[2, 0.6]], contaminated: true });

const saved = JSON.parse(JSON.stringify(REC.saveRecState()));
assert.equal(saved.tapes.length, 2, 'both takes are in the file');
assert.deepEqual(saved.takes, undefined, 'and the old parallel lists are not written any more');
assert.deepEqual(saved.tapes[0].audible, [['b3_floor.mp3', 0.8], ['b3_pipes.mp3', 0.3]],
  'a sample is written by NAME, so adding one to the manifest cannot repoint it');
assert.ok(saved.tapes[0].guest?.key, 'the guest is a key, which is what makes a tape writable at all');
assert.equal(saved.tapes[1].contaminated, true);
assert.equal(saved.tapes[0].place, 'orchestra');

// Everything forgotten, the way a reload forgets it.
PB.loadTakes([]);
REC.loadRecState({});
REC.syncTakes();
assert.equal(REC.hasTake('main_b3'), false, 'gone');

// And back.
{
  const restored = REC.loadRecState(saved);
  PB.loadTakes(restored.tapes);
  REC.syncTakes();
}
assert.equal(REC.hasTake('main_b3'), true, 'the job sheet came back');
assert.equal(PB.hasTake('main_b3'), true, 'AND SO DID THE TAPE — this is the bug');
assert.equal(REC.takeIsContaminated('the_tub'), true, 'contamination came back');
assert.equal(REC.takePlace('main_b3'), 'orchestra', 'and where he stood');
assert.deepEqual(REC.saveRecState().tapes[0].audible, saved.tapes[0].audible,
  'a second save round-trips to the same tape');

// ── an old save has room ids and nothing else ────────────────────────────────
{
  wire();
  PB.loadTakes([]);
  const legacy = { injuries: 1, battery: 0.5, takes: ['main_b3', 'the_tub'], contaminated: ['the_tub'], places: { main_b3: 'stage' } };
  const restored = REC.loadRecState(legacy);
  assert.equal(restored.tapes, null, 'no tapes in the file');
  assert.equal(PB.adoptLegacyTakes(restored.legacy), 2, 'so the room ids become real takes');
  REC.syncTakes();
  assert.deepEqual(REC.recState().takes, ['main_b3', 'the_tub']);
  assert.equal(REC.takeIsContaminated('the_tub'), true);
  assert.equal(REC.takePlace('main_b3'), 'stage');
  assert.equal(PB.hasTake('main_b3'), true,
    'and a migrated take is playable, so the machine never lists one it then refuses');
  assert.deepEqual(PB.takeFor('main_b3').audible, [],
    'with no recording behind it — it was made before the tape was written down');
}

// ── the module still stands up on its own ────────────────────────────────────
//
// Headless tests and the bag lab use the recordist with no tape store wired.
{
  REC.setTakeSink(null);
  REC.loadRecState({});
  REC.addTake('the_tub', { contaminated: true, place: null });
  const alone = REC.saveRecState();
  assert.equal(alone.tapes.length, 1, 'it writes tapes even with nothing behind it');
  REC.loadRecState(alone);
  assert.deepEqual(REC.contaminatedTakes(), ['the_tub'], 'and reads its own file back');
  REC.setTakeSink(null);
}

console.log('take store contracts passed');
