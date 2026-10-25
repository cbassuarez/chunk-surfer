// AUDIOCORP facility-map definition.
//
// The conservatory floorplan remains the source of physical truth. This file
// names the map layers and the five issued recording targets; runtime geometry
// is compiled from world/floorplan.js so the map cannot drift away from the
// walls the player actually collides with.

import { ROOM_CELLS, TARGETS } from './conservatory-script.js';
import { BELL_CHAMBER_ANCHOR, ORGAN_LOFT_ANCHOR, RINGING_ROOM_ANCHOR } from './bell-tower-layout.js';
import { SCENE_DOCK_LABEL } from './space-labels.js';
import { ACADEMIC_ROOF, roofPointToPhysical } from './academic-roof.js';
import { MAIN_STAIR_LAYOUT } from './floorplan/conservatory.js';
import { EXTERIOR_MAP_SPACE_IDS } from './exterior-map-ids.js';

const freezePoint = (point) => Object.freeze({ x: Number(point.x), y: Number(point.y) });
const S = (id, label, logical, extra = {}) => Object.freeze({
  id: `space:${id}`,
  label,
  shortLabel: extra.shortLabel || label.split(/\s+/).map((word) => word[0] || '').join('').slice(0, 5),
  logical: freezePoint(logical),
  visibility: 'issued',
  selectable: true,
  waypointable: true,
  doorIds: Object.freeze([...(extra.doorIds || [])]),
  currentRadius: Number(extra.currentRadius) || 5,
  ...extra,
});
const A=(id,label,logical,extra={})=>S(id,label,logical,{
  floorId:'academic',
  mapPosition:freezePoint({x:logical.x+50.5,y:logical.y-239.5}),
  ...extra,
});

// The paper plan names the building, not only the five rooms on the work order.
// These anchors stay explicit because a zone id cannot distinguish B1 from B2,
// the individual practice rooms, or either side of the academic core.
export const FACILITY_SPACES = Object.freeze([
  S('basement-corridor','DANCE WING CORRIDOR',{x:25,y:23},{shortLabel:'CORR'}),
  S('prop-store','PROP STORE',{x:3,y:14},{shortLabel:'STORE',doorIds:['store-corridor']}),
  S('studio-b2','STUDIO B2',{x:33,y:14},{shortLabel:'B2',doorIds:['b3-b2-service','b2-corridor']}),
  S('studio-b1','STUDIO B1',{x:45,y:15},{shortLabel:'B1',doorIds:['b1-corridor','b1-lift-hatch']}),
  S('studio-b5','STUDIO B5',{x:15,y:29},{shortLabel:'B5',doorIds:['room5-corridor']}),
  S('plant-room','PLANT ROOM',{x:36,y:31},{shortLabel:'PLANT',doorIds:['plant-spur']}),
  S('services-substation','SERVICES SUBSTATION',{x:24.5,y:37},{shortLabel:'SUB',doorIds:['spur-substation']}),
  S('services-tank','TANK ANNEX',{x:31,y:38},{shortLabel:'TANK',doorIds:['spur-tank']}),
  S('lift-shaft','OLD LIFT SHAFT',{x:44,y:10},{shortLabel:'LIFT',doorIds:['b1-lift-hatch']}),

  S('loading-bay','LOADING BAY',{x:53,y:8},{shortLabel:'BAY',doorIds:['dock-grey-exterior']}),
  S('get-in',SCENE_DOCK_LABEL,{x:65,y:9},{shortLabel:'DOCK',doorIds:['dock-grey-exterior','dock-foyer-service','dock-inner-service']}),
  S('atrium','ATRIUM / FRONT OF HOUSE',{x:81,y:10},{shortLabel:'FOH',doorIds:['dock-foyer-service','foh-office','hall-vestibule']}),
  S('box-office','BOX OFFICE',{x:93,y:10},{shortLabel:'BOX',doorIds:['foh-office']}),
  S('public-sanitary-core','PUBLIC TOILETS',{x:80.75,y:24.25},{shortLabel:'WC',doorIds:['public-wc-large','public-wc-standard']}),
  S('ground-spine','GROUND SPINE',{x:68,y:23},{shortLabel:'SPINE'}),
  S('main-stair-ground','MAIN STAIR / GROUND',MAIN_STAIR_LAYOUT.groundHall,{shortLabel:'STAIR'}),

  S('upper-landing','UPPER LANDING',{x:77,y:55},{shortLabel:'LAND'}),
  S('practice-corridor','PRACTICE WING CORRIDOR',{x:61,y:70},{shortLabel:'PRAC'}),
  S('practice-1','PRACTICE ROOM 1',{x:56,y:62},{shortLabel:'P1',doorIds:['practice-west-1']}),
  S('practice-2','PRACTICE ROOM 2',{x:68,y:62},{shortLabel:'P2',doorIds:['practice-east-1']}),
  S('practice-3','PRACTICE ROOM 3',{x:56,y:69},{shortLabel:'P3',doorIds:['practice-west-2']}),
  S('practice-4','PRACTICE ROOM 4',{x:68,y:69},{shortLabel:'P4',doorIds:['practice-east-2']}),
  S('practice-5','PRACTICE ROOM 5',{x:56,y:76},{shortLabel:'P5',doorIds:['practice-west-3']}),
  S('practice-6','PRACTICE ROOM 6',{x:68,y:76},{shortLabel:'P6',doorIds:['practice-east-3']}),
  S('practice-7','PRACTICE ROOM 7',{x:56,y:83},{shortLabel:'P7',doorIds:['practice-west-4']}),
  S('practice-8','PRACTICE ROOM 8',{x:68,y:83},{shortLabel:'P8',doorIds:['practice-east-4'],aliasOf:'space:ensemble-room'}),
  S('ensemble-room','ENSEMBLE ROOM',{x:72,y:80},{shortLabel:'ENS',doorIds:['practice-east-4']}),
  S('chapel-narthex','CHAPEL NARTHEX',{x:92,y:59},{shortLabel:'NAR',doorIds:['chapel-c17']}),

  A('academic-loggia','ACADEMIC STAIR LOGGIA',{x:13,y:277},{shortLabel:'LOG'}),
  A('academic-gallery','ACADEMIC GALLERY',{x:26,y:255},{shortLabel:'GAL',currentRadius:8}),
  A('academic-lobby','GALLERY VESTIBULE',{x:19.5,y:244},{shortLabel:'VEST',doorIds:['academic-chamber-vestibule','academic-gallery-lobby']}),
  A('academic-core','ACADEMIC CORE CORRIDOR',{x:9,y:255},{shortLabel:'CORE'}),
  // Keep issued space IDs stable while naming the rooms that actually exist.
  A('classroom-west-1','CHAMBER ROOM',{x:8,y:244},{shortLabel:'CHAM',doorIds:['academic-chamber-vestibule']}),
  A('classroom-west-2','VOCAL STUDIO 1',{x:4,y:252},{shortLabel:'VS1',doorIds:['academic-studio-1']}),
  A('classroom-east-2','THEORY ROOM',{x:17,y:254},{shortLabel:'THEOR',doorIds:['academic-theory']}),
  A('classroom-west-3','VOCAL STUDIO 2',{x:4,y:257},{shortLabel:'VS2',doorIds:['academic-studio-2']}),
  A('classroom-east-3','ACADEMIC STORE',{x:17,y:260},{shortLabel:'STORE',doorIds:['academic-store']}),
  A('classroom-west-4','VOCAL STUDIO 3',{x:4,y:261.5},{shortLabel:'VS3',doorIds:['academic-studio-3']}),
  A('vocal-studio-4','VOCAL STUDIO 4',{x:4,y:265.5},{shortLabel:'VS4',doorIds:['academic-studio-4']}),
  A('classroom-east-4','CLEARED ROOM',{x:17,y:265},{shortLabel:'CLEAR'}),
  A('faculty-office-west','FACULTY OFFICE WEST',{x:3,y:274},{shortLabel:'FOW',doorIds:['academic-office-locked-1']}),
  A('faculty-office-east','FACULTY OFFICE EAST',{x:9,y:274},{shortLabel:'FOE',doorIds:['academic-office-locked-2']}),
  A('academic-reception','ACADEMIC RECEPTION',{x:15,y:274},{shortLabel:'RECEP'}),
  A('stripped-office','STRIPPED OFFICE',{x:16,y:272.5},{shortLabel:'OFF'}),
  S('academic-roof','GLASS ROOF',ACADEMIC_ROOF.entry,{shortLabel:'ROOF',floorId:'academicRoof',
    visibility:'discovered',mapPosition:freezePoint(roofPointToPhysical(ACADEMIC_ROOF.entry)),currentRadius:16}),
]);

const TARGET_DOORS = Object.freeze({
  main_b3: Object.freeze(['b3-b2-service']),
  the_tub: Object.freeze(['pool-lobby']),
  amplifications: Object.freeze(['hall-vestibule','hall-rear-service','hall-stage-service']),
  soundnoisemusic: Object.freeze(['practice-west-1','practice-east-1','practice-west-2','practice-east-2','practice-side','practice-west-3','practice-east-3','practice-west-4','practice-east-4']),
  lux_nova: Object.freeze(['chapel-c17']),
});

export const BUILDING_MAP = Object.freeze({
  version: 3,
  id: 'ellery-conservatory',
  topologyStride: 2,
  north: Object.freeze({ x: 0, y: -1 }),

  floors: Object.freeze([
    Object.freeze({
      // 'B', not 'B1': the basement has a room called Studio B1 on it, and a
      // floor tab and a room that print the same two characters is a map that
      // contradicts itself.
      id: 'b1', order: -1, label: 'BASEMENT', shortLabel: 'B',
      minHeight: -Infinity, maxHeight: -2.75, visibility: 'always',
    }),
    Object.freeze({
      id: 'g', order: 0, label: 'GROUND', shortLabel: 'G',
      minHeight: -2.75, maxHeight: 3.25, visibility: 'always',
    }),
    Object.freeze({
      id: 'u1', order: 1, label: 'UPPER', shortLabel: 'U1',
      minHeight: 3.25, maxHeight: 6.25, visibility: 'always',
    }),
    Object.freeze({
      id: 'academic', order: 2.5, label: 'THIRD FLOOR', shortLabel: '3F',
      minHeight: 9.25, maxHeight: 11.5, visibility: 'discovered',
      renderGroups: Object.freeze(['academic']),
    }),
    // ONE tower page, not three. The turret used to be split into U2 (ringing
    // room / organ loft) and U3 (bell chamber), which paged as two nearly-empty
    // floors either side of the third floor — the map read as though the building
    // had interstitial levels in it. Nobody describes this building that way: it
    // is a basement, a ground floor, an upper floor, a third floor, and a tower
    // you climb. Every landmark inside it keeps its own callout.
    Object.freeze({
      id: 'tower', order: 3, label: 'TOWER', shortLabel: 'TWR',
      minHeight: 6.25, maxHeight: Infinity, visibility: 'always',
    }),
    Object.freeze({
      id:'academicRoof',order:4,label:'GLASS ROOF',shortLabel:'ROOF',
      minHeight:11.5,maxHeight:Infinity,visibility:'discovered',
      renderGroups:Object.freeze(['academicRoof']),
    }),
  ]),

  targets: Object.freeze(TARGETS.map((roomId, index) => Object.freeze({
    id: `target:${roomId}`,
    roomId,
    sequence: index + 1,
    logical: freezePoint(ROOM_CELLS[roomId]),
    visibility: 'issued',
    selectable: true,
    waypointable: true,
    doorIds: TARGET_DOORS[roomId] || Object.freeze([]),
  }))),

  spaces: FACILITY_SPACES,

  landmarks:Object.freeze([
    Object.freeze({id:'landmark:ringing-room',label:'RINGING ROOM',shortLabel:'RING',logical:freezePoint(RINGING_ROOM_ANCHOR),visibility:'discovered',selectable:true,waypointable:true}),
    Object.freeze({id:'landmark:bell-chamber',label:'BELL CHAMBER',shortLabel:'BELL',logical:freezePoint(BELL_CHAMBER_ANCHOR),visibility:'discovered',selectable:true,waypointable:true}),
    Object.freeze({id:'landmark:organ-loft',label:'ORGAN LOFT',shortLabel:'ORGAN',logical:freezePoint(ORGAN_LOFT_ANCHOR),visibility:'discovered',selectable:true,waypointable:true}),
  ]),

  contact: Object.freeze({
    id: 'contact:hush',
    label: 'SOURCE / NO RECORD',
    revealedLabel: 'HUSH RETURN',
  }),
});

export const REQUIRED_MAP_TARGETS = Object.freeze([...TARGETS]);
export const FACILITY_SPACE_IDS = Object.freeze([
  ...EXTERIOR_MAP_SPACE_IDS,
  ...BUILDING_MAP.targets.map((target) => `space:${target.roomId}`),
  ...BUILDING_MAP.spaces.map((space) => space.id),
  ...BUILDING_MAP.landmarks.map((landmark) => landmark.id),
]);
