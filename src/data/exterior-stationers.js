// One shop on Ellery Square's west terrace, an ordinary optional room. No
// encounter, recordable evidence, pickup, NPC, quest state, or progression
// lives here.
//
// DESIGN FRAME. Every number below is authored in the frame the room was first
// fitted in, on the north row: the shopfront runs along +x at z -15.25 and the
// room goes back to z -20.4, so outward is +z. STATIONERS_POSE places that
// frame on the square's west terrace, deed 1, facing east into the square: a
// quarter turn and a half-metre translation, so every glyph grid still lands
// on whole cells. Consumers that need the world use the placed exports.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {squareLogicalAt} from './ellery-square.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXTERIOR_STATIONERS_PACK='/assets/exterior-stationers.glb';
export const STATIONERS_REVISION='square-stationers-1';
export const STATIONERS_POSE=Object.freeze({yaw:-Math.PI/2,x:65,z:-26.5});
const poseC=Math.round(Math.cos(STATIONERS_POSE.yaw)),poseS=Math.round(Math.sin(STATIONERS_POSE.yaw));
// Design (x, z) to physical metres. Quarter turns only: glyph grids stay square.
export const stationersPlace=(x,z)=>({x:STATIONERS_POSE.x+x*poseC-z*poseS,z:STATIONERS_POSE.z+x*poseS+z*poseC});
export const stationersLogicalAt=(x,z)=>{const p=stationersPlace(x,z);return squareLogicalAt(p.x,p.z);};
// A design rectangle, placed: the physical rectangle it covers.
const placeRect=(x0,z0,x1,z1)=>{const a=stationersPlace(x0,z0),b=stationersPlace(x1,z1);
  return{x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z)};};
// A glyph laid at origin o covers metres o-.25 to o+.75 (runtime cell i is
// centred on i/2), so a grid is turned as the metres it covers and given back
// its origin, never by turning the origin itself.
const placeGlyphs=(x0,z0,w,h)=>{const r=placeRect(x0-.25,z0-.25,x0+w-.25,z0+h-.25);
  return{x:r.x0+.25,z:r.z0+.25,cols:Math.round(r.x1-r.x0),rows:Math.round(r.z1-r.z0)};};
export const STATIONERS_ZONE=ZONE.stationers??23;
export const EXTERIOR_STATIONERS=freeze({
  id:'exterior-stationers',name:'Stationers',spaceId:'exterior_stationers',floor:.12,ceiling:3.52,renderUnderlayDrop:.0625,
  bounds:{x0:18.5,x1:25.5,z0:-20.5,z1:-14.5},frontZ:-15.25,
  // The terrace row the room is cut into, and the carve in that row mesh's
  // own frame: deed 1's ground floor, facade line to back wall.
  row:{id:'ellery-square-west',sourceMesh:'ellery_square_west_terrace',mesh:'ellery_square_west_terrace_stationer',x:50,z:-40.45,yaw:0,deed:1},
  carve:{min:[-5.4,.10,-11.40],max:[.32,3.55,-4.70]},
  // Where the shopfront faces, in the world.
  outward:{x:1,z:0},
  room:{mesh:'exterior_stationers_room',anchor:{x:22,z:-18}},
  door:{id:'stationers-entry',x:23.75,z:-15.25,width:1,throat:{x:23.5,z:-15.5}},
  window:{x0:19.00,x1:22.55,bottom:1.00,top:2.93},
  // The pack carries the whole frontage binary as its prefix (8.8MB since the
  // Ellery Square terraces and their lettering pages joined it).
  maximumTriangles:30000,maximumBytes:11000000,
});
const room=EXTERIOR_STATIONERS;
const profile=(_x,_y,cell)=>({floor:room.floor,ceil:room.ceiling,zone:STATIONERS_ZONE,material:MATERIAL.woodVelvet,flags:cell.flags&F.DOOR});
// A design rectangle of one glyph, placed and rasterised on the square's page.
const level=(id,x0,z0,w,h,glyph)=>{const g=placeGlyphs(x0,z0,w,h);
  return freeze({id,replace:true,physicalReplace:true,layer:'ground',space:room.spaceId,renderGroup:'ground',origin:squareLogicalAt(g.x,g.z),physicalOrigin:{x:g.x,y:g.z},base:0,rows:Array(g.rows).fill(glyph.repeat(g.cols)),profile});};
export const STATIONERS_LEVELS=freeze([
  {...level('exterior-stationers-doorstep',23.5,-14.5,1,1,'Y'),profile:()=>({floor:room.floor,ceil:12.4,zone:ZONE.civicCourt,material:MATERIAL.wetPaving,flags:F.SKY|F.WALLED})},
  level('exterior-stationers-floor',18.5,-20.5,7,6,'Y'),
  level('exterior-stationers-entry-throat',room.door.throat.x,room.door.throat.z,1,1,'+'),
]);
const throat=placeGlyphs(room.door.throat.x,room.door.throat.z,1,1);
const at=squareLogicalAt(throat.x,throat.z);
// The door spans the design x axis, which the quarter turn lays along z: the
// logical page's y.
export const STATIONERS_DOORS=freeze([{id:room.door.id,archetype:'staff-half-glazed',legacyIds:[],at,x:at.x,y:at.y,
  hinge:'left',widthAxis:poseC===0?'y':'x',swing:'room-in',key:null,initialState:'closed',open:false,wedged:false,closerArmed:false,
  closer:'none',access:'both',insideSide:-1,activeLeaves:[0],renderGroups:['ground']}]);
export const STATIONERS_MESHES=freeze({
  ellery_square_west_terrace_stationer:{w:5.8,d:40,h:16,blocks:false},
  exterior_stationers_room:{w:7,d:6,h:3.6,blocks:false},
});
const anchor=stationersLogicalAt(room.room.anchor.x,room.room.anchor.z);
export const STATIONERS_PROPS=freeze([{id:'stationers-complete-room',mesh:room.room.mesh,...anchor,yaw:STATIONERS_POSE.yaw,scale:1,
  floorOverride:room.floor,interactive:false,structural:true,blocks:false,renderGroups:['ground'],label:'Stationers'}]);
export const STATIONERS_FURNITURE=freeze([
  {id:'stationers-counter',x:21.55,z:-19.20,width:3.40,depth:.70,height:.96,role:'counter'},
  {id:'stationers-left-shelves',x:18.93,z:-18.25,width:.42,depth:3.65,height:2.48,role:'shelving'},
  {id:'stationers-right-cards',x:25.10,z:-18.00,width:.30,depth:2.80,height:2.05,role:'shelving'},
  {id:'stationers-back-stock',x:24.55,z:-20.12,width:1.20,depth:.38,height:1.12,role:'cupboard'},
]);
const colliders=[];
const wall=(id,x,z,width,depth,y0=0,y1=3.4,role='wall')=>colliders.push({id,kind:'obb',x,z,width,depth,yaw:0,minElevation:room.floor+y0,maxElevation:room.floor+y1,spaceId:room.spaceId,role});
wall('stationers-west-wall',18.57,-17.83,.14,5.22);wall('stationers-east-wall',25.43,-17.83,.14,5.22);wall('stationers-back-wall',22,-20.40,7,.14);
const openings=[{x0:room.window.x0,x1:room.window.x1,window:true},{x0:room.door.x-.5,x1:room.door.x+.5}].sort((a,b)=>a.x0-b.x0);
let cursor=18.5,index=0;for(const o of openings){if(o.x0>cursor)wall('stationers-front-pier-'+index++,(cursor+o.x0)/2,room.frontZ,o.x0-cursor,.16);if(o.window){wall('stationers-display-sill',(o.x0+o.x1)/2,room.frontZ,o.x1-o.x0,.16,0,room.window.bottom-room.floor,'window-sill');wall('stationers-display-head',(o.x0+o.x1)/2,room.frontZ,o.x1-o.x0,.16,room.window.top-room.floor,3.4,'window-head');}cursor=o.x1;}if(cursor<25.5)wall('stationers-front-last-pier',(cursor+25.5)/2,room.frontZ,25.5-cursor,.16);
for(const f of STATIONERS_FURNITURE)wall(f.id,f.x,f.z,f.width,f.depth,0,f.height,f.role);
// The authored layout, in the design frame, and the same boxes placed. A
// quarter turn swaps a box's two extents rather than giving it a yaw.
export const STATIONERS_DESIGN_COLLIDERS=freeze(colliders);
export const STATIONERS_PHYSICAL_COLLIDERS=freeze(colliders.map(c=>{const p=stationersPlace(c.x,c.z),swap=poseC===0;
  return{...c,x:p.x,z:p.z,width:swap?c.depth:c.width,depth:swap?c.width:c.depth};}));
export const STATIONERS_COLLIDERS=freeze(STATIONERS_PHYSICAL_COLLIDERS.map(c=>{const p=squareLogicalAt(c.x,c.z),margin=.25;return{...c,x:p.x,y:p.y,width:c.width+margin*2,depth:c.depth+margin*2,physical:{x:c.x,z:c.z,width:c.width,depth:c.depth},bodyMargin:margin};}));
// Authored in the design frame (the room mesh builds its fittings there);
// the exported lights are placed in the world.
export const STATIONERS_DESIGN_LIGHTS=freeze([
  {id:'stationers-ceiling-light',x:22.20,z:-17.25,y:2.93,color:[1,.78,.51],intensity:1.08,radius:7.5},
  {id:'stationers-counter-light',x:20.70,z:-19.15,y:1.74,color:[1,.74,.44],intensity:.82,radius:4.5},
]);
export const STATIONERS_LIGHTS=freeze(STATIONERS_DESIGN_LIGHTS.map(l=>({...l,...stationersPlace(l.x,l.z)})));
// The door and the floor rectangle in the world, for maps and approaches.
export const STATIONERS_DOOR_PLACED=freeze(stationersPlace(EXTERIOR_STATIONERS.door.x,EXTERIOR_STATIONERS.door.z));
const designBounds=EXTERIOR_STATIONERS.bounds;
export const STATIONERS_BOUNDS_PLACED=freeze(placeRect(designBounds.x0-.25,designBounds.z0-.25,designBounds.x1-.25,designBounds.z1-.25));
export const STATIONERS_LETTERING=freeze([
  {id:'stationers-fascia',text:'STATIONERS',widthM:5.70,heightM:.34,capHeightM:.235,center:[21.90,3.31,-15.005],readerRight:[1,0,0],up:[0,1,0],font:'NimbusSansNarrow-Bold.otf',category:'institution',process:'solid painted stationers fascia lettering',palette:{ground:[.055,.075,.062],ink:[.76,.71,.58]}},
  {id:'stationers-counter-copy',text:'PAPER · PENS · COPYING',widthM:2.70,heightM:.21,capHeightM:.10,center:[21.55,.69,-18.788],readerRight:[1,0,0],up:[0,1,0],font:'NimbusSans-Bold.otf',category:'institution',process:'solid printed stationers counter lettering',palette:{ground:[.18,.105,.05],ink:[.67,.61,.46]}},
]);
export const stationersLocal=({x,y=room.floor,z})=>[x-room.room.anchor.x,y-room.floor,z-room.room.anchor.z];
export const isStationersMeshEnvelopeZone=zone=>Number(zone)===STATIONERS_ZONE;
