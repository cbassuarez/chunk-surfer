import { CELL, F, HEADROOM, STEP_UP, ZONE, isOutdoorZone } from '../data/floorplan/legend.js';
import { DOOR_BY_ID, doorDefinitionWithArchetype } from '../data/conservatory-doors.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../data/conservatory-props.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { resolveLightingContext } from '../data/conservatory-lights.js';
import { sourceFalseReturnDoorFraction, sourceFalseReturnDoorAllowsWidth } from './source-false-return.js';
import { MAIN_STAIR_GEOMETRY, mainStairBuiltLandings } from '../data/main-stair-geometry.js';

const COUNTED = new Set(['practice-west-1', 'practice-east-1', 'practice-west-2', 'practice-east-2', 'practice-west-3']);
const FLOOR = 4.8, RADIUS = .22;
// A copied masonry doorway occupies two half-metre cells. The retained frame
// sits on a quarter-cell centre, so Source support must include that full
// wall depth or a body corner catches a gap before reaching the leaf plane.
const SOURCE_THROAT_HALF_DEPTH = 1.05;
const CROP = Object.freeze({ minX: 50.5, maxX: 102, minZ: 41.5, maxZ: 77.5 });
const WING = Object.freeze({ minX: 51, maxX: 77, minZ: 42.5, maxZ: 76.5 });
const BRIDGE = Object.freeze({ minX: 76.5, maxX: 101, minZ: 43.5, maxZ: 48.5 });
const CHAPEL_APPROACH = Object.freeze({ minX: 91.5, maxX: 94.5, minZ: 47.5, maxZ: 49.5 });
const inBounds = (x, z, b) => x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
const retained = (x, z) => inBounds(x, z, WING) || inBounds(x, z, BRIDGE) || inBounds(x, z, CHAPEL_APPROACH);
const clone = value => {
  if (ArrayBuffer.isView(value)) return value.slice();
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
};
const decodeHeight = byte => byte / 255 * 32 - 8;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

function roomForDoor(id) {
  if (id === 'practice-side') return { minX: 64, maxX: 76, minZ: 54.5, maxZ: 60.5 };
  const match = /^practice-(west|east)-(\d)$/.exec(id);
  if (!match) return null;
  const minZ = 47.5 + (Number(match[2]) - 1) * 7;
  return { minX: match[1] === 'west' ? 52 : 64, maxX: match[1] === 'west' ? 59 : 76, minZ, maxZ: minZ + 6 };
}

function propFootprint(p) {
  const authored = CONSERVATORY_PROPS.find(entry => entry.id === p.id);
  const definition = PROP_MESH[p.mesh] || {};
  if (!(p.blocks ?? authored?.blocks ?? definition.blocks)) return null;
  const measured = PROP_BOUNDS[p.mesh];
  const sx = finite(p.scaleX, finite(p.scale, 1)), sz = finite(p.scaleZ, finite(p.scale, 1));
  const width = finite(p.w, finite(authored?.w, definition.w)), depth = finite(p.d, finite(authored?.d, definition.d));
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return null;
  // Render positions already include the production contact solver's offsets.
  // Keep the authored collision envelope, expanded to contain measured geometry.
  const box = measured?.min && measured?.max ? measured : null;
  return { id: p.id, x: p.x, z: p.z, yaw: finite(p.yaw, 0),
    minX: Math.min(-width / 2, box?.min[0] ?? 0) * sx,
    maxX: Math.max(width / 2, box?.max[0] ?? 0) * sx,
    minZ: Math.min(-depth / 2, box?.min[2] ?? 0) * sz,
    maxZ: Math.max(depth / 2, box?.max[2] ?? 0) * sz };
}

/** A detached, metre-space copy of Ellery's actual upper practice wing. */
export function buildSourceFalseReturnPracticeLayout({ floorplan, props = [], lights = [] } = {}) {
  if (typeof floorplan?.physicalRenderPlanFor !== 'function' || typeof floorplan?.doorState !== 'function') {
    throw new TypeError('False return requires the compiled Ellery floorplan');
  }
  // This is the real east practice room/corridor slice, not a second floorplan.
  const source = floorplan.physicalRenderPlanFor(149, 137);
  if (!source?.rgba || !source.material || !Number.isInteger(source.w)) throw new Error('Ellery practice slice is unavailable');
  const originX = Math.floor(CROP.minX / CELL), originY = Math.floor(CROP.minZ / CELL);
  const w = Math.ceil(CROP.maxX / CELL) - originX, h = Math.ceil(CROP.maxZ / CELL) - originY;
  const rgba = new Uint8Array(w * h * 4), material = new Uint8Array(w * h), ambient = new Uint8Array(w * h);
  const seals = [
    { id: 'real-stair-mouth', minX: 60, maxX: 66, minZ: 42.5, maxZ: 43.5 },
    { id: 'real-east-bridge-exit', minX: 100, maxX: 101, minZ: 45.5, maxZ: 46.5 },
  ];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = z * w + x, gx = originX + x, gz = originY + z;
    const sx = gx - (source.originX || 0), sz = gz - (source.originY || 0);
    const xm = (gx + .5) * CELL, zm = (gz + .5) * CELL;
    if (sx >= 0 && sz >= 0 && sx < source.w && sz < source.h) {
      const si = sz * source.w + sx;
      rgba.set(source.rgba.subarray(si * 4, si * 4 + 4), i * 4);
      material[i] = source.material[si]; ambient[i] = source.ambient?.[si] ?? 64;
    } else rgba[i * 4 + 2] = F.SOLID;
    rgba[i * 4 + 2] &= ~(F.CLOSED | F.DOOR);
    if (!retained(xm, zm) || seals.some(b => inBounds(xm, zm, b))) {
      rgba[i * 4] = 0; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = F.SOLID; rgba[i * 4 + 3] = 0;
    }
  }
  const plan = { rgba, w, h, material, ambient, originX, originY, heightOffset: 0 };
  const supportAt = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const ix = Math.floor(x / CELL) - originX, iz = Math.floor(z / CELL) - originY;
    if (ix < 0 || iz < 0 || ix >= w || iz >= h) return null;
    const offset = (iz * w + ix) * 4;
    if (rgba[offset + 2] & F.SOLID) return null;
    const floor = decodeHeight(rgba[offset]), ceil = decodeHeight(rgba[offset + 1]);
    return ceil - floor >= HEADROOM ? { floor, ceil } : null;
  };
  const doors = floorplan.doorState().filter(d => /^practice-(?:west|east)-[1-4]$/.test(d.id)
    || ['practice-side', 'upper-bridge-west', 'chapel-c17'].includes(d.id)).map(d => {
    const physical = floorplan.logicalToPhysical(d.cx, d.cy);
    const definition = DOOR_BY_ID[d.id] ? doorDefinitionWithArchetype(DOOR_BY_ID[d.id]) : d;
    const roomBounds = roomForDoor(d.id), normal = d.id.startsWith('practice-west') || d.id === 'practice-side'
      ? { x: -1, z: 0 } : d.id === 'chapel-c17' ? { x: 0, z: 1 } : { x: 1, z: 0 };
    return { id: d.id, x: physical.x * CELL, z: physical.z * CELL, feet: physical.y,
      yaw: d.widthAxis === 'x' ? 0 : Math.PI / 2,
      width: d.aperture.width, halfWidth: d.aperture.width / 2, normal, roomSide: { ...normal }, roomBounds,
      counted: COUNTED.has(d.id), entry: d.id === 'practice-side',
      openInitial: d.id === 'practice-side' || d.id === 'upper-bridge-west',
      archetype: d.archetype, hinge: d.hinge, swing: d.swing, activeLeaves: [...d.activeLeaves],
      openSeconds: definition.openSeconds, headMesh: d.headMesh, frameMesh: d.frameMesh, mesh: d.mesh,
      leafCount: d.leafCount, aperture: clone(d.aperture), leaf: clone(d.leaf) };
  });
  const copiedProps = props.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z)
    && finite(p.y, FLOOR) >= FLOOR - .3 && finite(p.y, FLOOR) < 9.2
    && retained(p.x, p.z) && p.id !== 'main-open-well-stair').map(clone);
  const colliders = copiedProps.map(propFootprint).filter(Boolean);
  const canOccupy = (x, z, state = {}) => {
    const center = supportAt(x, z); if (!center) return false;
    const feet = finite(state.feet, center.floor);
    for (const dx of [-RADIUS, RADIUS]) for (const dz of [-RADIUS, RADIUS]) {
      const support = supportAt(x + dx, z + dz);
      if (!support || Math.abs(support.floor - feet) > STEP_UP || support.ceil - Math.max(feet, support.floor) < HEADROOM) return false;
    }
    for (const door of doors) {
      const fraction = state.doorOpen?.[door.id] == null && !state.doorMotion?.[door.id]
        ? Number(door.openInitial) : sourceFalseReturnDoorFraction(state, door.id);
      const dx = x - door.x, dz = z - door.z;
      if (Math.abs(dx * door.normal.x + dz * door.normal.z) < RADIUS + door.leaf.depth / 2
        && Math.abs(-dx * door.normal.z + dz * door.normal.x) < door.halfWidth + RADIUS
        && (fraction < .85 || !sourceFalseReturnDoorAllowsWidth(door, dx * Math.cos(door.yaw) + dz * Math.sin(door.yaw), RADIUS))) return false;
    }
    return !colliders.some(c => {
      const dx = x - c.x, dz = z - c.z, cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const lx = dx * cos + dz * sin, lz = -dx * sin + dz * cos;
      return lx > c.minX - RADIUS && lx < c.maxX + RADIUS && lz > c.minZ - RADIUS && lz < c.maxZ + RADIUS;
    });
  };
  const spawn = { x: 75, z: 58.75, feet: FLOOR, yaw: -Math.PI / 2, pitch: 0 };
  const loops = [
    { id: 'false-ellery-entry', bounds: { minX: 75.5, maxX: 75.72, minZ: 58.48, maxZ: 59.02 },
      feet: FLOOR, sourceAfterFifth: true, beforeCount: 5, arrival: { ...spawn } },
    { id: 'false-ellery-chapel', bounds: { minX: 92.1, maxX: 93.9, minZ: 47.15, maxZ: 47.45 },
      feet: FLOOR, arrival: { ...spawn } },
  ];
  return { spawn, bounds: { ...CROP }, plan, props: copiedProps, doors,
    lights: lights.filter(p => p && retained(p.x, p.z) && finite(p.y, FLOOR + 2) > FLOOR && finite(p.y, FLOOR + 2) < 9.3).map(clone),
    lightingContext: clone(resolveLightingContext({ group: 'upper', zone: ZONE.practice, spaceId: 'practice' })),
    supportAt, canOccupy, loops, seals: seals.map(clone), colliders: colliders.map(clone) };
}

const ELLERY_GROUPS = new Set(['ground', 'hall', 'basement', 'upper', 'academic', 'academicRoof', 'tower']);
const insideEllery = span => ELLERY_GROUPS.has(span.renderGroup)
  && (!isOutdoorZone(span.zone) || span.zone === ZONE.academicRoof)
  && span.zone !== ZONE.pub && span.zone !== ZONE.church;
const pointInPolygon = (x, z, vertices) => {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [ax, az] = vertices[i], [bx, bz] = vertices[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
};

/** The entire real Ellery floorset, with isolated physical navigation/state. */
export function buildSourceFalseReturnLayout({ floorplan, props = [], propSources = [], lights = [] } = {}) {
  if (typeof floorplan?.physicalRenderPlanFor !== 'function' || typeof floorplan?.doorState !== 'function') {
    throw new TypeError('False return requires the compiled Ellery floorplan');
  }
  const actual = floorplan.floorplan?.(), physical = floorplan.physicalSpanData?.() || actual?.physical;
  if (!(physical?.cells instanceof Map)) throw new TypeError('False return requires Ellery physical floor spans');
  const spawn = { x: 75, z: 58.75, feet: FLOOR, yaw: -Math.PI / 2, pitch: 0 };
  const spans = new Map(), representatives = new Map();
  for (const [key, original] of physical.cells) {
    const copied = original.filter(insideEllery).map(span => {
      const value = { ...span, flags: span.flags & ~(F.CLOSED | F.DOOR) };
      const index = span.logicalY * (actual?.w || 0) + span.logicalX;
      value.collisionOnly = span.logicalX >= 0 && !!actual?.collisionOnly?.[index];
      if (span.logicalX >= 0) representatives.set(`${span.renderGroup}:${span.spaceId}`, value);
      return value;
    });
    if (copied.length) spans.set(key, copied);
  }
  const runs = (actual?.stairRuns || []).filter(run => run.owner === 'main-open-well' && run.analyticHelix).map(clone);
  const builtLandings = mainStairBuiltLandings().map(clone);
  let doors = [];
  const bounds = { minX: physical.originX * CELL, maxX: (physical.originX + physical.width) * CELL,
    minZ: physical.originY * CELL, maxZ: (physical.originY + physical.height) * CELL };
  const cellSpans = (x, z) => spans.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || [];
  const microStairSupport = (x, z) => {
    const list = [], radius = Math.hypot(x - MAIN_STAIR_GEOMETRY.center.x, z - MAIN_STAIR_GEOMETRY.center.z);
    if (radius < MAIN_STAIR_GEOMETRY.innerRadiusM || radius > MAIN_STAIR_GEOMETRY.walkOuterRadiusM) return list;
    const bearing = Math.atan2(x - MAIN_STAIR_GEOMETRY.center.x, -(z - MAIN_STAIR_GEOMETRY.center.z));
    for (const run of runs) {
      const angle = ((bearing - run.theta0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (angle > run.sweep + 1e-8) continue;
      const tread = Math.min(run.rises - 1, Math.floor(angle / run.sweep * run.rises + 1e-7));
      const floor = run.fromH + (run.toH - run.fromH) * tread / run.rises;
      const lane = Math.min(run.width - 1, Math.max(0, (radius / CELL - run.innerR) / ((run.walkOuter - run.innerR) / run.width)));
      const logicalX = run.logical0[0] + run.logicalDx * tread + run.logicalPx * lane;
      const logicalY = run.logical0[1] + run.logicalDy * tread + run.logicalPy * lane;
      const authored = MAIN_STAIR_GEOMETRY.flights.find(f => f.id === run.flight);
      list.push({ floor, ceil: authored?.ceil ?? floor + 3.4, flags: F.STAIR, zone: ZONE.stair,
        renderGroup: tread < run.rises / 2 ? run.group0 : run.group1, spaceId: 'main_stair', layer: 'main_stair',
        logicalX, logicalY, owner: 'main-open-well', flightId: run.id, analytic: true });
    }
    return list;
  };
  const supportAt = (x, z, state = {}) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const feet = finite(state.feet, FLOOR), stairs = microStairSupport(x, z);
    // Source has already replaced this open aperture. Permit its body corners
    // across the old exterior rock only until the physical centre crosses the
    // leaf plane; the controller owns that crossing and its one-shot handoff.
    if ((state.opened || []).length >= 5) for (const d of doors) {
      if (Math.abs(d.feet - feet) > STEP_UP || sourceFalseReturnDoorFraction(state, d.id) < .85) continue;
      const dx = x - d.x, dz = z - d.z;
      if (Math.abs(dx * d.normal.x + dz * d.normal.z) <= SOURCE_THROAT_HALF_DEPTH
        && sourceFalseReturnDoorAllowsWidth(d, dx * Math.cos(d.yaw) + dz * Math.sin(d.yaw), 0)) {
        return { floor: d.feet, ceil: d.feet + d.aperture.height, zone: ZONE.sourceSpace,
          renderGroup: d.group, spaceId: d.spaceId, logicalX: d.logicalX, logicalY: d.logicalY, sourceThroat: d.id };
      }
    }
    const candidates = cellSpans(x, z).filter(s => !s.collisionOnly).map(s => ({ ...s }));
    // Four body corners below supply the margin. Applying the authored
    // body-inset outline here as well opens a fictitious gap at the top riser.
    for (const landing of builtLandings) if (pointInPolygon(x, z, landing.slab)) {
      const source = MAIN_STAIR_GEOMETRY.landings.find(l => l.id === landing.id);
      candidates.push({ floor: landing.height, ceil: source.ceil, flags: F.STAIR, zone: ZONE.stair,
        renderGroup: source.renderGroup, spaceId: 'main_stair', layer: 'main_stair',
        logicalX: source.at.x * 2, logicalY: source.at.y * 2, owner: 'main-open-well', landing: landing.id });
    }
    candidates.push(...stairs);
    for (const s of candidates) {
      // The hero's raster is deliberately one tall air column. Its retained
      // mesh owns treads/slabs, so its ground plane cannot become an upper floor.
      if (s.owner === 'main-open-well') for (const overhead of stairs) {
        if (overhead.floor > s.floor + .05) s.ceil = Math.min(s.ceil, overhead.floor - MAIN_STAIR_GEOMETRY.slabDepthM);
      }
    }
    const possible = candidates.filter(s => Math.abs(s.floor - feet) <= STEP_UP + 1e-5 && s.ceil - s.floor >= HEADROOM);
    possible.sort((a, b) => Math.abs(a.floor - feet) - Math.abs(b.floor - feet) || Number(!!b.analytic) - Number(!!a.analytic));
    const chosen = possible[0];
    return chosen ? { ...chosen, floor: chosen.floor, ceil: chosen.ceil } : null;
  };
  const observerFor = state => {
    const support = supportAt(finite(state?.x, spawn.x), finite(state?.z, spawn.z), state || spawn)
      || supportAt(spawn.x, spawn.z, spawn);
    let logicalX = support.logicalX, logicalY = support.logicalY;
    if (logicalX < 0 || logicalY < 0) {
      const representative = representatives.get(`${support.renderGroup}:${support.spaceId}`);
      if (representative) { logicalX = representative.logicalX; logicalY = representative.logicalY; }
      else { logicalX = runs[0]?.logical0[0] ?? 149; logicalY = runs[0]?.logical0[1] ?? 137; }
    }
    return { ...support, logicalX, logicalY, group: support.renderGroup,
      x: finite(state?.x, spawn.x), z: finite(state?.z, spawn.z), feet: support.floor };
  };
  doors = floorplan.doorState().flatMap(d => {
    const at = floorplan.logicalToPhysical(d.cx, d.cy);
    if (!ELLERY_GROUPS.has(at.renderGroup) || /^pub-|^brendan-/.test(d.id)) return [];
    const definition = DOOR_BY_ID[d.id] ? doorDefinitionWithArchetype(DOOR_BY_ID[d.id]) : d;
    let normal = d.widthAxis === 'x' ? { x: 0, z: 1 } : { x: 1, z: 0 };
    if (d.id.startsWith('practice-west') || d.id === 'practice-side') normal = { x: -1, z: 0 };
    const x = at.x * CELL, z = at.z * CELL, positive = supportAt(x + normal.x * .8, z + normal.z * .8, { feet: at.y });
    const negative = supportAt(x - normal.x * .8, z - normal.z * .8, { feet: at.y });
    const outer = !positive !== !negative;
    if (outer && !positive) normal = { x: -normal.x, z: -normal.z };
    return [{ id: d.id, x, z, feet: at.y, logicalX: d.cx, logicalY: d.cy, yaw: d.widthAxis === 'x' ? 0 : Math.PI / 2,
      width: d.aperture.width, halfWidth: d.aperture.width / 2, normal, roomSide: { ...normal },
      roomBounds: roomForDoor(d.id), counted: d.id !== 'practice-side', entry: d.id === 'practice-side',
      openInitial: d.id === 'practice-side', outer, group: at.renderGroup, spaceId: at.spaceId, zone: floorplan.zoneAt?.(d.cx, d.cy) ?? 0,
      renderGroups: [...d.renderGroups], archetype: d.archetype, hinge: d.hinge, swing: d.swing,
      activeLeaves: [...d.activeLeaves], openSeconds: definition.openSeconds, headMesh: d.headMesh,
      frameMesh: d.frameMesh, mesh: d.mesh, leafCount: d.leafCount, aperture: clone(d.aperture), leaf: clone(d.leaf) }];
  });
  const sourceById = new Map(propSources.map(p => [p.id, p]));
  const copiedProps = props.filter(p => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    // Exterior and pub actors also advertise the `ground` render group. That
    // renderer bucket is not an Ellery address (the basement lies beneath the
    // street), so use the recorded zone before considering group membership.
    if (isOutdoorZone(p.zone) && p.zone !== ZONE.academicRoof || p.zone === ZONE.pub || p.zone === ZONE.church) return false;
    const metadata = sourceById.get(p.id), groups = metadata?.renderGroups || [metadata?.renderGroup];
    if (groups.some(g => ELLERY_GROUPS.has(g))) return true;
    return cellSpans(p.x, p.z).some(s => Math.abs(s.floor - finite(p.y, 0)) < 5);
  }).map(clone);
  const colliders = copiedProps.map(p => { const c = propFootprint(p); return c ? { ...c, feet: finite(p.y, 0),
    height: finite(PROP_BOUNDS[p.mesh]?.max?.[1], finite(PROP_MESH[p.mesh]?.h, 2)) * finite(p.scaleY, finite(p.scale, 1)) } : null; }).filter(Boolean);
  const canOccupy = (x, z, state = {}) => {
    const center = supportAt(x, z, state); if (!center) return false;
    const feet = finite(state.feet, center.floor);
    for (const dx of [-RADIUS, RADIUS]) for (const dz of [-RADIUS, RADIUS]) {
      const s = supportAt(x + dx, z + dz, { ...state, feet });
      if (!s || Math.abs(s.floor - feet) > STEP_UP + 1e-5 || s.ceil - Math.max(feet, s.floor) < HEADROOM) return false;
    }
    for (const d of doors) {
      if (Math.abs(d.feet - feet) > .45) continue;
      const fraction = state.doorOpen?.[d.id] == null && !state.doorMotion?.[d.id] ? Number(d.openInitial) : sourceFalseReturnDoorFraction(state, d.id);
      const dx = x - d.x, dz = z - d.z;
      if (Math.abs(dx * d.normal.x + dz * d.normal.z) < RADIUS + d.leaf.depth / 2
        && Math.abs(-dx * d.normal.z + dz * d.normal.x) < d.halfWidth + RADIUS
        && (fraction < .85 || !sourceFalseReturnDoorAllowsWidth(d, dx * Math.cos(d.yaw) + dz * Math.sin(d.yaw), RADIUS))) return false;
    }
    return !colliders.some(c => {
      if (c.feet > feet + HEADROOM || c.feet + c.height < feet + .08) return false;
      const dx = x - c.x, dz = z - c.z, cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const lx = dx * cos + dz * sin, lz = -dx * sin + dz * cos;
      return lx > c.minX - RADIUS && lx < c.maxX + RADIUS && lz > c.minZ - RADIUS && lz < c.maxZ + RADIUS;
    });
  };
  const loops = [{ id: 'false-ellery-entry', bounds: { minX: 75.5, maxX: 75.72, minZ: 58.48, maxZ: 59.02 }, feet: FLOOR,
    sourceAfterFifth: true, beforeCount: 5, doorId: 'practice-side', arrival: { ...spawn } },
  { id: 'false-ellery-chapel', bounds: { minX: 92.1, maxX: 93.9, minZ: 47.15, maxZ: 47.45 }, feet: FLOOR, arrival: { ...spawn } }];
  for (const d of doors.filter(d => d.outer && !d.entry)) {
    const px = d.x + d.normal.x * .45, pz = d.z + d.normal.z * .45;
    loops.push({ id: `false-ellery-outside:${d.id}`, doorId: d.id, feet: d.feet, sourceAfterFifth: true, beforeCount: 5,
      bounds: d.normal.x ? { minX: px - .12, maxX: px + .12, minZ: d.z - d.halfWidth, maxZ: d.z + d.halfWidth }
        : { minX: d.x - d.halfWidth, maxX: d.x + d.halfWidth, minZ: pz - .12, maxZ: pz + .12 }, arrival: { ...spawn } });
  }
  const sliceCache = new Map();
  const planFor = (state = spawn) => {
    const observer = observerFor(state), original = floorplan.physicalRenderPlanFor(observer.logicalX, observer.logicalY);
    const key = original.key || `${observer.group}:${observer.spaceId}:${Math.round(observer.floor * 4)}`;
    let plan = sliceCache.get(key);
    if (!plan) {
      plan = { key, rgba: original.rgba.slice(), material: original.material.slice(), ambient: original.ambient?.slice(),
        w: original.w, h: original.h, originX: original.originX || 0, originY: original.originY || 0, heightOffset: 0 };
      for (let i = 0; i < plan.w * plan.h; i++) plan.rgba[i * 4 + 2] &= ~(F.DOOR | F.CLOSED);
      sliceCache.set(key, plan); if (sliceCache.size > 24) sliceCache.delete(sliceCache.keys().next().value);
    }
    const context = resolveLightingContext({ group: observer.group, zone: observer.zone, spaceId: observer.spaceId });
    const viewProps = copiedProps.filter(p => {
      const metadata = sourceById.get(p.id), groups = metadata?.renderGroups || [metadata?.renderGroup];
      return groups.some(Boolean) ? groups.includes(observer.group) : Math.abs(finite(p.y, 0) - observer.floor) < 5;
    });
    const viewDoors = doors.filter(d => d.group === observer.group || d.renderGroups.includes(observer.group)
      || Math.abs(d.feet - observer.floor) < .45);
    const sourceLights = typeof lights === 'function' ? lights({ ...context, origin: { x: observer.x, z: observer.z }, feet: observer.floor }) : lights;
    const viewLights = (Array.isArray(sourceLights) ? sourceLights : []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z)
      && finite(p.y, observer.floor + 2) >= observer.floor - .5 && finite(p.y, observer.floor + 2) <= observer.floor + 8).map(clone);
    return { plan, props: viewProps, doors: viewDoors, lights: viewLights, lightingContext: clone(context), observer: { ...observer }, key };
  };
  const initial = planFor(spawn);
  return { ...initial, props: copiedProps, doors, spawn, bounds, supportAt, canOccupy, loops, planFor, observerFor,
    colliders: colliders.map(clone), diagnostics: () => ({ spanCells: spans.size, doors: doors.length, props: copiedProps.length, cachedSlices: sliceCache.size }) };
}
