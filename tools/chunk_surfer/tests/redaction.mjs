// Compatibility entrypoint for the former redaction harness.
import assert from 'node:assert/strict';
import { authoredCombatProfile } from '../../../src/data/combat-definitions.js';
import { validateCombatDefinition } from '../../../src/game/combat-state.js';

for (const id of ['natatorium', 'practice', 'hall', 'chapel', 'source']) {
  const definition = { id, enemy: id.toUpperCase(), baseComposure: 8, ...authoredCombatProfile(id) };
  assert.deepEqual(validateCombatDefinition(definition), [], id);
}
console.log('PASS  all deterministic signal-combat definitions');
