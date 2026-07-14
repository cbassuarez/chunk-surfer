// AUDIOCORP local navigation display.
//
// This is a projection of the same map model used by the field case. It never
// reads AI state directly; the only presence information it may draw is an
// evidence-derived acoustic contact supplied by hush-telemetry.js.

import { uiDraw, uiGlyph, uiText, uiSize } from './ui.js';
import { drawMachinePanel } from './presentation.js';
import { themeRoleColor } from './palette.js';
import { buildMinimapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawPlayerMarker, drawWaypointMarker } from './map-icons.js';
import { mapFloor, newestMapContact } from '../game/map-model.js';

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
  if (model?.player?.roomId) return roomLabel(model, model.player.roomId, model.player.roomId);
  return mapFloor(model, model?.player?.floorId)?.label || 'POSITION UNKNOWN';
}

export function hushStatus(model, now = 0) {
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
    ctx.fillStyle = themeRoleColor('silkscreen');
    ctx.globalAlpha = 0.22;
    if (Array.isArray(runs)) {
      for (const run of runs) {
        if (run.y < minY || run.y > maxY || run.x1 < minX || run.x0 > maxX) continue;
        const x0 = Math.max(run.x0, minX);
        const x1 = Math.min(run.x1 + 1, maxX);
        const a = transform.point({ x: x0, y: run.y });
        const b = transform.point({ x: x1, y: run.y + 1 });
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
        const point = transform.point({ x, y });
        ctx.fillRect(point.x * cellW * dpr, point.y * cellH * dpr, Math.max(1, cellW * 0.48) * dpr, Math.max(1, cellH * 0.48) * dpr);
      }
    }
    ctx.restore();
  });
}

function drawCommands(commands, now) {
  for (const command of commands) {
    if (command.kind === 'local-topology') drawLocalTopology(command);
    else if (command.kind === 'player') drawPlayerMarker(command.point, command.heading, 1);
    else if (command.kind === 'waypoint' || command.kind === 'connector-target') drawWaypointMarker(command.point, .95);
    else if (command.kind === 'waypoint-edge' || command.kind === 'connector-edge') {
      drawWaypointMarker(command.point, .92);
      if (command.floorDelta) uiGlyph(Math.round(command.point.x), Math.round(command.point.y) + 1, command.floorDelta > 0 ? '↑' : '↓', 'ui-blue', .78);
    }
    else if (command.kind === 'anomaly-contact' || command.kind === 'anomaly-edge') {
      drawAnomalyMarker(command, .80 + Math.sin(now * 12) * .14);
    }
  }
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

  const commands = buildMinimapCommands({ model, viewport, radius: opts.radius || 18, now });
  drawCommands(commands, now);

  const floor = model.floors.find((candidate) => candidate.id === model.player.floorId);
  const floorTarget = commands.find((command) => command.kind === 'floor-target');
  const anomalyFloor = commands.find((command) => command.kind === 'anomaly-floor');
  let footer = floor?.label || 'POSITION UNKNOWN';
  if (anomalyFloor?.delta) footer = `HUSH ${anomalyFloor.delta > 0 ? '+' : ''}${anomalyFloor.delta} FLOOR`;
  else if (floorTarget?.delta) footer = `TARGET ${floorTarget.delta > 0 ? '+' : ''}${floorTarget.delta} FLOOR`;
  uiText(panel.x, panel.y + panel.h - 1, clip(footer, panel.w), floorTarget?.delta || anomalyFloor?.delta ? 'ui-blue' : 'ui-label', .72);
  if (opts.expanded) uiText(panel.x, panel.y + panel.h, '[GREEN] YOU · [BLUE] TARGET · [RED] HUSH', 'ui-secondary', .66);
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
