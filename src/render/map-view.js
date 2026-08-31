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
  const you=clip(currentRoomLabel(model),Math.max(8,Math.floor(rect.w*.28)));
  const target=clip(targetRoomLabel(model),Math.max(8,Math.floor(rect.w*.25)));
  uiText(rect.x,rect.y,clip(`YOU ${you} · MARK ${target}`,Math.max(1,rect.w-22)),'ui-primary',.78);
  rightText(rect.x,rect.y,rect.w,`HUSH ${hush.label} · ${route.text}`,hush.cls==='ui-danger'?hush.cls:route.cls,.72);
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

function spaceState(space){
  if(space.current)return['●','CURRENT','ui-green'];
  if(space.waypoint)return['◆','WAYPOINT','ui-blue'];
  if(space.objective?.recorded)return['■','RECORDED','ui-green'];
  if(space.unknown)return['?','UNKNOWN','ui-secondary'];
  if(space.visited)return['◇','VISITED','ui-primary'];
  return['·','NOT VISITED','ui-secondary'];
}

function entranceState(entrance){
  const state=String(entrance?.state||'unknown').toLowerCase();
  if(state==='blocked'||state==='sealed')return['SEALED / BLOCKED','ui-danger'];
  if(state==='locked')return['LOCKED','ui-danger'];
  if(state==='closed')return['CLOSED','ui-amber'];
  if(state==='open')return['OPEN','ui-green'];
  return['UNKNOWN','ui-secondary'];
}

function drawDetail(model, nav, rect) {
  const selected = selectedMapSpace(nav, model);
  const spaces=(model.spaces||[]).filter((space)=>space.floorId===nav.floorId&&space.selectable!==false);
  const listRows=Math.max(1,Math.min(spaces.length,Math.floor(rect.h*.44)));
  const selectedAt=Math.max(0,spaces.findIndex((space)=>space.id===selected?.id));
  const start=Math.max(0,Math.min(selectedAt-Math.floor(listRows/2),spaces.length-listRows));
  uiText(rect.x,rect.y,`ROOMS · ${mapFloor(model,nav.floorId)?.label||'UNKNOWN'}`,'ui-label',.68);
  spaces.slice(start,start+listRows).forEach((space,index)=>{
    const on=space.id===selected?.id,[mark,,cls]=spaceState(space),row=rect.y+1+index;
    uiText(rect.x,row,on?'▸':' ',on?'ui-amber':'ui-secondary',on?1:.4);
    uiText(rect.x+2,row,mark,cls,on?1:.64);
    uiText(rect.x+4,row,clip(space.label,Math.max(1,rect.w-4)),on?'ui-amber':cls,on?1:.68);
  });
  const sy=rect.y+listRows+2;
  if(sy>=rect.y+rect.h||!selected)return;
  uiLine(rect.x,sy-1,rect.x+rect.w,sy-1,undefined,.26);
  const [,stateLabel,stateCls]=spaceState(selected);
  uiText(rect.x,sy,clip(selected.label,rect.w),selected.waypoint?'ui-blue':selected.current?'ui-green':'ui-amber',.94);
  uiText(rect.x,sy+1,clip(`${stateLabel} · ${mapFloor(model,selected.floorId)?.label||'UNKNOWN'}`,rect.w),stateCls,.75);
  let row=sy+3;
  if(selected.objective&&row<rect.y+rect.h){
    uiText(rect.x,row,clip(`WORK ORDER ${String(selected.objective.sequence).padStart(2,'0')} · ${selected.objective.fileCount||0} SHEET${selected.objective.fileCount===1?'':'S'}`,rect.w),'ui-blue',.7);row+=2;
  }
  const entrances=selected.entrances||[];
  if(row<rect.y+rect.h)uiText(rect.x,row++,entrances.length?'ENTRANCES':'ENTRANCES · NONE LISTED','ui-label',.62);
  entrances.forEach((entrance,index)=>{
    if(row>=rect.y+rect.h)return;
    const [label,cls]=entranceState(entrance);
    uiText(rect.x,row,clip(`${index+1} ${entrance.id} · ${label}`,rect.w),cls,.76);row++;
  });
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
  const commands = buildMapCommands({ model, nav, layout: { ...layout, mapViewport: viewport }, now: clockMs });
  drawMapCommands(commands, viewport, now);

  drawLegend({ x: layout.mapViewport.x, y: layout.mapViewport.y + layout.mapViewport.h - 1, w: layout.mapViewport.w, h: 2 });

  if (layout.dividerX != null) uiLine(layout.dividerX, layout.mapViewport.y - 1, layout.dividerX, layout.mapViewport.y + layout.mapViewport.h, undefined, .34);
  drawDetail(model,nav,layout.detail);
  uiText(layout.progressRail.x, layout.progressRail.y, progressText(model, layout.progressRail.w), 'ui-blue', .68);
  rightText(layout.progressRail.x, layout.progressRail.y, layout.progressRail.w, route.text, route.cls, .68);
  return { layout, commands, selected: selectedMapSpace(nav, model), actions: mapActionRail(selectedMapSpace(nav, model), { floorCount: model.floors?.length || 1 }) };
}
