// Semantic registration for the opening exterior material pass. Poly Haven
// source names stop at the build manifest; gameplay owns stable role and mesh
// names, while the existing floorplan remains the sole collision authority.

import { VEGETATION_FALLBACKS } from './vegetation.js';

const freeze = (value) => Object.freeze(value);

export const OPENING_STREET_ASSETS = freeze({
  asphalt:freeze({source:'asphalt_02',kind:'surface',metresPerTile:3.0}),
  cobbles:freeze({source:'cobblestone_floor_001',kind:'surface',metresPerTile:2.4}),
  roughStone:freeze({source:'castle_wall_varriation',kind:'surface',metresPerTile:2.0}),
  weatheredRender:freeze({source:'medieval_wall_01',kind:'surface',metresPerTile:3.2}),
  brick:freeze({source:'random_bricks_thick',kind:'surface',metresPerTile:1.0}),
  modernCladding:freeze({source:'exterior_wall_cladding_02',kind:'surface',metresPerTile:2.0}),
  corrugatedIron:freeze({source:'corrugated_iron',kind:'surface',metresPerTile:2.0}),
  boxProfile:freeze({source:'box_profile_metal_sheet',kind:'surface',metresPerTile:2.0}),
  rustyPaintedMetal:freeze({source:'rusty_painted_metal',kind:'surface',metresPerTile:2.0}),
  rustyMetal03:freeze({source:'rusty_metal_03',kind:'detail',metresPerTile:1.0}),
  rustyMetal04:freeze({source:'rusty_metal_04',kind:'detail',metresPerTile:1.0}),
  grass:freeze({source:'grass_medium_01',kind:'ground-cover',metresPerTile:2.0}),
  smallTree:freeze({source:'tree_small_02',kind:'prop',targetHeight:4.6}),
});

export const OPENING_STREET_MESHES = freeze({
  opening_street_ground:freeze({w:46.5,d:32.25,h:.04,blocks:false}),
  opening_street_frontage:freeze({w:1,d:92,h:18,blocks:false}),
  opening_street_service_history:freeze({w:24,d:72,h:9,blocks:false}),
  opening_street_tree_small:freeze({w:4.8,d:4.8,h:4.6,blocks:false}),
});

// A pocket park occupies the empty north side of the arrival apron. The drive,
// shelter approach and loading-bay sightline remain outside its bounds. Its
// paths and lawn are authored into opening_street_ground, so this adds no GLB
// material draw; the furniture reuses the established district catalog.
export const OPENING_STREET_PARK = freeze({
  id:'ellery-pocket-park',
  bounds:freeze({x0:62,x1:76,y0:195.5,y1:203}),
  entrance:freeze({x:69,y:203}),
  treeId:'opening-street-municipal-tree',
  furnitureIds:freeze(['opening-street-park-bench-west','opening-street-park-bench-east','opening-street-park-laurel']),
  blocks:false,
});

export const OPENING_STREET_PROPS = freeze([
  freeze({id:'opening-street-ground',mesh:'opening_street_ground',x:58,y:207.5,yaw:0,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-frontage',mesh:'opening_street_frontage',x:50,y:7.5,yaw:0,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-service-history',mesh:'opening_street_service_history',x:86,y:218,yaw:0,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-municipal-tree',mesh:'opening_street_tree_small',x:74,y:201,yaw:-.24,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-park-bench-west',mesh:'district_bench',x:66.5,y:201.5,yaw:Math.PI/2,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-park-bench-east',mesh:'district_bench',x:71.5,y:201.5,yaw:-Math.PI/2,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-park-laurel',mesh:'opening_park_laurel',fallbackMesh:VEGETATION_FALLBACKS.opening_park_laurel,x:69,y:200,yaw:Math.PI/2,scale:1,interactive:false,structural:true,blocks:false}),
  // A few deliberate seams, not a procedural carpet. They thicken the lawn
  // edge while keeping the entrance, benches and service approach open.
  //
  // THE LAWN'S NORTH EDGE IS y200 AND NOT A METRE FURTHER.
  //
  // These three were authored at y196-199, which is solid ground — the frontage
  // wall, not the grass in front of it. propsInit drops a prop whose centre is
  // embedded, so all three were silently discarded and the lawn edge they exist
  // to thicken was bare. Growth belongs against the boundary, so they sit just
  // inside it: a nettle bed and a weed clump in the two corners nothing else
  // uses, and the grass run along the wall between them.
  freeze({id:'opening-street-park-nettles',mesh:'vegetation_nettle_cluster',x:63.2,y:200.7,yaw:.26,scale:.86,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-park-weeds',mesh:'vegetation_weed_cluster',x:76.4,y:200.6,yaw:-.48,scale:.92,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-park-grass-edge',mesh:'vegetation_grass_edge',x:65.6,y:200.4,yaw:Math.PI/2,scale:1,interactive:false,structural:true,blocks:false}),
  freeze({id:'opening-street-park-leaf-fall',mesh:'vegetation_leaf_scatter',x:72.9,y:201.7,yaw:-.18,scale:.82,interactive:false,structural:true,blocks:false}),
]);

export const OPENING_STREET_CAPTURE_PRESETS = freeze([
  freeze({id:'arrival',file:'01-arrival.png',cell:[57,207],facing:1,pitch:0,materials:['asphalt','grass','smallTree']}),
  freeze({id:'frontage',file:'02-frontage.png',cell:[53,10],facing:1,pitch:-.02,materials:['asphalt','roughStone','weatheredRender','brick']}),
  freeze({id:'service-lane-entrance',file:'03-service-lane-entrance.png',cell:[75,207],facing:2,pitch:-.04,materials:['asphalt','cobbles','brick','corrugatedIron']}),
  freeze({id:'service-yard',file:'04-service-yard.png',cell:[78,240],facing:2,pitch:-.03,materials:['cobbles','brick','corrugatedIron','rustyPaintedMetal','rustyMetal03','rustyMetal04']}),
  freeze({id:'modern-annex',file:'05-modern-annex.png',cell:[78,265],facing:1,pitch:-.02,materials:['modernCladding','boxProfile']}),
]);

export const OPENING_STREET_REVIEW_INSTANCE = freeze({
  id:'opening-street-material-review',mesh:'opening_street_review_plate',x:58,y:207.5,yaw:0,scale:1,
  interactive:false,structural:true,blocks:false,
});
