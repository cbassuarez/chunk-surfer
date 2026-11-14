// The real building's two public approaches. Source retains the earlier
// remembered shells; only the actual Ellery instances use these variants.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
export const ELLERY_GARDEN_APPROACHES=Object.freeze({
  revision:1,pack:'/assets/ellery-garden-approaches.glb',minimumClearWidth:2.4,
  west:Object.freeze({x0:71,x1:74,z0:0,z1:18,wallX:71,serviceDoor:{x:70.5,z:13.5}}),
  east:Object.freeze({x0:98,x1:101,z0:0,z1:15,wallX:101,serviceDoor:{x:101.5,z:11.5}}),
  variants:Object.freeze({
    'bay-west-elevation':'ellery_garden_elevation',
    'dock-scene-fabric':'ellery_garden_dock',
    'bay-getin-sightline':'ellery_garden_getin_sightline',
    'hall-structure':'ellery_garden_hall',
    'hall-stage-service-steps':'ellery_garden_steps',
    'natatorium-roof-structure':'ellery_baths_roof',
  }),
});
// Clipping is performed on actual submitted triangles, in world metres.
export const ELLERY_APPROACH_AIR=Object.freeze([
  {min:[71,-3,0],max:[74,9.45,18]},
  {min:[98,-3,0],max:[101,9.45,15]},
]);
export function elleryConstructedInstance(instance){
  const mesh=ELLERY_GARDEN_APPROACHES.variants[instance.id];
  if(mesh)return {...instance,mesh,...(instance.id==='hall-stage-service-steps'?{x:102}: {})};
  return instance;
}
const approachProfile=()=>({floor:0,ceil:9.5,zone:ZONE.civicCourt,material:MATERIAL.wetPaving,flags:0});
export const ELLERY_GARDEN_LEVELS=Object.freeze([
  ...['west','east'].map(side=>{const b=ELLERY_GARDEN_APPROACHES[side];return{
    id:`ellery-${side}-garden-approach`,replace:true,layer:'ground',space:'baths_courtyard',renderGroup:'ground',
    origin:{x:b.x0,y:b.z0},physicalOrigin:{x:b.x0,y:b.z0},base:0,
    rows:Array.from({length:b.z1-b.z0},()=> 'Y'.repeat(b.x1-b.x0)),profile:approachProfile,
  };}),
  {id:'ellery-dock-setback-wall',replace:true,layer:'ground',space:'ground',renderGroup:'ground',origin:{x:70,y:3},physicalOrigin:{x:70,y:3},base:0,
    rows:Array.from({length:12},(_,i)=>i===10?'+':'#')},
  {id:'ellery-hall-setback-wall',replace:true,layer:'ground',space:'hall',renderGroup:'hall',origin:{x:101,y:4},physicalOrigin:{x:101,y:4},base:0,
    rows:Array.from({length:11},(_,i)=>i===7?'+':'#')},
]);
export const ELLERY_GARDEN_PROPS=Object.freeze([
  {id:'ellery-garden-built-edges',mesh:'ellery_garden_built_edges',x:72,y:2,yaw:0,floorOverride:0,renderGroups:['ground','hall'],worldAligned:true,blocks:false,interactive:false,structural:true},
  {id:'ellery-baths-roof-exterior',mesh:'ellery_baths_roof_exterior',x:83,y:38.5,yaw:0,floorOverride:0,renderGroups:['ground'],worldAligned:true,blocks:false,interactive:false,structural:true},
]);
export const ELLERY_GARDEN_MESHES=Object.freeze(Object.fromEntries([
  ...Object.values(ELLERY_GARDEN_APPROACHES.variants),'ellery_garden_built_edges','ellery_baths_roof_exterior',
].map(name=>[name,{w:40,d:54,h:16,blocks:false}])));
