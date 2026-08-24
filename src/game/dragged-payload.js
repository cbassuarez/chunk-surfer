// Shared trail-follow state for things whose weight occupies real geometry.
// The Stillson and the collapsed Surfer have different save records and sounds,
// but their follower must obey the same rule: a player step is legal only when
// the payload can occupy the trail point behind it.

const point = (value, fallback = { x: 0, y: 0 }) => ({
  x: Number.isFinite(Number(value?.x)) ? Number(value.x) : Number(fallback.x) || 0,
  y: Number.isFinite(Number(value?.y)) ? Number(value.y) : Number(fallback.y) || 0,
});

export function createDraggedPayloadState({ position, trail = [], gripped = false, spacing = 1.25 } = {}) {
  const at = point(position);
  const history = (Array.isArray(trail) ? trail : []).map((entry) => point(entry, at));
  return Object.freeze({
    schema: 1,
    position: Object.freeze(at),
    trail: Object.freeze(history.length ? history : [Object.freeze(at)]),
    gripped: !!gripped,
    spacing: Math.max(.25, Number(spacing) || 1.25),
  });
}

export function gripDraggedPayload(state, player) {
  const current = state || createDraggedPayloadState({ position: player });
  return Object.freeze({ ...current, gripped: true, trail: Object.freeze([Object.freeze(point(current.position)), Object.freeze(point(player, current.position))]) });
}

export function dropDraggedPayload(state) {
  return Object.freeze({ ...state, gripped: false });
}

export function draggedPayloadFollower(trail, player, spacing = 1.25) {
  const samples = [...(Array.isArray(trail) ? trail : []), point(player)];
  if (!samples.length) return point(player);
  let remaining = Math.max(.25, Number(spacing) || 1.25);
  let cursor = point(samples[samples.length - 1]);
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const next = point(samples[index], cursor);
    const distance = Math.hypot(cursor.x - next.x, cursor.y - next.y);
    if (distance >= remaining && distance > 0) {
      const t = remaining / distance;
      return Object.freeze({ x: cursor.x + (next.x - cursor.x) * t, y: cursor.y + (next.y - cursor.y) * t });
    }
    remaining -= distance;
    cursor = next;
  }
  return Object.freeze(cursor);
}

export function draggedPayloadStep(state, from, to, { canOccupy = () => true, maxTrail = 96 } = {}) {
  if (!state?.gripped) return Object.freeze({ state, allowed: true, moved: false, threshold: false });
  const trail = [...state.trail, point(to)];
  while (trail.length > Math.max(2, Number(maxTrail) || 96)) trail.shift();
  const follower = draggedPayloadFollower(trail, to, state.spacing);
  if (!canOccupy(follower, state.position)) return Object.freeze({ state, allowed: false, moved: false, threshold: false });
  const moved = Math.hypot(follower.x - state.position.x, follower.y - state.position.y) > .001;
  return Object.freeze({
    state: Object.freeze({ ...state, position: follower, trail: Object.freeze(trail.map(Object.freeze)) }),
    allowed: true,
    moved,
    distance: Math.hypot(Number(to?.x) - Number(from?.x), Number(to?.y) - Number(from?.y)),
  });
}
