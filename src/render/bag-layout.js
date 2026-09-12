//
//  bag-layout.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Responsive field-case geometry. Pure cell-space math only.

import { BAG_TABS_HEIGHT } from './bag-tabs.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function bagPanelBounds({ cols, rows, sectionId = null }) {
  const maxW = Math.max(20, cols - 4);
  const maxH = Math.max(14, rows - 3);
  const w = Math.min(sectionId === 'map' ? 128 : 100, maxW);
  const h = Math.min(sectionId === 'map' ? 46 : 38, maxH);

  return {
    x: Math.max(0, Math.floor((cols - w) / 2)),
    y: Math.max(1, Math.floor((rows - h) / 2)),
    w,
    h,
  };
}

// `guideRows` reserves a band above the rails for a guided-step callout. It is
// real geometry, not an overlay: a guided moment pushes the case's own content
// up rather than printing on top of it.
export function bagLayout({ body, forceMode = null, guideRows = 0, sectionId = null } = {}) {
  const b = body || { x: 0, y: 0, w: 60, h: 22 };
  const compact = forceMode === 'compact' || (forceMode !== 'wide' && (b.w < 68 || b.h < 20));

  const shortMap = sectionId === 'map' && b.h < 30;
  const tabs = { x: b.x, y: b.y, w: b.w, h: shortMap ? 2 : sectionId==='map'?3.6:BAG_TABS_HEIGHT, compact:shortMap };
  const actionRail = { x: b.x, y: b.y + b.h - 1, w: b.w, h: 1 };
  const guideH = Math.max(0, Math.min(Math.floor(b.h / 3), Math.floor(guideRows), Math.floor(b.h - tabs.h - 6)));
  const guide = guideH ? { x: b.x, y: actionRail.y - 1 - guideH, w: b.w, h: guideH } : null;
  const taskRail = { x: b.x, y: actionRail.y - 1 - guideH - (guideH ? 1 : 0), w: b.w, h: 1 };
  const contentY = tabs.y + tabs.h + (shortMap ? .25 : .7);
  const contentH = Math.max(0, taskRail.y - contentY - .7);

  if (compact) {
    // On a shallow display the detail and list share what remains. Fixed
    // minimum heights used to push the list through the guide/action rails.
    const gap = Math.min(1, contentH * .08);
    const detailH = Math.min(clamp(Math.floor(b.h * 0.34), 5, 8), Math.max(0, (contentH - gap) * .58));
    const listY = contentY + detailH + gap;

    return {
      mode: 'compact',
      body: b,
      tabs,
      detail: { x: b.x, y: contentY, w: b.w, h: detailH },
      list: { x: b.x, y: listY, w: b.w, h: Math.max(0, contentY + contentH - listY) },
      dividerX: null,
      guide,
      taskRail,
      actionRail,
    };
  }

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
    guide,
    taskRail,
    actionRail,
  };
}
