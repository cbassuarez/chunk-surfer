//
//  bag-view.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Field-case presentation. One scrolling list, one persistent detail pane.

import { uiLine, uiText, uiWrap } from './ui.js';
import { drawBagIcon } from './bag-icons.js';
import { bagEntry, bagSection } from '../game/bag-model.js';
import { drawMapView } from './map-view.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function toneClass(tone, selected = false) {
  if (tone === 'complete') return 'ui-green';
  if (tone === 'danger') return 'ui-danger';
  if (tone === 'metadata') return 'ui-blue';
  if (tone === 'active') return 'ui-amber';
  return selected ? 'ui-primary' : 'ui-secondary';
}

function clip(text, width) {
  const s = String(text || '');
  const w = Math.max(1, Math.floor(width || 1));
  if (s.length <= w) return s;
  return w <= 1 ? '…' : `${s.slice(0, w - 1)}…`;
}

function rightText(x, y, width, text, cls = 'ui-secondary', alpha = 1) {
  const s = clip(text, width);
  uiText(x + Math.max(0, width - s.length), y, s, cls, alpha);
}

function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function acquire(now, startedAt, duration = 0.14) {
  return easeOutCubic((now - startedAt) / duration);
}

export function bagListCapacity(layout, sectionId) {
  const usable = Math.max(1, layout.list.h - 2);
  if (sectionId === 'kit') return Math.max(1, Math.floor(usable / 2));
  if (sectionId === 'files') return Math.max(1, Math.floor(usable / 2));
  return Math.max(1, usable);
}

function drawTabs(model, nav, layout, pulse) {
  const tabs = model.sections || [];
  const active = nav.sectionId;
  const compact = layout.mode === 'compact';
  const gap = compact ? 1 : 2;

  const labels = tabs.map((tab) => {
    const short = tab.id === 'kit' ? 'K' : tab.id === 'map' ? 'M' : 'F';
    const core = compact ? `${short} ${tab.countLabel}` : `${tab.label} ${tab.countLabel}`;
    return tab.id === active ? `[${compact ? '' : ' '}${core}${compact ? '' : ' '}]` : core;
  });

  const total = labels.reduce((sum, label) => sum + label.length, 0) + gap * Math.max(0, labels.length - 1);
  let x = layout.tabs.x + Math.max(0, Math.floor((layout.tabs.w - total) / 2));

  tabs.forEach((tab, i) => {
    const on = tab.id === active;
    const text = labels[i];
    uiText(x, layout.tabs.y, clip(text, Math.max(1, layout.tabs.x + layout.tabs.w - x)), on ? 'ui-amber' : 'ui-secondary', on ? .72 + pulse * .28 : .72);
    x += text.length + gap;
  });

  const help = layout.tabs.w >= 64
    ? '[TAB / SHIFT+TAB] SECTION'
    : '[TAB] SECTION';
  uiText(layout.tabs.x, layout.tabs.y + 1, clip(help, layout.tabs.w), 'ui-label', .58);
}

function sectionHeader(sectionId) {
  if (sectionId === 'kit') return 'CASE INDEX';
  if (sectionId === 'map') return 'FACILITY MAP';
  return 'FILE INDEX';
}

function drawKitList(entries, selectedId, rect, scroll, capacity, pulse) {
  let y = rect.y + 1;
  const visible = entries.slice(scroll, scroll + capacity);

  for (const entry of visible) {
    const on = entry.id === selectedId;
    const cursor = on ? '▸' : ' ';
    const status = entry.status?.label || '';
    const statusW = Math.min(12, status.length);
    const titleW = Math.max(8, rect.w - statusW - 5);

    uiText(rect.x, y, cursor, on ? 'ui-amber' : 'ui-secondary', on ? .72 + pulse * .28 : .68);
    uiText(rect.x + 2, y, clip(entry.title, titleW), on ? 'ui-amber' : entry.present ? 'ui-primary' : 'ui-secondary', on ? 1 : .78);
    rightText(rect.x, y, rect.w, status, toneClass(entry.status?.tone, on), on ? 1 : .72);
    uiText(rect.x + 3, y + 1, clip(entry.present ? entry.subtitle : 'EMPTY CUTOUT', rect.w - 4), 'ui-secondary', on ? .62 : .40);
    y += 2;
  }
}

function drawManifestList(entries, selectedId, rect, scroll, capacity, pulse) {
  let y = rect.y + 1;
  const visible = entries.slice(scroll, scroll + capacity);

  for (const entry of visible) {
    const on = entry.id === selectedId;
    const glyph = on ? '▸' : entry.status?.glyph || '◇';
    const seq = String(entry.sequence).padStart(2, '0');
    const right = entry.recorded ? entry.timestamp : entry.status?.label || '';
    const rightW = Math.min(10, right.length);
    const titleW = Math.max(7, rect.w - rightW - 8);

    uiText(rect.x, y, glyph, on ? 'ui-amber' : toneClass(entry.status?.tone), on ? .72 + pulse * .28 : .78);
    uiText(rect.x + 2, y, seq, 'ui-label', .72);
    uiText(rect.x + 5, y, clip(entry.title, titleW), on ? 'ui-amber' : toneClass(entry.status?.tone), on ? 1 : .82);
    rightText(rect.x, y, rect.w, right, toneClass(entry.status?.tone, on), on ? 1 : .78);
    y++;
  }
}

function drawFilesList(entries, selectedId, rect, scroll, capacity, pulse) {
  let y = rect.y + 1;
  const visible = entries.slice(scroll, scroll + capacity);

  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i];
    const prev = i > 0 ? visible[i - 1] : (scroll > 0 ? entries[scroll - 1] : null);
    const showFolder = !prev || prev.folder !== entry.folder;
    const on = entry.id === selectedId;

    uiText(rect.x, y, showFolder ? clip(entry.folder, rect.w - 4) : '·', 'ui-label', showFolder ? .62 : .28);
    if (showFolder) {
      const count = entries.filter((file) => file.folder === entry.folder).length;
      rightText(rect.x, y, rect.w, String(count).padStart(2, '0'), 'ui-blue', .58);
    }
    y++;

    const badge = entry.badges?.[0] || entry.status?.label || '';
    const badgeW = Math.min(9, badge.length);
    const titleW = Math.max(8, rect.w - badgeW - 5);
    uiText(rect.x, y, on ? '▸' : ' ', on ? 'ui-amber' : 'ui-secondary', on ? .72 + pulse * .28 : .60);
    uiText(rect.x + 2, y, clip(entry.title, titleW), on ? 'ui-amber' : 'ui-primary', on ? 1 : .78);
    rightText(rect.x, y, rect.w, badge, entry.badges?.length ? 'ui-amber' : 'ui-secondary', on ? .95 : .58);
    y++;
  }
}

function drawList(model, nav, layout, motion, now) {
  const section = bagSection(model, nav.sectionId) || { entries: [] };
  const selectedId = nav.selected?.[section.id];
  const capacity = bagListCapacity(layout, section.id);
  const scroll = nav.scroll?.[section.id] || 0;
  const pulse = acquire(now, motion.selectionChangedAt);

  uiText(layout.list.x, layout.list.y, sectionHeader(section.id), 'ui-label', .74);
  rightText(layout.list.x, layout.list.y, layout.list.w, `${Math.min(section.entries.length, scroll + capacity)}/${section.entries.length}`, 'ui-blue', .56);

  if (!section.entries.length) {
    const empty = 'NO ENTRIES';
    uiText(layout.list.x + Math.max(0, Math.floor((layout.list.w - empty.length) / 2)), layout.list.y + 3, empty, 'ui-secondary', .52);
    return;
  }

  if (scroll > 0) rightText(layout.list.x, layout.list.y + 1, layout.list.w, '▲ MORE', 'ui-secondary', .48);

  if (section.id === 'kit') drawKitList(section.entries, selectedId, layout.list, scroll, capacity, pulse);
  else if (section.id === 'map') drawManifestList(section.entries, selectedId, layout.list, scroll, capacity, pulse);
  else drawFilesList(section.entries, selectedId, layout.list, scroll, capacity, pulse);

  if (scroll + capacity < section.entries.length) {
    rightText(layout.list.x, layout.list.y + layout.list.h - 1, layout.list.w, '▼ MORE', 'ui-secondary', .48);
  }
}

function drawProgress(model, x, y, width) {
  const rooms = bagSection(model, 'map')?.entries || [];
  if (!rooms.length || width < 18) return;

  const parts = rooms.map((room) => {
    const short = room.title
      .split(/\s+/)
      .map((word) => word[0] || '')
      .join('')
      .slice(0, 3);
    return `${short} ${room.recorded ? '▮' : '▯'}`;
  });

  const text = clip(parts.join('  '), width);
  uiText(x, y, text, 'ui-blue', .68);
}

function drawFacts(entry, x, y, width, maxRows) {
  let cy = y;
  const facts = Array.isArray(entry?.facts) ? entry.facts : [];
  const labelW = Math.min(12, Math.max(7, ...facts.map(([label]) => String(label).length)));

  for (const [label, value] of facts) {
    if (cy >= y + maxRows) break;
    uiText(x, cy, clip(label, labelW), 'ui-label', .64);
    uiText(x + labelW + 2, cy, clip(value, Math.max(1, width - labelW - 2)), toneClass(entry.status?.tone), .78);
    cy++;
  }

  return cy;
}

function drawDescription(text, x, y, width, maxRows, cls = 'ui-secondary') {
  const lines = uiWrap(text, Math.max(8, width));
  for (let i = 0; i < Math.min(maxRows, lines.length); i++) {
    const more = i === maxRows - 1 && lines.length > maxRows;
    uiText(x, y + i, clip(more ? `${lines[i]}…` : lines[i], width), cls, .72);
  }
  return Math.min(maxRows, lines.length);
}

function drawConfirm(nav, rect, entry, pulse) {
  const confirm = nav.pendingAction?.confirm || {};
  const title = confirm.title || `CONFIRM ${entry?.title || 'ACTION'}?`;
  const body = confirm.body || 'THIS ACTION CANNOT BE UNDONE.';

  drawBagIcon(entry?.icon || 'unknown', rect.x + 1, rect.y + 1, {
    w: Math.min(14, Math.max(8, rect.w * .30)),
    h: Math.min(7, rect.h - 2),
    active: true,
    state: 'danger',
    alpha: .72 + pulse * .28,
  });

  const tx = rect.x + Math.min(17, Math.floor(rect.w * .34));
  uiText(tx, rect.y + 1, clip(title, rect.x + rect.w - tx), 'ui-danger', .82 + pulse * .18);
  const lines = uiWrap(body, Math.max(10, rect.x + rect.w - tx));
  lines.slice(0, 4).forEach((line, i) => uiText(tx, rect.y + 3 + i, line, 'ui-secondary', .72));
}

function drawDetail(model, nav, layout, motion, now) {
  const entry = bagEntry(model, nav.sectionId, nav.selected?.[nav.sectionId]);
  const rect = layout.detail;
  const p = acquire(now, motion.selectionChangedAt);
  const dx = layout.mode === 'wide' ? (1 - p) * .9 : 0;

  if (!entry) {
    uiText(rect.x, rect.y, 'NO ENTRY SELECTED', 'ui-secondary', .58);
    return;
  }

  if (nav.mode === 'confirm') {
    drawConfirm(nav, rect, entry, p);
    return;
  }

  const iconW = layout.mode === 'wide' ? Math.min(15, Math.max(10, Math.floor(rect.w * .30))) : 8;
  const iconH = layout.mode === 'wide' ? Math.min(8, Math.max(5, rect.h - 2)) : Math.min(5, rect.h - 1);
  drawBagIcon(entry.icon, rect.x + dx, rect.y + 1, {
    w: iconW,
    h: iconH,
    active: true,
    state: entry.status?.tone,
    alpha: .32 + p * .68,
    empty: entry.present === false,
  });

  const tx = rect.x + iconW + 2;
  const tw = Math.max(8, rect.x + rect.w - tx);
  uiText(tx, rect.y, clip(entry.title, tw), 'ui-amber', .50 + p * .50);
  uiText(tx, rect.y + 1, clip(entry.subtitle, tw), 'ui-label', .66);

  const status = entry.status?.label || '';
  uiText(tx, rect.y + 3, 'STATUS', 'ui-label', .62);
  uiText(tx + 9, rect.y + 3, clip(status, Math.max(1, tw - 9)), toneClass(entry.status?.tone), .88);

  if (layout.mode === 'compact') {
    drawDescription(entry.description || entry.preview || '', tx, rect.y + 4, tw, Math.max(1, rect.h - 4));
    return;
  }

  let cy = rect.y + iconH + 2;
  if (entry.kind === 'room') {
    drawProgress(model, rect.x, cy, rect.w);
    cy += 2;
  }

  cy = drawFacts(entry, rect.x, cy, rect.w, Math.max(1, rect.y + rect.h - cy - 4));
  cy++;

  if (entry.kind === 'room' && entry.attached && cy < rect.y + rect.h - 3) {
    uiText(rect.x, cy++, 'ATTACHED FILE', 'ui-label', .68);
    uiText(rect.x, cy++, clip(entry.attached.title || entry.attached.id, rect.w), 'ui-blue', .78);
  }

  const description = entry.description || entry.preview || '';
  if (description && cy < rect.y + rect.h) {
    cy++;
    drawDescription(description, rect.x, cy, rect.w, Math.max(1, rect.y + rect.h - cy));
  }
}

export function bagActionRail(entry, mode) {
  if (mode === 'confirm') {
    return [['ENTER', 'CONFIRM'], ['ESC', 'CANCEL'], ['B', 'CLOSE']];
  }

  const out = [];
  if (entry?.actions?.primary) out.push(['ENTER', entry.actions.primary.label]);
  if (entry?.actions?.secondary) out.push(['SPACE', entry.actions.secondary.label]);
  out.push(['B', 'CLOSE']);
  return out;
}

function actionRailText(actions, width) {
  const full = actions.map(([key, label]) => `[${key}] ${label}`).join('   ');
  if (full.length <= width) return full;
  return actions.map(([key, label]) => `[${key}] ${label}`).join(' · ');
}

export function bagTaskText({ hint, model, entry }) {
  if (hint) return String(hint).toUpperCase();
  if (model.progress.total > 0 && model.progress.done >= model.progress.total) {
    return `TASK: RETURN WITH ${model.progress.total} ACCEPTED TAKES.`;
  }
  if (entry?.kind === 'room' && entry.marked) return `WAYPOINT: ${entry.title}`;
  return `TASK: RECORD FIVE CLEAN MINUTES · ${model.progress.done}/${model.progress.total} COMPLETE`;
}

export function drawBagView({ model, nav, mapNav = null, layout, hint = '', motion, now }) {
  const selected = bagEntry(model, nav.sectionId, nav.selected?.[nav.sectionId]);
  const sectionPulse = acquire(now, motion.sectionChangedAt);
  drawTabs(model, nav, layout, sectionPulse);

  let actions = null;
  if (nav.sectionId === 'map' && model.map && mapNav) {
    const rendered = drawMapView({ model: model.map, nav: mapNav, bagLayout: layout, now });
    actions = rendered.actions;
  } else {
    if (layout.mode === 'wide') {
      uiLine(layout.dividerX, layout.list.y - 1, layout.dividerX, layout.list.y + layout.list.h, undefined, .36);
    } else {
      uiLine(layout.list.x, layout.list.y - 1, layout.list.x + layout.list.w, layout.list.y - 1, undefined, .30);
    }
    drawList(model, nav, layout, motion, now);
    drawDetail(model, nav, layout, motion, now);
  }

  uiLine(layout.taskRail.x, layout.taskRail.y - .35, layout.taskRail.x + layout.taskRail.w, layout.taskRail.y - .35, undefined, .24);
  uiText(layout.taskRail.x, layout.taskRail.y, clip(bagTaskText({ hint, model, entry: selected }), layout.taskRail.w), hint ? 'ui-amber' : 'ui-secondary', hint ? .92 : .62);

  actions = nav.mode === 'confirm' ? bagActionRail(selected, nav.mode) : (actions || bagActionRail(selected, nav.mode));
  const actionText = clip(actionRailText(actions, layout.actionRail.w), layout.actionRail.w);
  uiText(layout.actionRail.x, layout.actionRail.y, actionText, nav.mode === 'confirm' ? 'ui-danger' : 'ui-label', nav.mode === 'confirm' ? .92 : .72);
}
