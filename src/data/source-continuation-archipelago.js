// Source III's authored expedition. The distant seeded islands remain scenery;
// every destination and connection here supplies the same real support used by
// the player and HUSH. Coordinates are local metres on the original Catch chart.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const round = value => Math.round(value * 1e6) / 1e6;
const common = {phase: 'catch', region: 'catch', chartId: 0, archipelago: true};
const point = (x, z, feet, level, extra = {}) => ({...common, x, z, feet, level, ...extra});
const surfaces = [], solids = [], props = [], islands = [], refuges = [];
const materials = {masonry: 'cold-stone', soundboard: 'piano-wood', binding: 'case-lining'};
const rect = (id, minX, maxX, minZ, maxZ, y, extra = {}) => {
  const surface = {...common, id, kind: 'rect', minX, maxX, minZ, maxZ, y,
    thickness: .65, material: 'cold-stone', construction: 'masonry', ...extra};
  surfaces.push(surface);
  return surface;
};
const solid = (id, minX, maxX, minZ, maxZ, minY, maxY, extra = {}) => {
  const row = {...common, id, minX, maxX, minZ, maxZ, minY, maxY,
    material: 'cold-stone', role: 'archipelago-structure', ...extra};
  solids.push(row);
  return row;
};

// Ten principal destinations and four optional islands. The original listening
// and exit islands are included in the inventory, without replacing their
// existing supports or moving the seat, harpsichord or final door.
const mainDefinitions = [
  ['iii-arrival-court', 'The separated court', -215, -135, 8.4, 0, 'outer', 'masonry', 44, 30],
  ['iii-echo-colonnade', 'The echo colonnade', -290, -150, 8.4, 0, 'outer', 'binding', 44, 34],
  ['iii-soundboard-harbour', 'The soundboard harbour', -375, -170, 2.4, 1, 'outer', 'soundboard', 44, 36],
  ['iii-inverted-chapel', 'The inverted chapel', -385, -240, 2.4, 1, 'middle', 'masonry', 48, 40],
  ['iii-binding-garden', 'The binding garden', -295, -235, -4.8, 2, 'middle', 'binding', 48, 40],
  ['iii-listener-court', 'The listening approach', -215, -190, -4.8, 2, 'middle', 'soundboard', 40, 40],
  ['iii-underwell', 'The underside of the well', -240, -20, -12.6, 3, 'deep', 'masonry', 46, 40],
  ['iii-deep-arcade', 'The deep arcade', -325, -5, -12.6, 3, 'deep', 'binding', 48, 40],
  ['iii-counterweight-yard', 'The counterweight yard', -390, -65, -4.8, 2, 'deep', 'soundboard', 44, 40],
  ['iii-return-observatory', 'The return observatory', -300, -105, 8.4, 0, 'deep', 'masonry', 44, 40],
];
const optionalDefinitions = [
  ['iii-case-gallery', 'The open case gallery', -250, -200, 8.4, 0, 'outer', 'binding', 28, 28],
  ['iii-broken-observatory', 'The broken observatory', -425, -210, 2.4, 1, 'middle', 'masonry', 28, 28],
  ['iii-memory-garden', 'The remembered garden', -260, -180, -4.8, 2, 'middle', 'soundboard', 28, 26],
  ['iii-low-bells', 'The low bells', -280, 45, -12.6, 3, 'deep', 'binding', 30, 28],
];

function island(definition, mainIndex = null) {
  const [id, name, x, z, feet, level, cluster, construction, width, depth] = definition;
  const minX = x - width / 2, maxX = x + width / 2;
  const minZ = z - depth / 2, maxZ = z + depth / 2;
  const row = {...point(x, z, feet, level), id, name, cluster, construction,
    kind: mainIndex === null ? 'optional-island' : 'main-island',
    radius: Math.min(width, depth) / 2, minX, maxX, minZ, maxZ,
    ...(mainIndex === null ? {} : {mainIndex})};
  islands.push(row);
  const details = {role: 'island', islandId: id, level, cluster, construction,
    material: materials[construction], thickness: .9};
  rect(id + '-deck', minX, maxX, minZ, maxZ, feet, details);
  // Unequal shoulders give each landmass an actual broken coastline. These
  // are broad walkable rooms, not scenery balanced on a narrow route ribbon.
  const wingSign = (mainIndex ?? optionalDefinitions.findIndex(d => d[0] === id)) % 2 ? -1 : 1;
  rect(id + '-shoulder', x - width * .23, x + width * .38,
    z + wingSign * depth * .34 - 8, z + wingSign * depth * .34 + 8, feet, details);
  // The hanging root stops above the lower crossing beneath the first court.
  // It is a physical stepped mass; its bounds never occupy a route above it.
  for (let tier = 0; tier < 3; tier++) {
    const scale = [ .86, .59, .23 ][tier];
    solid(id + '-root-' + tier, x - width * scale / 2, x + width * scale / 2,
      z - depth * scale / 2, z + depth * scale / 2,
      feet - [3.1, 5.9, 8][tier], feet - [.9, 3.1, 5.9][tier],
      {islandId: id, level, construction});
  }
  // Broken verticals flank the route and supply perspective/occlusion without
  // putting a waist-high obstacle across the destination's walkable centre.
  const height = construction === 'masonry' ? 7.4 : construction === 'binding' ? 5.2 : 3.8;
  for (const side of [-1, 1]) {
    const px = x + side * (width / 2 - 4), pz = z + depth * .19;
    solid(id + '-pier-' + side, px - .65, px + .65, pz - .65, pz + .65,
      feet, feet + height, {role: 'arch-pier', islandId: id, level, material: 'cold-wall'});
  }
  solid(id + '-lintel', x - width / 2 + 3.35, x + width / 2 - 3.35,
    z + depth * .19 - .65, z + depth * .19 + .65, feet + height, feet + height + .6,
    {islandId: id, level, construction, material: materials[construction]});
  props.push({...point(x + width / 2 - 5, z - depth / 2 + 4, feet, level),
    id: id + '-landmark', kind: 'archipelago-landmark', islandId: id, cluster,
    construction, width: 3.2, height, yaw: 0});
  return row;
}
mainDefinitions.forEach((definition, index) => island(definition, index));
optionalDefinitions.forEach(definition => island(definition));
islands.push(
  {...point(-193, -106, -4.8, 2), id: 'iii-listening-island', name: 'The listening island',
    cluster: 'middle', kind: 'listening-island', existing: true, radius: 4,
    minX: -197, maxX: -189, minZ: -110, maxZ: -101},
  {...point(-139, -92, 8.4, 0), id: 'iii-door-island', name: 'The onward island',
    cluster: 'deep', kind: 'exit-island', existing: true, radius: 4,
    minX: -143, maxX: -135, minZ: -97, maxZ: -87},
);
const byId = new Map(islands.map(row => [row.id, row]));
const destination = id => {
  const row = byId.get(id);
  return point(row.x, row.z, row.feet, row.level,
    {islandId: row.id, cluster: row.cluster, kind: row.kind});
};

// Flights use genuine horizontal treads with a 30cm maximum rise. Each flight
// is placed in the middle of a long connection, with flat approach landings at
// both ends. They never paint a slope over collision or require a jump.
function strip(id, a, b, y, width, extra = {}) {
  const horizontal = a.z === b.z;
  if (!horizontal && a.x !== b.x) throw Error('Archipelago connection must use one axis: ' + id);
  return rect(id,
    horizontal ? Math.min(a.x, b.x) : a.x - width / 2,
    horizontal ? Math.max(a.x, b.x) : a.x + width / 2,
    horizontal ? a.z - width / 2 : Math.min(a.z, b.z),
    horizontal ? a.z + width / 2 : Math.max(a.z, b.z), y,
    {role: 'archipelago-route', thickness: .55, width, ...extra});
}
function connection(id, a, b, width, extra = {}) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < .001) return [];
  if (a.x !== b.x && a.z !== b.z) throw Error('Diagonal archipelago route: ' + id);
  const at = (distance, feet, level = a.level) => point(
    round(a.x + (b.x - a.x) * distance / length),
    round(a.z + (b.z - a.z) * distance / length), round(feet), level,
    {cluster: a.cluster || b.cluster, kind: 'route', ...extra});
  const rise = b.feet - a.feet;
  const details = {level: a.level, cluster: a.cluster || b.cluster,
    construction: 'binding', material: 'case-lining', ...extra};
  if (Math.abs(rise) < 1e-6) {
    strip(id, a, b, a.feet, width, details);
    return [b];
  }
  const steps = Math.ceil(Math.abs(rise) / .3 - 1e-8);
  const flightLength = steps * .75;
  if (length < flightLength + 8) throw Error('Archipelago stair flight needs longer landings: ' + id);
  const approach = (length - flightLength) / 2;
  const first = at(approach, a.feet);
  strip(id + '-before', a, first, a.feet, width, details);
  const route = [first];
  for (let step = 0; step < steps; step++) {
    const start = at(approach + step * .75, a.feet + rise * (step + 1) / steps,
      step === steps - 1 ? b.level : a.level);
    const end = at(approach + (step + 1) * .75, start.feet, start.level);
    strip(id + '-tread-' + step, start, end, start.feet, width,
      {...details, level: start.level, role: 'stair', stairId: id, step, width,
        construction: 'masonry', material: 'cold-stone', thickness: .3,
        riser: round(Math.abs(rise) / steps)});
    route.push(at(approach + (step + .5) * .75, start.feet, start.level));
  }
  const last = at(approach + flightLength, b.feet, b.level);
  strip(id + '-after', last, b, b.feet, width, {...details, level: b.level});
  route.push(last, b);
  return route;
}
function buildRoute(id, raw, width = 5, extra = {}) {
  const route = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    route.push(...connection(id + '-' + i, raw[i - 1], raw[i], width, extra));
  }
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    rect(id + '-landing-' + i, p.x - width / 2, p.x + width / 2,
      p.z - width / 2, p.z + width / 2, p.feet,
      {level: p.level, role: 'landing', width, material: 'case-lining',
        construction: 'binding', cluster: p.cluster, ...extra});
  }
  return route;
}

const main = [
  point(-160, -92, 8.4, 0, {kind: 'entry', cluster: 'outer'}),
  point(-160, -135, 8.4, 0, {cluster: 'outer'}), destination('iii-arrival-court'),
  point(-215, -150, 8.4, 0, {cluster: 'outer'}), destination('iii-echo-colonnade'),
  point(-290, -170, 8.4, 0, {cluster: 'outer'}), destination('iii-soundboard-harbour'),
  point(-385, -170, 2.4, 1, {cluster: 'outer'}), destination('iii-inverted-chapel'),
  point(-385, -235, 2.4, 1, {cluster: 'middle'}), destination('iii-binding-garden'),
  point(-215, -235, -4.8, 2, {cluster: 'middle'}), destination('iii-listener-court'),
  point(-215, -106, -4.8, 2, {cluster: 'middle'}), destination('iii-listening-island'),
  point(-193, -65, -12.6, 3, {cluster: 'middle'}),
  point(-240, -65, -12.6, 3, {cluster: 'deep'}), destination('iii-underwell'),
  point(-240, -5, -12.6, 3, {cluster: 'deep'}), destination('iii-deep-arcade'),
  point(-390, -5, -12.6, 3, {cluster: 'deep'}), destination('iii-counterweight-yard'),
  point(-390, -105, -4.8, 2, {cluster: 'deep'}), destination('iii-return-observatory'),
  point(-300, -65, 8.4, 0, {cluster: 'deep'}),
  point(-140.3, -65, 8.4, 0, {cluster: 'deep'}),
  point(-140.3, -92, 8.4, 0, {kind: 'exit-approach', cluster: 'deep', islandId: 'iii-door-island'}),
];
export const ARCHIPELAGO_MAIN_ROUTE = freeze(buildRoute('iii-main', main));

const optionalRoutes = [
  {id: 'iii-gallery-loop', fromIslandId: 'iii-arrival-court', toIslandId: 'iii-echo-colonnade',
    islandId: 'iii-case-gallery', points: [destination('iii-arrival-court'),
      point(-215, -180, 8.4, 0, {cluster: 'outer'}), point(-250, -180, 8.4, 0, {cluster: 'outer'}),
      destination('iii-case-gallery'), point(-290, -200, 8.4, 0, {cluster: 'outer'}), destination('iii-echo-colonnade')]},
  {id: 'iii-observatory-loop', fromIslandId: 'iii-soundboard-harbour', toIslandId: 'iii-inverted-chapel',
    islandId: 'iii-broken-observatory', points: [destination('iii-soundboard-harbour'),
      point(-425, -170, 2.4, 1, {cluster: 'middle'}), destination('iii-broken-observatory'),
      point(-425, -240, 2.4, 1, {cluster: 'middle'}), destination('iii-inverted-chapel')]},
  {id: 'iii-garden-loop', fromIslandId: 'iii-binding-garden', toIslandId: 'iii-listener-court',
    islandId: 'iii-memory-garden', points: [destination('iii-binding-garden'),
      point(-260, -235, -4.8, 2, {cluster: 'middle'}), destination('iii-memory-garden'),
      point(-215, -180, -4.8, 2, {cluster: 'middle'}), destination('iii-listener-court')]},
  {id: 'iii-bells-loop', fromIslandId: 'iii-underwell', toIslandId: 'iii-deep-arcade',
    islandId: 'iii-low-bells', points: [destination('iii-underwell'),
      point(-240, 45, -12.6, 3, {cluster: 'deep'}), destination('iii-low-bells'),
      point(-325, 45, -12.6, 3, {cluster: 'deep'}), destination('iii-deep-arcade')]},
];
export const ARCHIPELAGO_OPTIONAL_ROUTES = freeze(optionalRoutes.map(route => ({
  ...route, width: 3, points: buildRoute(route.id, route.points, 3, {optional: true}),
})));

// The refuge's protected disk is fully supported and visibly offset from the
// route centre. HUSH has room to stop outside it rather than occupying its exit.
for (const [id, islandId, dx, dz] of [
  ['iii-refuge-colonnade', 'iii-echo-colonnade', 0, 12],
  ['iii-refuge-harbour', 'iii-soundboard-harbour', 0, 13],
  ['iii-refuge-chapel', 'iii-inverted-chapel', 0, -14],
  ['iii-refuge-garden', 'iii-binding-garden', 0, -14],
  ['iii-refuge-underwell', 'iii-underwell', 0, -14],
  ['iii-refuge-arcade', 'iii-deep-arcade', 0, 14],
  ['iii-refuge-yard', 'iii-counterweight-yard', -15, 0],
  ['iii-refuge-return', 'iii-return-observatory', 0, -14],
]) {
  const parent = byId.get(islandId);
  const p = point(parent.x + dx, parent.z + dz, parent.feet, parent.level,
    {id, islandId, cluster: parent.cluster, kind: 'refuge', radius: 2.6, standOff: 4});
  refuges.push(p);
  rect(id + '-bay', p.x - 4.5, p.x + 4.5, p.z - 4.5, p.z + 4.5, p.feet,
    {role: 'refuge', islandId, level: p.level, construction: 'binding', material: 'case-lining'});
  props.push({...p, id: id + '-marker', kind: 'archipelago-refuge', width: 3, height: 3.5});
}
refuges.push(point(-193, -106, -4.8, 2, {id: 'iii-refuge-listening',
  islandId: 'iii-listening-island', cluster: 'middle', kind: 'refuge', radius: 1.28, standOff: 4}));

export const ARCHIPELAGO_CHASE_SECTIONS = freeze([
  {id: 'iii-chase-outer', fromIslandId: 'iii-echo-colonnade', toIslandId: 'iii-inverted-chapel',
    refugeIds: ['iii-refuge-colonnade', 'iii-refuge-harbour', 'iii-refuge-chapel']},
  {id: 'iii-chase-return', fromIslandId: 'iii-deep-arcade', toIslandId: 'iii-return-observatory',
    refugeIds: ['iii-refuge-arcade', 'iii-refuge-yard', 'iii-refuge-return']},
]);
const mainMetres = ARCHIPELAGO_MAIN_ROUTE.reduce((sum, p, index, rows) => index
  ? sum + Math.hypot(p.x - rows[index - 1].x, p.z - rows[index - 1].z, p.feet - rows[index - 1].feet) : sum, 0);
export const ARCHIPELAGO_ISLANDS = freeze(islands);
export const ARCHIPELAGO_REFUGES = freeze(refuges);
export const ARCHIPELAGO_SURFACES = freeze(surfaces);
export const ARCHIPELAGO_SOLIDS = freeze(solids);
export const ARCHIPELAGO_PROPS = freeze(props);
export const SOURCE_III_ARCHIPELAGO = freeze({
  version: 1, chartId: 0, phase: 'catch', mainWidth: 5, branchWidth: 3,
  mainMetres: round(mainMetres),
  bounds: {minX: -455, maxX: -130, minZ: -275, maxZ: 75, minY: -42, maxY: 125},
  clusters: [
    {id: 'outer', name: 'The open instruments', islandIds: islands.filter(i => i.cluster === 'outer').map(i => i.id)},
    {id: 'middle', name: 'The remembered buildings', islandIds: islands.filter(i => i.cluster === 'middle').map(i => i.id)},
    {id: 'deep', name: 'The underside and return', islandIds: islands.filter(i => i.cluster === 'deep').map(i => i.id)},
  ],
  mainIslandIds: mainDefinitions.map(d => d[0]), optionalIslandIds: optionalDefinitions.map(d => d[0]),
  chaseSections: ARCHIPELAGO_CHASE_SECTIONS, refuges: ARCHIPELAGO_REFUGES,
  entry: ARCHIPELAGO_MAIN_ROUTE[0], exitApproach: ARCHIPELAGO_MAIN_ROUTE.at(-1),
  // First-play duration requires native playtesting. These are transparent
  // ideal transit bounds, not an elapsed-time gate or a human timing claim.
  idealTransitSeconds: {walk: round(mainMetres / 2.6), run: round(mainMetres / 5.2), sprint: round(mainMetres / 7.5)},
});
