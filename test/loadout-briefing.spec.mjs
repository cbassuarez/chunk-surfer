import test from 'node:test';
import assert from 'node:assert/strict';

import { makeLoadoutBriefingScene } from '../src/game/loadout-briefing.js';
import { moveCombatGear, reorderCombatGear, normalizeCombatLoadout } from '../src/game/combat-loadout.js';

// A tiny in-memory loadout store so the scene can be driven without a save.
function harness(initialTop = ['light', 'recorder', 'radio']) {
  let loadout = normalizeCombatLoadout({ top: initialTop });
  const equipment = ['light', 'recorder', 'radio', 'interface', 'coffee'].map((id) => ({ id, present: true }));
  let confirmed = 0;
  const scene = makeLoadoutBriefingScene({
    getLoadout: () => loadout,
    getEquipment: () => equipment,
    moveEquipment: (id, dest) => { const r = moveCombatGear(loadout, id, dest); if (r.changed) loadout = r.loadout; return r; },
    reorderEquipment: (id, dir) => { const r = reorderCombatGear(loadout, id, dir); if (r.changed) loadout = r.loadout; return r; },
    onConfirm: () => { confirmed += 1; },
  });
  return { scene, get top() { return loadout.top; }, get confirmed() { return confirmed; } };
}

test('the briefing lists battle gear and previews the tray order', () => {
  const h = harness();
  const view = h.scene.view();
  assert.equal(view.id, 'loadout-briefing');
  assert.deepEqual(view.top, ['light', 'recorder', 'radio']);
  assert.equal(view.selected, 'light', 'selection starts on the first tray item');
});

test('SPACE patches gear between the tray and storage', () => {
  const h = harness();
  // Move the selected first item (light) out to storage.
  h.scene.key({ key: ' ' });
  assert.ok(!h.top.includes('light'), 'light left the tray');
  // Select the storage item that is now in the list and patch it back.
  const before = h.top.length;
  h.scene.key({ key: 'ArrowDown' });
  h.scene.key({ key: 'ArrowDown' });
  h.scene.key({ key: ' ' });
  assert.ok(h.top.length >= before, 'a storage item can be patched back in');
});

test('R reorders the tray, which is the in-fight tool rail order', () => {
  const h = harness();
  h.scene.key({ key: 'ArrowDown' }); // select recorder (index 1)
  h.scene.key({ key: 'r' });         // move it up
  assert.deepEqual(h.top.slice(0, 2), ['recorder', 'light'], 'the tool moved up in the rail order');
});

test('ENTER confirms and hands off to the fight exactly once', () => {
  const h = harness();
  h.scene.key({ key: 'Enter' });
  assert.equal(h.confirmed, 1);
});
