// The virtual snow walk uses the doorway's world-space forward direction.
// Looking around does not move him; walking back undoes the distance covered.
export function advanceStationWalk(progress, dx, dy, forward, steps = 850) {
  const distance = Math.hypot(dx, dy);
  const length = Math.hypot(...forward);
  if (!distance || !length) return progress;
  const along = (dx * forward[0] + dy * forward[1]) / (distance * length);
  return Math.max(0, Math.min(1, progress + along / steps));
}
