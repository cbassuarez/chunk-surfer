// A very shitty map.
//
// It shows you where you are, and a waypoint. It does not show walls, doors, or
// routes, because the previous recordist did not draw any — he wrote down where
// the rooms were and assumed whoever came after him could find a corridor.
//
// This is deliberate and it is the whole navigation design: pages give you a
// destination, the building gives you nothing, and the dark does the rest.

import { uiText, uiBox, uiGlyph, uiSize } from './ui.js';

const W = 17, H = 9;        // cells
const SCALE = 7;            // world cells per map cell

export function drawMinimap(px, py, waypoint, opts = {}) {
  const { cols } = uiSize();
  const x0 = cols - W - 2, y0 = 2;
  uiBox(x0, y0, W, H, 't-trail-4', 'rgba(6,7,9,0.72)');

  const cx = x0 + (W >> 1), cy = y0 + (H >> 1);

  // north mark, because a compass is the one honest thing on this page
  uiGlyph(cx, y0, '·', 't-trail-3', 0.6);
  uiText(x0 + 2, y0, 'n', 't-trail-3', 0.5);

  // you
  uiGlyph(cx, cy, '+', 't-player', 1);

  if (waypoint) {
    const dx = Math.round((waypoint.x - px) / SCALE);
    const dy = Math.round((waypoint.y - py) / SCALE);
    const mx = cx + dx, my = cy + dy;
    const inside = mx > x0 && mx < x0 + W - 1 && my > y0 && my < y0 + H - 1;
    if (inside) {
      uiGlyph(mx, my, '×', 't-key', 1);
    } else {
      // off the edge of the page: pin it to the rim, the way you would with a
      // thumb held against a paper map
      const ex = Math.max(x0 + 1, Math.min(x0 + W - 2, mx));
      const ey = Math.max(y0 + 1, Math.min(y0 + H - 2, my));
      uiGlyph(ex, ey, '×', 't-key', 0.55);
    }
  }

  if (opts.presence) {
    const dx = Math.round((opts.presence.x - px) / SCALE);
    const dy = Math.round((opts.presence.y - py) / SCALE);
    const mx = cx + dx, my = cy + dy;
    const inside = mx > x0 && mx < x0 + W - 1 && my > y0 && my < y0 + H - 1;
    if (inside) {
      uiGlyph(mx, my, '☍', 't-hush-core', opts.presence.alpha ?? 0.95);
    } else {
      const ex = Math.max(x0 + 1, Math.min(x0 + W - 2, mx));
      const ey = Math.max(y0 + 1, Math.min(y0 + H - 2, my));
      uiGlyph(ex, ey, '☍', 't-hush-edge', opts.presence.alpha ?? 0.65);
    }
  }

  if (opts.label) uiText(x0 + 1, y0 + H - 1, opts.label.slice(0, W - 2), 't-trail-3', 0.6);
}
