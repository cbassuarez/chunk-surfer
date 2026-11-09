// One family is drawn for a physical take. Light, focus, pause and a temporary
// scene may suppress it, but cannot redraw the take into the other family.
export const RECORDING_SCARE_FAMILIES = Object.freeze(['hands', 'hallucinations']);

export function recordingScareAllowed({roomId = null, inB3 = false, scareFamily = null} = {}, family) {
  if (inB3 || roomId === 'main_b3' || roomId === 'level-check') return false;
  return scareFamily == null || scareFamily === family;
}

export function createRecordingScareSelector({random = Math.random} = {}) {
  const takes = new Map();
  return {
    select({recording = false, takeId = null, roomId = null, inB3 = false} = {}) {
      if (!recording || takeId == null || !roomId || inB3 || roomId === 'main_b3' || roomId === 'level-check') return 'none';
      const id = String(takeId);
      if (!takes.has(id)) {
        const roll = Number(random());
        takes.set(id, Number.isFinite(roll) && roll < .5 ? 'hands' : 'hallucinations');
      }
      return takes.get(id);
    },
    reset() { takes.clear(); },
    inspect(takeId) { return takes.get(String(takeId)) || 'none'; },
  };
}
