import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bag close removes the bag scene itself instead of blindly popping the top overlay', () => {
  const source = readFileSync('src/game/bag.js', 'utf8');
  const closeStart = source.indexOf('function close(');
  const closeEnd = source.indexOf('function applyChosenSkills', closeStart);
  assert.ok(closeStart >= 0 && closeEnd > closeStart, 'bag close function can be located');
  const closeBody = source.slice(closeStart, closeEnd);
  assert.match(closeBody, /scenes\.remove\(scene\)/, 'close removes the bag scene by reference');
  assert.doesNotMatch(closeBody, /scenes\.pop\(\)/, 'close does not pop an unrelated top overlay');
  assert.match(closeBody, /if \(removed\) \{[\s\S]*onClearInput\(\{suppressReopen\}\);[\s\S]*onClose\(\);[\s\S]*\}/, 'input clears and onClose fires only after the bag was removed');
});
