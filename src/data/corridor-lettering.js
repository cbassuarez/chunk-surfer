// Literal labels shared by the generated corridor hosts and their physical
// lettering. This module reads data only; it never compiles or mutates a plan.
import {FACILITY_SPACES} from './building-map.js';

const byDoor={};
for(const space of FACILITY_SPACES)for(const id of space.doorIds||[])
  if(!Object.hasOwn(byDoor,id))byDoor[id]=space;
// Aliased doors retain the first space owner, exactly as doorPlates has always
// named them. A second space cannot silently rename an already-issued plate.
export const CORRIDOR_SPACE_BY_DOOR_ID=Object.freeze(byDoor);

export const LANDING_FITTINGS = Object.freeze({
  'main-basement-stair/ground-landing': {
    mesh: 'stair_bulkhead_pair', label: 'GROUND',
    first: 'A caged bulkhead pair over the head of the basement stair, with a sign plate between them reading GROUND.',
    again: 'Ground. The way back up, if the stair is still where you left it.',
  },
  'main-basement-stair/b3-landing': {
    mesh: 'stair_bulkhead_pair', label: 'DANCE WING / B1-B5',
    first: 'A bulkhead pair at the foot of the stair. The plate lists the dance wing and the studios on it, B1 to B5.',
    again: 'B4 is not on the plate. It is not on the plan either.',
  },
  'main-open-well/upper-floor-landing': {
    mesh: 'stair_sconce_pair_opal', label: 'PRACTICE WING',
    first: 'A pair of opal sconces on the landing wall, with a small dark plate between them: THE PRACTICE WING.',
    again: 'The plate has an arrow on it. It points along a corridor that is not quite where it says.',
  },
  'main-open-well/academic-floor-landing': {
    mesh: 'stair_sconce_pair_opal', label: 'VOCAL STUDIES',
    first: 'Opal sconces and a plate at the top of the well: VOCAL STUDIES, and a list of studios.',
    again: 'The list is longer than the number of doors on this floor.',
  },
});

// Existing room-plate envelope and the clear gap between the two landing lamps.
// Negative Z is the manufactured front. Both runtime ink and builder panels use
// these same datums, so neither can drift from the supporting face.
export const CORRIDOR_LETTERING_FACES=Object.freeze({
  door:Object.freeze({center:[0,.16,-.0181],readerRight:[-1,0,0],up:[0,1,0],widthM:.44,heightM:.285}),
  landing:Object.freeze({center:[0,-.04,-.0526],readerRight:[-1,0,0],up:[0,1,0],widthM:2.28,heightM:.26,
    panelCenter:[0,-.04,-.04],panelSize:[2.36,.32,.025]}),
});
