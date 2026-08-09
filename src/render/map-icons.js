// Code-native VFD map glyphs.

import { uiDraw, uiGlyph, uiLine } from './ui.js';
import { themeRoleColor } from './palette.js';

// `tick` draws the old 0.75-cell facing stub. It is only used where there is no
// sight cone to say the same thing better (the compass fallback, the full map).
export function drawPlayerMarker(point, heading = 0, alpha = 1, { tick = true } = {}) {
  uiGlyph(Math.round(point.x), Math.round(point.y), '●', 'ui-green', alpha);
  if (!tick) return;
  const dx = Math.sin(heading) * 0.75;
  const dy = -Math.cos(heading) * 0.75;
  uiLine(point.x, point.y, point.x + dx, point.y + dy, themeRoleColor('counter'), alpha, 1.25);
}

export function drawWaypointMarker(point, alpha = 1) {
  uiGlyph(Math.round(point.x), Math.round(point.y), '◆', 'ui-blue', alpha);
}

// Recoverable field equipment has its own public layer. It is deliberately an
// amber boxed R: neither a blue story waypoint nor a red HUSH observation.
export function drawEquipmentMarker(point,alpha=1){
  if(!point)return;
  const x=Math.round(point.x),y=Math.round(point.y);
  uiGlyph(x,y,'R','ui-amber',alpha);
  uiGlyph(x-1,y,'[','ui-secondary',alpha*.55);
  uiGlyph(x+1,y,']','ui-secondary',alpha*.55);
}

// This is not a permanent enemy tracker. It is emitted only while main has
// confirmed that the player can presently see the manifestation in the world.
// The red question mark confirms the sighting without pretending the monitor
// understands what the manifestation is.
export function drawHushMarker(point, alpha = 1) {
  if (!point) return;
  uiGlyph(Math.round(point.x), Math.round(point.y), '?', 'ui-danger', alpha);
}

export function drawObjectiveMarker(command, alpha = 1) {
  const x = Math.round(command.point.x), y = Math.round(command.point.y);
  // A room that exists but has not been named yet: present, unmistakably not a
  // target. It is the only marker drawn hollow in the silkscreen colour.
  if (command.unknown) { uiGlyph(x, y, '?', 'ui-secondary', alpha * .55); return; }
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
