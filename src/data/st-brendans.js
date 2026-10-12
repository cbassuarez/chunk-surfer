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
  // Raised from 14.2 to hang the full ring in two tiers (CHURCH_BELFRY).
  belfry: 15.6,
  spire: 17.35,
});

export const CHURCH_LEVELS = freeze({
  ground: freeze({ id: 'cathedral_ground', base: 0, renderGroup: 'ground' }),
  loft: freeze({ id: 'cathedral_loft', base: 4.6, ceil: 10.0, renderGroup: 'cathedral' }),
  belfry: freeze({ id: 'cathedral_belfry', base: 10.2, ceil: 15.6, renderGroup: 'cathedral' }),
});

// Upper circulation uses physical coordinates so its separate logical islands
// can move without moving a rail, stair mouth or hook in the rendered church.
export const CHURCH_UPPER = freeze({
  loft: freeze({ x0: 10, y0: 57, x1: 22, y1: 76 }),
  organLoft: freeze({ x0: 13, y0: 57, x1: 19, y1: 61 }),
  northWalk: freeze({ x0: 10, y0: 59, x1: 11, y1: 75 }),
  southWalk: freeze({ x0: 21, y0: 59, x1: 22, y1: 75 }),
  crossingWalk: freeze({ x0: 10, y0: 71, x1: 22, y1: 75 }),
  belfry: freeze({ x0: 11.8, y0: 69.2, x1: 20.2, y1: 76.8 }),
});

// THE BELFRY, AND THE WAY DOWN FROM IT.
//
// The working tower keeps its eight swinging bells behind a low iron guard.
// The 8.4 x 7.6m chamber leaves a two-metre perimeter; the protected clear
// route is at least 1.4m after rail thickness and the player's body margin.
// Three north-wall service recesses are floors you can enter, not painted doors.
// Rectangles use physical church metres, shared with contact and mesh placement.
export const CHURCH_BELFRY = freeze({
  center: freeze({ x: 16, y: 73 }),
  lowerFloorY: 10.2,
  upperPivotY: 14.4,
  interior: freeze({ x0: 11.8, x1: 20.2, y0: 69.2, y1: 76.8 }),
  frame: freeze({ x0: 13.8, x1: 18.2, y0: 71.2, y1: 74.8 }),
  clearRouteWidth: 1.4,
  hatch: freeze({ x0: 16, x1: 17, y0: 73, y1: 74 }),
  arrival: freeze({ x: 19, y: 72, facing: 3 }),
  serviceBays: freeze([
    freeze({ id: 'louvre', x0: 12, x1: 13.8, y0: 67.2, y1: 69.2, center: freeze({ x: 12.9, y: 68.2 }) }),
    freeze({ id: 'wheel', x0: 15.1, x1: 16.9, y0: 67.2, y1: 69.2, center: freeze({ x: 16, y: 68.2 }) }),
    freeze({ id: 'clapper', x0: 18.2, x1: 20, y0: 67.2, y1: 69.2, center: freeze({ x: 19.1, y: 68.2 }) }),
  ]),
});

// Shared stone wall pieces, including real east/west turret mouths. The GLB
// and runtime contact use these exact pieces. No full wall hides an open seam.
const belfryWall = (id, x, y, w, d) => freeze({
  id: `cathedral-belfry-wall-${id}`, kind: 'box', x, y, w, d, floor: 10.2, ceil: 15.6,
});
export const CHURCH_BELFRY_WALLS = freeze([
  belfryWall('south', 16, 76.96, 8.72, .32),
  ...[11.64, 20.36].flatMap((x, side) => [
    belfryWall(`${side}-north`, x, 69.7, .32, 1),
    belfryWall(`${side}-south`, x, 75.9, .32, 1.8),
  ]),
  ...[[11.8, 12], [13.8, 15.1], [16.9, 18.2], [20, 20.2]].map(([a,b],i) =>
    belfryWall(`north-pier-${i}`, (a+b)/2, 69.04, b-a, .32)),
  ...CHURCH_BELFRY.serviceBays.flatMap((bay) => [
    belfryWall(`${bay.id}-back`, (bay.x0+bay.x1)/2, bay.y0-.16, bay.x1-bay.x0+.64, .32),
    belfryWall(`${bay.id}-left`, bay.x0-.16, 68.2, .32, 2),
    belfryWall(`${bay.id}-right`, bay.x1+.16, 68.2, .32, 2),
  ]),
]);

// Stairs are proper 1.8m annuli with a 1.7m walking band and 1.5m landings.
// Unlike the older chapel tower these are analytic body paths, one cell per
// visible riser. Their physical coordinates are already Euclidean metres (no
// prop half-cell offset). Logical islands remain private to the compiler.
const turret = (id, center, fromH, toH, logicalFrom, groupFrom, groupTo) => {
  const rises = Math.abs(toH-fromH)>5 ? 32 : 26;
  const flightFrom = freeze({ x: logicalFrom.x+1.5, y: logicalFrom.y });
  const flightTo = freeze({ x: flightFrom.x+(rises-1)/2, y: logicalFrom.y });
  return freeze({ id, center: freeze(center), fromH, toH, rises,
    innerRadius: .25, outerRadius: 2.05, walkOuterRadius: 1.95,
    width: 1.5, landingSize: 1.5, wallThickness: .18, mouthHalfAngle: .56,
    logicalFrom: freeze(logicalFrom), flightFrom, flightTo,
    logicalTo: freeze({ x: flightTo.x+.5, y: logicalFrom.y }),
    footLandingOrigin: freeze({ x: center.x-1.5, y: center.y-2 }),
    headLandingOrigin: freeze({ x: center.x, y: center.y-2 }),
    groupFrom, groupTo,
  });
};
export const CHURCH_TURRETS = freeze([
  turret('north-lower', {x:10.5,y:64.5}, 0, 4.6, {x:150,y:300}, 'ground', 'cathedral'),
  turret('south-lower', {x:21.5,y:79.5}, 0, 4.6, {x:164,y:306}, 'ground', 'cathedral'),
  turret('south-upper', {x:22,y:73.5}, 4.6, 10.2, {x:178,y:312}, 'cathedral', 'cathedral'),
  turret('north-upper', {x:10,y:73.5}, 10.2, 4.6, {x:192,y:318}, 'cathedral', 'cathedral'),
]);

// Short tangent boxes form hollow ashlar drums. Their north openings are cut
// through both the visible shell and its contact at each landing height.
export const CHURCH_TURRET_WALLS = freeze(CHURCH_TURRETS.flatMap((stair) => {
  const low=Math.min(stair.fromH,stair.toH), high=Math.max(stair.fromH,stair.toH);
  const bands = low===0 ? [[0,2.3,true],[2.3,high,false],[high,high+2.3,true],[high+2.3,high+2.6,false]]
    : [[low,low+2.3,true],[low+2.3,high,false],[high,high+2.3,true],[high+2.3,high+2.6,false]];
  const radius=stair.outerRadius+stair.wallThickness/2, segments=40;
  return bands.flatMap(([floor,ceil,mouth],band) => Array.from({length:segments},(_,i) => {
    const angle=(i+.5)*Math.PI*2/segments;
    if(mouth && Math.min(angle,Math.PI*2-angle)<stair.mouthHalfAngle)return null;
    return freeze({ id:`cathedral-turret-${stair.id}-${band}-${i}`, kind:'box',
      x:stair.center.x+Math.sin(angle)*radius,
      y:stair.center.y-Math.cos(angle)*radius,
      w:2*radius*Math.tan(Math.PI/segments)+.012, d:stair.wallThickness,
      yaw:angle, floor, ceil,
    });
  }).filter(Boolean));
}));

// ONE WAY DOWN, AND IT IS THE LONG ONE. The north belfry turret is choked with
// fallen louvre boards and the south-lower turret with rubble, so the descent
// goes down the south turret, across the crossing walk over the lantern, along
// the north triforium above the whole nave, down the north-lower turret into the
// west end — and the walk to the fight is the same axis the carry comes back on.
export const CATHEDRAL_DESCENT_BLOCKERS = freeze([
  freeze({ id: 'brendan-belfry-north-turret-louvres', level: 'belfry', x: 10, y: 70, mesh: 'tower_louvres' }),
  freeze({ id: 'brendan-loft-south-turret-rubble', level: 'loft', x: 22, y: 77, mesh: 'ending_collapse_debris' }),
]);
export const CATHEDRAL_DESCENT_ROUTE = freeze([
  freeze({ id: 'belfry-south-turret', level: 'belfry', x: 22, y: 70, label: 'THE SOUTH TURRET' }),
  freeze({ id: 'crossing-walk', level: 'loft', x: 16, y: 72, label: 'ACROSS THE CROSSING WALK' }),
  freeze({ id: 'north-triforium', level: 'loft', x: 10, y: 68, label: 'ALONG THE NORTH TRIFORIUM' }),
  freeze({ id: 'north-lower-turret', level: 'loft', x: 11, y: 62, label: 'DOWN THE NORTH TURRET' }),
  freeze({ id: 'west-nave', level: 'ground', x: 16, y: 62, label: 'THE WEST END OF THE NAVE' }),
  freeze({ id: 'crossing', level: 'ground', x: 16, y: 73, label: 'UNDER THE LANTERN' }),
]);

// WHAT THE FIGHT BREAKS, WHERE IT LANDS. Ground-level authored metres. Marks are
// CATHEDRAL_DAMAGE_MARKS in chunk-surf-state.js.
export const CATHEDRAL_STAGING = freeze({
  fallenBell: freeze({ x: 16.6, y: 73.7, bell: 8 }),
  weights: freeze([freeze({ x: 15.1, y: 66.2 }), freeze({ x: 17.2, y: 63.6 })]),
  pulpitum: freeze({ x: 16, y: 76.05 }),
});

export function churchCrossingAt(x, y) {
  return churchRoomAt(x, y) === 'crossing';
}

export const CHURCH_STAIR_ENDPOINTS = freeze(CHURCH_TURRETS.map((stair) => freeze({
  id: stair.id,
  from: freeze({x:stair.center.x,y:stair.center.y-1,h:stair.fromH}),
  to: freeze({x:stair.center.x,y:stair.center.y-1,h:stair.toH}),
})));

// Exterior dress and solid projections. `CHURCH_COLLIDERS` is consumed by the
// runtime; the mesh builder consumes both lists so visible stone and contact
// stay aligned. Broad hero-mesh bounds remain non-blocking.
export const CHURCH_BUTTRESSES = freeze([
  freeze({ id: 'west-north', x: 12, y: 55.15, w: 1.0, d: 0.65, h: 4.9 }),
  freeze({ id: 'west-south', x: 20, y: 55.15, w: 1.0, d: 0.65, h: 4.9 }),
  ...[61, 65, 69].flatMap((y) => [
    freeze({ id: `north-${y}`, x: y===65?8.0:9.65, y, w: y===65?.5:.7, d: y===65?.7:.9, h: 4.6 }),
    freeze({ id: `south-${y}`, x: 22.35, y, w: 0.7, d: 0.9, h: 4.6 }),
  ]),
  freeze({ id: 'north-transept-west', x: 8.65, y: 71.5, w: 0.7, d: 0.9, h: 5.2 }),
  freeze({ id: 'north-transept-east', x: 8.65, y: 75.0, w: 0.7, d: 0.9, h: 5.2 }),
  freeze({ id: 'east-north', x: 12, y: 84.85, w: 1.0, d: 0.65, h: 4.5 }),
  freeze({ id: 'east-south', x: 20, y: 84.85, w: 1.0, d: 0.65, h: 4.5 }),
]);

export const CHURCH_LOFT_RAILS = freeze([
  freeze({x0:14,y0:62,x1:14,y1:68}),
  freeze({x0:12,y0:62,x1:14,y1:62}),
  freeze({x0:12,y0:68,x1:14,y1:68}),
  freeze({x0:25,y0:77,x1:25,y1:83}),
  freeze({x0:23,y0:83,x1:25,y1:83}),
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
  // The two-tier frame stands in the middle of the belfry; the deck is the ring
  // walk around it (CHURCH_BELFRY).
  freeze({ id: 'cathedral-bell-frame', kind: 'box', x: 16, y: 73, w: 4.4, d: 3.6, floor: 10.2, ceil: 15.4 }),
  ...CHURCH_BELFRY_WALLS,
  ...CHURCH_TURRET_WALLS,
  ...CHURCH_LOFT_RAILS.map((r,i)=>freeze({id:`cathedral-apron-rail-${i}`,kind:'box',
    x:(r.x0+r.x1)/2,y:(r.y0+r.y1)/2,w:Math.max(.075,Math.abs(r.x1-r.x0)),
    d:Math.max(.075,Math.abs(r.y1-r.y0)),floor:4.6,ceil:5.7,
  })),
  ...[[16.5,73,1,.08],[16.5,74,1,.08],[16,73.5,.08,1],[17,73.5,.08,1]].map(([x,y,w,d],i)=>freeze({
    id:`cathedral-loft-trap-rail-${i}`,kind:'box',x,y,w,d,floor:4.6,ceil:5.7,
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
  freeze({ id:'belfry-service', x:19, y:70, h:12.5, radius:8, intensity:.9, kind:'fitting', color:freeze([.86,.77,.57]) }),
  freeze({ id:'south-landing', x:21, y:72, h:6.8, radius:5.5, intensity:.78, kind:'fitting', color:freeze([.86,.77,.57]) }),
  freeze({ id:'north-triforium', x:10, y:68, h:6.8, radius:8, intensity:.7, kind:'fitting', color:freeze([.65,.73,.76]) }),
  freeze({ id:'west-lower-landing', x:10, y:63, h:2.3, radius:5, intensity:.78, kind:'fitting', color:freeze([.86,.77,.57]) }),
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
  freeze({ id: 'cathedral-belfry', label: 'BELFRY', x: CHURCH_BELFRY.arrival.x, y: CHURCH_BELFRY.arrival.y, floor: 10.2, zone: 'church', group: 'cathedral', component: 'cathedral_belfry' }),
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
