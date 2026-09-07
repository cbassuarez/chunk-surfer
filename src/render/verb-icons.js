// THE VERBS, AS REAL ICONS.
//
// These were hand-rolled vector approximations — a torch, a reel and a case I
// drew myself. They read at a glance and that was the whole of their virtue:
// they did not agree with each other about stroke weight or corner radius, and
// there was no licence behind them because there was no source.
//
// They are Lucide now (ISC), extracted to plain path data by
// tools/chunk_surfer/build-icons.mjs so the runtime carries no dependency on the
// package. One pen, one grid, one licence, and the attribution travels with the
// art in src/render/generated/icon-paths.js.
//
// THE KEYCAP STAYS BESIDE THEM. An icon says what a verb does and not which key
// does it, which is the one thing a control hint exists to say — so the rail is
// a key with a letter on it, and then the picture.

import { uiDraw } from './ui.js';
import { uiRoleColor } from './palette.js';
import { ICON_PATHS, ICON_STROKE, ICON_VIEWBOX } from './generated/icon-paths.js';

export const VERB_ICON_CELLS = 2;

// Path2D objects are built once and reused; rebuilding them per frame is the
// expensive half of drawing an icon this small.
const cache = new Map();
function pathsFor(id) {
  if (cache.has(id)) return cache.get(id);
  const entry = ICON_PATHS[String(id)];
  const built = entry ? entry.paths.map((d) => new Path2D(d)) : null;
  cache.set(id, built);
  return built;
}

export function hasVerbIcon(id) { return !!ICON_PATHS[String(id)]; }

/** Draws one verb icon on the text baseline at `x,y`, in UI cells. */
export function drawVerbIcon(id, x, y, { alpha = 1, role = 'ui-secondary', cols = 120, ink = null } = {}) {
  if (!ICON_PATHS[String(id)]) return 0;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const paths = pathsFor(id);
    if (!paths) return;
    // Fit the 24x24 box into the cell run, square, centred on the row.
    const size = Math.min(cellW * VERB_ICON_CELLS, cellH * .92) * dpr;
    const ox = (x * cellW * dpr) + ((VERB_ICON_CELLS * cellW * dpr) - size) / 2;
    const oy = (y * cellH * dpr) + ((cellH * dpr) - size) / 2;
    const scale = size / ICON_VIEWBOX;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = ink || uiRoleColor(role, x, cols);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    // The pen is specified on the 24-box, so it scales with the art and stays
    // the weight the set was drawn at — but never thinner than a device pixel.
    ctx.lineWidth = Math.max(ICON_STROKE, 1 / scale);
    for (const path of paths) ctx.stroke(path);
    ctx.restore();
  });
  return VERB_ICON_CELLS;
}
