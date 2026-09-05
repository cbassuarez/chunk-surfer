// Pure cell-space geometry for the field-case MAP.
//
// THE MAP IS THE PAGE, NOT A PANE ON IT.
//
// This used to hand 72% of the width to a plan and the rest to a room list and a
// detail block, which is why finding somewhere meant reading a list rather than
// looking at a building. The plan now fills the frame and everything else is a
// single rail: one line of floors at the top, one line of controls at the
// bottom, and the selected room named on the map itself.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mapLayoutFromBag(layout) {
  const left = layout.list.x;
  const right = layout.detail.x + layout.detail.w;
  const top = Math.min(layout.list.y, layout.detail.y);
  const bottom = Math.max(layout.list.y + layout.list.h, layout.detail.y + layout.detail.h);
  const w = Math.max(12, right - left);
  const h = Math.max(8, bottom - top);
  const compact = layout.mode === 'compact' || w < 66 || h < 17;

  // floorRail  one line: the stacked floors, and the take count.
  // mapViewport everything else: the plan, full bleed.
  // detail      a two-line caption INSIDE the map's bottom edge, not beside it.
  // progressRail one line: the task, and the controls.
  // Explicit, non-overlapping bands. Everything that is not the plan is one row
  // tall, and each row knows where the one above it ended — the first pass at
  // this let the caption and the legend land on the same line.
  const floorH = 1;
  const captionH = 1;
  const legendH = 1;
  const progressH = 1;
  const chrome = floorH + 1 + captionH + legendH + progressH;
  const mapH = Math.max(5, h - chrome);
  const mapY = top + floorH + 1;
  const captionY = mapY + mapH;
  return {
    mode: compact ? 'compact' : 'wide',
    floorRail: { x: left, y: top, w, h: floorH },
    mapViewport: { x: left, y: mapY, w, h: mapH },
    detail: { x: left, y: captionY, w, h: captionH },
    legendRail: { x: left, y: captionY + captionH, w, h: legendH },
    progressRail: { x: left, y: captionY + captionH + legendH, w, h: progressH },
    dividerX: null,
  };
}

export function minimapLayout({ x, y, w = 22, h = 11 } = {}) {
  return {
    panel: { x, y, w, h },
    viewport: { x: x + 2, y: y + 3, w: Math.max(8, w - 4), h: Math.max(4, h - 5) },
  };
}
