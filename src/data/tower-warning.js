// The former Lyric address retains a real occupied street corner. The service
// passage exists between that end wall and the west workshop frontage;
// its paving is now physical floor, rather than a person walking into void.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {districtLogicalAt} from './exterior-district.js';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
};
// The old address is now a closed ordinary house, not another copy of the pub.
// This contract follows deed zero's real full occupied box in the civic row.
// Keep it independent of the Lyric's later physical placement inside the block.
export const TOWER_WARNING_STREET_CORNER=freeze({centreX:-14.6,westFrontageSetback:.25,
  occupied:{id:'former-lyric-occupied-corner',mesh:'district_civic_frontage',
    minX:-13.92,maxX:-6.08,minZ:107.05,maxZ:112.45,minY:0,maxY:12.8}});
// HE LEAVES THROUGH THE WALL. He stands on the doorstep of deed zero; the brick
// pier between that front door (x -13.28..-12.23) and its first sash window
// (x -11.42..-10.08) is the one stretch of plain masonry wide enough to take
// him. A short curve brings him square to it and he walks on into the house
// front. Depth does the disappearing: no fade, no timer, nothing to follow.
const PIER={x:-11.82,face:107.05,plinth:106.91};
// The floor grid hands the strip in front of the plinth to the building
// (its cells end at z 106.0), so legs past that line cannot ask the grid for
// support. They are the walk into the house, and are flagged as masonry.
const PAVED_TO=106.0;
function curveToPier(from,bearing,steps=5){
  const end={x:PIER.x,z:106.55},reach=.45;
  const c1={x:from.x+Math.sin(bearing)*reach,z:from.z+Math.cos(bearing)*reach},c2={x:end.x,z:end.z-reach};
  return Array.from({length:steps},(_,i)=>{
    const t=(i+1)/steps,u=1-t,w=[u*u*u,3*u*u*t,3*u*t*t,t*t*t];
    const z=+(w[0]*from.z+w[1]*c1.z+w[2]*c2.z+w[3]*end.z).toFixed(3);
    return{x:+(w[0]*from.x+w[1]*c1.x+w[2]*c2.x+w[3]*end.x).toFixed(3),y:.12,z,...(z>PAVED_TO?{masonry:true}:{})};
  });
}
const STAND={x:-12.75,y:.12,z:105.25};
export const TOWER_WARNING=freeze({
  id:'tower-warning',
  position:STAND,
  yaw:0,
  route:[
    STAND,
    ...curveToPier(STAND,35*Math.PI/180),
    // From here the body is allowed into the plinth and the wall behind it.
    // The end is deep enough that his heels and coat tails are inside too.
    {x:PIER.x,y:.12,z:106.92,masonry:true},
    {x:PIER.x,y:.12,z:107.95,masonry:true},
  ],
  pier:PIER,
  walkSpeed:.82,
  interactRadius:2.8,
  attentionRadius:7,
  bodyRadius:.30,
  bodyHeight:1.84,
  approach:{x:-12.75,y:.12,z:102.75,yaw:Math.PI},
  lines:[
    // One line per reading, and none of them rules out the others: the job is not
    // real, the building is not empty, and saying yes is how you stop trying. He
    // says the last one on an open street, where there is nothing to get out of.
    {id:'refuse',text:"There is no job. Don't take it.",voice:'unknown'},
    {id:'occupied',text:'Whatever they told you, it is not an empty building.',voice:'unknown'},
    {id:'out',text:"You can still get out. Take it, and you'll stop trying.",voice:'unknown'},
  ],
  // This is a physical knowledge boundary, never a timer or an alpha fade.
  // The host may retire the body only when actual sight lines are blocked.
  //
  // The pivot is his planted left ankle in the standing pose and in the first
  // walk frame (figure-local metres, +x his right, +z behind him). While the
  // departure clip turns him toward the pier, the root swings about that
  // ankle so the foot carrying his weight never slides on the paving.
  // test/tower-warning-missing-man.spec.mjs checks these against the GLB.
  departure:{endpointMustBeOccluded:true,
    pivot:{joint:'foot_L',start:{x:-.106,z:-.0075},end:{x:-.094,z:.0647},duration:1.05}},
  // Actual occupied street house and neighbouring workshop. The new pub room
  // has its own inside-block shell and plays no part in this distant corner.
  occluders:[
    TOWER_WARNING_STREET_CORNER.occupied,
    {id:'west-workshop-last-occupied-volume',mesh:'district_workshop_frontage',
      minX:-21.85-TOWER_WARNING_STREET_CORNER.westFrontageSetback,
      maxX:-16.10-TOWER_WARNING_STREET_CORNER.westFrontageSetback,minZ:106.08,maxZ:113.92,minY:.12,maxY:10.52},
  ],
});

export const TOWER_WARNING_LEVELS=freeze([{
  id:'old-lyric-service-paving',replace:true,physicalReplace:true,
  layer:'ground',space:'exterior_civic_block',renderGroup:'ground',
  origin:districtLogicalAt(-15,103),physicalOrigin:{x:-15,y:103},base:0,
  rows:Array(13).fill('p'),
  profile:()=>({floor:.12,ceil:12.6,zone:ZONE.civicCourt,
    material:MATERIAL.wetPaving,flags:F.SKY|F.WALLED}),
}]);
