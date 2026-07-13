//
//  bag-layout.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Responsive field-case geometry. Pure cell-space math only.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function bagPanelBounds({ cols, rows }) {
  const maxW = Math.max(20, cols - 4);
  const maxH = Math.max(14, rows - 3);
  const w = Math.min(100, maxW);
  const h = Math.min(38, maxH);

  return {
    x: Math.max(0, Math.floor((cols - w) / 2)),
    y: Math.max(1, Math.floor((rows - h) / 2)),
    w,
    h,
  };
}

export function bagLayout({ body, forceMode = null } = {}) {
  const b = body || { x: 0, y: 0, w: 60, h: 22 };
  const compact = forceMode === 'compact' || (forceMode !== 'wide' && (b.w < 68 || b.h < 20));

  const tabs = { x: b.x, y: b.y, w: b.w, h: 2 };
  const actionRail = { x: b.x, y: b.y + b.h - 1, w: b.w, h: 1 };
  const taskRail = { x: b.x, y: actionRail.y - 1, w: b.w, h: 1 };

  if (compact) {
    const detailH = clamp(Math.floor(b.h * 0.34), 5, 8);
    const contentY = tabs.y + tabs.h + 1;
    const listY = contentY + detailH + 1;

    return {
      mode: 'compact',
      body: b,
      tabs,
      detail: { x: b.x, y: contentY, w: b.w, h: detailH },
      list: { x: b.x, y: listY, w: b.w, h: Math.max(3, taskRail.y - listY - 1) },
      dividerX: null,
      taskRail,
      actionRail,
    };
  }

  const contentY = tabs.y + tabs.h + 1;
  const contentH = Math.max(6, taskRail.y - contentY - 1);
  const listW = clamp(Math.floor(b.w * 0.40), 27, 38);
  const dividerX = b.x + listW + 1;

  return {
    mode: 'wide',
    body: b,
    tabs,
    list: { x: b.x, y: contentY, w: listW, h: contentH },
    dividerX,
    detail: {
      x: dividerX + 2,
      y: contentY,
      w: Math.max(20, b.x + b.w - dividerX - 2),
      h: contentH,
    },
    taskRail,
    actionRail,
  };
}
