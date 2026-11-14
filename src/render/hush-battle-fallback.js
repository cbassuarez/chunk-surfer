import { HUSH_FALLBACK_ORIGIN, HUSH_FALLBACK_SPANS, HUSH_FALLBACK_STEP } from './hush-battle-fallback-data.js';
import { HUSH_BATTLE_VIEW_RISE, HUSH_BATTLE_VIEW_DISTANCE } from './hush-battle-camera.js';

// The context can fail even while the encounter is mechanically live. A
// fixed, screened recording of the same anatomical pose survives that failure.
export function drawHushBattleFallback(ctx, { x, y, width, height, view }) {
  const [originX, originY] = HUSH_FALLBACK_ORIGIN;
  const scale = height / view.span;
  const rise = HUSH_BATTLE_VIEW_RISE, depth = HUSH_BATTLE_VIEW_DISTANCE;
  const vertical = depth / Math.hypot(depth, rise);
  const cx = x + width / 2, cy = y + height / 2 + view.centre * vertical * scale;
  const px = column => Math.round(cx + (originX + column * HUSH_FALLBACK_STEP) * scale);
  const py = row => Math.round(cy + (originY + row * HUSH_FALLBACK_STEP) * scale);
  const points = [];
  ctx.fillStyle = '#000';
  for (const [row, spans] of HUSH_FALLBACK_SPANS.entries()) {
    for (let i = 0; i < spans.length; i += 2) {
      const column = spans[i], end = column + spans[i + 1];
      const w = px(end) - px(column), h = py(row + 1) - py(row);
      if (w <= 0 || h <= 0) continue;
      ctx.fillRect(px(column), py(row), w, h);
      if (row % 11 === 2) points.push([px(column), py(row)], [px(end) - 1, py(row)]);
    }
  }
  ctx.fillStyle = '#626461';
  for (const [x, y] of points) ctx.fillRect(x, y, 1, 1);
}
