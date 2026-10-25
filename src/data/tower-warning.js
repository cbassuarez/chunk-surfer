// The former Lyric's west end is a real opaque corner. The one-metre service
// passage already exists between that end wall and the west workshop frontage;
// its paving is now physical floor, rather than a person walking into void.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {districtLogicalAt} from './exterior-district.js';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
};
export const TOWER_WARNING=freeze({
  id:'tower-warning',
  position:{x:-12.75,y:.12,z:105.25},
  yaw:0,
  route:[
    {x:-12.75,y:.12,z:105.25},
    {x:-14.4,y:.12,z:105.25},
    {x:-14.4,y:.12,z:108.25},
    {x:-14.4,y:.12,z:111.75},
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
  // Conservative solid portions of the actual placed masonry, below all
  // roof geometry. Values come from district-south-row-a's first party return
  // and occupied back volume, and west-row-b's final occupied deed. These do
  // not seal any display/window aperture or the service passage itself.
  occluders:[
    {id:'old-lyric-west-party-return',mesh:'district_civic_frontage',
      minX:-14,maxX:-13.88,minZ:107.05,maxZ:112.45,minY:.12,maxY:12.92},
    {id:'old-lyric-first-occupied-volume',mesh:'district_civic_frontage',
      minX:-13.92,maxX:-6.08,minZ:108.10,maxZ:112.45,minY:.12,maxY:12.92},
    {id:'west-workshop-last-occupied-volume',mesh:'district_workshop_frontage',
      minX:-21.85,maxX:-16.10,minZ:106.08,maxZ:113.92,minY:.12,maxY:10.52},
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
