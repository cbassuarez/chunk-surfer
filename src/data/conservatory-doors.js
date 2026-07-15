// Explicit door schedule for Ellery Conservatory. Door geometry, behaviour,
// locks and acoustic loss are authored here; portal width never infers leaves.

export const DOOR_ARCHETYPE = Object.freeze({
  PUBLIC_GLAZED_PAIR: 'public-glazed-pair',
  HALL_ACOUSTIC_PAIR: 'hall-acoustic-pair',
  CHAPEL_OAK_PAIR: 'chapel-oak-pair',
  PRACTICE_ACOUSTIC_SINGLE: 'practice-acoustic-single',
  SERVICE_FIRE_SINGLE: 'service-fire-single',
  STAFF_HALF_GLAZED: 'staff-half-glazed',
  POOL_FIRE_SINGLE: 'pool-fire-single',
  TOWER_SERVICE_SINGLE: 'tower-service-single',
});

export const DOOR_ARCHETYPES = Object.freeze({
  [DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0, 1], leaf: { width: .88, height: 2.35, depth: .055 },
    aperture: { width: 1.95, height: 3.4 }, head: 'glazed-transom',
    construction: 'mahogany-glass', openSeconds: 1, closeSeconds: 1,
    closer: 'none', acousticLossDb: 6, mesh: 'door_leaf_public', frameMesh: 'door_frame_pair', headMesh: 'door_head_transom',
  }),
  [DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0], leaf: { width: 1.02, height: 2.35, depth: .08 },
    aperture: { width: 2.10, height: 3.4 }, head: 'acoustic-overpanel',
    construction: 'dark-oak-acoustic', openSeconds: .85, closeSeconds: 1.25,
    closer: 'heavy', acousticLossDb: 18, mesh: 'door_leaf_hall', frameMesh: 'door_frame_pair', headMesh: 'door_head_overpanel',
  }),
  [DOOR_ARCHETYPE.CHAPEL_OAK_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [1], leaf: { width: .98, height: 2.40, depth: .075 },
    aperture: { width: 2.04, height: 3.4 }, head: 'tympanum',
    construction: 'panelled-dark-oak', openSeconds: 1.05, closeSeconds: 1.05,
    closer: 'none', acousticLossDb: 13, mesh: 'door_leaf_chapel', frameMesh: 'door_frame_pair', headMesh: 'door_head_tympanum',
  }),
  [DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: .95, height: 2.15, depth: .065 },
    aperture: { width: 1, height: 3.4 }, head: 'masonry-infill',
    construction: 'oak-acoustic', openSeconds: .72, closeSeconds: .95,
    closer: 'standard', acousticLossDb: 16, mesh: 'door_leaf_practice', frameMesh: 'door_frame_single_oak', headMesh: 'door_head_infill',
  }),
  [DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: 1, height: 2.10, depth: .045 },
    aperture: { width: 1, height: 3.4 }, head: 'masonry-infill',
    construction: 'grey-green-steel', openSeconds: .55, closeSeconds: .78,
    closer: 'standard', acousticLossDb: 9, mesh: 'door_leaf_service', frameMesh: 'door_frame_single_steel', headMesh: 'door_head_infill',
  }),
  [DOOR_ARCHETYPE.STAFF_HALF_GLAZED]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: .95, height: 2.15, depth: .05 },
    aperture: { width: 1, height: 3.4 }, head: 'masonry-infill',
    construction: 'oak-wired-glass', openSeconds: .7, closeSeconds: .7,
    closer: 'none', acousticLossDb: 7, mesh: 'door_leaf_staff', frameMesh: 'door_frame_single_oak', headMesh: 'door_head_infill',
  }),
  [DOOR_ARCHETYPE.POOL_FIRE_SINGLE]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: 1.05, height: 2.15, depth: .05 },
    aperture: { width: 1.05, height: 3.4 }, head: 'masonry-infill',
    construction: 'galvanised-wired-glass', openSeconds: .62, closeSeconds: .82,
    closer: 'standard', acousticLossDb: 9, mesh: 'door_leaf_pool', frameMesh: 'door_frame_single_steel', headMesh: 'door_head_infill',
  }),
  [DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: .90, height: 1.95, depth: .055 },
    aperture: { width: 1, height: 3.4 }, head: 'low-stone-lintel',
    construction: 'painted-plank-timber', openSeconds: .8, closeSeconds: .8,
    closer: 'none', acousticLossDb: 10, mesh: 'door_leaf_tower', frameMesh: 'door_frame_tower', headMesh: 'door_head_tower',
  }),
});

const D = (id, archetype, legacyId, options = {}) => {
  const at=options.at || (() => { const [x, y] = legacyId.split(',').map(Number); return { x: x / 2, y: y / 2 }; })();
  return Object.freeze({
    id, archetype, legacyIds: legacyId ? [legacyId] : [], at, x:at.x, y:at.y,
    hinge: options.hinge || 'left', swing: options.swing || 'escape', widthAxis:options.widthAxis||'x',
    key: options.key || null, initialState: options.open ? 'open' : 'closed', open:!!options.open,
    wedged: !!options.wedged, closerArmed: !!options.closerArmed,
    activeLeaves: options.activeLeaves || DOOR_ARCHETYPES[archetype].activeLeaves,
  });
};

export const CONSERVATORY_DOORS = Object.freeze([
  D('front-main', DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR, '159,7', { open: true, swing: 'outward', activeLeaves: [0, 1] }),
  D('hall-stage-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '197,23', { open: true, hinge: 'right', swing: 'stage-out', widthAxis:'y' }),
  D('b3-plant-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '51,25', { hinge: 'left', swing: 'plant-out', widthAxis:'y' }),
  D('dock-foyer-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '149,27', { open: true, key: 'master', hinge: 'right', swing: 'escape', widthAxis:'y' }),
  D('dock-inner-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '131,33', { open: true, key: 'master', hinge: 'left', swing: 'escape' }),
  D('foh-office', DOOR_ARCHETYPE.STAFF_HALF_GLAZED, '179,41', { key: 'master', hinge: 'left', swing: 'office-in', widthAxis:'y' }),
  D('hall-vestibule', DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR, '197,51', { hinge: 'right', swing: 'hall-out', activeLeaves: [0], widthAxis:'y' }),
  D('pool-lobby', DOOR_ARCHETYPE.POOL_FIRE_SINGLE, '169,55', { hinge: 'right', swing: 'dry-out' }),
  D('hall-rear-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '197,73', { open: true, hinge: 'left', swing: 'escape', widthAxis:'y' }),
  D('upper-bridge-west', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '154,111', { open: true, hinge: 'right', swing: 'escape', widthAxis:'y' }),
  D('upper-bridge-east', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '201,111', { open: true, hinge: 'left', swing: 'escape', widthAxis:'y' }),
  D('practice-west-1', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '129,113', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-1', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '137,113', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('chapel-c17', DOOR_ARCHETYPE.CHAPEL_OAK_PAIR, '186,116', { key: 'chapel', hinge: 'right', swing: 'chapel-in', activeLeaves: [1] }),
  D('practice-west-2', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '129,127', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-2', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '137,127', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('practice-side', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '153,137', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('practice-west-3', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '129,141', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-3', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '137,141', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('practice-west-4', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '129,155', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-4', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '137,155', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('tower-hatch', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, '27,263', { at:{x:33,y:155},key: 'tower-live', hinge: 'right', swing: 'landing-out', widthAxis:'y' }),
  D('bell-chamber-entry', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, null, { at:{x:69,y:158},key:'tower-live',hinge:'left',swing:'vestibule-in',widthAxis:'y' }),
  D('organ-loft-service', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, null, { at:{x:69,y:163},key:'tower-cleared',hinge:'right',swing:'landing-out',widthAxis:'y' }),
  D('organ-loft-nave', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, null, { at:{x:100,y:157},key:'tower-cleared',hinge:'left',swing:'landing-out',widthAxis:'x' }),
]);

export const DOOR_BY_ID = Object.freeze(Object.fromEntries(CONSERVATORY_DOORS.map((door) => [door.id, door])));

export function doorDefinitionWithArchetype(definition) {
  const archetype = DOOR_ARCHETYPES[definition?.archetype];
  if (!archetype) throw new Error(`unknown door archetype ${definition?.archetype}`);
  return { ...archetype, ...definition, leaf: { ...archetype.leaf }, aperture: { ...archetype.aperture } };
}
