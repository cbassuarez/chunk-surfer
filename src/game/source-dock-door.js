const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const ease = (n) => n * n * (3 - 2 * n);

export const SOURCE_DOCK_DOOR_OPEN_SECONDS = .85;
export const SOURCE_DOCK_DOOR_CLOSE_SECONDS = 1.05;

// Durable state records the decision; this controller owns the actual leaf.
// Crossing never substitutes an endpoint for the pose currently on screen.
export function createSourceDockDoor({ open = false, sealed = false } = {}) {
  let progress = open && !sealed ? 1 : 0;
  let phase = progress ? 'open' : 'closed';
  let elapsed = 0, start = progress, motionId = 0, closeRequested = sealed, moving = false;
  const begin = (next) => { phase = next; elapsed = 0; start = progress; motionId += 1; moving = true; };
  return {
    open() { if (phase === 'closed' && !closeRequested) begin('opening'); },
    requestClose() { closeRequested = true; },
    tick(dt, { bodyClear = true } = {}) {
      const seconds = Math.max(0, Number(dt) || 0);
      moving = false;
      if (phase === 'open' && closeRequested && bodyClear) begin('closing');
      if (phase === 'opening' || phase === 'closing') {
        // A closer waits for an occupied swing, rather than striking the body.
        if (phase === 'closing' && !bodyClear) return;
        moving = seconds > 0;
        const duration = phase === 'opening' ? SOURCE_DOCK_DOOR_OPEN_SECONDS : SOURCE_DOCK_DOOR_CLOSE_SECONDS;
        elapsed = Math.min(duration, elapsed + seconds);
        progress = start + ((phase === 'opening' ? 1 : 0) - start) * ease(clamp01(elapsed / duration));
        if (elapsed >= duration) { phase = phase === 'opening' ? 'open' : 'closed'; moving = false; }
      }
    },
    frame() { return { progress, phase, motionId, closeRequested, moving }; },
  };
}

const distanceToSegment = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

// Points are metres in the room's floor plane. The right jamb is the hinge;
// Source's leaf swings outward into decreasing y, exactly like its mesh.
export function sourceDockDoorBlocks(from, to, { centre, progress, maxAngle, width = .95, radius = .22 } = {}) {
  // The aperture is a one-metre throat through the wall. A point-sized cell
  // test allowed the body to run along its jamb before the leaf cleared it.
  const near = centre.y + radius, far = centre.y - 1 - radius;
  const clearHalfWidth = .5 - radius;
  const points = [from, to];
  for (const y of [near, far]) {
    const t = (y - from.y) / (to.y - from.y);
    if (t >= 0 && t <= 1) points.push({ x: from.x + (to.x - from.x) * t, y });
  }
  if (points.some((p) => p.y <= near && p.y >= far && Math.abs(p.x - centre.x) > clearHalfWidth)) return true;
  const a = { x: centre.x + .5, y: centre.y };
  const angle = clamp01(progress) * maxAngle;
  const b = { x: a.x - width * Math.cos(angle), y: a.y - width * Math.sin(angle) };
  const sideA = cross(from, to, a), sideB = cross(from, to, b);
  const sideFrom = cross(a, b, from), sideTo = cross(a, b, to);
  const intersects = sideA * sideB < 0 && sideFrom * sideTo < 0;
  const separation = intersects ? 0 : Math.min(
    distanceToSegment(from, a, b), distanceToSegment(to, a, b),
    distanceToSegment(a, from, to), distanceToSegment(b, from, to),
  );
  return separation < radius + .025;
}
