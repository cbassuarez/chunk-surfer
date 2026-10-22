// A reply belongs to the door still within reach, not to a browser timer. Losing
// that context discards it; returning later is a fresh encounter with the door.
export function createShutDoorAnswer() {
  let owner = null;
  let pending = null;
  let spent = false;

  function clear() {
    owner = null;
    pending = null;
    spent = false;
  }

  function contextIsCurrent(context) {
    if (!context?.eligible || !context.runtime || !context.phase || !context.doorId) {
      clear();
      return false;
    }
    if (!owner || owner.runtime !== context.runtime || owner.phase !== context.phase || owner.doorId !== context.doorId) {
      clear();
      owner = { runtime: context.runtime, phase: context.phase, doorId: context.doorId };
    }
    return true;
  }

  function request(result, context) {
    if (!contextIsCurrent(context) || spent || !result?.answer
        || !Number.isFinite(result.position?.x) || !Number.isFinite(result.position?.z)) return false;
    const answer = result.answer;
    pending = {
      answer: { ...answer },
      position: { x: result.position.x, z: result.position.z },
      remaining: Math.max(0, Number(answer.delayMs) || 0) / 1000,
    };
    owner.position = { ...pending.position };
    // Repeated keydowns must neither queue replies nor continually postpone one.
    spent = true;
    return true;
  }

  function advance(dt, context) {
    if (!contextIsCurrent(context) || !pending) return null;
    if (!Number.isFinite(dt) || dt <= 0) return null;
    pending.remaining -= dt;
    if (pending.remaining > 1e-9) return null;
    const result = { answer: pending.answer, position: pending.position };
    pending = null;
    return result;
  }

  return {
    request,
    advance,
    cancel: clear,
    snapshot: () => ({ doorId: owner?.doorId || null, position: owner?.position ? { ...owner.position } : null, pending: !!pending, spent,
      remaining: pending?.remaining ?? 0 }),
  };
}
