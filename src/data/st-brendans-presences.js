// Human residues belonging to the working building, never a second Mass.
export const ST_BRENDANS_PRESENCE_PACK = 'assets/st-brendans-presences.glb';
// The four standing bodies the pack still carries for Source (demolition, earthfall).
export const ST_BRENDANS_PRESENCE_MESH = Object.freeze({
  waiting: 'brendan_presence_waiting', braced: 'brendan_presence_braced',
  seated: 'brendan_presence_seated', upward: 'brendan_presence_upward',
});
export const ST_BRENDANS_PRESENCE_BUDGET = Object.freeze({
  figures: 50, meshes: 10, triangles: 22000, bytes: 750000,
  maxDistance: 38, additionalLights: 0, additionalShadowMaps: 0,
});
// ST BRENDAN'S RULE: THEY MOVE WHEN YOU ARE NOT LOOKING, AND LOOKING TAKES YOUR LIGHT.
//
// Most of the church's bodies are in the air in the middle of a fit; the rest
// are on the floor. Watched, they slow to a tremor; unwatched they thrash, drift
// and crawl, so a body is rarely where you left it. Holding one in the middle of
// your view interferes with the torch (game/st-brendans-apparitions.js).
// Church-local metres. No station is selected from the listener or camera.
export const ST_BRENDANS_APPARITION_MESH = Object.freeze({
  fitArch: 'brendan_fit_arch', fitTwist: 'brendan_fit_twist', fitFold: 'brendan_fit_fold',
  floorProne: 'brendan_floor_prone', floorCurled: 'brendan_floor_curled', floorArched: 'brendan_floor_arched',
});
const FITS = Object.freeze(['fitArch', 'fitTwist', 'fitFold'].map((k) => ST_BRENDANS_APPARITION_MESH[k]));
const FLOORS = Object.freeze(['floorProne', 'floorCurled', 'floorArched'].map((k) => ST_BRENDANS_APPARITION_MESH[k]));
const station=(id,level,x,z,state,yaw=0,scale=1,extra={})=>{
  const set=state==='air'?FITS:FLOORS,first=set[Math.abs([...id].reduce((h,c)=>h*31+c.charCodeAt(0),7))%3];
  return Object.freeze({id:`brendan-presence:${id}`,level,x,z,state,pose:state,mesh:first,poses:set,yaw,scale,
    elevation:state==='air'?(extra.elevation??1.6):0,...extra});
};
const ground=[
  // The intervals between oak benches. Two in three in the air above them, the
  // third down in the gap. The central nave/carry axis is left empty.
  ...[63.7,66.7,69.35].flatMap((z,row)=>[13.1,14.25,17.75,19].map((x,i)=>
    station(`nave-gap-${row}-${i}`,'ground',x,z,(row+i)%3===0?'floor':'air',[-.8,1.48,-2.0,2.75][i]+row*.13,
      .94+((row+i)%4)*.025,{elevation:1.3+((row*4+i)%5)*.28}))),
  // Over the benches themselves, higher.
  ...[[12.95,62.48],[14.2,64.98],[13.3,67.98],[18,62.48],[19.1,64.98],[18.5,67.98]].map(([x,z],i)=>
    station(`pew-${i}`,'ground',x,z,'air',i*1.1,1,{elevation:2.0+(i%3)*.3})),
  ...[[10.65,60.2,1.5],[10.65,68.5,1.2],[21.55,60.6,-1.6],[21.55,65.5,-1.3],[21.55,68.8,-1.9]].map(([x,z,yaw],i)=>
    station(`aisle-${i}`,'ground',x,z,i%2?'floor':'air',yaw,.96+i*.012,{elevation:1.5+i*.15})),
  ...[[14.2,78.5,-1.7],[17.7,79,1.1],[14.1,81.3,-2.2],[18,82.1,.8],[13.1,83.6,2.7],[19.3,83.6,-2.4]].map(([x,z,yaw],i)=>
    station(`choir-${i}`,'ground',x,z,i%2?'floor':'air',yaw,.97+(i%3)*.015,{elevation:1.2+(i%3)*.35})),
  station('monument-left','ground',11,76.8,'floor',.8,.96),
  station('monument-return','ground',11.1,81.4,'floor',-1.5,.98),
  station('sacristy-entry','ground',23.1,76.6,'air',-2.1,.97,{elevation:1.4}),
  station('sacristy-end','ground',23.4,82.25,'floor',-1.2,.95),
  station('west-wait','ground',14.65,57.25,'air',2.3,.96,{elevation:1.8}),
];
const loft=[
  // Wide organ platform and crossing margins only. The narrow triforium,
  // both spiral mouths and the open trap keep their clear silhouette.
  station('organ-north','loft',13.45,59.7,'air',-1.4,.96,{elevation:1.0}),
  station('organ-south','loft',18.7,59.7,'air',1.25,.97,{elevation:1.2}),
  station('organ-front-n','loft',13.7,60.6,'floor',1.8,.96),
  station('organ-front-s','loft',18.6,60.6,'air',-2.6,.98,{elevation:.9}),
  station('crossing-nw','loft',13.3,73.0,'air',-1.6,.95,{elevation:1.1}),
  station('crossing-ne','loft',18.6,73.0,'floor',2.3,.96),
  station('crossing-sw','loft',13.5,75.15,'floor',-.7,.96),
  station('crossing-se','loft',18.6,75.15,'air',1.9,.98,{elevation:1.3}),
  // The drums fill the apparent west/east deck margins. The two remaining
  // figures use the existing broad sacristy apron, clear of its rubble mouth.
  station('sacristy-apron-return','loft',24.3,80.9,'air',.9,.96,{elevation:1.0}),
  station('sacristy-apron-end','loft',24.3,82.1,'floor',-1.3,.95),
];
const belfry=[
  // Against the outer masonry, between lesson recesses and outside the bell
  // guard. Nobody is in the arrival, sweep, hatch or protected perimeter.
  station('north-pier-w','belfry',14.45,69.45,'air',Math.PI,.95,{elevation:.7}),
  station('north-pier-e','belfry',17.55,69.45,'floor',Math.PI,.97),
  station('south-wall-w','belfry',14.3,76.5,'air',0,.96,{elevation:.8}),
  station('south-wall-e','belfry',17.7,76.5,'air',0,.95,{elevation:.6}),
  station('west-wall','belfry',12.1,75.9,'floor',Math.PI/2,.95),
  station('east-wall','belfry',19.9,76.1,'air',-Math.PI/2,.95,{elevation:.7}),
];
export const ST_BRENDANS_PRESENCES=Object.freeze([...ground,...loft,...belfry]);
export const ST_BRENDANS_PRESENCE_ORIGINS=Object.freeze({
  ground:Object.freeze({x:112,z:125,height:0}),
  loft:Object.freeze({x:140,z:183,height:4.6}),
  belfry:Object.freeze({x:170,z:169,height:10.2}),
});
