// AUDIOCORP local navigation display.
//
// This is a projection of the same map model used by the field case. It never
// reads AI state directly. Main supplies a sanitized exact body position for
// the literal HUSH dot; acoustic contact detail still comes from telemetry.

import { uiCellMetrics, uiDraw, uiGlyph, uiText, uiSize } from './ui.js';
import { drawMachinePanel } from './presentation.js';
import { themeRoleColor, UI_COLOR } from './palette.js';
import { buildMinimapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawHushMarker, drawPlayerMarker, drawWaypointMarker } from './map-icons.js';
import { mapCurrentAreaLabel, mapFloor, newestMapContact } from '../game/map-model.js';

const clip = (value, width) => {
  const text = String(value ?? '');
  const w = Math.max(1, Math.floor(width || 1));
  return text.length <= w ? text : w <= 1 ? '…' : `${text.slice(0, w - 1)}…`;
};

function roomLabel(model, roomId, fallback = 'UNKNOWN') {
  return (model?.spaces || []).find((space) => space.roomId === roomId)?.label || fallback;
}

function targetLabel(model) {
  if (!model?.waypoint) return 'NONE';
  return roomLabel(model, model.waypoint.roomId, 'TARGET');
}

function currentLabel(model) {
  return mapCurrentAreaLabel(model);
}

export function hushStatus(model, now = 0) {
  if(model?.hush?.active){
    const here=model.hush.floorId===model?.player?.floorId;
    const floor=mapFloor(model,model.hush.floorId);
    return{label:'ACTIVE',cls:'ui-danger',detail:here?'ON MAP':floor?.label||'OTHER FLOOR',floorDelta:0};
  }
  const contact = newestMapContact(model);
  if (!contact?.observation) return { label: 'NONE', cls: 'ui-secondary', detail: 'NO CONTACT', floorDelta: 0 };
  const state = String(contact.state || 'unresolved').toLowerCase();
  const age = Math.max(0, (now - Number(contact.observation.observedAt || now)) / 1000);
  const confidence = Math.round(Math.max(0, Math.min(1, Number(contact.observation.confidence) || 0)) * 100);
  const here = contact.observation.floorId === model?.player?.floorId;
  const floor = mapFloor(model, contact.observation.floorId);
  if (state === 'decaying') return { label: 'LAST SEEN', cls: 'ui-secondary', detail: `${age.toFixed(1)}S AGO`, floorDelta: 0 };
  if (state === 'acquiring') return { label: 'TRACING', cls: 'ui-amber', detail: `${confidence}%`, floorDelta: 0 };
  if (state === 'saturated') return { label: 'VERY NEAR', cls: 'ui-danger', detail: here ? `${confidence}%` : floor?.label || 'OTHER FLOOR', floorDelta: 0 };
  if (state === 'locked') return { label: 'NEARBY', cls: 'ui-danger', detail: here ? `${confidence}%` : floor?.label || 'OTHER FLOOR', floorDelta: 0 };
  return { label: 'UNCLEAR', cls: 'ui-blue', detail: floor?.label || `${confidence}%`, floorDelta: 0 };
}

function drawLocalTopology(command) {
  const { open, runs, transform, viewport, center, radius } = command;
  if (!Array.isArray(runs) && !(open instanceof Set)) return;
  const minX = Number(center?.x || 0) - Number(radius || 0) - 1;
  const maxX = Number(center?.x || 0) + Number(radius || 0) + 1;
  const minY = Number(center?.y || 0) - Number(radius || 0) - 1;
  const maxY = Number(center?.y || 0) + Number(radius || 0) + 1;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x * cellW * dpr, viewport.y * cellH * dpr, viewport.w * cellW * dpr, viewport.h * cellH * dpr);
    ctx.clip();
    // Heading-up: the runs are axis-aligned fills, so the CANVAS turns and the
    // rects stay square. Transforming two corners of a rotated rect would give a
    // bounding box, not a rotated room.
    const yaw = Number(transform.heading) || 0;
    const sc = transform.screenCenter;
    if (yaw && sc) {
      ctx.translate(sc.x * cellW * dpr, sc.y * cellH * dpr);
      ctx.rotate(-yaw);
      ctx.translate(-sc.x * cellW * dpr, -sc.y * cellH * dpr);
    }
    const project = (yaw && transform.pointFlat) ? transform.pointFlat.bind(transform) : transform.point.bind(transform);
    ctx.fillStyle = themeRoleColor('silkscreen');
    ctx.globalAlpha = 0.22;
    if (Array.isArray(runs)) {
      for (const run of runs) {
        if (run.y < minY || run.y > maxY || run.x1 < minX || run.x0 > maxX) continue;
        const x0 = Math.max(run.x0, minX);
        const x1 = Math.min(run.x1 + 1, maxX);
        const a = project({ x: x0, y: run.y });
        const b = project({ x: x1, y: run.y + 1 });
        ctx.fillRect(
          a.x * cellW * dpr,
          a.y * cellH * dpr,
          Math.max(1, b.x - a.x) * cellW * dpr,
          Math.max(1, b.y - a.y) * cellH * dpr,
        );
      }
    } else {
      for (const key of open) {
        const [x, y] = key.split(',').map(Number);
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        const point = project({ x, y });
        ctx.fillRect(point.x * cellW * dpr, point.y * cellH * dpr, Math.max(1, cellW * 0.48) * dpr, Math.max(1, cellH * 0.48) * dpr);
      }
    }
    ctx.restore();
  });
}

// ── the sightline ───────────────────────────────────────────────────────────
// Cells the map already knows are walkable, as a predicate. The model gives
// either an `open` Set of "x,y" keys or horizontal `runs`; both are supported
// because both are what the topology layer draws from.
export function openCellLookup({ open, runs }) {
  if (open instanceof Set) return (x, y) => open.has(`${x},${y}`);
  const byRow = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!byRow.has(run.y)) byRow.set(run.y, []);
    byRow.get(run.y).push(run);
  }
  return (x, y) => (byRow.get(y) || []).some((run) => x >= run.x0 && x <= run.x1);
}

export const SIGHT = Object.freeze({
  // A wide-ish human cone. Not the renderer's FOV — this is "what I could see if
  // I looked", which is what a map is for.
  halfAngle: Math.PI * 0.30,
  rays: 41,
  step: 0.34,
});

// March each ray until it leaves open floor. Returns map-space endpoints, so the
// caller can transform them and the wedge inherits any flip the map applies.
export function sightPolygon({ origin, heading, isOpen, radius }) {
  const reach = Math.max(2, Math.min(Number(radius) || 10, 14));
  const points = [];
  for (let i = 0; i < SIGHT.rays; i += 1) {
    const t = SIGHT.rays === 1 ? 0.5 : i / (SIGHT.rays - 1);
    const angle = heading - SIGHT.halfAngle + t * SIGHT.halfAngle * 2;
    // Heading 0 is north, matching the player marker's own convention.
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    let travelled = 0;
    for (let d = SIGHT.step; d <= reach; d += SIGHT.step) {
      const x = origin.x + dx * d;
      const y = origin.y + dy * d;
      if (!isOpen(Math.floor(x), Math.floor(y))) break;
      travelled = d;
    }
    points.push({ x: origin.x + dx * travelled, y: origin.y + dy * travelled });
  }
  return points;
}

function drawSight(command) {
  const { origin, heading, transform, viewport, radius } = command;
  const isOpen = openCellLookup(command);
  // Standing in something the map does not consider open (a doorway mid-swing,
  // an unmapped cell) would otherwise produce a zero-length cone that flickers.
  if (!isOpen(Math.floor(origin.x), Math.floor(origin.y))) return;
  const edge = sightPolygon({ origin, heading, isOpen, radius });
  if (edge.length < 3) return;
  const apex = transform.point(origin);
  const screen = edge.map((point) => transform.point(point));
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const sx = (p) => p.x * cellW * dpr;
    const sy = (p) => p.y * cellH * dpr;
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x * cellW * dpr, viewport.y * cellH * dpr, viewport.w * cellW * dpr, viewport.h * cellH * dpr);
    ctx.clip();
    const grad = ctx.createRadialGradient(sx(apex), sy(apex), 0, sx(apex), sy(apex),
      Math.max(1, (Number(radius) || 10) * cellW * dpr));
    const lit = themeRoleColor('counter');
    grad.addColorStop(0, lit);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx(apex), sy(apex));
    for (const point of screen) ctx.lineTo(sx(point), sy(point));
    ctx.closePath();
    ctx.fill();
    // A hairline along the far edge, so the shape of what the walls cut is legible
    // rather than just a soft glow.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = lit;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    screen.forEach((point, i) => (i ? ctx.lineTo(sx(point), sy(point)) : ctx.moveTo(sx(point), sy(point))));
    ctx.stroke();
    ctx.restore();
  });
}

function drawCommands(commands, now) {
  for (const command of commands) {
    if (command.kind === 'local-topology') drawLocalTopology(command);
    else if (command.kind === 'sight') drawSight(command);
    else if (command.kind === 'player') drawPlayerMarker(command.point, command.heading, 1, { tick: !commands.some((c) => c.kind === 'sight') });
    else if (command.kind === 'waypoint' || command.kind === 'connector-target') drawWaypointMarker(command.point, .95);
    else if (command.kind === 'waypoint-edge' || command.kind === 'connector-edge') {
      drawWaypointMarker(command.point, .92);
      if (command.floorDelta) uiGlyph(Math.round(command.point.x), Math.round(command.point.y) + 1, command.floorDelta > 0 ? '↑' : '↓', 'ui-blue', .78);
    }
    else if (command.kind === 'anomaly-contact' || command.kind === 'anomaly-edge') {
      drawAnomalyMarker(command, .80 + Math.sin(now * 12) * .14);
    }
    else if (command.kind === 'hush' || command.kind === 'hush-edge') {
      drawHushMarker(command.point, .88 + Math.sin(now * 10) * .12);
    }
  }
}

// A noise you just heard, blinking where it came from, and then gone. It is not a
// contact and it must never read as one: the hush's own dot is solid red, this is
// a hollow ring that fades out. The map is allowed to tell you what you heard a
// second ago; it is not allowed to imply the thing is still standing there.
function drawMischiefBlink(commands, mischief, viewport) {
  if (!mischief) return;
  const sight = commands.find((command) => command.kind === 'sight')
    || commands.find((command) => command.kind === 'local-topology');
  if (!sight?.transform) return;
  const life = Math.max(1, Number(mischief.life) || 1);
  const t = Math.max(0, Math.min(1, Number(mischief.age) / life));
  const point = sight.transform.point({ x: mischief.x, y: mischief.y });
  if (point.x < viewport.x - .5 || point.x > viewport.x + viewport.w + .5) return;
  if (point.y < viewport.y - .5 || point.y > viewport.y + viewport.h + .5) return;
  // Three quick blinks over its life, dimming as it goes.
  const blink = Math.abs(Math.cos(t * Math.PI * 3));
  const alpha = (1 - t) * (.35 + blink * .65);
  // Drawn as geometry, not as a glyph. '◌' is not in the VFD atlas, so the ring
  // was being asked for and silently not rendered — the marker was in the right
  // place, in the right colour, and invisible. An expanding ring also reads as a
  // sound arriving, which a character never would.
  uiDraw(({ ctx, cellW, cellH }) => {
    const cx = (point.x + .5) * cellW;
    const cy = (point.y + .5) * cellH;
    const r = Math.max(cellW, cellH) * (.55 + t * .9);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = UI_COLOR.danger;
    ctx.lineWidth = Math.max(1, cellW * .16);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // A second, tighter ring so it still reads at one-cell scale on a small panel.
    ctx.globalAlpha = alpha * .8;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r * .42), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

export function drawMinimap(model, opts = {}) {
  if (!model || typeof model !== 'object' || !model.player) return;
  const { cols } = uiSize();
  const width = Math.max(24, Math.floor(opts.bounds?.w || 28));
  const height = Math.max(12, Math.floor(opts.bounds?.h || 14));
  const x0 = Math.floor(opts.bounds?.x ?? (cols - width - 2));
  const y0 = Math.floor(opts.bounds?.y ?? 2);
  const now = opts.now || 0;
  const target = targetLabel(model);
  const here = currentLabel(model);
  const hush = hushStatus(model, now);
  const panel = drawMachinePanel(x0, y0, width, height, {
    label: 'MAP',
    source: opts.source || `TARGET ${clip(target, 10)}`,
    meter: false,
    theme: hush.cls === 'ui-danger' ? 'green' : 'amber',
  });
  const viewport = {
    x: panel.x + 1,
    y: panel.y + 3,
    w: Math.max(8, panel.w - 2),
    h: Math.max(4, panel.h - 6),
  };

  uiText(panel.x, panel.y, `YOU ${clip(here, Math.max(4, panel.w - 4))}`, 'ui-green', .78);
  uiText(panel.x, panel.y + 1, `TARGET ${clip(target, Math.max(4, panel.w - 7))}`, model.waypoint ? 'ui-blue' : 'ui-secondary', .74);
  uiText(panel.x, panel.y + 2, `HUSH ${clip(hush.label, 8)} ${clip(hush.detail, Math.max(3, panel.w - 16))}`, hush.cls, .76);

  const commands = buildMinimapCommands({ model, viewport, radius: opts.radius || 18, now, aspect: uiCellMetrics().aspect });
  drawCommands(commands, now);
  drawMischiefBlink(commands, opts.mischief, viewport);

  const floor = model.floors.find((candidate) => candidate.id === model.player.floorId);
  const floorTarget = commands.find((command) => command.kind === 'floor-target');
  const anomalyFloor = commands.find((command) => command.kind === 'anomaly-floor');
  const hushFloor = commands.find((command) => command.kind === 'hush-floor');
  let footer = floor?.label || 'POSITION UNKNOWN';
  if (hushFloor?.delta) footer = `HUSH ${hushFloor.delta > 0 ? '+' : ''}${hushFloor.delta} FLOOR`;
  else if (anomalyFloor?.delta) footer = `HUSH ${anomalyFloor.delta > 0 ? '+' : ''}${anomalyFloor.delta} FLOOR`;
  else if (floorTarget?.delta) footer = `TARGET ${floorTarget.delta > 0 ? '+' : ''}${floorTarget.delta} FLOOR`;
  uiText(panel.x, panel.y + panel.h - 1, clip(footer, panel.w), floorTarget?.delta || anomalyFloor?.delta ? 'ui-blue' : 'ui-label', .72);
  if (opts.expanded) uiText(panel.x, panel.y + panel.h, '[GREEN] YOU · [BLUE] TARGET · [RED ●] HUSH', 'ui-secondary', .66);
}

// Small explicit marker used only for recorder playback origin. It is not part
// of the navigation or HUSH telemetry model.
export function drawRecorderReturn(model, point, opts = {}) {
  if (!model?.player?.resolved || !point) return;
  const clone = {
    ...model,
    waypoint: { roomId: null, floorId: model.player.floorId, position: point },
    contacts: [],
  };
  drawMinimap(clone, { ...opts, source: 'RECORDER RETURN' });
}
