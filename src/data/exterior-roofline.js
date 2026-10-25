// Ellery's existing upper construction, shared by street and roof views.
// This does not expose Ren, a roof collectible, or a roof interaction outside
// its own chapter. It restores only architecture that already exists above it.
import {ELLERY_MASSING} from './exterior-district.js';
import {isOutdoorZone} from './floorplan/legend.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXTERIOR_ROOFLINE_REVISION='ellery-roof-closure-1';
export const EXTERIOR_ROOFLINE_PACK='/assets/ellery-exterior-roofline.glb';
export const EXTERIOR_ROOFLINE_MESH='ellery_west_roofline_closure';
export const EXTERIOR_ROOF_ARCHITECTURE_IDS=freeze([
  'academic-roof-structure','academic-roof-glazing','academic-roof-service-stair',
]);
export const EXTERIOR_ROOFLINE=freeze({
  anchor:{x:50,y:0,z:7.5},
  roofX0:-.72,roofX1:6.50,frontRoofRise:.035,rearRoofRise:.095,roofThickness:.16,
  originalSkin:{x0:-.74,x1:-.56,topOffset:-.04},
  originalCoping:{x0:0,x1:.92,topOffset:.22},
  // No new summit: the cap top remains exactly the existing phase coping top.
  corniceSections:[
    {id:'frieze',x0:-.84,x1:-.38,y0:-.50,y1:-.27},
    {id:'bed-mould',x0:-.94,x1:-.38,y0:-.27,y1:-.17},
    {id:'projecting-drip',x0:-1.03,x1:-.04,y0:-.17,y1:-.055},
    {id:'neck',x0:-.90,x1:0,y0:-.055,y1:.075},
    {id:'coping',x0:-1.02,x1:0,y0:.075,y1:.22},
  ],
  bands:ELLERY_MASSING.filter(b=>b.id!=='hall').map(b=>({
    id:b.id,year:b.year,z0:b.y0-7.5,z1:b.y1-7.5,height:b.height,
    finish:b.id==='service'?'zinc':b.id==='academic'?'asphalt':'lead',
  })),
  maximumTriangles:6000,maximumBytes:1200000,
});

export function exteriorRoofArchitectureInstances(instances=[],{zone,group='ground'}={}){
  if(group!=='ground'||!isOutdoorZone(Number(zone)))return[];
  const selected=new Set(EXTERIOR_ROOF_ARCHITECTURE_IDS);
  return instances.filter(i=>selected.has(i?.id));
}
export function exteriorRooflineInstance({zone,group='ground'}={}){
  if(!['ground','academicRoof'].includes(group)||!isOutdoorZone(Number(zone)))return null;
  return{id:'ellery-west-roofline-closure',mesh:EXTERIOR_ROOFLINE_MESH,
    ...EXTERIOR_ROOFLINE.anchor,yaw:0,scale:1,zone:Number(zone),structural:true,
    blocks:false,skyExposed:true,cullRadius:Math.hypot(EXTERIOR_ROOFLINE.roofX1,
      Math.max(...EXTERIOR_ROOFLINE.bands.map(b=>b.height+.22)),
      Math.max(...EXTERIOR_ROOFLINE.bands.map(b=>Math.abs(b.z1))))};
}
