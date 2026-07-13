// Pure map-space projection helpers.

export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function floorForHeight(definition, height) {
  const h = Number(height);
  if (!Number.isFinite(h)) return null;
  return (definition?.floors || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .find((floor) => h >= floor.minHeight && h < floor.maxHeight) || null;
}

export function floorById(definition, floorId) {
  return definition?.floors?.find((floor) => floor.id === floorId) || null;
}

export function fitBounds(bounds, viewport, { padding = 1, preserveAspect = true } = {}) {
  const srcW = Math.max(1e-6, bounds.maxX - bounds.minX + 1);
  const srcH = Math.max(1e-6, bounds.maxY - bounds.minY + 1);
  const dstW = Math.max(1, viewport.w - padding * 2);
  const dstH = Math.max(1, viewport.h - padding * 2);
  const sx = dstW / srcW;
  const sy = dstH / srcH;
  const scaleX = preserveAspect ? Math.min(sx, sy) : sx;
  const scaleY = preserveAspect ? Math.min(sx, sy) : sy;
  const usedW = srcW * scaleX;
  const usedH = srcH * scaleY;
  const offsetX = viewport.x + padding + Math.max(0, (dstW - usedW) / 2);
  const offsetY = viewport.y + padding + Math.max(0, (dstH - usedH) / 2);

  return {
    point(value) {
      return {
        x: offsetX + (value.x - bounds.minX) * scaleX,
        y: offsetY + (value.y - bounds.minY) * scaleY,
      };
    },
    length(value) { return value * Math.min(scaleX, scaleY); },
    scaleX,
    scaleY,
    offsetX,
    offsetY,
  };
}

export function minimapTransform({ center, radius, viewport }) {
  const safeRadius = Math.max(1, Number(radius) || 1);
  return {
    point(value) {
      return {
        x: viewport.x + viewport.w / 2 + (value.x - center.x) * viewport.w / (safeRadius * 2),
        y: viewport.y + viewport.h / 2 + (value.y - center.y) * viewport.h / (safeRadius * 2),
      };
    },
  };
}

export function insideRect(value, rect, margin = 0) {
  return value.x >= rect.x + margin && value.x <= rect.x + rect.w - margin
    && value.y >= rect.y + margin && value.y <= rect.y + rect.h - margin;
}

export function clampMarkerToEdge(center, target, viewport, margin = 0.8) {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const ux = dx / magnitude;
  const uy = dy / magnitude;
  const halfW = Math.max(0.1, viewport.w / 2 - margin);
  const halfH = Math.max(0.1, viewport.h / 2 - margin);
  const tx = Math.abs(ux) > 1e-6 ? halfW / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? halfH / Math.abs(uy) : Infinity;
  const distance = Math.min(tx, ty);
  return {
    x: viewport.x + viewport.w / 2 + ux * distance,
    y: viewport.y + viewport.h / 2 + uy * distance,
    direction: { x: ux, y: uy },
  };
}

export function facingToHeading(facing) {
  const n = Number(facing);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n) % 4) + 4) % 4 * (Math.PI / 2);
}

export function headingVector(heading = 0) {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

export function floorDelta(floors, fromId, toId) {
  const from = floors?.find((floor) => floor.id === fromId);
  const to = floors?.find((floor) => floor.id === toId);
  if (!from || !to) return 0;
  return Math.sign(to.order - from.order) * Math.abs(to.order - from.order);
}

export function mapKey(x, y) { return `${Math.round(x)},${Math.round(y)}`; }
export function parseMapKey(key) {
  const [x, y] = String(key).split(',').map(Number);
  return { x, y };
}
