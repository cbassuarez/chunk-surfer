import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_TOP_CAPACITY,
  assignCombatGearSlot,
  availableBattleTools,
  freshCombatLoadout,
  moveCombatGear,
  normalizeCombatLoadout,
  reorderCombatGear,
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

test('reordering the tray moves gear and holds at the edges', () => {
  const start = normalizeCombatLoadout({ top: ['light', 'recorder', 'radio'] });
  const up = reorderCombatGear(start, 'recorder', 'up');
  assert.equal(up.changed, true);
  assert.deepEqual(up.loadout.top, ['recorder', 'light', 'radio']);
  const down = reorderCombatGear(start, 'recorder', 'down');
  assert.deepEqual(down.loadout.top, ['light', 'radio', 'recorder']);
  // Edges and non-tray gear are no-ops with a reason.
  assert.deepEqual(reorderCombatGear(start, 'light', 'up'), { loadout: start, changed: false, reason: 'at-edge' });
  assert.equal(reorderCombatGear(start, 'coffee', 'up').reason, 'not-in-top');
  assert.equal(reorderCombatGear(start, 'light', 'sideways').reason, 'invalid-direction');
});

test('explicit slot assignment replaces storage gear and swaps ready gear',()=>{
  const start=normalizeCombatLoadout({top:['light','recorder','radio']});
  assert.deepEqual(assignCombatGearSlot(start,'coffee',1).loadout.top,['light','coffee','radio']);
  assert.deepEqual(assignCombatGearSlot(start,'radio',0).loadout.top,['radio','recorder','light']);
  assert.equal(assignCombatGearSlot(start,'map',0).reason,'not-battle-gear');
});

test('the tray order is the in-fight tool rail order', () => {
  // Reordering the tray must reorder the tools combat receives — the whole
  // point of a player-controlled loadout order.
  const start = normalizeCombatLoadout({ top: ['light', 'recorder', 'radio'] });
  const present = [{ id: 'light' }, { id: 'recorder' }, { id: 'radio' }];
  assert.deepEqual(availableBattleTools(start, present), ['torch', 'recorder', 'radio']);
  const moved = reorderCombatGear(start, 'radio', 'up').loadout;
  assert.deepEqual(availableBattleTools(moved, present), ['torch', 'radio', 'recorder']);
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
