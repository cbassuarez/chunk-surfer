// The floorplan: one authored building, compiled once, read by two consumers.
//
// PARITY BY CONSTRUCTION. The old procedural lattice had to be written twice —
// once in GLSL, once in JS — with a bit-exact integer hash to keep the drawn
// wall and the solid wall in the same place. That is a permanent hazard. Here
// there is one array. The shader samples a texture built from it; collision
// reads it directly. They cannot disagree.
//
// Authored glyphs are one metre. Runtime cells are half-metres: compile expands
// each glyph into a 2x2 block, preserving the building's physical size while
// giving collision/rendering twice the resolution. Heights remain metres.
// Encoding into RGBA8:
//   R = floor height   (H_MIN..H_MAX mapped to 0..255)
//   G = ceiling height (same scale)
//   B = flags
//   A = zone id
// Material is a parallel R8 texture, not packed into the flag byte.
//
// A cell that is `solid` is rock: no floor, no ceiling, you cannot be in it.
// A cell that is VOID (outside the building) is also solid, but reads as sky.

import {
  F, ZONE, ZONE_WORLD, MATERIAL, cellFor, materialForZone,
  EYE, STEP_UP, HEADROOM, PLAN_SCALE, AMBIENT_PLACE_SCALE, isOutdoorZone
} from '../data/floorplan/legend.js';
import {
  DOOR_STATE,
  advanceDoor,
  beginDoorClose,
  beginDoorOpen,
  doorBlocksPassage,
  freshDoorRuntime,
  normalizeDoorEndpoint,
  normalizeDoorSave,
  pointInDoorSweep,
  requestCloser,
  stableDoorEndpoint,
} from '../game/door-runtime.js';
import { doorDefinitionWithArchetype } from '../data/conservatory-doors.js';

export const H_MIN = -8;
export const H_MAX = 24;
const H_RANGE = H_MAX - H_MIN;
// Negative world coordinates are valid now that the civic block surrounds the
// existing zero-origin building. Keep an unmistakable sentinel instead of
// overloading every point west or north of Ellery as "unmapped".
const PHYSICAL_VOID = -2147483648;

export const encodeH = (h) => Math.max(0, Math.min(255, Math.round(((h - H_MIN) / H_RANGE) * 255)));
export const decodeH = (b) => (b / 255) * H_RANGE + H_MIN;

const plan = {
  w: 0, h: 0,
  authoredW: 0, authoredH: 0,
  scale: PLAN_SCALE,
  floor: null,   // Float32Array
  ceil: null,    // Float32Array
  flags: null,   // Uint8Array
  zone: null,    // Uint8Array
  material: null,// Uint8Array
  solid: null,   // Uint8Array (1 = rock or void)
  rgba: null,    // Uint8Array, w*h*4 — exactly what the shader sees
  physicalX: null, physicalY: null, // runtime-cell embedding, logical -> Euclidean X/Z
  physicalReplace: null, // an authored structure owns its Euclidean air cell
  physicalStack: null, // a higher authored floor caps, rather than erases, the room below
  collisionOnly: null, // blocks navigation but contributes no generic wall/floor span
  layer: null, space: null, renderGroup: null,
  owner: null, ownershipConflicts: [],
  stairPortals: [],
  stairRuns: [],
  edgePortals: [],
  doorVolumes: [],
  physical: null,
  spawn: { x: 0, y: 0 },
  homeAnchor: null,
  loaded: false,
};
let doorPortals=[];
const doorCellToPortal=new Map();
const doorTickEvents=[];

export function floorplan() { return plan; }
export function isLoaded() { return plan.loaded; }
export function planSize() { return { w: plan.w, h: plan.h }; }

const idx = (x, y) => y * plan.w + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < plan.w && y < plan.h;
const isRoomZone = (z) => z !== ZONE.none && z !== ZONE.stair;

export function toRuntimeCoord(v, { center = true } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const base = Math.round(n * PLAN_SCALE);
  return center ? base + Math.floor(PLAN_SCALE / 2) : base;
}
export function toRuntimePoint(p, opts) {
  return { x: toRuntimeCoord(p.x, opts), y: toRuntimeCoord(p.y, opts) };
}
export function toRuntimeDistance(v) { return Number(v) * PLAN_SCALE; }
export function toAuthoredCoord(v) { return Number(v) / PLAN_SCALE; }

// ── compile ──────────────────────────────────────────────────────────────────
// `levels` is [{ rows, origin, physicalOrigin?, base, layer?, renderGroup?, stairs? }]
export function compile(levels, { width, height, widenCorridors = false, connectors = [], edgePortals = [], doors = [] } = {}) {
  plan.loaded = false;
  plan.physical = null;
  const authoredW = width || Math.max(...levels.map((l) => l.origin.x + Math.max(...l.rows.map((r) => r.length))));
  const authoredH = height || Math.max(...levels.map((l) => l.origin.y + l.rows.length));
  const w = authoredW * PLAN_SCALE;
  const h = authoredH * PLAN_SCALE;

  doorKeys.clear();
  doorPortals=[];doorCellToPortal.clear();
  plan.authoredW = authoredW; plan.authoredH = authoredH;
  plan.scale = PLAN_SCALE;
  plan.w = w; plan.h = h;
  plan.floor = new Float32Array(w * h);
  plan.ceil = new Float32Array(w * h);
  plan.flags = new Uint8Array(w * h);
  plan.zone = new Uint8Array(w * h);
  plan.material = new Uint8Array(w * h);
  plan.solid = new Uint8Array(w * h).fill(1);   // everything is rock until drawn
  plan.physicalX = new Int32Array(w * h).fill(PHYSICAL_VOID);
  plan.physicalY = new Int32Array(w * h).fill(PHYSICAL_VOID);
  plan.physicalReplace = new Uint8Array(w * h);
  plan.physicalStack = new Uint8Array(w * h);
  plan.collisionOnly = new Uint8Array(w * h);
  plan.layer = new Array(w * h).fill('');
  plan.space = new Array(w * h).fill('');
  plan.renderGroup = new Array(w * h).fill('');
  plan.owner = new Array(w * h).fill('');
  plan.ownershipConflicts = [];
  plan.stairPortals = [];
  plan.stairRuns = [];
  plan.edgePortals = [];
  plan.doorVolumes = [];
  // A helical flight's cells: which arc they belong to, and the arcs themselves.
  // Empty for every straight stair, which is all of them until a spiral exists.
  plan.arcId = new Uint16Array(w * h);
  plan.arcs = [];
  // Straight compound flights can stack in one physical well just as helical
  // coils do. Flight identity lets the renderer and the fractional foot-height
  // sampler keep the observer on the run they are actually walking.
  plan.flightId = new Uint16Array(w * h);
  // Physical cells a stair claims that no LOGICAL cell maps to. An arc rasterises
  // to an annulus whose wedges are not all the same size, so the surplus cells —
  // and the newel void — have real geometry but no address you can stand on.
  // buildPhysicalSpans folds these in; nothing else needs to know.
  plan.stairFill = [];

  for (const level of levels) {
    const { rows, origin, base = 0 } = level;
    const physicalOrigin=level.physicalOrigin||origin;
    const layer=level.layer||level.id||'ground',space=level.space||level.id||layer,renderGroup=level.renderGroup||layer;
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        let cell = cellFor(row[rx], base);
        if (cell === null) continue;             // void: leave as rock
        const override=level.profile?.(rx,ry,cell);
        if(override)cell={...cell,...override};
        const x0 = (origin.x + rx) * PLAN_SCALE;
        const y0 = (origin.y + ry) * PLAN_SCALE;
        for (let sy = 0; sy < PLAN_SCALE; sy++) for (let sx = 0; sx < PLAN_SCALE; sx++) {
          writeCell(x0 + sx, y0 + sy, cell,{
            physicalX:(physicalOrigin.x+rx)*PLAN_SCALE+sx,
            physicalY:(physicalOrigin.y+ry)*PLAN_SCALE+sy,
            layer,space,renderGroup:cell.zone===ZONE.hall?'hall':renderGroup,
            owner:level.id||layer,replace:!!level.replace,physicalReplace:!!level.physicalReplace,
            physicalStack:!!level.physicalStack,
            collisionOnly:!!(level.collisionOnly||cell.collisionOnly),
          });
        }
      }
    }
  }

  // Stairs: a run of STAIR cells given an explicit start and end height. The
  // legend cannot know which way a stair climbs, so the level data says.
  for (const level of levels) {
    for (const s of level.stairs || []) rampStair({
      layer:level.layer||level.id||'stair',
      space:level.space||level.id||'stair',
      renderGroup:level.renderGroup||level.layer||'ground',
      physicalReplace:!!level.physicalReplace,
      physicalStack:!!level.physicalStack,
      ...s,
    });
  }

  if (widenCorridors) widenCorridorRuns();
  authorDoorThresholds();
  initDoorPortals();
  if(doors.length)configureDoors(doors);
  inheritCorridorMaterials();

  // A logical seam is permitted only at a physically continuous landing.
  // It may change the save/pathfinding address, never the player's position or
  // height. Bad level data now fails compilation instead of becoming a
  // one-keypress teleport in the game.
  connectorMap.clear();
  for(const c of connectors) registerConnector(c);
  edgePortalMap.clear();
  for(const portal of edgePortals) registerEdgePortal(portal);

  plan.rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = plan.solid[i];
    plan.rgba[i * 4 + 0] = s ? 0 : encodeH(plan.floor[i]);
    plan.rgba[i * 4 + 1] = s ? 0 : encodeH(plan.ceil[i]);
    plan.rgba[i * 4 + 2] = s ? F.SOLID : plan.flags[i];
    plan.rgba[i * 4 + 3] = s ? 0 : plan.zone[i];
  }

  buildPhysicalSpans();

  plan.loaded = true;
  return plan;
}

// A single authored glyph is a one-metre aperture; adjacent glyphs are a real
// pair. Nothing here widens the opening. The volume is only a shallow detector
// used to locate the leaf plane and preserve render/collision parity.
function authorDoorThresholds() {
  const originalFlags=plan.flags.slice(),originalSolid=plan.solid.slice();
  const visited=new Set(),isThreshold=(x,y,mask)=>{
    if(!inside(x,y)||originalSolid[idx(x,y)])return false;
    const f=originalFlags[idx(x,y)];
    return mask===F.BRICKED?(f&F.BRICKED)!==0:(f&F.DOOR)!==0&&(f&F.BRICKED)===0;
  };
  for(let sy=0;sy<plan.h;sy++)for(let sx=0;sx<plan.w;sx++){
    const start=idx(sx,sy),mask=originalFlags[start]&F.BRICKED?F.BRICKED:F.DOOR,key0=`${sx},${sy}`;
    if(visited.has(key0)||!isThreshold(sx,sy,mask))continue;
    const cluster=[],q=[[sx,sy]];visited.add(key0);
    while(q.length){const [x,y]=q.shift();cluster.push([x,y]);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;if(!visited.has(k)&&isThreshold(nx,ny,mask)){visited.add(k);q.push([nx,ny]);}}}
    const xs=cluster.map(p=>p[0]),ys=cluster.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    const openLR=!isSolid(minX-1,cy)&&!isSolid(maxX+1,cy),openUD=!isSolid(cx,minY-1)&&!isSolid(cx,maxY+1);
    const widthAxis=(maxX-minX)>(maxY-minY)?'x':(maxY-minY)>(maxX-minX)?'y':openLR&&!openUD?'y':'x';
    const volume={minX,maxX,minY,maxY,mask,widthAxis,cx,cy,cells:cluster.map(([x,y])=>({x,y}))};
    plan.doorVolumes.push(volume);
    if(mask===F.BRICKED){
      // The old frame survives as metadata, but the infill is masonry and the
      // route is permanently solid.
      for(const [x,y] of cluster){const i=idx(x,y);plan.solid[i]=1;plan.flags[i]=F.SOLID|F.BRICKED;plan.material[i]=MATERIAL.serviceConcrete;}
    }
  }
}

function initDoorPortals(){
  doorPortals=[];doorCellToPortal.clear();
  for(const volume of plan.doorVolumes){
    if(volume.mask===F.BRICKED)continue;
    // The authored glyph expands to a two-cell-deep threshold at runtime. The
    // old portal kept only one centreline through that volume, which moved the
    // visible frame half a runtime cell toward one jamb and left masonry
    // apparently intruding into otherwise valid doorways. Own and clear the
    // complete throat, and keep the frame centred on the authored volume.
    const cells=volume.cells.map((cell)=>({...cell}));
    if(!cells.length)continue;
    const cx=volume.cx,cy=volume.cy;
    const portal={id:`${Math.round(cx)},${Math.round(cy)}`,legacyId:`${Math.round(cx)},${Math.round(cy)}`,cells,cx,cy,widthAxis:volume.widthAxis,volume,keyId:null,open:true,autoCloseSide:0,definition:null,runtime:{state:DOOR_STATE.OPEN,openFraction:1,wedge:false,closerArmed:false,closeRequested:false}};
    doorPortals.push(portal);for(const c of cells)doorCellToPortal.set(`${c.x},${c.y}`,portal);
  }
}

function setPortalPassable(portal,open){
  if(!portal)return false;portal.open=!!open;
  for(const {x,y} of portal.cells){const i=idx(x,y);plan.flags[i]=portal.open?(plan.flags[i]&~F.CLOSED):(plan.flags[i]|F.CLOSED);if(plan.rgba)plan.rgba[i*4+2]=plan.flags[i];}
  buildPhysicalSpans();
  return true;
}

function setPortalOpen(portal,open,{preserveWedge=true}={}){
  if(!portal)return false;
  portal.runtime.state=open?DOOR_STATE.OPEN:DOOR_STATE.CLOSED;
  portal.runtime.openFraction=open?1:0;
  portal.runtime.closeRequested=false;
  if(!preserveWedge&&!open)portal.runtime.wedge=false;
  return setPortalPassable(portal,open);
}

export function configureDoors(definitions=[]){
  const unmatched=new Set(doorPortals);
  for(const raw of definitions){
    const definition=doorDefinitionWithArchetype(raw);
    const targetX=Number(definition.at?.x)*PLAN_SCALE,targetY=Number(definition.at?.y)*PLAN_SCALE;
    const candidates=[...unmatched].sort((a,b)=>Math.hypot(a.cx-targetX,a.cy-targetY)-Math.hypot(b.cx-targetX,b.cy-targetY));
    const portal=candidates[0];
    if(!portal||Math.hypot(portal.cx-targetX,portal.cy-targetY)>5)throw new Error(`floorplan: no portal for door ${definition.id} near ${targetX},${targetY}`);
    unmatched.delete(portal);
    portal.legacyId=portal.id;portal.id=definition.id;portal.definition=definition;portal.keyId=definition.key||null;
    if(definition.widthAxis&&definition.widthAxis!==portal.widthAxis){
      for(const c of portal.cells)doorCellToPortal.delete(`${c.x},${c.y}`);
      portal.widthAxis=definition.widthAxis;
      portal.cells=portal.volume.cells.map((cell)=>({...cell}));
      portal.cx=portal.volume.cx;portal.cy=portal.volume.cy;
    }
    portal.runtime=freshDoorRuntime(definition);
    portal.aperture={...definition.aperture};portal.leaf={...definition.leaf};portal.activeLeaves=[...definition.activeLeaves];
    for(const c of portal.cells){doorCellToPortal.set(`${c.x},${c.y}`,portal);if(portal.keyId)doorKeys.set(`${c.x},${c.y}`,portal.keyId);}
    setPortalPassable(portal,!doorBlocksPassage(portal.runtime));
  }
  if(unmatched.size)throw new Error(`floorplan: ${unmatched.size} door portal(s) lack explicit definitions: ${[...unmatched].map((p)=>p.legacyId).join(', ')}`);
  return doorState();
}

function writeCell(x, y, cell, meta=null) {
  if (!inside(x, y)) return;
  const i = idx(x, y);
  if(meta?.owner&&plan.owner[i]&&plan.owner[i]!==meta.owner){
    const conflict={x,y,prior:plan.owner[i],next:meta.owner,allowed:!!meta.replace};
    plan.ownershipConflicts.push(conflict);
    if(!meta.replace)throw new Error(`floorplan: ${meta.owner} overlaps ${plan.owner[i]} at ${x},${y} without replace:true`);
  }
  if(meta?.owner)plan.owner[i]=meta.owner;
  if (cell.solid) {
    plan.solid[i] = 1;
    plan.material[i] = MATERIAL.none;
    return;
  }
  plan.solid[i] = 0;
  plan.floor[i] = cell.floor;
  plan.ceil[i] = cell.ceil;
  plan.flags[i] = cell.flags;
  plan.zone[i] = cell.zone;
  plan.material[i] = cell.material || materialForZone(cell.zone);
  if(meta){plan.physicalX[i]=meta.physicalX;plan.physicalY[i]=meta.physicalY;plan.physicalReplace[i]=meta.physicalReplace?1:0;plan.physicalStack[i]=meta.physicalStack?1:0;plan.collisionOnly[i]=meta.collisionOnly?1:0;plan.layer[i]=meta.layer;plan.space[i]=meta.space;plan.renderGroup[i]=meta.renderGroup;}
}

function widenCorridorRuns() {
  const originalSolid = plan.solid.slice();
  const corridorSource = (x, y) => {
    if (!inside(x, y)) return false;
    const i = idx(x, y);
    return !originalSolid[i]
      && plan.zone[i] === ZONE.none
      && (plan.flags[i] & (F.DOOR | F.BRICKED | F.STAIR)) === 0;
  };
  const requests = new Map();
  const radius = Math.max(1, Math.round(PLAN_SCALE));
  for (let y = 1; y < plan.h - 1; y++) for (let x = 1; x < plan.w - 1; x++) {
    if (!corridorSource(x, y)) continue;
    const src = idx(x, y);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      const ni = idx(nx, ny);
      if (!originalSolid[ni] || !plan.solid[ni]) continue;
      if (touchesProtectedCell(nx, ny, originalSolid)) continue;
      requests.set(`${nx},${ny}`, [nx, ny, src]);
    }
  }
  for (const [x, y, src] of requests.values()) openCorridorShoulder(x, y, src, originalSolid);
}

function touchesProtectedCell(x, y, originalSolid = plan.solid) {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx, ny)) return true;
    const i = idx(nx, ny);
    if (originalSolid[i]) continue;
    if (isRoomZone(plan.zone[i]) || (plan.flags[i] & (F.DOOR | F.BRICKED | F.STAIR))) return true;
  }
  return false;
}

function openCorridorShoulder(x, y, src, originalSolid) {
  if (!inside(x, y)) return;
  const i = idx(x, y);
  if (!originalSolid[i] || !plan.solid[i]) return;
  if (touchesProtectedCell(x, y, originalSolid)) return;
  plan.solid[i] = 0;
  plan.floor[i] = plan.floor[src];
  plan.ceil[i] = plan.ceil[src];
  plan.flags[i] = plan.flags[src] & F.MUTABLE;
  plan.zone[i] = ZONE.none;
  plan.material[i] = plan.material[src] || MATERIAL.serviceConcrete;
  plan.physicalX[i]=plan.physicalX[src]+(x-(src%plan.w));
  plan.physicalY[i]=plan.physicalY[src]+(y-Math.floor(src/plan.w));
  plan.physicalReplace[i]=plan.physicalReplace[src];
  plan.physicalStack[i]=plan.physicalStack[src];
  plan.collisionOnly[i]=plan.collisionOnly[src];
  plan.layer[i]=plan.layer[src];plan.space[i]=plan.space[src];plan.renderGroup[i]=plan.renderGroup[src];
}

function inheritCorridorMaterials() {
  const next = plan.material.slice();
  const radius = 8;
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const i = idx(x, y);
    if (plan.solid[i] || plan.zone[i] !== ZONE.none) continue;
    if (plan.material[i] === MATERIAL.doorGlassDuct || (plan.flags[i] & (F.DOOR | F.BRICKED))) continue;

    let bestZone = ZONE.none;
    let bestD = Infinity;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (plan.solid[ni] || !isRoomZone(plan.zone[ni])) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; bestZone = plan.zone[ni]; }
    }
    if (bestZone !== ZONE.none) next[i] = materialForZone(bestZone);
  }
  plan.material = next;
}

// Interpolate floor/ceiling along a stair run so the risers are even.
// `ceil` pins an absolute ceiling instead of a stairwell's low soffit — the
// pool steps descend inside a six-metre hall and must not grow a lid.
function writeStairCell(x,y,{
  floor,ceil,zone,material,physicalX,physicalY,layer,space,renderGroup,owner,
  // A stair standing INSIDE a room owns the air it occupies — the same claim an
  // authored level makes with `physicalReplace`. Without this a flight in a hall
  // is a second physical span at the hall's own coordinates, which the compiler
  // reports as an intersection (and is right to: two structures, one place).
  physicalReplace=false,physicalStack=false,
  // Which arc this cell belongs to, 1-based into plan.arcs; 0 for the straight
  // stairs, which is every stair in the building until a spiral is authored.
  // A selector, not a value — the rotation itself is derived analytically from
  // the arc record, because a stored per-cell angle would step a whole wedge
  // every tread with nothing to interpolate against.
  arcId=0,
  flightId=0,
}){
  if(!inside(x,y))return;
  const i=idx(x,y);
  plan.arcId[i]=arcId;
  plan.flightId[i]=flightId;
  plan.solid[i]=0;
  plan.floor[i]=floor;
  plan.ceil[i]=ceil;
  plan.flags[i]=F.STAIR;
  plan.zone[i]=zone?ZONE[zone]:ZONE.stair;
  plan.material[i]=material?MATERIAL[material]:MATERIAL.serviceConcrete;
  plan.physicalX[i]=Math.round(physicalX);
  plan.physicalY[i]=Math.round(physicalY);
  plan.physicalReplace[i]=physicalReplace?1:0;
  plan.physicalStack[i]=physicalStack?1:0;
  plan.layer[i]=layer||'stair';
  plan.space[i]=space||'stair';
  plan.renderGroup[i]=renderGroup||'ground';
  plan.owner[i]=owner||space||'stair';
}

function authoredPhysicalPoint(point){
  if(!point)return null;
  return{
    x:toRuntimeCoord(point.x,{center:false}),
    y:toRuntimeCoord(point.z??point.y,{center:false}),
  };
}

const TAU=Math.PI*2;

// RASTERISE AN ANNULUS INTO ANGULAR WEDGES.
//
// A helical flight is a straight logical corridor wrapped onto a ring, so the
// question this answers is "which physical cells are tread `s`". Every cell in
// the annulus is assigned to exactly one wedge — a PARTITION, which is the whole
// point. The obvious alternative, sampling ring radii at each angle, was tried
// and measured: it produced 76 distinct physical cells from 96 logical ones, so
// 20 treads shared a cell with their neighbour (the player steps and the camera
// does not move) and 24 annulus cells belonged to no tread at all (rock pits in
// the ring). Neither is a rounding artefact you can tune away; they are what
// sampling a continuous curve onto a raster does.
//
// Angles run CLOCKWISE FROM NORTH, matching the shader's fwd = (sin y, ·, -cos y),
// so a stair with theta0 = 0 enters at the north bearing and turns east — the
// conventional newel.
function rasteriseAnnulus({cx,cz,ri,ro,theta0,sweep,bounds,newelBox},count){
  const wedges=Array.from({length:count},()=>[]);
  const inner=[];
  const step=sweep/count;
  // WINDERS FILLING A SQUARE WELL, NOT A RING FLOATING IN ONE.
  //
  // The first version of this rasterised a circular annulus inside the square
  // shaft, and it was unreadable: a sector DDA draws one floor/ceiling pair per
  // column, so a rasterised CIRCLE becomes a sawtooth of hundreds of tiny wall
  // faces where a smooth surface should be. Two of them — the outer edge and the
  // open newel — turned the whole flight into visual noise.
  //
  // Clipping to the well's own rectangle and cutting a rectangular newel post
  // means every boundary in the stair is STRAIGHT except the radial tread edges,
  // and those are supposed to be edges. The rasterisation artefacts now land on
  // the nosings, which is exactly where a stair has vertical faces anyway.
  const x0=bounds?bounds.x0:Math.floor(cx-ro)-1,x1=bounds?bounds.x1:Math.ceil(cx+ro)+1;
  const z0=bounds?bounds.z0:Math.floor(cz-ro)-1,z1=bounds?bounds.z1:Math.ceil(cz+ro)+1;
  const inNewel=(px,pz)=>newelBox&&px>=newelBox.x0&&px<=newelBox.x1&&pz>=newelBox.z0&&pz<=newelBox.z1;
  for(let pz=z0;pz<=z1;pz++)for(let px=x0;px<=x1;px++){
    // Cell centres, because a cell is a square and its angle is its middle's.
    const dx=px+.5-cx,dz=pz+.5-cz;
    const r=Math.hypot(dx,dz);
    if(r>ro)continue;
    // The newel is left as rock: a solid post you wind around, which a sector
    // renderer draws as four clean faces. An open well would be a second
    // rasterised circle, and that is half of what made the first attempt noise.
    if(inNewel(px,pz)){inner.push({px,pz,r});continue;}
    if(r<ri){inner.push({px,pz,r});continue;}
    let th=Math.atan2(dx,-dz)-theta0;
    th=((th%TAU)+TAU)%TAU;
    if(th>=sweep)continue;                       // outside a partial sweep
    wedges[Math.min(count-1,Math.floor(th/step))].push({px,pz,r});
  }
  // Sorted by radius so a lane can be picked by distance from the newel.
  for(const w of wedges)w.sort((a,b)=>a.r-b.r);
  return {wedges,inner};
}

// A HELICAL FLIGHT.
//
// The logical run is an ordinary straight corridor, so collision, pathfinding
// and the movement manager need to know nothing about any of this — the player
// walks in a line and the building is what curves. Only the PHYSICAL embedding
// is a ring, and only the camera has to be told (see arcYawOffset).
//
// The one thing that cannot be represented is the coil above: the scene shader
// is a sector DDA with one floor/ceiling pair per column, so standing on a tread
// you can never SEE the tread five metres over your head. `ceilFrom`/`ceilTo`
// are what make the stair read anyway — authoring each tread's ceiling as the
// floor of the coil above minus a slab draws the correct soffit at every bearing
// without the renderer ever fetching the other span. The open well is delivered
// separately, by `arc.openWell`: a single-span air column through the middle,
// which is unambiguous from any height and is the view that says "spiral".
function arcFlight(id,flight,a,b,ctx){
  const arc=flight.arc;
  const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
  if(!steps)throw new Error(`${id}/${flight.id||'flight'} has no run`);
  const treads=steps+1;
  const dx=Math.sign(b.x-a.x),dy=Math.sign(b.y-a.y);
  const runWidth=Math.max(1,Math.round((flight.width??1.5)*PLAN_SCALE));
  const logicalPx=Math.abs(dy),logicalPy=Math.abs(dx);
  const cx=toRuntimeCoord(arc.center.x,{center:false});
  const cz=toRuntimeCoord(arc.center.z??arc.center.y,{center:false});
  const geom={
    cx,cz,
    ri:(arc.rInner||0)*PLAN_SCALE,ro:arc.rOuter*PLAN_SCALE,
    theta0:arc.theta0||0,sweep:arc.sweep??TAU,
    bounds:arc.bounds||null,newelBox:arc.newelBox||null,
  };
  const {wedges,inner}=rasteriseAnnulus(geom,treads);
  // The walking band runs from the newel out to the largest circle that fits the
  // well, so a lane never has to reach into a corner to find its cell.
  const innerR=geom.ri;
  const walkOuter=(arc.rWalk!=null?arc.rWalk:arc.rOuter)*PLAN_SCALE;
  const thin=wedges.findIndex((w)=>w.length<runWidth);
  if(thin>=0)throw new Error(
    `${id}/${flight.id||'flight'} wedge ${thin} rasterises to ${wedges[thin].length} cells `
    +`but the run is ${runWidth} wide — widen the annulus or use fewer treads`);

  // The arc record the camera rotates against. Stored in runtime cells because
  // that is the frame logicalToPhysical answers in.
  plan.arcs.push({id:`${id}:${flight.id||plan.arcs.length+1}`,...geom,
    sign:arc.sign===-1?-1:1});
  const arcId=plan.arcs.length;

  // Navigation is still sampled on the half-metre grid, while a hero spiral can
  // carry more physical risers than there are macro cells around the curve.
  // Retain both facts: collision reaches the landing over `steps`, and camera /
  // construction sampling follows the declared physical riser count.
  const rises=Math.max(1,Math.round(flight.rises??treads));
  const span=flight.toH-flight.fromH;
  const run={
    id:`${id}:${flight.id||plan.stairRuns.length+1}`,
    owner:id,flight:flight.id||null,
    p0:[cx,cz],p1:[cx,cz],logical0:[a.x,a.y],logical1:[b.x,b.y],
    fromH:flight.fromH,toH:flight.toH,
    width:runWidth,rises,
    going:Number(flight.going)||.28,
    renderMode:flight.renderMode||'raster',
    group0:flight.groupFrom||ctx.renderGroup,group1:flight.groupTo||ctx.renderGroup,
    arcId,
  };
  plan.stairRuns.push(run);
  const flightId=plan.stairRuns.length;
  for(let s=0;s<treads;s++){
    const t=Math.min(1,s/steps);
    const floor=flight.fromH+span*t;
    const ceil=flight.ceil!=null?flight.ceil
      :flight.ceilFrom!=null?flight.ceilFrom+((flight.ceilTo??flight.ceilFrom)-flight.ceilFrom)*t
      :floor+(flight.head??ctx.head);
    const stepGroup=flight.renderGroup||(s/steps<.5
      ?(flight.groupFrom||ctx.renderGroup)
      :(flight.groupTo||ctx.renderGroup));
    const cellOf={
      floor,ceil,
      zone:flight.zone||ctx.zone,material:flight.material||ctx.material,
      layer:flight.layer||ctx.layer,space:flight.space||ctx.space,
      renderGroup:stepGroup,owner:id,physicalReplace:ctx.physicalReplace,physicalStack:ctx.physicalStack,arcId,flightId,
    };
    // LANES ARE RADIUS BANDS, NOT RANKS WITHIN A WEDGE.
    //
    // Binding lane k to "the k-th cell out" looks equivalent and teleports the
    // player. In a square well the outermost cell of a wedge swings between the
    // inscribed radius at an edge and the half-diagonal at a corner, so walking
    // one lane threw the camera 3.0 cells for a 1.0-cell step — three times the
    // distance a pace should cover, felt as a jerk on most treads. Measured
    // before this: steps of 1.0 to 3.0 cells. Picking the cell nearest a fixed
    // target radius instead keeps a lane at one distance from the newel the
    // whole way round, so the physical step matches the logical one.
    const wedge=wedges[s];
    const taken=new Set();
    const band=(walkOuter-innerR)/runWidth;
    for(let k=0;k<runWidth;k++){
      const target=innerR+(k+0.5)*band;
      let best=-1,bestD=Infinity;
      let selected=null;
      // Consecutive hero flights share an authored bearing. A wedge-centre
      // sample puts the last macro tread on one side of that bearing and the
      // next flight's first tread on the other, leaving a one-to-three-cell
      // camera jump at a landing that is visually continuous. Snap only the
      // boundary tread to the exact radial line; the intermediate wedges keep
      // their partitioned cells and therefore retain unique walkable columns.
      if(arc.snapEndpoints&&(s===0||s===treads-1)){
        const angle=geom.theta0+geom.sweep*(s===0?0:1);
        selected={
          px:Math.floor(geom.cx+Math.sin(angle)*target),
          pz:Math.floor(geom.cz-Math.cos(angle)*target),
        };
        best=wedge.findIndex((candidate,index)=>!taken.has(index)&&candidate.px===selected.px&&candidate.pz===selected.pz);
      }
      if(!selected)for(let i=0;i<wedge.length;i++){
        if(taken.has(i))continue;
        const d=Math.abs(wedge[i].r-target);
        if(d<bestD){bestD=d;best=i;}
      }
      if(!selected&&best<0)break;
      if(best>=0)taken.add(best);
      selected=selected||wedge[best];
      writeStairCell(
        a.x+dx*s+logicalPx*k,
        a.y+dy*s+logicalPy*k,
        {...cellOf,physicalX:selected.px,physicalY:selected.pz},
      );
    }
    // Everything else in the wedge — the corners a square well has and a ring
    // does not — is real tread with no logical address, carried as fill. It is
    // drawn and at the same height as the lane beside it; you simply do not
    // stand with your centre out there, which on a two-metre tread is no loss.
    for(let k=0;k<wedge.length;k++){
      if(taken.has(k))continue;
      plan.stairFill.push({
      px:wedge[k].px,pz:wedge[k].pz,floor,ceil,flags:F.STAIR,arcId,
      zone:cellOf.zone?ZONE[cellOf.zone]:ZONE.stair,
      material:cellOf.material?MATERIAL[cellOf.material]:MATERIAL.serviceConcrete,
      layer:cellOf.layer,spaceId:cellOf.space,renderGroup:stepGroup,owner:id,flightId,
      physicalReplace:ctx.physicalReplace,physicalStack:ctx.physicalStack,
      });
    }
  }

  // The well. One span, floor to lid, so every height resolves it identically and
  // you can see down it from the top and up it from the bottom. canStep refuses
  // it on the riser (the drop in is far past STEP_UP), so it is a view, not a fall.
  const openWell=arc.openWell||arc.newel; // `newel` remains a compatibility alias.
  if(openWell)for(const c of inner)plan.stairFill.push({
    px:c.px,pz:c.pz,floor:openWell.floor,ceil:openWell.ceil,flags:F.STAIR,arcId,
    zone:ZONE.stair,material:MATERIAL.serviceConcrete,
    layer:flight.layer||ctx.layer,spaceId:flight.space||ctx.space,
    renderGroup:flight.groupFrom||ctx.renderGroup,owner:id,flightId,
    physicalReplace:ctx.physicalReplace,physicalStack:ctx.physicalStack,
  });

  const portal={
    id:`${id}:${flight.id||plan.stairPortals.length+1}`,flight:flight.id||null,
    // A ring does not travel, so both ends of the portal are its entry bearing.
    // landingVisible() reads these as a radius test, which is the right question
    // for a spiral and the reason the landings stay in the slice.
    p0:[cx,cz],p1:[cx,cz],
    group0:flight.groupFrom||ctx.renderGroup,group1:flight.groupTo||ctx.renderGroup,
    floor0:flight.fromH,floor1:flight.toH,radius:Math.max(6,Math.ceil(geom.ro*2)),
    rises,riseHeight:Math.abs(span)/rises,
    arc:{...geom,treads,arcId},
    physicalFrom:{x:arc.center.x,z:arc.center.z??arc.center.y},
    physicalTo:{x:arc.center.x,z:arc.center.z??arc.center.y},
    going:run.going,renderMode:run.renderMode,
  };
  plan.stairPortals.push(portal);
  return portal;
}

// Tower stairs use an explicit compound contract. Flights and landing slabs
// author both the collision cells and their Euclidean embedding, so the visual
// risers, map connectors and movement manager all consume the same geometry.
function compoundStair({
  id='stair',flights=[],landings=[],zone=null,material=null,
  layer='stair',space='stair',renderGroup='ground',head=2.6,physicalReplace=false,physicalStack=false,
}){
  const portals=[];
  for(const flight of flights){
    const a=toRuntimePoint(flight.from,{center:false});
    const b=toRuntimePoint(flight.to,{center:false});
    if(flight.arc){portals.push(arcFlight(id,flight,a,b,{zone,material,layer,space,renderGroup,head,physicalReplace,physicalStack}));continue;}
    const p0=authoredPhysicalPoint(flight.physicalFrom);
    const p1=authoredPhysicalPoint(flight.physicalTo);
    if(!p0||!p1)throw new Error(`${id}/${flight.id||'flight'} requires physicalFrom and physicalTo`);
    const dx=Math.sign(b.x-a.x),dy=Math.sign(b.y-a.y);
    const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    const rises=Math.max(1,Math.round(flight.rises??steps));
    if(!steps)throw new Error(`${id}/${flight.id||'flight'} has no run`);
    const runWidth=Math.max(1,Math.round((flight.width??1.5)*PLAN_SCALE));
    const logicalPx=Math.abs(dy),logicalPy=Math.abs(dx);
    const physicalDx=(p1.x-p0.x)/steps,physicalDy=(p1.y-p0.y)/steps;
    const physicalLength=Math.hypot(p1.x-p0.x,p1.y-p0.y)||1;
    const physicalWidthSign=flight.physicalWidthSign===-1?-1:1;
    const physicalPx=-(p1.y-p0.y)/physicalLength*physicalWidthSign;
    const physicalPy=(p1.x-p0.x)/physicalLength*physicalWidthSign;
    const run={
      id:`${id}:${flight.id||portals.length+1}`,
      owner:id,flight:flight.id||null,
      p0:[p0.x,p0.y],p1:[p1.x,p1.y],
      fromH:flight.fromH,toH:flight.toH,
      width:runWidth,rises,
      going:Number(flight.going)||((physicalLength/PLAN_SCALE)/Math.max(1,rises-1)),
      renderMode:flight.renderMode||'raster',
      group0:flight.groupFrom||renderGroup,group1:flight.groupTo||renderGroup,
    };
    plan.stairRuns.push(run);
    const flightId=plan.stairRuns.length;
    for(let s=0;s<=steps;s++){
      const rise=Math.min(rises,Math.floor(s*rises/steps));
      const t=rise/rises;
      const floor=flight.fromH+(flight.toH-flight.fromH)*t;
      const stepGroup=flight.renderGroup||(s/steps<.5
        ?(flight.groupFrom||renderGroup)
        :(flight.groupTo||renderGroup));
      for(let k=0;k<runWidth;k++)writeStairCell(
        a.x+dx*s+logicalPx*k,
        a.y+dy*s+logicalPy*k,
        {
          floor,
          ceil:flight.ceil!=null?flight.ceil:floor+(flight.head??head),
          zone:flight.zone||zone,material:flight.material||material,
          physicalX:p0.x+physicalDx*s+physicalPx*k,
          physicalY:p0.y+physicalDy*s+physicalPy*k,
          layer:flight.layer||layer,space:flight.space||space,
          renderGroup:stepGroup,owner:id,physicalReplace,physicalStack,
          flightId,
        },
      );
    }
    const portal={
      id:`${id}:${flight.id||portals.length+1}`,flight:flight.id||null,
      p0:[p0.x,p0.y],p1:[p1.x,p1.y],
      group0:flight.groupFrom||renderGroup,group1:flight.groupTo||renderGroup,
      floor0:flight.fromH,floor1:flight.toH,radius:Math.max(6,runWidth*2),
      rises,riseHeight:Math.abs(flight.toH-flight.fromH)/rises,
      physicalFrom:{...flight.physicalFrom},physicalTo:{...flight.physicalTo},
      going:run.going,renderMode:run.renderMode,
    };
    plan.stairPortals.push(portal);portals.push(portal);
  }
  for(const landing of landings){
    const at=toRuntimePoint(landing.at,{center:false});
    const size={x:Math.max(1,Math.round(landing.size.x*PLAN_SCALE)),y:Math.max(1,Math.round(landing.size.y*PLAN_SCALE))};
    const p=authoredPhysicalPoint(landing.physicalAt);
    if(!p)throw new Error(`${id}/${landing.id||'landing'} requires physicalAt`);
    for(let oy=0;oy<size.y;oy++)for(let ox=0;ox<size.x;ox++)writeStairCell(at.x+ox,at.y+oy,{
      floor:landing.height,
      ceil:landing.ceil!=null?landing.ceil:landing.height+(landing.head??head),
      zone:landing.zone||zone,material:landing.material||material,
      physicalX:p.x+ox,physicalY:p.y+oy,
      layer:landing.layer||layer,space:landing.space||space,
      renderGroup:landing.renderGroup||renderGroup,owner:id,physicalReplace,physicalStack,
    });
  }
  return portals;
}

function rampStair(spec) {
  if(spec.flights?.length)return compoundStair(spec);
  const { from, to, fromH, toH, width = 1, ceil = null, head = 2.6, zone = null, material = null }=spec;
  const a = toRuntimePoint(from, { center: false });
  const b = toRuntimePoint(to, { center: false });
  const runWidth = Math.max(1, Math.round(width * PLAN_SCALE));
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  // The far edge belongs after a positive run. On a negative run `b` already
  // is the far edge; subtracting another cell leaves the authored stair and
  // makes the physical interpolation shoot toward an unmapped logical island.
  const end = {
    x: b.x + (dx > 0 ? PLAN_SCALE - 1 : 0),
    y: b.y + (dy > 0 ? PLAN_SCALE - 1 : 0),
  };
  const steps = Math.max(Math.abs(end.x - a.x), Math.abs(end.y - a.y));
  if (steps === 0) return;
  const landing=(point,height)=>{
    let best=null;
    for(let oy=-PLAN_SCALE*2;oy<=PLAN_SCALE*2;oy++)for(let ox=-PLAN_SCALE*2;ox<=PLAN_SCALE*2;ox++){
      const x=point.x+ox,y=point.y+oy;if(!inside(x,y))continue;const i=idx(x,y);
      if(plan.solid[i]||plan.physicalX[i]===PHYSICAL_VOID)continue;
      const score=Math.hypot(ox,oy)+Math.abs(plan.floor[i]-height)*20;
      if(!best||score<best.score)best={score,i,x,y};
    }
    if(!best)return{p:[point.x,point.y],meta:{layer:'stair',space:'stair',group:height<0?'basement':'ground'}};
    return{
      p:[plan.physicalX[best.i]+(point.x-best.x),plan.physicalY[best.i]+(point.y-best.y)],
      meta:{layer:plan.layer[best.i],space:plan.space[best.i],group:plan.renderGroup[best.i]},
    };
  };
  const l0=landing(a,fromH),l1=landing(end,toH),p0=l0.p,p1=l1.p,meta0=l0.meta,meta1=l1.meta;
  plan.stairPortals.push({p0,p1,group0:meta0.group,group1:meta1.group,floor0:fromH,floor1:toH,radius:10});
  // perpendicular, for stairs wider than one cell
  // `from` names the authored top-left edge of the run. Width always expands
  // toward positive authored coordinates; tying it to travel direction made
  // descending stairs grow through the wall on the opposite side.
  const px = Math.abs(dy), py = Math.abs(dx);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const fh = fromH + (toH - fromH) * t;
    for (let k = 0; k < runWidth; k++) {
      const x = a.x + dx * s + px * k, y = a.y + dy * s + py * k;
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      plan.solid[i] = 0;
      plan.floor[i] = fh;
      plan.ceil[i] = ceil != null ? ceil : fh + head;
      plan.flags[i] = F.STAIR;
      plan.zone[i] = zone?ZONE[zone]:ZONE.stair;
      plan.material[i] = material?MATERIAL[material]:MATERIAL.serviceConcrete;
      plan.physicalX[i]=Math.round(p0[0]+(p1[0]-p0[0])*t+px*k);
      plan.physicalY[i]=Math.round(p0[1]+(p1[1]-p0[1])*t+py*k);
      const meta=t<.5?meta0:meta1;plan.layer[i]=meta.layer||'stair';plan.space[i]=meta.space||'stair';plan.renderGroup[i]=zone==='hall'?'hall':(meta.group||'ground');
    }
  }
}

// ── queries: the ONLY source of truth for collision ─────────────────────────
export function cellAt(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!inside(cx, cy)) return null;
  const i = idx(cx, cy);
  if (plan.solid[i]) return null;
  return {
    floor: plan.floor[i],
    ceil: plan.ceil[i],
    flags: plan.flags[i],
    zone: plan.zone[i],
    material: plan.material[i],
  };
}

export function isSolid(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!inside(cx, cy)) return true;
  return !!plan.solid[idx(cx, cy)];
}

export function floorAt(x, y) { const c = cellAt(x, y); return c ? c.floor : 0; }
export function ceilAt(x, y) { const c = cellAt(x, y); return c ? c.ceil : 0; }
export function zoneAt(x, y) { const c = cellAt(x, y); return c ? c.zone : ZONE.none; }
export function worldAt(x, y) { return ZONE_WORLD[zoneAt(x, y)] || 'main_b3'; }
export function flagsAt(x, y) { const c = cellAt(x, y); return c ? c.flags : F.SOLID; }
export function materialAt(x, y) { const c = cellAt(x, y); return c ? c.material : MATERIAL.none; }
export function hasFlag(x, y, f) { return (flagsAt(x, y) & f) !== 0; }

function portalSide(portal,x,y){
  const along=portal?.widthAxis==='x'?y:x;
  const plane=portal?.widthAxis==='x'?portal.cy:portal.cx;
  return Math.sign(along-plane);
}

function exitOnlyStep(portal,sx,sy,bx,by,sourcePortal,targetPortal){
  if(portal?.definition?.access!=='exit-only')return null;
  const inside=portal.definition.insideSide===-1?-1:1;
  // Approaching the threshold from outside is refused before leaf state is
  // considered, so forced-open and restored-open leaves cannot become entries.
  if(targetPortal===portal&&sourcePortal!==portal&&portalSide(portal,sx,sy)!==inside){
    return{ok:false,why:'exit-only',id:portal.id};
  }
  // Once centred in the aperture, only the outward half of the crossing is
  // legal. This closes the reverse-traversal hole on wide two-leaf portals.
  if(sourcePortal===portal&&targetPortal!==portal&&portalSide(portal,bx,by)===inside){
    return{ok:false,why:'exit-only',id:portal.id};
  }
  return null;
}

// A step is a body moving, not a camera: it needs somewhere to stand, room for
// its head, and a riser it can take without thinking about it.
export function canStep(fromX, fromY, toX, toY, { keys } = {}) {
  const a = cellAt(fromX, fromY);
  const sx=Math.floor(fromX),sy=Math.floor(fromY),tx=Math.floor(toX),ty=Math.floor(toY);
  const dx=Math.sign(tx-sx),dy=Math.sign(ty-sy);
  // First-person movement is usually diagonal because the camera can face any
  // angle. An edge portal, however, is authored on one cardinal boundary. If a
  // diagonal stride contains that outward component, cross the boundary and
  // consume the lateral component on the next ordinary step. Requiring the
  // player to align their view to an exact compass bearing made every stair
  // threshold look blocked even though keyboard-only reachability passed.
  const edge=edgePortalMap.get(`${sx},${sy}|${dx},${dy}`)
    ||(dx&&dy&&(edgePortalMap.get(`${sx},${sy}|${dx},0`)
      ||edgePortalMap.get(`${sx},${sy}|0,${dy}`)))
    ||null;
  const destination=edge?.redirect||null;
  const b = destination?cellAt(destination.x,destination.y):cellAt(toX, toY);
  if (!b) return { ok: false, why: 'wall' };
  const bx=Math.floor(destination?.x??toX),by=Math.floor(destination?.y??toY);
  const sourcePortal=doorAt(sx,sy),targetPortal=doorAt(bx,by);
  const accessPortal=targetPortal||sourcePortal;
  const accessRefusal=exitOnlyStep(accessPortal,sx,sy,bx,by,sourcePortal,targetPortal);
  if(accessRefusal)return accessRefusal;
  if(plan.collisionOnly?.[idx(bx,by)])return{ok:false,why:'wall'};
  if (b.flags & F.BRICKED) return { ok: false, why: 'bricked' };
  if (b.flags & F.DOOR) {
    const keyId = doorKeyAt(destination?.x??toX, destination?.y??toY);
    if(b.flags&F.CLOSED){
      if(keyId && !(keys && keys.has(keyId))) return { ok: false, why: 'locked', keyId };
      return {ok:false,why:'closed',keyId:keyId||null};
    }
  }
  if (b.ceil - b.floor < HEADROOM) return { ok: false, why: 'headroom' };
  if (a && Math.abs(b.floor - a.floor) > STEP_UP) return { ok: false, why: 'too high' };
  if(accessPortal?.definition?.access==='exit-only'&&accessPortal.open){
    accessPortal.autoCloseSide=accessPortal.definition.insideSide===-1?-1:1;
    accessPortal.runtime.closerArmed=true;
  }
  if(destination)return{ok:true,floor:b.floor,redirect:{...destination},edgePortal:edge.id,edgeTurn:edge.turn||0};
  const redirect=connectorMap.get(`${Math.floor(toX)},${Math.floor(toY)}`)||null;
  return { ok: true, floor: b.floor, ...(redirect?{redirect:{...redirect}}:{}) };
}

// Logical cells stay unique for gameplay, while their physical embedding may
// stack several levels over the same X/Z footprint.
const connectorMap=new Map();
const edgePortalMap=new Map();
export function connectorDestination(x,y){const p=connectorMap.get(`${Math.floor(x)},${Math.floor(y)}`);return p?{...p}:null;}
export function edgePortalDestination(x,y,dx,dy){
  const portal=edgePortalMap.get(`${Math.floor(x)},${Math.floor(y)}|${Math.sign(dx)},${Math.sign(dy)}`);
  return portal?{...portal.redirect,id:portal.id}:null;
}
export function edgePortalState(){
  return(plan.edgePortals||[]).map((portal)=>({
    ...portal,
    from:{...portal.from,at:{...portal.from.at},along:{...portal.from.along},exit:{...portal.from.exit}},
    to:{...portal.to,at:{...portal.to.at},along:{...portal.to.along},exit:{...portal.to.exit}},
    pairs:portal.pairs.map((pair)=>({from:{...pair.from},to:{...pair.to}})),
  }));
}

// A floor seam is crossed, never occupied. Each declaration pairs a strip of
// boundary cells, and a redirect exists only for the outward step from those
// cells. Walking along either landing is therefore ordinary movement, while an
// immediate reversal crosses the same lane back instead of trapping the player
// on a hidden logical island.
function registerEdgePortal({id='edge-portal',from,to,width=1,bidirectional=true}){
  const unit=(v)=>({x:Math.sign(Number(v?.x)||0),y:Math.sign(Number(v?.y)||0)});
  const side=(entry,label)=>{
    const at=toRuntimePoint(entry?.at||{}, {center:false});
    const along=unit(entry?.along),exit=unit(entry?.exit);
    if(Math.abs(along.x)+Math.abs(along.y)!==1||Math.abs(exit.x)+Math.abs(exit.y)!==1||along.x*exit.x+along.y*exit.y!==0){
      throw new Error(`floorplan: ${id} ${label} requires perpendicular unit along/exit vectors`);
    }
    return{at,along,exit};
  };
  const a=side(from,'from'),b=side(to,'to'),lanes=Math.max(1,Math.round(Number(width)*PLAN_SCALE));
  const bearing=(v)=>Math.atan2(v.x,-v.y);
  const turn=(entry,otherExit)=>{
    let value=bearing({x:-otherExit.x,y:-otherExit.y})-bearing(entry);
    while(value>Math.PI)value-=Math.PI*2;
    while(value<=-Math.PI)value+=Math.PI*2;
    return value;
  };
  const forwardTurn=turn(a.exit,b.exit),reverseTurn=turn(b.exit,a.exit);
  const pairs=[];
  for(let lane=0;lane<lanes;lane++){
    const ac={x:a.at.x+a.along.x*lane,y:a.at.y+a.along.y*lane};
    const bc={x:b.at.x+b.along.x*lane,y:b.at.y+b.along.y*lane};
    const ca=cellAt(ac.x,ac.y),cb=cellAt(bc.x,bc.y);
    if(!ca||!cb)throw new Error(`floorplan: ${id} lane ${lane} ends in rock`);
    const pa=logicalToPhysical(ac.x,ac.y),pb=logicalToPhysical(bc.x,bc.y);
    const planar=Math.hypot(pa.x-pb.x,pa.z-pb.z),vertical=Math.abs(ca.floor-cb.floor);
    if(planar>1.01||vertical>STEP_UP+1e-6)throw new Error(
      `floorplan: ${id} lane ${lane} is discontinuous (${planar.toFixed(2)} cells, ${vertical.toFixed(2)}m)`,
    );
    const forward={id,lane,redirect:{...bc},turn:forwardTurn};
    const reverse={id,lane,redirect:{...ac},turn:reverseTurn};
    const ak=`${ac.x},${ac.y}|${a.exit.x},${a.exit.y}`;
    const bk=`${bc.x},${bc.y}|${b.exit.x},${b.exit.y}`;
    if(edgePortalMap.has(ak)||bidirectional&&edgePortalMap.has(bk))throw new Error(`floorplan: ${id} overlaps another edge portal`);
    edgePortalMap.set(ak,forward);
    if(bidirectional)edgePortalMap.set(bk,reverse);
    pairs.push({from:ac,to:bc});
  }
  plan.edgePortals.push({id,width,lanes,bidirectional,from:{...a},to:{...b},pairs});
}
// A SEAM IS AN EDGE, NOT A KEYHOLE.
//
// This used to scan up to sixteen candidate cells at each end, score every pair,
// and keep exactly ONE — discarding every other coincidence it had just proved
// legal. That single half-metre tile is the bug behind "you get locked into
// paths": the third-floor stair's foot landing stands inside the second-floor
// hall at the hall's own height and material, invisible, and its entire
// perimeter was wall except for that one cell. You could see the stair, walk the
// length of it, and never find the way on. Coming down, you landed on a slab
// where every direction but one was a wall you could not see. Measured before
// this change: one redirect in forty possible steps along the hall's edge.
//
// Widening is OPT-IN, via `span`, and that restriction was measured rather than
// assumed. Registering every valid pair by default looks safe — a valid pair is
// within half a metre and one riser, i.e. the same place — but a seam covers an
// AREA, not just the junction, and the galleria's seams lie on the open
// orchestra floor. Blanket widening put redirects on 78 hall cells, so crossing
// the orchestra rewrote your address mid-stride and dropped you on the balcony's
// logical island where the next step was a wall: the hall's three levels stopped
// being mutually reachable. A seam that fires where nobody meant to cross one is
// worse than a narrow seam.
//
// So `span` (authored metres) both widens the candidate window AND opts into
// registering the whole edge. Without it the behaviour is exactly as before —
// one pair, the closest.
function registerConnector({from,to,bidirectional=true,span=null}){
  const reach={
    x:Math.max(0,Math.round((span?.x||0)*PLAN_SCALE)),
    y:Math.max(0,Math.round((span?.y||0)*PLAN_SCALE)),
  };
  const candidates=(p)=>{
    const x0=toRuntimeCoord(p.x,{center:false}),y0=toRuntimeCoord(p.y,{center:false}),out=[];
    for(let oy=-1;oy<=PLAN_SCALE+reach.y;oy++)for(let ox=-1;ox<=PLAN_SCALE+reach.x;ox++){
      const x=x0+ox,y=y0+oy,c=cellAt(x,y);if(!c)continue;
      const q=logicalToPhysical(x,y);out.push({x,y,px:q.x,pz:q.z,h:c.floor});
    }
    return out;
  };
  const pairs=[];
  for(const a of candidates(from))for(const b of candidates(to)){
    if(a.x===b.x&&a.y===b.y)continue;                 // a cell is not its own seam
    const planar=Math.hypot(a.px-b.px,a.pz-b.pz),vertical=Math.abs(a.h-b.h);
    pairs.push({a,b,planar,vertical,score:planar*4+vertical});
  }
  pairs.sort((p,q)=>p.score-q.score);
  const valid=pairs.filter((p)=>p.planar<=1.01&&p.vertical<=STEP_UP+1e-6);
  if(!valid.length){
    // Name the cell that came closest and by how much. The old message quoted
    // only the authored metres, which is the one thing the author already knows.
    const near=pairs[0];
    throw new Error(`floorplan: discontinuous level seam ${JSON.stringify(from)} -> ${JSON.stringify(to)}`
      +(near
        ?`; closest pair (${near.a.x},${near.a.y})->(${near.b.x},${near.b.y}) is `
         +`${near.planar.toFixed(2)} cells apart and ${near.vertical.toFixed(2)}m in height `
         +`(limits 1.01 and ${STEP_UP})`
        :'; neither end has any open cell'));
  }
  // Best score first, so where a cell could pair with several the closest wins.
  for(const {a,b} of (span?valid:[valid[0]])){
    if(!connectorMap.has(`${a.x},${a.y}`))connectorMap.set(`${a.x},${a.y}`,{x:b.x,y:b.y});
    if(bidirectional&&!connectorMap.has(`${b.x},${b.y}`))connectorMap.set(`${b.x},${b.y}`,{x:a.x,y:a.y});
  }
}

function buildPhysicalSpans(){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;const cells=new Map();
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    // Collision-only hall cells remain ordinary AIR to the physical renderer.
    // Omitting them turns the space around a hero mesh back into the compiler's
    // default rock, which is exactly the leaking brick cylinder these cells are
    // meant to prevent. Navigation rejects them in canStep; rendering must keep
    // their full room volume so only the dedicated stair mesh is visible.
    const i=idx(x,y);if(plan.solid[i]||plan.physicalX[i]===PHYSICAL_VOID)continue;
    const px=plan.physicalX[i],py=plan.physicalY[i],key=`${px},${py}`;
    minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push({floor:plan.floor[i],ceil:plan.ceil[i],flags:plan.flags[i],zone:plan.zone[i],material:plan.material[i],logicalX:x,logicalY:y,layer:plan.layer[i],spaceId:plan.space[i],renderGroup:plan.renderGroup[i],owner:plan.owner[i],arcId:plan.arcId[i],flightId:plan.flightId[i],physicalReplace:!!plan.physicalReplace[i],physicalStack:!!plan.physicalStack[i]});
  }
  // Physical geometry a stair claims that no logical cell addresses: an arc's
  // surplus wedge cells and its newel void. They are real volume — drawn, and
  // stood on by way of the tread beside them — so they belong in the spans, but
  // they have no logical address and so cannot come from the scan above.
  for(const f of plan.stairFill){
    const key=`${f.px},${f.pz}`;minX=Math.min(minX,f.px);minY=Math.min(minY,f.pz);maxX=Math.max(maxX,f.px);maxY=Math.max(maxY,f.pz);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push({floor:f.floor,ceil:f.ceil,flags:f.flags,zone:f.zone,material:f.material,logicalX:-1,logicalY:-1,layer:f.layer,spaceId:f.spaceId,renderGroup:f.renderGroup,owner:f.owner,arcId:f.arcId||0,flightId:f.flightId||0,physicalReplace:!!f.physicalReplace,physicalStack:!!f.physicalStack});
  }
  let maxSpans=0,overlaps=[];
  const intersects=(a,b)=>a.floor<b.ceil-.01&&b.floor<a.ceil-.01;
  for(const [key,list] of cells){
    // A declared structural flight replaces the hall/balcony air it occupies.
    // This removes duplicate representations of one real volume; undeclared
    // intersections remain compiler errors reported through `overlaps`.
    const ordered=[...list].sort((a,b)=>(b.physicalReplace?1:0)-(a.physicalReplace?1:0)||a.floor-b.floor),resolved=[];
    for(let candidate of ordered){
      // A declared higher floor is allowed to sit over an existing tall room.
      // Cap the lower air volume at a real slab soffit; never discard the room
      // below and never report the ordinary vertical stack as an intersection.
      for(let index=0;index<resolved.length;index++){
        const existing=resolved[index];
        if(!intersects(candidate,existing))continue;
        const high=candidate.floor>existing.floor?candidate:existing;
        const low=high===candidate?existing:candidate;
        if(!high.physicalStack||high.floor-low.floor<HEADROOM)continue;
        const capped={...low,ceil:Math.min(low.ceil,high.floor-.25)};
        if(high===candidate)resolved[index]=capped;
        else candidate=capped;
      }
      const hit=resolved.findIndex((span)=>intersects(candidate,span));
      if(hit<0){resolved.push(candidate);continue;}
      // A dog-leg's flight edge and its turn landing deliberately share one
      // tread. They are two authored views of the same stair cell, not two
      // intersecting structures. Resolve that seam without physicalReplace.
      if(candidate.owner&&candidate.owner===resolved[hit].owner&&(candidate.flags&F.STAIR)&&(resolved[hit].flags&F.STAIR)){
        if(candidate.floor<resolved[hit].floor)resolved[hit]=candidate;
        continue;
      }
      // A hero flight cuts through a replacement hall volume. Both modules are
      // allowed to replace the legacy plan, but only the stair is structural at
      // this column, so it wins the shared air without turning a deliberate
      // stair/hall composition into a compiler overlap.
      if(candidate.physicalReplace&&resolved[hit].physicalReplace&&!!(candidate.flags&F.STAIR)!==!!(resolved[hit].flags&F.STAIR)){
        if(candidate.flags&F.STAIR)resolved.splice(hit,1,candidate);
        continue;
      }
      if(candidate.physicalReplace&&!resolved[hit].physicalReplace){resolved.splice(hit,1,candidate);continue;}
      if(resolved[hit].physicalReplace&&!candidate.physicalReplace)continue;
      overlaps.push({key,a:resolved[hit],b:candidate});
    }
    resolved.sort((a,b)=>a.floor-b.floor);cells.set(key,resolved);maxSpans=Math.max(maxSpans,resolved.length);
  }
  if(!Number.isFinite(minX)){minX=0;minY=0;maxX=0;maxY=0;}
  const width=maxX-minX+1,height=maxY-minY+1;

  // Exterior lots are collision voids because their interiors are closed, but
  // they are not geological walls. Flood the blank physical region OUTSIDE the
  // continuous playable street ring and retain it as visual weather volume.
  // Collision keeps using the logical solid map; only the renderer consumes
  // this mask, allowing depth-tested town meshes to occupy the closed lots.
  let visualVoid=null,visualExteriorVoid=null;
  const hasExterior=[...cells.values()].some((spans)=>spans.some((span)=>
    span.zone===ZONE.street||span.zone===ZONE.civicCourt||span.zone===ZONE.serviceYard));
  if(hasExterior){
    visualVoid=new Uint8Array(width*height);
    visualExteriorVoid=new Uint8Array(width*height);
    const occupied=new Uint8Array(width*height);
    for(const key of cells.keys()){
      const [px,py]=key.split(',').map(Number),lx=px-minX,ly=py-minY;
      if(lx>=0&&ly>=0&&lx<width&&ly<height)occupied[ly*width+lx]=1;
    }
    for(let i=0;i<occupied.length;i++)if(!occupied[i])visualExteriorVoid[i]=1;
    const queue=[],seed=(x,y)=>{
      const i=y*width+x;if(occupied[i]||visualVoid[i])return;
      visualVoid[i]=1;queue.push([x,y]);
    };
    for(let x=0;x<width;x++){seed(x,0);seed(x,height-1);}
    for(let y=1;y<height-1;y++){seed(0,y);seed(width-1,y);}
    for(let cursor=0;cursor<queue.length;cursor++){
      const [x,y]=queue[cursor];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
        seed(nx,ny);
      }
    }
  }
  plan.physical={originX:minX,originY:minY,width,height,maxSpans,cells,overlaps,visualVoid,visualExteriorVoid,renderCache:new Map()};
}

// HOW FAR THE WORLD IS TURNED UNDER YOU AT THIS POSITION.
//
// Zero everywhere except on a helical flight, which is to say zero everywhere in
// the building today. It is analytic rather than a stored per-cell angle for a
// reason that is easy to miss: px,py are always integers, so the sub-cell
// fraction is always zero and a stored array would have nothing to interpolate
// between — the view would snap a whole wedge on every tread. Derived from the
// RENDERED physical position instead, it is continuous for free, because it is
// a function of the same smoothed point the camera is already at.
//
// theta0 is by construction the bearing at which the arc meets its unrotated
// neighbours, so the offset is 0 at both thresholds and every seam is blend-free.
// Only ever consumed through cos/sin, so it never needs unwrapping.
export function arcYawOffset(logicalX,logicalY,physX,physZ){
  const cx=Math.floor(logicalX),cy=Math.floor(logicalY);
  if(!inside(cx,cy))return 0;
  const id=plan.arcId?.[idx(cx,cy)];
  if(!id)return 0;
  const a=plan.arcs[id-1];
  return a.sign*(Math.atan2(physX-a.cx,-(physZ-a.cz))-a.theta0);
}

export function logicalToPhysical(x,y){
  const cx=Math.floor(x),cy=Math.floor(y);if(!inside(cx,cy))return{x,y,z:y,layer:'',spaceId:'',renderGroup:''};
  const i=idx(cx,cy),ox=x-cx,oy=y-cy;
  const px=plan.physicalX[i],pz=plan.physicalY[i];
  const id=plan.arcId[i];
  // On an arc, intra-cell motion must run along the tangent, not along the
  // logical axis, or every tread carries a half-metre sideways wobble. Rotating
  // about the cell ORIGIN rather than its centre keeps logicalToPhysical(int,int)
  // byte-identical, which matters: ~25 call sites pass integers meaning "that
  // cell" and registerConnector compares the results for exact coincidence.
  let rx=ox,rz=oy;
  if(id&&(ox||oy)){
    const t=arcYawOffset(cx,cy,px+.5,pz+.5),c=Math.cos(t),s=Math.sin(t);
    rx=ox*c-oy*s;rz=ox*s+oy*c;
  }
  const mapped=px!==PHYSICAL_VOID&&pz!==PHYSICAL_VOID;
  return{x:mapped?px+rx:x,z:mapped?pz+rz:y,y:plan.floor[i],arcId:id,flightId:plan.flightId[i],owner:plan.owner[i],layer:plan.layer[i],spaceId:plan.space[i],renderGroup:plan.renderGroup[i]};
}

// Collision remains on the half-metre grid, but the camera follows the real
// tread cadence declared by the flight. This is the visual half of the macro-
// tread contract: no 340mm camera lurches and no fake fourteen-step slab.
export function renderedFloorAt(logicalX,logicalY,physicalX,physicalZ){
  const cx=Math.floor(logicalX),cy=Math.floor(logicalY);
  if(!inside(cx,cy))return 0;
  const i=idx(cx,cy),runId=plan.flightId?.[i];
  if(!runId)return plan.floor[i];
  const run=plan.stairRuns[runId-1];
  if(!run)return plan.floor[i];
  const useLogical=run.arcId&&run.logical0&&run.logical1;
  const start=useLogical?run.logical0:run.p0,end=useLogical?run.logical1:run.p1;
  const point=useLogical?[logicalX,logicalY]:[physicalX,physicalZ];
  const dx=end[0]-start[0],dz=end[1]-start[1],length2=dx*dx+dz*dz||1;
  const progress=Math.max(0,Math.min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dz)/length2));
  const riser=Math.max(0,Math.min(run.rises,Math.floor(progress*run.rises+1e-6)));
  return run.fromH+(run.toH-run.fromH)*(riser/run.rises);
}

export function stairCrossing(fromX,fromY,toX,toY){
  const sx=Math.floor(fromX),sy=Math.floor(fromY),tx=Math.floor(toX),ty=Math.floor(toY);
  const edge=edgePortalMap.get(`${sx},${sy}|${Math.sign(tx-sx)},${Math.sign(ty-sy)}`);
  const destination=edge?.redirect||{x:tx,y:ty};
  const a=cellAt(sx,sy),b=cellAt(destination.x,destination.y);
  if(!a||!b)return null;
  const ai=idx(sx,sy),bi=idx(destination.x,destination.y);
  const runId=plan.flightId[bi]||plan.flightId[ai];
  if(!runId)return null;
  const run=plan.stairRuns[runId-1];
  const delta=b.floor-a.floor;
  const travel=delta>1e-4?'up':delta<-1e-4?'down':'level';
  return{stairId:run.owner,flightId:run.flight,travel,fromH:a.floor,toH:b.floor,edgePortal:edge?.id||null};
}

export function nearestWalkable(x,y,{floor=null,radius=32}={}){
  const sx=Math.floor(x),sy=Math.floor(y),limit=Math.max(0,Math.floor(radius));
  let best=null;
  for(let oy=-limit;oy<=limit;oy++)for(let ox=-limit;ox<=limit;ox++){
    const cell=cellAt(sx+ox,sy+oy);if(!cell)continue;
    const floorDelta=floor==null?0:Math.abs(cell.floor-floor);
    if(floor!=null&&floorDelta>STEP_UP)continue;
    const score=Math.hypot(ox,oy)+floorDelta*8;
    if(!best||score<best.score)best={x:sx+ox,y:sy+oy,score};
  }
  return best?{x:best.x,y:best.y}:null;
}

export function physicalSpanData(){return plan.physical;}
export function ownershipData(){return{owner:plan.owner,conflicts:plan.ownershipConflicts};}

export function logicalAtPhysical(x,z,{group=null,floor=null}={}){
  const list=plan.physical?.cells.get(`${Math.floor(x)},${Math.floor(z)}`)||[];let choices=group?list.filter((s)=>s.renderGroup===group):list;if(!choices.length)choices=list;if(!choices.length)return null;
  choices.sort((a,b)=>floor==null?0:Math.abs(a.floor-floor)-Math.abs(b.floor-floor));return{x:choices[0].logicalX+(x-Math.floor(x)),y:choices[0].logicalY+(z-Math.floor(z)),...choices[0]};
}

// AMBIENT IS A PROPERTY OF PLACE, NOT A NUMBER PER ZONE.
//
// It used to be one scalar per zone (0.014-0.043) applied to every cell in that
// zone equally, which is why an unlit room read as wireframe: a wall one metre
// from the eye and the far end of a thirty-metre corridor received identical
// light, so nothing receded, and the whole building was equally visible.
//
// The obvious model — ambient is daylight spill, so bake distance to the nearest
// F.SKY opening — was measured and thrown away. This building has THIRTY-SIX sky
// cells in total and none at all in the ground slice the player spends the game
// in. It is a windowless basement conservatory. Distance-to-daylight is inert
// here, and driving ambient from it dimmed every zone to the same floor, which
// is the original bug with a longer derivation behind it.
//
// So the driver is the building's own statement about which of its spaces are
// grand: CEILING HEIGHT. The store is 2.25m and the concert hall is 15.5m, and
// that is not decoration — a tall volume has more surface above you catching the
// practicals and bouncing them back down, and it is where this building puts its
// light. Enclosure modifies it, because a tight corridor collects less of it than
// an open floor at the same height. The sky term survives as a bonus for the few
// cells that genuinely have a shaft over them.
//
// Baked once per plan slice and carried in the material texture's G channel (see
// r3dSetPlan) because MAX_TEXTURE_IMAGE_UNITS is 16 on the target machine and all
// 16 are already bound — a sampler of its own was never available.
//
// Encoded as a MULTIPLIER on the zone ambient, scaled by AMBIENT_PLACE_SCALE so
// a byte can carry it. 255/AMBIENT_PLACE_SCALE is exactly 1.0, which is what an
// unbaked plan gets by default — so a slice that never runs this is unchanged.
const AMBIENT_SKY_CAP = 40;               // stop the BFS; past here it is all dark
const AMBIENT_SKY_SOFT = 7;               // cells at which spill has halved
const AMBIENT_SKY_WEIGHT = 0.60;          // what a shaft directly overhead adds
const AMBIENT_VOLUME_LOW = 2.2;           // the store: a ceiling you can touch
const AMBIENT_VOLUME_HIGH = 15.5;         // the hall: the tallest authored volume
const AMBIENT_DEEP = 0.65;                // multiplier in the meanest space
const AMBIENT_OPEN = 2.60;                // multiplier in the grandest
const AMBIENT_ENCLOSED = 0.50;            // what a fully enclosed cell keeps

export function bakeAmbientField({w,h,solid,flags,floor=null,ceil=null}){
  const cells=w*h;
  const dist=new Int32Array(cells).fill(-1);
  const queue=new Int32Array(cells);
  let head=0,tail=0;
  for(let i=0;i<cells;i++) if(!solid[i]&&(flags[i]&F.SKY)){dist[i]=0;queue[tail++]=i;}
  // Breadth-first through open cells only. 4-neighbour: spill turns corners but
  // does not cut them, which is the behaviour a diagonal step would fake.
  while(head<tail){
    const i=queue[head++],d=dist[i];
    if(d>=AMBIENT_SKY_CAP)continue;
    const x=i%w,y=(i-x)/w;
    for(let k=0;k<4;k++){
      const nx=x+(k===0?1:k===1?-1:0),ny=y+(k===2?1:k===3?-1:0);
      if(nx<0||ny<0||nx>=w||ny>=h)continue;
      const j=ny*w+nx;
      if(solid[j]||dist[j]>=0)continue;
      dist[j]=d+1;queue[tail++]=j;
    }
  }
  const out=new Uint8Array(cells);
  const span=AMBIENT_VOLUME_HIGH-AMBIENT_VOLUME_LOW;
  const encode=(m)=>Math.max(1,Math.min(255,Math.round(m/AMBIENT_PLACE_SCALE*255)));
  for(let i=0;i<cells;i++){
    if(solid[i])continue;                 // filled from its neighbours below
    const x=i%w,y=(i-x)/w;
    let open=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      // Outside the plan is void, which is rock. Counting it as open would make
      // every cell on the building's edge read as though it stood in a plaza.
      if(nx<0||ny<0||nx>=w||ny>=h)continue;
      if(!solid[ny*w+nx])open++;
    }
    const height=ceil&&floor?Math.max(0,ceil[i]-floor[i]):AMBIENT_VOLUME_LOW;
    const volume=Math.max(0,Math.min(1,(height-AMBIENT_VOLUME_LOW)/span));
    const d=dist[i];
    const sky=d<0?0:1/(1+d/AMBIENT_SKY_SOFT);
    const enclosure=AMBIENT_ENCLOSED+(1-AMBIENT_ENCLOSED)*(open/8);
    const a=Math.min(1,volume*enclosure+AMBIENT_SKY_WEIGHT*sky);
    out[i]=encode(AMBIENT_DEEP+(AMBIENT_OPEN-AMBIENT_DEEP)*a);
  }
  // A wall is lit by the room it faces, not by the rock behind it. Without this
  // every solid cell reads as the deepest possible interior and the walls of the
  // hall come back black — which is the very failure being fixed.
  const deep=encode(AMBIENT_DEEP);
  for(let i=0;i<cells;i++){
    if(!solid[i])continue;
    const x=i%w,y=(i-x)/w;
    let best=0;
    for(let k=0;k<4;k++){
      const nx=x+(k===0?1:k===1?-1:0),ny=y+(k===2?1:k===3?-1:0);
      if(nx<0||ny<0||nx>=w||ny>=h)continue;
      const j=ny*w+nx;
      if(!solid[j]&&out[j]>best)best=out[j];
    }
    out[i]=best||deep;
  }
  return out;
}

// QUANTISE THE OBSERVER'S HEIGHT ONCE, AND BUILD THE SLICE FOR THAT HEIGHT.
//
// The cache key used to round to 0.25 m while the span filter and the
// nearest-span choice below used the raw continuous height. Two positions in one
// bucket could therefore want different slices, and whichever asked second
// silently got the first one's — a latent aliasing bug that is invisible on a
// flat floor and sharp on a stair, where the floor moves every step.
//
// THE BAND STAYS AT A QUARTER METRE, AND THAT IS A DELIBERATE REFUSAL.
//
// Coarsening it is the obvious way to cut rebuilds — one metre takes a climb of
// the main stair from twenty-two slices to eight, 152 ms to 67 ms — but it is not
// free, and the cost is invisible from here. A coarser band moves the height the
// slice is BUILT for away from where the player actually stands, so a different
// span wins in any column holding two, and the baked ambient reads ceiling
// height. Measured: at one metre the hall/studio ambient differential collapsed
// from +2.1% to +0.1%, i.e. the room quietly relit itself. Widening the window
// to match the bucket is worse again — `if(!list.length)continue` means the
// window decides which columns get geometry AT ALL, not merely which span wins,
// and at 1.5 the hall acquired balcony spans it had never had (+2.1% to -0.8%).
//
// So the churn is paid for elsewhere: the expensive part of a slice change was
// never the slice, it was the prop-pack rebuild that rode along with it, and
// that is now gated on the render group actually changing (see main.js).
const HEIGHT_BAND=0.25;
const SPAN_WINDOW=1.0;

export function physicalRenderPlanFor(x,y){
  const here=logicalToPhysical(x,y),group=here.renderGroup||here.layer||'ground';
  const observerZone=zoneAt(x,y);
  // The same predicate prop-visibility asks, so the walls and the skin can
  // never disagree about which side of the envelope you are on.
  const exteriorObserver=isOutdoorZone(observerZone);
  const band=Math.round(here.y/HEIGHT_BAND);
  // The single height this slice is built for. Everything below uses it — key,
  // filter and choice — so the cached slice always matches what it was keyed on.
  // That was the bug: the key rounded while the filter and the nearest-span
  // choice used the raw height, so two positions inside one band could want
  // different slices and whichever asked second silently got the first's.
  const hy=band*HEIGHT_BAND;
  const cacheKey=`${group}:${here.layer}:${band}:${exteriorObserver?'exterior':'enclosed'}`;
  if(plan.physical.renderCache.has(cacheKey))return plan.physical.renderCache.get(cacheKey);
  const w=plan.physical.width,h=plan.physical.height,originX=plan.physical.originX||0,originY=plan.physical.originY||0,solid=new Uint8Array(w*h).fill(1),floor=new Float32Array(w*h),ceil=new Float32Array(w*h),flags=new Uint8Array(w*h),zone=new Uint8Array(w*h),material=new Uint8Array(w*h),rgba=new Uint8Array(w*h*4);
  // Cells where a church contributes its ground to an outdoor slice. Their
  // ceiling is resolved from the yard AFTER the sweep, once the neighbours
  // exist to read it off — see the note below.
  const churchGround=[],yardCeilByRow=new Float32Array(plan.physical.height);
  const visualVoid=exteriorObserver?plan.physical.visualExteriorVoid:plan.physical.visualVoid;
  if(exteriorObserver){
    // From weathered public space the renderer draws the civic block's closed
    // buildings entirely from authored depth-tested meshes. Navigation volumes
    // inside those buildings must not punch generic rock through stepped
    // façades, courtyards or roof gaps. Collision is unchanged and the enclosed
    // slice returns the instant the grey door is crossed.
    solid.fill(0);floor.fill(-8);ceil.fill(24);flags.fill(F.SKY);zone.fill(ZONE.street);material.fill(MATERIAL.wetTarmac);
  }else if(visualVoid)for(let i=0;i<w*h;i++)if(visualVoid[i]){
    // Eight metres below street grade prevents the non-walkable scenery volume
    // acquiring a visible floor before a ray reaches the authored town mesh.
    solid[i]=0;floor[i]=-8;ceil[i]=24;flags[i]=F.SKY;zone[i]=ZONE.street;material[i]=MATERIAL.wetTarmac;
  }
  for(const [key,all] of plan.physical.cells){
    const [px,py]=key.split(',').map(Number);
    // ZONE.church is kept from outside for its GROUND only, and that is worth
    // being precise about. The exterior slice has no solid geometry by design —
    // walls out here are meshes — so a church's wall cells are dropped either
    // way. What must not be dropped is the floor it stands on: without its span
    // the footprint falls through to the fill's −8m and the yard acquires a
    // thirty-metre pit exactly where a building is supposed to be. Its walls
    // arrive when its elevation mesh does; see conservatory_west_elevation for
    // how Ellery does the same thing.
    const sceneSpans=exteriorObserver?all.filter((span)=>
      span.zone===ZONE.street||span.zone===ZONE.civicCourt||span.zone===ZONE.serviceYard
      ||span.zone===ZONE.dock||span.zone===ZONE.church):all;
    if(!sceneSpans.length)continue;
    const hallSpans=sceneSpans.filter((s)=>s.spaceId==='hall');
    const hallEnvelope=here.spaceId==='hall'&&here.layer!=='hall_stair'&&hallSpans.length;
    // The academic crown is a real inserted floor around the old entrance
    // atrium. Its centre has no academic collision cells at all; while walking
    // the gallery, retain the ground-floor atrium span there so the player can
    // see the garden ten metres below instead of a wall of unloaded rock.
    const academicAtriumVoid=here.renderGroup==='academic'
      &&sceneSpans.some((s)=>s.spaceId==='front_atrium')
      &&!sceneSpans.some((s)=>s.renderGroup==='academic');
    // One coherent physical slice: nearby occupied floors plus every stair
    // run, regardless of its logical render group. Group-filtered slices cut
    // stairs in half and produced the horizontal slab / Platform 9¾ effect.
    const landingVisible=(s)=>plan.stairPortals.some((p)=>{
      if(group===p.group0&&s.renderGroup===p.group1)return Math.hypot(px-p.p1[0],py-p.p1[1])<=p.radius;
      if(group===p.group1&&s.renderGroup===p.group0)return Math.hypot(px-p.p0[0],py-p.p0[1])<=p.radius;
      return false;
    });
    let list=hallEnvelope?sceneSpans.filter((s)=>s.spaceId==='hall'||s.spaceId==='front_atrium'):sceneSpans.filter((s)=>(s.flags&F.STAIR)||Math.abs(s.floor-hy)<=SPAN_WINDOW||landingVisible(s)||(here.spaceId==='hall'&&s.spaceId==='front_atrium')||academicAtriumVoid);
    if(!list.length)continue;const localX=px-originX,localY=py-originY;if(localX<0||localY<0||localX>=w||localY>=h)continue;const i=localY*w+localX;solid[i]=0;
    // Hall decks are structural meshes. The sector envelope remains the full
    // air volume so orchestra and both balconies retain reciprocal sightlines.
    if(hallEnvelope){floor[i]=Math.min(...list.map((s)=>s.floor));ceil[i]=Math.max(...list.map((s)=>s.ceil));const hall=list.find((s)=>s.zone===ZONE.hall)||list[0];flags[i]=hall.flags;zone[i]=hall.zone;material[i]=hall.material;}
    else {
      // ON A SPIRAL, PREFER THE COIL YOU ARE STANDING ON.
      //
      // Two helices stacked in one well put two spans in most columns, and
      // nearest-by-height picks the wrong one over a large part of the climb:
      // at the top of the lower coil the upper coil's floor is nearer to the eye
      // than the lower coil's own treads behind you, so the stair you just walked
      // redraws itself five metres up. It reads as a hole, and it reads as a
      // renderer bug rather than as this one line.
      //
      // Deliberately gated on the observer being ON an arc. A blanket owner
      // preference would let the hall's own span hide a stair crossing it, which
      // is the horizontal-slab regression the retention rule above exists to
      // prevent. Nothing in the building is an arc today, so this is inert until
      // a spiral is authored.
      let pool=list;
      if(here.arcId){
        // Matched on the ARC, not the owner: two coils authored as two flights of
        // one compoundStair share an owner id, and the whole point is to tell
        // them apart. The arc is the coil.
        const mine=list.filter((v)=>v.arcId===here.arcId);
        if(mine.length)pool=mine;
      }
      if(here.flightId){
        const mine=list.filter((v)=>v.flightId===here.flightId);
        if(mine.length)pool=mine;
      }
      const s=pool.reduce((best,v)=>Math.abs(v.floor-hy)<Math.abs(best.floor-hy)?v:best,pool[0]);
      floor[i]=s.floor;ceil[i]=s.ceil;flags[i]=s.flags;zone[i]=s.zone;material[i]=s.material;
      // OUTDOORS THE CHURCH IS GROUND AND NOTHING ELSE.
      //
      // Keeping its span stops the footprint falling to the fill's −8m, but
      // keeping its CEILING is what drew the monolith. The exterior slice is
      // filled to 24m; a nave that punches 13m into that is a ceiling step, and
      // r3d draws a ceiling step as geometry hanging from the higher side. Over
      // an open yard that is a black slab in the sky with nothing underneath it,
      // which is exactly what it looked like.
      //
      // So the floor survives the filter and the roof does not. The roof arrives
      // when the elevation mesh does, the way Ellery's already has.
      if(exteriorObserver){
        // The yard bands its ceiling along its DEPTH, so a row is exactly the
        // right granularity to read a church's roofline off.
        if(s.zone===ZONE.dock)yardCeilByRow[localY]=Math.max(yardCeilByRow[localY]||0,s.ceil);
        if(s.zone===ZONE.church){churchGround.push(i);flags[i]=F.SKY;}
      }
    }
  }
  // THE CHURCH'S ROOFLINE IS THE YARD'S, AND ONLY THE YARD KNOWS IT.
  //
  // Outdoors the church is ground and nothing else — its walls and roof are a
  // mesh's job — but the ceiling it carries still has to AGREE with the tarmac
  // around it. Any disagreement is a ceiling step, and r3d draws a ceiling step
  // as geometry hanging from the higher side: over an open yard, a slab in the
  // sky with nothing underneath it.
  //
  // The right value cannot be authored here, because the yard bands its ceiling
  // along its depth so Ellery's elevation has a silhouette (see YARD_ROOFLINE):
  // the correct height is 17.6m beside the concert hall and 9.6m down by the
  // baths. So it is read off the yard's own row. Neighbour search was the first
  // attempt and does not work — a church cell's neighbours are mostly the
  // slice's FILL, which is the flat 24 that caused the step in the first place.
  for(const i of churchGround){
    const cy=(i-(i%w))/w;
    ceil[i]=yardCeilByRow[cy]||24;
  }
  for(let i=0;i<w*h;i++){rgba[i*4]=solid[i]?0:encodeH(floor[i]);rgba[i*4+1]=solid[i]?0:encodeH(ceil[i]);rgba[i*4+2]=solid[i]?F.SOLID:flags[i];rgba[i*4+3]=solid[i]?0:zone[i];}
  const ambient=bakeAmbientField({w,h,solid,flags,floor,ceil});
  const out={rgba,material,ambient,solid,floor,ceil,flags,zone,w,h,originX,originY,group,key:cacheKey};plan.physical.renderCache.set(cacheKey,out);return out;
}

// Door → key. Kept out of the grid (a byte has no room) in a sparse map that
// the level data fills.
const doorKeys = new Map();
export function setDoorKey(x, y, keyId, { authored = true, open = false } = {}) {
  const x0 = authored ? toRuntimeCoord(x, { center: false }) : Math.floor(x);
  const y0 = authored ? toRuntimeCoord(y, { center: false }) : Math.floor(y);
  const sx=x0+(authored?Math.floor(PLAN_SCALE/2):0),sy=y0+(authored?Math.floor(PLAN_SCALE/2):0);
  const distance=(v)=>Math.hypot(sx-(v.minX+v.maxX)/2,sy-(v.minY+v.maxY)/2);
  const candidates=plan.doorVolumes.filter(v=>sx>=v.minX&&sx<=v.maxX&&sy>=v.minY&&sy<=v.maxY&&v.mask!==F.BRICKED).sort((a,b)=>distance(a)-distance(b));
  const volume=candidates[0];
  if(volume){
    let portal=null;
    for(let y1=volume.minY;y1<=volume.maxY;y1++)for(let x1=volume.minX;x1<=volume.maxX;x1++){
      if(!inside(x1,y1))continue;const i=idx(x1,y1);
      if(!plan.solid[i]&&(plan.flags[i]&F.DOOR)&&!(plan.flags[i]&F.BRICKED)){
        if(keyId)doorKeys.set(`${x1},${y1}`,keyId);else doorKeys.delete(`${x1},${y1}`);
        portal=portal||doorCellToPortal.get(`${x1},${y1}`)||null;
      }
    }
    if(portal){
      portal.keyId=keyId||null;
      for(const c of portal.cells){if(keyId)doorKeys.set(`${c.x},${c.y}`,keyId);else doorKeys.delete(`${c.x},${c.y}`);}
      setPortalOpen(portal,open);
    }
    return;
  }
  const radius=authored?PLAN_SCALE*2:1;
  for(let yy=-radius;yy<=radius;yy++)for(let xx=-radius;xx<=radius;xx++){
    const x1=x0+xx,y1=y0+yy;if(!inside(x1,y1))continue;const i=idx(x1,y1);
    if(!plan.solid[i]&&(plan.flags[i]&F.DOOR)&&!(plan.flags[i]&F.BRICKED)){
      if(keyId)doorKeys.set(`${x1},${y1}`,keyId);else doorKeys.delete(`${x1},${y1}`);
      const portal=doorCellToPortal.get(`${x1},${y1}`);if(portal){portal.keyId=keyId||null;setPortalOpen(portal,open);}
    }
  }
}
export function doorKeyAt(x, y) { return doorKeys.get(`${Math.floor(x)},${Math.floor(y)}`) || null; }
export function doorAt(x,y){return doorCellToPortal.get(`${Math.floor(x)},${Math.floor(y)}`)||null;}
export function doorNear(px,py,facing=[0,-1],maxCells=5){
  let best=null;
  for(const portal of doorPortals){
    const dx=portal.cx-px,dy=portal.cy-py,d=Math.hypot(dx,dy);if(d>maxCells)continue;
    const dot=d>.001?(dx*facing[0]+dy*facing[1])/d:1;if(dot<.12)continue;
    if(!best||d<best.distance)best={portal,distance:d};
  }
  return best;
}
export function interactDoor(px,py,facing,keys){
  const hit=doorNear(px,py,facing);if(!hit)return null;
  const {portal}=hit;
  const side=portalSide(portal,px,py);
  if(portal.definition?.access==='exit-only'&&side!==(portal.definition.insideSide===-1?-1:1)){
    return{ok:false,why:'exit-only',id:portal.id,archetype:portal.definition?.archetype||null};
  }
  if(portal.runtime.state===DOOR_STATE.OPENING){
    return{ok:true,opened:false,opening:true,id:portal.id,keyId:portal.keyId,archetype:portal.definition?.archetype||null,construction:portal.definition?.construction||'steel'};
  }
  const opening=portal.runtime.state===DOOR_STATE.CLOSED||portal.runtime.state===DOOR_STATE.CLOSING;
  if(opening&&portal.keyId&&!(keys&&keys.has(portal.keyId)))return{ok:false,why:'locked',id:portal.id,keyId:portal.keyId,archetype:portal.definition?.archetype||null};
  const along=portal.widthAxis==='x'?py:px,plane=portal.widthAxis==='x'?portal.cy:portal.cx;
  portal.autoCloseSide=Math.sign(along-plane)||-1;
  if(opening){
    const opened=beginDoorOpen(portal.runtime);
    if(portal.definition?.closer!=='none')portal.runtime.closerArmed=true;
    return{ok:true,opened,id:portal.id,keyId:portal.keyId,archetype:portal.definition?.archetype||null,construction:portal.definition?.construction||'steel'};
  }
  // Only the stable, fully-open endpoint accepts a deliberate close. Repeated
  // presses during the opening animation are handled above and can never make
  // a paired leaf reverse into the player.
  if(portal.runtime.state!==DOOR_STATE.OPEN)return{ok:true,closed:false,id:portal.id,keyId:portal.keyId,archetype:portal.definition?.archetype||null,construction:portal.definition?.construction||'steel'};
  const removedWedge=portal.runtime.wedge;
  const closed=beginDoorClose(portal.runtime,{removeWedge:true});
  if(portal.definition?.closer!=='none')portal.runtime.closerArmed=true;
  return{ok:true,closed,removedWedge,id:portal.id,keyId:portal.keyId,archetype:portal.definition?.archetype||null,construction:portal.definition?.construction||'steel'};
}
export function tickDoors(dt,{playerX=Infinity,playerY=Infinity}={}){
  const events=doorTickEvents;events.length=0;
  for(const portal of doorPortals){
    const sweepOccupied=pointInDoorSweep(portal,playerX,playerY);
    const along=portal.widthAxis==='x'?playerY:playerX,plane=portal.widthAxis==='x'?portal.cy:portal.cx;
    const side=Math.sign(along-plane),cleared=portal.autoCloseSide&&side&&side!==portal.autoCloseSide&&Math.abs(along-plane)>=2.2;
    if(portal.runtime.state===DOOR_STATE.OPEN&&portal.definition?.closer!=='none'&&portal.runtime.closerArmed&&!portal.runtime.wedge&&cleared){
      requestCloser(portal.runtime);beginDoorClose(portal.runtime,{removeWedge:false});
      events.push({type:'closing',id:portal.id,portal});
    }
    const beforePassable=portal.open;
    const transition=advanceDoor(portal.runtime,portal.definition||{openSeconds:.6,closeSeconds:.6},dt,{sweepOccupied});
    const passable=!doorBlocksPassage(portal.runtime);
    if(passable!==beforePassable)setPortalPassable(portal,passable);
    if(transition){
      if(transition===DOOR_STATE.OPEN)events.push({type:'opened',id:portal.id,portal});
      else if(transition===DOOR_STATE.CLOSED){portal.autoCloseSide=0;events.push({type:'closed',id:portal.id,portal});}
    }
  }
  return events;
}
// Compatibility for older callers: closers are now advanced by tickDoors.
export function closePassedDoors(){return[];}
export function setDoorOpen(id,open){
  const portal=doorPortals.find((p)=>p.id===id);if(!portal)return false;
  portal.autoCloseSide=0;return setPortalOpen(portal,open);
}
export function setAllDoorsOpen(open){for(const portal of doorPortals)setPortalOpen(portal,open,{preserveWedge:false});return saveDoorState();}
export function runDoorCloserCycles(){
  const started=[];
  for(const portal of doorPortals){
    if(portal.definition?.closer==='none')continue;
    portal.runtime.wedge=false;portal.runtime.closerArmed=true;setPortalOpen(portal,true,{preserveWedge:false});beginDoorClose(portal.runtime,{removeWedge:false});started.push(portal.id);
  }
  return started;
}
export function loadDoorState(saved={}){
  const normalized=normalizeDoorSave(saved),legacyOpen=new Set(normalized.legacyOpen);
  for(const portal of doorPortals){
    const aliases=new Set([portal.id,portal.legacyId,...(portal.definition?.legacyIds||[])]);
    const endpoint=normalized.states[portal.id]||[...aliases].map((id)=>normalized.states[id]).find(Boolean);
    portal.runtime=endpoint?normalizeDoorEndpoint(endpoint,portal.definition):freshDoorRuntime(portal.definition||{initialState:legacyOpen.has(portal.id)?'open':'closed'});
    if(!endpoint&&[...aliases].some((id)=>legacyOpen.has(id)))portal.runtime=normalizeDoorEndpoint({state:DOOR_STATE.OPEN,wedge:portal.definition?.wedged,closerArmed:portal.definition?.closerArmed},portal.definition);
    setPortalPassable(portal,!doorBlocksPassage(portal.runtime));
  }
}
export function saveDoorState(){return{schema:2,states:Object.fromEntries(doorPortals.map((portal)=>[portal.id,stableDoorEndpoint(portal.runtime)]))};}
export function resetDoors(){for(const portal of doorPortals){portal.runtime=freshDoorRuntime(portal.definition||{initialState:portal.keyId?'closed':'open'});portal.autoCloseSide=0;setPortalPassable(portal,!doorBlocksPassage(portal.runtime));}return saveDoorState();}
export function doorState(){return doorPortals.map((portal)=>({
  id:portal.id,legacyId:portal.legacyId,archetype:portal.definition?.archetype||'legacy',state:portal.runtime.state,openFraction:portal.runtime.openFraction,
  keyId:portal.keyId,open:portal.open,wedge:portal.runtime.wedge,closer:portal.definition?.closer||'none',closerArmed:portal.runtime.closerArmed,
  acousticLossDb:portal.definition?.acousticLossDb||0,construction:portal.definition?.construction||'legacy',leafCount:portal.definition?.leafCount||1,
  activeLeaves:[...(portal.activeLeaves||[0])],aperture:{...(portal.aperture||{width:portal.cells.length/PLAN_SCALE,height:3.4})},leaf:{...(portal.leaf||{width:1,height:2.1,depth:.05})},
  hinge:portal.definition?.hinge||'left',swing:portal.definition?.swing||'escape',head:portal.definition?.head||'masonry-infill',
  mesh:portal.definition?.mesh||'door_leaf_service',frameMesh:portal.definition?.frameMesh||'door_frame_single',headMesh:portal.definition?.headMesh||'door_head_infill',
  renderGroups:[...(portal.definition?.renderGroups||[])],
  access:portal.definition?.access||'both',insideSide:portal.definition?.insideSide===-1?-1:1,
  cx:portal.cx,cy:portal.cy,widthAxis:portal.widthAxis,cells:portal.cells.map((c)=>({...c})),
}));}
export function forEachDoor(visitor){for(const portal of doorPortals)visitor(portal);return doorPortals.length;}

export function doorAcousticLossBetween(source,listener){
  if(!source||!listener)return 0;
  const distance=Math.hypot(listener.x-source.x,listener.y-source.y),steps=Math.max(2,Math.ceil(distance/.5));
  const crossed=new Set();let loss=0;
  for(let i=1;i<steps;i++){
    const t=i/steps,portal=doorAt(source.x+(listener.x-source.x)*t,source.y+(listener.y-source.y)*t);
    if(!portal||portal.open||crossed.has(portal.id))continue;
    crossed.add(portal.id);loss+=portal.definition?.acousticLossDb||0;
  }
  return loss;
}

export function sealedDoorways(){return plan.doorVolumes.filter((volume)=>volume.mask===F.BRICKED).map((volume)=>({id:`sealed:${Math.round(volume.cx)},${Math.round(volume.cy)}`,cx:volume.cx,cy:volume.cy,widthAxis:volume.widthAxis}));}

// A door stops being a door.
//
// The building already knows how to draw a doorway that is no longer one: an
// `'x'` glyph compiles to a BRICKED volume (see authorDoorThresholds), which
// `sealedDoorways()` hands out as a `door_sealed_scar` — jamb scars, a lintel,
// and masonry infill. Retiring a live door is therefore not a new kind of thing,
// it is the same thing arrived at later: become that volume, and stop being a
// portal.
//
// Dropping the portal is what makes it honest everywhere else at once. The leaf,
// frame and head are emitted from `doorState()`/`forEachDoor`, `doorNear` stops
// offering to open a wall, `saveDoorState` stops writing it, the acoustic march
// stops counting a leaf that is now nine inches of brick, and the 2D map stops
// drawing a door on it. None of those call sites need to know this happened.
//
// Callers own persistence: there is no room in the door save schema for this
// (normalizeDoorSave whitelists state/wedge/closerArmed), so whoever retires a
// door records it as story state and replays it on load.
export function retireDoor(id){
  const at=doorPortals.findIndex((portal)=>portal.id===id||portal.legacyId===id);
  if(at<0) return false;
  const portal=doorPortals[at];

  // The volume becomes masonry, exactly as the compiler would have built it from
  // an 'x'. `rgba` matters as much as `flags` here: it is the texture the
  // raymarcher reads, and the compile-time path never has to write it because
  // encoding happens afterwards.
  if(portal.volume) portal.volume.mask=F.BRICKED;
  for(const cell of portal.cells){
    if(!inside(cell.x,cell.y)) continue;
    const i=idx(cell.x,cell.y);
    plan.solid[i]=1;
    plan.flags[i]=F.SOLID|F.BRICKED;
    plan.material[i]=MATERIAL.serviceConcrete;
    plan.rgba[i*4+2]=F.SOLID;
  }

  doorPortals.splice(at,1);
  for(const [key,value] of [...doorCellToPortal.entries()]) if(value===portal) doorCellToPortal.delete(key);
  buildPhysicalSpans();
  return true;
}

// ── mutation support (M4.1 writes through these) ────────────────────────────
export function setSolid(x, y, solid) {
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  plan.solid[i] = solid ? 1 : 0;
  if (solid) plan.material[i] = MATERIAL.none;
  else if (!plan.material[i]) plan.material[i] = materialForZone(plan.zone[i]);
  if(!solid&&plan.physicalX[i]===PHYSICAL_VOID){for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;const ni=idx(nx,ny);if(plan.solid[ni]||plan.physicalX[ni]===PHYSICAL_VOID)continue;plan.physicalX[i]=plan.physicalX[ni]-dx;plan.physicalY[i]=plan.physicalY[ni]-dy;plan.layer[i]=plan.layer[ni];plan.space[i]=plan.space[ni];plan.renderGroup[i]=plan.renderGroup[ni];plan.floor[i]=plan.floor[ni];plan.ceil[i]=plan.ceil[ni];plan.zone[i]=ZONE.none;break;}}
  plan.rgba[i * 4 + 2] = solid ? F.SOLID : plan.flags[i];
  if (!solid) {
    plan.rgba[i * 4 + 0] = encodeH(plan.floor[i]);
    plan.rgba[i * 4 + 1] = encodeH(plan.ceil[i]);
    plan.rgba[i * 4 + 3] = plan.zone[i];
  }
  buildPhysicalSpans();
  return true;
}

export function setSpawn(x, y, { authored = true } = {}) {
  plan.spawn = authored ? toRuntimePoint({ x, y }) : { x: Math.round(x), y: Math.round(y) };
}
export function spawn() { return plan.spawn; }

// The building's own front door, from the inside — the cell a plan considers its
// hearth. It is `spawn` in every plan that starts you indoors, and it stops
// being spawn the moment a plan starts you outside of itself. Mutation anchors
// and the escape run want this one, not wherever the camera first opened.
export function setHomeAnchor(x, y, { authored = true } = {}) {
  plan.homeAnchor = authored ? toRuntimePoint({ x, y }) : { x: Math.round(x), y: Math.round(y) };
}
export function homeAnchor() { return plan.homeAnchor || plan.spawn; }

export { F, ZONE, MATERIAL, EYE, STEP_UP, HEADROOM, PLAN_SCALE };
