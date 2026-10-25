import {pubExteriorLogicalAt} from './exterior-pub.js';
import { DOOR_ARCHETYPE } from './conservatory-doors.js';
import { ZONE } from './floorplan/legend.js';
import { CHURCH_BOUNDS, CHURCH_GOD_HOOKS, CHURCH_LEVELS } from './st-brendans.js';

const cathedralHook = (hook) => {
  const zone=ZONE[hook.zone];
  let at;
  if(hook.component==='loading_bay')at={x:50+hook.x,y:200+hook.y};
  else if(hook.component===CHURCH_LEVELS.ground.id)at={x:120+hook.x-CHURCH_BOUNDS.x0,y:180+hook.y-CHURCH_BOUNDS.y0};
  else if(hook.component===CHURCH_LEVELS.loft.id)at={x:150+hook.x-10,y:240+hook.y-57};
  else at={x:180+hook.x-10,y:240+hook.y-71};
  const facing=hook.id==='cathedral-exterior'||hook.id==='cathedral-west-nave'?2
    :hook.id==='cathedral-choir'?0:['cathedral-side-chapel','cathedral-belfry'].includes(hook.id)?3:1;
  return Object.freeze({at,facing,zone,group:hook.group,floor:hook.floor,component:hook.component});
};

// EVERY ROOM AND PLACE THE MAP KNOWS, as a warp: the arrival yard and road, the
// district town and its pub, the basement dance wing, the ground and upper
// floors, and the whole third floor. Stand points were resolved once against the
// compiled plan (open, prop-free, a step off any wall, in the room's own zone)
// and are kept here as authored metres like every other hook, so the spec can
// prove each one still lands where it says. Facing is the longest clear view,
// or the landmark itself where the point stands beside one.
export const GOD_PLACE_HOOKS = Object.freeze({
  'yard-road': Object.freeze({at:{x:61.5,y:207},facing:1,zone:ZONE.dock,group:'ground',floor:0,component:'loading_bay',layer:'ground'}),
  'yard-van': Object.freeze({at:{x:64,y:210},facing:0,zone:ZONE.dock,group:'ground',floor:0,component:'loading_bay',layer:'ground'}),
  'yard-bus-shelter': Object.freeze({at:{x:53.5,y:207},facing:0,zone:ZONE.dock,group:'ground',floor:0,component:'loading_bay',layer:'ground'}),
  'yard-lodge': Object.freeze({at:{x:74,y:211},facing:2,zone:ZONE.dock,group:'ground',floor:0,component:'loading_bay',layer:'ground'}),
  'yard-fountain': Object.freeze({at:{x:60.5,y:233},facing:2,zone:ZONE.dock,group:'ground',floor:-0.3,component:'loading_bay',layer:'ground'}),
  'district-civic-court': Object.freeze({at:{x:116.5,y:336.5},facing:1,zone:ZONE.civicCourt,group:'ground',floor:0.12,component:'exterior_civic_block',layer:'ground'}),
  'district-bus-shelter': Object.freeze({at:{x:34,y:357},facing:0,zone:ZONE.civicCourt,group:'ground',floor:0.12,component:'exterior_civic_block',layer:'ground'}),
  'district-pub-door': Object.freeze({at:{x:pubExteriorLogicalAt('pub-east-entry').x-.5,y:pubExteriorLogicalAt('pub-east-entry').y-.5},facing:2,zone:ZONE.dock,group:'ground',floor:0,component:'exterior_pub',layer:'ground'}),
  'district-pub-driver': Object.freeze({at:{x:77,y:282.5},facing:1,zone:ZONE.dock,group:'ground',floor:0,component:'loading_bay',layer:'ground'}),
  'pub-bar': Object.freeze({at:{x:43,y:446.5},facing:1,zone:ZONE.pub,group:'ground',floor:0.12,component:'exterior_pub',layer:'ground'}),
  'pub-vigil': Object.freeze({at:{x:40,y:447.5},facing:1,zone:ZONE.pub,group:'ground',floor:0.12,component:'exterior_pub',layer:'ground'}),
  'district-chapel-plaque': Object.freeze({at:{x:151,y:431},facing:3,zone:ZONE.civicCourt,group:'ground',floor:0.12,component:'exterior_civic_block',layer:'ground'}),
  'district-baths-mosaic': Object.freeze({at:{x:177,y:412},facing:0,zone:ZONE.civicCourt,group:'ground',floor:0.12,component:'exterior_civic_block',layer:'ground'}),
  'district-hall-stone': Object.freeze({at:{x:177,y:369},facing:0,zone:ZONE.civicCourt,group:'ground',floor:0.12,component:'exterior_civic_block',layer:'ground'}),
  'basement-corridor': Object.freeze({at:{x:25,y:23},facing:3,zone:ZONE.none,group:'basement',floor:-4,component:'basement',layer:'basement'}),
  'prop-store': Object.freeze({at:{x:3,y:14.5},facing:0,zone:ZONE.store,group:'basement',floor:-4.35,component:'basement',layer:'basement'}),
  'studio-b2': Object.freeze({at:{x:33,y:14},facing:0,zone:ZONE.danceStudio,group:'basement',floor:-4,component:'basement',layer:'basement'}),
  'studio-b1': Object.freeze({at:{x:45,y:15},facing:3,zone:ZONE.danceStudio,group:'basement',floor:-4,component:'basement',layer:'basement'}),
  'studio-b5': Object.freeze({at:{x:15,y:29},facing:1,zone:ZONE.danceStudio,group:'basement',floor:-4,component:'basement',layer:'basement'}),
  'services-substation': Object.freeze({at:{x:25,y:37.5},facing:1,zone:ZONE.none,group:'basement',floor:-4,component:'basement',layer:'basement'}),
  'services-tank': Object.freeze({at:{x:31,y:37.5},facing:1,zone:ZONE.plant,group:'basement',floor:-4.4,component:'basement',layer:'basement'}),
  'lift-shaft': Object.freeze({at:{x:44,y:10},facing:0,zone:ZONE.none,group:'basement',floor:-4,component:'basement',layer:'basement'}),
  'box-office': Object.freeze({at:{x:93,y:10},facing:0,zone:ZONE.foyer,group:'ground',floor:0,component:'front_atrium',layer:'ground'}),
  'public-sanitary-core': Object.freeze({at:{x:80.5,y:24.5},facing:0,zone:ZONE.foyer,group:'ground',floor:0,component:'front_atrium',layer:'ground'}),
  'ground-spine': Object.freeze({at:{x:68,y:23},facing:3,zone:ZONE.none,group:'ground',floor:0,component:'ground',layer:'ground'}),
  'main-stair-ground': Object.freeze({at:{x:138,y:26},facing:2,zone:ZONE.stair,group:'ground',floor:0,component:'main_stair_hall',layer:'main_stair_hall'}),
  'upper-landing': Object.freeze({at:{x:77,y:52.5},facing:1,zone:ZONE.none,group:'upper',floor:4.8,component:'upper',layer:'upper'}),
  'practice-corridor': Object.freeze({at:{x:61,y:70},facing:0,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-1': Object.freeze({at:{x:56,y:61.5},facing:0,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-2': Object.freeze({at:{x:68,y:61.5},facing:1,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-3': Object.freeze({at:{x:56,y:68.5},facing:0,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-4': Object.freeze({at:{x:68,y:68.5},facing:1,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-5': Object.freeze({at:{x:56,y:75.5},facing:0,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-6': Object.freeze({at:{x:68,y:75.5},facing:1,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-7': Object.freeze({at:{x:56,y:82.5},facing:0,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'practice-8': Object.freeze({at:{x:68,y:82.5},facing:1,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'ensemble-room': Object.freeze({at:{x:72,y:80},facing:3,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice',layer:'upper'}),
  'chapel-narthex': Object.freeze({at:{x:92,y:59},facing:2,zone:ZONE.chapelOuter,group:'upper',floor:4.8,component:'chapel',layer:'upper'}),
  'academic-loggia': Object.freeze({at:{x:13,y:277},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'academic-lobby': Object.freeze({at:{x:19.5,y:244},facing:2,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'academic-core': Object.freeze({at:{x:9,y:255},facing:0,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-west-1': Object.freeze({at:{x:8,y:244},facing:2,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-west-2': Object.freeze({at:{x:4,y:252},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-east-2': Object.freeze({at:{x:17,y:254},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-west-3': Object.freeze({at:{x:4,y:257},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-east-3': Object.freeze({at:{x:17,y:260},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-west-4': Object.freeze({at:{x:4,y:261.5},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'vocal-studio-4': Object.freeze({at:{x:4,y:265.5},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'classroom-east-4': Object.freeze({at:{x:17,y:265},facing:2,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'faculty-office-west': Object.freeze({at:{x:3,y:274},facing:1,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'faculty-office-east': Object.freeze({at:{x:9,y:274},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'academic-reception': Object.freeze({at:{x:15,y:274},facing:0,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
  'stripped-office': Object.freeze({at:{x:16,y:272.5},facing:3,zone:ZONE.academic,group:'academic',floor:10,component:'academic',layer:'academic'}),
});

// The God menu's PLACES tab, in this order.
export const GOD_PLACE_SECTIONS = Object.freeze([
  Object.freeze({label:'Arrival yard',hooks:Object.freeze([['yard-road','ARRIVAL ROAD / SPAWN'], ['yard-van','THE VAN'], ['yard-bus-shelter','YARD BUS SHELTER'], ['yard-lodge','PORTER\'S LODGE'], ['yard-fountain','PARK FOUNTAIN']])}),
  Object.freeze({label:'District',hooks:Object.freeze([['district-civic-court','CIVIC COURT'], ['district-bus-shelter','DISTRICT BUS SHELTER'], ['district-pub-door','THE PUB / OUTSIDE'], ['district-pub-driver','THE PUB / DRIVER'], ['pub-bar','THE PUB / BAR'], ['pub-vigil','THE PUB / VIGIL'], ['district-chapel-plaque','CHAPEL PLAQUE'], ['district-baths-mosaic','BATHS MOSAIC'], ['district-hall-stone','HALL STONE']])}),
  Object.freeze({label:'Basement',hooks:Object.freeze([['basement-corridor','DANCE WING CORRIDOR'], ['prop-store','PROP STORE'], ['studio-b2','STUDIO B2'], ['studio-b1','STUDIO B1'], ['studio-b5','STUDIO B5'], ['services-substation','SERVICES SUBSTATION'], ['services-tank','TANK ANNEX'], ['lift-shaft','OLD LIFT SHAFT']])}),
  Object.freeze({label:'Ground floor',hooks:Object.freeze([['box-office','BOX OFFICE'], ['public-sanitary-core','PUBLIC TOILETS'], ['ground-spine','GROUND SPINE'], ['main-stair-ground','MAIN STAIR / GROUND']])}),
  Object.freeze({label:'Upper floor',hooks:Object.freeze([['upper-landing','UPPER LANDING'], ['practice-corridor','PRACTICE WING CORRIDOR'], ['practice-1','PRACTICE ROOM 1'], ['practice-2','PRACTICE ROOM 2'], ['practice-3','PRACTICE ROOM 3'], ['practice-4','PRACTICE ROOM 4'], ['practice-5','PRACTICE ROOM 5'], ['practice-6','PRACTICE ROOM 6'], ['practice-7','PRACTICE ROOM 7'], ['practice-8','PRACTICE ROOM 8'], ['ensemble-room','ENSEMBLE ROOM'], ['chapel-narthex','CHAPEL NARTHEX']])}),
  Object.freeze({label:'Third floor',hooks:Object.freeze([['academic-loggia','ACADEMIC STAIR LOGGIA'], ['academic-lobby','GALLERY VESTIBULE'], ['academic-core','ACADEMIC CORE CORRIDOR'], ['classroom-west-1','CHAMBER ROOM'], ['classroom-west-2','VOCAL STUDIO 1'], ['classroom-east-2','THEORY ROOM'], ['classroom-west-3','VOCAL STUDIO 2'], ['classroom-east-3','ACADEMIC STORE'], ['classroom-west-4','VOCAL STUDIO 3'], ['vocal-studio-4','VOCAL STUDIO 4'], ['classroom-east-4','CLEARED ROOM'], ['faculty-office-west','FACULTY OFFICE WEST'], ['faculty-office-east','FACULTY OFFICE EAST'], ['academic-reception','ACADEMIC RECEPTION'], ['stripped-office','STRIPPED OFFICE']])}),
]);

// God-menu warps are camera setups, not searches.  Keep the authored metre
// coordinates here so a floorplan scale or a second disconnected zone cannot
// silently move a review shot somewhere else.
export const GOD_LOCATION_HOOKS = Object.freeze({
  'loading-bay': Object.freeze({at:{x:53,y:10},facing:1,zone:ZONE.dock,group:'ground',floor:0,component:'ground'}),
  'get-in': Object.freeze({ at:{x:65,y:10}, facing:3, zone:ZONE.getIn, group:'ground', floor:0,component:'ground' }),
  'front-atrium': Object.freeze({ at:{x:83,y:7}, facing:2, zone:ZONE.foyer, group:'ground', floor:0,component:'front_atrium' }),
  'studio-b3': Object.freeze({ at:{x:15,y:12}, facing:0, zone:ZONE.studio, group:'basement', floor:-4,component:'basement' }),
  natatorium: Object.freeze({ at:{x:85,y:30}, facing:2, zone:ZONE.natatorium, group:'ground', floor:0,component:'natatorium' }),
  'concert-hall': Object.freeze({ at:{x:102,y:15}, facing:1, zone:ZONE.hall, group:'hall', floor:-2.06,component:'hall' }),
  // Same physical X/Z, separate authored balcony addresses and height bands.
  'hall-lower-balcony': Object.freeze({at:{x:2,y:68},facing:1,zone:ZONE.hall,group:'hall',floor:3.56,component:'hall',layer:'hall_lower'}),
  'hall-upper-balcony': Object.freeze({at:{x:2,y:110},facing:1,zone:ZONE.hall,group:'hall',floor:7.06,component:'hall',layer:'hall_upper'}),
  'hall-stage': Object.freeze({at:{x:105,y:8},facing:2,zone:ZONE.hall,group:'hall',floor:-1.5,component:'hall',layer:'hall_stage'}),
  'practice-wing': Object.freeze({ at:{x:60,y:65}, facing:2, zone:ZONE.practice, group:'upper', floor:4.8,component:'practice' }),
  'academic-gallery': Object.freeze({ at:{x:23,y:246}, facing:2, zone:ZONE.academic, group:'academic', floor:10,component:'academic' }),
  chapel: Object.freeze({ at:{x:92,y:74}, facing:0, zone:ZONE.chapel, group:'upper', floor:4.8,component:'chapel' }),
  'plant-room': Object.freeze({ at:{x:31,y:30.5}, facing:1, zone:ZONE.plant, group:'basement', floor:-4,component:'basement' }),
  // THE ACADEMIC ROOF, end to end (data/academic-roof.js). The gate and the
  // ladder's foot are on the third floor; the fire escape is its own stair
  // space; everything else stands on the roof's glass at +17.
  'roof-gate': Object.freeze({ at:{x:44,y:243}, facing:0, zone:ZONE.academic, group:'academic', floor:10, component:'academic' }),
  'roof-fire-escape': Object.freeze({ at:{x:174,y:285}, facing:1, zone:ZONE.academicRoof, group:'academicRoof', floor:10, component:'academic_roof_stair' }),
  'academic-roof': Object.freeze({ at:{x:205,y:273}, facing:2, zone:ZONE.academicRoof, group:'academicRoof', floor:17, component:'academic_roof' }),
  'roof-ren': Object.freeze({ at:{x:209,y:273}, facing:1, zone:ZONE.academicRoof, group:'academicRoof', floor:17, component:'academic_roof' }),
  'roof-city-seat': Object.freeze({ at:{x:210,y:290}, facing:1, zone:ZONE.academicRoof, group:'academicRoof', floor:17, component:'academic_roof' }),
  'roof-ladder-top': Object.freeze({ at:{x:211,y:293}, facing:1, zone:ZONE.academicRoof, group:'academicRoof', floor:17, component:'academic_roof' }),
  'roof-ladder-foot': Object.freeze({ at:{x:44,y:266}, facing:1, zone:ZONE.academic, group:'academic', floor:10, component:'academic' }),
  ...Object.fromEntries(CHURCH_GOD_HOOKS.map((hook)=>[hook.id,cathedralHook(hook)])),
  ...GOD_PLACE_HOOKS,
});

// Each door row owns a stable physical leaf and the circulation-side review
// position. `normal` is expressed in authored floorplan axes; the camera faces
// back along it toward the door.
export const GOD_DOOR_HOOKS = Object.freeze({
  [DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR]: Object.freeze({doorId:'front-main',normal:[0,1],distance:2,facing:0,zone:ZONE.foyer,group:'ground',floor:0,component:'front_atrium'}),
  [DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR]: Object.freeze({doorId:'hall-vestibule',normal:[-1,0],distance:2,facing:1,zone:ZONE.foyer,group:'hall',floor:0,component:'front_atrium'}),
  [DOOR_ARCHETYPE.CHAPEL_OAK_PAIR]: Object.freeze({doorId:'chapel-c17',normal:[0,1],distance:2,facing:0,zone:ZONE.chapelOuter,group:'upper',floor:4.8,component:'chapel'}),
  [DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE]: Object.freeze({doorId:'practice-west-1',normal:[1,0],distance:2,facing:3,zone:ZONE.practice,group:'upper',floor:4.8,component:'practice'}),
  [DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE]: Object.freeze({doorId:'plant-spur',normal:[-1,0],distance:2,facing:1,zone:ZONE.none,group:'basement',floor:-4,component:'basement'}),
  [DOOR_ARCHETYPE.STAFF_HALF_GLAZED]: Object.freeze({doorId:'foh-office',normal:[0,-1],distance:2,facing:2,zone:ZONE.foyer,group:'ground',floor:0,component:'front_atrium'}),
  [DOOR_ARCHETYPE.POOL_GLAZED_PAIR]: Object.freeze({doorId:'pool-lobby',normal:[0,-1],distance:2,facing:2,zone:ZONE.foyer,group:'ground',floor:0,component:'front_atrium'}),
  [DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE]: Object.freeze({doorId:'tower-hatch',normal:[-1,0],distance:2,facing:1,zone:ZONE.bellTower,group:'tower',floor:8.6,component:'ringing_room'}),
});

export function godDoorHook(archetype){
  return GOD_DOOR_HOOKS[archetype] || null;
}
