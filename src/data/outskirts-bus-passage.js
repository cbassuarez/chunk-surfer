// One physical crossing of the repeating street, on displayed pass8. Model,
// support, collision and retained encounter stages share these dimensions.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const OUTSKIRTS_BUS_PASSAGE=freeze({
  version:1,pass:7,across:0,along:24.5,yaw:Math.PI/2,
  pack:'/assets/outskirts-bus-passage.glb',mesh:'outskirts_bus_passage',
  entryMesh:'outskirts_bus_passage_entry_leaf',exitMesh:'outskirts_bus_passage_exit_leaf',
  frontLampMesh:'outskirts_bus_passage_lamps_front',rearLampMesh:'outskirts_bus_passage_lamps_rear',
  stripMeshes:['outskirts_bus_strip_0','outskirts_bus_strip_1','outskirts_bus_strip_2','outskirts_bus_strip_3'],
  width:2.45,length:9.2,floor:.5,roof:3.10,bodyRadius:.25,leafThickness:.08,
  rainRoof:{halfWidth:1.22,frontZ:-4.58,backZ:4.62,eaves:2.90,rise:.20},
  facePractical:{lens:[1.026,2.32,3.05],light:[.985,2.30,3.05],direction:[-.949,-.079,.305],
    colour:[1,.80,.58],reach:4.8,strength:3.8,coneInner:.87,coneOuter:.45},
  aisle:{halfWidth:.56,seatCentreX:.84,seatWidth:.56,stanchionX:.59,stanchionRadius:.019,stanchionZ:[-2.6,.1,1.5]},
  seatRows:[-2.10,-1.22,-.34,.54,1.42],
  axle:{frontZ:-2.0,rearZ:2.85,tyreRadius:.43},
  entry:{side:-1,hinge:[-1.245,.25,-3.70],fromZ:-3.70,toZ:-2.60,openYaw:-Math.PI/2,seconds:.65,innerGrabX:.62,
    approach:[-2.8,-3.15],inside:[0,-3.15],
    leafObstacles:[{minX:-.04,maxX:.04,minZ:0,maxZ:1.10},{minX:.015,maxX:.075,minZ:-.02,maxZ:.07},
      {minX:-.081,maxX:-.049,minZ:.894,maxZ:.926},{minX:.049,maxX:.081,minZ:.894,maxZ:.926}]},
  exit:{side:1,hinge:[1.245,.25,3.30],fromZ:3.30,toZ:4.40,openYaw:Math.PI/2,innerGrabX:.92,
    initialYaw:0,rattleYaw:.05,rattleSeconds:1.65,
    outside:[1.9,3.85],
    leafObstacles:[{minX:-.04,maxX:.04,minZ:0,maxZ:1.10},{minX:.015,maxX:.075,minZ:-.02,maxZ:.07},
      {minX:-.081,maxX:-.049,minZ:.894,maxZ:.926},{minX:.049,maxX:.081,minZ:.894,maxZ:.926},
      {minX:-.09,maxX:-.05,minZ:.76,maxZ:.96},{minX:.05,maxX:.09,minZ:.76,maxZ:.96}]},
  bodyPassage:{seconds:3,centreX:0,frontZ:3.0,planeZ:4.10,width:1.10,bottom:.50,top:2.60,
    pocketOffsetMetres:4096,insideReturn:[0,2.5],outside:[2.8,4.10],
    meshes:['bus_body_passage_left','bus_body_passage_right'],pack:'/assets/bus-body-passage.glb',
    walls:[{minX:-1.10,maxX:-.57,minZ:3.0,maxZ:4.4},{minX:.57,maxX:1.10,minZ:3.0,maxZ:4.4}]},
  // Main deck/underplate must be CUT around these wells. These are actual
  // tops of separate treads, not a lowered camera inside an uncut floor slab.
  treads:[
    {id:'entry-lower',x0:-1.66,x1:-1.15,z0:-3.70,z1:-2.60,top:.125},
    {id:'entry-middle',x0:-1.15,x1:-.80,z0:-3.70,z1:-2.60,top:.25},
    {id:'entry-upper',x0:-.80,x1:-.475,z0:-3.70,z1:-2.60,top:.40},
    {id:'exit-upper',x0:.475,x1:.80,z0:3.30,z1:4.40,top:.40},
    {id:'exit-middle',x0:.80,x1:1.15,z0:3.30,z1:4.40,top:.25},
    {id:'exit-lower',x0:1.15,x1:1.66,z0:3.30,z1:4.40,top:.125},
  ],
  floorWells:[{x0:-1.31,x1:-.475,z0:-3.70,z1:-2.60},{x0:.475,x1:1.31,z0:3.30,z1:4.40}],
  barriers:[{id:'funnel-west',across:-8.05,along:24.5,mesh:'outskirts_bus_funnel_west',yaw:Math.PI/2},
    {id:'funnel-east',across:8.05,along:24.5,mesh:'outskirts_bus_funnel_west',yaw:Math.PI/2}],
  woman:{x:-.57,z:3.55,y:.5,yaw:.5,
    envelope:{minX:-.545,maxX:.31,minZ:-.575,maxZ:.295}},
  references:[
    {url:'https://archive.commercialmotor.com/article/17th-may-1968/57/bristol-reecw-45-seat-coach',use:'Contemporary front entrance/offside rear emergency-exit circulation precedent; not an exact vehicle identification'},
    {url:'https://www.ampyx.org.uk/lcountry/bph/bph_preservation_2015a.html',use:'Firsthand coachwork/stepwell/rubber-nosing/door-frame restoration evidence'},
  ],
});

export function busPassageFloorAt(x,z){
  const c=OUTSKIRTS_BUS_PASSAGE;
  for(const step of c.treads)if(x>=step.x0&&x<=step.x1&&z>step.z0&&z<step.z1)return step.top;
  return Math.abs(x)<1.13&&z> -4.42&&z<4.43?c.floor:0;
}

// Literal panels, seats and poles; door leaves are dynamic in the runtime.
export function busPassageCollisionBoxes(){
  const c=OUTSKIRTS_BUS_PASSAGE,rect=(minX,maxX,minZ,maxZ)=>({minX,maxX,minZ,maxZ});
  return [
    rect(-1.225,-1.105,-4.48,c.entry.fromZ),rect(-1.225,-1.105,c.entry.toZ,4.48),
    rect(1.105,1.225,-4.48,c.exit.fromZ),rect(1.105,1.225,c.exit.toZ,4.48),
    rect(-1.225,1.225,-4.61,-4.47),rect(-1.225,1.225,4.47,4.61),
    ...[-1,1].flatMap(side=>c.seatRows.map(z=>rect(side*c.aisle.seatCentreX-c.aisle.seatWidth/2,
      side*c.aisle.seatCentreX+c.aisle.seatWidth/2,z-.335,z+.365))),
    ...[-1,1].flatMap(side=>c.aisle.stanchionZ.map(z=>rect(side*c.aisle.stanchionX-.019,side*c.aisle.stanchionX+.019,z-.019,z+.019))),
    // Inner wheel boxes and jamb grab rails remain tangible when the last
    // seats have been removed. Their actual handles also ride with the leaves.
    ...[-1,1].flatMap(side=>[c.axle.frontZ,c.axle.rearZ].map(z=>rect(side>0?.995:-1.25,side>0?1.25:-.995,z-.49,z+.49))),
    ...[c.entry,c.exit].flatMap(door=>[door.fromZ-.025,door.toZ+.025].map(z=>
      rect(door.side>0?door.innerGrabX-.025:-1.595,door.side>0?1.595:-door.innerGrabX+.025,z-.015,z+.015))),
    rect(.40,.96,-3.67,-3.05),rect(-.45,-.15,-4.04,-3.76),
    // Her feet/body occupy the removed rear seat bay. Her altered arm and gaze
    // are visible, not a full-width invisible character wall across the aisle.
    rect(c.woman.x+c.woman.envelope.minX,c.woman.x+c.woman.envelope.maxX,
      c.woman.z+c.woman.envelope.minZ,c.woman.z+c.woman.envelope.maxZ),
  ];
}

export function busPassageLocal({across,along},bus=OUTSKIRTS_BUS_PASSAGE){
  const dx=across-bus.across,dz=-(along-bus.along),c=Math.cos(bus.yaw),s=Math.sin(bus.yaw);
  return{x:dx*c-dz*s,z:dx*s+dz*c};
}

export function busPassageRoadPoint(x,z,bus=OUTSKIRTS_BUS_PASSAGE){
  const c=Math.cos(bus.yaw),s=Math.sin(bus.yaw);
  return{across:bus.across+x*c+z*s,along:bus.along+x*s-z*c};
}
