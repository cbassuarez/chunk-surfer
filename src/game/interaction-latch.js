export const INTERACTION_LATCH = Object.freeze({
  holdMs: 1_400,
});

// Reticle acquisition is sampled once per rendered frame, while pixel-mesh
// edges, mouse deltas and narrow geometry all move continuously. A prop which
// was genuinely acquired should not vanish because one frame landed beside a
// rope, key ring or switch. New direct targets still replace it immediately;
// consuming an interaction clears it so completed actions cannot leave a stale
// prompt behind.
export function createInteractionLatch({ holdMs = INTERACTION_LATCH.holdMs } = {}) {
  const grace = Math.max(0, Number(holdMs) || 0);
  let held = null;
  let lastSeenAt = -Infinity;

  function clear() {
    held = null;
    lastSeenAt = -Infinity;
  }

  function update(candidate, { nowMs = 0, resolve = null } = {}) {
    const now = Number(nowMs) || 0;
    if (candidate) {
      held = { ...candidate };
      lastSeenAt = now;
      return { ...held, retained: false, holdRemainingMs: grace };
    }
    if (!held || now - lastSeenAt > grace) {
      clear();
      return null;
    }
    const live = typeof resolve === 'function' ? resolve(held.id) : held;
    if (!live || live.interactive === false) {
      clear();
      return null;
    }
    return {
      ...held,
      ...live,
      distance: held.distance,
      aimAngle: held.aimAngle,
      aimScore: held.aimScore,
      retained: true,
      holdRemainingMs: Math.max(0, grace - (now - lastSeenAt)),
    };
  }

  function consume(id = null) {
    if (id == null || held?.id === id) clear();
  }

  function snapshot() {
    return { heldId: held?.id || null, lastSeenAt, holdMs: grace };
  }

  return { update, consume, clear, snapshot };
}
