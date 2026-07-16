// Code-native VFD map glyphs.

import { uiDraw, uiGlyph, uiLine } from './ui.js';
import { themeRoleColor } from './palette.js';

export function drawPlayerMarker(point, heading = 0, alpha = 1) {
  const dx = Math.sin(heading) * 0.75;
  const dy = -Math.cos(heading) * 0.75;
  uiGlyph(Math.round(point.x), Math.round(point.y), '●', 'ui-green', alpha);
  uiLine(point.x, point.y, point.x + dx, point.y + dy, themeRoleColor('counter'), alpha, 1.25);
}

export function drawWaypointMarker(point, alpha = 1) {
  uiGlyph(Math.round(point.x), Math.round(point.y), '◆', 'ui-blue', alpha);
}

export function drawHushMarker(point, alpha = 1) {
  if (!point) return;
  uiGlyph(Math.round(point.x), Math.round(point.y), '●', 'ui-danger', alpha);
}

export function drawObjectiveMarker(command, alpha = 1) {
  const x = Math.round(command.point.x), y = Math.round(command.point.y);
  const cls = command.recorded ? 'ui-green' : command.waypoint ? 'ui-blue' : command.current ? 'ui-amber' : 'ui-primary';
  const glyph = command.recorded ? '■' : command.waypoint ? '◆' : command.current ? '●' : '◇';
  uiGlyph(x, y, glyph, cls, alpha);
  if (command.selected) {
    uiGlyph(x - 1, y, '▸', 'ui-amber', 0.65 + alpha * 0.35);
  }
}

export function drawAnomalyMarker(command, alpha = 1) {
  const p = command.point;
  if (!p) return;
  const x = Math.round(p.x), y = Math.round(p.y);
  const stale = command.state === 'decaying';
  const acquiring = command.state === 'acquiring';
  const danger = command.state === 'locked' || command.state === 'saturated';
  const a = alpha * (stale ? 0.48 : acquiring ? 0.66 : 0.92);
  const cls = stale ? 'ui-secondary' : danger ? 'ui-danger' : acquiring ? 'ui-amber' : 'ui-blue';
  // Four brackets around deliberately empty space. The centre is not a body.
  uiGlyph(x - 1, y - 1, '⌜', cls, a);
  uiGlyph(x + 1, y - 1, '⌝', cls, a);
  uiGlyph(x - 1, y + 1, '⌞', cls, a);
  uiGlyph(x + 1, y + 1, '⌟', cls, a);
  if (!stale && !acquiring) uiGlyph(x, y, 'Ø', 'ui-secondary', a * 0.82);
}

export function drawAnomalyRegion(command, alpha = 1) {
  if (!command.points?.length) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.globalAlpha = alpha * 0.52;
    ctx.strokeStyle = themeRoleColor('counter');
    ctx.lineWidth = 1.1 * dpr;
    ctx.setLineDash([2 * dpr, 3 * dpr]);
    ctx.beginPath();
    command.points.forEach((point, index) => {
      const x = point.x * cellW * dpr, y = point.y * cellH * dpr;
      if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.stroke(); ctx.restore();
  });
}
