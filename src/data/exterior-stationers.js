// One existing north-row deed, now an ordinary optional room. No encounter,
// recordable evidence, pickup, NPC, quest state, or progression lives here.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {districtLogicalAt} from './exterior-district.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXTERIOR_STATIONERS_PACK='/assets/exterior-stationers.glb';
export const STATIONERS_REVISION='north-stationers-1';
export const STATIONERS_ZONE=ZONE.stationers??23;
export const EXTERIOR_STATIONERS=freeze({
  id:'exterior-stationers',name:'Stationers',spaceId:'exterior_stationers',floor:.12,ceiling:3.52,renderUnderlayDrop:.0625,
  bounds:{x0:18.5,x1:25.5,z0:-20.5,z1:-14.5},frontZ:-15.25,
  row:{id:'district-north-row-a',sourceMesh:'district_terrace_frontage',mesh:'district_terrace_frontage_stationer',x:18,z:-15.05,yaw:Math.PI/2,deed:3},
  carve:{min:[-5.4,.10,-7.35],max:[.32,3.55,-.65]},
  room:{mesh:'exterior_stationers_room',anchor:{x:22,z:-18}},
  door:{id:'stationers-entry',x:23.75,z:-15.25,width:1,throat:{x:23.5,z:-15.5}},
  window:{x0:19.00,x1:22.55,bottom:1.00,top:2.93},
  maximumTriangles:30000,maximumBytes:8000000,
});
const room=EXTERIOR_STATIONERS;
const profile=(_x,_y,cell)=>({floor:room.floor,ceil:room.ceiling,zone:STATIONERS_ZONE,material:MATERIAL.woodVelvet,flags:cell.flags&F.DOOR});
const level=(id,x,z,rows)=>freeze({id,replace:true,physicalReplace:true,layer:'ground',space:room.spaceId,renderGroup:'ground',origin:districtLogicalAt(x,z),physicalOrigin:{x,y:z},base:0,rows,profile});
export const STATIONERS_LEVELS=freeze([
  {...level('exterior-stationers-doorstep',23.5,-14.5,['Y']),profile:()=>({floor:room.floor,ceil:12.4,zone:ZONE.civicCourt,material:MATERIAL.wetPaving,flags:F.SKY|F.WALLED})},
  level('exterior-stationers-floor',18.5,-20.5,Array(6).fill('Y'.repeat(7))),
  level('exterior-stationers-entry-throat',room.door.throat.x,room.door.throat.z,['+']),
]);
const at=districtLogicalAt(room.door.throat.x,room.door.throat.z);
export const STATIONERS_DOORS=freeze([{id:room.door.id,archetype:'staff-half-glazed',legacyIds:[],at,x:at.x,y:at.y,
  hinge:'left',widthAxis:'x',swing:'room-in',key:null,initialState:'closed',open:false,wedged:false,closerArmed:false,
  closer:'none',access:'both',insideSide:-1,activeLeaves:[0],renderGroups:['ground']}]);
export const STATIONERS_MESHES=freeze({
  district_terrace_frontage_stationer:{w:8.5,d:64,h:17,blocks:false},
  exterior_stationers_room:{w:7,d:6,h:3.6,blocks:false},
});
const anchor=districtLogicalAt(room.room.anchor.x,room.room.anchor.z);
export const STATIONERS_PROPS=freeze([{id:'stationers-complete-room',mesh:room.room.mesh,...anchor,yaw:0,scale:1,
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
export const STATIONERS_PHYSICAL_COLLIDERS=freeze(colliders);
export const STATIONERS_COLLIDERS=freeze(colliders.map(c=>{const p=districtLogicalAt(c.x,c.z),margin=.25;return{...c,x:p.x,y:p.y,width:c.width+margin*2,depth:c.depth+margin*2,physical:{x:c.x,z:c.z,width:c.width,depth:c.depth},bodyMargin:margin};}));
export const STATIONERS_LIGHTS=freeze([
  {id:'stationers-ceiling-light',x:22.20,z:-17.25,y:2.93,color:[1,.78,.51],intensity:1.08,radius:7.5},
  {id:'stationers-counter-light',x:20.70,z:-19.15,y:1.74,color:[1,.74,.44],intensity:.82,radius:4.5},
]);
export const STATIONERS_LETTERING=freeze([
  {id:'stationers-fascia',text:'STATIONERS',widthM:5.70,heightM:.34,capHeightM:.235,center:[21.90,3.31,-15.005],readerRight:[1,0,0],up:[0,1,0],font:'NimbusSansNarrow-Bold.otf',category:'institution',process:'solid painted stationers fascia lettering',palette:{ground:[.055,.075,.062],ink:[.76,.71,.58]}},
  {id:'stationers-counter-copy',text:'PAPER · PENS · COPYING',widthM:2.70,heightM:.21,capHeightM:.10,center:[21.55,.69,-18.788],readerRight:[1,0,0],up:[0,1,0],font:'NimbusSans-Bold.otf',category:'institution',process:'solid printed stationers counter lettering',palette:{ground:[.18,.105,.05],ink:[.67,.61,.46]}},
]);
export const stationersLocal=({x,y=room.floor,z})=>[x-room.room.anchor.x,y-room.floor,z-room.room.anchor.z];
export const isStationersMeshEnvelopeZone=zone=>Number(zone)===STATIONERS_ZONE;
