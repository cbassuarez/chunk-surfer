import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_TOP_CAPACITY,
  COMBAT_LOADOUT_SCHEMA,
  assignCombatGearSlot,
  availableBattleTools,
  freshCombatLoadout,
  moveCombatGear,
  normalizeCombatLoadout,
  reorderCombatGear,
  selectHeldCombatSlot,
} from '../src/game/combat-loadout.js';

test('older saves receive a conservative starter tray with one open slot', () => {
  const loadout = normalizeCombatLoadout(null);
  assert.equal(loadout.capacity, COMBAT_TOP_CAPACITY);
  assert.equal(loadout.schema, COMBAT_LOADOUT_SCHEMA);
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
  assert.deepEqual(storage.loadout.top, ['light', 'recorder', null, 'coffee']);
  const packed = moveCombatGear(storage.loadout, 'interface', 'top');
  assert.deepEqual(packed.loadout.top, ['light', 'recorder', 'interface', 'coffee']);
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

test('old compact saves migrate once and schema 2 preserves physical gaps on every reload', () => {
  const legacy = { schema: 1, top: ['light', null, 'map', 'recorder', 'light', 'radio'] };
  const unversioned = { top: [...legacy.top] };
  for (const input of [legacy, unversioned]) {
    const before = structuredClone(input);
    const migrated = normalizeCombatLoadout(input);
    assert.deepEqual(migrated, { schema: 2, capacity: 4, top: ['light', 'recorder', 'radio'], heldSlot: 0 });
    assert.deepEqual(input, before, 'migration changed the source save');
    assert.deepEqual(normalizeCombatLoadout(JSON.parse(JSON.stringify(migrated))), migrated);
  }
  const numbered = normalizeCombatLoadout({ schema: 2, top: ['light', null, 'map', 'radio'] });
  assert.deepEqual(numbered.top, ['light', null, null, 'radio']);
  assert.deepEqual(normalizeCombatLoadout(JSON.parse(JSON.stringify(numbered))), numbered);
  assert.deepEqual(normalizeCombatLoadout({ schema: 2, top: ['radio', 'radio', 'light', null, 'recorder'] }).top,
    ['radio', null, 'light'], 'duplicate and invalid bays must not pull later gear forward');
});

test('choosing numbered slot four places an item in slot four even when earlier slots are empty', () => {
  const source = { schema: 2, capacity: 4, top: ['light'] };
  const result = assignCombatGearSlot(source, 'coffee', 3);
  assert.equal(result.changed, true);
  assert.deepEqual(result.loadout.top, ['light', null, null, 'coffee']);
  assert.deepEqual(source.top, ['light']);
  assert.deepEqual(assignCombatGearSlot({ schema: 2, top: [] }, 'radio', 3).loadout.top,
    [null, null, null, 'radio']);
  assert.equal(assignCombatGearSlot(source, 'coffee', 4).reason, 'invalid-slot');
});

test('clearing a numbered bay never renumbers later gear and general packing fills the first free bay', () => {
  const source = assignCombatGearSlot({ top: ['light', 'recorder', 'radio'] }, 'coffee', 3).loadout;
  const cleared = moveCombatGear(source, 'recorder', 'storage').loadout;
  assert.deepEqual(cleared.top, ['light', null, 'radio', 'coffee']);
  assert.deepEqual(moveCombatGear(cleared, 'interface', 'top').loadout.top,
    ['light', 'interface', 'radio', 'coffee']);
  const tailCleared = moveCombatGear(cleared, 'coffee', 'storage').loadout;
  assert.deepEqual(tailCleared.top, ['light', null, 'radio'], 'only the empty tail may be omitted');
  assert.deepEqual(normalizeCombatLoadout(JSON.parse(JSON.stringify(tailCleared))), tailCleared);
  assert.equal(moveCombatGear(tailCleared, 'recorder', 'storage').reason, 'already-storage');
});

test('moving an already assigned item swaps actual numbered bays, including an empty bay', () => {
  const source = { schema: 2, top: ['light', null, 'radio', 'coffee'] };
  assert.deepEqual(assignCombatGearSlot(source, 'radio', 0).loadout.top,
    ['radio', null, 'light', 'coffee']);
  assert.deepEqual(assignCombatGearSlot(source, 'light', 1).loadout.top,
    [null, 'light', 'radio', 'coffee']);
  assert.deepEqual(assignCombatGearSlot({ schema: 2, top: ['light'] }, 'light', 3).loadout.top,
    [null, null, null, 'light']);
  assert.deepEqual(assignCombatGearSlot({ schema: 2, top: [null, null, null, 'light'] }, 'light', 0).loadout.top,
    ['light']);
});

test('reorder advances by one physical bay rather than skipping gaps or treating an empty tail as the edge', () => {
  const source = { schema: 2, top: ['light', null, 'radio'] };
  assert.deepEqual(reorderCombatGear(source, 'light', 'down').loadout.top,
    [null, 'light', 'radio']);
  assert.deepEqual(reorderCombatGear(source, 'radio', 'up').loadout.top,
    ['light', 'radio']);
  const fourth = reorderCombatGear(source, 'radio', 'down').loadout;
  assert.deepEqual(fourth.top, ['light', null, null, 'radio']);
  assert.equal(reorderCombatGear(fourth, 'radio', 'down').reason, 'at-edge');
});

test('loss and recovery filter battle tools without rewriting saved slots or moving other gear', () => {
  const saved = { schema: 2, capacity: 4, top: ['light', null, 'radio', 'recorder'], heldSlot: 0 };
  const before = structuredClone(saved);
  const missing = [{ id: 'light', present: false }, { id: 'radio', present: false }, { id: 'recorder', present: true }];
  assert.deepEqual(availableBattleTools(saved, missing), ['recorder']);
  assert.deepEqual(saved, before);
  const reloaded = normalizeCombatLoadout(JSON.parse(JSON.stringify(saved)));
  const recovered = missing.map(entry => ({ ...entry, present: true }));
  assert.deepEqual(availableBattleTools(reloaded, recovered), ['torch', 'radio', 'recorder']);
  assert.deepEqual(reloaded, before);
  assert.deepEqual(availableBattleTools({ schema: 2, top: [null, null, null, 'badge'] }, recovered), []);
});

test('deliberately empty ready inventories survive normalization and serialization', () => {
  for (const input of [{ top: [] }, { schema: 2, top: [null, null, null, null] }]) {
    const normalized = normalizeCombatLoadout(input);
    assert.deepEqual(normalized.top, []);
    assert.deepEqual(normalizeCombatLoadout(JSON.parse(JSON.stringify(normalized))), normalized);
    assert.deepEqual(availableBattleTools(normalized, ['light', 'recorder', 'radio']), []);
  }
});

test('malformed saved entries cannot occupy bays through object-prototype names', () => {
  const saved = { schema: 2, top: ['constructor', 'light', '__proto__', 'radio'] };
  assert.deepEqual(normalizeCombatLoadout(saved).top, [null, 'light', null, 'radio']);
  assert.equal(assignCombatGearSlot(saved, '__proto__', 0).reason, 'not-battle-gear');
  assert.deepEqual(availableBattleTools(saved, ['constructor', 'light', '__proto__', 'radio']), ['torch', 'radio']);
});

test('the same saved loadout owns the held-slot preference and explicit lowered hands', () => {
  assert.equal(freshCombatLoadout().heldSlot, 0);
  assert.equal(normalizeCombatLoadout({ schema: 1, top: ['radio'] }).heldSlot, 0);
  for (const heldSlot of [0, 1, 2, 3, null]) {
    const saved = normalizeCombatLoadout({ schema: 2, top: ['light', null, 'radio'], heldSlot });
    assert.equal(saved.heldSlot, heldSlot);
    assert.deepEqual(normalizeCombatLoadout(JSON.parse(JSON.stringify(saved))), saved);
  }
  for (const heldSlot of [-1, 4, 1.5, NaN, '3', {}, undefined]) {
    assert.equal(normalizeCombatLoadout({ schema: 2, heldSlot }).heldSlot, 0);
  }
});

test('selecting a held bay preserves all inventory slots and does not require a phantom item', () => {
  const source = normalizeCombatLoadout({ schema: 2, top: ['light', null, 'radio'] });
  const before = structuredClone(source), selected = selectHeldCombatSlot(source, 3);
  assert.equal(selected.changed, true);
  assert.equal(selected.loadout.heldSlot, 3, 'an empty bay may be preferred without filling it');
  assert.deepEqual(selected.loadout.top, before.top);
  assert.deepEqual(source, before);
  const lowered = selectHeldCombatSlot(selected.loadout, null);
  assert.equal(lowered.changed, true);
  assert.equal(lowered.loadout.heldSlot, null);
  assert.deepEqual(lowered.loadout.top, before.top);
  assert.equal(selectHeldCombatSlot(lowered.loadout, null).reason, 'already-held-slot');
  assert.equal(selectHeldCombatSlot(source, 0).reason, 'already-held-slot');
  for (const invalid of [-1, 4, 1.2, NaN, undefined, '2']) {
    const result = selectHeldCombatSlot(source, invalid);
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'invalid-slot');
    assert.deepEqual(result.loadout, source);
  }
});

test('assigning, stowing and reordering keep the preferred physical slot rather than following an item', () => {
  const source = { schema: 2, top: ['light', 'recorder', 'radio'], heldSlot: 1 };
  for (const result of [
    assignCombatGearSlot(source, 'radio', 1),
    moveCombatGear(source, 'recorder', 'storage'),
    reorderCombatGear(source, 'recorder', 'down'),
    moveCombatGear(source, 'coffee', 'top'),
  ]) {
    assert.equal(result.changed, true);
    assert.equal(result.loadout.heldSlot, 1);
  }
  const lowered = { ...source, heldSlot: null };
  assert.equal(assignCombatGearSlot(lowered, 'coffee', 3).loadout.heldSlot, null);
});
