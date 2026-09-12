// Survey-console geometry in UI cells. Drawing uses actual pixel aspect ratio.
import { roomHistory } from '../data/room-history.js';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mapLayoutFromBag(layout) {
  const x = Math.min(layout.list.x, layout.detail.x), y = Math.min(layout.list.y, layout.detail.y);
  const w = Math.max(layout.list.x + layout.list.w, layout.detail.x + layout.detail.w) - x;
  const h = Math.max(layout.list.y + layout.list.h, layout.detail.y + layout.detail.h) - y;
  const compact = w < 85 || h < 14, region = { x, y, w, h };
  const dense = compact && h < 15;
  let mapWindow, consoleRect, groups, detail;
  if (!compact) {
    const cw = clamp(w * .225, 23, 28), gap = 2.4;
    mapWindow = { x, y, w: w - cw - gap, h };
    consoleRect = { x: x + w - cw, y, w: cw, h };
    const keyH = Math.min(2.25, (h - 9.2) / 8), groupH = .6 + keyH * 2 + .22 + .25;
    groups = [0, 1, 2].map(i => ({ x: consoleRect.x, y: y + i * groupH, w: cw, h: groupH, keyH }));
    const statusY = y + groupH * 3;
    groups.push({ x: consoleRect.x, y: statusY, w: cw, h: 2.1, keyH: 1.4 });
    detail = { x: consoleRect.x, y: statusY + 2.4, w: cw, h: Math.max(2.6, h - groupH * 3 - 2.4 - keyH * 2 - .75) };
    groups.push({ x: consoleRect.x, y: y + h - keyH * 2 - .28, w: cw, h: keyH * 2 + .28, keyH });
  } else if(dense) {
    const keyH=Math.min(1.25,Math.max(.65,h*.115)),controlH=keyH*2+.25+1.7;
    mapWindow={x,y,w,h:Math.max(2,h-controlH-.6)};
    consoleRect={x,y:mapWindow.y+mapWindow.h+.6,w,h:controlH};
    groups=Array.from({length:5},()=>({...consoleRect,keyH}));
    detail={x,y:consoleRect.y+keyH*2+.4,w,h:1.3};
  } else {
    const controlH = Math.min(10, h * .49);
    mapWindow = { x, y, w, h: Math.max(3, h - controlH - 1) };
    consoleRect = { x, y: mapWindow.y + mapWindow.h + 1, w, h: controlH };
    const gap = 1.2, cw = (w - gap * 3) / 4;
    const keyH = Math.max(.85, Math.min(1.65, (controlH - 3.5) / 3));
    groups = [0, 1, 2].map(i => ({ x: x + i * (cw + gap), y: consoleRect.y, w: cw, h: .85 + keyH * 3 + .56, keyH }));
    groups.push({ x: x + 3 * (cw + gap), y: consoleRect.y, w: cw, h: 1.65, keyH: 1.4 });
    groups.push({ x: x + 3 * (cw + gap), y: consoleRect.y + 1.95, w: cw, h: keyH * 2 + .28, keyH });
    detail = { x, y: consoleRect.y + controlH - 1.8, w, h: 1.8 };
  }
  const mapViewport = { x: mapWindow.x + .9, y: mapWindow.y + (dense?.65:1.5), w: Math.max(1, mapWindow.w - 1.8), h: Math.max(.5, mapWindow.h - (dense?1.05:3.1)) };
  return { mode: compact ? 'compact' : 'wide', dense, region, mapWindow, mapViewport, console: consoleRect,
    groups, detail, floorRail: groups[0],
    legendRail: { x: mapWindow.x + .9, y: mapWindow.y + mapWindow.h - 1.2, w: mapWindow.w - 1.8, h: 1 },
    progressRail: { x: mapWindow.x + .9, y: mapWindow.y + .25, w: mapWindow.w - 1.8, h: 1 },
    dividerX: compact ? null : consoleRect.x - 1.2 };
}

export function mapConsoleControls(layout, model, nav) {
  const controls = [], compact = layout.mode === 'compact';
  const row = (group, index, legends, actions, colors = [], payloads = [], enabled = []) => {
    const g = layout.groups[group], gap = .35, width = (g.w - (legends.length - 1) * gap) / legends.length;
    legends.forEach((label, i) => controls.push({
      id: actions[i] === 'select-floor' ? `bag:floor:${payloads[i].floorId}` : `bag:map:${actions[i]}`,
      kind: 'map-control', action: actions[i], payload: payloads[i] || {}, label,
      x: g.x + i * (width + gap), y: g.y + (group === 4 ? 0 : compact?.85:.6) + index * (g.keyH + (compact?.28:.22)), w: width, h: g.keyH,
      color: colors[i] || 'white', enabled: enabled[i] !== false,
    }));
  };
  const floors = model?.floors || [], perRow = compact ? 2 : 3;
  for (let at = 0; at < floors.length; at += perRow) {
    const fs = floors.slice(at, at + perRow);
    row(0, at / perRow, fs.map(f => f.shortLabel || f.label), fs.map(() => 'select-floor'), fs.map(() => 'white'), fs.map(f => ({ floorId: f.id })));
  }
  row(1, 0, ['STACK', 'FLOOR'], ['view-stack', 'view-floor'], ['blue', 'blue']);
  row(1, 1, ['TURN L', 'TURN R'], ['rotate-left', 'rotate-right'], ['blue', 'blue']);
  row(2, 0, ['LOCATE', 'FIT'], ['center-player', 'reset-view'], ['green', 'white']);
  row(2, 1, ['ZOOM −', 'ZOOM +'], ['zoom-out', 'zoom-in']);
  const selected = (model?.spaces || []).find(s => s.id === nav?.selectedByFloor?.[nav?.floorId]);
  const personal = model?.playerWaypoint;
  const marked = !!personal?.spaceId && personal.spaceId === selected?.id;
  row(4, 0, ['SET TARGET'], ['set-target'], ['amber'], [], [!!selected && selected.waypointable !== false && !marked]);
  row(4, 1, ['CLEAR', 'FILE'], ['clear-target', 'read-file'], ['white', 'white'], [], [!!personal, !!roomHistory(selected)||!!selected?.objective?.notes?.length]);
  if(layout.dense){
    const order=['select-floor','view-stack','view-floor','center-player','reset-view','rotate-left','rotate-right','zoom-out','zoom-in','set-target','clear-target','read-file'];
    controls.sort((a,b)=>order.indexOf(a.action)-order.indexOf(b.action));
    const cw=(layout.console.w-7*.35)/8,keyH=layout.groups[0].keyH;
    controls.forEach((c,i)=>Object.assign(c,{x:layout.console.x+(i%8)*(cw+.35),y:layout.console.y+Math.floor(i/8)*(keyH+.25),w:cw,h:keyH}));
  }
  return controls.map(c => ({ ...c, lit: c.action === 'select-floor' ? c.payload.floorId === nav?.floorId
    : c.action === 'view-stack' ? nav?.viewMode !== 'floor' : c.action === 'view-floor' ? nav?.viewMode === 'floor' : false }));
}

export function minimapLayout({ x, y, w = 22, h = 11 } = {}) {
  return { panel: { x, y, w, h }, viewport: { x: x + 2, y: y + 3, w: Math.max(8, w - 4), h: Math.max(4, h - 5) } };
}
