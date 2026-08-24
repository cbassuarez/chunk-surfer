// Physical interaction for the heating-header incident.
//
// The persisted incident owns whether the pipe is open or sealed.  This module
// owns the hand movement between those facts: real clockwise travel, a separate
// subjective rear hiss, and the look-back that proves there was no body there.
// Nothing here can create Presence, noise belief, a contact, or a saved HUSH.

const TAU = Math.PI * 2;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const PLANT_VALVE_TURNS = Object.freeze({
  spanner: 1.35,
  stillson: 2.6,
});

export function createPlantValveTurn(tool = 'spanner') {
  const id = tool === 'stillson' ? 'stillson' : 'spanner';
  return { tool: id, radians: 0, requiredRadians: PLANT_VALVE_TURNS[id] * TAU, progress: 0, complete: false };
}

export function applyPlantValveRotation(value, radians = 0) {
  const current = value?.requiredRadians ? value : createPlantValveTurn(value?.tool);
  // One pointer packet cannot close the valve.  Bounding the contribution also
  // rejects cursor warps at the atan2 seam while preserving deliberate arcs.
  const clockwise = Math.max(0, Math.min(Math.PI * .72, Number(radians) || 0));
  const total = Math.min(current.requiredRadians, current.radians + clockwise);
  const progress = clamp01(total / current.requiredRadians);
  return { ...current, radians: total, progress, complete: progress >= 1 };
}

export function applyPlantValveStroke(value) {
  const current = value?.requiredRadians ? value : createPlantValveTurn(value?.tool);
  // Keyboard/controller accessibility is still physical: one press is one
  // short wrench heave, never a held key or elapsed-time completion.
  const stroke = current.tool === 'stillson' ? Math.PI * .31 : Math.PI * .42;
  return applyPlantValveRotation(current, stroke);
}

const smooth = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

export function plantValveAudioFrame(base = {}, turn = null, { rearActive = true } = {}) {
  const progress = clamp01(turn?.progress);
  const transfer = smooth(progress);
  // The actual valve source closes.  A louder, spatially separate copy rises
  // behind the listener, so the perceived hiss grows even as the pipe is being
  // made mechanically quiet.  The monitor follows the real pipe, not the lie.
  const pipe = (1 - transfer) ** 1.25;
  const rear = rearActive ? .355 * transfer : 0;
  return {
    ...base,
    audible: pipe > .01 || rear > .01,
    world: Math.max(0, Number(base.world) || 0) * pipe,
    monitor: Math.max(0, Number(base.monitor) || 0) * pipe,
    rear,
    valveProgress: progress,
  };
}

export function plantLookBackProgress(originYaw = 0, currentYaw = 0) {
  const delta = Math.atan2(Math.sin(Number(currentYaw) - Number(originYaw)), Math.cos(Number(currentYaw) - Number(originYaw)));
  return clamp01(Math.abs(delta) / Math.PI);
}

