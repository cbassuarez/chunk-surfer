// Explicit door schedule for Ellery Conservatory. Door geometry, behaviour,
// locks and acoustic loss are authored here; portal width never infers leaves.

export const DOOR_ARCHETYPE = Object.freeze({
  PUBLIC_GLAZED_PAIR: 'public-glazed-pair',
  BAY_GOODS_PAIR: 'bay-goods-pair',
  HALL_ACOUSTIC_PAIR: 'hall-acoustic-pair',
  CHAPEL_OAK_PAIR: 'chapel-oak-pair',
  PRACTICE_ACOUSTIC_SINGLE: 'practice-acoustic-single',
  SERVICE_FIRE_SINGLE: 'service-fire-single',
  SERVICE_WIRED_PAIR: 'service-wired-pair',
  STAFF_HALF_GLAZED: 'staff-half-glazed',
  POOL_FIRE_SINGLE: 'pool-fire-single',
  POOL_GLAZED_PAIR: 'pool-glazed-pair',
  TOWER_SERVICE_SINGLE: 'tower-service-single',
  ACADEMIC_WIRED_GLASS: 'academic-wired-glass',
});

export const DOOR_ARCHETYPES = Object.freeze({
  [DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0, 1], leaf: { width: .88, height: 2.35, depth: .055 },
    aperture: { width: 1.95, height: 3.4 }, head: 'glazed-transom',
    construction: 'mahogany-glass', openSeconds: 1, closeSeconds: 1,
    closer: 'none', acousticLossDb: 6, mesh: 'door_leaf_public', frameMesh: 'door_frame_pair', headMesh: 'door_head_transom',
  }),
  // The bay's goods doors. Three metres of opening, two ribbed steel leaves, and
  // the only thing in the building wide enough to get a flight case through — in
  // a bay that has not seen a lorry in years. `services-core` is the key nobody
  // is issued (see spur-substation), which is how a door says "barred from the
  // inside" without inventing a lock state for it.
  [DOOR_ARCHETYPE.BAY_GOODS_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0, 1], leaf: { width: 1.48, height: 3.05, depth: .07 },
    aperture: { width: 3.0, height: 3.4 }, head: 'masonry-infill',
    construction: 'ribbed-galvanised-steel', openSeconds: 1.6, closeSeconds: 2.1,
    closer: 'standard', acousticLossDb: 11, mesh: 'door_leaf_bay_goods', frameMesh: 'door_frame_goods', headMesh: 'door_head_goods',
  }),
  [DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0], leaf: { width: 1.02, height: 2.35, depth: .08 },
    aperture: { width: 2.10, height: 3.4 }, head: 'acoustic-overpanel',
    construction: 'dark-oak-acoustic', openSeconds: .85, closeSeconds: 1.25,
    closer: 'heavy', acousticLossDb: 18, mesh: 'door_leaf_hall', frameMesh: 'door_frame_hall', headMesh: 'door_head_overpanel',
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
  // The Scene Dock's freight route. This is a working pair rather than a
  // single leaf hidden in a one-metre stem: wired glass catches the torch,
  // while the full opening continues the three-metre handling lane.
  [DOOR_ARCHETYPE.SERVICE_WIRED_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0, 1], leaf: { width: .91, height: 2.20, depth: .05 },
    aperture: { width: 2.0, height: 3.4 }, head: 'glazed-transom',
    construction: 'galvanised-wired-glass', openSeconds: .72, closeSeconds: 1.02,
    closer: 'paired', acousticLossDb: 9, mesh: 'door_leaf_pool', frameMesh: 'door_frame_pair', headMesh: 'door_head_transom',
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
  [DOOR_ARCHETYPE.POOL_GLAZED_PAIR]: Object.freeze({
    leafCount: 2, activeLeaves: [0, 1], leaf: { width: .91, height: 2.28, depth: .05 },
    aperture: { width: 2.0, height: 3.4 }, head: 'glazed-transom',
    construction: 'galvanised-wired-glass', openSeconds: .76, closeSeconds: 1.05,
    closer: 'paired', acousticLossDb: 8, mesh: 'door_leaf_pool_pair', frameMesh: 'door_frame_pair', headMesh: 'door_head_transom',
  }),
  [DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: .90, height: 1.95, depth: .055 },
    aperture: { width: 1, height: 3.4 }, head: 'low-stone-lintel',
    construction: 'painted-plank-timber', openSeconds: .8, closeSeconds: .8,
    closer: 'none', acousticLossDb: 10, mesh: 'door_leaf_tower', frameMesh: 'door_frame_tower', headMesh: 'door_head_tower',
  }),
  [DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS]: Object.freeze({
    leafCount: 1, activeLeaves: [0], leaf: { width: .95, height: 2.20, depth: .055 },
    aperture: { width: 1, height: 3.4 }, head: 'glazed-transom',
    construction: 'old-oak-wired-glass-mortise', openSeconds: .72, closeSeconds: .86,
    closer: 'standard', acousticLossDb: 12, mesh: 'door_leaf_staff', frameMesh: 'door_frame_single_oak', headMesh: 'door_head_transom',
  }),
});

const D = (id, archetype, legacyId, options = {}) => {
  const at=options.at || (() => { const [x, y] = legacyId.split(',').map(Number); return { x: x / 2, y: y / 2 }; })();
  return Object.freeze({
    id, archetype, legacyIds: [...new Set([legacyId,...(options.legacyIds||[])].filter(Boolean))], at, x:at.x, y:at.y,
    hinge: options.hinge || 'left', swing: options.swing || 'escape', widthAxis:options.widthAxis||'x',
    key: options.key || null, initialState: options.open ? 'open' : 'closed', open:!!options.open,
    wedged: !!options.wedged, closerArmed: !!options.closerArmed,
    closer: options.closer || DOOR_ARCHETYPES[archetype].closer,
    access: options.access || 'both', insideSide: options.insideSide === -1 ? -1 : 1,
    activeLeaves: options.activeLeaves || DOOR_ARCHETYPES[archetype].activeLeaves,
    renderGroups: Object.freeze([...(options.renderGroups || [])]),
  });
};

export const CONSERVATORY_DOORS = Object.freeze([
  // The public front was sealed when Ellery closed. It is still an architectural
  // entrance—not an open portal into an unbuilt outside—and the closure key is
  // deliberately absent from the recordist's ring.
  D('front-main', DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR, '159,7', { key:'closure-order', swing: 'outward', activeLeaves: [0, 1] }),
  D('hall-stage-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '197,23', { open: true, hinge: 'right', swing: 'stage-out', widthAxis:'y' }),
  // ── the sub-basement dance wing ───────────────────────────────────────────
  // Studio to studio through the old service wall: this used to be the way to
  // the plant room, before the plant room ended up on the other side.
  D('b3-b2-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '51,25', { hinge: 'left', swing: 'b2-in', widthAxis:'y' }),
  // Off the corridor, north side. Acoustic leaves, all three wedged open the way
  // a working building leaves studio doors when nobody is recording.
  D('b2-corridor', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '57,43', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'x' }),
  D('b1-corridor', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '87,43', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'x' }),
  D('store-corridor', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '5,43', { hinge: 'right', swing: 'store-in', widthAxis:'x' }),
  // South side: room 5, and the plant room at the end of its own stub.
  D('room5-corridor', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '25,51', { open: true, hinge: 'left', swing: 'room-in', widthAxis:'x' }),
  // The plant room is only reachable down the spur now. Its north and east walls
  // are solid pipe run, so this is the one wall a door can go in — and it means
  // the bent rig is behind the worst two metres of air in the building.
  D('plant-spur', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '59,61', { hinge: 'left', swing: 'plant-out', widthAxis:'y' }),
  // The two rooms off the spur. `services-core` is not on the standard keyring
  // and is not issued anywhere in the building: these do not open, and the point
  // of them is that you can hear what is behind them.
  D('spur-substation', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '51,73', { key: 'services-core', hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('spur-tank', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '59,75', { key: 'services-core', hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  // The old lift landing, in B1's north wall. The master key still turns it, and
  // behind it is the shaft: a pit, no car, and eight metres of nothing overhead.
  D('b1-lift-hatch', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '87,23', { key: 'master', hinge: 'left', swing: 'shaft-in', widthAxis:'x' }),
  // THE GREY GOODS DOORS. The pair he comes in through — the get-in's west wall,
  // facing the loading bay and directly ahead of the apron. The former personnel
  // leaf beside them was a duplicate story threshold: the building had acquired
  // two different answers to "the door you came in through". Keep the stable id
  // every progression/save contract already uses, but give it the real three-
  // metre pair and its two active leaves.
  //
  // It USED to be the door in a sealed room's north wall with nothing authored
  // behind it: a threshold you could stand in and not pass. Now the far side is
  // the bay, and he really does walk through it. Keyed to his own master key,
  // which is why he can. The closer takes it shut behind him, and after that it
  // behaves exactly as it always did — he never opens it a second time. Reaching
  // for it runs the post-door beat and the beat retires it into masonry, so the
  // bay, the yard and the weather go with it. See retireDoor / postDoorThought.
  D('dock-grey-exterior', DOOR_ARCHETYPE.BAY_GOODS_PAIR, '115,20', {
    open:false,key:'master',hinge:'left',swing:'escape',widthAxis:'y',activeLeaves:[0,1],
  }),
  // Both Scene Dock exits now occupy the wall they visually belong to. Their
  // ids and old addresses remain save aliases; only the live portal centres
  // move to the direct, one-wall-deep thresholds.
  D('dock-foyer-service', DOOR_ARCHETYPE.STAFF_HALF_GLAZED, '149,27', {
    at:{x:74,y:13.5},open:true,key:'master',hinge:'right',swing:'escape',widthAxis:'y',
  }),
  D('dock-inner-service', DOOR_ARCHETYPE.SERVICE_WIRED_PAIR, '131,33', {
    at:{x:65,y:15.5},open:true,key:'master',hinge:'left',swing:'escape',widthAxis:'x',activeLeaves:[0,1],
  }),
  D('foh-office', DOOR_ARCHETYPE.STAFF_HALF_GLAZED, '189,27', { key: 'master', hinge: 'left', swing: 'office-in', widthAxis:'x' }),
  D('hall-vestibule', DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR, '197,51', {
    hinge:'right',swing:'hall-out',activeLeaves:[0],widthAxis:'y',renderGroups:['ground','hall'],
  }),
  D('pool-lobby', DOOR_ARCHETYPE.POOL_GLAZED_PAIR, '168,55', {
    at:{x:84,y:27.5},legacyIds:['169,55'],hinge:'right',swing:'dry-out',activeLeaves:[0,1],
  }),
  D('hall-rear-service', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '197,73', { open: true, hinge: 'left', swing: 'escape', widthAxis:'y' }),
  D('upper-bridge-west', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '154,111', { open: true, hinge: 'right', swing: 'escape', widthAxis:'y' }),
  D('upper-bridge-east', DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE, '201,111', { open: true, hinge: 'left', swing: 'escape', widthAxis:'y' }),
  // The wing sits five metres west of where it used to, so its corridor lands on
  // the stair's own axis. These eight leaves came with it.
  D('practice-west-1', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '119,119', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-1', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '127,119', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('chapel-c17', DOOR_ARCHETYPE.CHAPEL_OAK_PAIR, '186,116', { key: 'chapel', hinge: 'right', swing: 'chapel-in', activeLeaves: [1] }),
  D('practice-west-2', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '119,133', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-2', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '127,133', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('practice-side', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '153,137', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('practice-west-3', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '119,147', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-3', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '127,147', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('practice-west-4', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '119,161', { open: true, wedged: true, hinge: 'left', swing: 'room-in', widthAxis:'y' }),
  D('practice-east-4', DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE, '127,161', { open: true, wedged: true, hinge: 'right', swing: 'room-in', widthAxis:'y' }),
  D('tower-hatch', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, '27,263', { at:{x:33,y:155},key: 'tower-live', hinge: 'right', swing: 'landing-out', widthAxis:'y' }),
  D('bell-chamber-entry', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, null, { at:{x:69,y:158},key:'tower-live',hinge:'left',swing:'vestibule-in',widthAxis:'y' }),
  D('organ-loft-service', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, null, { at:{x:69,y:163},key:'tower-cleared',hinge:'right',swing:'landing-out',widthAxis:'y' }),
  D('organ-loft-nave', DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, null, { at:{x:100,y:157},key:'tower-cleared',hinge:'left',swing:'landing-out',widthAxis:'x' }),
  ...[
    ['academic-classroom-west-1',9,244,'right'],
    ['academic-classroom-west-2',9,251,'right'],['academic-classroom-east-2',13,251,'left'],
    ['academic-classroom-west-3',9,258,'right'],['academic-classroom-east-3',13,258,'left'],
    ['academic-classroom-west-4',9,264,'right'],['academic-classroom-east-4',13,264,'left'],
  ].map(([id,x,y,hinge])=>D(id,DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS,null,{at:{x,y},key:'academic-core',hinge,swing:'classroom-in',widthAxis:'y'})),
  // The lobby's corridor door: same leaf as the classrooms, no lock. It is the
  // other half of the way through.
  D('academic-lobby-core',DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS,null,{at:{x:13,y:244},open:true,hinge:'left',swing:'room-in',widthAxis:'y'}),
  // ── the third floor, made walkable ────────────────────────────────────────
  // The north-east room is the LOBBY: one room given over to circulation so the
  // core corridor becomes a circuit instead of a spine with a dead end at both
  // ends. Its two doors are the only unlocked openings on this floor — the pair
  // that lets you through, and nothing that lets you into a classroom.
  D('academic-gallery-lobby',DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS,'45,489',{open:true,hinge:'left',swing:'gallery-in',widthAxis:'y'}),
  D('academic-office-locked-1',DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS,null,{at:{x:3,y:269},key:'academic-core',hinge:'left',swing:'office-in',widthAxis:'x'}),
  D('academic-office-locked-2',DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS,null,{at:{x:9,y:269},key:'academic-core',hinge:'right',swing:'office-in',widthAxis:'x'}),
  // ── st brendan's cathedral ────────────────────────────────────────────────
  // Both leaves are honest outward exits with working closers, but there is no
  // exterior latch. The runtime enforces this direction even if debug state or
  // a saved snapshot has left a leaf open.
  D('brendan-west-door',DOOR_ARCHETYPE.CHAPEL_OAK_PAIR,null,{
    at:{x:128,y:180},hinge:'left',swing:'outward',widthAxis:'x',activeLeaves:[0,1],
    access:'exit-only',insideSide:1,closer:'standard',
  }),
  D('brendan-south-porch',DOOR_ARCHETYPE.CHAPEL_OAK_PAIR,null,{
    at:{x:136,y:198},hinge:'right',swing:'outward',widthAxis:'y',activeLeaves:[0],
    access:'exit-only',insideSide:-1,closer:'standard',
  }),
]);

export const DOOR_BY_ID = Object.freeze(Object.fromEntries(CONSERVATORY_DOORS.map((door) => [door.id, door])));

export function doorDefinitionWithArchetype(definition) {
  const archetype = DOOR_ARCHETYPES[definition?.archetype];
  if (!archetype) throw new Error(`unknown door archetype ${definition?.archetype}`);
  return { ...archetype, ...definition, leaf: { ...archetype.leaf }, aperture: { ...archetype.aperture } };
}
