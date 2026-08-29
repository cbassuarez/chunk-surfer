// AUDIOCORP local navigation display.
//
// This is a projection of the same map model used by the field case. It never
// reads AI state directly. Main supplies sanitized perception language plus a
// momentary visual-confirmation flag; exact HUSH position exists here only
// while the player can already see the manifestation in the world.

import { uiCellMetrics, uiDraw, uiFill, uiGlyph, uiText, uiSize } from './ui.js';
import { drawMachinePanel } from './presentation.js';
import { themeRoleColor, UI_COLOR } from './palette.js';
import { buildMinimapCommands } from './map-commands.js';
import { drawAnomalyMarker, drawEquipmentMarker, drawHushAwareness, drawHushMarker, drawPlayerMarker, drawTargetLozenge, drawWaypointMarker } from './map-icons.js';
import { mapCurrentAreaLabel, mapFloor, newestMapContact } from '../game/map-model.js';
import { shakeMode, visualEffectsEnabled } from '../game/access.js';

let lastHushStatusKey = '';
let hushStatusPulseUntil = 0;
let lastTargetStatusKey = '';
let targetStatusPulseUntil = 0;

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
  if(model.waypoint.label)return String(model.waypoint.label).toUpperCase();
  return roomLabel(model, model.waypoint.roomId, 'TARGET');
}

function currentLabel(model) {
  return mapCurrentAreaLabel(model);
}

const TARGET_BEARINGS=['N','NE','E','SE','S','SW','W','NW'];

export function minimapTargetReadout(model){
  const waypoint=model?.waypoint;
  if(!waypoint)return null;
  const label=targetLabel(model);
  const sameFloor=waypoint.floorId===model?.player?.floorId;
  if(!sameFloor||!waypoint.position||!model?.player?.position){
    return{label,bearing:'',distanceM:null,floorDelta:Number(model?.route?.floorDelta)||0,sameFloor:false};
  }
  const dx=waypoint.position.x-model.player.position.x;
  const dy=waypoint.position.y-model.player.position.y;
  const angle=(Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2);
  return{
    label,
    bearing:TARGET_BEARINGS[Math.round(angle/(Math.PI/4))%8],
    distanceM:waypoint.suppressExactDistance?null:Math.hypot(dx,dy),
    ...(waypoint.suppressExactDistance?{distanceSuppressed:true}:{}),
    floorDelta:0,
    sameFloor:true,
  };
}

export function hushStatus(model, now = 0) {
  if(model?.hush?.active){
    const perception=model.hush.perception;
    if(perception?.mode&&perception.mode!=='none'){
      return{
        label:String(perception.label||'ACTIVE'),
        cls:String(perception.cls||'ui-danger'),
        detail:String(perception.detail||'YOU'),
        floorDelta:0,
      };
    }
    const here=model.hush.floorId===model?.player?.floorId;
    const floor=mapFloor(model,model.hush.floorId);
    return{label:'ACTIVE',cls:'ui-secondary',detail:here?'NO FIX':floor?.label||'OTHER FLOOR',floorDelta:0};
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

export function minimapTelemetryCrumbs(model, commands, now = 0) {
  const transformCommand = (commands || []).find((command) => command.kind === 'sight')
    || (commands || []).find((command) => command.kind === 'local-topology');
  if (!transformCommand?.transform || !Array.isArray(model?.contacts)) return [];
  const newest = newestMapContact(model);
  return model.contacts
    .filter((contact) => contact !== newest && contact?.observation?.position)
    .filter((contact) => contact.observation.floorId === model?.player?.floorId)
    .sort((a, b) => Number(a.observation.observedAt || 0) - Number(b.observation.observedAt || 0))
    .slice(-7)
    .map((contact) => {
      const observedAt = Number(contact.observation.observedAt);
      const age = Math.max(0, (Number(now) - (Number.isFinite(observedAt) ? observedAt : Number(now))) / 1000);
      return {
        point: transformCommand.transform.point(contact.observation.position),
        alpha: Math.max(0, 0.18 * (1 - age / 12)),
        age,
      };
    })
    .filter((crumb) => crumb.alpha > 0.004);
}

function drawTelemetryCrumbs(model, commands, viewport, now) {
  const crumbs = minimapTelemetryCrumbs(model, commands, now);
  if (!crumbs.length) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x * cellW * dpr, viewport.y * cellH * dpr, viewport.w * cellW * dpr, viewport.h * cellH * dpr);
    ctx.clip();
    ctx.strokeStyle = themeRoleColor('silkscreen');
    ctx.lineWidth = Math.max(0.7, dpr * 0.6);
    for (const crumb of crumbs) {
      const cx = (crumb.point.x + 0.5) * cellW * dpr;
      const cy = (crumb.point.y + 0.5) * cellH * dpr;
      const rx = Math.max(1.5 * dpr, cellW * dpr * 0.26);
      const ry = Math.max(1.5 * dpr, cellH * dpr * 0.18);
      ctx.globalAlpha = crumb.alpha;
      ctx.strokeRect(cx - rx, cy - ry, rx * 2, ry * 2);
    }
    ctx.restore();
  });
}

function hushStatusPulse(hush, now) {
  const key = `${hush.label}:${hush.cls}`;
  if (!lastHushStatusKey) lastHushStatusKey = key;
  else if (key !== lastHushStatusKey) {
    lastHushStatusKey = key;
    if (visualEffectsEnabled()) hushStatusPulseUntil = Number(now) + 180;
  }
  if (!visualEffectsEnabled() || Number(now) >= hushStatusPulseUntil) return 0;
  const life = Math.max(0, (hushStatusPulseUntil - Number(now)) / 180);
  return life * (shakeMode() === 'full' ? 0.06 : 0.028);
}

function targetStatusPulse(waypoint, now) {
  const key = waypoint ? `${waypoint.id || waypoint.label || 'target'}:${waypoint.floorId || ''}` : 'none';
  if (!lastTargetStatusKey) lastTargetStatusKey = key;
  else if (key !== lastTargetStatusKey) {
    lastTargetStatusKey = key;
    if (visualEffectsEnabled()) targetStatusPulseUntil = Number(now) + 240;
  }
  if (!visualEffectsEnabled() || Number(now) >= targetStatusPulseUntil) return 0;
  return Math.max(0, (targetStatusPulseUntil - Number(now)) / 240) * 0.045;
}

function drawConfidenceTicks(panel, model) {
  const contact = newestMapContact(model);
  const state = String(contact?.state || '').toLowerCase();
  if (!['acquiring', 'decaying'].includes(state)) return;
  const confidence = Math.max(0, Math.min(1, Number(contact?.observation?.confidence) || 0));
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const baseX = (panel.x + panel.w - 4.2) * cellW * dpr;
    const baseY = (panel.y + .48) * cellH * dpr;
    ctx.save();
    ctx.strokeStyle = themeRoleColor(state === 'acquiring' ? 'counter' : 'silkscreen');
    ctx.lineWidth = Math.max(0.6, dpr * 0.5);
    for (let index = 0; index < 4; index += 1) {
      ctx.globalAlpha = index / 4 < confidence ? 0.32 : 0.11;
      const xx = baseX + index * cellW * dpr * 0.62;
      ctx.beginPath();
      ctx.moveTo(xx, baseY - 2 * dpr);
      ctx.lineTo(xx + 2 * dpr, baseY + 2 * dpr);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawFloorDeltaLed(panel, delta) {
  if (!delta) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const size = Math.max(1.2 * dpr, 1.5);
    const px = (panel.x + panel.w - 1) * cellW * dpr;
    const py = (panel.y + panel.h - 0.55) * cellH * dpr;
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = themeRoleColor('counter');
    ctx.fillRect(px, py, size, size);
    ctx.globalAlpha = 0.16;
    ctx.fillRect(px + size * 1.7, py + (delta > 0 ? -size : size), size, size);
    ctx.restore();
  });
}

function drawLocalTopology(command) {
  const { open, runs, transform, viewport, center, radius, fillOpen = true } = command;
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
    if (fillOpen) {
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
    }

    // Trace only the exposed edges of known walkable cells. The fill remains
    // quiet; this hairline is what turns an amber smear into readable rooms,
    // corridors and thresholds without inventing architectural information.
    const isOpen=openCellLookup({open,runs});
    ctx.beginPath();
    ctx.globalAlpha=.38;
    ctx.strokeStyle=themeRoleColor('silkscreen');
    ctx.lineWidth=Math.max(.55*dpr,.75);
    const x0=Math.floor(minX),x1=Math.ceil(maxX),y0=Math.floor(minY),y1=Math.ceil(maxY);
    const line=(a,b)=>{
      ctx.moveTo(a.x*cellW*dpr,a.y*cellH*dpr);
      ctx.lineTo(b.x*cellW*dpr,b.y*cellH*dpr);
    };
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(!isOpen(x,y))continue;
      if(!isOpen(x,y-1))line(project({x,y}),project({x:x+1,y}));
      if(!isOpen(x+1,y))line(project({x:x+1,y}),project({x:x+1,y:y+1}));
      if(!isOpen(x,y+1))line(project({x:x+1,y:y+1}),project({x,y:y+1}));
      if(!isOpen(x-1,y))line(project({x,y:y+1}),project({x,y}));
    }
    ctx.stroke();
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

function pointInOrientedRect(x, y, rect) {
  const dx = x - (Number(rect?.x) || 0), dy = y - (Number(rect?.y) || 0);
  const yaw = -(Number(rect?.yaw) || 0), c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= Math.max(.02, Number(rect?.w) || 0) * .5
    && Math.abs(ly) <= Math.max(.02, Number(rect?.d) || 0) * .5;
}

// Continuous map-space visibility. The ordinary map may simplify the building
// to one-metre cells, but the viewshed samples the compiled half-metre floorplan,
// live closed leaves and eye-height prop footprints. This is the same physical
// frame the renderer and player marker use; no special exterior cone exists.
export function visibilityLookup(command = {}) {
  const scale = Math.max(1, Number(command.visibilityScale) || 1);
  const detailed = command.visibilityOpen instanceof Set
    ? (x, y) => command.visibilityOpen.has(`${Math.floor(x * scale)},${Math.floor(y * scale)}`)
    : null;
  const coarse = openCellLookup(command);
  const openAt = detailed || ((x, y) => coarse(Math.floor(x), Math.floor(y)));
  const closedDoors = (Array.isArray(command.doors) ? command.doors : [])
    .filter((door) => door && door.state !== 'open' && door.open !== true);
  const occluders = Array.isArray(command.occluders) ? command.occluders : [];
  return (x, y) => {
    if (!openAt(x, y)) return false;
    for (const door of closedDoors) {
      const dx = x - Number(door.position?.x), dy = y - Number(door.position?.y);
      const along = door.widthAxis === 'y' ? Math.abs(dy) : Math.abs(dx);
      const through = door.widthAxis === 'y' ? Math.abs(dx) : Math.abs(dy);
      if (along <= Math.max(.1, Number(door.apertureWidth) || 1) * .5 && through <= .12) return false;
    }
    for (const rect of occluders) if (pointInOrientedRect(x, y, rect)) return false;
    return true;
  };
}

export const SIGHT = Object.freeze({
  // Match the first-person projection (vertical focal length 1/.95 at 16:9),
  // rather than drawing an abstract awareness wedge.
  halfAngle: Math.atan(.95 * 16 / 9),
  rays: 97,
  step: 0.12,
});

// March each ray until it leaves open floor. Returns map-space endpoints, so the
// caller can transform them and the wedge inherits any flip the map applies.
export function sightPolygon({ origin, heading, isOpen, radius }) {
  const reach = Math.max(2, Number(radius) || 10);
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
  const sampled = visibilityLookup(command);
  // YOU ARE STANDING HERE, SO HERE IS OPEN.
  //
  // The viewshed used to abandon the whole cone whenever its own predicate
  // rejected the origin — a doorway mid-swing, a prop footprint whose map
  // rectangle is wider than its collision box, an unmapped half-metre cell.
  // That is not rare out in the yard, and the symptom is the map losing its
  // sight wedge for no reason the player can see or act on. The one cell we
  // KNOW is walkable is the one the body occupies: seed it open and let the
  // rays leave. Everything past the first step is still the real geometry.
  const here = { x: Math.floor(origin.x), y: Math.floor(origin.y) };
  const isOpen = (x, y) => (Math.floor(x) === here.x && Math.floor(y) === here.y) || sampled(x, y);
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

function drawLocalRoute(command){
  if(!command?.points?.length)return;
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    ctx.save();
    if(command.viewport){
      ctx.beginPath();
      ctx.rect(command.viewport.x*cellW*dpr,command.viewport.y*cellH*dpr,command.viewport.w*cellW*dpr,command.viewport.h*cellH*dpr);
      ctx.clip();
    }
    ctx.globalAlpha=command.status==='ok' ? .5 : .28;
    ctx.strokeStyle=themeRoleColor(command.status==='ok'?'counter':'danger');
    ctx.lineWidth=Math.max(.8*dpr,1);
    ctx.setLineDash([3*dpr,3*dpr]);
    ctx.beginPath();
    command.points.forEach((point,index)=>{
      const x=point.x*cellW*dpr,y=point.y*cellH*dpr;
      if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y);
    });
    ctx.stroke();ctx.restore();
  });
}

const COMMAND_LAYER=Object.freeze({
  'local-topology':0,sight:10,'route-local':20,'door-local':30,'connector-local':32,
  waypoint:40,'waypoint-edge':40,'connector-target':40,'connector-edge':40,
  equipment:50,'equipment-edge':50,'anomaly-contact':60,'anomaly-edge':60,
  'hush-awareness':70,player:80,'hush-visible':90,'hush-visible-edge':90,
});

function drawCommands(commands, now) {
  const ordered=[...commands].sort((a,b)=>(COMMAND_LAYER[a.kind]??45)-(COMMAND_LAYER[b.kind]??45));
  const hasSight=commands.some((command)=>command.kind==='sight');
  for (const command of ordered) {
    if (command.kind === 'local-topology') drawLocalTopology(command);
    else if (command.kind === 'sight') drawSight(command);
    else if(command.kind==='route-local')drawLocalRoute(command);
    else if(command.kind==='door-local')uiGlyph(Math.round(command.point.x),Math.round(command.point.y),command.state==='locked'?'╫':command.state==='closed'?'┼':'·',command.state==='locked'?'ui-danger':'ui-label',command.state==='open' ? .34 : .62);
    else if(command.kind==='connector-local')uiGlyph(Math.round(command.point.x),Math.round(command.point.y),'↕',command.selected?'ui-blue':'ui-label',command.selected ? .9 : .48);
    else if(command.kind==='hush-awareness')drawHushAwareness(command,.7+Math.abs(Math.sin(now*.006))*.2);
    else if (command.kind === 'player') drawPlayerMarker(command.point, command.heading, 1, { tick: !hasSight });
    else if (command.kind === 'waypoint' || command.kind === 'connector-target') {
      if(command.corrupted&&command.glitchPhase===2)continue;
      drawWaypointMarker(command.point,command.corrupted ? .78 : .95,{playerSelected:command.playerSelected});
      if(command.corrupted){
        const x=Math.round(command.point.x),y=Math.round(command.point.y);
        uiGlyph(x-1,y,'[','ui-danger',.72);
        uiGlyph(x+1+(command.glitchPhase===3?1:0),y,']','ui-danger',.72);
      }
    }
    else if(command.kind==='equipment'||command.kind==='equipment-edge')drawEquipmentMarker(command.point,command.carrierOpen ? .72+Math.sin(now*.007)*.2 : .72);
    else if (command.kind === 'waypoint-edge' || command.kind === 'connector-edge') {
      if(command.corrupted&&command.glitchPhase===2)continue;
      drawWaypointMarker(command.point,command.corrupted ? .76 : .92,{edgeDirection:command.edgeDirection,playerSelected:command.playerSelected});
      if (command.floorDelta) uiGlyph(Math.round(command.point.x), Math.round(command.point.y) + 1, command.floorDelta > 0 ? '↑' : '↓', 'ui-blue', .78);
    }
    else if (command.kind === 'anomaly-contact' || command.kind === 'anomaly-edge') {
      drawAnomalyMarker(command, .80 + Math.sin(now * 12) * .14);
    }
    else if (command.kind === 'hush-visible' || command.kind === 'hush-visible-edge') {
      drawHushMarker(command.point,.82+Math.sin(now*.009)*.12,{edgeDirection:command.edgeDirection});
    }
  }
}

// A noise you just heard, blinking where it came from, and then gone. It is not a
// contact and it must never read as one: this is a hollow ring that fades out.
// The map may tell you what you heard a second ago; it never reveals HUSH's body
// or implies the thing is still standing at the sound source.
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

// The emergency circuit's apparitions, for exactly as long as the red is on.
// Deliberately NOT a marker: no ring, no icon, no glyph, nothing that shares a
// vocabulary with a HUSH contact or a waypoint. Two crossed ticks — the shape a
// display makes when it has a return it cannot classify — drawn faint and gone
// before the player can count them. It confirms; it never tracks.
function drawApparitionReturns(commands, apparitions, viewport) {
  if (!apparitions?.points?.length) return;
  const sight = commands.find((command) => command.kind === 'sight')
    || commands.find((command) => command.kind === 'local-topology');
  if (!sight?.transform) return;
  const life = Math.max(1, Number(apparitions.life) || 1);
  const t = Math.max(0, Math.min(1, Number(apparitions.age) / life));
  const points = apparitions.points
    .map((point) => sight.transform.point(point))
    .filter((point) => point.x >= viewport.x - .5 && point.x <= viewport.x + viewport.w + .5)
    .filter((point) => point.y >= viewport.y - .5 && point.y <= viewport.y + viewport.h + .5);
  if (!points.length) return;
  uiDraw(({ ctx, cellW, cellH }) => {
    ctx.save();
    ctx.strokeStyle = UI_COLOR.danger;
    ctx.lineWidth = Math.max(1, cellW * .12);
    ctx.globalAlpha = (1 - t) * .42;
    for (const point of points) {
      const cx = (point.x + .5) * cellW;
      const cy = (point.y + .5) * cellH;
      const r = Math.max(cellW, cellH) * .3;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    }
    ctx.restore();
  });
}

export function drawMinimap(model, opts = {}) {
  if (!model || typeof model !== 'object' || !model.player) return;
  const { cols,rows } = uiSize();
  const width = Math.min(Math.max(26,Math.floor(opts.bounds?.w||32)),Math.max(26,cols-4));
  const height = Math.min(Math.max(13,Math.floor(opts.bounds?.h||17)),Math.max(13,rows-5));
  const x0 = Math.floor(opts.bounds?.x ?? (cols - width - 2));
  const y0 = Math.floor(opts.bounds?.y ?? 2);
  const now = opts.now || 0;
  const target = targetLabel(model);
  const here = currentLabel(model);
  const hush = hushStatus(model, now);
  const floor=model.floors.find((candidate)=>candidate.id===model.player.floorId);
  const targetReadout=minimapTargetReadout(model);
  const panel = drawMachinePanel(x0, y0, width, height, {
    label: 'FIELD NAV',model:'FN-12',
    source:opts.source||'',
    meter: false,
    theme: hush.cls === 'ui-danger' ? 'amber' : 'green',
  });
  const panelPulse = hushStatusPulse(hush, now);
  const targetPulse = targetStatusPulse(model.waypoint, now);
  if (targetPulse > 0) uiFill(panel.x, panel.y, panel.w, panel.h, `rgba(80,174,255,${targetPulse})`);
  if (panelPulse > 0) uiFill(panel.x, panel.y, panel.w, panel.h, `rgba(255,118,65,${panelPulse})`);
  const viewport = {
    x:panel.x,
    y:panel.y+1,
    w:Math.max(8,panel.w),
    h:Math.max(5,panel.h-3),
  };

  const floorTag=String(floor?.shortLabel||floor?.label||'--').toUpperCase();
  if(targetReadout){
    const range=targetReadout.sameFloor
      ?targetReadout.distanceSuppressed
        ?`${targetReadout.bearing} / RANGE LOST`
        :`${targetReadout.bearing} ${Math.max(0,Math.round(targetReadout.distanceM||0))}M`
      :targetReadout.floorDelta
        ?`${targetReadout.floorDelta>0?'+':''}${targetReadout.floorDelta}F`
        :'OTHER FL';
    const room=clip(target,Math.max(4,panel.w-range.length-4));
    // The lozenge is drawn, not typed — see drawTargetLozenge. As a codepoint it
    // was silently absent, so the readout began with a blank cell and the target
    // line carried no mark at all.
    drawTargetLozenge(panel.x,panel.y,.9);
    uiText(panel.x+2,panel.y,room,'ui-blue',.9);
    uiText(panel.x+Math.max(0,panel.w-range.length),panel.y,range,'ui-blue',.74);
  }else{
    uiText(panel.x+Math.max(0,panel.w-floorTag.length),panel.y,floorTag,'ui-label',.5);
  }
  if(!targetReadout)drawConfidenceTicks(panel, model);

  const commands = buildMinimapCommands({ model, viewport, radius: opts.radius || 18, now, aspect: uiCellMetrics().aspect });
  drawTelemetryCrumbs(model, commands, viewport, now);
  drawMischiefBlink(commands, opts.mischief, viewport);
  drawApparitionReturns(commands, opts.apparitions, viewport);
  drawCommands(commands, now);

  const floorTarget = commands.find((command) => command.kind === 'floor-target');
  const anomalyFloor = commands.find((command) => command.kind === 'anomaly-floor');
  const hushHasSignal=!!model.hush?.active||!!newestMapContact(model)?.observation;
  let footer=`YOU · ${here}`;
  let footerCls='ui-green';
  if (anomalyFloor?.delta) footer = `HUSH ${anomalyFloor.delta > 0 ? '+' : ''}${anomalyFloor.delta} FLOOR`;
  else if (floorTarget?.delta) footer = `TARGET ${floorTarget.delta > 0 ? '+' : ''}${floorTarget.delta} FLOOR`;
  else if(hushHasSignal){footer=`HUSH · ${hush.label}${hush.detail?` · ${hush.detail}`:''}`;footerCls=hush.cls;}
  if(floorTarget?.delta||anomalyFloor?.delta)footerCls='ui-blue';
  uiText(panel.x,panel.y+panel.h-1,clip(footer,panel.w),footerCls,.72);
  drawFloorDeltaLed(panel, anomalyFloor?.delta || floorTarget?.delta || 0);
  if (opts.expanded) uiText(panel.x, panel.y + panel.h, '[GREEN] YOU · [BLUE] TARGET · [RED ?] HUSH (SEEN)', 'ui-secondary', .66);
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
