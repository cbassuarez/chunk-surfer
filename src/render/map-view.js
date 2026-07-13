// Field-case MAP renderer. Reads semantic commands; mutates no gameplay state.

import { uiDraw, uiGlyph, uiLine, uiText, uiWrap } from './ui.js';
import { themeRoleColor } from './palette.js';
import { buildMapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawAnomalyRegion, drawObjectiveMarker, drawPlayerMarker } from './map-icons.js';
import { mapLayoutFromBag } from './map-layout.js';
import { mapFloor, newestMapContact } from '../game/map-model.js';
import { selectedMapSpace } from '../game/map-navigation.js';
import { mapActionRail } from '../game/map-actions.js';

const clip = (value, width) => {
  const text = String(value ?? '');
  const w = Math.max(1, Math.floor(width));
  return text.length <= w ? text : w <= 1 ? '…' : `${text.slice(0, w - 1)}…`;
};

function rightText(x, y, w, text, cls = 'ui-secondary', alpha = 1) {
  const value = clip(text, w);
  uiText(x + Math.max(0, w - value.length), y, value, cls, alpha);
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
    ctx.globalAlpha = 0.22;
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
    ctx.save(); ctx.globalAlpha = command.status === 'ok' ? 0.48 : 0.30;
    ctx.strokeStyle = themeRoleColor(command.status === 'ok' ? 'counter' : 'danger');
    ctx.lineWidth = 1.25 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath();
    command.points.forEach((p, i) => { const x = p.x * cellW * dpr, y = p.y * cellH * dpr; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.restore();
  });
}

function drawMapCommands(commands, viewport, now) {
  for (const command of commands) {
    if (command.kind === 'topology') drawTopology(command, viewport);
    else if (command.kind === 'route') drawRoute(command);
    else if (command.kind === 'door') uiGlyph(Math.round(command.point.x), Math.round(command.point.y), command.state === 'locked' ? '╫' : command.state === 'closed' ? '┼' : '·', command.state === 'locked' ? 'ui-danger' : 'ui-label', .66);
    else if (command.kind === 'connector') uiGlyph(Math.round(command.point.x), Math.round(command.point.y), '↕', command.selected ? 'ui-blue' : 'ui-label', command.selected ? .92 : .56);
    else if (command.kind === 'objective') {
      drawObjectiveMarker(command, command.selected ? .74 + Math.sin(now * 7) * .18 : .82);
      if (command.showLabel) {
        const label=clip(command.label,Math.max(4,Math.min(16,viewport.w-4)));
        const lx=Math.max(viewport.x,Math.min(viewport.x+viewport.w-label.length,Math.round(command.point.x)+2));
        uiText(lx,Math.round(command.point.y),label,command.selected?'ui-amber':'ui-secondary',command.selected?.92:.58);
      }
    }
    else if (command.kind === 'player') drawPlayerMarker(command.point, command.heading, 1);
    else if (command.kind === 'anomaly-contact') drawAnomalyMarker(command, .78 + Math.sin(now * 12) * .16);
    else if (command.kind === 'anomaly-region') drawAnomalyRegion(command, .72);
  }
}

function progressText(model, width) {
  const parts = (model.spaces || []).sort((a, b) => a.objective.sequence - b.objective.sequence).map((space) => `${space.shortLabel || space.objective.sequence} ${space.objective.recorded ? '■' : '□'}`);
  return clip(parts.join('  '), width);
}

function ageText(contact, now) {
  if (!contact?.observation) return '--';
  if (contact.state === 'locked' || contact.state === 'acquiring' || contact.state === 'unresolved' || contact.state === 'saturated') return 'LIVE';
  return `${Math.max(0, (now - contact.observation.observedAt) / 1000).toFixed(1)} SEC`;
}

function drawDetail(model, nav, rect, now) {
  const selected = selectedMapSpace(nav, model);
  const contact = newestMapContact(model);
  const contactRecent = contact?.observation && (contact.state !== 'none');
  if (contactRecent && contact.state !== 'decaying') {
    uiText(rect.x, rect.y, 'SOURCE / NO RECORD', 'ui-danger', .90);
    uiText(rect.x, rect.y + 2, 'STATUS', 'ui-label', .62);
    uiText(rect.x + 12, rect.y + 2, String(contact.state).toUpperCase(), 'ui-danger', .86);
    uiText(rect.x, rect.y + 3, 'FLOOR', 'ui-label', .62);
    uiText(rect.x + 12, rect.y + 3, mapFloor(model, contact.observation.floorId)?.label || 'UNRESOLVED', 'ui-danger', .78);
    uiText(rect.x, rect.y + 4, 'LOCATION', 'ui-label', .62);
    const room = (model.spaces || []).find((space) => space.roomId === contact.observation.roomId);
    const location = model.policy?.contactShowRoom === false
      ? 'POSITION / NO LABEL'
      : (room?.label || 'NO MANIFEST RECORD');
    uiText(rect.x + 12, rect.y + 4, clip(location, rect.w - 12), 'ui-danger', .78);
    uiText(rect.x, rect.y + 5, 'AGE', 'ui-label', .62);
    uiText(rect.x + 12, rect.y + 5, ageText(contact, now), 'ui-danger', .78);
    const lines = uiWrap('A coherent return occupies a position not represented on the facility manifest.', Math.max(10, rect.w));
    lines.slice(0, Math.max(0, rect.h - 8)).forEach((line, index) => uiText(rect.x, rect.y + 7 + index, line, 'ui-secondary', .68));
    return;
  }
  if (!selected) { uiText(rect.x, rect.y, 'NO MAP ENTRY', 'ui-secondary', .55); return; }
  uiText(rect.x, rect.y, clip(selected.label, rect.w), 'ui-amber', .92);
  uiText(rect.x, rect.y + 1, `TAKE ${String(selected.objective.sequence).padStart(2, '0')} / ${String(model.progress.total).padStart(2, '0')}`, 'ui-label', .64);
  const facts = [
    ['STATUS', selected.objective.recorded ? 'RECORDED' : selected.waypoint ? 'MARKED' : selected.current ? 'IN ROOM' : 'AVAILABLE'],
    ['FLOOR', mapFloor(model, selected.floorId)?.label || 'UNRESOLVED'],
    ['TIMESTAMP', selected.objective.stamp || '--:--'],
    ['FILES', String(selected.objective.fileCount || 0).padStart(2, '0')],
  ];
  facts.forEach(([label, value], index) => { uiText(rect.x, rect.y + 3 + index, label, 'ui-label', .62); uiText(rect.x + 12, rect.y + 3 + index, clip(value, rect.w - 12), selected.objective.recorded ? 'ui-green' : selected.waypoint ? 'ui-blue' : 'ui-primary', .78); });
  if (selected.objective.notes?.[0] && rect.h >= 10) {
    uiText(rect.x, rect.y + 8, 'ATTACHED FILE', 'ui-label', .62);
    uiText(rect.x, rect.y + 9, clip(selected.objective.notes[0].title || selected.objective.notes[0].id, rect.w), 'ui-blue', .76);
  }
}

export function drawMapView({ model, nav, bagLayout, now = 0 }) {
  const layout = mapLayoutFromBag(bagLayout);
  const floor = mapFloor(model, nav.floorId);
  uiText(layout.floorRail.x, layout.floorRail.y, `${floor?.shortLabel || '--'} / ${floor?.label || 'MAP UNAVAILABLE'}`, 'ui-label', .76);
  rightText(layout.floorRail.x, layout.floorRail.y, layout.floorRail.w, `NORTH ↑  ${model.progress.done}/${model.progress.total}`, 'ui-blue', .70);
  uiLine(layout.mapViewport.x, layout.mapViewport.y - .35, layout.mapViewport.x + layout.mapViewport.w, layout.mapViewport.y - .35, undefined, .22);
  const clockMs = typeof performance !== 'undefined' ? performance.now() : now * 1000;
  const commands = buildMapCommands({ model, nav, layout, now: clockMs });
  drawMapCommands(commands, layout.mapViewport, now);
  if (layout.dividerX != null) uiLine(layout.dividerX, layout.mapViewport.y - 1, layout.dividerX, layout.mapViewport.y + layout.mapViewport.h, undefined, .34);
  drawDetail(model, nav, layout.detail, clockMs);
  uiText(layout.progressRail.x, layout.progressRail.y, progressText(model, layout.progressRail.w), 'ui-blue', .68);
  return { layout, commands, selected: selectedMapSpace(nav, model), actions: mapActionRail(selectedMapSpace(nav, model), { floorCount: model.floors?.length || 1 }) };
}
