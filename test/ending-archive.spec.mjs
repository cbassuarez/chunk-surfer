import assert from 'node:assert/strict';

import { ENDING_IDS } from '../src/progression/schema.js';
import { ENDING_REPLAY_UNLOCKS } from '../src/progression/unlocks.js';
import { ENDING_ARCHIVE, endingArchiveDocument } from '../src/data/ending-archive.js';
import { returnFileEntries } from '../src/game/second-shift.js';
import { endingManifest } from '../src/data/endings.js';

// EVERY DECLARED ARCHIVE ENTRY HAS A DOCUMENT, AND EVERY DOCUMENT IS DECLARED.
//
// ENDING_REPLAY_UNLOCKS named an archiveEntry per ending from the day it was
// written and nothing ever consumed one. The failure mode is silent — a name with
// nothing behind it renders as an empty panel — so it is asserted from both ends.
for (const id of ENDING_IDS) {
  const declared = ENDING_REPLAY_UNLOCKS[id]?.archiveEntry;
  assert.ok(declared, `${id} declares an archive entry`);
  assert.ok(ENDING_ARCHIVE[declared], `${id} declares ${declared} and the document exists`);
  // The contract's residue and the unlock's archive entry are the same object
  // under two names; if they drift, an ending leaves two different things behind.
  assert.equal(endingManifest(id).residue, declared,
    `${id}: the contract's residue and the declared archive entry are the same document`);
}
for (const key of Object.keys(ENDING_ARCHIVE)) {
  assert.ok(ENDING_IDS.some((id) => ENDING_REPLAY_UNLOCKS[id]?.archiveEntry === key),
    `${key} is a document no ending leaves behind`);
}

// It resolves against a real summary and against nothing at all — the archive is
// reachable from the title screen, where there may be no run to interpolate.
for (const id of ENDING_IDS) {
  const entryId = ENDING_REPLAY_UNLOCKS[id].archiveEntry;
  for (const summary of [null, { takes: { completed: 5 }, equipment: { missing: ['recorder'] } }]) {
    const doc = endingArchiveDocument(entryId, summary);
    assert.ok(doc.title && doc.classification && doc.filedBy, `${entryId} is a filed document`);
    assert.ok(doc.body.length >= 4, `${entryId} says enough to be worth opening (${doc.body.length})`);
    for (const paragraph of doc.body) {
      assert.equal(typeof paragraph, 'string');
      assert.ok(paragraph.trim().length > 0, `${entryId} has no empty paragraphs`);
      assert.ok(!/undefined|NaN|\[object/.test(paragraph), `${entryId} interpolates cleanly: ${paragraph}`);
    }
  }
}

// And it arrives on the return file the archive actually renders.
{
  const meta = {
    endingsSeen: ['surfaced'],
    returns: {
      history: ['return:run_1'],
      records: { 'return:run_1': { id: 'return:run_1', endingId: 'surfaced', takes: { completed: 5 }, equipment: { missing: [] } } },
    },
  };
  const [file] = returnFileEntries(meta);
  assert.ok(file.document, 'a filed return carries its document');
  assert.equal(file.document.classification, 'EXTRACTION');
  assert.ok(file.residueLabel, 'and its physical residue label');
}

console.log('ending archive specs passed');
