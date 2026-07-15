// AUDIOCORP facility-map definition.
//
// The conservatory floorplan remains the source of physical truth. This file
// names the map layers and the five issued recording targets; runtime geometry
// is compiled from world/floorplan.js so the map cannot drift away from the
// walls the player actually collides with.

import { ROOM_CELLS, TARGETS } from './conservatory-script.js';
import { BELL_CHAMBER_ANCHOR, ORGAN_LOFT_ANCHOR, RINGING_ROOM_ANCHOR } from './bell-tower-layout.js';

const freezePoint = (point) => Object.freeze({ x: Number(point.x), y: Number(point.y) });

export const BUILDING_MAP = Object.freeze({
  version: 2,
  id: 'ellery-conservatory',
  topologyStride: 2,
  north: Object.freeze({ x: 0, y: -1 }),

  floors: Object.freeze([
    Object.freeze({
      id: 'b1', order: -1, label: 'BASEMENT', shortLabel: 'B1',
      minHeight: -Infinity, maxHeight: -2.75,
    }),
    Object.freeze({
      id: 'g', order: 0, label: 'GROUND', shortLabel: 'G',
      minHeight: -2.75, maxHeight: 3.25,
    }),
    Object.freeze({
      id: 'u1', order: 1, label: 'UPPER', shortLabel: 'U1',
      minHeight: 3.25, maxHeight: 6.25,
    }),
    Object.freeze({
      id: 'u2', order: 2, label: 'RINGING ROOM / ORGAN LOFT', shortLabel: 'U2',
      minHeight: 6.25, maxHeight: 11.5,
    }),
    Object.freeze({
      id: 'u3', order: 3, label: 'BELL CHAMBER', shortLabel: 'U3',
      minHeight: 11.5, maxHeight: Infinity,
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
  }))),

  landmarks:Object.freeze([
    Object.freeze({id:'landmark:ringing-room',label:'RINGING ROOM',shortLabel:'RING',logical:freezePoint(RINGING_ROOM_ANCHOR),visibility:'discovered',selectable:true,waypointable:false}),
    Object.freeze({id:'landmark:bell-chamber',label:'BELL CHAMBER',shortLabel:'BELL',logical:freezePoint(BELL_CHAMBER_ANCHOR),visibility:'discovered',selectable:true,waypointable:false}),
    Object.freeze({id:'landmark:organ-loft',label:'ORGAN LOFT',shortLabel:'ORGAN',logical:freezePoint(ORGAN_LOFT_ANCHOR),visibility:'discovered',selectable:true,waypointable:false}),
  ]),

  contact: Object.freeze({
    id: 'contact:hush',
    label: 'SOURCE / NO RECORD',
    revealedLabel: 'HUSH RETURN',
  }),
});

export const REQUIRED_MAP_TARGETS = Object.freeze([...TARGETS]);
