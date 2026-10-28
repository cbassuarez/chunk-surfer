// The Lyric's west end is a real masonry corner. The one-metre service
// passage already exists between that end wall and the west workshop frontage;
// its paving is now physical floor, rather than a person walking into void.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {districtLogicalAt} from './exterior-district.js';
import {EXTERIOR_PUB,pubWorldFromLocal} from './exterior-pub.js';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
};
// Conservative boxes within actual opaque shell parts. In particular, never
// hide the side window with the occupied ground volume of a closed shop.
const pubMasonry=(id,min,max)=>{
  const a=pubWorldFromLocal({x:min[0],z:min[2]}),b=pubWorldFromLocal({x:max[0],z:max[2]});
  return{id,mesh:'exterior_pub_frontage',minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),
    minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z),minY:EXTERIOR_PUB.floor+min[1],maxY:EXTERIOR_PUB.floor+max[1]};
};
export const TOWER_WARNING=freeze({
  id:'tower-warning',
  position:{x:-12.75,y:.12,z:105.25},
  yaw:0,
  route:[
    {x:-12.75,y:.12,z:105.25},
    // The real service passage clears both buildings' projecting window sills.
    {x:EXTERIOR_PUB.servicePassage.centreX,y:.12,z:105.25},
    {x:EXTERIOR_PUB.servicePassage.centreX,y:.12,z:108.25},
    {x:EXTERIOR_PUB.servicePassage.centreX,y:.12,z:111.75},
  ],
  walkSpeed:.82,
  interactRadius:2.8,
  attentionRadius:7,
  bodyRadius:.30,
  bodyHeight:1.84,
  approach:{x:-12.75,y:.12,z:102.75,yaw:Math.PI},
  lines:[
    {id:'refuse',text:"Don't take the job.",voice:'unknown'},
    {id:'occupied',text:'Whatever they told you, it is not an empty building.',voice:'unknown'},
    {id:'out',text:"You won't make it out.",voice:'unknown'},
  ],
  // This is a physical knowledge boundary, never a timer or an alpha fade.
  // The host may retire the body only when actual sight lines are blocked.
  departure:{corner:{x:-14,z:107.05},endpointMustBeOccluded:true},
  // Actual pub return courses/piers, plus the neighbouring occupied workshop.
  // The ground-floor side window and public room remain genuinely open.
  occluders:[
    pubMasonry('lyric-west-return-low',[-5.4,0,-32],[0,1.10,-31.82]),
    pubMasonry('lyric-west-return-head',[-5.4,2.82,-32],[0,3.40,-31.82]),
    pubMasonry('lyric-west-return-front-pier',[-1.90,1.10,-32],[0,2.82,-31.82]),
    pubMasonry('lyric-west-return-rear-pier',[-5.4,1.10,-32],[-4.10,2.82,-31.82]),
    pubMasonry('lyric-west-upper-return',[-5.4,3.54,-32],[0,12.8,-31.84]),
    {id:'west-workshop-last-occupied-volume',mesh:'district_workshop_frontage',
      minX:-21.85-EXTERIOR_PUB.servicePassage.westFrontageSetback,
      maxX:-16.10-EXTERIOR_PUB.servicePassage.westFrontageSetback,minZ:106.08,maxZ:113.92,minY:.12,maxY:10.52},
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
