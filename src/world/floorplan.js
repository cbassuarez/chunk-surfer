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
  EYE, STEP_UP, HEADROOM, PLAN_SCALE
} from '../data/floorplan/legend.js';

export const H_MIN = -8;
export const H_MAX = 24;
const H_RANGE = H_MAX - H_MIN;

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
  layer: null, space: null, renderGroup: null,
  owner: null, ownershipConflicts: [],
  stairPortals: [],
  doorVolumes: [],
  physical: null,
  spawn: { x: 0, y: 0 },
  loaded: false,
};
let doorPortals=[];
const doorCellToPortal=new Map();

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
export function compile(levels, { width, height, widenCorridors = false, connectors = [] } = {}) {
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
  plan.physicalX = new Int32Array(w * h).fill(-1);
  plan.physicalY = new Int32Array(w * h).fill(-1);
  plan.physicalReplace = new Uint8Array(w * h);
  plan.layer = new Array(w * h).fill('');
  plan.space = new Array(w * h).fill('');
  plan.renderGroup = new Array(w * h).fill('');
  plan.owner = new Array(w * h).fill('');
  plan.ownershipConflicts = [];
  plan.stairPortals = [];
  plan.doorVolumes = [];

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
          });
        }
      }
    }
  }

  // Stairs: a run of STAIR cells given an explicit start and end height. The
  // legend cannot know which way a stair climbs, so the level data says.
  for (const level of levels) {
    for (const s of level.stairs || []) rampStair(s);
  }

  if (widenCorridors) widenCorridorRuns();
  widenDoorThresholds();
  initDoorPortals();
  inheritCorridorMaterials();

  // A logical seam is permitted only at a physically continuous landing.
  // It may change the save/pathfinding address, never the player's position or
  // height. Bad level data now fails compilation instead of becoming a
  // one-keypress teleport in the game.
  connectorMap.clear();
  for(const c of connectors) registerConnector(c);

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

// Door glyphs are authored as a centre mark, not as their final aperture. A
// one-metre opening becomes a blind slot in first person, so every threshold is
// expanded along its wall to at least three authored metres (six runtime
// cells). The centre cell's height, material and lock flag remain authoritative.
function widenDoorThresholds() {
  // Discover from a snapshot. Newly carved cells must never become new seeds;
  // doing so dilates a door repeatedly until it becomes a building-wide wall.
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
    const cx=Math.round((minX+maxX)/2),cy=Math.round((minY+maxY)/2),src=idx(cx,cy);
    const openLR=!isSolid(minX-1,cy)&&!isSolid(maxX+1,cy),openUD=!isSolid(cx,minY-1)&&!isSolid(cx,maxY+1);
    const widthAxis=(maxX-minX)>(maxY-minY)?'x':(maxY-minY)>(maxX-minX)?'y':openLR&&!openUD?'y':'x';
    const passageAxis=widthAxis==='x'?'y':'x',width=Math.max(3*PLAN_SCALE,widthAxis==='x'?maxX-minX+1:maxY-minY+1),depth=3*PLAN_SCALE;
    const widthStart=(widthAxis==='x'?cx:cy)-Math.floor(width/2),depthStart=(passageAxis==='x'?cx:cy)-Math.floor(depth/2);
    const volume=widthAxis==='x'
      ?{minX:widthStart,maxX:widthStart+width-1,minY:depthStart,maxY:depthStart+depth-1,mask,widthAxis,cx,cy}
      :{minX:depthStart,maxX:depthStart+depth-1,minY:widthStart,maxY:widthStart+width-1,mask,widthAxis,cx,cy};
    plan.doorVolumes.push(volume);
    for(let wd=0;wd<width;wd++)for(let dd=0;dd<depth;dd++){
      const nx=widthAxis==='x'?widthStart+wd:depthStart+dd,ny=widthAxis==='y'?widthStart+wd:depthStart+dd;if(!inside(nx,ny))continue;
      const ni=idx(nx,ny);
      // Existing room/corridor air keeps its own floor, ceiling, material and
      // zone. Only masonry inside the portal volume is removed. Repainting all
      // 3 m as a door made a low tunnel/header protrude into both rooms.
      if(!plan.solid[ni])continue;
      plan.solid[ni]=0;plan.floor[ni]=plan.floor[src];plan.ceil[ni]=Math.max(plan.ceil[src],plan.floor[src]+3.0);
      plan.flags[ni]=plan.flags[src];plan.zone[ni]=plan.zone[src];plan.material[ni]=plan.material[src];
      plan.physicalX[ni]=plan.physicalX[src]+(nx-cx);plan.physicalY[ni]=plan.physicalY[src]+(ny-cy);
      plan.physicalReplace[ni]=plan.physicalReplace[src];
      plan.layer[ni]=plan.layer[src];plan.space[ni]=plan.space[src];plan.renderGroup[ni]=plan.renderGroup[src];
    }
  }
}

function initDoorPortals(){
  doorPortals=[];doorCellToPortal.clear();
  for(const volume of plan.doorVolumes){
    if(volume.mask===F.BRICKED)continue;
    const candidates=[];
    for(let y=volume.minY;y<=volume.maxY;y++)for(let x=volume.minX;x<=volume.maxX;x++){
      if(!inside(x,y))continue;const i=idx(x,y);
      // The leaf owns the whole widened cross-section, including cells that
      // were already corridor air before dilation. Restricting this to the
      // original DOOR glyph left fake walkable slots beside the visible door.
      if(!plan.solid[i]&&!(plan.flags[i]&F.BRICKED))candidates.push({x,y});
    }
    // A portal volume is three metres deep so thresholds never flash or
    // teleport. The actual leaf is one half-metre plane through its centre,
    // not a six-cell-deep block of door material.
    const centerX=Math.round(volume.cx),centerY=Math.round(volume.cy);
    const cells=candidates.filter((c)=>volume.widthAxis==='x'?c.y===centerY:c.x===centerX);
    if(!cells.length)continue;
    const cx=cells.reduce((n,c)=>n+c.x,0)/cells.length,cy=cells.reduce((n,c)=>n+c.y,0)/cells.length;
    const portal={id:`${Math.round(cx)},${Math.round(cy)}`,cells,cx,cy,widthAxis:volume.widthAxis,keyId:null,open:true,autoCloseSide:0};
    doorPortals.push(portal);for(const c of cells)doorCellToPortal.set(`${c.x},${c.y}`,portal);
  }
}

function setPortalOpen(portal,open){
  if(!portal)return false;portal.open=!!open;
  for(const {x,y} of portal.cells){const i=idx(x,y);plan.flags[i]=portal.open?(plan.flags[i]&~F.CLOSED):(plan.flags[i]|F.CLOSED);if(plan.rgba)plan.rgba[i*4+2]=plan.flags[i];}
  buildPhysicalSpans();
  return true;
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
  if(meta){plan.physicalX[i]=meta.physicalX;plan.physicalY[i]=meta.physicalY;plan.physicalReplace[i]=meta.physicalReplace?1:0;plan.layer[i]=meta.layer;plan.space[i]=meta.space;plan.renderGroup[i]=meta.renderGroup;}
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
function rampStair({ from, to, fromH, toH, width = 1, ceil = null, head = 2.6, zone = null, material = null }) {
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
      if(plan.solid[i]||plan.physicalX[i]<0)continue;
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

// A step is a body moving, not a camera: it needs somewhere to stand, room for
// its head, and a riser it can take without thinking about it.
export function canStep(fromX, fromY, toX, toY, { keys } = {}) {
  const a = cellAt(fromX, fromY);
  const b = cellAt(toX, toY);
  if (!b) return { ok: false, why: 'wall' };
  if (b.flags & F.BRICKED) return { ok: false, why: 'bricked' };
  if (b.flags & F.DOOR) {
    const keyId = doorKeyAt(toX, toY);
    if(b.flags&F.CLOSED){
      if(keyId && !(keys && keys.has(keyId))) return { ok: false, why: 'locked', keyId };
      return {ok:false,why:'closed',keyId:keyId||null};
    }
  }
  if (b.ceil - b.floor < HEADROOM) return { ok: false, why: 'headroom' };
  if (a && Math.abs(b.floor - a.floor) > STEP_UP) return { ok: false, why: 'too high' };
  const redirect=connectorMap.get(`${Math.floor(toX)},${Math.floor(toY)}`)||null;
  return { ok: true, floor: b.floor, ...(redirect?{redirect:{...redirect}}:{}) };
}

// Logical cells stay unique for gameplay, while their physical embedding may
// stack several levels over the same X/Z footprint.
const connectorMap=new Map();
export function connectorDestination(x,y){const p=connectorMap.get(`${Math.floor(x)},${Math.floor(y)}`);return p?{...p}:null;}
function registerConnector({from,to,bidirectional=true}){
  const candidates=(p)=>{
    const x0=toRuntimeCoord(p.x,{center:false}),y0=toRuntimeCoord(p.y,{center:false}),out=[];
    for(let oy=-1;oy<=PLAN_SCALE;oy++)for(let ox=-1;ox<=PLAN_SCALE;ox++){
      const x=x0+ox,y=y0+oy,c=cellAt(x,y);if(!c)continue;
      const q=logicalToPhysical(x,y);out.push({x,y,px:q.x,pz:q.z,h:c.floor});
    }
    return out;
  };
  let best=null;
  for(const a of candidates(from))for(const b of candidates(to)){
    const planar=Math.hypot(a.px-b.px,a.pz-b.pz),vertical=Math.abs(a.h-b.h),score=planar*4+vertical;
    if(!best||score<best.score)best={a,b,planar,vertical,score};
  }
  if(!best||best.planar>1.01||best.vertical>STEP_UP+1e-6){
    throw new Error(`floorplan: discontinuous level seam ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
  }
  const {a,b}=best;
  connectorMap.set(`${a.x},${a.y}`,{x:b.x,y:b.y});
  if(bidirectional)connectorMap.set(`${b.x},${b.y}`,{x:a.x,y:a.y});
}

function buildPhysicalSpans(){
  let maxX=0,maxY=0;const cells=new Map();
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    const i=idx(x,y);if(plan.solid[i]||plan.physicalX[i]<0)continue;
    const px=plan.physicalX[i],py=plan.physicalY[i],key=`${px},${py}`;maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push({floor:plan.floor[i],ceil:plan.ceil[i],flags:plan.flags[i],zone:plan.zone[i],material:plan.material[i],logicalX:x,logicalY:y,layer:plan.layer[i],spaceId:plan.space[i],renderGroup:plan.renderGroup[i],owner:plan.owner[i],physicalReplace:!!plan.physicalReplace[i]});
  }
  let maxSpans=0,overlaps=[];
  const intersects=(a,b)=>a.floor<b.ceil-.01&&b.floor<a.ceil-.01;
  for(const [key,list] of cells){
    // A declared structural flight replaces the hall/balcony air it occupies.
    // This removes duplicate representations of one real volume; undeclared
    // intersections remain compiler errors reported through `overlaps`.
    const ordered=[...list].sort((a,b)=>(b.physicalReplace?1:0)-(a.physicalReplace?1:0)||a.floor-b.floor),resolved=[];
    for(const candidate of ordered){
      const hit=resolved.findIndex((span)=>intersects(candidate,span));
      if(hit<0){resolved.push(candidate);continue;}
      if(candidate.physicalReplace&&!resolved[hit].physicalReplace){resolved.splice(hit,1,candidate);continue;}
      if(resolved[hit].physicalReplace&&!candidate.physicalReplace)continue;
      overlaps.push({key,a:resolved[hit],b:candidate});
    }
    resolved.sort((a,b)=>a.floor-b.floor);cells.set(key,resolved);maxSpans=Math.max(maxSpans,resolved.length);
  }
  plan.physical={width:maxX+1,height:maxY+1,maxSpans,cells,overlaps,renderCache:new Map()};
}

export function logicalToPhysical(x,y){
  const cx=Math.floor(x),cy=Math.floor(y);if(!inside(cx,cy))return{x,y,z:y,layer:'',spaceId:'',renderGroup:''};
  const i=idx(cx,cy),ox=x-cx,oy=y-cy;
  return{x:plan.physicalX[i]>=0?plan.physicalX[i]+ox:x,z:plan.physicalY[i]>=0?plan.physicalY[i]+oy:y,y:plan.floor[i],layer:plan.layer[i],spaceId:plan.space[i],renderGroup:plan.renderGroup[i]};
}

export function physicalSpanData(){return plan.physical;}
export function ownershipData(){return{owner:plan.owner,conflicts:plan.ownershipConflicts};}

export function logicalAtPhysical(x,z,{group=null,floor=null}={}){
  const list=plan.physical?.cells.get(`${Math.floor(x)},${Math.floor(z)}`)||[];let choices=group?list.filter((s)=>s.renderGroup===group):list;if(!choices.length)choices=list;if(!choices.length)return null;
  choices.sort((a,b)=>floor==null?0:Math.abs(a.floor-floor)-Math.abs(b.floor-floor));return{x:choices[0].logicalX+(x-Math.floor(x)),y:choices[0].logicalY+(z-Math.floor(z)),...choices[0]};
}

export function physicalRenderPlanFor(x,y){
  const here=logicalToPhysical(x,y),group=here.renderGroup||here.layer||'ground',heightBand=Math.round(here.y*4)/4,cacheKey=`${group}:${here.layer}:${heightBand}`;
  if(plan.physical.renderCache.has(cacheKey))return plan.physical.renderCache.get(cacheKey);
  const w=plan.physical.width,h=plan.physical.height,solid=new Uint8Array(w*h).fill(1),floor=new Float32Array(w*h),ceil=new Float32Array(w*h),flags=new Uint8Array(w*h),zone=new Uint8Array(w*h),material=new Uint8Array(w*h),rgba=new Uint8Array(w*h*4);
  for(const [key,all] of plan.physical.cells){
    const [px,py]=key.split(',').map(Number);
    const hallSpans=all.filter((s)=>s.spaceId==='hall');
    const hallEnvelope=here.spaceId==='hall'&&here.layer!=='hall_stair'&&hallSpans.length;
    // One coherent physical slice: nearby occupied floors plus every stair
    // run, regardless of its logical render group. Group-filtered slices cut
    // stairs in half and produced the horizontal slab / Platform 9¾ effect.
    const landingVisible=(s)=>plan.stairPortals.some((p)=>{
      if(group===p.group0&&s.renderGroup===p.group1)return Math.hypot(px-p.p1[0],py-p.p1[1])<=p.radius;
      if(group===p.group1&&s.renderGroup===p.group0)return Math.hypot(px-p.p0[0],py-p.p0[1])<=p.radius;
      return false;
    });
    let list=hallEnvelope?all.filter((s)=>s.spaceId==='hall'||s.spaceId==='front_atrium'):all.filter((s)=>(s.flags&F.STAIR)||Math.abs(s.floor-here.y)<=1.0||landingVisible(s)||(here.spaceId==='hall'&&s.spaceId==='front_atrium'));
    if(!list.length)continue;const i=py*w+px;solid[i]=0;
    // Hall decks are structural meshes. The sector envelope remains the full
    // air volume so orchestra and both balconies retain reciprocal sightlines.
    if(hallEnvelope){floor[i]=Math.min(...list.map((s)=>s.floor));ceil[i]=Math.max(...list.map((s)=>s.ceil));const hall=list.find((s)=>s.zone===ZONE.hall)||list[0];flags[i]=hall.flags;zone[i]=hall.zone;material[i]=hall.material;}
    else {const s=list.reduce((best,v)=>Math.abs(v.floor-here.y)<Math.abs(best.floor-here.y)?v:best,list[0]);floor[i]=s.floor;ceil[i]=s.ceil;flags[i]=s.flags;zone[i]=s.zone;material[i]=s.material;}
  }
  for(let i=0;i<w*h;i++){rgba[i*4]=solid[i]?0:encodeH(floor[i]);rgba[i*4+1]=solid[i]?0:encodeH(ceil[i]);rgba[i*4+2]=solid[i]?F.SOLID:flags[i];rgba[i*4+3]=solid[i]?0:zone[i];}
  const out={rgba,material,solid,floor,ceil,flags,zone,w,h,group,key:cacheKey};plan.physical.renderCache.set(cacheKey,out);return out;
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
    if(portal.open)continue;
    const dx=portal.cx-px,dy=portal.cy-py,d=Math.hypot(dx,dy);if(d>maxCells)continue;
    const dot=d>.001?(dx*facing[0]+dy*facing[1])/d:1;if(dot<.12)continue;
    if(!best||d<best.distance)best={portal,distance:d};
  }
  return best;
}
export function interactDoor(px,py,facing,keys){
  const hit=doorNear(px,py,facing);if(!hit)return null;
  const {portal}=hit;
  if(portal.open)return null;
  if(portal.keyId&&!(keys&&keys.has(portal.keyId)))return{ok:false,why:'locked',id:portal.id,keyId:portal.keyId};
  setPortalOpen(portal,true);
  const along=portal.widthAxis==='x'?py:px,plane=portal.widthAxis==='x'?portal.cy:portal.cx;
  portal.autoCloseSide=Math.sign(along-plane)||-1;
  return{ok:true,opened:true,id:portal.id,keyId:portal.keyId};
}
export function closePassedDoors(px,py){
  const closed=[];
  for(const portal of doorPortals){
    if(!portal.open||!portal.autoCloseSide)continue;
    const along=portal.widthAxis==='x'?py:px,plane=portal.widthAxis==='x'?portal.cy:portal.cx;
    const side=Math.sign(along-plane);
    if(side&&side!==portal.autoCloseSide&&Math.abs(along-plane)>=1.1){
      setPortalOpen(portal,false);portal.autoCloseSide=0;closed.push(portal.id);
    }
  }
  return closed;
}
export function setDoorOpen(id,open){
  const portal=doorPortals.find((p)=>p.id===id);if(!portal)return false;
  portal.autoCloseSide=0;return setPortalOpen(portal,open);
}
export function loadDoorState(saved={}){const opened=new Set(saved.open||[]);for(const p of doorPortals)if(opened.has(p.id))setPortalOpen(p,true);}
export function saveDoorState(){return{open:doorPortals.filter((p)=>p.open).map((p)=>p.id)};}
export function resetDoors(){for(const p of doorPortals)setPortalOpen(p,!p.keyId);return saveDoorState();}
export function doorState(){return doorPortals.map((p)=>({id:p.id,keyId:p.keyId,open:p.open,cx:p.cx,cy:p.cy,widthAxis:p.widthAxis,cells:p.cells.map((c)=>({...c}))}));}

// ── mutation support (M4.1 writes through these) ────────────────────────────
export function setSolid(x, y, solid) {
  if (!inside(x, y)) return false;
  const i = idx(x, y);
  plan.solid[i] = solid ? 1 : 0;
  if (solid) plan.material[i] = MATERIAL.none;
  else if (!plan.material[i]) plan.material[i] = materialForZone(plan.zone[i]);
  if(!solid&&plan.physicalX[i]<0){for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;const ni=idx(nx,ny);if(plan.solid[ni]||plan.physicalX[ni]<0)continue;plan.physicalX[i]=plan.physicalX[ni]-dx;plan.physicalY[i]=plan.physicalY[ni]-dy;plan.layer[i]=plan.layer[ni];plan.space[i]=plan.space[ni];plan.renderGroup[i]=plan.renderGroup[ni];plan.floor[i]=plan.floor[ni];plan.ceil[i]=plan.ceil[ni];plan.zone[i]=ZONE.none;break;}}
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

export { F, ZONE, MATERIAL, EYE, STEP_UP, HEADROOM, PLAN_SCALE };
