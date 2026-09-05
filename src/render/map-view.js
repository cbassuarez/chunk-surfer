// Field-case MAP renderer. Reads semantic commands; mutates no gameplay state.

import { uiDraw, uiGlyph, uiLine, uiText, uiWrap } from './ui.js';
import { themeRoleColor } from './palette.js';
import { buildMapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawAnomalyRegion, drawEquipmentMarker, drawObjectiveMarker, drawPlayerMarker } from './map-icons.js';
import { mapLayoutFromBag } from './map-layout.js';
import { mapCurrentAreaLabel, mapFloor, newestMapContact } from '../game/map-model.js';
import { selectedMapSpace } from '../game/map-navigation.js';
import { mapActionRail } from '../game/map-actions.js';
import { hushStatus } from './minimap.js';
import { fitText } from './fit-text.js';

const clip = (value, width) => fitText(value, Math.max(1, Math.floor(width)));

// How far each storey is offset from the one under it, in cells, and how much
// dimmer it gets per storey away from the one being read.
const STACK_DX = 1.7;
const STACK_DY = 0.85;
const STACK_FADE = 0.46;

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
  return model.waypoint.label || roomLabel(model, model.waypoint.roomId, 'TARGET');
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

function drawTopology(command, viewport, alpha = 1) {
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
    ctx.globalAlpha = 0.18 * alpha;
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

// `ghost` draws a floor that is NOT the one you are reading: its shape and its
// doors, dim, and nothing else. A stacked floor should read as a storey of the
// building, not as forty labels behind the one you are looking at.
function drawMapCommands(commands, viewport, now, { ghost = false, alpha = 1 } = {}) {
  // The tower is one page now, and its rooms are stacked — the ringing room and
  // the bell chamber share a footprint — so two callouts can want the same row.
  // Nudge the later one down rather than printing them on top of each other.
  const labelRows = new Set();
  for (const command of commands) {
    if (command.kind === 'topology') drawTopology(command, viewport, alpha);
    else if (ghost) continue;
    else if (command.kind === 'route') drawRoute(command);
    else if (command.kind === 'door') {
      const glyph=command.state==='locked'?'╫':command.state==='sealed'||command.state==='blocked'?'▓':command.state==='unknown'?'?':command.state==='closed'?'┼':'·';
      const cls=command.state==='locked'||command.state==='sealed'||command.state==='blocked'?'ui-danger':command.state==='closed'?'ui-amber':command.state==='unknown'?'ui-secondary':'ui-label';
      uiGlyph(Math.round(command.point.x),Math.round(command.point.y),glyph,cls,.72);
    }
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
    else if (command.kind === 'hush-visible') drawAnomalyMarker(command,.9+Math.sin(now*10)*.08);
    else if (command.kind === 'equipment') drawEquipmentMarker(command.point,command.carrierOpen ? .72+Math.sin(now*7)*.2 : .72);
    else if (command.kind === 'anomaly-contact') drawAnomalyMarker(command, .82 + Math.sin(now * 12) * .16);
    else if (command.kind === 'anomaly-region') drawAnomalyRegion(command, .72);
  }
}

function progressText(model, width) {
  const parts = (model.spaces || [])
    .filter((space) => space.objective)
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
  // MEASURE THE RIGHT SIDE BEFORE CLIPPING THE LEFT.
  //
  // The left string was clipped to a hardcoded `rect.w - 22` while the right one
  // was drawn right-aligned at its full length — and "HUSH NONE · ROUTE OK ·
  // SAME FLOOR" is thirty-three characters, so eleven of them landed on top of
  // the target name. On screen that read as one garbled word.
  const right=`HUSH ${hush.label} · ${route.text}`;
  const you=clip(currentRoomLabel(model),Math.max(8,Math.floor(rect.w*.28)));
  const target=clip(targetRoomLabel(model),Math.max(8,Math.floor(rect.w*.25)));
  uiText(rect.x,rect.y,clip(`YOU ${you} · MARK ${target}`,Math.max(1,rect.w-right.length-2)),'ui-primary',.78);
  rightText(rect.x,rect.y,rect.w,right,hush.cls==='ui-danger'?hush.cls:route.cls,.72);
}

function spaceState(space){
  // The symbol, the word and the colour for one room's state — shared by the
  // caption and the legend so a glyph on the plan and a word under it can never
  // disagree. RECORDABLE ranks above VISITED: "somewhere I am supposed to
  // record" is the question the map is most often asked.
  if(space.current)return['●','CURRENT','ui-green'];
  if(space.waypoint)return['◆','TARGET','ui-blue'];
  if(space.objective?.recorded)return['■','RECORDED','ui-green'];
  if(space.objective)return['◈','RECORDABLE','ui-blue'];
  if(space.unknown)return['?','UNKNOWN','ui-secondary'];
  if(space.visited)return['◇','VISITED','ui-primary'];
  return['·','NOT VISITED','ui-secondary'];
}

function drawLegend(rect) {
  // RECORDABLE FIRST, because it is the one symbol that answers a question the
  // player actually has — "where am I supposed to be recording?" — and it was
  // previously indistinguishable from any other room.
  const items = [
    ['◈', 'RECORDABLE', 'ui-blue'],
    ['■', 'DONE', 'ui-green'],
    ['●', 'YOU', 'ui-green'],
    ['◆', 'TARGET', 'ui-blue'],
    ['◇', 'ROOM', 'ui-primary'],
    ['╫', 'LOCKED', 'ui-danger'],
  ];
  let x = rect.x;
  for (const [glyph, label, cls] of items) {
    const width = 2 + label.length + 2;
    if (x + width > rect.x + rect.w) break;
    uiGlyph(x, rect.y, glyph, cls, .8);
    uiText(x + 2, rect.y, label, 'ui-secondary', .55);
    x += width;
  }
}

function drawDetail(model, nav, rect) {
  const selected = selectedMapSpace(nav, model);
  if (!selected) {
    uiText(rect.x, rect.y, clip('NO ROOM SELECTED · [WASD] TO CHOOSE ONE', rect.w), 'ui-secondary', .6);
    return;
  }
  const [, stateLabel, stateCls] = spaceState(selected);
  const verb = selected.waypoint ? '[ENTER] CLEAR TARGET'
    : selected.waypointable === false ? '' : '[ENTER] SET TARGET';
  const cls = selected.waypoint ? 'ui-blue' : selected.current ? 'ui-green' : 'ui-amber';
  const floorLabel = mapFloor(model, selected.floorId)?.label || 'UNKNOWN';
  const takes = selected.objective
    ? ` · TAKE ${String(selected.objective.sequence).padStart(2, '0')}${selected.objective.recorded ? ' DONE' : ''}`
    : '';
  const left = `${selected.waypoint ? '◆' : '▸'} ${selected.label} · ${floorLabel} · ${stateLabel}${takes}`;
  uiText(rect.x, rect.y, clip(left, Math.max(1, rect.w - verb.length - 2)), cls, .96);
  if (verb) rightText(rect.x, rect.y, rect.w, verb, selected.waypoint ? 'ui-danger' : 'ui-blue', .88);
}

export function drawMapView({ model, nav, bagLayout, now = 0 }) {
  const layout = mapLayoutFromBag(bagLayout);
  const floor = mapFloor(model, nav.floorId);
  const clockMs = typeof performance !== 'undefined' ? performance.now() : now * 1000;
  const route = routeLabel(model);
  const hush = hushStatus(model, clockMs);

  let fx=layout.floorRail.x;
  (model.floors||[]).forEach((candidate)=>{
    const label=`[${candidate.shortLabel||candidate.label}]`,active=candidate.id===floor?.id;
    if(fx+label.length<=layout.floorRail.x+layout.floorRail.w){uiText(fx,layout.floorRail.y,label,active?'ui-amber':'ui-secondary',active?1:.58);fx+=label.length+1;}
  });
  rightText(layout.floorRail.x,layout.floorRail.y,layout.floorRail.w,`${model.progress.done}/${model.progress.total} TAKES`,model.progress.done===model.progress.total?'ui-green':'ui-blue',.7);

  drawSystemStatus(model,{x:layout.mapViewport.x,y:layout.mapViewport.y,w:layout.mapViewport.w,h:1},clockMs);
  const viewport={...layout.mapViewport,y:layout.mapViewport.y+2,h:Math.max(4,layout.mapViewport.h-4)};
  uiLine(viewport.x, viewport.y - .45, viewport.x + viewport.w, viewport.y - .45, undefined, .24);
  // THE BUILDING AS A STACK, NOT AS FIVE SEPARATE DRAWINGS.
  //
  // The floors used to be a row of [B1] [G] [U1] tabs and one plan at a time,
  // which makes a five-storey building read as five unrelated pictures and
  // gives no sense of what is above or below you. They are drawn stacked in
  // perspective now: each storey offset from the one under it, the one you are
  // reading sharp and the rest ghosted to their outline. Storeys BELOW the
  // selected one sit down-left, storeys above sit up-right, so the stack reads
  // the way a section drawing does.
  const floors = model.floors || [];
  const here = Math.max(0, floors.findIndex((candidate) => candidate.id === floor?.id));
  const offsetFor = (delta) => ({
    ...viewport,
    x: viewport.x + delta * STACK_DX,
    y: viewport.y - delta * STACK_DY,
    // Storeys further from the eye are drawn slightly smaller, which is what
    // makes the offset read as perspective rather than as a printing error.
    w: viewport.w - Math.abs(delta) * STACK_DX * 2,
    h: viewport.h - Math.abs(delta) * STACK_DY * 2,
  });
  // Furthest first, so nearer storeys paint over them.
  const stack = floors.map((candidate, index) => ({ candidate, delta: index - here }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const { candidate, delta } of stack) {
    if (delta === 0) continue;
    const ghostViewport = offsetFor(delta);
    if (ghostViewport.w < 8 || ghostViewport.h < 4) continue;
    const ghostCommands = buildMapCommands({
      model, nav: { ...nav, floorId: candidate.id },
      layout: { ...layout, mapViewport: ghostViewport }, now: clockMs,
    });
    drawMapCommands(ghostCommands, ghostViewport, now, { ghost: true, alpha: STACK_FADE ** Math.abs(delta) });
  }
  const commands = buildMapCommands({ model, nav, layout: { ...layout, mapViewport: viewport }, now: clockMs });
  drawMapCommands(commands, viewport, now);

  drawDetail(model, nav, layout.detail);
  drawLegend(layout.legendRail);
  // Nothing on the progress rail: the bag already draws the task line and the
  // controls under it, and the five takes are on the plan as RECORDABLE rooms.
  // A row of unexplained initials (SB / TN / TCH / TPW / TC), truncated, was
  // saying the same thing worse.
  return { layout, commands, selected: selectedMapSpace(nav, model), actions: mapActionRail(selectedMapSpace(nav, model), { floorCount: model.floors?.length || 1 }) };
}
