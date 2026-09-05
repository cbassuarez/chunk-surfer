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

// The target lozenge, drawn as real geometry rather than asked for as a
// codepoint. '◆'/'◇' are not in every monospace face the atlas can fall back to,
// and uiGlyph fails SILENTLY on a glyph it cannot rasterise — right cell, right
// colour, no pixels. The waypoint was rendering as an empty pair of brackets.
export function drawTargetLozenge(cx, cy, alpha = 1, { hollow = false, role = 'accent' } = {}) {
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const x = (cx + .5) * cellW * dpr, y = (cy + .5) * cellH * dpr;
    const rx = cellW * dpr * .42, ry = cellH * dpr * .36;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.beginPath();
    ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y);
    ctx.closePath();
    if (hollow) { ctx.strokeStyle = themeRoleColor(role); ctx.lineWidth = Math.max(dpr, cellW * dpr * .16); ctx.stroke(); }
    else { ctx.fillStyle = themeRoleColor(role); ctx.fill(); }
    ctx.restore();
  });
}

export function drawWaypointMarker(point, alpha = 1, {edgeDirection='',playerSelected=false}={}) {
  if(!point)return;
  const x=Math.round(point.x),y=Math.round(point.y);
  drawTargetLozenge(x,y,alpha,{hollow:playerSelected});
  if(edgeDirection){
    const ox=edgeDirection==='→'?-1:edgeDirection==='←'?1:0;
    const oy=edgeDirection==='↓'?-1:edgeDirection==='↑'?1:0;
    uiGlyph(x+ox,y+oy,edgeDirection,'ui-blue',alpha*.82);
    return;
  }
  // A target is an instrument acquisition, not another one-cell room mark.
  // Keep the centre readable but give it enough footprint to survive noisy map
  // topology and the small HUD viewport.
  uiGlyph(x-1,y,'[','ui-blue',alpha*.58);
  uiGlyph(x+1,y,']','ui-blue',alpha*.58);
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
export function drawHushMarker(point, alpha = 1, {edgeDirection=''}={}) {
  if (!point) return;
  const x=Math.round(point.x),y=Math.round(point.y);
  uiGlyph(x,y,'?','ui-danger',alpha);
  if(edgeDirection){
    const ox=edgeDirection==='→'?-1:edgeDirection==='←'?1:0;
    const oy=edgeDirection==='↓'?-1:edgeDirection==='↑'?1:0;
    uiGlyph(x+ox,y+oy,edgeDirection,'ui-danger',alpha*.86);
    return;
  }
  uiGlyph(x-1,y-1,'⌜','ui-danger',alpha*.7);
  uiGlyph(x+1,y-1,'⌝','ui-danger',alpha*.7);
  uiGlyph(x-1,y+1,'⌞','ui-danger',alpha*.7);
  uiGlyph(x+1,y+1,'⌟','ui-danger',alpha*.7);
}

// HUSH knowledge is centred on the player because that is the fact the monitor
// is allowed to reveal. It never implies a hidden HUSH bearing or body position.
export function drawHushAwareness(command,alpha=1){
  if(!command?.point)return;
  const mode=String(command.mode||'none');
  if(mode==='none')return;
  const danger=mode==='locked'||mode==='direct'||mode==='pinpoint';
  const role=danger?'danger':'counter';
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const cx=(command.point.x+.5)*cellW*dpr;
    const cy=(command.point.y+.5)*cellH*dpr;
    const rx=Math.max(3*dpr,cellW*dpr*(danger?1.7:1.25));
    const ry=Math.max(3*dpr,cellH*dpr*(danger?1.05:.78));
    ctx.save();
    ctx.globalAlpha=alpha*(danger ? .72 : .46);
    ctx.strokeStyle=themeRoleColor(role);
    ctx.lineWidth=Math.max(.75*dpr,1);
    if(!danger)ctx.setLineDash([2*dpr,3*dpr]);
    ctx.beginPath();
    ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();
  });
}

export function drawObjectiveMarker(command, alpha = 1) {
  const x = Math.round(command.point.x), y = Math.round(command.point.y);
  // A room that exists but has not been named yet: present, unmistakably not a
  // target. It is the only marker drawn hollow in the silkscreen colour.
  if (command.unknown) { uiGlyph(x, y, '?', 'ui-secondary', alpha * .55); return; }
  const cls = command.recorded ? 'ui-green' : command.waypoint ? 'ui-blue' : command.current ? 'ui-amber' : 'ui-primary';
  // Rooms and targets are lozenges, drawn (see drawTargetLozenge) rather than
  // typed: the two diamond codepoints this used to ask for are not in every
  // fallback face, and every unnamed room on the page was coming out blank.
  // A ROOM YOU ARE MEANT TO RECORD IN LOOKS DIFFERENT FROM A ROOM.
  //
  // Every un-recorded space used to draw the same hollow lozenge, so the five
  // rooms the whole job is about were indistinguishable from the forty that are
  // simply rooms — and "where am I supposed to be recording?" is the question
  // this page is most often opened to answer. A take room is FILLED and in the
  // accent role, and carries its number.
  const recordable = Number.isFinite(command.sequence) && !command.recorded;
  if (command.recorded || command.current) uiGlyph(x, y, command.recorded ? '■' : '●', cls, alpha);
  // Filled against hollow is the whole distinction, and it is enough. The take
  // NUMBER was printed beside it too and collided with the room label two cells
  // over; the caption already names the take for whatever is selected.
  else if (recordable) drawTargetLozenge(x, y, alpha, { hollow: false, role: 'accent' });
  else drawTargetLozenge(x, y, alpha, { hollow: !command.waypoint, role: command.waypoint ? 'accent' : 'phosphor' });
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
