// Persist only victories. An open, lost, interrupted, or reloaded encounter is
// deliberately absent from the save and therefore arms again.

let cleared = new Set();

export function loadEncounterState(saved = {}) {
  cleared = new Set(saved.cleared || []);
}

export function encounterCleared(id) { return cleared.has(id); }

export function clearEncounter(id) {
  if (!id) return false;
  cleared.add(id);
  return true;
}

export function saveEncounterState() { return { cleared:[...cleared] }; }

export function encounterState() { return { cleared:[...cleared] }; }
