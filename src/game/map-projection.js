// Pure map-space projection helpers.

export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function floorForHeight(definition, height, { renderGroup = null } = {}) {
  const h = Number(height);
  if (!Number.isFinite(h)) return null;
  const candidates = (definition?.floors || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((floor) => h >= floor.minHeight && h < floor.maxHeight);
  if (renderGroup) {
    const specific = candidates.find((floor) => Array.isArray(floor.renderGroups) && floor.renderGroups.includes(renderGroup));
    if (specific) return specific;
  }
  return candidates.find((floor) => !Array.isArray(floor.renderGroups) || floor.renderGroups.length === 0) || candidates[0] || null;
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

// HEADING-UP. The local map turns under the player instead of the player turning
// on a fixed north-up map: a monitor strapped to your chest reads the way you are
// facing, and a north-up minimap in a building with no windows is a puzzle rather
// than an instrument.
//
// Two things this has to get right:
//   · `aspect` (cellW/cellH) makes the projection ISOTROPIC. Terminal cells are
//     about twice as tall as they are wide, so scaling x by w and y by h — which
//     is what this did — meant one world metre was two different lengths on
//     screen. Rotate that and squares turn into parallelograms.
//   · axis-aligned fills (the topology runs) cannot be drawn from two rotated
//     corners, so they rotate the canvas and use `pointFlat` instead.
export function minimapTransform({ center, radius, viewport, heading = 0, aspect = 1 }) {
  const safeRadius = Math.max(1, Number(radius) || 1);
  const safeAspect = Math.max(0.05, Number(aspect) || 1);
  // Equal pixels per world unit on both axes, and still inside the viewport.
  const scaleX = Math.min(viewport.w / (safeRadius * 2), viewport.h / (safeRadius * 2 * safeAspect));
  const scaleY = scaleX * safeAspect;
  const cx = viewport.x + viewport.w / 2;
  const cy = viewport.y + viewport.h / 2;
  const yaw = Number(heading) || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    heading: yaw,
    screenCenter: { x: cx, y: cy },
    scaleX,
    scaleY,
    point(value) {
      const dx = Number(value?.x || 0) - center.x;
      const dy = Number(value?.y || 0) - center.y;
      return { x: cx + (dx * cos + dy * sin) * scaleX, y: cy + (-dx * sin + dy * cos) * scaleY };
    },
    pointFlat(value) {
      return { x: cx + (Number(value?.x || 0) - center.x) * scaleX, y: cy + (Number(value?.y || 0) - center.y) * scaleY };
    },
    length(value) { return Number(value || 0) * scaleX; },
  };
}

export function insideRect(value, rect, margin = 0) {
  return value.x >= rect.x + margin && value.x <= rect.x + rect.w - margin
    && value.y >= rect.y + margin && value.y <= rect.y + rect.h - margin;
}

export function clampMarkerToEdge(center, target, viewport, margin = 0.8, heading = 0) {
  const yaw = Number(heading) || 0;
  const wx = target.x - center.x;
  const wy = target.y - center.y;
  // Same rotation the transform applies, so an edge marker sits on the bearing
  // you would actually walk rather than on true north.
  const dx = wx * Math.cos(yaw) + wy * Math.sin(yaw);
  const dy = -wx * Math.sin(yaw) + wy * Math.cos(yaw);
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
