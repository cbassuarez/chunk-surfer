// One aperture manifest owns both the air cut and the later frame/glass mesh.
// Coordinates are authored metres. A window opens a vertical air interval in
// an existing one-metre wall; collisionOnly retains that wall for the body.
import { MATERIAL, ZONE } from './floorplan/legend.js';

const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};

export const BUILDING_WINDOWS = freeze([
  {
    id:'W1-chamber-north',wall:'north',roomId:'academic-chamber',
    physical:{axis:'z',plane:0,from:56,to:60,depth:1,x0:56,x1:60,z0:0,z1:1},
    logical:{x0:6,x1:10,y0:240,y1:241},
    sill:11.05,head:13.05,roomFloor:10,inwardNormal:{x:0,z:1},
    layer:'academic',space:'academic',group:'academic',zone:ZONE.academic,
    roomObserver:{x:8,y:243},bayCount:2,
  },
  {
    id:'W2-faculty-west',wall:'west',roomId:'faculty-office-west',
    physical:{axis:'x',plane:50,from:31,to:34,depth:1,x0:50,x1:51,z0:31,z1:34},
    logical:{x0:0,x1:1,y0:271,y1:274},
    sill:11.05,head:13.25,roomFloor:10,inwardNormal:{x:1,z:0},
    layer:'academic',space:'academic',group:'academic',zone:ZONE.academic,
    roomObserver:{x:2,y:272},bayCount:2,
  },
  {
    id:'W3-foyer-north',wall:'north',roomId:'front-atrium',
    physical:{axis:'z',plane:3,from:84,to:88,depth:1,x0:84,x1:88,z0:3,z1:4},
    logical:{x0:84,x1:88,y0:3,y1:4},
    sill:1.05,head:3.45,roomFloor:0,inwardNormal:{x:0,z:1},
    layer:'ground',space:'front_atrium',group:'ground',zone:ZONE.foyer,
    roomObserver:{x:86,y:5},bayCount:2,
  },
  {
    id:'W4-pool-south',wall:'south',roomId:'natatorium',
    physical:{axis:'z',plane:50,from:80,to:88,depth:1,x0:80,x1:88,z0:50,z1:51},
    logical:{x0:80,x1:88,y0:50,y1:51},
    sill:.75,head:4.15,roomFloor:0,inwardNormal:{x:0,z:-1},
    // This is one room with a depressed basin and a deck. Both body-floor
    // heights see the same aperture; looking up must not restore a solid wall.
    observerFloorRange:{min:-2,max:0},
    layer:'ground',space:'natatorium',group:'ground',zone:ZONE.natatorium,
    roomObserver:{x:84,y:49},bayCount:3,
  },
]);

export const BUILDING_WINDOW_LEVELS = Object.freeze(BUILDING_WINDOWS.map(window=>{
  const width=window.logical.x1-window.logical.x0,height=window.logical.y1-window.logical.y0;
  return Object.freeze({
    id:`building-window-${window.id}`,replace:true,collisionOnly:true,
    layer:window.layer,space:window.space,renderGroup:window.group,
    origin:Object.freeze({x:window.logical.x0,y:window.logical.y0}),
    physicalOrigin:Object.freeze({x:window.physical.x0,y:window.physical.z0}),
    base:0,rows:Object.freeze(Array.from({length:height},()=> '='.repeat(width))),
    // Explicit flags: the glass is enclosed architecture. SKY belongs to the
    // exterior beyond it, not to this sill/head interval.
    profile:()=>({floor:window.sill,ceil:window.head,zone:window.zone,material:MATERIAL.doorGlassDuct,flags:0}),
  });
}));
