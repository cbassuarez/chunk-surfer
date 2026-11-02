// Physical circulation behind the turned retained ranges. A separate logical
// sheet restores the ground vacated by their old cells without moving saves.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {YARD_SERVICE_RANGES} from './exterior-district.js';
import {yardTurnBounds} from './yard-turn.js';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const YARD_JARDINS=freeze({
  origin:{x:0,y:600},bounds:{x0:27,x1:49,z0:12,z1:91},
  rangeBounds:YARD_SERVICE_RANGES.map(r=>({id:r.id,...yardTurnBounds(r.id,{x0:r.physical.x-r.w/2,x1:r.physical.x+r.w/2,z0:r.physical.y-r.d/2,z1:r.physical.y+r.d/2})})),
  // The entrance apron retains its room-owned addresses and exterior grade.
  pubApron:{x0:33,x1:34,z0:26,z1:42},
  northWalk:{x0:42,x1:44,z0:0,z1:14},
  beds:[{id:'chamber-garden',x0:34,x1:41,z0:45.5,z1:48.5},{id:'laundry-garden',x0:34,x1:42,z0:64,z1:68.5}],
  spine:[{x:45.25,z:12.25},{x:45.25,z:86.25},{x:42.25,z:86.25},{x:42.25,z:90.25}],
  minimumUsableWidth:1.5,
});
const C=YARD_JARDINS,inside=(r,x,z)=>x>=r.x0&&x<r.x1&&z>=r.z0&&z<r.z1;
export const yardJardinsLogicalAt=(x,z)=>({x:C.origin.x+x-C.bounds.x0,y:C.origin.y+z-C.bounds.z0});
export function yardJardinsRows(){
  const out=[];
  for(let z=C.bounds.z0;z<C.bounds.z1;z++){let row='';for(let x=C.bounds.x0;x<C.bounds.x1;x++){
    row+=C.rangeBounds.some(r=>inside(r,x+.5,z+.5))||inside(C.pubApron,x+.5,z+.5)||inside(C.northWalk,x+.5,z+.5)?' ':'Y';
  }out.push(row);}return out;
}
export const YARD_JARDINS_LEVEL=freeze({id:'yard_jardins',replace:true,physicalReplace:true,physicalNavigation:true,
  layer:'ground',space:'yard_jardins',renderGroup:'ground',origin:C.origin,physicalOrigin:{x:C.bounds.x0,y:C.bounds.z0},base:0,rows:yardJardinsRows(),
  profile:(rx,rz)=>({floor:0,ceil:24,zone:ZONE.serviceYard,flags:F.SKY|F.WALLED,
    material:C.beds.some(r=>inside(r,C.bounds.x0+rx,C.bounds.z0+rz))?MATERIAL.wetGrass:MATERIAL.wetPaving}),
});
export const YARD_JARDINS_NORTH_LEVEL=freeze({id:'yard_jardins_north',replace:true,physicalReplace:true,physicalNavigation:true,
  layer:'ground',space:'yard_jardins',renderGroup:'ground',origin:{x:25,y:600},physicalOrigin:{x:42,y:0},base:0,rows:Array(14).fill('YY'),
});
const prop=(id,mesh,x,z,yaw=0,extra={})=>({id,mesh,...yardJardinsLogicalAt(x,z),yaw,scale:1,interactive:false,structural:true,blocks:false,renderGroups:['ground'],...extra});
export const YARD_JARDINS_PROPS=freeze([
  prop('yard-jardins-chamber-planter','academic_planter',37.5,46.8,0,{scaleX:1.5,scaleZ:1.2,w:6,d:2.4,blocks:true}),
  prop('yard-jardins-laundry-planter','academic_planter',38,66.25,0,{scaleX:1.7,scaleZ:1.5,w:6.8,d:3,blocks:true}),
  prop('yard-jardins-chamber-tree','opening_street_tree_small_b',37.5,46.8,.3,{scale:.62,elevation:.58}),
  prop('yard-jardins-laundry-tree','opening_street_tree_small_c',38,66.25,1.3,{scale:.68,elevation:.58}),
  prop('yard-jardins-chamber-bench','district_bench',32,45,-Math.PI/2),
  prop('yard-jardins-laundry-bench','district_bench',31.5,66.25,-Math.PI/2),
  prop('yard-jardins-chamber-leaves','vegetation_leaf_scatter',39.4,46.8,.4,{scale:.8}),
  prop('yard-jardins-laundry-leaves','vegetation_leaf_scatter',40.2,68.7,.9,{scale:.8}),
]);
