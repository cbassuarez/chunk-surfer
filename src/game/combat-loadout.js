// The field case has one reachable battle tray and one storage compartment.
// This module owns that contract without knowing about saves, scenes, or UI.

export const COMBAT_TOP_CAPACITY = 4;
export const COMBAT_LOADOUT_SCHEMA = 1;

export const BATTLE_GEAR = Object.freeze({
  light: Object.freeze({ toolId: 'torch', label: 'FIELD TORCH' }),
  recorder: Object.freeze({ toolId: 'recorder', label: 'RECORDER' }),
  interface: Object.freeze({ toolId: 'rig', label: 'BENT RIG' }),
  'tuning-fork': Object.freeze({ toolId: 'fork', label: 'TUNING FORK' }),
  radio: Object.freeze({ toolId: 'radio', label: 'RADIO' }),
  coffee: Object.freeze({ toolId: 'coffee', label: 'COFFEE' }),
});

export const DEFAULT_COMBAT_TOP = Object.freeze(['light', 'recorder', 'radio']);

const sourceId = (value) => String(value || '').trim().toLowerCase();

export function isBattleGear(id) {
  return !!BATTLE_GEAR[sourceId(id)];
}

export function freshCombatLoadout() {
  return {
    schema: COMBAT_LOADOUT_SCHEMA,
    capacity: COMBAT_TOP_CAPACITY,
    top: [...DEFAULT_COMBAT_TOP],
  };
}

export function normalizeCombatLoadout(value) {
  const rawTop = Array.isArray(value?.top) ? value.top : DEFAULT_COMBAT_TOP;
  const top = [];
  for (const raw of rawTop) {
    const id = sourceId(raw);
    if (!isBattleGear(id) || top.includes(id)) continue;
    if (top.length >= COMBAT_TOP_CAPACITY) break;
    top.push(id);
  }
  return {
    schema: COMBAT_LOADOUT_SCHEMA,
    capacity: COMBAT_TOP_CAPACITY,
    top,
  };
}

export function combatCompartment(loadout, id) {
  return normalizeCombatLoadout(loadout).top.includes(sourceId(id)) ? 'top' : 'storage';
}

export function moveCombatGear(loadout, id, destination) {
  const normalized = normalizeCombatLoadout(loadout);
  const key = sourceId(id);
  if (!isBattleGear(key)) return { loadout: normalized, changed: false, reason: 'not-battle-gear' };

  if (destination === 'storage') {
    if (!normalized.top.includes(key)) return { loadout: normalized, changed: false, reason: 'already-storage' };
    return {
      loadout: { ...normalized, top: normalized.top.filter((entry) => entry !== key) },
      changed: true,
      reason: null,
    };
  }

  if (destination !== 'top') return { loadout: normalized, changed: false, reason: 'invalid-destination' };
  if (normalized.top.includes(key)) return { loadout: normalized, changed: false, reason: 'already-top' };
  if (normalized.top.length >= normalized.capacity) return { loadout: normalized, changed: false, reason: 'top-full' };
  return {
    loadout: { ...normalized, top: [...normalized.top, key] },
    changed: true,
    reason: null,
  };
}

// Assign a tool to an explicit numbered contact slot. Replacing a storage item
// moves the previous occupant back into storage; moving a tool that is already
// ready swaps the two slots. The UI can therefore promise a numbered slot
// without first forcing the player to clear it manually.
export function assignCombatGearSlot(loadout, id, slotIndex) {
  const normalized = normalizeCombatLoadout(loadout);
  const key = sourceId(id);
  const slot = Math.floor(Number(slotIndex));
  if (!isBattleGear(key)) return { loadout: normalized, changed: false, reason: 'not-battle-gear' };
  if (!Number.isFinite(slot) || slot < 0 || slot >= normalized.capacity) {
    return { loadout: normalized, changed: false, reason: 'invalid-slot' };
  }

  const top = [...normalized.top];
  const from = top.indexOf(key);
  if (from === slot) return { loadout: normalized, changed: false, reason: 'already-in-slot' };

  if (from >= 0) {
    if (slot < top.length) [top[from], top[slot]] = [top[slot], top[from]];
    else {
      top.splice(from, 1);
      top.push(key);
    }
  } else if (slot < top.length) {
    top[slot] = key;
  } else {
    top.push(key);
  }

  return { loadout: { ...normalized, top }, changed: true, reason: null };
}

// Reorder a piece of gear within the tray. The tray order is the in-fight tool
// rail order (availableBattleTools returns tools in `top` order, and combat
// honours that), so this is how the player shapes which tool sits first.
export function reorderCombatGear(loadout, id, direction) {
  const normalized = normalizeCombatLoadout(loadout);
  const key = sourceId(id);
  const at = normalized.top.indexOf(key);
  if (at < 0) return { loadout: normalized, changed: false, reason: 'not-in-top' };
  const step = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (!step) return { loadout: normalized, changed: false, reason: 'invalid-direction' };
  const to = at + step;
  if (to < 0 || to >= normalized.top.length) return { loadout: normalized, changed: false, reason: 'at-edge' };
  const top = [...normalized.top];
  [top[at], top[to]] = [top[to], top[at]];
  return { loadout: { ...normalized, top }, changed: true, reason: null };
}

export function availableBattleTools(loadout, equipment = []) {
  const normalized = normalizeCombatLoadout(loadout);
  const present = new Set(
    (Array.isArray(equipment) ? equipment : [])
      .filter((entry) => entry?.present !== false)
      .map((entry) => sourceId(entry?.id || entry?.sourceId || entry)),
  );
  return normalized.top
    .filter((id) => present.has(id))
    .map((id) => BATTLE_GEAR[id].toolId);
}
