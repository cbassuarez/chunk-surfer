import { BATTLE_GEAR, isCarryItem } from './carry-items.js';

// The field case has one reachable tray and one storage compartment.
// This module owns that contract without knowing about saves, scenes, or UI.

export const COMBAT_TOP_CAPACITY = 4;
export const COMBAT_LOADOUT_SCHEMA = 2;

export { BATTLE_GEAR } from './carry-items.js';

export const DEFAULT_COMBAT_TOP = Object.freeze(['light', 'recorder', 'radio']);

const sourceId = (value) => String(value || '').trim().toLowerCase();
// Empty interior bays have an address. Omitting only the empty tail keeps old
// starter saves small without moving a later tool into an earlier numbered bay.
const trimEmptyTail = (top) => {
  while (top.length && top[top.length - 1] == null) top.pop();
  return top;
};

export function combatBranchGear(branch) {
  const pair = Object.entries(BATTLE_GEAR).find(([, gear]) => gear.toolId === branch);
  return pair ? { id: pair[0], label: pair[1].label } : null;
}

export function isBattleGear(id) {
  return Object.hasOwn(BATTLE_GEAR, sourceId(id));
}

export function freshCombatLoadout() {
  return {
    schema: COMBAT_LOADOUT_SCHEMA,
    capacity: COMBAT_TOP_CAPACITY,
    top: [...DEFAULT_COMBAT_TOP],
    heldSlot: 0,
  };
}

export function normalizeCombatLoadout(value) {
  const rawTop = Array.isArray(value?.top) ? value.top : DEFAULT_COMBAT_TOP;
  const top = [];
  if (Number(value?.schema) >= COMBAT_LOADOUT_SCHEMA) {
    // Schema 1 (and unversioned arrays) was an ordered compact list. Schema 2
    // stores physical slot positions, so bad/duplicate entries leave a gap.
    for (const raw of rawTop.slice(0, COMBAT_TOP_CAPACITY)) {
      const id = sourceId(raw);
      top.push(isCarryItem(id) && !top.includes(id) ? id : null);
    }
    trimEmptyTail(top);
  } else {
    for (const raw of rawTop) {
      const id = sourceId(raw);
      if (!isCarryItem(id) || top.includes(id)) continue;
      if (top.length >= COMBAT_TOP_CAPACITY) break;
      top.push(id);
    }
  }
  return {
    schema: COMBAT_LOADOUT_SCHEMA,
    capacity: COMBAT_TOP_CAPACITY,
    top,
    heldSlot: value?.heldSlot === null ? null
      : Number.isInteger(value?.heldSlot) && value.heldSlot >= 0 && value.heldSlot < COMBAT_TOP_CAPACITY ? value.heldSlot : 0,
  };
}

// This is a slot preference, not a second item owner. An empty, missing or
// deployed item is resolved by the caller as lowered hands; it does not move
// the preference to another bay or make an absent object available.
export function selectHeldCombatSlot(loadout, slotIndex) {
  const normalized = normalizeCombatLoadout(loadout);
  if (slotIndex !== null && (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= normalized.capacity)) {
    return { loadout: normalized, changed: false, reason: 'invalid-slot' };
  }
  if (normalized.heldSlot === slotIndex) return { loadout: normalized, changed: false, reason: 'already-held-slot' };
  return { loadout: { ...normalized, heldSlot: slotIndex }, changed: true, reason: null };
}

export function combatCompartment(loadout, id) {
  return normalizeCombatLoadout(loadout).top.includes(sourceId(id)) ? 'top' : 'storage';
}

export function moveCombatGear(loadout, id, destination) {
  const normalized = normalizeCombatLoadout(loadout);
  const key = sourceId(id);
  if (!isCarryItem(key)) return { loadout: normalized, changed: false, reason: 'not-battle-gear' };

  if (destination === 'storage') {
    const at = normalized.top.indexOf(key);
    if (at < 0) return { loadout: normalized, changed: false, reason: 'already-storage' };
    const top = [...normalized.top];
    top[at] = null;
    return {
      loadout: { ...normalized, top: trimEmptyTail(top) },
      changed: true,
      reason: null,
    };
  }

  if (destination !== 'top') return { loadout: normalized, changed: false, reason: 'invalid-destination' };
  if (normalized.top.includes(key)) return { loadout: normalized, changed: false, reason: 'already-top' };
  const free = normalized.top.indexOf(null);
  if (free < 0 && normalized.top.length >= normalized.capacity) return { loadout: normalized, changed: false, reason: 'top-full' };
  const top = [...normalized.top];
  if (free >= 0) top[free] = key;
  else top.push(key);
  return {
    loadout: { ...normalized, top },
    changed: true,
    reason: null,
  };
}

// Assign a carried object to an explicit numbered contact slot. Replacing a storage item
// moves the previous occupant back into storage; moving a tool that is already
// ready swaps the two slots. The UI can therefore promise a numbered slot
// without first forcing the player to clear it manually.
export function assignCombatGearSlot(loadout, id, slotIndex) {
  const normalized = normalizeCombatLoadout(loadout);
  const key = sourceId(id);
  const slot = Math.floor(Number(slotIndex));
  if (!isCarryItem(key)) return { loadout: normalized, changed: false, reason: 'not-battle-gear' };
  if (!Number.isFinite(slot) || slot < 0 || slot >= normalized.capacity) {
    return { loadout: normalized, changed: false, reason: 'invalid-slot' };
  }

  const top = [...normalized.top];
  const from = top.indexOf(key);
  if (from === slot) return { loadout: normalized, changed: false, reason: 'already-in-slot' };

  while (top.length <= slot) top.push(null);
  if (from >= 0) [top[from], top[slot]] = [top[slot], top[from]];
  else top[slot] = key;

  return { loadout: { ...normalized, top: trimEmptyTail(top) }, changed: true, reason: null };
}

// Reorder a piece of gear within the tray. The tray order is the in-fight tool
// rail order (availableBattleTools returns tools in `top` order, and combat
// honours that). Move by one numbered bay, including an empty bay, rather than
// skipping holes or pulling everything after the moved tool into a new slot.
export function reorderCombatGear(loadout, id, direction) {
  const normalized = normalizeCombatLoadout(loadout);
  const key = sourceId(id);
  const at = normalized.top.indexOf(key);
  if (at < 0) return { loadout: normalized, changed: false, reason: 'not-in-top' };
  const step = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (!step) return { loadout: normalized, changed: false, reason: 'invalid-direction' };
  const to = at + step;
  if (to < 0 || to >= normalized.capacity) return { loadout: normalized, changed: false, reason: 'at-edge' };
  const top = [...normalized.top];
  while (top.length <= to) top.push(null);
  [top[at], top[to]] = [top[to], top[at]];
  return { loadout: { ...normalized, top: trimEmptyTail(top) }, changed: true, reason: null };
}

export function availableBattleTools(loadout, equipment = []) {
  const normalized = normalizeCombatLoadout(loadout);
  const present = new Set(
    (Array.isArray(equipment) ? equipment : [])
      .filter((entry) => entry?.present !== false)
      .map((entry) => sourceId(entry?.id || entry?.sourceId || entry)),
  );
  return normalized.top
    .filter((id) => isBattleGear(id) && present.has(id))
    .map((id) => BATTLE_GEAR[id].toolId);
}
