// ST BRENDAN'S CATHEDRAL — THE SMALL, WEATHER-BEATEN CHURCH IN THE YARD.
//
// This manifest is the architectural contract shared by the floorplan, the
// generated hero mesh, collision, lighting and the God-menu review hooks. Keep
// authored coordinates here in YARD-LOCAL metres: x runs north/south across the
// building and y runs from the west door towards the choir.

const freeze = (value) => Object.freeze(value);
const rect = (id, x0, y0, x1, y1, volume, label) => freeze({
  id, x0, y0, x1, y1, volume, label,
});

export const CHURCH = freeze({
  id: 'st_brendan_church',
  label: "St Brendan's Cathedral",
  anchor: freeze({ x: 16, y: 70 }),
  rooms: freeze([
    rect('narthex', 14, 56, 18, 58, 'nave', 'West narthex'),
    rect('nave', 12, 59, 20, 70, 'nave', 'Four-bay nave'),
    rect('north_aisle', 10, 59, 11, 70, 'aisle', 'North aisle'),
    rect('south_aisle', 21, 59, 22, 70, 'aisle', 'South aisle'),
    rect('crossing', 12, 71, 20, 75, 'crossing', 'Crossing'),
    rect('north_transept', 9, 71, 11, 75, 'nave', 'North transept'),
    rect('south_transept', 21, 71, 23, 75, 'nave', 'South transept'),
    rect('choir', 12, 76, 20, 84, 'choir', 'Three-bay choir'),
    rect('side_chapel', 9, 76, 11, 82, 'aisle', 'North side chapel'),
    rect('sacristy', 21, 76, 23, 82, 'ancillary', 'Sacristy'),
  ]),
  doors: freeze([
    freeze({
      id: 'brendan-west-door', x: 16, y: 55, room: 'narthex',
      widthAxis: 'x', access: 'exit-only', insideSide: 1,
      threshold: freeze({ outside: freeze({ x: 16, y: 54 }), inside: freeze({ x: 16, y: 56 }) }),
    }),
    freeze({
      id: 'brendan-south-porch', x: 24, y: 73, room: 'south_transept',
      widthAxis: 'y', access: 'exit-only', insideSide: -1,
      threshold: freeze({ outside: freeze({ x: 25, y: 73 }), inside: freeze({ x: 23, y: 73 }) }),
    }),
  ]),
});

export const CHURCH_EXPLORATION_EXIT_DOOR_ID = 'brendan-west-door';
// Tower victory leaves by the ceremonial west front. This stays a named
// contract so existing finale saves do not gain a coordinate or migration.
export const CHURCH_TOWER_ENDING_EXIT_DOOR_ID = 'brendan-west-door';

export function churchTowerCarryDoorAccess(doorId){
  const id=String(doorId||'');
  return freeze({
    allowed:id===CHURCH_TOWER_ENDING_EXIT_DOOR_ID,
    completesEnding:id===CHURCH_TOWER_ENDING_EXIT_DOOR_ID,
    reason:id==='brendan-south-porch'?'west-door-route':null,
  });
}

// Seventeen by thirty-one authored metres before the half-metre stone skin and
// shallow buttress projections are applied.
export const CHURCH_BOUNDS = freeze({ x0: 8, y0: 55, x1: 24, y1: 85 });

export const CHURCH_HEIGHTS = freeze({
  ancillary: 4.8,
  aisle: 5.8,
  choir: 7.4,
  nave: 9.6,
  crossing: 12.4,
  loft: 10.0,
  belfry: 14.2,
  spire: 17.35,
});

export const CHURCH_LEVELS = freeze({
  ground: freeze({ id: 'cathedral_ground', base: 0, renderGroup: 'ground' }),
  loft: freeze({ id: 'cathedral_loft', base: 4.6, ceil: 10.0, renderGroup: 'cathedral' }),
  belfry: freeze({ id: 'cathedral_belfry', base: 10.2, ceil: 14.2, renderGroup: 'cathedral' }),
});

// Upper circulation uses physical coordinates so its separate logical islands
// can move without moving a rail, stair mouth or hook in the rendered church.
export const CHURCH_UPPER = freeze({
  loft: freeze({ x0: 10, y0: 57, x1: 22, y1: 76 }),
  organLoft: freeze({ x0: 13, y0: 57, x1: 19, y1: 61 }),
  northWalk: freeze({ x0: 10, y0: 59, x1: 11, y1: 75 }),
  southWalk: freeze({ x0: 21, y0: 59, x1: 22, y1: 75 }),
  crossingWalk: freeze({ x0: 10, y0: 71, x1: 22, y1: 75 }),
  belfry: freeze({ x0: 13, y0: 71, x1: 19, y1: 75 }),
});

export const CHURCH_STAIR_ENDPOINTS = freeze([
  freeze({ id: 'north-lower', from: freeze({ x: 10, y: 64, h: 0 }), to: freeze({ x: 10, y: 68, h: 4.6 }) }),
  freeze({ id: 'south-lower', from: freeze({ x: 22, y: 81, h: 0 }), to: freeze({ x: 22, y: 76, h: 4.6 }) }),
  freeze({ id: 'south-upper', from: freeze({ x: 22, y: 72, h: 4.6 }), to: freeze({ x: 19, y: 73, h: 10.2 }) }),
  freeze({ id: 'north-upper', from: freeze({ x: 13, y: 73, h: 10.2 }), to: freeze({ x: 10, y: 72, h: 4.6 }) }),
]);

// Exterior dress and solid projections. `CHURCH_COLLIDERS` is consumed by the
// runtime; the mesh builder consumes both lists so visible stone and contact
// stay aligned. Broad hero-mesh bounds remain non-blocking.
export const CHURCH_BUTTRESSES = freeze([
  freeze({ id: 'west-north', x: 12, y: 55.15, w: 1.0, d: 0.65, h: 4.9 }),
  freeze({ id: 'west-south', x: 20, y: 55.15, w: 1.0, d: 0.65, h: 4.9 }),
  ...[61, 65, 69].flatMap((y) => [
    freeze({ id: `north-${y}`, x: 9.65, y, w: 0.7, d: 0.9, h: 4.6 }),
    freeze({ id: `south-${y}`, x: 22.35, y, w: 0.7, d: 0.9, h: 4.6 }),
  ]),
  freeze({ id: 'north-transept-west', x: 8.65, y: 71.5, w: 0.7, d: 0.9, h: 5.2 }),
  freeze({ id: 'north-transept-east', x: 8.65, y: 75.0, w: 0.7, d: 0.9, h: 5.2 }),
  freeze({ id: 'east-north', x: 12, y: 84.85, w: 1.0, d: 0.65, h: 4.5 }),
  freeze({ id: 'east-south', x: 20, y: 84.85, w: 1.0, d: 0.65, h: 4.5 }),
]);

export const CHURCH_COLLIDERS = freeze([
  ...CHURCH_BUTTRESSES.map((b) => freeze({
    id: `cathedral-buttress-${b.id}`, kind: 'box', x: b.x, y: b.y,
    w: b.w, d: b.d, floor: 0, ceil: b.h,
  })),
  ...[[12.15, 71.15], [19.85, 71.15], [12.15, 74.85], [19.85, 74.85]].map(([x, y], i) => freeze({
    id: `cathedral-crossing-pier-${i + 1}`, kind: 'cylinder', x, y,
    radius: 0.46, floor: 0, ceil: 9.8,
  })),
  freeze({ id: 'cathedral-pulpitum-north', kind: 'box', x: 13.1, y: 76.05, w: 2.2, d: 0.35, floor: 0, ceil: 2.6 }),
  freeze({ id: 'cathedral-pulpitum-south', kind: 'box', x: 18.9, y: 76.05, w: 2.2, d: 0.35, floor: 0, ceil: 2.6 }),
  freeze({ id: 'cathedral-organ-rail', kind: 'box', x: 16, y: 61.1, w: 6.8, d: 0.18, floor: 4.6, ceil: 5.55 }),
  ...[14.0, 16.0, 18.0].map((x, i) => freeze({
    id: `cathedral-bell-frame-${i + 1}`, kind: 'box', x, y: 73,
    w: 0.22, d: 4.0, floor: 10.2, ceil: 13.6,
  })),
]);

export const CHURCH_FURNISHINGS = freeze([
  freeze({ id: 'font', kind: 'font', x: 16, y: 59.2, h: 0 }),
  freeze({ id: 'lectern', kind: 'lectern', x: 14.5, y: 77.2, h: 0 }),
  freeze({ id: 'altar', kind: 'altar', x: 16, y: 82.5, h: 0.25 }),
  freeze({ id: 'organ', kind: 'organ', x: 16, y: 58.3, h: 4.6 }),
  freeze({ id: 'north-monument', kind: 'monument', x: 9.8, y: 78.7, h: 0 }),
  freeze({ id: 'south-tomb', kind: 'tomb', x: 22, y: 78.7, h: 0 }),
  // The south transept was last used as the visitor shop.  These anchors keep
  // the ending route and the prop dressing on the same authored plan as the
  // doorway it must clear.
  freeze({ id: 'visitor-desk', kind: 'visitor-desk', x: 21.45, y: 72.0, h: 0 }),
  freeze({ id: 'visitor-guidebooks', kind: 'guidebooks', x: 21.45, y: 72.0, h: 0.82 }),
  freeze({ id: 'visitor-till', kind: 'donation-till', x: 21.45, y: 72.35, h: 0.82 }),
  freeze({ id: 'visitor-postcards', kind: 'postcards', x: 22.45, y: 74.35, h: 1.15 }),
]);

export const CHURCH_LIGHTS = freeze([
  freeze({ id: 'west-window', x: 16, y: 58, h: 5.8, radius: 10, intensity: 0.46 }),
  freeze({ id: 'crossing-lantern', x: 16, y: 73, h: 10.8, radius: 13, intensity: 0.5 }),
  freeze({ id: 'east-lancets', x: 16, y: 82.7, h: 5.4, radius: 8, intensity: 0.45 }),
  freeze({ id: 'side-chapel-window', x: 10, y: 79, h: 3.4, radius: 5, intensity: 0.45 }),
]);

export const CHURCH_GOD_HOOKS = freeze([
  freeze({ id: 'cathedral-exterior', label: 'EXTERIOR REVIEW', x: 16, y: 53, floor: 0, zone: 'dock', group: 'ground', component: 'loading_bay' }),
  freeze({ id: 'cathedral-west-nave', label: 'WEST NAVE', x: 16, y: 60, floor: 0, zone: 'church', group: 'ground', component: 'cathedral_ground' }),
  freeze({ id: 'cathedral-crossing', label: 'CROSSING', x: 16, y: 73, floor: 0, zone: 'church', group: 'ground', component: 'cathedral_ground' }),
  freeze({ id: 'cathedral-choir', label: 'CHOIR', x: 16, y: 80, floor: 0, zone: 'church', group: 'ground', component: 'cathedral_ground' }),
  freeze({ id: 'cathedral-side-chapel', label: 'SIDE CHAPEL', x: 10, y: 79, floor: 0, zone: 'church', group: 'ground', component: 'cathedral_ground' }),
  freeze({ id: 'cathedral-sacristy', label: 'SACRISTY', x: 22, y: 79, floor: 0, zone: 'church', group: 'ground', component: 'cathedral_ground' }),
  freeze({ id: 'cathedral-organ-loft', label: 'ORGAN LOFT', x: 16, y: 60, floor: 4.6, zone: 'church', group: 'cathedral', component: 'cathedral_loft' }),
  freeze({ id: 'cathedral-triforium', label: 'TRIFORIUM', x: 10, y: 68, floor: 4.6, zone: 'church', group: 'cathedral', component: 'cathedral_loft' }),
  freeze({ id: 'cathedral-belfry', label: 'BELFRY', x: 15, y: 72, floor: 10.2, zone: 'church', group: 'cathedral', component: 'cathedral_belfry' }),
]);

// Half a metre of dressed rubble occupies only the exterior half of each wall
// cell. The other half remains the floorplan's authored collision stone.
export const CHURCH_SKIN = 0.52;

const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export function churchRoomAt(x, y) {
  return CHURCH.rooms.find((room) => inRect(x, y, room))?.id || null;
}

export function churchRoomDefinitionAt(x, y) {
  return CHURCH.rooms.find((room) => inRect(x, y, room)) || null;
}

export function churchVolumeAt(x, y) {
  return churchRoomDefinitionAt(x, y)?.volume || null;
}

export function churchDoorDefinitionAt(x, y) {
  return CHURCH.doors.find((door) => door.x === x && door.y === y) || null;
}

export function churchDoorAt(x, y) {
  return Boolean(churchDoorDefinitionAt(x, y));
}

// Eight-neighbour closure makes every re-entrant transept/chapel corner solid.
export function churchWallAt(x, y) {
  if (!inRect(x, y, CHURCH_BOUNDS)) return false;
  if (churchRoomAt(x, y) || churchDoorAt(x, y)) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (churchRoomAt(x + dx, y + dy)) return true;
    }
  }
  return false;
}

export function churchWallHeight(x, y) {
  let best = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const volume = churchVolumeAt(x + dx, y + dy);
      if (volume) best = Math.max(best, CHURCH_HEIGHTS[volume]);
    }
  }
  return best;
}

export function churchWallExposed(x, y, dx, dy) {
  return churchWallAt(x, y)
    && !churchRoomAt(x + dx, y + dy)
    && !churchWallAt(x + dx, y + dy);
}

export function churchGroundRows(exteriorGlyph = 'Y') {
  const rows = [];
  for (let y = CHURCH_BOUNDS.y0; y <= CHURCH_BOUNDS.y1; y += 1) {
    let row = '';
    for (let x = CHURCH_BOUNDS.x0; x <= CHURCH_BOUNDS.x1; x += 1) {
      const volume = churchVolumeAt(x, y);
      row += churchDoorAt(x, y) ? '+'
        : churchWallAt(x, y) ? '#'
          : volume === 'crossing' ? 'X'
            : volume === 'choir' ? 'z'
              : volume === 'aisle' || volume === 'ancillary' ? 'c'
              : volume === 'nave' ? 'Z' : exteriorGlyph;
    }
    rows.push(row);
  }
  return rows;
}
