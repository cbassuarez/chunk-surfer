import assert from 'node:assert/strict';

import { authoringDocumentsById } from '../src/narrative/generated-content.js';
import {
  SOURCE_CONTACT_INSIGHTS,
  freshSourceContactState,
  nextSourceContact,
  normalizeSourceContactState,
  resolveSourceContact,
  sourceBossExposed,
} from '../src/game/source-contact.js';
import { makeSourceContactScene } from '../src/game/source-contact-scene.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const document = authoringDocumentsById.get('source-space.contact');
assert.ok(document);
const serialised = JSON.stringify(document).toLowerCase();
assert.doesNotMatch(serialised, /"who":"hush"/);
for (const node of Object.values(document.nodes)) {
  for (const line of node.lines || []) {
    assert.ok(['unattributed', 'chunkSurferTrace'].includes(line.signalRole));
  }
  assert.ok((node.choices || []).every((choice) => !/\b(correct|wrong)\b/i.test(choice.text)));
}

let contact = freshSourceContactState();
const first = nextSourceContact(contact, { seed: 4417 });
const missed = first.choices.find((choice) => !choice.aligns);
contact = resolveSourceContact(contact, first, missed.id);
assert.equal(contact.captures, 1);
assert.deepEqual(contact.insights, []);
const retry = nextSourceContact(contact, { seed: 4417 });
assert.equal(retry.insightId, first.insightId, 'a missed insight returns in different wording');
assert.notEqual(retry.id, first.id, 'contact beats do not repeat while an unseen variant exists');

while (!sourceBossExposed(contact)) {
  const encounter = nextSourceContact(contact, { seed: 4417 });
  const aligned = encounter.choices.find((choice) => choice.aligns);
  assert.ok(aligned, `${encounter.id} has no aligned response`);
  contact = resolveSourceContact(contact, encounter, aligned.id);
}
assert.deepEqual(contact.insights, SOURCE_CONTACT_INSIGHTS);
assert.equal(new Set(contact.seenBeats).size, contact.seenBeats.length);
assert.equal(sourceBossExposed(JSON.parse(JSON.stringify(contact))), true);

const normalized = normalizeSourceContactState({ ...contact, insights: [...contact.insights, 'hidden-answer'], seenBeats: [...contact.seenBeats, contact.seenBeats[0]] });
assert.deepEqual(normalized.insights, SOURCE_CONTACT_INSIGHTS);
assert.equal(new Set(normalized.seenBeats).size, normalized.seenBeats.length);

let resolution = null;
const scene = makeSourceContactScene({ encounter: first, onResolve: (id, meta) => { resolution = { id, meta }; } });
assert.equal(scene.blocksWorld, false);
assert.equal(scene.allowsLook, true);
assert.equal(scene.sourcePressureLive, true);
scene.key({ key: 'Enter' });
scene.key({ key: 'Enter' });
scene.key({ key: 'Enter' });
assert.ok(resolution);
assert.equal(typeof resolution.meta.aligned, 'boolean');

const inertBuilt=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT,{seed:4417,hasRig:false});
const inertRuntime=createSourceSpaceRuntime({initialState:inertBuilt.state});
inertRuntime.setPlayerPosition(inertBuilt.position);
assert.equal(inertRuntime.sourceScene().dynamicInstances.filter((entry)=>entry.semantic==='source-resolved-interval').length,9,
  'three understood intervals visibly alter Source geometry');
assert.equal(inertRuntime.finalEncounterRequest().exposed,true);
assert.equal(inertRuntime.finalEncounterRequest().rigAvailable,false);
assert.equal(inertRuntime.finalEncounterRequest().battleAvailable,false,'the exposed return fault stays inert without the rig');
assert.equal(inertRuntime.finalEncounterRequest().normalExitAvailable,true);
assert.equal('lastChoiceId' in inertRuntime.probe().contact,false,'diagnostics never expose hidden answer choices');

console.log('source contact specs passed');
