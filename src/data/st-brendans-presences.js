// Held human residues belonging to the working building, never a second Mass.
// Church-local metres. No station is selected from the listener or camera.
export const ST_BRENDANS_PRESENCE_PACK = 'assets/st-brendans-presences.glb';
export const ST_BRENDANS_PRESENCE_MESH = Object.freeze({
  waiting: 'brendan_presence_waiting', braced: 'brendan_presence_braced',
  seated: 'brendan_presence_seated', upward: 'brendan_presence_upward',
});
export const ST_BRENDANS_PRESENCE_BUDGET = Object.freeze({
  figures: 50, meshes: 4, triangles: 18000, bytes: 750000,
  maxDistance: 38, additionalLights: 0, additionalShadowMaps: 0,
});
const hold=(id,level,x,z,pose,yaw=0,scale=1,extra={})=>Object.freeze({
  id:`brendan-presence:${id}`,level,x,z,pose,mesh:ST_BRENDANS_PRESENCE_MESH[pose],yaw,scale,...extra,
});
const ground=[
  // The intervals between oak benches, with attention split between floor,
  // masonry and the weight above. The central nave/carry axis is left empty.
  ...[63.7,66.7,69.35].flatMap((z,row)=>[13.1,14.25,17.75,19].map((x,i)=>
    hold(`nave-gap-${row}-${i}`,'ground',x,z,
      (row+i)%3===0?'upward':'waiting',[-.8,1.48,-2.0,2.75][i]+row*.13,.94+((row+i)%4)*.025))),
  // Feet and pelvis meet the existing .5275m seat. Six tired bodies amongst
  // many empty places; no prayer hands, vested roles or common altar address.
  // Props round their authored centres onto half-metre cells. Seat the pelvis
  // on those delivered benches, just ahead of the actual back board.
  ...[[12.95,62.48],[14.2,64.98],[13.3,67.98],[18,62.48],[19.1,64.98],[18.5,67.98]].map(([x,z],i)=>
    hold(`pew-${i}`,'ground',x,z,'seated',0,1,{seat:true})),
  ...[[10.65,60.2,1.5],[10.65,68.5,1.2],[21.55,60.6,-1.6],[21.55,65.5,-1.3],[21.55,68.8,-1.9]].map(([x,z,yaw],i)=>
    hold(`aisle-${i}`,'ground',x,z,i%2?'upward':'waiting',yaw,.96+i*.012)),
  ...[[14.2,78.5,-1.7],[17.7,79,1.1],[14.1,81.3,-2.2],[18,82.1,.8],[13.1,83.6,2.7],[19.3,83.6,-2.4]].map(([x,z,yaw],i)=>
    hold(`choir-${i}`,'ground',x,z,i%3===0?'braced':i%3===1?'upward':'waiting',yaw,.97+(i%3)*.015)),
  hold('monument-left','ground',11,76.8,'waiting',.8,.96),
  hold('monument-return','ground',11.1,81.4,'braced',-1.5,.98),
  hold('sacristy-entry','ground',23.1,76.6,'upward',-2.1,.97),
  hold('sacristy-end','ground',23.4,82.25,'waiting',-1.2,.95),
  hold('west-wait','ground',14.65,57.25,'upward',2.3,.96),
];
const loft=[
  // Wide organ platform and crossing margins only. The narrow triforium,
  // both spiral mouths and the open trap keep their clear silhouette.
  hold('organ-north','loft',13.45,59.7,'braced',-1.4,.96),
  hold('organ-south','loft',18.7,59.7,'waiting',1.25,.97),
  hold('organ-front-n','loft',13.7,60.6,'upward',1.8,.96),
  hold('organ-front-s','loft',18.6,60.6,'upward',-2.6,.98),
  hold('crossing-nw','loft',13.3,73.0,'waiting',-1.6,.95),
  hold('crossing-ne','loft',18.6,73.0,'upward',2.3,.96),
  hold('crossing-sw','loft',13.5,75.15,'braced',-.7,.96),
  hold('crossing-se','loft',18.6,75.15,'waiting',1.9,.98),
  // The drums fill the apparent west/east deck margins. The two remaining
  // figures use the existing broad sacristy apron, clear of its rubble mouth.
  hold('sacristy-apron-return','loft',24.3,80.9,'upward',.9,.96),
  hold('sacristy-apron-end','loft',24.3,82.1,'braced',-1.3,.95),
];
const belfry=[
  // Against the outer masonry, between lesson recesses and outside the bell
  // guard. Nobody stands in the arrival, sweep, hatch or protected perimeter.
  hold('north-pier-w','belfry',14.45,69.45,'upward',Math.PI,.95),
  hold('north-pier-e','belfry',17.55,69.45,'waiting',Math.PI,.97),
  hold('south-wall-w','belfry',14.3,76.5,'waiting',0,.96),
  hold('south-wall-e','belfry',17.7,76.5,'upward',0,.95),
  hold('west-wall','belfry',12.1,75.9,'waiting',Math.PI/2,.95),
  hold('east-wall','belfry',19.9,76.1,'waiting',-Math.PI/2,.95),
];
export const ST_BRENDANS_PRESENCES=Object.freeze([...ground,...loft,...belfry]);
export const ST_BRENDANS_PRESENCE_ORIGINS=Object.freeze({
  ground:Object.freeze({x:112,z:125,height:0}),
  loft:Object.freeze({x:140,z:183,height:4.6}),
  belfry:Object.freeze({x:170,z:169,height:10.2}),
});
