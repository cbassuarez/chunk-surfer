// AUDIOCORP local navigation display.
//
// This is a projection of the same map model used by the field case. It never
// reads AI state directly; the only presence information it may draw is an
// evidence-derived acoustic contact supplied by hush-telemetry.js.

import { uiDraw, uiGlyph, uiText, uiSize } from './ui.js';
import { drawMachinePanel } from './presentation.js';
import { themeRoleColor } from './palette.js';
import { buildMinimapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawObjectiveMarker, drawPlayerMarker, drawWaypointMarker } from './map-icons.js';
import { newestMapContact } from '../game/map-model.js';

const clip = (value, width) => {
  const text = String(value ?? '');
  return text.length <= width ? text : width <= 1 ? '…' : `${text.slice(0, width - 1)}…`;
};

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

function contactHeader(model) {
  const contact = newestMapContact(model);
  if (!contact?.observation) return null;
  if (contact.state === 'decaying') return 'SOURCE / LAST RETURN';
  if (contact.state === 'acquiring') return 'SOURCE / ACQUIRING';
  if (contact.state === 'unresolved') return 'SOURCE / UNRESOLVED';
  if (contact.state === 'saturated') return 'SOURCE / SATURATED';
  return 'SOURCE / LOCKED';
}

export function drawMinimap(model, opts = {}) {
  if (!model || typeof model !== 'object' || !model.player) return;
  const { cols } = uiSize();
  const width = Math.max(18, Math.floor(opts.bounds?.w || 22));
  const height = Math.max(9, Math.floor(opts.bounds?.h || 11));
  const x0 = Math.floor(opts.bounds?.x ?? (cols - width - 2));
  const y0 = Math.floor(opts.bounds?.y ?? 2);
  const targetLabel = model.waypoint
    ? (model.spaces.find((space) => space.roomId === model.waypoint.roomId)?.label || 'TARGET')
    : 'NO TARGET';
  const source = opts.source || contactHeader(model) || `NAV / ${clip(targetLabel, 12)}`;
  const panel = drawMachinePanel(x0, y0, width, height, { label: 'LOCATION', source, meter: false });
  const viewport = {
    x: panel.x + 1,
    y: panel.y + 2,
    w: Math.max(7, panel.w - 2),
    h: Math.max(4, panel.h - 3),
  };

  uiText(panel.x, panel.y, 'N', 'ui-green', .82);
  const commands = buildMinimapCommands({ model, viewport, radius: opts.radius || 18, now: opts.now || 0 });
  drawCommands(commands, opts.now || 0);

  const floor = model.floors.find((candidate) => candidate.id === model.player.floorId);
  const floorTarget = commands.find((command) => command.kind === 'floor-target');
  const anomalyFloor = commands.find((command) => command.kind === 'anomaly-floor');
  let footer = floor?.label || 'POSITION UNRESOLVED';
  if (anomalyFloor?.delta) footer = `SOURCE RETURN ${anomalyFloor.delta > 0 ? '+' : ''}${anomalyFloor.delta} FLOOR`;
  else if (floorTarget?.delta) footer = `TARGET ${floorTarget.delta > 0 ? '+' : ''}${floorTarget.delta} FLOOR`;
  uiText(panel.x, panel.y + panel.h - 1, clip(footer, panel.w), anomalyFloor ? 'ui-danger' : 'ui-blue', .78);
  if (opts.expanded) uiText(panel.x, panel.y + panel.h, '[GREEN] YOU · [BLUE] TARGET · [BRACKETS] RETURN', 'ui-secondary', .66);
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
