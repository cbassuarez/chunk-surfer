import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_TOP_CAPACITY,
  availableBattleTools,
  freshCombatLoadout,
  moveCombatGear,
  normalizeCombatLoadout,
} from '../src/game/combat-loadout.js';

test('older saves receive a conservative starter tray with one open slot', () => {
  const loadout = normalizeCombatLoadout(null);
  assert.equal(loadout.capacity, COMBAT_TOP_CAPACITY);
  assert.deepEqual(loadout.top, ['light', 'recorder', 'radio']);
  assert.deepEqual(loadout, freshCombatLoadout());
});

test('the top compartment is unique, battle-gear-only, and capacity limited', () => {
  const normalized = normalizeCombatLoadout({
    top: ['light', 'light', 'map', 'recorder', 'radio', 'coffee', 'interface'],
  });
  assert.deepEqual(normalized.top, ['light', 'recorder', 'radio', 'coffee']);
  const full = moveCombatGear(normalized, 'interface', 'top');
  assert.equal(full.changed, false);
  assert.equal(full.reason, 'top-full');
  const storage = moveCombatGear(normalized, 'radio', 'storage');
  assert.equal(storage.changed, true);
  assert.deepEqual(storage.loadout.top, ['light', 'recorder', 'coffee']);
  const packed = moveCombatGear(storage.loadout, 'interface', 'top');
  assert.deepEqual(packed.loadout.top, ['light', 'recorder', 'coffee', 'interface']);
});

test('combat receives only present gear from the saved top compartment', () => {
  const tools = availableBattleTools(
    { top: ['light', 'recorder', 'radio', 'coffee'] },
    [
      { id: 'light', present: false },
      { id: 'recorder', present: true },
      { id: 'radio', present: true },
      { id: 'coffee', present: false },
      { id: 'interface', present: true },
    ],
  );
  assert.deepEqual(tools, ['recorder', 'radio']);
});
