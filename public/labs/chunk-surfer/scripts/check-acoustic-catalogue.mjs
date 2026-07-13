import assert from 'node:assert/strict';
import { ACOUSTIC_CATALOGUE, validateAcousticCatalogue } from '../src/audio/acoustic-catalogue.js';
import { HUSH_MISCHIEF_CUES } from '../src/data/hush-cues.js';

const result = validateAcousticCatalogue(ACOUSTIC_CATALOGUE);
assert.equal(result.ok, true, result.errors.join('\n'));

const ids = Object.keys(ACOUSTIC_CATALOGUE);
assert.equal(new Set(ids).size, ids.length, 'duplicate acoustic catalogue ids');

const cueIds = HUSH_MISCHIEF_CUES.map((cue) => cue.id);
assert.equal(new Set(cueIds).size, cueIds.length, 'duplicate HUSH mischief cue ids');

for (const cue of HUSH_MISCHIEF_CUES) {
  assert.equal(cue.gameplay?.emittedAsWorldNoise, false, `${cue.id} may recursively alert the HUSH`);
  assert.equal(cue.gameplay?.maySpoilTake, false, `${cue.id} may falsify recording state`);
  assert.ok(Number.isFinite(cue.selection?.familyCooldownMs), `${cue.id} missing family cooldown`);
  assert.ok(Number.isFinite(cue.selection?.cueCooldownMs), `${cue.id} missing cue cooldown`);
  assert.ok(Number.isFinite(cue.selection?.maxPerRun), `${cue.id} missing run cap`);
  assert.ok(typeof cue.caption?.text === 'string' && cue.caption.text.length > 0, `${cue.id} missing accessible caption`);
}

console.log('acoustic catalogue ok');
console.log(`${ids.length} semantic noise kinds`);
console.log(`${cueIds.length} fair mischief cues`);
