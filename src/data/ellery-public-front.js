// The existing atrium's actual north face, not a second entrance building.
// Physical metres; no room, door identity or progression changes live here.
import {GLASS_COURT_SIGHTLINES} from './glass-court-sightlines.js';
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ELLERY_PUBLIC_FRONT_REVISION='endowed-school-hybrid-3';
export const ELLERY_PUBLIC_FRONT_PACK='/assets/ellery-public-front.glb';
export const ELLERY_PUBLIC_FRONT=freeze({
  anchor:{x:86,z:1.25},
  facade:{mesh:'ellery_public_front',x0:74,x1:98,planeZ:3,depth:.34,height:9.44,
    door:{id:'front-main',x0:78,x1:80,sill:0,head:3.4},
    window:{id:'W3-foyer-north',x0:84,x1:88,sill:1.05,head:3.45}},
  forecourt:{mesh:'ellery_public_forecourt',x0:74,x1:98,z0:-.5,z1:3,
    collisionFloor:.12,drawnFloor:.1568627450980392,
    publicApproach:{x0:77.75,x1:80.25,z0:-.5,z1:3},
    clearThrough:{x0:74,x1:98,z0:-.5,z1:2.4},
    bench:{x0:94.15,x1:96.25,z0:2.44,z1:2.92,seatTop:.62}},
  hybrid:{
    canopy:{x:[77.2,82.6,88.4],bottomY:[4.23,4.00,3.72],frontZ:1.80,backZ:2.93,thickness:.12},
    relief:{x:79,y:6.55,z:2.70},
    sockets:[
      {id:'hybrid-canopy-entrance-diffuser',x:79,y:4.111,z:1.95,material:'hybrid canopy entrance diffuser'},
      {id:'hybrid-canopy-window-diffuser',x:86.4,y:3.801,z:1.95,material:'hybrid canopy window diffuser'},
      {id:'hybrid-canopy-relief-diffuser',x:79,y:4.287,z:2.42,material:'hybrid canopy relief diffuser'},
    ],
  },
  hero:{mesh:'conservatory_west_elevation',anchor:{x:50,z:7.5},
    // Remove only the false scenic masonry occupying the actual atrium and
    // new public forecourt, then clear the existing greenhouse air from a
    // second scenic wall at z30. Source art outside both boxes is retained.
    clip:{physicalMin:[74,0,0],physicalMax:[98,9.45,28],min:[24,0,-7.5],max:[48,9.45,20.5]},
    greenhouseClip:{physicalMin:[71,0,28],physicalMax:[92,5.5,32],min:[21,0,20.5],max:[42,5.5,24.5]}},
  fanlight:{mesh:'ellery_baths_fanlight',...GLASS_COURT_SIGHTLINES.fanlight},
  maximumAddedTriangles:4500,maximumAddedBytes:1000000,
});
export const ELLERY_PUBLIC_FRONT_HERO_CLIPS=freeze([ELLERY_PUBLIC_FRONT.hero.clip,ELLERY_PUBLIC_FRONT.hero.greenhouseClip]);
const a=ELLERY_PUBLIC_FRONT.anchor;
export const ELLERY_PUBLIC_FRONT_PROPS=freeze([
  {id:'ellery-actual-public-front',mesh:ELLERY_PUBLIC_FRONT.facade.mesh,x:a.x,y:a.z,yaw:0,renderOffsetZ:-.25,floorOverride:0,interactive:false,structural:true,blocks:false,renderGroups:['ground'],label:'Ellery public entrance'},
  {id:'ellery-public-forecourt',mesh:ELLERY_PUBLIC_FRONT.forecourt.mesh,x:a.x,y:a.z,yaw:0,renderOffsetZ:-.25,floorOverride:0,interactive:false,structural:true,blocks:false,renderGroups:['ground']},
  {id:'ellery-baths-high-fanlight',mesh:ELLERY_PUBLIC_FRONT.fanlight.mesh,x:84,y:27.5,yaw:0,floorOverride:0,interactive:false,structural:true,blocks:false,renderGroups:['ground']},
]);
export const ELLERY_PUBLIC_FRONT_MESHES=freeze({
  ellery_public_front:{w:24.5,d:1.0,h:9.5,blocks:false},
  ellery_public_forecourt:{w:24,d:3.5,h:.26,blocks:false},
  ellery_baths_fanlight:{w:2.16,d:.18,h:5.6,blocks:false},
});
export const ELLERY_PUBLIC_FRONT_LIGHTS=freeze([76.92,81.10].map(x=>({
  id:'ellery-public-entrance-lamp-'+x,x,z:2.28,y:2.72,color:[1,.78,.53],intensity:.65,radius:4.5,
})));
// Root's floorplan integration owns this level. The same 120mm collision floor
// meets the existing north inner footway; the visible datum is quantized by
// the existing ground renderer and is deliberately recorded separately.
export const ELLERY_PUBLIC_FORECOURT_LEVEL=freeze({
  id:'ellery_public_forecourt',replace:true,physicalReplace:true,layer:'ground',space:'ellery_public_forecourt',renderGroup:'ground',
  origin:{x:74,y:0},physicalOrigin:{x:74,y:0},base:0,
  rows:Array(3).fill('Y'.repeat(24)),
  floor:ELLERY_PUBLIC_FRONT.forecourt.collisionFloor,
  drawnFloor:ELLERY_PUBLIC_FRONT.forecourt.drawnFloor,
  profile:()=>({floor:.12,ceil:18,zone:ZONE.civicCourt,material:MATERIAL.wetPaving,flags:F.SKY}),
  // Last row must retain the existing z3 atrium wall/door/window ownership.
  physicalBounds:{x0:74,x1:98,z0:0,z1:3},
  connectionStrip:{x0:74,x1:98,z0:-.5,z1:0,floor:.12},
});
export const ELLERY_PUBLIC_FRONT_LETTERING=freeze([
  {id:'ellery-public-name',lines:['ELLERY'],font:'NimbusRoman-Bold.otf',
    center:[79,3.96,2.639],readerRight:[-1,0,0],up:[0,1,0],widthM:2.80,heightM:.25,capHeightM:.19,
    process:'cut civic public entrance frieze',palette:{ground:[.43,.44,.41],ink:[.08,.085,.075]}},
  {id:'ellery-public-date',lines:['1888'],font:'NimbusRoman-Bold.otf',center:[95.4,1.40,2.742],readerRight:[-1,0,0],up:[0,1,0],widthM:1.03,heightM:.25,capHeightM:.17,
    process:'cut civic foundation date',palette:{ground:[.43,.44,.41],ink:[.08,.085,.075]}},
  {id:'ellery-public-closure',lines:['PUBLIC ENTRANCE CLOSED','DELIVERIES & STAFF','USE THE WEST SERVICE YARD'],font:'NimbusSans-Bold.otf',center:[81.08,1.78,2.704],readerRight:[-1,0,0],up:[0,1,0],widthM:1.18,heightM:.70,capHeightM:.07,lineScale:[1,.83,.72],lineCentres:[.20,.51,.80],
    process:'municipal closure paper in glazed notice case',palette:{ground:[.66,.64,.54],ink:[.025,.028,.03]}},
]);
