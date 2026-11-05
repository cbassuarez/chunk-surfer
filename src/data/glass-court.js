// A longitudinal glazed link between Ellery and its separate municipal baths.
// Physical metres. Doors, planted beds and outdoor courts share this contract.
import {gridDrawnHeight} from './main-stair-geometry.js';
import {ZONE} from './floorplan/legend.js';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const origin={x:82,z:15},floor=0,drawnFloor=gridDrawnHeight(floor);
export const glassCourtLogicalAt=(x,z)=>({x:Number(x),y:Number(z)});
const meshNames=['glass_court_frame','glass_court_glass','glass_court_beds','glass_court_nursery','glass_court_plants','glass_court_vestibule','glass_court_upper_guards','glass_court_gallery_vines'];
const plantingBands=[{x0:0,x1:.65,z0:.65,z1:11.35,height:.75,maxHeight:2.75},{x0:3.35,x1:4,z0:.65,z1:11.35,height:.75,maxHeight:2.75}];
const partitionSegments=[
  {id:'changing-west',x:-1,z:14,width:.14,depth:4,height:3.4,kind:'wall'},
  {id:'changing-east',x:5,z:14,width:.14,depth:4,height:3.4,kind:'wall'},
  ...[12,16].flatMap(z=>[[-1,1],[3,5]].map(([a,b],n)=>({id:`changing-end-${z}-${n}`,x:(a+b)/2,z,width:b-a,depth:.14,height:3.4,kind:'wall'}))),
];
const lamps=[2,5,8,11].map(z=>({id:`glass-court-fluorescent-${z}`,x:2,y:3.25,z,color:[.82,.94,1],intensity:.86,radius:5.8,zone:ZONE.glasshouse}));
lamps.push(...[13.3,15.7].map(z=>({id:`glass-court-changing-light-${z}`,x:2,y:2.95,z,color:[.85,.96,1],intensity:.82,radius:4,zone:ZONE.poolChanging})),{id:'glass-court-exit-globe',x:3.55,y:2.25,z:11.75,color:[1,.72,.42],intensity:.90,radius:4,zone:ZONE.glasshouse});
export const GLASS_COURT=freeze({
  id:'natatorium-glasshouse',revision:3,pack:'/assets/glass-court.glb',
  origin,logicalOrigin:glassCourtLogicalAt(origin.x,origin.z),floor,drawnFloor,
  bounds:{x0:82,x1:86,z0:15,z1:27},roofBounds:{x0:0,x1:4,z0:0,z1:12},roofAxis:'z',
  openSkyBounds:{x0:77,x1:94,z0:15,z1:27},
  outdoorCourts:[{id:'west',x0:75,x1:82,z0:15,z1:27},{id:'east',x0:86,x1:95,z0:15,z1:27}],
  // The west court's wall is the east end of the ground spine, and its door the
  // way out to the rain from the head of the basement stair. Nothing joins the
  // courts to the yard: the spine and its north spur lie between them, and an
  // open lane across those would let the yard into the building past every key.
  westCourtWall:{x:74,z0:15,z1:27,door:{z:23}},
  elleryFace:{x0:74,x1:98,z:15,height:9.5,returnDoor:{x0:95,x1:97}},
  eaves:4,ridge:5.2,bodyRadius:.20,minimumLaneWidth:2.5,
  plantingBands,entryGap:{x0:1,x1:3},clearLane:{x0:.75,x1:3.25,z0:0,z1:12},
  clearFaces:{x0:.65,x1:3.35},bodyLane:{x0:.85,x1:3.15},walkSpine:2,
  changing:{x0:-1,x1:5,z0:12,z1:16,ceiling:3.4,wallThickness:.14},partitionSegments,
  doors:{D0:{x:2,z:0,x0:1,x1:3},D1:{x:2,z:12,x0:1,x1:3},D2:{x:2,z:16,x0:1,x1:3}},
  counter:{x:4.45,z:14,width:.90,depth:3.1,height:1.06},
  entranceFixtures:{mesh:'natatorium_entrance_fixtures',origin:{x:84,z:30},yaw:0},
  upperGuards:{academicPolygon:[[79,8],[89,8],[89,15],[94,15],[94,27],[77,27],[77,15],[79,15]],height:1.18,setback:.14},
  // The greenhouse's vine let loose on the gallery rail: rooted up its posts, along
  // the top rail, then over it, into the atrium and the courts. Runs keep the guard's
  // winding. The court runs are longer and seen from further off, so they hang sparser.
  galleryVines:{
    runs:[{id:'north',from:[79,8],to:[89,8]},{id:'east',from:[89,8],to:[89,15]},{id:'west',from:[79,15],to:[79,8]},
      {id:'court-north-east',from:[89,15],to:[94,15],spacing:[.45,1.1]},{id:'court-east',from:[94,15],to:[94,27],spacing:[.45,1.1]},
      {id:'court-south',from:[94,27],to:[77,27],spacing:[.45,1.1]},{id:'court-west',from:[77,27],to:[77,15],spacing:[.45,1.1]},
      {id:'court-north-west',from:[77,15],to:[79,15],spacing:[.45,1.1]}],
    // The south run passes over the greenhouse's far end; nothing hangs into its roof.
    keepAbove:[{x0:81.6,x1:86.4,z0:15,z1:27.4,y:5.6}],
    spacing:[.3,.75],endClearance:.45,shortDrop:[1.9,3.6],longDrop:[4.2,6.6],longShare:.3,step:.32,lowestTip:4,
    stemWidth:.016,leafLength:[.2,.3],leafWidth:[.18,.26],
    // Hanging: the negative height measures down from the deck, so the rail stays
    // put and only what falls past it moves, most at the longest tips.
    wind:{amplitudeM:.14,frequencyHz:.2,anchorY:10-drawnFloor,heightM:-3.5},
  },
  signs:[
    {id:'baths-greenhouse-entry',copy:'GREENHOUSE / BATHS',x:.5,y:1.65,z:-.09,width:.72,height:.30,normal:[0,0,-1]},
    {id:'baths-changing-entry',copy:'CHANGING / SHOWERS',x:.1,y:1.65,z:11.86,width:1.0,height:.30,normal:[0,0,-1]},
    {id:'baths-pool-entry',copy:'POOL / WET DECK',x:4,y:1.65,z:15.90,width:.85,height:.30,normal:[0,0,-1]},
  ],lamps,meshNames,
});
export const glassCourtWorld=({x,y=0,z})=>({x:origin.x+x,y:drawnFloor+y,z:origin.z+z});
export const GLASS_COURT_MESHES=freeze(Object.fromEntries(meshNames.map(mesh=>[mesh,{w:6,d:16,h:9.5,blocks:false}])));
export const GLASS_COURT_PROPS=freeze(meshNames.map(mesh=>({
  id:mesh.replaceAll('_','-'),mesh,...GLASS_COURT.logicalOrigin,yaw:0,scale:1,
  floorOverride:floor,elevation:drawnFloor-floor,worldAligned:true,blocks:false,
  interactive:false,structural:true,renderGroups:['glass_court_upper_guards','glass_court_gallery_vines'].includes(mesh)?['ground','academic']:['ground'],colliderGroup:'glass-court',
})));
const local=[
  ...plantingBands.map((b,i)=>({id:`planting-${i}`,x:(b.x0+b.x1)/2,z:(b.z0+b.z1)/2,width:b.x1-b.x0,depth:b.z1-b.z0,height:b.height,role:'raised nursery trough'})),
  ...partitionSegments.map(p=>({...p,role:'changing wall'})),
  ...[0,4].map(x=>({id:`greenhouse-side-${x}`,x,z:6,width:.12,depth:12,height:4,role:'fixed glazed exterior wall'})),
  ...[0,12].flatMap(z=>[[0,1],[3,4]].map(([a,b],n)=>({id:`greenhouse-end-${z}-${n}`,x:(a+b)/2,z,width:b-a,depth:.14,height:4,role:'glazed end beside paired door'}))),
  {id:'changing-counter',...GLASS_COURT.counter,role:'attendant counter'},
];
export const GLASS_COURT_PHYSICAL_COLLIDERS=freeze(local.map(c=>({...c,x:origin.x+c.x,z:origin.z+c.z,minElevation:drawnFloor,maxElevation:drawnFloor+c.height})));
const upperGuardColliders=[];
for(const [tier,polygon,floor,map]of [
 ['academic',GLASS_COURT.upperGuards.academicPolygon,10,(x,z)=>({x:x-50,y:z+240})],
])for(let n=0;n<polygon.length;n++){
 const a=polygon[n],b=polygon[(n+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
 const x=(a[0]+b[0])/2+nx*.14,z=(a[1]+b[1])/2+nz*.14;
 upperGuardColliders.push({id:`glass-court:${tier}-guard-${n}`,kind:'obb',...map(x,z),yaw:0,width:(dx?length:.08)+.4,depth:(dz?length:.08)+.4,minElevation:floor,maxElevation:floor+1.18,spaceId:tier,colliderGroup:'glass-court'});
}
export const GLASS_COURT_COLLIDERS=freeze([...GLASS_COURT_PHYSICAL_COLLIDERS.map(c=>({
  id:`glass-court:${c.id}`,kind:'obb',...glassCourtLogicalAt(c.x,c.z),yaw:0,
  width:c.width+2*GLASS_COURT.bodyRadius,depth:c.depth+2*GLASS_COURT.bodyRadius,
  minElevation:c.minElevation,maxElevation:c.maxElevation,spaceId:c.z<27?'front_atrium':'natatorium',colliderGroup:'glass-court',bodyMargin:GLASS_COURT.bodyRadius,
  physical:{x:c.x,z:c.z,width:c.width,depth:c.depth},
})),...upperGuardColliders]);
export const GLASS_COURT_LIGHTS=freeze(lamps.map(a=>({...a,...glassCourtWorld(a)})));
