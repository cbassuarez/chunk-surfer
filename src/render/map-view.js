// Field-case MAP renderer. Reads semantic commands; mutates no gameplay state.

import { uiDraw, uiGlyph, uiLine, uiText, uiWrap } from './ui.js';
import { themeRoleColor } from './palette.js';
import { buildMapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawAnomalyRegion, drawObjectiveMarker, drawPlayerMarker } from './map-icons.js';
import { mapLayoutFromBag } from './map-layout.js';
import { mapCurrentAreaLabel, mapFloor, newestMapContact } from '../game/map-model.js';
import { selectedMapSpace } from '../game/map-navigation.js';
import { mapActionRail } from '../game/map-actions.js';
import { hushStatus } from './minimap.js';

const clip = (value, width) => {
  const text = String(value ?? '');
  const w = Math.max(1, Math.floor(width));
  return text.length <= w ? text : w <= 1 ? '…' : `${text.slice(0, w - 1)}…`;
};

function rightText(x, y, w, text, cls = 'ui-secondary', alpha = 1) {
  const value = clip(text, w);
  uiText(x + Math.max(0, w - value.length), y, value, cls, alpha);
}

function roomLabel(model, roomId, fallback = 'NONE') {
  return (model?.spaces || []).find((space) => space.roomId === roomId)?.label || fallback;
}

function currentRoomLabel(model) {
  return mapCurrentAreaLabel(model);
}

function targetRoomLabel(model) {
  if (!model?.waypoint) return 'NO TARGET';
  return roomLabel(model, model.waypoint.roomId, 'TARGET');
}

function routeLabel(model) {
  if (!model?.waypoint) return { text: 'NO ROUTE SET', cls: 'ui-secondary' };
  if (model.route?.status === 'ok') {
    const delta = Number(model.route.floorDelta || 0);
    if (delta) return { text: `ROUTE OK · ${delta > 0 ? '+' : ''}${delta} FLOOR`, cls: 'ui-blue' };
    return { text: 'ROUTE OK · SAME FLOOR', cls: 'ui-blue' };
  }
  if (model.route?.status === 'blocked') return { text: 'ROUTE BLOCKED', cls: 'ui-danger' };
  return { text: 'ROUTE UNKNOWN', cls: 'ui-secondary' };
}

function drawTopology(command, viewport) {
  const open = command.open;
  const runs = Array.isArray(command.runs) ? command.runs : null;
  const transform = command.transform;
  if (!runs && !(open instanceof Set)) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x * cellW * dpr, viewport.y * cellH * dpr, viewport.w * cellW * dpr, viewport.h * cellH * dpr);
    ctx.clip();
    ctx.fillStyle = themeRoleColor('silkscreen');
    ctx.globalAlpha = 0.18;
    const cell = Math.max(0.7, transform.length(1));
    if (runs) {
      for (const run of runs) {
        const a = transform.point({ x: run.x0, y: run.y });
        const b = transform.point({ x: run.x1 + 1, y: run.y + 1 });
        ctx.fillRect(
          a.x * cellW * dpr,
          a.y * cellH * dpr,
          Math.max(0.65, b.x - a.x) * cellW * dpr,
          Math.max(0.65, b.y - a.y) * cellH * dpr,
        );
      }
    } else {
      for (const key of open) {
        const [x, y] = key.split(',').map(Number);
        const point = transform.point({ x, y });
        ctx.fillRect(point.x * cellW * dpr, point.y * cellH * dpr, Math.max(0.65, cell * cellW) * dpr, Math.max(0.65, cell * cellH) * dpr);
      }
    }
    ctx.restore();
  });
}

function drawRoute(command) {
  if (!command.points?.length) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.globalAlpha = command.status === 'ok' ? 0.58 : 0.34;
    ctx.strokeStyle = themeRoleColor(command.status === 'ok' ? 'counter' : 'danger');
    ctx.lineWidth = 1.25 * dpr;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath();
    command.points.forEach((p, i) => {
      const x = p.x * cellW * dpr;
      const y = p.y * cellH * dpr;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  });
}

function drawMapCommands(commands, viewport, now) {
  // The tower is one page now, and its rooms are stacked — the ringing room and
  // the bell chamber share a footprint — so two callouts can want the same row.
  // Nudge the later one down rather than printing them on top of each other.
  const labelRows = new Set();
  for (const command of commands) {
    if (command.kind === 'topology') drawTopology(command, viewport);
    else if (command.kind === 'route') drawRoute(command);
    else if (command.kind === 'door') uiGlyph(Math.round(command.point.x), Math.round(command.point.y), command.state === 'locked' ? '╫' : command.state === 'closed' ? '┼' : '·', command.state === 'locked' ? 'ui-danger' : command.state === 'closed' ? 'ui-amber' : 'ui-label', .72);
    else if (command.kind === 'connector') uiGlyph(Math.round(command.point.x), Math.round(command.point.y), '↕', command.selected ? 'ui-blue' : 'ui-label', command.selected ? .96 : .62);
    else if (command.kind === 'objective') {
      drawObjectiveMarker(command, command.selected ? .82 + Math.sin(now * 7) * .16 : .82);
      if (command.showLabel || command.current || command.waypoint) {
        const label = clip(command.current ? 'YOU' : command.waypoint ? 'TARGET' : command.label, Math.max(4, Math.min(18, viewport.w - 4)));
        const lx = Math.max(viewport.x, Math.min(viewport.x + viewport.w - label.length, Math.round(command.point.x) + 2));
        // Dimmed rather than hidden: you can read every place you could walk to,
        // and the bright one is still unmistakably the place you have chosen.
        const bright = command.selected || command.current || command.waypoint;
        let ly = Math.round(command.point.y);
        for (let nudge = 0; nudge < 3 && labelRows.has(`${ly},${lx}`); nudge += 1) ly += 1;
        labelRows.add(`${ly},${lx}`);
        uiText(lx, ly, label,
          command.current ? 'ui-green' : command.waypoint ? 'ui-blue' : command.selected ? 'ui-amber' : 'ui-secondary',
          bright ? .92 : command.dimLabel ? .42 : .58);
      }
    }
    else if (command.kind === 'player') drawPlayerMarker(command.point, command.heading, 1);
    else if (command.kind === 'anomaly-contact') drawAnomalyMarker(command, .82 + Math.sin(now * 12) * .16);
    else if (command.kind === 'anomaly-region') drawAnomalyRegion(command, .72);
  }
}

function progressText(model, width) {
  const parts = (model.spaces || [])
    .sort((a, b) => a.objective.sequence - b.objective.sequence)
    .map((space) => `${space.shortLabel || space.objective.sequence} ${space.objective.recorded ? '■' : space.waypoint ? '◆' : space.current ? '●' : '□'}`);
  return clip(parts.join('  '), width);
}

function ageText(contact, now) {
  if (!contact?.observation) return '--';
  if (contact.state === 'locked' || contact.state === 'acquiring' || contact.state === 'unresolved' || contact.state === 'saturated') return 'LIVE';
  return `${Math.max(0, (now - contact.observation.observedAt) / 1000).toFixed(1)} SEC`;
}

function drawSystemStatus(model, rect, now) {
  const route = routeLabel(model);
  const hush = hushStatus(model, now);
  const rows = [
    ['YOU', currentRoomLabel(model), 'ui-green'],
    ['TARGET', targetRoomLabel(model), model.waypoint ? 'ui-blue' : 'ui-secondary'],
    ['ROUTE', route.text, route.cls],
    ['HUSH', `${hush.label} · ${hush.detail}`, hush.cls],
  ];
  rows.forEach(([label, value, cls], index) => {
    uiText(rect.x, rect.y + index, label, 'ui-label', .62);
    uiText(rect.x + 9, rect.y + index, clip(value, rect.w - 9), cls, .82);
  });
}

function drawLegend(rect) {
  const items = [
    ['●', 'YOU', 'ui-green'],
    ['◆', 'TARGET', 'ui-blue'],
    ['■', 'DONE', 'ui-green'],
    ['◇', 'ROOM', 'ui-primary'],
    ['╫', 'LOCKED', 'ui-danger'],
    ['⌜⌟', 'HUSH', 'ui-danger'],
  ];
  let x = rect.x;
  let y = rect.y;
  for (const [glyph, label, cls] of items) {
    const text = `${glyph} ${label}`;
    if (x + text.length > rect.x + rect.w) { x = rect.x; y++; }
    if (y >= rect.y + rect.h) break;
    uiText(x, y, text, cls, .70);
    x += text.length + 2;
  }
}

function drawDetail(model, nav, rect, now) {
  const selected = selectedMapSpace(nav, model);
  const contact = newestMapContact(model);
  const hush = hushStatus(model, now);
  uiText(rect.x, rect.y, 'SELECTION', 'ui-label', .66);
  if (!selected) {
    uiText(rect.x, rect.y + 1, 'NO ROOM SELECTED', 'ui-secondary', .55);
  } else {
    uiText(rect.x, rect.y + 1, clip(selected.label, rect.w), selected.current ? 'ui-green' : selected.waypoint ? 'ui-blue' : 'ui-amber', .92);
    uiText(rect.x, rect.y + 2, `TAKE ${String(selected.objective.sequence).padStart(2, '0')} / ${String(model.progress.total).padStart(2, '0')}`, 'ui-label', .64);
    const facts = [
      ['STATE', selected.objective.recorded ? 'RECORDED' : selected.waypoint ? 'TARGET' : selected.current ? 'YOU ARE HERE' : 'UNRECORDED'],
      ['FLOOR', mapFloor(model, selected.floorId)?.label || 'UNKNOWN'],
      ['TIME', selected.objective.stamp || '--:--'],
      ['FILES', String(selected.objective.fileCount || 0).padStart(2, '0')],
    ];
    facts.forEach(([label, value], index) => {
      uiText(rect.x, rect.y + 4 + index, label, 'ui-label', .62);
      uiText(rect.x + 9, rect.y + 4 + index, clip(value, rect.w - 9), selected.objective.recorded ? 'ui-green' : selected.waypoint ? 'ui-blue' : 'ui-primary', .78);
    });
    if (selected.objective.notes?.[0] && rect.h >= 12) {
      uiText(rect.x, rect.y + 9, 'FILE', 'ui-label', .62);
      uiText(rect.x + 9, rect.y + 9, clip(selected.objective.notes[0].title || selected.objective.notes[0].id, rect.w - 9), 'ui-blue', .76);
    }
  }

  const hy = rect.y + Math.max(12, Math.floor(rect.h * .52));
  if (hy < rect.y + rect.h - 2) {
    uiLine(rect.x, hy - 1, rect.x + rect.w, hy - 1, undefined, .24);
    uiText(rect.x, hy, 'HUSH', 'ui-label', .66);
    uiText(rect.x + 9, hy, clip(`${hush.label} · ${hush.detail}`, rect.w - 9), hush.cls, .82);
    if (contact?.observation) {
      uiText(rect.x, hy + 2, 'AGE', 'ui-label', .62);
      uiText(rect.x + 9, hy + 2, ageText(contact, now), hush.cls, .76);
      uiText(rect.x, hy + 3, 'FLOOR', 'ui-label', .62);
      uiText(rect.x + 9, hy + 3, mapFloor(model, contact.observation.floorId)?.label || 'UNKNOWN', hush.cls, .76);
      const room = model.policy?.contactShowRoom === false ? 'HIDDEN BY RULE' : roomLabel(model, contact.observation.roomId, 'NO ROOM LOCK');
      uiText(rect.x, hy + 4, 'ROOM', 'ui-label', .62);
      uiText(rect.x + 9, hy + 4, clip(room, rect.w - 9), hush.cls, .76);
    } else {
      const lines = uiWrap('No current acoustic contact. The map only shows HUSH when the game has evidence.', Math.max(10, rect.w));
      lines.slice(0, Math.max(0, rect.y + rect.h - hy - 2)).forEach((line, index) => uiText(rect.x, hy + 2 + index, line, 'ui-secondary', .62));
    }
  }
}

export function drawMapView({ model, nav, bagLayout, now = 0 }) {
  const layout = mapLayoutFromBag(bagLayout);
  const floor = mapFloor(model, nav.floorId);
  const clockMs = typeof performance !== 'undefined' ? performance.now() : now * 1000;
  const route = routeLabel(model);
  const hush = hushStatus(model, clockMs);

  uiText(layout.floorRail.x, layout.floorRail.y, `FLOOR ${floor?.shortLabel || '--'} · ${clip(floor?.label || 'MAP UNAVAILABLE', 24)}`, 'ui-label', .78);
  rightText(layout.floorRail.x, layout.floorRail.y, layout.floorRail.w, `${model.progress.done}/${model.progress.total} TAKES · HUSH ${hush.label}`, hush.cls, .74);

  drawSystemStatus(model, { x: layout.mapViewport.x, y: layout.mapViewport.y, w: layout.mapViewport.w, h: 4 }, clockMs);
  const viewport = { ...layout.mapViewport, y: layout.mapViewport.y + 5, h: Math.max(4, layout.mapViewport.h - 7) };
  uiLine(viewport.x, viewport.y - .45, viewport.x + viewport.w, viewport.y - .45, undefined, .24);
  const commands = buildMapCommands({ model, nav, layout: { ...layout, mapViewport: viewport }, now: clockMs });
  drawMapCommands(commands, viewport, now);

  drawLegend({ x: layout.mapViewport.x, y: layout.mapViewport.y + layout.mapViewport.h - 1, w: layout.mapViewport.w, h: 2 });

  if (layout.dividerX != null) uiLine(layout.dividerX, layout.mapViewport.y - 1, layout.dividerX, layout.mapViewport.y + layout.mapViewport.h, undefined, .34);
  drawDetail(model, nav, layout.detail, clockMs);
  uiText(layout.progressRail.x, layout.progressRail.y, progressText(model, layout.progressRail.w), 'ui-blue', .68);
  rightText(layout.progressRail.x, layout.progressRail.y, layout.progressRail.w, route.text, route.cls, .68);
  return { layout, commands, selected: selectedMapSpace(nav, model), actions: mapActionRail(selectedMapSpace(nav, model), { floorCount: model.floors?.length || 1 }) };
}
