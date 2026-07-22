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
