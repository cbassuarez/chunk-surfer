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
    :hook.id==='cathedral-choir'?0:hook.id==='cathedral-side-chapel'?3:1;
  return Object.freeze({at,facing,zone,group:hook.group,floor:hook.floor,component:hook.component});
};

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
  'practice-wing': Object.freeze({ at:{x:60,y:65}, facing:2, zone:ZONE.practice, group:'upper', floor:4.8,component:'practice' }),
  'academic-gallery': Object.freeze({ at:{x:23,y:246}, facing:2, zone:ZONE.academic, group:'academic', floor:10,component:'academic' }),
  chapel: Object.freeze({ at:{x:92,y:74}, facing:0, zone:ZONE.chapel, group:'upper', floor:4.8,component:'chapel' }),
  'plant-room': Object.freeze({ at:{x:31,y:30.5}, facing:1, zone:ZONE.plant, group:'basement', floor:-4,component:'basement' }),
  ...Object.fromEntries(CHURCH_GOD_HOOKS.map((hook)=>[hook.id,cathedralHook(hook)])),
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
