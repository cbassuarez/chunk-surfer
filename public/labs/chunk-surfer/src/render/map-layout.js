// Pure cell-space geometry for the field-case MAP.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mapLayoutFromBag(layout) {
  const left = layout.list.x;
  const right = layout.detail.x + layout.detail.w;
  const top = Math.min(layout.list.y, layout.detail.y);
  const bottom = Math.max(layout.list.y + layout.list.h, layout.detail.y + layout.detail.h);
  const w = Math.max(12, right - left);
  const h = Math.max(8, bottom - top);

  if (layout.mode === 'compact' || w < 66 || h < 17) {
    const headerH = 1;
    const detailH = clamp(Math.floor(h * 0.22), 2, 4);
    const progressH = 1;
    return {
      mode: 'compact',
      floorRail: { x: left, y: top, w, h: headerH },
      mapViewport: { x: left, y: top + headerH + 1, w, h: Math.max(5, h - headerH - detailH - progressH - 2) },
      detail: { x: left, y: bottom - detailH - progressH, w, h: detailH },
      progressRail: { x: left, y: bottom - progressH, w, h: progressH },
      dividerX: null,
    };
  }

  const floorH = 1;
  const mapW = clamp(Math.floor(w * 0.66), 38, w - 24);
  return {
    mode: 'wide',
    floorRail: { x: left, y: top, w, h: floorH },
    mapViewport: { x: left, y: top + floorH + 1, w: mapW, h: Math.max(6, h - floorH - 2) },
    dividerX: left + mapW + 1,
    detail: { x: left + mapW + 2, y: top + floorH + 1, w: Math.max(20, w - mapW - 2), h: Math.max(6, h - floorH - 2) },
    progressRail: { x: left, y: bottom - 1, w, h: 1 },
  };
}

export function minimapLayout({ x, y, w = 22, h = 11 } = {}) {
  return {
    panel: { x, y, w, h },
    viewport: { x: x + 2, y: y + 3, w: Math.max(8, w - 4), h: Math.max(4, h - 5) },
  };
}
