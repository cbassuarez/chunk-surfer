import {ZONE} from './floorplan/legend.js';
// One real borrowed outlook: street -> W3 foyer window -> occupied atrium ->
// D0 glazed pair/fanlight -> existing greenhouse. Nothing moves or teleports.
export const GLASS_COURT_SIGHTLINES=Object.freeze({
  windowId:'W3-foyer-north',
  maximumExteriorDistance:36,
  fanlight:Object.freeze({id:'baths-D0-high-fanlight',doorId:'pool-lobby',
    x0:83,x1:85,z0:14.5,z1:16,planeZ:15,sill:3.4,head:5.5}),
  enclosures:Object.freeze([
    Object.freeze({spaceId:'front_atrium',x0:74,x1:98,z0:3,z1:15}),
    Object.freeze({spaceId:'greenhouse',x0:82,x1:86,z0:15,z1:27}),
    Object.freeze({spaceId:'natatorium',x0:70,x1:97,z0:27,z1:51}),
  ]),
});

// Long-side panes are real reciprocal apertures, independent of the foyer
// borrowed outlook. They grant visibility, never body access.
export const GREENHOUSE_SIDE_WINDOWS=Object.freeze([
  {id:'GH-west',physical:{axis:'x',plane:82,from:15.1,to:26.9,x0:81.94,x1:82.06,z0:15.1,z1:26.9},inwardNormal:{x:1,z:0}},
  {id:'GH-east',physical:{axis:'x',plane:86,from:15.1,to:26.9,x0:85.94,x1:86.06,z0:15.1,z1:26.9},inwardNormal:{x:-1,z:0}},
].map(w=>Object.freeze({...w,sill:.12,head:3.90,roomFloor:0,group:'ground',space:'greenhouse',zone:ZONE.glasshouse,enclosures:[{spaceId:'greenhouse',x0:82,x1:86,z0:15,z1:27}]})));
