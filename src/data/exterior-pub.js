// The Lyric occupies the existing courtyard south/east of St Brendan's.
// Its room, door ids and logical/save addresses are retained; only the physical
// placement moves from the unreachable far side of the south street.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {districtLogicalAt} from './exterior-district.js';
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
};
export const PUB_RELOCATION=freeze({x:39,z:-22});
const moved=(x,z)=>({x:x+PUB_RELOCATION.x,z:z+PUB_RELOCATION.z});
export const EXTERIOR_PUB=freeze({
  id:'exterior-pub',name:'The Lyric',floor:.12,ceiling:3.52,renderUnderlayDrop:.0625,frontWorldZ:85.25,
  rowAnchor:{x:57,z:85.05},facadeAnchor:{x:33,z:85.05},interiorOriginLocal:{x:-2.7,z:-24},interiorAnchor:{x:33,z:87.75},
  doorCentresLocalZ:[-30.75,-22.75],bounds:{x0:25,x1:41,z0:85.05,z1:90.45},
  doors:[
    {id:'pub-west-entry',...moved(-12.75,107.25),width:1.95,throat:{...moved(-13.5,107),width:2}},
    {id:'pub-east-entry',...moved(-4.75,107.25),width:1.95,throat:{...moved(-5.5,107),width:2}},
  ],
  windows:[
    {id:'pub-west-window-west',x:28.35,width:1.55},
    {id:'pub-west-window-east',x:31.05,width:2.15},
    {id:'pub-east-window-west',x:36.35,width:1.55},
    {id:'pub-east-window-east',x:39.05,width:2.15},
  ],
  windowOpening:{bottom:1.10,top:3.02,sillCollisionHeight:1.08},
  wc:{bounds:{x0:39,x1:40.7,z0:87.75,z1:90.3},wallThickness:.12,
    door:{id:'pub-wc',...moved(.75,109.75),width:1,throat:{...moved(.5,109.5),width:1}}},
  // A .20m body plus .05m sampling guard keeps a closed door from being
  // bypassed between the metre throat raster and the thin authored piers.
  collisionBodyMargin:.25,
});
// Keep all existing pub logical ids stable for saves and interactions.
export const pubLogicalAt=(x,z)=>districtLogicalAt(x-PUB_RELOCATION.x,z-PUB_RELOCATION.z);
export const pubExteriorAt=id=>{
  const door=EXTERIOR_PUB.doors.find(d=>d.id===id)||EXTERIOR_PUB.doors[0];
  return {x:door.x,z:EXTERIOR_PUB.frontWorldZ-.75};
};
export const pubYardLogicalAt=(x,z)=>({x:50+x,y:200+z});
export const pubExteriorLogicalAt=id=>{const p=pubExteriorAt(id);return pubLogicalAt(p.x,p.z);};
export const pubYardCellClaimed=(x,z)=>x>=25&&x<41&&z>=84&&z<91;
export const PUB_YARD_CONNECTORS=freeze(EXTERIOR_PUB.doors.map(d=>({
  from:pubYardLogicalAt(d.x,83.5),to:pubLogicalAt(d.x,84),span:{x:.5},
})));
export const pubWorldFromLocal=({x,z})=>({x:EXTERIOR_PUB.rowAnchor.x+z,z:EXTERIOR_PUB.rowAnchor.z-x});
export const pubLocalFromWorld=({x,z})=>({x:EXTERIOR_PUB.rowAnchor.z-z,z:x-EXTERIOR_PUB.rowAnchor.x});
// A mesh envelope is independent of rain/sky classification. The renderer may
// retain the surrounding civic meshes while this observer stays indoors.
export const isPubMeshEnvelopeZone=zone=>Number(zone)===ZONE.pub;

const profile=(_x,_y,cell)=>({floor:EXTERIOR_PUB.floor,ceil:EXTERIOR_PUB.ceiling,
  zone:ZONE.pub,material:MATERIAL.woodVelvet,flags:cell.flags&F.DOOR});
const level=(id,x,z,rows)=>freeze({id,replace:true,physicalReplace:true,layer:'ground',
  space:'exterior_pub',renderGroup:'ground',origin:pubLogicalAt(x+PUB_RELOCATION.x,z+PUB_RELOCATION.z),physicalOrigin:{x:x+PUB_RELOCATION.x,y:z+PUB_RELOCATION.z},base:0,rows,profile});
export const PUB_LEVELS=freeze([
  {...level('pub-courtyard-apron',-14,106,['Y'.repeat(16)]),profile:()=>({floor:0,ceil:24,zone:ZONE.dock,material:MATERIAL.wetPaving,flags:F.SKY|F.WALLED})},
  level('exterior-pub-main-floor',-14,107,Array(5).fill('Y'.repeat(16))),
  // A half-grid rear strip stops at112.5, only50mm beyond the shell bounds.
  // The real padded back-wall collider makes that residual strip inaccessible.
  level('exterior-pub-rear-floor',-14,111.5,['Y'.repeat(16)]),
  ...EXTERIOR_PUB.doors.map(d=>level(`${d.id}-throat`,d.throat.x-PUB_RELOCATION.x,d.throat.z-PUB_RELOCATION.z,['++'])),
  level('pub-wc-throat',.5,109.5,['+']),
]);
const door=(spec,archetype,open=false,hinge='left',swing='room-in')=>{
  const at=pubLogicalAt(spec.x,spec.z);
  return freeze({id:spec.id,archetype,legacyIds:[],at,x:at.x,y:at.y,hinge,widthAxis:'x',
    swing,key:null,initialState:open?'open':'closed',open,wedged:false,closerArmed:false,
    closer:'none',access:'both',insideSide:1,activeLeaves:archetype==='public-glazed-pair'?[0,1]:[0],renderGroups:['ground']});
};
export const PUB_DOORS=freeze([
  ...EXTERIOR_PUB.doors.map(d=>door(d,'public-glazed-pair')),
  door(EXTERIOR_PUB.wc.door,'practice-acoustic-single',true,'right','escape'),
]);
const physical=[];
const wall=(id,x,z,width,depth,minHeight=0,maxHeight=3.4,role='wall')=>physical.push({
  id,kind:'obb',x:x+PUB_RELOCATION.x,z:z+PUB_RELOCATION.z,width,depth,yaw:0,minElevation:EXTERIOR_PUB.floor+minHeight,
  maxElevation:EXTERIOR_PUB.floor+maxHeight,spaceId:'exterior_pub',role,
});
// The front is split by the actual two doors and four windows. Sills and heads
// occupy their real heights; no full wall seals the glazing from the inside.
const openings=[...EXTERIOR_PUB.doors,...EXTERIOR_PUB.windows].map(o=>({
  ...o,x:o.x-PUB_RELOCATION.x,x0:o.x-PUB_RELOCATION.x-o.width/2,x1:o.x-PUB_RELOCATION.x+o.width/2,
})).sort((a,b)=>a.x0-b.x0);
let cursor=EXTERIOR_PUB.bounds.x0-PUB_RELOCATION.x,section=0;
for(const o of openings){
  if(o.x0>cursor)wall(`pub-front-pier-${section++}`,(cursor+o.x0)/2,107.25,o.x0-cursor,.20);
  if(o.id.includes('window')){
    wall(`${o.id}-sill`,o.x,107.25,o.width,.20,0,1.08,'window-sill');
    wall(`${o.id}-head`,o.x,107.25,o.width,.20,3.02,3.4,'window-head');
  }
  cursor=o.x1;
}
if(cursor<2)wall(`pub-front-pier-${section}`, (cursor+2)/2,107.25,2-cursor,.20);
wall('pub-west-side',-13.95,109.75,.10,5.40);
wall('pub-east-side',1.95,109.75,.10,5.40);
wall('pub-back-wall',-6,112.40,16,.10);
// Plane-centred120mm WC partitions agree with the interior geometry. The
// standard oak runtime frame/head/leaf own the one-metre front opening.
wall('pub-wc-west-side',0,111.025,.12,2.55);
wall('pub-wc-east-side',1.7,111.025,.12,2.55);
wall('pub-wc-back-wall',.85,112.3,1.7,.12);
wall('pub-wc-front-west',.125,109.75,.25,.12);
wall('pub-wc-front-east',1.475,109.75,.45,.12);
export const PUB_PHYSICAL_COLLIDERS=freeze(physical);
export const PUB_COLLIDERS=freeze(physical.map(c=>{
  const at=pubLogicalAt(c.x,c.z),margin=EXTERIOR_PUB.collisionBodyMargin;
  return{...c,x:at.x,y:at.y,width:c.width+2*margin,depth:c.depth+2*margin,
    physical:{x:c.x,z:c.z,width:c.width,depth:c.depth},bodyMargin:margin};
}));
