// An indoor greenhouse on the existing dry approach to the municipal pool.
// Source geometry, thin partitions and physical circulation share this frame.
import {gridDrawnHeight} from './main-stair-geometry.js';
import {ZONE} from './floorplan/legend.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const origin={x:71,z:28},floor=0,drawnFloor=gridDrawnHeight(floor);
export const glassCourtLogicalAt=(x,z)=>({x:Number(x),y:Number(z)});
const meshNames=['glass_court_frame','glass_court_glass','glass_court_beds','glass_court_nursery','glass_court_plants','glass_court_vestibule'];
const plantingBands=[{x0:0,x1:11.5,z0:0,z1:1.1,height:1.10,maxHeight:3},{x0:14.5,x1:21,z0:0,z1:1.1,height:1.10,maxHeight:3}];
const partitionSegments=[
  {id:'changing-north',x:23,z:-.06,width:4,depth:.12,height:3.4,kind:'wall'},
  {id:'south-glass',x:10.5,z:4,width:21,depth:.12,height:4,coverHeight:.18,kind:'glass'},
  {id:'changing-south-west',x:21.5,z:4,width:1,depth:.12,height:3.4,kind:'wall'},
  {id:'changing-south-east',x:24.5,z:4,width:1,depth:.12,height:3.4,kind:'wall'},
  {id:'changing-west-north',x:21,z:.5,width:.12,depth:1,height:3.4,kind:'wall'},
  {id:'changing-west-south',x:21,z:3.5,width:.12,depth:1,height:3.4,kind:'wall'},
];
const lamps=[2.5,6,9.5,13,16.5,20].map(x=>({id:`glass-court-fluorescent-${x}`,x,y:3.25,z:2.5,
  color:[.82,.94,1],intensity:.86,radius:6.4,zone:ZONE.glasshouse??24}));
lamps.push(...[22.2,23.8].map(x=>({id:`glass-court-changing-light-${x}`,x,y:2.95,z:1.8,
  color:[.85,.96,1],intensity:.82,radius:4,zone:ZONE.poolChanging??25})),
  {id:'glass-court-exit-globe',x:14.7,y:2.25,z:.15,color:[1,.72,.42],intensity:.90,radius:5,zone:ZONE.glasshouse??24});

export const GLASS_COURT=freeze({
  id:'natatorium-glasshouse',revision:2,pack:'/assets/glass-court.glb',
  origin,logicalOrigin:glassCourtLogicalAt(origin.x,origin.z),floor,drawnFloor,
  bounds:{x0:71,x1:92,z0:28,z1:32},roofBounds:{x0:0,x1:21,z0:0,z1:4},
  eaves:4,ridge:5.2,bodyRadius:.20,minimumLaneWidth:2.5,
  plantingBands,entryGap:{x0:11.5,x1:14.5},clearLane:{x0:0,x1:21,z0:1.25,z1:3.75},
  clearFaces:{z0:1.1,z1:3.94},bodyLane:{z0:1.35,z1:3.60},walkSpine:2.5,
  changing:{x0:21,x1:25,z0:0,z1:4,ceiling:3.4,wallThickness:.12},partitionSegments,
  doors:{D0:{x:12.75,z:-.75},D1:{x:21,z:2,z0:1,z1:3},D2:{x:23,z:4,x0:22,x1:24}},
  counter:{x:23,z:.44,width:3.46,depth:.88,height:1.06},
  entranceFixtures:{mesh:'natatorium_entrance_fixtures',origin:{x:84,z:30},yaw:0},
  signs:[
    {id:'baths-greenhouse-entry',copy:'GREENHOUSE / BATHS',x:11.4,y:1.65,z:-1.01,width:.60,height:.30,normal:[0,0,-1]},
    {id:'baths-changing-entry',copy:'CHANGING / SHOWERS',x:20.93,y:1.65,z:3.5,width:.60,height:.30,normal:[-1,0,0]},
    {id:'baths-pool-entry',copy:'POOL / WET DECK',x:21.5,y:1.65,z:3.93,width:.60,height:.30,normal:[0,0,-1]},
  ],
  lamps,meshNames,
});
export const glassCourtWorld=({x,y=0,z})=>({x:origin.x+x,y:drawnFloor+y,z:origin.z+z});
export const GLASS_COURT_MESHES=freeze(Object.fromEntries(meshNames.map(mesh=>[mesh,{w:25,d:4,h:5.2,blocks:false}])));
export const GLASS_COURT_PROPS=freeze(meshNames.map(mesh=>({
  id:mesh.replaceAll('_','-'),mesh,...GLASS_COURT.logicalOrigin,yaw:0,scale:1,
  floorOverride:floor,elevation:drawnFloor-floor,worldAligned:true,blocks:false,
  interactive:false,structural:true,renderGroups:['ground'],colliderGroup:'glass-court',
})));

// Exact pieces leave both door apertures open. The original north/east pool
// masonry remains the outer envelope; no giant room-shaped OBB closes it.
const local=[
  ...plantingBands.map((b,i)=>({id:`planting-${i}`,x:(b.x0+b.x1)/2,z:(b.z0+b.z1)/2,width:b.x1-b.x0,depth:b.z1-b.z0,height:b.height,role:'raised nursery trough'})),
  ...partitionSegments.map(p=>({...p,role:p.kind==='glass'?'glazed partition':'changing wall'})),
  {id:'changing-counter',...GLASS_COURT.counter,role:'rehosted attendant counter'},
];
export const GLASS_COURT_PHYSICAL_COLLIDERS=freeze(local.map(c=>({...c,
  x:origin.x+c.x,z:origin.z+c.z,minElevation:drawnFloor,maxElevation:drawnFloor+c.height,
})));
export const GLASS_COURT_COLLIDERS=freeze(GLASS_COURT_PHYSICAL_COLLIDERS.map(c=>({
  id:`glass-court:${c.id}`,kind:'obb',...glassCourtLogicalAt(c.x,c.z),yaw:0,
  width:c.width+2*GLASS_COURT.bodyRadius,depth:c.depth+2*GLASS_COURT.bodyRadius,
  minElevation:c.minElevation,maxElevation:c.maxElevation,spaceId:'natatorium',colliderGroup:'glass-court',
  ...(Number.isFinite(c.coverHeight)?{coverHeight:c.coverHeight}:{}),
  bodyMargin:GLASS_COURT.bodyRadius,physical:{x:c.x,z:c.z,width:c.width,depth:c.depth},
})));
export const GLASS_COURT_LIGHTS=freeze(lamps.map(a=>({...a,...glassCourtWorld(a)})));
