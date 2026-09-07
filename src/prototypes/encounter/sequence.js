// Presentation owns the turn gate. Combat is created only after READY.
export const ENCOUNTER_PHASES = Object.freeze([
  { id: 'exploration', duration: null },
  { id: 'called', duration: .48 },
  { id: 'intrusion', duration: .20 },
  { id: 'versus', duration: .94 },
  { id: 'battle', duration: .38 },
  { id: 'reveal', duration: 1.16 },
  { id: 'dialogue', duration: null },
  { id: 'equipment', duration: null },
  { id: 'arming', duration: .68 },
  { id: 'fight', duration: null },
  { id: 'result', duration: null },
]);

export function createEncounterSequence({ dialogue = true } = {}) {
  let index = 0, elapsed = 0, paused = false;
  const snapshot = () => ({ phase: ENCOUNTER_PHASES[index].id, elapsed, paused,
    progress: ENCOUNTER_PHASES[index].duration ? Math.min(1, elapsed / ENCOUNTER_PHASES[index].duration) : 0,
    canAct: !paused && ENCOUNTER_PHASES[index].id === 'fight' });
  const next = () => {
    index = Math.min(index + 1, ENCOUNTER_PHASES.length - 1); elapsed = 0;
    if (!dialogue && ENCOUNTER_PHASES[index].id === 'dialogue') index++;
  };
  return {
    snapshot,
    tick(dt) {
      if (paused) return snapshot();
      // A long frame must not swallow the one-frame intrusion or an entire wipe.
      elapsed += Math.max(0, Math.min(.08, Number(dt) || 0));
      if (ENCOUNTER_PHASES[index].duration && elapsed >= ENCOUNTER_PHASES[index].duration) next();
      return snapshot();
    },
    confirm({ repeat = false } = {}) {
      if (!paused && !repeat && ['exploration', 'dialogue', 'equipment'].includes(snapshot().phase)) next();
      return snapshot();
    },
    finish() { if (snapshot().canAct) { index = ENCOUNTER_PHASES.length - 1; elapsed = 0; } return snapshot(); },
    pause(value) { paused = !!value; return snapshot(); },
    // Review-only seek. No production caller imports this module.
    preview(phase) {
      const target = ENCOUNTER_PHASES.findIndex(p => p.id === phase);
      if (target >= 0) { index = target; elapsed = 0; }
      return snapshot();
    },
  };
}
