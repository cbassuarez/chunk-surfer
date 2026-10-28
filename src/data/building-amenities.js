// Approved Option A: real public sanitation, pool washing and staff welfare.
// Logical metre addresses remain stable; a quarter-metre render correction is
// explicit because propsInit addresses the half-metre floorplan grid.
import { MATERIAL, ZONE } from './floorplan/legend.js';

const freeze = (v) => Object.freeze(v);
const prop = (id, mesh, x, y, extra = {}) => freeze({
  id, mesh, x, y, yaw: 0, scale: 1, interactive: false, blocks: false,
  renderOffsetX: x - Math.round(x * 2) / 2,
  renderOffsetZ: y - Math.round(y * 2) / 2,
  ...extra,
});
const partition = (id, x, y, width, depth, height = 3.4) => freeze({ id, x, y, width, depth, height });

export const PUBLIC_SANITARY_CORE = freeze({
  id: 'public-sanitary-core', x0: 75, x1: 82, y0: 23.5, y1: 27, floor: 0,
  anchor: freeze({ x: 78.5, y: 25.25 }), ceiling: 3.5,
});
// Wall centre-lines align with runtime cell centres. A 0.5 m proxy includes
// the player's half-cell approach margin; visible partitions are 140 mm thick.
export const PUBLIC_SANITARY_PARTITIONS = freeze([
  partition('wc-west-side', 75.25, 25.25, .5, 3.5),
  partition('wc-east-side', 81.75, 25.25, .5, 3.5),
  partition('wc-south-side', 78.5, 26.75, 7, .5),
  partition('wc-north-west', 75.625, 23.75, 1.25, .5),
  partition('wc-north-between-entries', 78.625, 23.75, 2.75, .5),
  partition('wc-north-east', 81.75, 23.75, .5, .5),
  partition('wc-large-divider', 78.25, 25.25, .5, 3.0),
  partition('wc-standard-divider', 80, 25.75, .5, 2.0),
  partition('wc-standard-north-stile', 78.625, 24.75, .25, .5),
]);

export const POOL_WASH_PARTITIONS = freeze([
  partition('pool-shower-fin-1', 73.55, 38.0, 2.5, .5, 2.2),
  partition('pool-shower-fin-2', 73.55, 39.5, 2.5, .5, 2.2),
]);

const coreProfile = () => ({ floor: 0, ceil: 3.5, zone: ZONE.foyer, material: MATERIAL.wetTile });
// Thin mesh walls and height-aware structural collision avoid replacing the
// compact plan with metre-thick masonry. These levels own its floor/ceiling
// and the TWO real door-runtime throats, not hidden amenity facades.
export const BUILDING_AMENITY_LEVELS = freeze([
  freeze({ id: 'public-sanitary-core-air', replace: true, physicalReplace: true,
    layer: 'ground', space: 'front_atrium', renderGroup: 'ground',
    origin: freeze({ x: 75, y: 23.5 }), physicalOrigin: freeze({ x: 75, y: 23.5 }), base: 0,
    rows: freeze(['FFFFFFF', 'FFFFFFF', 'FFFFFFF']), profile: coreProfile }),
  freeze({ id: 'public-sanitary-core-rear-air', replace: true, physicalReplace: true,
    layer: 'ground', space: 'front_atrium', renderGroup: 'ground',
    origin: freeze({ x: 75, y: 26 }), physicalOrigin: freeze({ x: 75, y: 26 }), base: 0,
    rows: freeze(['FFFFFFF']), profile: coreProfile }),
  ...[
    { id: 'public-wc-large-throat', x: 76.5, y: 23.5 },
    { id: 'public-wc-standard-throat', x: 79, y: 24.5 },
  ].map(({ id, x, y }) => freeze({ id, replace: true, physicalReplace: true,
    layer: 'ground', space: 'front_atrium', renderGroup: 'ground', origin: freeze({ x, y }), physicalOrigin: freeze({ x, y }),
    base: 0, rows: freeze(['+']), profile: () => ({ floor: 0, ceil: 3.4, zone: ZONE.foyer, material: MATERIAL.wetTile }) })),
]);

// A solid existing steel leaf supplies privacy; the wired-glass staff leaf is
// deliberately not reused for a WC. Both leaves start open and can be closed
// normally. There is no new key, puzzle, powered lock or automatic closer.
export const BUILDING_AMENITY_DOORS = freeze([
  ['public-wc-large', 76.5, 23.5, 'left'],
  ['public-wc-standard', 79, 24.5, 'right'],
].map(([id, x, y, hinge]) => freeze({
  id, archetype: 'service-fire-single', legacyIds: freeze([]), at: freeze({ x, y }), x, y,
  hinge, widthAxis: 'x', swing: 'room-in', key: null, initialState: 'open', open: true,
  wedged: false, closerArmed: false, closer: 'none', access: 'both', insideSide: 1,
  activeLeaves: freeze([0]), renderGroups: freeze(['ground']),
})));

export const BUILDING_AMENITY_COLLIDERS = freeze([
  ...PUBLIC_SANITARY_PARTITIONS.map((p) => freeze({ ...p, kind: 'obb', yaw: 0,
    minElevation: 0, maxElevation: p.height, spaceId: 'front_atrium' })),
  ...POOL_WASH_PARTITIONS.map((p) => freeze({ ...p, kind: 'obb', yaw: 0,
    minElevation: 0, maxElevation: p.height, spaceId: 'natatorium' })),
  freeze({ id: 'amenity-drinking-fountain-body', kind: 'obb', x: 96.78, y: 16.65, width: .64, depth: .70,
    yaw: 0, minElevation: 0, maxElevation: 1.3, spaceId: 'front_atrium' }),
  freeze({ id: 'amenity-staff-locker-body', kind: 'obb', x: 18.8, y: 275.2, width: .40, depth: 1.4,
    yaw: 0, minElevation: 10, maxElevation: 11.98, spaceId: 'academic' }),
  // Parked leaf: mesh centre(.44,1.02,.23), size(.045,2.04,.44),
  // transformed by the cupboard at80.9,26.35/yawPI. Structural OBB tests
  // have no implicit player radius, so include the same200mm body margin
  // as ordinary prop collision around this slim panel only.
  freeze({ id: 'amenity-cleaner-parked-leaf-body', kind: 'obb', x: 80.46, y: 26.12,
    width: .045 + .40, depth: .44 + .40, yaw: Math.PI,
    minElevation: 0, maxElevation: 2.04, spaceId: 'front_atrium', bodyMargin: .20,
    sourceProp: 'amenity-cleaner-cupboard' }),
]);

export const BUILDING_AMENITY_MESHES = freeze({
  amenity_public_core_shell: freeze({ w: 7, d: 3.5, h: 3.5, blocks: false }),
  amenity_pool_wash_screens: freeze({ w: 2.5, d: 2, h: 2.2, blocks: false }),
  amenity_toilet: freeze({ w: .50, d: .78, h: .99, blocks: true }),
  amenity_washbasin: freeze({ w: .57, d: .44, h: 1.08, blocks: true }),
  amenity_mirror_soap: freeze({ w: .62, d: .14, h: .82, blocks: false }),
  amenity_grab_rail: freeze({ w: .78, d: .10, h: .88, blocks: false }),
  amenity_paper_holder: freeze({ w: .19, d: .12, h: .19, blocks: false }),
  amenity_hook_rail: freeze({ w: .72, d: .12, h: .16, blocks: false }),
  amenity_floor_drain: freeze({ w: .24, d: .24, h: .025, blocks: false }),
  amenity_shower_column: freeze({ w: .38, d: .44, h: 2.18, blocks: false }),
  amenity_cleaner_cupboard: freeze({ w: .94, d: .48, h: 2.05, blocks: true }),
  amenity_staff_counter: freeze({ w: 2, d: .6, h: 1.58, blocks: true }),
  amenity_staff_service_connections: freeze({ w: .56, d: 1.18, h: 1.43, blocks: false }),
  amenity_public_drinking_fountain: freeze({ w: .56, d: .44, h: 1.3, blocks: false }),
  amenity_staff_coat_lockers: freeze({ w: 1.4, d: .40, h: 1.98, blocks: false }),
});

export const BUILDING_AMENITY_PROPS = freeze([
  prop('amenity-public-core-shell', 'amenity_public_core_shell', 78.5, 25.25, { structural: true, renderGroups: ['ground'] }),
  // The shell underside is3.42m. Match the existing detector's83.5mm crown
  // to it, including the separate large compartment; the services are isolated.
  ...[['wash',80.70,24.40],['large',76.75,25.0]].map(([room,x,y]) =>
    prop(`amenity-public-${room}-smoke-detector`, 'arch_smoke_detector', x, y,
      { elevation: 3.3365, mount: 'ceiling', structural: true, power: 'isolated', renderGroups: ['ground'] })),
  prop('amenity-pool-wash-screens', 'amenity_pool_wash_screens', 73.55, 38.75, { structural: true, renderGroups: ['ground'] }),
  prop('amenity-large-wc', 'amenity_toilet', 76.25, 26.29, { yaw: Math.PI, blocks: true, inspectAt: { x: 76.75, y: 25.25 } }),
  prop('amenity-large-wc-basin', 'amenity_washbasin', 77.95, 24.65, { yaw: Math.PI / 2, blocks: true }),
  prop('amenity-large-wc-mirror-soap', 'amenity_mirror_soap', 78.16, 24.65, { yaw: Math.PI / 2, elevation: 1.07 }),
  prop('amenity-large-wc-grab-rail', 'amenity_grab_rail', 75.34, 25.7, { yaw: -Math.PI / 2, elevation: .30 }),
  prop('amenity-large-wc-paper', 'amenity_paper_holder', 75.34, 25.35, { yaw: -Math.PI / 2, elevation: .62 }),
  prop('amenity-large-wc-hooks', 'amenity_hook_rail', 78.16, 25.8, { yaw: Math.PI / 2, elevation: 1.65 }),
  prop('amenity-large-wc-drain', 'amenity_floor_drain', 77.20, 26.05),
  prop('amenity-standard-wc', 'amenity_toilet', 79.1, 26.33, { yaw: Math.PI, blocks: true, scale: .88 }),
  prop('amenity-standard-wc-paper', 'amenity_paper_holder', 79.91, 25.9, { yaw: Math.PI / 2, elevation: .62 }),
  prop('amenity-standard-wc-hooks', 'amenity_hook_rail', 79.5, 26.66, { yaw: Math.PI, elevation: 1.65, scale: .65 }),
  prop('amenity-public-washbasin', 'amenity_washbasin', 81.46, 24.75, { yaw: Math.PI / 2, blocks: true }),
  prop('amenity-public-mirror-soap', 'amenity_mirror_soap', 81.66, 24.75, { yaw: Math.PI / 2, elevation: 1.07 }),
  prop('amenity-public-drain', 'amenity_floor_drain', 80.75, 25.35),
  prop('amenity-cleaner-cupboard', 'amenity_cleaner_cupboard', 80.9, 26.35, { yaw: Math.PI, blocks: true }),
  // The existing 140mm screens now provide the actual mounting surfaces.
  // Both shower columns face into their bay; the basin, mirror and hooks face
  // its dry north approach. Repositioning the old north-wall fixtures as one
  // translated group would leave them hanging in the middle of the deck.
  prop('amenity-pool-shower-1', 'amenity_shower_column', 72.8, 38.0875),
  prop('amenity-pool-shower-2', 'amenity_shower_column', 72.8, 39.4125, { yaw: Math.PI }),
  prop('amenity-pool-drain-1', 'amenity_floor_drain', 73.3, 38.5),
  prop('amenity-pool-drain-2', 'amenity_floor_drain', 74.0, 39.0),
  prop('amenity-pool-washbasin', 'amenity_washbasin', 74.35, 37.712, { yaw: Math.PI, blocks: true }),
  prop('amenity-pool-mirror-soap', 'amenity_mirror_soap', 74.35, 37.916, { yaw: Math.PI, elevation: 1.07 }),
  prop('amenity-pool-hooks', 'amenity_hook_rail', 73.1, 37.9175, { yaw: Math.PI, elevation: 1.7 }),
  prop('amenity-staff-tea-counter', 'amenity_staff_counter', 18.3, 271.4, { yaw: Math.PI / 2, floorOverride: 10, blocks: true, renderGroups: ['academic'] }),
  prop('amenity-staff-service-connections', 'amenity_staff_service_connections', 18.5, 271.0, { floorOverride: 10, renderGroups: ['academic'] }),
  // Asymmetric wall-mounted meshes keep their logical anchors in open air;
  // the separate exact OBBs above own their visible bodies, not anchor boxes.
  // The honours boards occupy14.175..16.225 and17.025..19.075 on this wall.
  // Keep the complete bowl/backplate in the existing gap, beyond SP03's edge.
  prop('amenity-public-drinking-fountain', 'amenity_public_drinking_fountain', 96.5, 16.65, { yaw: Math.PI / 2, structural: true, renderGroups: ['ground'] }),
  prop('amenity-staff-coat-lockers', 'amenity_staff_coat_lockers', 18.5, 275.2, { yaw: Math.PI / 2, structural: true, floorOverride: 10, renderGroups: ['academic'] }),
]);

export const BUILDING_AMENITY_RELOCATIONS = freeze([
  freeze({ id: 'pool-entry-rules', x: 95, y: 28, note: 'On the changing vestibule north wall above the attendant counter.' }),
]);

export const BUILDING_AMENITY_SURVEY_NODES = freeze([
  freeze({ id: 'public-wc-approach', x: 80.75, y: 22.75, facing: 'south', note: 'Protected rear cross aisle and both entrances.' }),
  freeze({ id: 'public-wc-large-threshold', x: 76.75, y: 23.25, facing: 'south', doorId: 'public-wc-large' }),
  freeze({ id: 'public-wc-large-interior', x: 76.75, y: 25.0, facing: 'south' }),
  freeze({ id: 'public-wc-main-wash', x: 80.75, y: 24.25, facing: 'east' }),
  freeze({ id: 'public-wc-standard-threshold', x: 79.25, y: 24.25, facing: 'south', doorId: 'public-wc-standard' }),
  freeze({ id: 'pool-wash-approach', x: 74.55, y: 37.0, facing: 'south' }),
  freeze({ id: 'pool-shower-interior', x: 74.05, y: 38.75, facing: 'west' }),
  freeze({ id: 'staff-counter-approach', x: 17.25, y: 271.25, facing: 'east', floor: 10 }),
  freeze({ id: 'public-drinking-fountain', x: 95.75, y: 16.65, facing: 'east' }),
  freeze({ id: 'staff-lockers-approach', x: 17.75, y: 275.25, facing: 'east', floor: 10 }),
]);
